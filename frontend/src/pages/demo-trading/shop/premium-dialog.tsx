/**
 * Premium mua bằng xu (spec 1.2): 3.000 xu cho 30 ngày, cộng vào thời hạn Premium hiện có.
 *
 * - Mở hộp thoại không tốn xu; một idempotency key được tạo khi mở và dùng lại cho mọi lần
 *   thử lại của cùng một xác nhận.
 * - Giá và số ngày đến từ server (`premium_price_xu`, `premium_duration_days`); client chỉ gửi
 *   giá đã xem để server phát hiện giá đã đổi (PRICE_CHANGED).
 * - Server từ chối khi chưa đủ xu, khi đã đổi Premium trong 30 ngày gần nhất
 *   (PREMIUM_PURCHASE_LIMIT) hoặc khi tài khoản chưa xác thực số điện thoại.
 */
import { useRef, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { classifyPurchaseError } from "./shop-api"
import { SHOP_COPY, formatXu, newIdempotencyKey, shopFailureMessage } from "./shop-model"
import { COIN_TEXT } from "./shop-ui"
import { useReturnFocus } from "./use-return-focus"
import { usePurchasePremium, useShopState } from "./use-shop"

function BreakdownRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

export function PremiumPurchaseDialog({ onClose, onEnterAcademy }: {
  onClose: () => void
  onEnterAcademy: () => void
}) {
  const shop = useShopState()
  const premium = usePurchasePremium()
  const [phase, setPhase] = useState<"confirm" | "pending" | "done">("confirm")
  const [notice, setNotice] = useState<string | null>(null)
  const [granted, setGranted] = useState<{ days: number; endsAt: string } | null>(null)
  const [openedKey] = useState(newIdempotencyKey)
  const attempt = useRef({ key: openedKey, signature: "" })
  const restoreFocus = useReturnFocus(true)

  const state = shop.data
  const price = state?.premium_price_xu ?? 0
  const days = state?.premium_duration_days ?? 0
  const balance = state?.wallet.balance ?? 0
  const affordable = !!state && balance >= price
  const locked = phase === "pending"

  async function submit() {
    if (!state || locked) return
    const signature = `${price}|${days}`
    if (attempt.current.signature !== signature) attempt.current = { key: newIdempotencyKey(), signature }
    setPhase("pending")
    try {
      const result = await premium.purchase({
        expected_price_xu: price,
        idempotency_key: attempt.current.key,
      })
      premium.refresh()
      setGranted({ days: result.days_granted, endsAt: result.ends_at })
      setPhase("done")
    } catch (error) {
      const failure = classifyPurchaseError(error)
      premium.refresh()
      setPhase("confirm")
      setNotice(shopFailureMessage(failure))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !locked) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-[440px]"
        data-testid="premium-dialog"
        onCloseAutoFocus={restoreFocus}
        onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }}
        onInteractOutside={(event) => { if (locked) event.preventDefault() }}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-base font-bold">
            {phase === "done" ? "Đã cộng Premium" : `${SHOP_COPY.premiumBuy} bằng xu`}
          </DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" disabled={locked} onClick={onClose} className="-mt-1 -mr-1">
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Xác nhận đổi xu lấy Premium. Premium mua bằng xu cộng thêm thời hạn vào Premium hiện có.
        </DialogDescription>

        {phase === "done" && granted ? (
          <div role="status" className="space-y-2">
            <p className="text-sm leading-6 text-foreground">
              {`Đã cộng ${granted.days} ngày Premium. Thời hạn Premium mới đến ${new Date(granted.endsAt).toLocaleDateString("vi-VN")}.`}
            </p>
            <p className="text-xs text-muted-foreground">Số dư xu đã được trừ. Không có ảnh hưởng nào tới tiến độ Học viện.</p>
          </div>
        ) : (
          <>
            <dl className="divide-y divide-border rounded-lg border border-border bg-background/40 px-3.5">
              <BreakdownRow label="Giá Premium">
                <span className={COIN_TEXT}>{state ? `${formatXu(price)} xu` : "—"}</span>
              </BreakdownRow>
              <BreakdownRow label="Thời hạn">{state ? `${days} ngày` : "—"}</BreakdownRow>
              <BreakdownRow label="Số dư hiện tại">{state ? `${formatXu(balance)} xu` : "—"}</BreakdownRow>
              <BreakdownRow label="Số dư sau khi mua">
                {state && affordable ? `${formatXu(balance - price)} xu` : "—"}
              </BreakdownRow>
            </dl>

            <p className="text-xs leading-5 text-muted-foreground">
              Premium mua bằng xu cộng thêm {state ? days : 0} ngày vào thời hạn Premium hiện có; chưa có Premium thì bắt đầu từ lúc mua. Mỗi tài khoản chỉ đổi được một lần trong mỗi chu kỳ 30 ngày.
            </p>

            <div className="space-y-2 empty:hidden" aria-live="polite">
              {notice && <p role="alert" className="text-xs leading-relaxed text-destructive">{notice}</p>}
              {phase === "confirm" && !notice && state && !affordable && (
                <p role="alert" className="text-xs leading-relaxed text-destructive">
                  {`Chưa đủ xu: bạn có ${formatXu(balance)} xu, cần ${formatXu(price)} xu.`}
                </p>
              )}
              {phase === "confirm" && !state && (
                <p role="alert" className="text-xs leading-relaxed text-destructive">Chưa tải được số dư xu. Hãy đóng và thử lại.</p>
              )}
              {phase === "pending" && (
                <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Đang mua Premium…
                </p>
              )}
            </div>

            <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end")}>
              <Button type="button" variant="outline" disabled={locked} onClick={onClose}>Hủy</Button>
              <Button
                type="button"
                disabled={locked || !state || !affordable}
                onClick={() => void submit()}
                aria-busy={locked || undefined}
              >
                {locked ? "Đang mua…" : `${SHOP_COPY.premiumBuy} · ${formatXu(price)} xu`}
              </Button>
            </div>
            {phase === "confirm" && state && !affordable && (
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => { onClose(); onEnterAcademy() }}>
                {SHOP_COPY.enterAcademy}
              </Button>
            )}
          </>
        )}

        {phase === "done" && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
