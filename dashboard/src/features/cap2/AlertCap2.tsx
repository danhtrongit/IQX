import { useEffect, useState } from "react"
import { cn } from "@/shared/lib/cn"
import { trackJourneyEvent } from "@/shared/analytics/journey"
import { GREYED_CONFIRM_SECONDS, type AlertLevel } from "./alertRate"
import "./cap2-alerts.css"

/**
 * Cấp 2 «Kỷ luật» — 2 cảnh báo (spec §8 chạm cắt lỗ · §9 nhồi lệnh khi lỗ).
 *
 * Cả 2 đều **thuần trình bày** (props-driven). Backend phát hiện thời điểm,
 * áp quota/auto-mute/escalation và trả quyết định qua alert API authoritative.
 *
 * Nguyên tắc §C8: hệ thống **KHÔNG tự bán** và **không chặn cứng** — cảnh báo
 * chỉ soi gương + làm chậm lại; user luôn có đường huỷ.
 */

const VND = (n: number) => Math.round(n).toLocaleString("en-US")
const viDate = (value: string | null | undefined): string | null => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(parsed)
}

export interface ChamCatLoBannerProps {
  orderId?: string
  symbol: string
  /** Ngưỡng cắt lỗ user đã cam kết lúc mua. */
  catLo: number
  giaHienTai: number
  lossPct?: number | null
  positionQuantity?: number | null
  planStartedAt?: string | null
  /**
   * Số phiên đã giữ TIẾP dù giá đã chạm ngưỡng cắt lỗ. `0` = vừa chạm trong
   * phiên hôm nay (bản cuối phiên); `≥1` = đã sang (các) phiên sau mà vẫn giữ.
   */
  phienGiuQuaNguong: number
  variant?: "cuoi_phien" | "phien_ke"
  /** Confirmation friction returned by the durable server state machine. */
  level?: AlertLevel
  sellActionLabel?: string
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
  orderId,
  symbol,
  catLo,
  giaHienTai,
  lossPct,
  positionQuantity,
  planStartedAt,
  phienGiuQuaNguong,
  variant = "cuoi_phien",
  level = "thuong",
  sellActionLabel = "Bán ATO — theo kế hoạch",
  onBan,
  onGiuTiep,
}: ChamCatLoBannerProps) {
  const severe = phienGiuQuaNguong >= 4
  const [secondsLeft, setSecondsLeft] = useState(
    level === "greyed5s" ? GREYED_CONFIRM_SECONDS : 0,
  )
  const [typed, setTyped] = useState("")

  useEffect(() => {
    if (level !== "greyed5s") return
    const timer = setInterval(() => {
      setSecondsLeft((seconds) => (seconds <= 1 ? 0 : seconds - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [level])

  useEffect(() => {
    trackJourneyEvent("cap2_cham_SL_alert_shown", {
      order_id: orderId ?? null,
      phien: phienGiuQuaNguong,
    })
    if (level !== "thuong") {
      trackJourneyEvent("cap2_alert_escalation", { loai: "cham_cat_lo", level })
    }
  }, [level, orderId, phienGiuQuaNguong])

  const handleBan = () => {
    trackJourneyEvent("cap2_cham_SL_alert_action", { order_id: orderId ?? null, action: "ban" })
    onBan?.()
  }
  const handleGiuTiep = () => {
    trackJourneyEvent("cap2_cham_SL_alert_action", {
      order_id: orderId ?? null,
      action: "giu_tiep",
    })
    onGiuTiep?.()
  }
  const blockedByTimer = level === "greyed5s" && secondsLeft > 0
  const blockedByPhrase = level === "typeToConfirm" && typed.trim() !== CONFIRM_PHRASE
  const planDate = viDate(planStartedAt)
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

      {(positionQuantity || lossPct != null || planDate) && (
        <dl className="cap2-alert-details tabular-nums">
          {(positionQuantity || lossPct != null) && (
            <div>
              <dt>Vị thế hiện tại</dt>
              <dd>
                {`${positionQuantity ? `${positionQuantity.toLocaleString("en-US")} CP` : "—"}${lossPct != null ? ` · ${lossPct < 0 ? "−" : "+"}${Math.abs(lossPct).toFixed(1)}%` : ""}`}
              </dd>
            </div>
          )}
          {planDate && (
            <div>
              <dt>{`Kế hoạch ban đầu (từ ${planDate})`}</dt>
              <dd>{`Cắt lỗ tại ${VND(catLo)}`}</dd>
            </div>
          )}
        </dl>
      )}

      <p className="cap2-alert-body">{chamCatLoMessage(phienGiuQuaNguong, symbol)}</p>

      {level === "typeToConfirm" && (
        <label className="cap2-alert-typebox">
          <span>{`Bạn đã bỏ qua cảnh báo này nhiều lần. Gõ "${CONFIRM_PHRASE}" để giữ tiếp:`}</span>
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="cap2-chamsl-input"
            aria-label={`Gõ ${CONFIRM_PHRASE} để giữ tiếp`}
          />
        </label>
      )}

      <div className="cap2-alert-actions">
        <button type="button" className="cap2-alert-btn cap2-alert-btn--primary" onClick={handleBan}>
          {sellActionLabel}
        </button>
        <button
          type="button"
          className="cap2-alert-btn"
          onClick={handleGiuTiep}
          disabled={blockedByTimer || blockedByPhrase}
          data-testid="cap2-chamsl-hold"
        >
          {blockedByTimer ? `Giữ tiếp (${secondsLeft}s)` : "Giữ tiếp"}
        </button>
      </div>
    </div>
  )
}

export interface NhoiLenhWarningProps {
  symbol: string
  /** Lãi/lỗ hiện tại của vị thế đang giữ (âm — spec §9 chỉ bắn khi lỗ >−3%). */
  pnlPct: number
  /** Mức xác nhận đã được backend quyết định (spec §10). */
  level: AlertLevel
  positionQuantity?: number | null
  positionAvgCost?: number | null
  intendedQuantity?: number | null
  intendedPrice?: number | null
  catLo?: number | null
  onCancel: () => void
  onConfirm: () => void
}

const CONFIRM_PHRASE = "Tôi hiểu"

/** spec §9 — cảnh báo tức thời khi mua thêm một mã đang lỗ. */
export function NhoiLenhWarning({
  symbol,
  pnlPct,
  level,
  positionQuantity,
  positionAvgCost,
  intendedQuantity,
  intendedPrice,
  catLo,
  onCancel,
  onConfirm,
}: NhoiLenhWarningProps) {
  const [secondsLeft, setSecondsLeft] = useState(
    level === "greyed5s" ? GREYED_CONFIRM_SECONDS : 0,
  )
  const [typed, setTyped] = useState("")

  useEffect(() => {
    if (level !== "greyed5s") return
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [level])

  useEffect(() => {
    trackJourneyEvent("cap2_nhoi_lenh_alert_shown", { ma: symbol, pnl: pnlPct })
    if (level !== "thuong") {
      trackJourneyEvent("cap2_alert_escalation", { loai: "nhoi_lenh", level })
    }
  }, [level, pnlPct, symbol])

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

      {(positionQuantity || positionAvgCost || intendedQuantity || intendedPrice || catLo) && (
        <dl className="cap2-alert-details tabular-nums">
          {(positionQuantity || positionAvgCost) && (
            <div>
              <dt>Vị thế hiện tại</dt>
              <dd>
                {`${positionQuantity ? `${positionQuantity.toLocaleString("en-US")} CP` : "—"} · giá vốn ${positionAvgCost ? VND(positionAvgCost) : "—"}`}
              </dd>
            </div>
          )}
          {(intendedQuantity || intendedPrice) && (
            <div>
              <dt>Bạn định mua thêm</dt>
              <dd>
                {`${intendedQuantity ? `${intendedQuantity.toLocaleString("en-US")} CP` : "—"} · giá ${intendedPrice ? VND(intendedPrice) : "—"}`}
              </dd>
            </div>
          )}
          {catLo != null && catLo > 0 && (
            <div>
              <dt>Cắt lỗ kế hoạch</dt>
              <dd>{VND(catLo)}</dd>
            </div>
          )}
        </dl>
      )}

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
          onClick={() => {
            trackJourneyEvent("cap2_nhoi_lenh_alert_action", { ma: symbol, action: "huy" })
            onCancel()
          }}
          data-testid="cap2-nhoilenh-cancel"
        >
          Huỷ — không mua thêm
        </button>
        <button
          type="button"
          className="cap2-alert-btn"
          onClick={() => {
            trackJourneyEvent("cap2_nhoi_lenh_alert_action", { ma: symbol, action: "van_mua" })
            onConfirm()
          }}
          disabled={confirmDisabled}
          data-testid="cap2-nhoilenh-confirm"
        >
          {blockedByTimer ? `Vẫn mua thêm (${secondsLeft}s)` : "Vẫn mua thêm"}
        </button>
      </div>
    </div>
  )
}
