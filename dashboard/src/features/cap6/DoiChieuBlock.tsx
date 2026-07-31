import { useEffect } from "react"
import { LOP_DEFS } from "@/features/cap4/doc5Lop"
import type { Lop, Lop5Partial } from "@/features/cap4/types"
import { cn } from "@/shared/lib/cn"
import { useCap6Events } from "./Cap6Context"
import { coMauThuan, lopNguocChieu, lopUngHo } from "./doiChieu"
import { useGoiYCap6 } from "./hooks"
import { KIEU_ICON, KIEU_OPTIONS, type KieuCoPhieu } from "./types"
import "./cap6.css"

/**
 * Bước "Đối chiếu" (spec §4, 🟢 THÊM MỚI) — Cấp 6's ONE insertion into the buy
 * panel. Cấp 5's panel (Cấp 4's đọc-5-lớp + Cấp 3's quản lý vốn + Cấp 2's SL/TP
 * + Cấp 1's vùng mua + nút Đứng ngoài) stays 100% intact around it (spec §0).
 *
 * ★ It renders **ONLY when the user's own 5 lớp CONFLICT** — ≥1 Ủng hộ AND ≥1
 * Ngược chiều (`coMauThuan`). Every lớp cùng chiều, or only trung tính, and this
 * component returns `null`: no khối, no request, no cổng cứng (spec §4's "KHÔNG
 * mâu thuẫn → đặt lệnh như Cấp 5").
 *
 * **Hybrid + provenance (§C12c).** The server SUGGESTS which lớp to prioritise
 * for this symbol's kiểu cổ phiếu and returns the "vì sao"; both are shown, the
 * `giai_thich` **verbatim** — never a bare suggestion. The user then picks the
 * lớp quyết định + writes one line why. The system never auto-decides.
 *
 * **★ The gợi ý is NOT a law (spec §5/§10).** All 5 lớp are selectable and a pick
 * outside the suggestion is accepted exactly like one inside it — no warning, no
 * "sai", not even a khớp/lệch badge at order time (that comparison belongs to Kết
 * sổ, judged by the real outcome). Nothing here penalises it.
 *
 * **`kieu === null` ("chưa phân loại")** — the server could not derive the kiểu
 * from the ngành (missing symbol/ICB, the deliberately-unmapped `Tài chính`, or
 * the market-cap-based `dau_co_nho`). Then, and ONLY then, the user may pick the
 * kiểu themselves: the server re-derives the kiểu on write and its value wins,
 * so a client kiểu offered any other time would be silently ignored.
 *
 * Purely presentational + controlled: `TradingPanel` owns the state (it needs it
 * for the cổng cứng and for `POST /cap6/kehoach`).
 */
export interface DoiChieuBlockProps {
  symbol: string
  /** Cấp 4's ratings — the ONLY source of the conflict (spec §4). */
  doc5Lop: Lop5Partial
  lopQuyetDinh: Lop | null
  onLopQuyetDinh: (lop: Lop) => void
  /** The required 1-dòng "vì sao" (the server 422s on a blank one). */
  lyDo: string
  onLyDo: (lyDo: string) => void
  /** Only ever set through the `kieu === null` fallback picker below. */
  kieuCoPhieu: KieuCoPhieu | null
  onKieuCoPhieu: (kieu: KieuCoPhieu) => void
}

const LOP_BY_KEY = Object.fromEntries(LOP_DEFS.map((d) => [d.lop, d])) as Record<
  Lop,
  (typeof LOP_DEFS)[number]
>

/** "🎯 Kỹ thuật · 💰 Dòng tiền" — icons + labels straight from Cấp 4's defs. */
function lopList(lop: readonly Lop[]): string {
  return lop.map((l) => `${LOP_BY_KEY[l].icon} ${LOP_BY_KEY[l].label}`).join(" · ")
}

/**
 * Same list, but from the SERVER's own labels (`lop_uu_tien_ten`) so the
 * suggestion is shown in the server's words; our icons are the only addition.
 */
function lopListFromServer(keys: readonly Lop[], ten: readonly string[]): string {
  return keys
    .map((l, i) => `${LOP_BY_KEY[l]?.icon ?? ""} ${ten[i] ?? LOP_BY_KEY[l]?.label ?? l}`.trim())
    .join(" · ")
}

const GOI_Y_NOTE =
  "Đây là gợi ý để cân nhắc, không phải luật — bạn có thể tin lớp khác nếu có lý do của mình. Trọng tài cuối là kết quả thật của lệnh."

const ERROR_NOTE =
  "Chưa lấy được gợi ý trọng số theo kiểu cổ phiếu lúc này. Bước Đối chiếu vẫn hoạt động bình thường: bạn tự chọn lớp quyết định và ghi vì sao."

export function DoiChieuBlock({
  symbol,
  doc5Lop,
  lopQuyetDinh,
  onLopQuyetDinh,
  lyDo,
  onLyDo,
  kieuCoPhieu,
  onKieuCoPhieu,
}: DoiChieuBlockProps) {
  const cap6Events = useCap6Events()
  const conflict = coMauThuan(doc5Lop)
  // No conflict → no bước Đối chiếu at all, so no request either.
  const { data: goiY, isLoading, isError } = useGoiYCap6(symbol, conflict)

  const kieu = goiY?.kieu ?? null
  // "Settled" = the suggestion resolved one way or the other; used so the
  // analytics event fires ONCE per symbol instead of twice (loading → loaded).
  const settled = !isLoading && (goiY !== undefined || isError)

  useEffect(() => {
    if (!conflict || !settled) return
    cap6Events.onConflictShown?.(symbol, kieu)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict, settled, symbol, kieu])

  if (!conflict) return null

  const ungHo = lopUngHo(doc5Lop)
  const nguoc = lopNguocChieu(doc5Lop)

  const handleLop = (lop: Lop) => {
    onLopQuyetDinh(lop)
    // Analytics `cap6_lop_quyet_dinh(lop, khop)` — `null` when there was no
    // suggestion to match. ★ `false` is a NEUTRAL fact, never a judgement; it is
    // recorded, never rendered as a verdict here.
    const khop = goiY && goiY.kieu != null ? goiY.lop_uu_tien.includes(lop) : null
    cap6Events.onLopQuyetDinhPicked?.(lop, khop)
  }

  return (
    <div className="cap6-doichieu" data-testid="cap6-doichieu">
      <div className="cap6-block-tag">{"ĐỐI CHIẾU"}</div>
      <div className="cap6-block-title">
        {`⚖️ 5 lớp đang mâu thuẫn — với ${symbol}, bạn tin lớp nào?`}
      </div>

      {/* Hai phía của mâu thuẫn, theo thứ tự chuẩn của 5 lớp. */}
      <div className="cap6-mau-thuan">
        <div className="cap6-phia cap6-phia--ungho" data-testid="cap6-ung-ho">
          <span className="cap6-phia-label">{"Ủng hộ: "}</span>
          {lopList(ungHo)}
        </div>
        <div className="cap6-phia cap6-phia--nguoc" data-testid="cap6-nguoc-chieu">
          <span className="cap6-phia-label">{"Ngược chiều: "}</span>
          {lopList(nguoc)}
        </div>
      </div>

      {/* Kiểu cổ phiếu + trọng số gợi ý + VÌ SAO (§C12c). Mọi trạng thái đều
          degrade "mở": không lấy được gợi ý thì user vẫn quyết định được. */}
      <div className="cap6-goi-y">
        {isLoading ? (
          <p className="cap6-goi-y-state" data-testid="cap6-goi-y-loading">
            {"Đang tải kiểu cổ phiếu và trọng số gợi ý…"}
          </p>
        ) : isError || !goiY ? (
          <p className="cap6-goi-y-state" data-testid="cap6-goi-y-error">
            {ERROR_NOTE}
          </p>
        ) : goiY.kieu == null ? (
          <>
            <div className="cap6-kieu" data-testid="cap6-chua-phan-loai">
              {"Kiểu cổ phiếu: chưa phân loại"}
            </div>
            {/* Câu của server, NGUYÊN VĂN — nó tự nói vì sao chưa phân loại. */}
            <p className="cap6-giai-thich" data-testid="cap6-giai-thich">
              {goiY.giai_thich}
            </p>
            <div className="cap6-goi-y-line">
              <span className="cap6-goi-y-line-label">
                {"Bạn thấy mã này thuộc kiểu nào? (không bắt buộc)"}
              </span>
            </div>
            <div className="cap6-kieu-picker" data-testid="cap6-kieu-picker">
              {KIEU_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "cap6-kieu-btn",
                    kieuCoPhieu === opt.value && "cap6-kieu-btn--on",
                  )}
                  aria-pressed={kieuCoPhieu === opt.value}
                  onClick={() => onKieuCoPhieu(opt.value)}
                  data-testid={`cap6-kieu-pick-${opt.value}`}
                >
                  {`${opt.icon} ${opt.label}`}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="cap6-kieu" data-testid="cap6-kieu">
              {`Kiểu cổ phiếu: ${KIEU_ICON[goiY.kieu]} ${goiY.kieu_ten ?? ""}`.trim()}
            </div>
            {goiY.nganh && (
              <p className="cap6-nganh" data-testid="cap6-nganh">
                {`(Kiểu suy ra từ ngành: ${goiY.nganh})`}
              </p>
            )}
            {goiY.lop_uu_tien.length > 0 && (
              <p className="cap6-goi-y-line" data-testid="cap6-uu-tien">
                <span className="cap6-goi-y-line-label">
                  {"Với kiểu này, IQX gợi ý ưu tiên: "}
                </span>
                {lopListFromServer(goiY.lop_uu_tien, goiY.lop_uu_tien_ten)}
              </p>
            )}
            {goiY.lop_it_tin.length > 0 && (
              <p className="cap6-goi-y-line" data-testid="cap6-it-tin">
                <span className="cap6-goi-y-line-label">{"Lớp ít tin cậy hơn: "}</span>
                {lopListFromServer(goiY.lop_it_tin, goiY.lop_it_tin_ten)}
              </p>
            )}
            {/* Câu "vì sao" của server, NGUYÊN VĂN (§C12c: không gợi ý trơ). */}
            <p className="cap6-giai-thich" data-testid="cap6-giai-thich">
              <span className="cap6-goi-y-line-label">{"Vì sao: "}</span>
              {goiY.giai_thich}
            </p>
            <p className="cap6-goi-y-note" data-testid="cap6-goi-y-note">
              {GOI_Y_NOTE}
            </p>
          </>
        )}
      </div>

      {/* Lớp quyết định — CẢ 5 lớp đều chọn được, kể cả lớp server xếp "ít tin
          cậy hơn": lệch gợi ý là quyền của user (spec §5/§10). */}
      <div className="cap6-quyet-dinh-label">{"Lớp bạn quyết định tin cho lệnh này:"}</div>
      <div className="cap6-lop-picker" data-testid="cap6-lop-picker">
        {LOP_DEFS.map((def) => (
          <button
            key={def.lop}
            type="button"
            className={cn("cap6-lop-btn", lopQuyetDinh === def.lop && "cap6-lop-btn--on")}
            aria-pressed={lopQuyetDinh === def.lop}
            onClick={() => handleLop(def.lop)}
            data-testid={`cap6-lop-${def.lop}`}
          >
            <span className="cap6-lop-btn-icon">{def.icon}</span>
            {def.label}
          </button>
        ))}
      </div>

      <label className="cap6-ly-do">
        {"Vì sao bạn tin lớp đó (1 dòng, bắt buộc):"}
        <input
          value={lyDo}
          onChange={(e) => onLyDo(e.target.value)}
          placeholder="VD: P/B 1.2 — thấp hơn trung vị 3 năm"
          data-testid="cap6-ly-do"
        />
      </label>

      <p className="cap6-gate-note">
        {"Chọn lớp quyết định và ghi 1 dòng vì sao mới đặt được lệnh."}
      </p>
    </div>
  )
}
