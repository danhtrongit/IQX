import { LOP_DEFS } from "@/features/cap4/doc5Lop"
import type { Lop } from "@/features/cap4/types"
import type { MucTuTin } from "@/features/cap3/types"
import type { ConflictLevel, KehoachMauThuanCap6 } from "./mauThuanTypes"
import { conflictLevelLabel, conflictLevelText, lechNhanDinhHanhDong } from "./nhanDinhCap6"

/**
 * Kết sổ Cấp 6 «Bậc thầy» — khối **"Nhìn lại: nhận định có khớp hành động
 * không?"** + khối **cảnh báo lệch** (spec §8, mockup `iqx-cap6-ketso.html`).
 *
 * ★★ **CHỈ khối lượng + mức tự tin. TUYỆT ĐỐI KHÔNG nhắc cắt lỗ** — spec §4.3
 * ("cắt lỗ chỉ là chọn cách tính, không phản ánh mức thận trọng"), §8 và §9 đều
 * lặp lại. Cắt lỗ đã có khối CAM KẾT vs THỰC TẾ của Cấp 2 ở trên trong cùng modal.
 *
 * ★★ **Số của khối này ĐỌC TỪ HÀNG ĐÃ LƯU** (`GET /cap6/kehoach/{order_id}`),
 * không suy lại ở client: suy lại thì mỗi lần mở Kết sổ ra một con số khác.
 * Hai phe (ủng hộ/ngược) thì lấy từ sự kiện lệnh lúc MUA — chúng là ảnh chụp của
 * thời điểm đặt, endpoint per-order không mang chúng.
 */

/** Dữ liệu khối, dựng từ sự kiện lệnh lúc MUA (rồi hàng server ghi đè). */
export interface NhanDinhKetsoCap6 {
  /** Lớp ở phe Ủng hộ lúc đặt — ảnh chụp từ bus, server không lưu lại. */
  pheUngHo: Lop[]
  /** Lớp ở phe Ngược chiều lúc đặt. */
  pheNguoc: Lop[]
  /** Mức user tự đọc. `null` = có mâu thuẫn nhưng user không chọn mức nào. */
  conflictLevel: ConflictLevel | null
  /** Lớp phủ quyết đang xấu — để gắn tag PHỦ QUYẾT đúng chip. */
  lopPhuQuyetXau: Lop[]
  /** % vốn đã mua (Cấp 3). `null` = chưa biết → KHÔNG vẽ thành 0%. */
  pctVon: number | null
  /** Mức tự tin đã chọn (Cấp 3). `null` = chưa biết. */
  mucTuTin: MucTuTin | null
}

/**
 * Hàng đã lưu của server THẮNG khối dựng từ sự kiện lệnh.
 *
 * ★ FAIL-CLOSED, KHÔNG BAO GIỜ FAIL-LOUD: `detail` là `undefined` khi query đang
 * chạy / 404 / lỗi mạng → trả lại y nguyên `local`. Modal Kết sổ
 * `closable={false}`, nên một exception ở đây sẽ NHỐT user.
 *
 * ★ `had_conflict === false` = lệnh này không có bảng mâu thuẫn ⇒ KHÔNG có gì để
 * nhìn lại ⇒ `null` (khối bị bỏ hẳn, im lặng — không dựng một khối rỗng).
 */
export function mergeNhanDinhCap6(
  local: NhanDinhKetsoCap6 | null | undefined,
  detail: KehoachMauThuanCap6 | null | undefined,
): NhanDinhKetsoCap6 | null {
  if (!detail) return local ?? null
  if (!detail.had_conflict) return null
  return {
    pheUngHo: local?.pheUngHo ?? [],
    pheNguoc: local?.pheNguoc ?? [],
    conflictLevel: detail.conflict_level,
    lopPhuQuyetXau: detail.veto_layers,
    pctVon: detail.pct_von,
    mucTuTin: detail.muc_tu_tin,
  }
}

const LOP_BY_KEY = Object.fromEntries(LOP_DEFS.map((d) => [d.lop, d])) as Record<
  Lop,
  (typeof LOP_DEFS)[number]
>

const TU_TIN_LABEL: Record<MucTuTin, string> = {
  1: "⭐ Thấp",
  2: "⭐⭐ Vừa",
  3: "⭐⭐⭐ Cao",
}

/** `18` → `"18"` — số en-US (§E). */
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** "🎯 Kỹ thuật · 💰 Dòng tiền", hoặc "—" khi phe đó rỗng. */
function lopList(lop: readonly Lop[]): string {
  if (lop.length === 0) return "—"
  return lop.map((l) => `${LOP_BY_KEY[l]?.icon ?? ""} ${LOP_BY_KEY[l]?.label ?? l}`.trim()).join(" · ")
}

/**
 * "30% vốn · tự tin ⭐⭐⭐" — hai thứ DUY NHẤT được đối chiếu với nhận định.
 *
 * ★ `null` là "chưa biết", KHÔNG phải 0: một lệnh thiếu cột Cấp 3 thì nói thiếu,
 * không in ra "0% vốn".
 */
function hanhDongText(pctVon: number | null, mucTuTin: MucTuTin | null): string {
  const parts: string[] = []
  parts.push(pctVon == null ? "khối lượng: chưa ghi lại được" : `${fmtInt(pctVon)}% vốn`)
  parts.push(
    mucTuTin == null ? "mức tự tin: chưa ghi lại được" : `tự tin ${TU_TIN_LABEL[mucTuTin]}`,
  )
  return parts.join(" · ")
}

/**
 * Câu của khối cảnh báo lệch (spec §8).
 *
 * ★ Nhắc kết quả thật CHỈ khi lệnh thật sự lỗ — mockup viết "và lần này nó khiến
 * bạn lỗ 6,3%", nhưng dán câu đó vào một lệnh CÓ LÃI là nói sai sự thật. Với lệnh
 * lãi, khối vẫn cảnh báo (bài học Cấp 6 là sự NHẤT QUÁN, không phải kết quả) và
 * nói thẳng rằng lãi lần này không làm cho sự lệch đó thành đúng.
 */
export function loiCanhBaoLech(
  level: ConflictLevel,
  pctVon: number | null,
  mucTuTin: MucTuTin | null,
  pnlPct: number,
): string {
  const daMua =
    pctVon == null
      ? "vẫn vào lệnh"
      : `vẫn mua ${fmtInt(pctVon)}% vốn`
  const tuTin =
    mucTuTin == null ? "" : ` với mức tự tin ${TU_TIN_LABEL[mucTuTin].replace(/^[⭐\s]+/u, "")}`
  const dau =
    pnlPct < 0
      ? ` Lần này nó khiến bạn lỗ ${Math.abs(Math.round(pnlPct * 10) / 10).toFixed(1)}%.`
      : " Lần này lệnh có lãi — nhưng lãi không làm cho sự lệch đó thành đúng: lần sau cùng cách làm ấy có thể ra kết quả ngược lại."
  return (
    `Bạn đọc mâu thuẫn này là ${conflictLevelLabel(level).toLowerCase()} — nhưng ${daMua}${tuTin}. ` +
    "Nếu thật sự thấy nghiêm trọng, hành động tương xứng phải là hạ khối lượng xuống mức thận trọng, " +
    "hoặc đứng ngoài. Đắn đo trong đầu nhưng tay vẫn mua lớn là cái bẫy tâm lý phổ biến nhất." +
    dau
  )
}

/** Đoạn coach Cấp 6 — VERBATIM mockup `iqx-cap6-ketso.html` `.coach-txt`. */
export const COACH_NHAT_QUAN_CAP6 =
  'Bài học Cấp 6 không chỉ là đọc đúng mâu thuẫn, mà là để hành động khớp với nhận định. Lần sau khi đọc "nghiêm trọng", hãy hỏi: khối lượng và mức tự tin của mình đã phản ánh điều đó chưa? Nếu thấy quá xấu, "không mua" cũng là một lựa chọn. Phân tích danh mục sẽ cho biết bạn có hay mắc cái bẫy "nghĩ một đằng, làm một nẻo" không.'

export interface NhanDinhKetsoBlockProps {
  nhanDinh: NhanDinhKetsoCap6
  /** Lãi/lỗ thật của lệnh (%) — chỉ dùng cho câu cuối của khối cảnh báo. */
  pnlPct: number
}

export function NhanDinhKetsoBlock({ nhanDinh, pnlPct }: NhanDinhKetsoBlockProps) {
  const { pheUngHo, pheNguoc, conflictLevel, lopPhuQuyetXau, pctVon, mucTuTin } = nhanDinh
  const lech = lechNhanDinhHanhDong(conflictLevel, mucTuTin)
  const vetoSet = new Set(lopPhuQuyetXau)

  return (
    <>
      <div className="cap6-ketso-nhandinh" data-testid="cap6-ketso-nhandinh">
        <div className="cap6-ketso-doichieu-head">
          <span className="cap6-ketso-doichieu-title">
            {"NHÌN LẠI: NHẬN ĐỊNH CÓ KHỚP HÀNH ĐỘNG KHÔNG?"}
          </span>
          <span className="cap6-ketso-badge">mới ở Cấp 6</span>
        </div>
        <table className="cap0-debrief-table">
          <tbody>
            <tr>
              <td>Lớp ủng hộ</td>
              <td colSpan={2} data-testid="cap6-ketso-ungho">
                {lopList(pheUngHo)}
              </td>
            </tr>
            <tr>
              <td>Lớp ngược chiều</td>
              <td colSpan={2} data-testid="cap6-ketso-nguoc">
                {pheNguoc.length === 0
                  ? "—"
                  : pheNguoc.map((l) => (
                      <span key={l} className="cap6-ketso-chip">
                        {`${LOP_BY_KEY[l]?.icon ?? ""} ${LOP_BY_KEY[l]?.label ?? l}`.trim()}
                        {vetoSet.has(l) && (
                          <span className="cap6-ketso-veto" data-testid={`cap6-ketso-veto-${l}`}>
                            {"PHỦ QUYẾT"}
                          </span>
                        )}
                      </span>
                    ))}
              </td>
            </tr>
            <tr>
              <td>Bạn đọc mâu thuẫn</td>
              <td colSpan={2} data-testid="cap6-ketso-muc">
                {conflictLevel
                  ? conflictLevelText(conflictLevel)
                  : "bạn không chọn mức nào cho lệnh này"}
              </td>
            </tr>
            <tr>
              {/* Nhãn đổi theo kết quả đối chiếu — "Nhưng đã mua" chỉ đúng khi
                  hành động THẬT SỰ lệch nhận định (mockup vẽ đúng ca lệch). */}
              <td data-testid="cap6-ketso-hanhdong-label">
                {lech === true ? "Nhưng đã mua" : "Bạn đã mua"}
              </td>
              <td colSpan={2} data-testid="cap6-ketso-hanhdong">
                {hanhDongText(pctVon, mucTuTin)}
              </td>
            </tr>
          </tbody>
        </table>
        {/* §C12c — nói rõ khối này đối chiếu CÁI GÌ, và cái gì nó KHÔNG xét. */}
        <p className="cap6-ketso-giaithich" data-testid="cap6-ketso-nhandinh-giaithich">
          {
            "Khối này chỉ đặt mức bạn tự đọc cạnh hai thứ phản ánh mức thận trọng của MỘT lệnh: khối lượng và mức tự tin. Nó KHÔNG xét cắt lỗ — cắt lỗ chỉ là chọn cách tính, phần đó đã có khối CAM KẾT vs THỰC TẾ ở trên."
          }
        </p>
        {lech == null && (
          <p className="cap6-ketso-giaithich" data-testid="cap6-ketso-chua-xet">
            {
              "Chưa đối chiếu được lệnh này: thiếu mức nhận định hoặc mức tự tin đã ghi. Chưa xét được KHÔNG có nghĩa là đã khớp."
            }
          </p>
        )}
      </div>

      {/* Khối cảnh báo lệch (spec §8) — CHỈ khi thật sự lệch. */}
      {lech === true && conflictLevel && (
        <div className="cap6-ketso-lech" data-testid="cap6-ketso-lech">
          <div className="cap6-ketso-lech-head">{"⚠ Nhận định và hành động đang lệch nhau"}</div>
          <p className="cap6-ketso-lech-body">
            {loiCanhBaoLech(conflictLevel, pctVon, mucTuTin, pnlPct)}
          </p>
        </div>
      )}
    </>
  )
}
