/**
 * Cấp 5 «Lão luyện» (⑫ bộ lọc nào ra mã thắng, ⑬ kỷ luật săn mã) and
 * Cấp 6 «Bậc thầy» (⑭ nhận định vs khối lượng, ⑮ kết quả theo nhận định)
 * blocks, plus the per-symbol hunt provenance line.
 *
 * All numbers come from `/cap5/phan-tich`, `/cap5/nguon-san/{symbol}` and
 * `/cap6/phan-tich`; the only local work is ordering the filter rows and
 * wording, exactly as the legacy screen did.
 */
import { Check, X } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Cap5PhanTich, Cap6PhanTich, Khoi12, NguonSan } from "./api"
import { HUNT_FILTER_ORDER, formatDateOnly, formatInt, formatRate, huntFilterLabel } from "./copy"
import { ErrorLine, HintLine, LoadingLine, NoteLine, SectionCard } from "./ui"

const KHOI12_MIN_LENH = 3

type FilterRow = {
  ma: string
  ten: string
  soLenh: number
  soThang: number
  tyLeThang: number | null
  duMau: boolean
  conThieu: number
  nhan: string | null
  canhBao: string | null
}

/** Đủ mẫu first (rate desc, then count, then spec order); under-threshold rows keep their real counts. */
function orderFilterRows(khoi12: Khoi12): FilterRow[] {
  const minLenh = khoi12.so_lenh_toi_thieu > 0 ? khoi12.so_lenh_toi_thieu : KHOI12_MIN_LENH
  const rows: FilterRow[] = khoi12.items.map((item) => ({
    ma: item.ma,
    ten: item.ten || huntFilterLabel(item.ma) || item.ma,
    soLenh: item.so_lenh,
    soThang: item.so_lenh_thang,
    tyLeThang: item.du_mau && item.ty_le_thang != null ? Math.round(item.ty_le_thang) : null,
    duMau: item.du_mau,
    conThieu: item.du_mau ? 0 : Math.max(0, minLenh - item.so_lenh),
    nhan: item.nhan ?? null,
    canhBao: item.canh_bao ?? null,
  }))
  const rank = (row: FilterRow) => {
    const index = HUNT_FILTER_ORDER.indexOf(row.ma as (typeof HUNT_FILTER_ORDER)[number])
    return index < 0 ? HUNT_FILTER_ORDER.length : index
  }
  return rows.sort((a, b) => {
    if (a.duMau !== b.duMau) return a.duMau ? -1 : 1
    if (a.duMau && b.duMau) {
      const delta = (b.tyLeThang ?? 0) - (a.tyLeThang ?? 0)
      if (delta !== 0) return delta
    }
    if (b.soLenh !== a.soLenh) return b.soLenh - a.soLenh
    return rank(a) - rank(b)
  })
}

/* ── Cấp 5 - ⑫ bộ lọc nào mang lại mã thắng nhiều nhất ─────────────────── */

export function BoLocSanMa({ data }: { data: Cap5PhanTich["khoi_12"] | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑫ Bộ lọc nào mang lại mã thắng nhiều nhất">
        <LoadingLine label="Đang lấy số liệu bộ lọc từ máy chủ…" />
      </SectionCard>
    )
  }
  const rows = orderFilterRows(data)
  const shown = rows.filter((row) => row.duMau)
  const minLenh = data.so_lenh_toi_thieu > 0 ? data.so_lenh_toi_thieu : KHOI12_MIN_LENH
  const soLenhSan = rows.reduce((sum, row) => sum + row.soLenh, 0)
  const duMau = shown.length > 0 && data.du_de_ket_luan
  const best = duMau ? (shown.find((row) => row.ma === data.best_filter) ?? shown[0]) : null

  return (
    <SectionCard title="⑫ Bộ lọc nào mang lại mã thắng nhiều nhất" flag="mới ở Cấp 5">
      {shown.length > 0 && (
        <div className="space-y-1.5">
          {shown.map((row) => (
            <div key={row.ma} className="flex items-center gap-2 text-xs">
              <span className="w-[38%] shrink-0">{row.ten}</span>
              <span className="h-1.5 flex-1 rounded-full bg-muted">
                <span
                  className={`block h-1.5 rounded-full ${row.canhBao ? "bg-price-ref" : row.nhan ? "bg-price-up" : "bg-primary"}`}
                  style={{ width: `${Math.max(0, Math.min(100, row.tyLeThang ?? 0))}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums">{row.tyLeThang == null ? "-" : `${row.tyLeThang}%`}</span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{`${formatInt(row.soLenh)} lệnh`}</span>
            </div>
          ))}
        </div>
      )}

      {!duMau && (
        <NoteLine>
          {soLenhSan === 0
            ? "Chưa có lệnh nào đóng từ mã bạn săn được. Khối này hiện sau khi bạn săn mã bằng bộ lọc, vào lệnh, rồi đóng lệnh đó."
            : `Mới có ${formatInt(soLenhSan)} lệnh đã đóng từ săn mã, chưa bộ lọc nào đủ ${formatInt(minLenh)} lệnh để nói được gì. Bộ lọc gần nhất còn thiếu ${formatInt(Math.min(...rows.map((row) => row.conThieu)))} lệnh.`}
        </NoteLine>
      )}

      {best && (
        <NoteLine tone={best.canhBao ? undefined : "good"}>
          {`«${best.ten}» đang là bộ lọc ${best.nhan?.trim() || "hợp với bạn nhất"} - mã săn từ đây thắng ${formatInt(best.tyLeThang ?? 0)}% (${formatInt(best.soThang)}/${formatInt(best.soLenh)} lệnh). Đây là kết quả thật của riêng bạn, không phải đánh giá chung về bộ lọc.`}
        </NoteLine>
      )}

      {data.so_lenh_khong_tu_san > 0 && (
        <HintLine>
          {`${formatInt(data.so_lenh_khong_tu_san)} lệnh đã đóng KHÔNG đến từ săn mã (bạn tự chọn mã) - chúng không thuộc bộ lọc nào nên không nằm trong bảng trên.`}
        </HintLine>
      )}
      <HintLine>{data.giai_thich}</HintLine>
    </SectionCard>
  )
}

/* ── Cấp 5 - ⑬ kỷ luật săn mã (phễu) ───────────────────────────────────── */

export function PheuSanMa({ data }: { data: Cap5PhanTich["khoi_13"] | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑬ Kỷ luật săn mã">
        <LoadingLine label="Đang lấy số liệu phễu săn mã…" />
      </SectionCard>
    )
  }
  const giua: string = data.so_ma_cho_du_lop == null ? "-" : data.so_ma_cho_du_lop_day_du ? formatInt(data.so_ma_cho_du_lop) : `≥ ${formatInt(data.so_ma_cho_du_lop)}`
  const tang: { label: string; value: string }[] = [
    { label: "Mã đã săn vào Watchlist", value: formatInt(data.so_ma_da_san) },
    { label: "Mã từng đủ 5 lớp ủng hộ", value: giua },
    { label: "Mã đã vào lệnh từ Watchlist", value: formatInt(data.so_ma_vao_lenh) },
  ]

  return (
    <SectionCard title="⑬ Kỷ luật săn mã" flag="mới ở Cấp 5">
      <div className="space-y-1">
        {tang.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <span className={`font-semibold tabular-nums ${row.value === "-" ? "text-muted-foreground" : ""}`}>{row.value}</span>
          </div>
        ))}
      </div>
      {data.so_ma_cho_du_lop == null && (
        <NoteLine>
          Tầng giữa chưa đo được: điểm đồng thuận 5 lớp của các mã trong Watchlist được chấm theo mẻ 1 lần/ngày sau phiên. Nó sẽ có số sau mẻ chấm gần nhất.
        </NoteLine>
      )}
      {data.so_ma_cho_du_lop != null && !data.so_ma_cho_du_lop_day_du && (
        <NoteLine>
          {`Tầng giữa là con số ÍT NHẤT: hệ mới chấm được điểm đồng thuận cho ${formatInt(data.so_ma_da_cham_diem)}/${formatInt(data.so_ma_da_san)} mã bạn đã săn, nên số mã từng chín có thể cao hơn.`}
        </NoteLine>
      )}
      <NoteLine tone="good">{data.loi_ket}</NoteLine>
      <HintLine>{data.giai_thich}</HintLine>
    </SectionCard>
  )
}

/* ── Cấp 5 - nguồn săn của mã đang chọn ────────────────────────────────── */

export function NguonSanBlock({ symbol, data, isPending, isError, onRetry }: { symbol: string; data: NguonSan | null | undefined; isPending: boolean; isError: boolean; onRetry: () => void }) {
  return (
    <SectionCard title="Nguồn săn của mã đang xem">
      {symbol.length === 0 ? (
        <NoteLine>Chưa chọn mã nào - chọn một mã ở panel Săn mã hoặc Đặt lệnh để xem nguồn săn.</NoteLine>
      ) : isPending ? (
        <LoadingLine label={`Đang tải nguồn săn của ${symbol}…`} />
      ) : isError ? (
        <ErrorLine text={`Chưa lấy được nguồn săn của ${symbol} từ máy chủ.`} onRetry={onRetry} />
      ) : data == null ? (
        <NoteLine>Chưa vào Cấp 5 - nguồn săn chỉ hiện sau khi cấp này được mở.</NoteLine>
      ) : (
        <>
          <div className="space-y-0.5 text-xs">
            <p>{`Nguồn: ${data.tu_san_ma ? (data.hunt_filter_ten ?? huntFilterLabel(data.hunt_filter) ?? "bộ lọc săn") : "thêm tay, không qua bộ lọc săn"}`}</p>
            {data.hunt_signal && <p className="text-muted-foreground">{`Tín hiệu lúc săn: ${data.hunt_signal}`}</p>}
            {data.first_hunted_at && <p>{`Săn lần đầu: ${formatDateOnly(data.first_hunted_at)}`}</p>}
            {data.so_phien_trong_watchlist != null && <p>{`Số phiên trong Watchlist tới lúc đặt lệnh: ${formatInt(data.so_phien_trong_watchlist)}`}</p>}
            <p>{`Lớp ủng hộ lúc vào lệnh: ${data.so_lop_luc_vao == null ? "-" : formatInt(data.so_lop_luc_vao)}`}</p>
          </div>
          {data.canh_bao_thieu_order_id && <NoteLine tone="warn">{data.canh_bao_thieu_order_id}</NoteLine>}
          {data.canh_bao_nguon_moi_hon && <NoteLine tone="warn">{data.canh_bao_nguon_moi_hon}</NoteLine>}
          {data.ly_do_thieu_so_lop && <NoteLine>{data.ly_do_thieu_so_lop}</NoteLine>}
          <HintLine>{data.giai_thich}</HintLine>
        </>
      )}
    </SectionCard>
  )
}

/* ── Cấp 6 - ⑭ nhận định vs khối lượng ────────────────────────────────── */

export function NhanDinhKhoiLuong({ data }: { data: Cap6PhanTich["khoi_14"] | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑭ Nhận định mâu thuẫn vs khối lượng">
        <LoadingLine label="Đang tải đối chiếu nhận định và khối lượng…" />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑭ Nhận định mâu thuẫn vs khối lượng" flag="mới ở Cấp 6">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Mức nhận định</TableHead>
            <TableHead className="whitespace-normal text-right">Lệnh</TableHead>
            <TableHead className="whitespace-normal text-right">% vốn TB</TableHead>
            <TableHead className="whitespace-normal text-center">Khớp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.muc}>
              <TableCell>
                {row.muc_ten}
                {!data.du_mau && <span className="ml-1 text-xs text-muted-foreground">chưa đủ dữ liệu</span>}
              </TableCell>
              <TableCell className="text-right">{formatInt(row.so_lenh)}</TableCell>
              <TableCell className="text-right">{row.kl_tb_pct_von == null ? "-" : `${Math.round(row.kl_tb_pct_von)}%`}</TableCell>
              <TableCell className="text-center">
                {row.khop == null ? (
                  "-"
                ) : row.khop ? (
                  <Check className="mx-auto size-3.5 text-price-up" aria-label="Khớp" />
                ) : (
                  <X className="mx-auto size-3.5 text-price-down" aria-label="Chưa khớp" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.nhan_xet ? <NoteLine tone="good">{data.nhan_xet}</NoteLine> : !data.du_mau && <NoteLine>Chưa đủ lệnh Cấp 6 có nhận định mâu thuẫn để đối chiếu với khối lượng.</NoteLine>}
      <HintLine>{data.giai_thich}</HintLine>
    </SectionCard>
  )
}

/* ── Cấp 6 - ⑮ kết quả theo nhận định + đứng ngoài ─────────────────────── */

export function KetQuaNhanDinh({ data }: { data: Cap6PhanTich["khoi_15"] | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑮ Kết quả theo mức nhận định">
        <LoadingLine label="Đang tải kết quả theo mức nhận định…" />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑮ Kết quả theo mức nhận định" flag="mới ở Cấp 6">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Mức nhận định</TableHead>
            <TableHead className="whitespace-normal text-right">Lệnh</TableHead>
            <TableHead className="whitespace-normal text-right">Thắng</TableHead>
            <TableHead className="whitespace-normal text-right">Tỷ lệ thắng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.muc}>
              <TableCell>
                {row.muc_ten}
                {!row.du_mau && <span className="ml-1 text-xs text-muted-foreground">chưa đủ dữ liệu</span>}
              </TableCell>
              <TableCell className="text-right">{formatInt(row.so_lenh)}</TableCell>
              <TableCell className="text-right">{formatInt(row.so_lenh_thang)}</TableCell>
              <TableCell className="text-right">{row.ty_le_thang_pct == null ? "-" : formatRate(row.ty_le_thang_pct)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="space-y-0.5 text-xs">
        <p>{`Số lần đứng ngoài (không mua): ${formatInt(data.so_lan_khong_mua)}`}</p>
        <p>{`Số lần nghiệm thu quyết định không mua: ${formatInt(data.so_lan_nghiem_khong_mua)}`}</p>
      </div>
      {data.nhan_xet ? <NoteLine tone="good">{data.nhan_xet}</NoteLine> : <NoteLine>{`Cần ≥${formatInt(data.so_lenh_toi_thieu)} lệnh mỗi mức để kết luận.`}</NoteLine>}
      <HintLine>{data.giai_thich}</HintLine>
    </SectionCard>
  )
}
