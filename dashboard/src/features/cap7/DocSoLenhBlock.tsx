import { useEffect, useRef } from "react"
import { cn } from "@/shared/lib/cn"
import { useCap7Events } from "./Cap7Context"
import { SO_O_GAUGE, docSoLenhSnapshot, gaugeFill, type MucSoLenh } from "./docSoLenh"
import { usePhienCap7 } from "./hooks"
import { LUC_DOC_OPTIONS, type HanhViCo, type LucDocUser } from "./types"
import "./cap7.css"

/**
 * Khối "Đọc sổ lệnh" (spec §4/§5, 🟢 THÊM MỚI) — Cấp 7's ONE insertion into the
 * buy panel. Cấp 6's panel (Đối chiếu + Cấp 4's đọc-5-lớp + Cấp 3's quản lý vốn
 * + Cấp 2's SL/TP + Cấp 1's vùng mua + Cấp 5's Đứng ngoài) stays 100% intact
 * around it (spec §0).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ★1 IT NEVER GATES MUA. Reading the book is SOFT (spec §9): nhiệm vụ ① only
 *    needs one recorded reading, and nothing here may appear in the panel's
 *    `disabled` chain. Skipping the step must always place an order normally.
 *
 * ★2 `trong_phien` COMES FROM THE SERVER (`GET /cap7/phien`), never the browser
 *    clock — a user in another timezone would otherwise be told the market is
 *    open when it is not. While the answer is unknown (loading/error) the guess
 *    UI stays CLOSED rather than assuming a session.
 *
 * ★3 EVERY THRESHOLD IS THE SERVER'S. The band cut-offs, the cờ's hệ số and its
 *    minimum level count all ride on `quy_tac`, and the block renders the
 *    server's own `dieu_kien_text`/`giai_thich`. A hardcoded number here would
 *    show the user a band that contradicts the server-side chấm.
 *
 * ★4 THE CỜ NEVER CLAIMS A FAKE ORDER WAS DETECTED. It is a shape heuristic on a
 *    static snapshot: a large resting order MAY or may not be real. Spec §9
 *    puts real spoof detection (tick-by-tick order-lifetime tracking) out of
 *    scope, so no copy in this file may say IQX found one — see
 *    `DocSoLenhBlock.test.tsx`'s "KHÔNG BAO GIỜ khẳng định…" block.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **Does NOT rebuild the order book** (spec §4: "thêm lớp phủ đọc… không dựng
 * lại sổ"). `OrderBookView` already renders the ladder from `usePrice(symbol)`;
 * the SAME `data.bid`/`data.ask` arrive here as props, so this block stays
 * pure-ish and testable and never opens a second subscription.
 *
 * Purely presentational + controlled: `TradingPanel` owns the state (it needs it
 * for `POST /cap7/kehoach` at fill time).
 */
export interface DocSoLenhBlockProps {
  symbol: string
  /** Dư MUA — `data.bid` from the panel's existing `usePrice(symbol)`. */
  bid: MucSoLenh[]
  /** Dư BÁN — `data.ask` from the same `data`. */
  ask: MucSoLenh[]
  /** The user's OWN reading — the system never fills this in (spec §4). */
  docLuc: LucDocUser | null
  onDocLuc: (doc: LucDocUser) => void
  /** What the user did about the cờ; `null` until they act (never forced). */
  hanhViCo: HanhViCo | null
  onHanhViCo: (hanhVi: HanhViCo) => void
}

/** Giá sổ lệnh về VND (bảng giá trả về đơn vị nghìn đồng, như `fmtPrice`). */
function fmtGia(price: number): string {
  return Math.round(price * 1000).toLocaleString("en-US")
}

function fmtKl(volume: number): string {
  return Math.round(volume).toLocaleString("en-US")
}

/** `1.9375` → `1.9` (en-US: dấu chấm thập phân). */
function fmtTyLe(ratio: number): string {
  return ratio.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

const NOTE_TUY_CHON =
  "Đọc lực là bước tùy chọn — bỏ qua thì đặt lệnh vẫn bình thường. Lực chỉ giúp chọn thời điểm; lý do mua vẫn là 5 lớp và bước Đối chiếu ở trên."

const NOTE_MONG =
  "Sổ lệnh lúc này quá mỏng để đọc lực: một bên chưa có dư nào ở các mức tốt nhất, nên không có tỷ lệ nào đáng tin để ghi lại. Bỏ qua bước này, đặt lệnh vẫn bình thường."

const NOTE_PHIEN_LOI =
  "Chưa hỏi được máy chủ xem thị trường có đang mở cửa hay không. IQX không đoán giờ giao dịch từ đồng hồ máy bạn, nên tạm chưa mở bước đọc lực — bỏ qua thì đặt lệnh vẫn bình thường."

const NOTE_PHIEN_DANG_TAI = "Đang hỏi máy chủ xem thị trường có đang mở cửa không…"

const NOTE_MUA_DUOI =
  "Nếu bạn mua luôn mà chưa chờ khớp thật, IQX ghi là “mua đuổi” để bạn nhìn lại ở Kết sổ — ghi lại thôi, không phạt."

export function DocSoLenhBlock({
  symbol,
  bid,
  ask,
  docLuc,
  onDocLuc,
  hanhViCo,
  onHanhViCo,
}: DocSoLenhBlockProps) {
  const cap7Events = useCap7Events()
  const { data: phien, isLoading, isError } = usePhienCap7()

  const quyTac = phien?.quy_tac ?? null
  // ★2 — the SERVER's answer only. `undefined` (loading/error) is NOT "open".
  const trongPhien = phien?.trong_phien === true
  const snap = docSoLenhSnapshot(bid, ask, quyTac)
  const band = quyTac?.bands.find((b) => b.ma === snap.band) ?? null
  const co = trongPhien ? snap.co : null

  // Analytics `cap7_luc_shown(mã, chi_so)` / `cap7_co_lenhgia_shown` (spec §8) —
  // once per symbol, not once per tick: the ratio changes on every quote update
  // and an event per tick would drown the funnel.
  const lucShownRef = useRef<string | null>(null)
  const coShownRef = useRef<string | null>(null)

  useEffect(() => {
    if (!trongPhien || snap.chiSo == null) return
    if (lucShownRef.current === symbol) return
    lucShownRef.current = symbol
    cap7Events.onLucShown?.(symbol, snap.chiSo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trongPhien, snap.chiSo, symbol])

  useEffect(() => {
    if (!co) return
    if (coShownRef.current === symbol) return
    coShownRef.current = symbol
    cap7Events.onCoShown?.(symbol, Math.round(co.price * 1000), co.volume)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [co, symbol])

  const handleDoc = (doc: LucDocUser) => {
    onDocLuc(doc)
    cap7Events.onLucDoc?.(doc)
  }

  const handleChoXacNhan = () => {
    onHanhViCo("cho_xac_nhan")
    cap7Events.onCoHanhVi?.("cho_xac_nhan")
  }

  const fill = gaugeFill(snap.tongMua, snap.tongBan)

  return (
    <div className="cap7-docsolenh" data-testid="cap7-docsolenh">
      <div className="cap7-block-tag">{"ĐỌC SỔ LỆNH"}</div>
      <div className="cap7-block-title">{`📖 Đọc sổ lệnh ${symbol}`}</div>

      {isLoading ? (
        <p className="cap7-state" data-testid="cap7-phien-loading">
          {NOTE_PHIEN_DANG_TAI}
        </p>
      ) : isError || !phien ? (
        /* ★2 — không hỏi được server thì nói thẳng, KHÔNG tự tính giờ mở cửa. */
        <p className="cap7-state" data-testid="cap7-phien-error">
          {NOTE_PHIEN_LOI}
        </p>
      ) : !phien.trong_phien ? (
        /* spec §4 — ngoài giờ sổ đứng yên: chỉ ghi chú, KHÔNG ép đọc. */
        <div className="cap7-ngoai-gio" data-testid="cap7-ngoai-gio">
          <p className="cap7-state">{phien.giai_thich}</p>
          <p className="cap7-note">{phien.gio_giao_dich_text}</p>
        </div>
      ) : (
        <>
          {/* Số liệu thô trước, kết luận sau (§C12c) — đúng thứ tự của spec §4. */}
          <div className="cap7-tong-du" data-testid="cap7-tong-du">
            <span className="cap7-tong-du-o">
              <span className="cap7-tong-du-label">{`Tổng dư MUA (${bid.length} mức): `}</span>
              <span className="cap7-tong-du-mua">{fmtKl(snap.tongMua)}</span>
            </span>
            <span className="cap7-tong-du-o">
              <span className="cap7-tong-du-label">{`Tổng dư BÁN (${ask.length} mức): `}</span>
              <span className="cap7-tong-du-ban">{fmtKl(snap.tongBan)}</span>
            </span>
          </div>

          {snap.chiSo == null || !band ? (
            /* ★ Sổ không đọc được → nói thật, KHÔNG gauge, KHÔNG band bịa ra. */
            <p className="cap7-state" data-testid="cap7-mong">
              {NOTE_MONG}
            </p>
          ) : (
            <>
              <div className="cap7-luc">
                <span
                  className="cap7-gauge"
                  data-testid="cap7-gauge"
                  role="img"
                  aria-label={`Thanh lực: ${fill}/${SO_O_GAUGE} ô nghiêng về bên mua`}
                >
                  {"▓".repeat(fill) + "░".repeat(SO_O_GAUGE - fill)}
                </span>
                <span className="cap7-band" data-testid="cap7-band">
                  {`${band.ten} (mua/bán ≈ ${fmtTyLe(snap.chiSo)} : 1)`}
                </span>
              </div>
              {/* Câu "vì sao" của server, NGUYÊN VĂN (§C12c: không số trơ). */}
              <p className="cap7-vi-sao" data-testid="cap7-vi-sao">
                <span className="cap7-label">{"Vì sao: "}</span>
                {band.giai_thich}
              </p>
              {/* ★3 — ngưỡng của SERVER, hiện ra để user thấy band từ đâu mà có. */}
              <p className="cap7-nguong" data-testid="cap7-nguong">
                <span className="cap7-label">{"Ngưỡng IQX đang dùng: "}</span>
                {band.dieu_kien_text}
              </p>

              {/* Hệ KHÔNG quyết thay — user tự chốt (spec §4). */}
              <div className="cap7-picker-label">{"Bạn đọc lực lúc này là:"}</div>
              <div className="cap7-picker" data-testid="cap7-picker">
                {LUC_DOC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn("cap7-doc-btn", docLuc === opt.value && "cap7-doc-btn--on")}
                    aria-pressed={docLuc === opt.value}
                    onClick={() => handleDoc(opt.value)}
                    data-testid={`cap7-doc-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Câu chấm của server, NGUYÊN VĂN — user biết trước sẽ chấm thế nào. */}
              <p className="cap7-note" data-testid="cap7-cham-note">
                {phien.quy_tac.cham_giai_thich}
              </p>
            </>
          )}

          {/* ★4 — cờ cảnh giác: GIÁO DỤC, heuristic, KHÔNG chặn gì. */}
          {co && (
            <div className="cap7-co" data-testid="cap7-co">
              <div className="cap7-co-title">
                {`⚠ Có lệnh lớn treo ở ${fmtGia(co.price)} (${fmtKl(co.volume)} CP).`}
              </div>
              <p className="cap7-co-copy" data-testid="cap7-co-copy">
                {phien.quy_tac.co_canh_giac_copy}
              </p>
              <p className="cap7-note" data-testid="cap7-co-honesty">
                {`Đây là cảnh giác dựa trên HÌNH DẠNG sổ lệnh lúc này (một mức lớn hơn ${phien.quy_tac.co_canh_giac_he_so}× trung bình các mức còn lại) — IQX không kết luận gì về lệnh treo đó, chỉ nhắc bạn nhìn kỹ.`}
              </p>
              <button
                type="button"
                className={cn(
                  "cap7-co-btn",
                  hanhViCo === "cho_xac_nhan" && "cap7-co-btn--on",
                )}
                aria-pressed={hanhViCo === "cho_xac_nhan"}
                onClick={handleChoXacNhan}
                data-testid="cap7-co-cho-xac-nhan"
              >
                {"Tôi hiểu — chờ xác nhận"}
              </button>
              <p className="cap7-note">{NOTE_MUA_DUOI}</p>
            </div>
          )}

          {/* Câu của server về phiên đang sống, NGUYÊN VĂN. */}
          <p className="cap7-note">{phien.giai_thich}</p>
          {/* ★1 — nói thẳng rằng bước này không chặn gì. */}
          <p className="cap7-note" data-testid="cap7-tuy-chon">
            {NOTE_TUY_CHON}
          </p>
        </>
      )}
    </div>
  )
}
