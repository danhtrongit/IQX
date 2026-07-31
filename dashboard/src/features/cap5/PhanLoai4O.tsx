import { useEffect, useRef, useState } from "react"
import { Button } from "@arco-design/web-react"
import { cn } from "@/shared/lib/cn"
import { useVerdictGoiY } from "./hooks"
import { isPhanLoaiSettled, VERDICT_LABEL, type Verdict, type VerdictSignal } from "./types"
import "./cap5.css"

/**
 * Khối phân loại 4 ô trong Kết sổ Cấp 5 (spec §4, 🟢 THÊM MỚI).
 *
 * Hybrid: hệ GỢI Ý verdict về **chất lượng quyết định** (độc lập lãi/lỗ), user
 * chốt hoặc đảo. Component này KHÔNG ghi server — nó chỉ báo trạng thái đã chốt
 * lên cha qua `onSettled`; cha sở hữu `POST /cap5/ketso` + cổng `Đóng kết sổ ✓`.
 *
 * ★ **Provenance bắt buộc (§C12c):** luôn liệt kê NGUYÊN VĂN mọi tín hiệu dẫn
 * tới verdict — không bao giờ hiện verdict trơ, không thu gọn/ẩn danh sách sau
 * khi user đã chốt. Tín hiệu `dat === null` là **chưa rõ** (dữ liệu nguồn chưa
 * từng được ghi), phải hiện bằng dấu riêng — hiện như "đạt" là nói dối user.
 *
 * ★ **Fail-closed:** đang tải hoặc lỗi → báo `(null, null)` để cha giữ nút đóng
 * bị khoá; tuyệt đối không cho đóng kết sổ khi chưa có verdict nào.
 *
 * ★ Điều kiện chốt dùng `isPhanLoaiSettled` (mirror luật 422 của server: đảo
 * khác verdict hệ thì BẮT BUỘC 1 dòng lý do) nên user không gặp lỗi API thô.
 */
export interface PhanLoai4OProps {
  orderId: string
  /**
   * Báo lên cha mỗi khi trạng thái chốt đổi. `(null, null)` = chưa chốt (cha
   * phải khoá nút đóng). `lyDoSua` chỉ khác null khi user đảo verdict hệ.
   */
  onSettled: (verdictUser: Verdict | null, lyDoSua: string | null) => void
}

const QUESTION = "🔍 QUYẾT ĐỊNH NÀY ĐÚNG HAY SAI — ĐỘC LẬP VỚI LÃI/LỖ?"
const AGREE_LABEL = "✔ Đồng ý"
const DIFFER_LABEL = "✎ Tôi thấy khác →"

const OPPOSITE: Record<Verdict, Verdict> = { dung: "sai", sai: "dung" }

/** Lựa chọn của user: theo hệ, hoặc thấy khác (đảo). */
type Chon = "he" | "khac"

/** Dấu + nhãn cho 1 tín hiệu — `null` là CHƯA RÕ, không phải đạt. */
function markOf(dat: boolean | null): { char: string; cls: string; note: string } {
  if (dat === true) return { char: "✔", cls: "cap5-phanloai-why-mark--dat", note: "" }
  if (dat === false) return { char: "✘", cls: "cap5-phanloai-why-mark--truot", note: "" }
  return { char: "⚪", cls: "cap5-phanloai-why-mark--chuaro", note: " (chưa rõ)" }
}

function SignalRow({ signal }: { signal: VerdictSignal }) {
  const mark = markOf(signal.dat)
  return (
    <li data-testid={`cap5-phanloai-signal-${signal.ma}`}>
      <span
        className={cn("cap5-phanloai-why-mark", mark.cls)}
        data-testid={`cap5-phanloai-mark-${signal.ma}`}
      >
        {mark.char}
      </span>
      <span>
        <strong>{signal.ten}</strong>
        {mark.note} — {signal.giai_thich}
      </span>
    </li>
  )
}

export function PhanLoai4O({ orderId, onSettled }: PhanLoai4OProps) {
  const query = useVerdictGoiY(orderId)
  const goiY = query.data
  const verdictHe = goiY?.verdict ?? null

  const [chon, setChon] = useState<Chon | null>(null)
  const [lyDo, setLyDo] = useState("")

  let verdictUser: Verdict | null = null
  if (verdictHe != null && chon === "he") verdictUser = verdictHe
  if (verdictHe != null && chon === "khac") verdictUser = OPPOSITE[verdictHe]
  const lyDoSua = chon === "khac" ? (lyDo.trim() || null) : null
  const settled = isPhanLoaiSettled(verdictHe, verdictUser, lyDoSua)

  // Chỉ báo lên cha đúng những gì cha được phép dùng — chưa chốt là (null, null).
  const reportVerdict = settled ? verdictUser : null
  const reportLyDo = settled ? lyDoSua : null

  // Ref để cha truyền callback inline (lambda mới mỗi render) không gây vòng lặp.
  const onSettledRef = useRef(onSettled)
  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    onSettledRef.current(reportVerdict, reportLyDo)
  }, [reportVerdict, reportLyDo])

  return (
    <div className="cap5-phanloai" data-testid="cap5-phanloai">
      <div className="cap5-phanloai-tag">Phân loại 4 ô</div>
      <div className="cap5-phanloai-q" data-testid="cap5-phanloai-q">
        {QUESTION}
      </div>

      {query.isPending || !goiY || verdictHe == null ? (
        query.isError ? (
          <p className="cap5-phanloai-note" data-testid="cap5-phanloai-error">
            Chưa lấy được verdict của lệnh này. Thử mở lại kết sổ — chưa có verdict thì chưa phân
            loại được.
          </p>
        ) : (
          <p className="cap5-phanloai-note" data-testid="cap5-phanloai-loading">
            Đang tính verdict gợi ý từ dữ liệu lệnh này…
          </p>
        )
      ) : (
        <>
          <div
            className={cn(
              "cap5-phanloai-verdict",
              verdictHe === "dung"
                ? "cap5-phanloai-verdict--dung"
                : "cap5-phanloai-verdict--sai",
            )}
            data-testid="cap5-phanloai-verdict-he"
          >
            {`Hệ gợi ý: ${VERDICT_LABEL[verdictHe]}`}
          </div>
          <p className="cap5-phanloai-note" data-testid="cap5-phanloai-giai-thich">
            {goiY.giai_thich}
          </p>

          <div className="cap5-phanloai-tag">Vì sao (dữ liệu lệnh này)</div>
          <ul className="cap5-phanloai-why" data-testid="cap5-phanloai-why">
            {goiY.signals.map((s) => (
              <SignalRow key={s.ma} signal={s} />
            ))}
          </ul>

          {verdictUser != null && chon === "khac" ? (
            <div
              className={cn(
                "cap5-phanloai-verdict",
                verdictUser === "dung"
                  ? "cap5-phanloai-verdict--dung"
                  : "cap5-phanloai-verdict--sai",
              )}
              data-testid="cap5-phanloai-verdict-user"
            >
              {`Bạn chốt: ${VERDICT_LABEL[verdictUser]}`}
            </div>
          ) : null}

          <div className="cap5-phanloai-actions">
            <Button
              type={chon === "he" ? "primary" : "default"}
              size="small"
              aria-pressed={chon === "he"}
              onClick={() => {
                setChon("he")
                setLyDo("")
              }}
              data-testid="cap5-phanloai-dong-y"
            >
              {AGREE_LABEL}
            </Button>
            <Button
              type={chon === "khac" ? "primary" : "default"}
              size="small"
              aria-pressed={chon === "khac"}
              onClick={() => setChon("khac")}
              data-testid="cap5-phanloai-khac"
            >
              {DIFFER_LABEL}
            </Button>
          </div>

          {chon === "khac" ? (
            <label className="cap5-phanloai-reason">
              Ghi 1 dòng vì sao bạn thấy khác (bắt buộc) — VD “tôi vào theo tin đồn, dù lớp ủng hộ”
              <input
                type="text"
                value={lyDo}
                maxLength={200}
                onChange={(e) => setLyDo(e.target.value)}
                data-testid="cap5-phanloai-reason-input"
              />
            </label>
          ) : null}
        </>
      )}
    </div>
  )
}
