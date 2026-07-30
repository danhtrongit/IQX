import { useEffect } from "react"
import { cn } from "@/shared/lib/cn"
import { KHAU_VI_PCT, MUC_TU_TIN_HE_SO, computeKhoiLuong } from "./khoiLuong"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"
import "./cap3.css"

/**
 * Khối "Quản lý vốn" (spec §6) — chèn vào panel đặt lệnh ở Cấp 3, DƯỚI khối
 * Loại lệnh/Giá/Khối lượng. Cấp 1 (lý do + vùng mua + AI Thanh tra) và Cấp 2
 * (cắt lỗ/chốt lời) giữ nguyên 100% phía trên.
 *
 * 3 phần: khẩu vị hiện tại (trần %/lệnh) · **Mức độ tự tin** user TỰ chấm
 * (spec §6.2: **KHÔNG có AI gợi ý** — cố ý, để đo chính phán đoán của user) ·
 * **Khối lượng mua** theo 1 trong 2 cách, tính live qua `computeKhoiLuong`.
 *
 * Thuần trình bày + controlled: mọi state do `TradingPanel` giữ; khối này chỉ
 * tính và báo lên qua `onKhoiLuong` để panel tự điền ô Khối lượng (vẫn cho
 * user sửa tay — spec §6.3).
 */
export interface QuanLyVonBlockProps {
  khauVi: KhauViLoai
  vonBanDau: number
  /** Giá dùng để quy đổi tiền → số cổ phiếu (giá hiện tại / giá đặt). */
  giaVao: number
  mucTuTin: MucTuTin | null
  onMucTuTin: (muc: MucTuTin) => void
  cachKhoiLuong: CachKhoiLuong | null
  onCachKhoiLuong: (cach: CachKhoiLuong) => void
  /** Báo khối lượng vừa tính lên panel (để tự điền ô Khối lượng). */
  onKhoiLuong: (khoiLuong: number) => void
  /** Mở lại màn chọn khẩu vị (spec: đổi được, không khoá vĩnh viễn). */
  onDoiKhauVi: () => void
}

const KHAU_VI_LABEL: Record<KhauViLoai, string> = {
  than_trong: "Thận trọng",
  can_bang: "Cân bằng",
  tan_cong: "Tấn công",
}

const TU_TIN_OPTIONS: { muc: MucTuTin; stars: string; label: string }[] = [
  { muc: 1, stars: "⭐", label: "Thấp" },
  { muc: 2, stars: "⭐⭐", label: "Vừa" },
  { muc: 3, stars: "⭐⭐⭐", label: "Cao" },
]

const CACH_OPTIONS: { cach: CachKhoiLuong; ten: string; mo_ta: string }[] = [
  {
    cach: "linh_hoat",
    ten: "Linh hoạt",
    mo_ta: "Tin nhiều mua nhiều: trần khẩu vị × mức tự tin.",
  },
  {
    cach: "ky_luat",
    ten: "Kỷ luật",
    mo_ta: "Luôn mua đúng trần khẩu vị, không để cảm xúc chi phối.",
  },
]

const VND = (n: number) => Math.round(n).toLocaleString("en-US")

export function QuanLyVonBlock({
  khauVi,
  vonBanDau,
  giaVao,
  mucTuTin,
  onMucTuTin,
  cachKhoiLuong,
  onCachKhoiLuong,
  onKhoiLuong,
  onDoiKhauVi,
}: QuanLyVonBlockProps) {
  const khauViPct = KHAU_VI_PCT[khauVi]
  const ready = mucTuTin != null && cachKhoiLuong != null

  const result = ready
    ? computeKhoiLuong({ khauViPct, mucTuTin, cachKhoiLuong, vonBanDau, giaVao })
    : null

  // Đẩy khối lượng vừa tính lên panel để tự điền ô Khối lượng (spec §6.3).
  useEffect(() => {
    if (result) onKhoiLuong(result.khoiLuong)
    // `onKhoiLuong` thường là lambda inline — chỉ chạy lại khi con số đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.khoiLuong])

  const heSo = cachKhoiLuong === "linh_hoat" && mucTuTin != null ? MUC_TU_TIN_HE_SO[mucTuTin] : 100

  return (
    <div className="cap3-quanlyvon" data-testid="cap3-quanlyvon">
      <div className="cap3-block-tag">QUẢN LÝ VỐN</div>

      {/* ── Khẩu vị rủi ro hiện tại ─────────────────────────────────────── */}
      <div className="cap3-khauvi-row">
        <span className="cap3-khauvi-current" data-testid="cap3-khauvi-current">
          {`Khẩu vị: ${KHAU_VI_LABEL[khauVi]} · trần ${khauViPct}% vốn/lệnh`}
        </span>
        <button
          type="button"
          className="cap3-link-btn"
          onClick={onDoiKhauVi}
          data-testid="cap3-khauvi-doi"
        >
          đổi
        </button>
      </div>

      {/* ── Mức độ tự tin — user tự chấm, KHÔNG có gợi ý ─────────────────── */}
      <div className="cap3-field-label">Mức độ tự tin của lệnh này</div>
      <div className="cap3-tutin-group" data-testid="cap3-tutin-group">
        {TU_TIN_OPTIONS.map((opt) => (
          <button
            key={opt.muc}
            type="button"
            className={cn("cap3-tutin-btn", mucTuTin === opt.muc && "cap3-tutin-btn--on")}
            aria-pressed={mucTuTin === opt.muc}
            onClick={() => onMucTuTin(opt.muc)}
            data-testid={`cap3-tutin-${opt.muc}`}
          >
            <span className="cap3-tutin-stars">{opt.stars}</span>
            <span className="cap3-tutin-label">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* ── Cách tính khối lượng — chọn 1 ───────────────────────────────── */}
      <div className="cap3-field-label">Khối lượng mua hợp lý — chọn 1 cách</div>
      <div className="cap3-cach-group">
        {CACH_OPTIONS.map((opt) => (
          <button
            key={opt.cach}
            type="button"
            className={cn("cap3-cach-card", cachKhoiLuong === opt.cach && "cap3-cach-card--on")}
            aria-pressed={cachKhoiLuong === opt.cach}
            onClick={() => onCachKhoiLuong(opt.cach)}
            data-testid={`cap3-cach-${opt.cach}`}
          >
            <span className="cap3-cach-ten">{opt.ten}</span>
            <span className="cap3-cach-mota">{opt.mo_ta}</span>
          </button>
        ))}
      </div>

      {/* ── Kết quả tính ────────────────────────────────────────────────── */}
      {result ? (
        <div className="cap3-khoiluong-result">
          <div className="cap3-khoiluong-main">
            <span className="cap3-khoiluong-value tabular-nums" data-testid="cap3-khoiluong-value">
              {result.khoiLuong.toLocaleString("en-US")}
            </span>
            <span className="cap3-khoiluong-unit">
              {`cổ phiếu · ${result.pctVon.toFixed(1)}% vốn`}
            </span>
          </div>
          {/* §C12c — cho thấy con số đến từ đâu. */}
          <div className="cap3-khoiluong-provenance" data-testid="cap3-khoiluong-provenance">
            {`${VND(vonBanDau)}đ × ${khauViPct}%${
              cachKhoiLuong === "linh_hoat" ? ` × ${heSo}% (tự tin)` : ""
            } = ${VND(result.tienDuKien)}đ ÷ giá ${VND(giaVao)} → làm tròn lô 100`}
          </div>
        </div>
      ) : (
        <div className="cap3-khoiluong-prompt" data-testid="cap3-khoiluong-prompt">
          Chọn mức tự tin và một cách tính để hệ thống đề xuất khối lượng.
        </div>
      )}
    </div>
  )
}
