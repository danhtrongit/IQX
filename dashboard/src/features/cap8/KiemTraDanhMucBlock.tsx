import { useEffect, useRef } from "react"
import { cn } from "@/shared/lib/cn"
import { useCap8Events } from "./Cap8Context"
import { useKiemTraCap8 } from "./hooks"
import { HANH_VI_OPTIONS, type HanhViCanhBao } from "./types"
import "./cap8.css"

/**
 * Khối "Kiểm tra danh mục" (spec §4, 🟢 THÊM MỚI) — Cấp 8's ONE insertion into
 * the buy panel, right before xác nhận MUA. Cấp 7's panel (Đọc sổ lệnh + Cấp 6's
 * Đối chiếu + Cấp 5's Đứng ngoài + Cấp 4's Đọc 5 lớp + Cấp 3's Quản lý vốn +
 * Cấp 2's SL/TP + Cấp 1's Vùng mua) stays 100% intact around it (spec §0).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ★1 IT NEVER GATES MUA. Spec §9 rules out a cổng cứng and §C8 puts the
 *    decision with the user: this is a CẢNH BÁO MỀM. Nothing here may appear in
 *    the panel's `disabled` chain, and if `GET /cap8/kiem-tra` fails the block
 *    degrades **OPEN** — an honest note, and the order still goes through. A
 *    failed check must never trap the user.
 *
 * ★2 THE THREE-CHOICE ROW EXISTS ONLY WHEN A WARNING ACTUALLY FIRED. With no
 *    warning there is nothing to respond to, and the server REJECTS a
 *    `van_mua`/`giam_kl`/`chon_ma_khac` on a clean order with 400 (and
 *    `khong_canh_bao` on a warned one). Rendering the row unconditionally would
 *    produce a spurious 400 on every clean buy.
 *
 * ★3 "VẪN MUA" IS A FIRST-CLASS CHOICE. All three buttons share ONE neutral
 *    style; none of them is coloured as the wrong answer. Amber in this block
 *    only ever marks a warning that fired — a fact about the portfolio, not a
 *    judgement of the user's decision.
 *
 * ★4 IT COMPUTES NO MEASURE OF ITS OWN. Sector weight needs ICB, correlation
 *    needs price history and tổng rủi ro needs every position's stop — none of
 *    which the FE has. The server ships each measure with its own
 *    plain-Vietnamese `giai_thich` (§C12c) and this block renders those
 *    VERBATIM, including every threshold, which arrives on `quy_tac`.
 *
 * ★5 AN UNKNOWN IS NEVER RENDERED AS A ZERO. `tuong_quan_du_lieu = false` is
 *    "chưa đủ dữ liệu" — the shared `correlation()` answers `0.0` for input it
 *    cannot judge, and `0.0` on screen would read as "these two do not move
 *    together", a claim nobody has grounds for. Likewise
 *    `so_vi_the_thieu_cat_lo` is stated out loud: a position with no stop has
 *    UNKNOWN risk, not zero risk, and the total above it is only the part we
 *    know.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Controlled: `TradingPanel` owns `hanhVi` (it needs it for `POST
 * /cap8/kehoach` at fill time) and owns the two side effects — `Giảm khối
 * lượng` edits Cấp 3's existing volume field (lô 100), `Chọn mã khác` clears the
 * symbol selection. The block itself only reports what was pressed.
 */
export interface KiemTraDanhMucBlockProps {
  symbol: string
  khoiLuong: number
  /** Giá dự kiến khớp, đơn vị ĐỒNG. */
  gia: number
  /** Cắt lỗ của chính lệnh này (Cấp 2); `null` ⇒ đóng góp của lệnh CHƯA BIẾT. */
  catLo: number | null
  /** Lựa chọn của user; `null` cho tới khi họ bấm (không bao giờ bị ép). */
  hanhVi: HanhViCanhBao | null
  onHanhVi: (hanhVi: HanhViCanhBao) => void
  /** Giảm khối lượng trong ô Khối lượng của Cấp 3 (giữ luật lô 100). */
  onGiamKhoiLuong: () => void
  /** Bỏ mã đang chọn để tìm mã khác. */
  onChonMaKhac: () => void
}

const NOTE_KHONG_CHAN =
  "Bước Kiểm tra danh mục KHÔNG chặn lệnh MUA: IQX chỉ cho bạn thấy lệnh này làm danh mục lệch đi thế nào — quyết định vẫn là của bạn."

const NOTE_LOI =
  "Chưa chạy được bước Kiểm tra danh mục lúc này (không hỏi được máy chủ). IQX không đoán thay ba con số này — bỏ qua thì đặt lệnh vẫn bình thường."

const NOTE_DANG_TAI = "Đang tính xem lệnh này ảnh hưởng danh mục thế nào…"

const NOTE_SACH =
  "Không có cảnh báo nào — lệnh này không làm danh mục mất cân đối. Cứ đặt lệnh như bình thường."

const LABEL_HANH_VI = "Bạn muốn làm gì?"

/** `0.82` → `0.82` (en-US: dấu chấm thập phân, luôn 2 chữ số). */
function fmtHeSo(heSo: number): string {
  return heSo.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function KiemTraDanhMucBlock({
  symbol,
  khoiLuong,
  gia,
  catLo,
  hanhVi,
  onHanhVi,
  onGiamKhoiLuong,
  onChonMaKhac,
}: KiemTraDanhMucBlockProps) {
  const cap8Events = useCap8Events()
  // ★ Debounced inside the hook — this check is O(vị thế) price lookups plus a
  // bounded O(n²) set of correlation fetches, and it hangs off a field the user
  // types into.
  const { data, isLoading, isError } = useKiemTraCap8({ symbol, khoiLuong, gia, catLo })

  const canhBao = data?.canh_bao ?? []
  const coCanhBao = canhBao.length > 0

  // Analytics `cap8_check_shown(mã, cảnh_báo[])` (spec §8) — once per symbol +
  // warning-set, not once per re-render: the check re-runs whenever the volume
  // settles and an event per run would drown the funnel.
  const shownRef = useRef<string | null>(null)
  useEffect(() => {
    if (!data) return
    const chuKy = `${data.symbol}|${canhBao.map((c) => c.ma).join(",")}`
    if (shownRef.current === chuKy) return
    shownRef.current = chuKy
    cap8Events.onCheckShown?.(
      data.symbol,
      canhBao.map((c) => c.ma),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const handleHanhVi = (value: HanhViCanhBao) => {
    onHanhVi(value)
    cap8Events.onCheckHanhVi?.(value)
    // ★ The two side effects belong to the panel — the block never touches the
    // volume field or the symbol itself.
    if (value === "giam_kl") onGiamKhoiLuong()
    if (value === "chon_ma_khac") onChonMaKhac()
  }

  return (
    <div className="cap8-kiemtra" data-testid="cap8-kiemtra">
      <div className="cap8-block-tag">{"KIỂM TRA DANH MỤC"}</div>
      <div className="cap8-block-title">{`🗺️ Thêm ${symbol} ảnh hưởng danh mục thế nào?`}</div>

      {isLoading ? (
        <p className="cap8-state" data-testid="cap8-dang-tai">
          {NOTE_DANG_TAI}
        </p>
      ) : isError || !data ? (
        /* ★1 — hỏng thì nói thẳng và MỞ ĐƯỜNG, không giữ user lại. */
        <p className="cap8-state" data-testid="cap8-loi">
          {NOTE_LOI}
        </p>
      ) : (
        <>
          {/* ── ① Dồn ngành ── */}
          <div
            className={cn("cap8-do", data.don_nganh_canh_bao && "cap8-do--canh")}
            data-testid="cap8-don-nganh"
          >
            <div className="cap8-do-ten">
              {data.don_nganh_canh_bao ? "⚠ Dồn ngành" : "Dồn ngành"}
            </div>
            {/* Câu "vì sao" của server, NGUYÊN VĂN (§C12c: không số trơ). */}
            <p className="cap8-do-vi-sao">{data.giai_thich.don_nganh}</p>
          </div>

          {/* ── ② Tương quan ── */}
          <div
            className={cn("cap8-do", data.tuong_quan_canh_bao && "cap8-do--canh")}
            data-testid="cap8-tuong-quan"
          >
            <div className="cap8-do-ten">
              {data.tuong_quan_canh_bao ? "⚠ Tương quan" : "Tương quan"}
            </div>
            {/* ★5 — hệ số CHỈ hiện khi server tính được nó. */}
            {data.tuong_quan_du_lieu && data.tuong_quan ? (
              <div className="cap8-he-so" data-testid="cap8-tuong-quan-he-so">
                {`${data.tuong_quan.symbol} · ${fmtHeSo(data.tuong_quan.he_so)}`}
              </div>
            ) : (
              <p className="cap8-chua-du" data-testid="cap8-tuong-quan-chua-du">
                {"Chưa tính được — chưa đủ dữ liệu."}
              </p>
            )}
            <p className="cap8-do-vi-sao">{data.giai_thich.tuong_quan}</p>
          </div>

          {/* ── ③ Tổng vốn ở rủi ro ── */}
          <div
            className={cn("cap8-do", data.tong_rui_ro_canh_bao && "cap8-do--canh")}
            data-testid="cap8-tong-rui-ro"
          >
            <div className="cap8-do-ten">
              {data.tong_rui_ro_canh_bao ? "⚠ Tổng vốn ở rủi ro" : "Tổng vốn ở rủi ro"}
            </div>
            <p className="cap8-do-vi-sao">{data.giai_thich.tong_rui_ro}</p>
            {/* ★5 — vị thế bị LOẠI khỏi tổng, nêu rõ chứ không giấu sau con số. */}
            {data.so_vi_the_thieu_cat_lo > 0 && (
              <p className="cap8-caveat" data-testid="cap8-thieu-cat-lo">
                {`⚠ ${data.so_vi_the_thieu_cat_lo} vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này, nên con số trên là phần ĐÃ BIẾT, không phải toàn bộ.`}
              </p>
            )}
            {data.so_vi_the_thieu_gia > 0 && (
              <p className="cap8-caveat" data-testid="cap8-thieu-gia">
                {`⚠ ${data.so_vi_the_thieu_gia} vị thế chưa lấy được giá — cũng chưa tính được tỷ trọng và rủi ro của các vị thế này.`}
              </p>
            )}
            {/* ★ Hai con số KHÔNG cùng một nghĩa — câu của server, nguyên văn. */}
            <p className="cap8-note" data-testid="cap8-tran-khau-vi">
              {data.giai_thich.tran_khau_vi}
            </p>
          </div>

          {/* ── Cảnh báo đã bật (nếu có) ── */}
          {coCanhBao && (
            <div className="cap8-canh-bao" data-testid="cap8-canh-bao">
              {canhBao.map((c) => (
                <div
                  key={c.ma}
                  className="cap8-canh-bao-item"
                  data-testid={`cap8-canh-bao-${c.ma}`}
                >
                  {`⚠ ${c.text}`}
                </div>
              ))}
            </div>
          )}

          {/* ★2 — hàng 3 lựa chọn CHỈ khi thật sự có cảnh báo để đáp lại. */}
          {coCanhBao ? (
            <>
              <div className="cap8-hanh-vi-label">{LABEL_HANH_VI}</div>
              <div className="cap8-hanh-vi" data-testid="cap8-hanh-vi">
                {HANH_VI_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    /* ★3 — MỘT kiểu nút cho cả ba: "Vẫn mua" không phải đáp án sai. */
                    className={cn(
                      "cap8-hanh-vi-btn",
                      hanhVi === opt.value && "cap8-hanh-vi-btn--on",
                    )}
                    aria-pressed={hanhVi === opt.value}
                    onClick={() => handleHanhVi(opt.value)}
                    data-testid={`cap8-hanh-vi-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="cap8-sach" data-testid="cap8-khong-canh-bao">
              {NOTE_SACH}
            </p>
          )}

          {/* Spec §9 — bản sâu vẫn là Người quản lý danh mục, câu của server. */}
          <p className="cap8-note" data-testid="cap8-cross-ref">
            {data.cross_ref_pm}
          </p>
          {/* ★1 — nói thẳng rằng bước này không chặn gì. */}
          <p className="cap8-note" data-testid="cap8-khong-chan">
            {NOTE_KHONG_CHAN}
          </p>
        </>
      )}
    </div>
  )
}
