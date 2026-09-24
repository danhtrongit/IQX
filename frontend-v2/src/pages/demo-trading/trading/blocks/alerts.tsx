/**
 * Cấp 2's two durable warnings, rendered from the SERVER's alert rows.
 *
 * Both are presentation only: the backend decides when an alert fires, applies
 * the per-session quota / auto-mute / escalation, and stores the decision.
 * Neither ever sells on its own ("hệ thống KHÔNG tự bán") — the user always has
 * a way out, and holding too long is recorded as the violation it is.
 */
import { TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Cap2Alert } from "../use-plan-data"
import type { AlertLevel } from "../plan-math"
import { fmtVnd } from "../plan-math"

const CONFIRM_PHRASE = "Tôi hiểu"
const GREYED_CONFIRM_SECONDS = 5

export function alertLevelOf(alert: Cap2Alert): AlertLevel {
  if (alert.escalation === "delay_5s") return "greyed5s"
  if (alert.escalation === "type_phrase") return "typeToConfirm"
  return "thuong"
}

/** A 5-second hold-off / type-the-phrase gate, exactly as the server asked. */
function useConfirmFriction(level: AlertLevel) {
  const [secondsLeft, setSecondsLeft] = useState(level === "greyed5s" ? GREYED_CONFIRM_SECONDS : 0)
  const [typed, setTyped] = useState("")
  useEffect(() => {
    if (level !== "greyed5s") return
    const timer = setInterval(() => {
      setSecondsLeft((seconds) => (seconds <= 1 ? 0 : seconds - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [level])
  return {
    secondsLeft,
    typed,
    setTyped,
    blocked: (level === "greyed5s" && secondsLeft > 0) || (level === "typeToConfirm" && typed.trim() !== CONFIRM_PHRASE),
  }
}

/** spec §8 — the end-of-session "price touched your stop, you haven't sold" banner. */
export function StopLossBanner({
  alert,
  phienGiuQuaNguong,
  pending,
  onSellAto,
  onHold,
}: {
  alert: Cap2Alert
  phienGiuQuaNguong: number
  pending: boolean
  onSellAto: () => void
  onHold: (phrase?: string) => void
}) {
  const level = alertLevelOf(alert)
  const { secondsLeft, typed, setTyped, blocked } = useConfirmFriction(level)
  const variant = alert.priority === "next_session" ? "phien_ke" : "cuoi_phien"

  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-price-ceiling/50 bg-price-ceiling/10 p-3 text-sm"
      data-testid="cap2-alert-chamsl"
    >
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4 shrink-0" />
        {variant === "cuoi_phien"
          ? "Cuối phiên — giá đã chạm ngưỡng cắt lỗ"
          : "Đầu phiên — vẫn chưa bán dù đã chạm cắt lỗ"}
      </p>

      <p className="tabular-nums text-xs">
        {alert.symbol} · ngưỡng cắt lỗ {alert.threshold_price_vnd == null ? "—" : fmtVnd(alert.threshold_price_vnd)} ·
        giá hiện tại {fmtVnd(alert.observed_price_vnd)}
      </p>
      {(alert.position_quantity != null || alert.loss_pct != null) && (
        <p className="tabular-nums text-xs text-muted-foreground">
          Vị thế hiện tại: {alert.position_quantity == null ? "—" : `${alert.position_quantity.toLocaleString("vi-VN")} CP`}
          {alert.loss_pct == null
            ? ""
            : ` · ${alert.loss_pct < 0 ? "−" : "+"}${Math.abs(alert.loss_pct).toFixed(1)}%`}
        </p>
      )}

      <p className="text-xs">{stopLossMessage(phienGiuQuaNguong, alert.symbol)}</p>

      {level === "typeToConfirm" && (
        <label className="block space-y-1 text-xs">
          <span>Bạn đã bỏ qua cảnh báo này nhiều lần. Gõ “{CONFIRM_PHRASE}” để giữ tiếp:</span>
          <Input value={typed} onChange={(event) => setTyped(event.target.value)} aria-label={`Gõ ${CONFIRM_PHRASE} để giữ tiếp`} />
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSellAto}>
          Bán ATO — theo kế hoạch
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || blocked}
          onClick={() => onHold(typed.trim() === CONFIRM_PHRASE ? CONFIRM_PHRASE : undefined)}
          data-testid="cap2-chamsl-hold"
        >
          {level === "greyed5s" && secondsLeft > 0 ? `Giữ tiếp (${secondsLeft}s)` : "Giữ tiếp"}
        </Button>
      </div>
    </div>
  )
}

/** Escalating copy for holding past a touched stop (spec §8). */
export function stopLossMessage(phienGiuQuaNguong: number, symbol: string): string {
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

/** spec §9 — the pre-buy "you're buying more of a losing position" stop. */
export function NhoiLenhDialog({
  alert,
  intendedQuantity,
  intendedPrice,
  pending,
  onCancel,
  onProceed,
}: {
  alert: Cap2Alert
  intendedQuantity: number
  intendedPrice: number
  pending: boolean
  onCancel: () => void
  onProceed: (phrase?: string) => void
}) {
  const level = alertLevelOf(alert)
  const { secondsLeft, typed, setTyped, blocked } = useConfirmFriction(level)
  const pnlPct = alert.loss_pct ?? 0

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="sm:max-w-md" data-testid="cap2-alert-nhoilenh">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-price-ceiling" /> Mua thêm một mã đang lỗ
          </DialogTitle>
          <DialogDescription className="tabular-nums">
            {alert.symbol} · đang lỗ {`${pnlPct < 0 ? "−" : ""}${Math.abs(Math.round(pnlPct * 10) / 10).toFixed(1)}%`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-xs">
          {alert.position_quantity != null && (
            <p className="tabular-nums">
              Vị thế hiện tại: {alert.position_quantity.toLocaleString("vi-VN")} CP · giá vốn{" "}
              {alert.position_avg_cost_vnd == null ? "—" : fmtVnd(alert.position_avg_cost_vnd)}
            </p>
          )}
          <p className="tabular-nums">
            Bạn định mua thêm: {intendedQuantity.toLocaleString("vi-VN")} CP · giá {fmtVnd(intendedPrice)}
          </p>
          {alert.threshold_price_vnd != null && (
            <p className="tabular-nums">Cắt lỗ kế hoạch: {fmtVnd(alert.threshold_price_vnd)}</p>
          )}
        </div>

        <p className="text-sm">
          Bạn đang mua thêm {alert.symbol} khi vị thế hiện tại còn lỗ. Mua thêm để "bình quân giá xuống"
          làm khoản lỗ lớn thêm nếu bạn sai — và làm đứt chuỗi lệnh kỷ luật.
        </p>

        {level === "typeToConfirm" && (
          <label className="block space-y-1 text-xs">
            <span>Bạn đã bỏ qua cảnh báo này nhiều lần. Gõ “{CONFIRM_PHRASE}” để tiếp tục:</span>
            <Input value={typed} onChange={(event) => setTyped(event.target.value)} aria-label={`Gõ ${CONFIRM_PHRASE} để tiếp tục`} />
          </label>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Huỷ lệnh này
          </Button>
          <Button
            type="button"
            disabled={pending || blocked}
            onClick={() => onProceed(typed.trim() === CONFIRM_PHRASE ? CONFIRM_PHRASE : undefined)}
          >
            {level === "greyed5s" && secondsLeft > 0 ? `Vẫn mua thêm (${secondsLeft}s)` : "Vẫn mua thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
