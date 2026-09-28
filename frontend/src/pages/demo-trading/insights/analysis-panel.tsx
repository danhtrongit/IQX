/**
 * «Phân tích danh mục» - the portfolio-analysis panel of the Đấu trường
 * sidebar, one surface for every Cấp 0-6.
 *
 * Composition rule (same as the legacy screens): blocks accumulate with the
 * level. Cấp 1 owns ①②③④ + its mẫu block; Cấp 2 re-skins ② and reduces ③ and
 * adds ④⑤⑥⑦ + the kỷ luật mẫu; Cấp 3 adds ⑦⑧, Cấp 4 adds ⑨⑩⑪, Cấp 5 adds ⑫⑬,
 * Cấp 6 adds ⑭⑮. Every level-scoped query gates itself, so opening the panel
 * outside its Cấp fires nothing.
 */
import { RefreshCw } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { SidebarPanel } from "@/components/layout/sidebar-panel"
import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { DoPhuLyDo, HoSoTongQuan, MauLyDoBlock, ThangThuaTheoLyDo, TienTrinhCap1 } from "./analysis-cap1"
import { Cap2ProgressLine, CoCheCatLoChotLoi, DiemKyLuat30, GhiChuNhinLai, MauKyLuat, ViPhamTuan } from "./analysis-cap2"
import { DongThuanLop, GocNhinRieng, KhoiLuongTheoTuTin, TuTinKetQua, VuKhiDiemMuBlock } from "./analysis-cap34"
import { BoLocSanMa, KetQuaNhanDinh, NguonSanBlock, NhanDinhKhoiLuong, PheuSanMa } from "./analysis-cap56"
import { formatInt, levelName } from "./copy"
import { computeCap1Blocks } from "./compute"
import { useCap1Progress, useCap2Analysis, useCap2Progress, useCap3Analysis, useCap3Progress, useCap4PhanTich, useCap4Progress, useCap4VuKhiDiemMu, useCap5NguonSan, useCap5PhanTich, useCap5Progress, useCap6PhanTich, useInsightsLevel, useTradeBase } from "./hooks"
import { ErrorLine, HintLine, LevelSection, LoadingLine } from "./ui"

export function AnalysisPanel({ symbol }: { symbol: string }) {
  const { level } = useInsightsLevel()
  const queryClient = useQueryClient()

  const trades = useTradeBase()
  const cap1 = useCap1Progress()
  const cap2 = useCap2Progress()
  const cap2Analysis = useCap2Analysis()
  const cap3 = useCap3Progress()
  const cap3Analysis = useCap3Analysis()
  const cap4 = useCap4Progress()
  const cap4VuKhi = useCap4VuKhiDiemMu()
  const cap4PhanTich = useCap4PhanTich()
  const cap5 = useCap5Progress()
  const cap5PhanTich = useCap5PhanTich()
  const cap6PhanTich = useCap6PhanTich()
  const nguonSan = useCap5NguonSan(level >= 5 ? symbol : "")

  const refreshAll = () => void queryClient.invalidateQueries({ queryKey: ["insights"] })
  const blocks = computeCap1Blocks(trades.rows, level <= 1 ? (cap1.data ?? null) : null)
  const sinceIso = level <= 1 ? (cap1.data?.entered_at ?? null) : level === 2 ? (cap2.data?.entered_at ?? null) : level === 3 ? (cap3.data?.entered_at ?? null) : level === 4 ? (cap4.data?.entered_at ?? null) : level === 5 ? (cap5.data?.entered_at ?? null) : null

  return (
    <SidebarPanel
      title="Phân tích danh mục"
      description={`Cấp ${level} «${levelName(level)}»`}
      actions={
        <Button variant="ghost" size="icon-sm" aria-label="Làm mới phân tích" onClick={refreshAll}>
          <RefreshCw className="size-4" />
        </Button>
      }
    >
      {level === 0 ? (
        <PanelState
          title="Cấp 0 «Nhập môn» chưa có phân tích danh mục"
          description="Phân tích danh mục mở từ Cấp 1 «Học việc»: hồ sơ tổng quan, thắng/thua theo 5 lý do, độ phủ lý do và tiến trình 5 nhiệm vụ."
        />
      ) : (
        <div className="space-y-3">
          {trades.isPending ? (
            <LoadingLine label="Đang tải sổ lệnh đã đóng…" />
          ) : trades.isError ? (
            <ErrorLine text="Chưa tải được sổ lệnh đã đóng từ máy chủ - các khối tính trên lệnh chưa thể hiện số." onRetry={refreshAll} />
          ) : (
            <HintLine>{`Nguồn lệnh: ${trades.source} · ${formatInt(trades.rows.length)} lệnh đã đóng`}</HintLine>
          )}

          <HoSoTongQuan blocks={blocks} level={level} sinceIso={sinceIso} cap2Progress={cap2.data ?? null} />
          <ThangThuaTheoLyDo blocks={blocks} level={level} />
          <DoPhuLyDo blocks={blocks} level={level} />

          {level <= 1 && (
            <>
              <TienTrinhCap1 blocks={blocks} />
              <MauLyDoBlock trades={trades.rows} />
            </>
          )}

          {level >= 2 && (
            <LevelSection notEntered="Chưa vào Cấp 2 - bốn khối kỷ luật chỉ hiện số sau khi cấp này được mở." isPending={cap2Analysis.isPending} isError={cap2Analysis.isError} ready={cap2Analysis.data != null} onRetry={refreshAll}>
              <Cap2ProgressLine progress={cap2.data} />
              <CoCheCatLoChotLoi progress={cap2.data} window20={cap2Analysis.data?.window20} />
              <DiemKyLuat30 score={cap2Analysis.data?.score_30d} />
              <ViPhamTuan weeks={cap2Analysis.data?.weekly_violations} />
              <GhiChuNhinLai reflection={cap2Analysis.data?.reflection} />
              <MauKyLuat patterns={cap2Analysis.data?.patterns} />
            </LevelSection>
          )}

          {level >= 3 && (
            <LevelSection notEntered="Chưa vào Cấp 3 - hai khối tự tin và khối lượng chỉ hiện số sau khi cấp này được mở." isPending={cap3Analysis.isPending} isError={cap3Analysis.isError} ready={cap3Analysis.data != null} onRetry={refreshAll}>
              {cap3.data && (
                <HintLine>
                  {`Cấp 3 · khẩu vị ${cap3.data.khau_vi ?? "chưa đặt"} · vốn ban đầu ${formatInt(cap3.data.von_ban_dau)}đ · ${formatInt(cap3.data.so_lenh_cap3)} lệnh · lãi ${cap3.data.lai_pct_cap3.toFixed(1)}% · điểm kỷ luật TB ${cap3.data.diem_ky_luat_tb_cap3 == null ? "-" : cap3.data.diem_ky_luat_tb_cap3.toFixed(1)}`}
                </HintLine>
              )}
              <TuTinKetQua analysis={cap3Analysis.data ?? undefined} />
              <KhoiLuongTheoTuTin analysis={cap3Analysis.data ?? undefined} trades={trades.rows} />
            </LevelSection>
          )}

          {level >= 4 && (
            <LevelSection notEntered="Chưa vào Cấp 4 - ba khối đọc 5 lớp chỉ hiện số sau khi cấp này được mở." isPending={cap4VuKhi.isPending || cap4PhanTich.isPending} isError={cap4VuKhi.isError || cap4PhanTich.isError} ready={cap4VuKhi.data != null && cap4PhanTich.data != null} onRetry={refreshAll}>
              {cap4.data && (
                <HintLine>
                  {`Cấp 4 · ${formatInt(cap4.data.so_lenh_doc_du_5lop)} lệnh đọc đủ 5 lớp · vũ khí ${cap4.data.vu_khi_lop ?? "-"} · điểm mù ${cap4.data.diem_mu_lop ?? "-"}`}
                </HintLine>
              )}
              <VuKhiDiemMuBlock data={cap4VuKhi.data ?? undefined} />
              <DongThuanLop data={cap4PhanTich.data?.khoi_10} />
              <GocNhinRieng data={cap4PhanTich.data?.khoi_11} />
            </LevelSection>
          )}

          {level >= 5 && (
            <LevelSection notEntered="Chưa vào Cấp 5 - hai khối săn mã chỉ hiện số sau khi cấp này được mở." isPending={cap5PhanTich.isPending} isError={cap5PhanTich.isError} ready={cap5PhanTich.data != null} onRetry={refreshAll}>
              {cap5.data && (
                <HintLine>
                  {`Cấp 5 · đã săn ${formatInt(cap5.data.so_ma_da_san)}/${formatInt(cap5.data.muc_tieu_so_ma_san)} mã · đã mua ${formatInt(cap5.data.so_ma_mua_tu_watchlist)}/${formatInt(cap5.data.muc_tieu_so_ma_mua)} mã từ Watchlist${cap5.data.best_filter_ten ? ` · bộ lọc mạnh nhất: ${cap5.data.best_filter_ten}` : ""}`}
                </HintLine>
              )}
              <BoLocSanMa data={cap5PhanTich.data?.khoi_12} />
              <PheuSanMa data={cap5PhanTich.data?.khoi_13} />
              <NguonSanBlock symbol={symbol} data={nguonSan.data} isPending={nguonSan.isPending} isError={nguonSan.isError} onRetry={refreshAll} />
            </LevelSection>
          )}

          {level >= 6 && (
            <LevelSection notEntered="Chưa vào Cấp 6 - hai khối nhận định mâu thuẫn chỉ hiện số sau khi cấp này được mở." isPending={cap6PhanTich.isPending} isError={cap6PhanTich.isError} ready={cap6PhanTich.data != null} onRetry={refreshAll}>
              <NhanDinhKhoiLuong data={cap6PhanTich.data?.khoi_14} />
              <KetQuaNhanDinh data={cap6PhanTich.data?.khoi_15} />
            </LevelSection>
          )}

          {symbol.length > 0 && level >= 1 && level < 5 && (
            <HintLine>{`Mã đang xem: ${symbol} - nguồn săn và các khối theo mã hiện từ Cấp 5.`}</HintLine>
          )}
        </div>
      )}
    </SidebarPanel>
  )
}
