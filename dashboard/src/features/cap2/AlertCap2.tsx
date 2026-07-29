import { useEffect, useState } from "react"
import { cn } from "@/shared/lib/cn"
import { GREYED_CONFIRM_SECONDS, type AlertLevel } from "./alertRate"
import "./cap2-alerts.css"

/**
 * Cấp 2 «Kỷ luật» — 2 cảnh báo (spec §8 chạm cắt lỗ · §9 nhồi lệnh khi lỗ).
 *
 * Cả 2 đều **thuần trình bày** (props-driven): trang Cấp 2 (task sau) mới là
 * nơi phát hiện thời điểm (cuối phiên / đầu phiên kế / lúc bấm mua thêm) và
 * quyết định có hiện hay không qua `evaluateAlertRate` (spec §10).
 *
 * Nguyên tắc §C8: hệ thống **KHÔNG tự bán** và **không chặn cứng** — cảnh báo
 * chỉ soi gương + làm chậm lại; user luôn có đường huỷ.
 */

const VND = (n: number) => Math.round(n).toLocaleString("en-US")

export interface ChamCatLoBannerProps {
  symbol: string
  /** Ngưỡng cắt lỗ user đã cam kết lúc mua. */
  catLo: number
  giaHienTai: number
  /**
   * Số phiên đã giữ TIẾP dù giá đã chạm ngưỡng cắt lỗ. `0` = vừa chạm trong
   * phiên hôm nay (bản cuối phiên); `≥1` = đã sang (các) phiên sau mà vẫn giữ.
   */
  phienGiuQuaNguong: number
  variant?: "cuoi_phien" | "phien_ke"
  onBan?: () => void
  onGiuTiep?: () => void
}

/**
 * spec §8 — câu chữ leo thang theo số phiên giữ quá ngưỡng: nhắc nhẹ → nêu
 * hệ quả → nói thẳng đây đã là "cắt lỗ chậm" và tính vào điểm kỷ luật.
 */
function chamCatLoMessage(phienGiuQuaNguong: number, symbol: string): string {
  if (phienGiuQuaNguong <= 0) {
    return `Giá ${symbol} đã chạm ngưỡng cắt lỗ bạn tự đặt. Kế hoạch của bạn nói bán ở đây — thực hiện đúng cam kết là phần khó nhất của Cấp 2.`
  }
  if (phienGiuQuaNguong === 1) {
    return `Hôm qua ${symbol} đã chạm ngưỡng cắt lỗ mà bạn chưa bán. Giữ tiếp vì hy vọng là cách lỗ nhỏ thành lỗ lớn.`
  }
  if (phienGiuQuaNguong <= 3) {
    return `${symbol} đã qua ${phienGiuQuaNguong} phiên kể từ khi chạm ngưỡng cắt lỗ. Mỗi phiên giữ thêm là một lần bạn dời cam kết của chính mình.`
  }
  return `Bạn đã giữ ${symbol} ${phienGiuQuaNguong} phiên sau khi giá chạm ngưỡng cắt lỗ. Đây chính là "cắt lỗ chậm" — hành vi được tính vào điểm kỷ luật và làm đứt chuỗi của bạn.`
}

export function ChamCatLoBanner({
  symbol,
  catLo,
  giaHienTai,
  phienGiuQuaNguong,
  variant = "cuoi_phien",
  onBan,
  onGiuTiep,
}: ChamCatLoBannerProps) {
  const severe = phienGiuQuaNguong >= 4
  return (
    <div
      className={cn("cap2-alert", "cap2-alert--chamsl", severe && "cap2-alert--severe")}
      data-testid="cap2-alert-chamsl"
      data-variant={variant}
      role="alert"
    >
      <div className="cap2-alert-head">
        <span aria-hidden="true">⚠</span>
        <span>
          {variant === "cuoi_phien"
            ? "Cuối phiên — giá đã chạm ngưỡng cắt lỗ"
            : "Đầu phiên — vẫn chưa bán dù đã chạm cắt lỗ"}
        </span>
      </div>

      <div className="cap2-alert-figures tabular-nums" data-testid="cap2-chamsl-figures">
        {`${symbol} · ngưỡng cắt lỗ ${VND(catLo)} · giá hiện tại ${VND(giaHienTai)}`}
      </div>

      <p className="cap2-alert-body">{chamCatLoMessage(phienGiuQuaNguong, symbol)}</p>

      <div className="cap2-alert-actions">
        <button type="button" className="cap2-alert-btn cap2-alert-btn--primary" onClick={onBan}>
          Bán ngay theo kế hoạch
        </button>
        <button type="button" className="cap2-alert-btn" onClick={onGiuTiep}>
          Giữ tiếp
        </button>
      </div>
    </div>
  )
}

export interface NhoiLenhWarningProps {
  symbol: string
  /** Lãi/lỗ hiện tại của vị thế đang giữ (âm — spec §9 chỉ bắn khi lỗ >−3%). */
  pnlPct: number
  /** Mức xác nhận từ `evaluateAlertRate` (spec §10). */
  level: AlertLevel
  onCancel: () => void
  onConfirm: () => void
}

const CONFIRM_PHRASE = "Tôi hiểu"

/** spec §9 — cảnh báo tức thời khi mua thêm một mã đang lỗ. */
export function NhoiLenhWarning({
  symbol,
  pnlPct,
  level,
  onCancel,
  onConfirm,
}: NhoiLenhWarningProps) {
  const [secondsLeft, setSecondsLeft] = useState(
    level === "greyed5s" ? GREYED_CONFIRM_SECONDS : 0,
  )
  const [typed, setTyped] = useState("")

  useEffect(() => {
    if (level !== "greyed5s") return
    setSecondsLeft(GREYED_CONFIRM_SECONDS)
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [level])

  const blockedByTimer = level === "greyed5s" && secondsLeft > 0
  const blockedByPhrase = level === "typeToConfirm" && typed.trim() !== CONFIRM_PHRASE
  const confirmDisabled = blockedByTimer || blockedByPhrase

  const pct = `${pnlPct < 0 ? "−" : ""}${Math.abs(Math.round(pnlPct * 10) / 10).toFixed(1)}%`

  return (
    <div className="cap2-alert cap2-alert--nhoilenh" data-testid="cap2-alert-nhoilenh" role="alert">
      <div className="cap2-alert-head">
        <span aria-hidden="true">⚠</span>
        <span>Mua thêm một mã đang lỗ</span>
      </div>

      <div className="cap2-alert-figures tabular-nums" data-testid="cap2-nhoilenh-figures">{`${symbol} · đang lỗ ${pct}`}</div>

      <p className="cap2-alert-body">
        {`Bạn đang mua thêm ${symbol} khi vị thế hiện tại còn lỗ. Mua thêm để "bình quân giá xuống" làm khoản lỗ lớn thêm nếu bạn sai — và làm đứt chuỗi lệnh kỷ luật.`}
      </p>

      {level === "typeToConfirm" && (
        <label className="cap2-alert-typebox">
          <span>{`Bạn đã bỏ qua cảnh báo này nhiều lần. Gõ "${CONFIRM_PHRASE}" để tiếp tục:`}</span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="cap2-nhoilenh-input"
            aria-label={`Gõ ${CONFIRM_PHRASE} để tiếp tục`}
          />
        </label>
      )}

      <div className="cap2-alert-actions">
        <button
          type="button"
          className="cap2-alert-btn cap2-alert-btn--primary"
          onClick={onCancel}
          data-testid="cap2-nhoilenh-cancel"
        >
          Huỷ — không mua thêm
        </button>
        <button
          type="button"
          className="cap2-alert-btn"
          onClick={onConfirm}
          disabled={confirmDisabled}
          data-testid="cap2-nhoilenh-confirm"
        >
          {blockedByTimer ? `Vẫn mua thêm (${secondsLeft}s)` : "Vẫn mua thêm"}
        </button>
      </div>
    </div>
  )
}
