/**
 * Cấp 3 «Bản lĩnh» (⑦ tự tin → kết quả, ⑧ khối lượng theo tự tin) and
 * Cấp 4 «Thuần thục» (⑨ vũ khí / điểm mù, ⑩ đồng thuận lớp → kết quả,
 * ⑪ góc nhìn riêng) blocks.
 *
 * The numbers are server-owned: `/cap3/trades/analysis` (`by_confidence`) and
 * `/cap4/vu-khi-diem-mu` + `/cap4/phan-tich`. Only the two "phát hiện"
 * sentences of Cấp 3 are derived locally from those server numbers, with the
 * legacy thresholds.
 */
import { Star } from "lucide-react"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Cap3TradeAnalysis, Cap4PhanTich, TradeRow, VuKhiDiemMu } from "./api"
import { HINT, formatInt, formatRate, lopLabel } from "./copy"
import { KHOI8_MIN_TRADES_PER_MUC, KHOI7_MIN_TRADES_PER_MUC, computeKhoi7, computeKhoi8 } from "./compute"
import { HintLine, LoadingLine, NoteLine, SectionCard } from "./ui"

/** 1-3 filled stars for a confidence level (no emoji). */
function ConfidenceStars({ muc }: { muc: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Mức ${muc}/3`}>
      {[1, 2, 3].map((step) => (
        <Star key={step} className={`size-3 ${step <= muc ? "text-price-ref" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  )
}

/* ── Cấp 3 - ⑦ tự tin → kết quả ────────────────────────────────────────── */

export function TuTinKetQua({ analysis }: { analysis: Cap3TradeAnalysis | undefined }) {
  if (!analysis) {
    return (
      <SectionCard title="⑦ Tự tin → kết quả">
        <LoadingLine label="Đang tải đối chiếu mức tự tin…" />
      </SectionCard>
    )
  }

  const khoi7 = computeKhoi7(analysis.by_confidence)
  return (
    <SectionCard title="⑦ Tự tin → kết quả" flag="mới ở Cấp 3">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Mức tự tin</TableHead>
            <TableHead className="whitespace-normal text-right">Lệnh</TableHead>
            <TableHead className="whitespace-normal text-right">Thắng</TableHead>
            <TableHead className="whitespace-normal text-right">Lãi/lỗ % TB</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {khoi7.rows.map((row) => (
            <TableRow key={row.mucTuTin}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <ConfidenceStars muc={row.mucTuTin} />
                  {row.label}
                  {row.insufficient && <span className={HINT}>chưa đủ dữ liệu</span>}
                </span>
              </TableCell>
              <TableCell className="text-right">{formatInt(row.count)}</TableCell>
              <TableCell className="text-right">{formatRate(row.winRate)}</TableCell>
              <TableCell className={`text-right ${row.avgPnlPct != null && row.avgPnlPct > 0 ? "text-price-up" : row.avgPnlPct != null && row.avgPnlPct < 0 ? "text-price-down" : ""}`}>
                {row.avgPnlPct == null ? "-" : `${row.avgPnlPct.toFixed(1)}%`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {khoi7.phatHien ? <NoteLine tone="good">{khoi7.phatHien}</NoteLine> : khoi7.insufficientNote && <NoteLine>{khoi7.insufficientNote}</NoteLine>}
      <HintLine>{`Chỉ kết luận khi mức Cao và Thấp đều có ≥${KHOI7_MIN_TRADES_PER_MUC} lệnh; lệch ≥15 điểm % mới coi là khác biệt.`}</HintLine>
    </SectionCard>
  )
}

/* ── Cấp 3 - ⑧ khối lượng theo tự tin ──────────────────────────────────── */

export function KhoiLuongTheoTuTin({ analysis, trades }: { analysis: Cap3TradeAnalysis | undefined; trades: TradeRow[] }) {
  if (!analysis) {
    return (
      <SectionCard title="⑧ Khối lượng có đi theo tự tin không">
        <LoadingLine label="Đang tải số liệu khối lượng…" />
      </SectionCard>
    )
  }

  const khoi8 = computeKhoi8(analysis.by_confidence, trades)
  return (
    <SectionCard title="⑧ Khối lượng có đi theo tự tin không" flag="mới ở Cấp 3">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Mức tự tin</TableHead>
            <TableHead className="whitespace-normal text-right">Lệnh</TableHead>
            <TableHead className="whitespace-normal text-right">KL TB (cp)</TableHead>
            <TableHead className="whitespace-normal text-right">% vốn TB</TableHead>
            <TableHead className="whitespace-normal">Cách dùng nhiều nhất</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {khoi8.rows.map((row) => (
            <TableRow key={row.mucTuTin}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <ConfidenceStars muc={row.mucTuTin} />
                  {row.label}
                  {row.insufficient && <span className={HINT}>chưa đủ dữ liệu</span>}
                </span>
              </TableCell>
              <TableCell className="text-right">{formatInt(row.count)}</TableCell>
              <TableCell className="text-right">{row.avgKhoiLuong == null ? "-" : formatInt(row.avgKhoiLuong)}</TableCell>
              <TableCell className="text-right">{row.avgPctVon == null ? "-" : `${Math.round(row.avgPctVon)}%`}</TableCell>
              <TableCell>{row.cachHayDungLabel ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {khoi8.phatHien ? <NoteLine tone="good">{khoi8.phatHien}</NoteLine> : khoi8.insufficientNote && <NoteLine>{khoi8.insufficientNote}</NoteLine>}
      <HintLine>{`Xét trên % vốn (không phải số cổ phiếu) vì các mã có giá khác nhau; cần ≥${KHOI8_MIN_TRADES_PER_MUC} lệnh mỗi mức.`}</HintLine>
    </SectionCard>
  )
}

/* ── Cấp 4 - ⑨ vũ khí / điểm mù ───────────────────────────────────────── */

export function VuKhiDiemMuBlock({ data }: { data: VuKhiDiemMu | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑨ Vũ khí / Điểm mù theo lớp">
        <LoadingLine label="Đang tải tỷ lệ thắng theo lớp…" />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑨ Vũ khí / Điểm mù theo lớp" flag="mới ở Cấp 4">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Lớp</TableHead>
            <TableHead className="whitespace-normal text-right">Lệnh</TableHead>
            <TableHead className="whitespace-normal text-right">Thắng</TableHead>
            <TableHead className="whitespace-normal text-right">Tỷ lệ thắng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.lop.map((row) => (
            <TableRow key={row.lop}>
              <TableCell>
                {row.ten || lopLabel(row.lop)}
                {row.nhan && <span className="ml-1.5 text-xs text-primary">{row.nhan}</span>}
              </TableCell>
              <TableCell className="text-right">{formatInt(row.n_orders)}</TableCell>
              <TableCell className="text-right">{formatInt(row.n_wins)}</TableCell>
              <TableCell className="text-right">{formatRate(row.win_rate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="space-y-0.5 text-xs">
        <p>{`Vũ khí: ${data.vu_khi_lop ? lopLabel(data.vu_khi_lop) : "chưa đủ dữ liệu để chốt"}`}</p>
        <p>{`Điểm mù: ${data.diem_mu_lop ? lopLabel(data.diem_mu_lop) : "chưa đủ dữ liệu để chốt"}`}</p>
      </div>
      <HintLine>{`Cần ≥${data.so_lenh_toi_thieu} lệnh mỗi lớp; vũ khí ≥${data.nguong_vu_khi}%, điểm mù ≤${data.nguong_diem_mu}%. ${data.giai_thich}`}</HintLine>
    </SectionCard>
  )
}

/* ── Cấp 4 - ⑩ đồng thuận lớp → kết quả ───────────────────────────────── */

export function DongThuanLop({ data }: { data: Cap4PhanTich["khoi_10"] | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑩ Đồng thuận lớp → kết quả">
        <LoadingLine label="Đang tải số liệu đồng thuận…" />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑩ Đồng thuận lớp → kết quả" flag="mới ở Cấp 4">
      <Table className="min-w-0 table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-normal">Mức đồng thuận</TableHead>
            <TableHead className="whitespace-normal text-right">Lệnh</TableHead>
            <TableHead className="whitespace-normal text-right">Thắng</TableHead>
            <TableHead className="whitespace-normal text-right">Tỷ lệ thắng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.band}>
              <TableCell>
                {row.label}
                {row.insufficient && <span className={HINT}> chưa đủ dữ liệu</span>}
              </TableCell>
              <TableCell className="text-right">{formatInt(row.count)}</TableCell>
              <TableCell className="text-right">{formatInt(row.wins)}</TableCell>
              <TableCell className="text-right">{formatRate(row.win_rate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.phat_hien ? (
        <NoteLine tone={data.hieu_qua === false ? undefined : "good"}>{data.phat_hien}</NoteLine>
      ) : (
        data.insufficient_note && <NoteLine>{data.insufficient_note}</NoteLine>
      )}
      <HintLine>
        {`${formatInt(data.total_trades)} lệnh đã đóng · ${formatInt(data.excluded_no_ai)} lệnh không có đối chiếu AI nên bị loại. ${data.giai_thich}`}
      </HintLine>
    </SectionCard>
  )
}

/* ── Cấp 4 - ⑪ góc nhìn riêng ──────────────────────────────────────────── */

export function GocNhinRieng({ data }: { data: Cap4PhanTich["khoi_11"] | undefined }) {
  if (!data) {
    return (
      <SectionCard title="⑪ Góc nhìn riêng của bạn">
        <LoadingLine label="Đang tải số lần lệch AI…" />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="⑪ Góc nhìn riêng của bạn" flag="mới ở Cấp 4">
      <div className="space-y-0.5 text-xs">
        <p>{`Số lần bạn khác AI: ${formatInt(data.so_lan_khac_ai)}`}</p>
        <p>{`Trong đó bạn đúng: ${formatInt(data.so_lan_ban_dung)} · AI đúng: ${formatInt(data.so_lan_ai_dung)}`}</p>
      </div>
      {data.phat_hien ? <NoteLine tone="good">{data.phat_hien}</NoteLine> : data.insufficient_note && <NoteLine>{data.insufficient_note}</NoteLine>}
      <HintLine>{data.giai_thich}</HintLine>
    </SectionCard>
  )
}
