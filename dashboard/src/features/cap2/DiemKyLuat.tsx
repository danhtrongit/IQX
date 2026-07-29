import { cn } from "@/shared/lib/cn"
import { useDiemKyLuat } from "./hooks"
import type { DiemKyLuatThanhPhan, XepLoai } from "./types"
import "./cap2-discipline.css"

/**
 * Thẻ "Điểm kỷ luật" 0-100 (spec §7).
 *
 * **Nguyên tắc §C12c (BẮT BUỘC):** mọi chỉ số trừu tượng phải hiển thị kèm 1
 * câu giải thích + cho thấy con số đến từ đâu. Vì vậy thẻ này LUÔN render
 * `giai_thich` + bảng 4 thành phần (`thanh_phan`) — không bao giờ hiện số trơ.
 * Điểm + giải thích + breakdown đều do backend tính (`GET /cap2/diem-ky-luat`),
 * FE chỉ trình bày.
 *
 * Ngôn ngữ §E: "Điểm kỷ luật" (KHÔNG "Discipline Score").
 */
export interface DiemKyLuatCardProps {
  /** Ngày cần xem (YYYY-MM-DD). Bỏ trống = hôm nay. */
  ngay?: string
  /** Cho phép caller tắt query khi ở ngoài Cấp 2 (mirrors useCap2Progress). */
  enabled?: boolean
}

const BAND_CLASS: Record<XepLoai, string> = {
  xanh: "cap2-diem--xanh",
  vang: "cap2-diem--vang",
  do: "cap2-diem--do",
}

const BAND_LABEL: Record<XepLoai, string> = {
  xanh: "Tốt",
  vang: "Cần chú ý",
  do: "Đang kém kỷ luật",
}

/** spec §7 — 4 thành phần của điểm, kèm nhãn tiếng Việt đời thường. */
const THANH_PHAN_ROWS: {
  label: string
  got: keyof DiemKyLuatThanhPhan
  max: keyof DiemKyLuatThanhPhan
}[] = [
  { label: "Có kế hoạch đủ", got: "ke_hoach", max: "ke_hoach_toi_da" },
  { label: "Cắt lỗ đúng", got: "cat_lo_dung", max: "cat_lo_dung_toi_da" },
  { label: "Không nhồi lệnh", got: "khong_nhoi", max: "khong_nhoi_toi_da" },
  { label: "Chốt lời đúng", got: "chot_loi_dung", max: "chot_loi_dung_toi_da" },
]

export function DiemKyLuatCard({ ngay, enabled = true }: DiemKyLuatCardProps) {
  const { data, isLoading } = useDiemKyLuat(ngay, enabled)

  if (isLoading || !data) {
    return (
      <div className="cap2-diem cap2-diem--loading" data-testid="cap2-diem-loading">
        <div className="cap2-diem-label">Điểm kỷ luật</div>
        <div className="cap2-diem-skeleton" />
      </div>
    )
  }

  const { diem, xep_loai, giai_thich, thanh_phan } = data

  // Chưa có dữ liệu để tính (chưa giao dịch / chưa có tình huống đo được):
  // hiện đúng lời giải thích của server, KHÔNG hiện số 0 gây hiểu nhầm.
  if (diem == null || xep_loai == null) {
    return (
      <div className="cap2-diem cap2-diem--empty" data-testid="cap2-diem-card">
        <div className="cap2-diem-label">Điểm kỷ luật</div>
        <p className="cap2-diem-giaithich">{giai_thich}</p>
      </div>
    )
  }

  return (
    <div
      className={cn("cap2-diem", BAND_CLASS[xep_loai])}
      data-testid="cap2-diem-card"
      data-band={xep_loai}
    >
      <div className="cap2-diem-head">
        <span className="cap2-diem-label">Điểm kỷ luật hôm nay</span>
        <span className="cap2-diem-band">{BAND_LABEL[xep_loai]}</span>
      </div>

      <div className="cap2-diem-value tabular-nums" data-testid="cap2-diem-value">
        {diem}
        <span className="cap2-diem-max">/100</span>
      </div>

      {/* §C12c — 1 câu giải thích, luôn có. */}
      <p className="cap2-diem-giaithich">{giai_thich}</p>

      {/* §C12c — "cho thấy con số đến từ đâu". */}
      {thanh_phan && (
        <ul className="cap2-diem-breakdown" data-testid="cap2-diem-breakdown">
          {THANH_PHAN_ROWS.map((row) => (
            <li key={row.label}>
              <span className="cap2-diem-breakdown-label">{row.label}</span>
              <span className="cap2-diem-breakdown-value tabular-nums">
                {`${thanh_phan[row.got]}/${thanh_phan[row.max]}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
