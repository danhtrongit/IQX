import { useEffect } from "react"
import { cn } from "@/shared/lib/cn"
import { KHAU_VI_PCT, MUC_TU_TIN_HE_SO, computeKhoiLuong } from "./khoiLuong"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"
import "./cap3.css"
import "@/features/trading/order-panel.css"

/**
 * Khối "Quản lý vốn" (spec §6) — chèn vào panel đặt lệnh ở Cấp 3, GIỮA ô Khối
 * lượng và dòng Phí giao dịch (mockup `demo-trading/LEVEL 3/
 * iqx-cap3-datlenh.html` `.risk-box`), và NGOÀI thẻ KẾ HOẠCH. Cấp 1 (lý do +
 * vùng mua + AI Thanh tra) và Cấp 2 (cắt lỗ/chốt lời) giữ nguyên 100%.
 *
 * 3 phần, đúng thứ tự mockup:
 *  ① **Khẩu vị rủi ro** · áp cho mọi lệnh — 3 mức chọn TẠI CHỖ (Thận trọng
 *    trần 10% / Cân bằng trần 20% / Tấn công trần 30%).
 *  ② **Mức độ tự tin của lệnh** — user TỰ chấm (spec §6.2: **KHÔNG có AI gợi
 *    ý**, cố ý, để đo chính phán đoán của user).
 *  ③ **Khối lượng mua — chọn 1 trong 2 cách**, tính live qua `computeKhoiLuong`.
 *    CẢ HAI thẻ đều in con số của mình (mockup vẽ `≈ 200` / `≈ 300` cạnh nhau)
 *    — đó là điểm của màn này: thấy hai cách ra hai con số khác nhau rồi mới
 *    chọn, không phải chọn xong mới thấy một con số.
 *
 * ★★ Vì sao ① đổi khẩu vị NGAY TẠI KHỐI thay vì một link «đổi» mở modal: mockup
 * vẽ ba mức ngay trong `.risk-box`, và đó cũng là cách dùng thật — khẩu vị là
 * thứ user cân lại mỗi khi thị trường đổi, không phải một lựa chọn khai báo
 * một lần. `KhauViModal` VẪN là màn bắt buộc lần đầu (do trang Cấp 3 mount) —
 * nơi giải thích hệ quả từng mức (§C12c); ở đây chỉ là chỗ đổi nhanh sau đó.
 *
 * Áo dùng lại hệ `.op-*` của `order-panel.css` (`.op-way*` đã dựng đúng
 * `.way`/`.pick` của mockup từ Cấp 2) + cụm `.op-risk`/`.op-conf*` thêm mới ở
 * chính file đó — KHÔNG dựng hệ class thứ hai.
 *
 * Thuần trình bày + controlled: mọi state (kể cả cú ghi khẩu vị lên server) do
 * `TradingPanel` giữ; khối này chỉ tính và báo lên qua `onKhoiLuong`/
 * `onChonKhauVi`.
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
  /** Báo khối lượng + %vốn vừa tính lên panel (để tự điền ô Khối lượng và ghi
   * hồ sơ khi lệnh khớp). */
  onKhoiLuong: (khoiLuong: number, pctVon: number) => void
  /** User bấm một mức khẩu vị khác — panel lo cú ghi lên server (spec §5.2
   * "không khoá vĩnh viễn"). */
  onChonKhauVi: (khauVi: KhauViLoai) => void
  /** Cú ghi khẩu vị đang bay → khoá tạm 3 nút để không bắn hai lệnh chồng nhau. */
  dangDoiKhauVi?: boolean
}

const KHAU_VI_OPTIONS: { loai: KhauViLoai; label: string }[] = [
  { loai: "than_trong", label: "Thận trọng" },
  { loai: "can_bang", label: "Cân bằng" },
  { loai: "tan_cong", label: "Tấn công" },
]

const TU_TIN_OPTIONS: { muc: MucTuTin; stars: string; label: string }[] = [
  { muc: 1, stars: "⭐", label: "Thấp" },
  { muc: 2, stars: "⭐⭐", label: "Vừa" },
  { muc: 3, stars: "⭐⭐⭐", label: "Cao" },
]

/** Tiêu đề 2 thẻ cách tính — chữ + icon lấy nguyên từ mockup `.qty-way .wt`. */
const CACH_OPTIONS: { cach: CachKhoiLuong; ten: string; mo_ta: string }[] = [
  {
    cach: "linh_hoat",
    ten: "🎯 Theo khẩu vị × tự tin",
    mo_ta: "Tin nhiều mua nhiều: trần khẩu vị × mức tự tin.",
  },
  {
    cach: "ky_luat",
    ten: "⚖️ Chia đều theo khẩu vị",
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
  onChonKhauVi,
  dangDoiKhauVi = false,
}: QuanLyVonBlockProps) {
  const khauViPct = KHAU_VI_PCT[khauVi]
  const ready = mucTuTin != null && cachKhoiLuong != null

  const result = ready
    ? computeKhoiLuong({ khauViPct, mucTuTin, cachKhoiLuong, vonBanDau, giaVao })
    : null

  // Đẩy khối lượng vừa tính lên panel để tự điền ô Khối lượng (spec §6.3).
  useEffect(() => {
    if (result) onKhoiLuong(result.khoiLuong, result.pctVon)
    // `onKhoiLuong` thường là lambda inline — chỉ chạy lại khi con số đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.khoiLuong, result?.pctVon])

  const heSo = cachKhoiLuong === "linh_hoat" && mucTuTin != null ? MUC_TU_TIN_HE_SO[mucTuTin] : 100

  /** Xem trước con số của MỘT cách — `null` khi chưa chấm tự tin (cách 1 cần
   * nó; cách 2 thì không, nên nó vẫn có số ngay). */
  function preview(cach: CachKhoiLuong) {
    if (cach === "linh_hoat" && mucTuTin == null) return null
    return computeKhoiLuong({
      khauViPct,
      // Cách 2 không dùng `mucTuTin` trong phép tính (spec §6.3 "Chỉ dùng khẩu
      // vị") — giá trị truyền vào ở đây chỉ để thoả kiểu.
      mucTuTin: mucTuTin ?? 2,
      cachKhoiLuong: cach,
      vonBanDau,
      giaVao,
    })
  }

  return (
    <div className="op-risk" data-testid="cap3-quanlyvon">
      {/* ① Khẩu vị rủi ro ─────────────────────────────────────────────────── */}
      <div className="op-conf-label op-conf-label--first">
        {"Khẩu vị rủi ro "}
        <span className="op-conf-note">{"· áp cho mọi lệnh"}</span>
      </div>
      <div className="op-conf-row" data-testid="cap3-khauvi-group">
        {KHAU_VI_OPTIONS.map((opt) => (
          <button
            key={opt.loai}
            type="button"
            className={cn("op-conf", khauVi === opt.loai && "op-conf--on")}
            aria-pressed={khauVi === opt.loai}
            disabled={dangDoiKhauVi}
            onClick={() => {
              if (opt.loai !== khauVi) onChonKhauVi(opt.loai)
            }}
            data-testid={`cap3-khauvi-${opt.loai}`}
          >
            <span className="op-conf-l">{opt.label}</span>
            <span className="op-conf-pct">{`trần ${KHAU_VI_PCT[opt.loai]}%`}</span>
          </button>
        ))}
      </div>

      {/* ② Mức độ tự tin — user tự chấm, KHÔNG có gợi ý ────────────────────── */}
      <div className="op-conf-label">{"Mức độ tự tin của lệnh"}</div>
      <div className="op-conf-row" data-testid="cap3-tutin-group">
        {TU_TIN_OPTIONS.map((opt) => (
          <button
            key={opt.muc}
            type="button"
            className={cn("op-conf", mucTuTin === opt.muc && "op-conf--on")}
            aria-pressed={mucTuTin === opt.muc}
            onClick={() => onMucTuTin(opt.muc)}
            data-testid={`cap3-tutin-${opt.muc}`}
          >
            <span className="op-conf-stars">{opt.stars}</span>
            <span className="op-conf-l">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* ③ Cách tính khối lượng — chọn 1 trong 2 ───────────────────────────── */}
      <div className="op-conf-label">{"Khối lượng mua — chọn 1 trong 2 cách"}</div>
      <div className="op-way-grid">
        {CACH_OPTIONS.map((opt, i) => {
          const isSelected = cachKhoiLuong === opt.cach
          const p = preview(opt.cach)
          return (
            <div
              key={opt.cach}
              className={cn(
                "op-way op-way--qty",
                i === 0 ? "op-way--c1" : "op-way--c2",
                isSelected && "op-way--on",
              )}
              data-selected={isSelected ? "true" : "false"}
              data-testid={`cap3-cach-card-${opt.cach}`}
            >
              <div className="op-way-title">{opt.ten}</div>
              <div className="op-way-big" data-testid={`cap3-cach-big-${opt.cach}`}>
                {p ? `≈ ${p.khoiLuong.toLocaleString("en-US")}` : "—"}
              </div>
              <div className="op-way-pct">
                {p
                  ? opt.cach === "linh_hoat"
                    ? `${p.pctVon.toFixed(1)}% vốn (${khauViPct}% × ${heSo}%)`
                    : `${p.pctVon.toFixed(1)}% vốn (đúng mức trần)`
                  : "Chấm mức tự tin để thấy con số"}
              </div>
              <p className="op-way-k text-[10.5px]">{opt.mo_ta}</p>
              <button
                type="button"
                className="op-way-pick"
                aria-pressed={isSelected}
                onClick={() => onCachKhoiLuong(opt.cach)}
                data-testid={`cap3-cach-${opt.cach}`}
              >
                {isSelected ? "Đã chọn" : "Chọn cách này"}
              </button>
            </div>
          )
        })}
      </div>

      {/* Kết quả tính — §C12c "cho thấy con số đến từ đâu". Mockup không vẽ
          dòng này; nó là phần spec đòi thêm, giữ nguyên. */}
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
