/**
 * Đổi xu hai chiều với tiền Demo Trading (spec 1.3): 1 xu = 10.000 đồng.
 *
 * - Xu sang tiền: đổi theo số xu nguyên, tiền vào ngay phần tiền mặt của tài khoản Demo.
 * - Tiền sang xu: chỉ đổi từ tiền mặt, số tiền phải là bội số của tỷ giá và không dưới mức
 *   tối thiểu mà server nêu.
 * - Mỗi lần đổi dùng một idempotency key nên thử lại cùng một xác nhận không bị trừ hai lần.
 */
import { useMemo, useRef, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTradingAccount } from "@/hooks/use-trading"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { classifyPurchaseError } from "./shop-api"
import { SHOP_COPY, formatXu, newIdempotencyKey, shopFailureMessage } from "./shop-model"
import { COIN_TEXT } from "./shop-ui"
import { useReturnFocus } from "./use-return-focus"
import { useExchangeDemo, useShopState } from "./use-shop"

function BreakdownRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

export function DemoExchangeDialog({ onClose, onEnterAcademy }: {
  onClose: () => void
  onEnterAcademy: () => void
}) {
  const shop = useShopState()
  const account = useTradingAccount()
  const exchange = useExchangeDemo()
  const [direction, setDirection] = useState<"xu_to_cash" | "cash_to_xu">("xu_to_cash")
  const [amount, setAmount] = useState("")
  const [phase, setPhase] = useState<"confirm" | "pending" | "done">("confirm")
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<{ xu: number; cash: number } | null>(null)
  const [openedKey] = useState(newIdempotencyKey)
  const attempt = useRef({ key: openedKey, signature: "" })
  const restoreFocus = useReturnFocus(true)

  const state = shop.data
  const rate = state?.exchange.cash_per_xu ?? 0
  const minCash = state?.exchange.min_exchange_cash_vnd ?? 0
  const balance = state?.wallet.balance ?? 0
  const cash = account.data?.cash_available_vnd ?? null
  const locked = phase === "pending"

  const parsed = Number.parseInt(amount, 10)
  const valid = Number.isInteger(parsed) && parsed > 0
  const preview = useMemo(() => {
    if (!valid || rate <= 0) return null
    if (direction === "xu_to_cash") {
      return { xuDelta: -parsed, cashDelta: parsed * rate, xuAfter: balance - parsed, cashAfter: cash == null ? null : cash + parsed * rate }
    }
    if (parsed % rate !== 0) return null
    return { xuDelta: parsed / rate, cashDelta: -parsed, xuAfter: balance + parsed / rate, cashAfter: cash == null ? null : cash - parsed }
  }, [valid, direction, parsed, rate, balance, cash])

  const problem = !valid
    ? null
    : direction === "xu_to_cash"
      ? parsed > balance
        ? `Chưa đủ xu: bạn có ${formatXu(balance)} xu, cần ${formatXu(parsed)} xu.`
        : null
      : parsed % rate !== 0
        ? `Số tiền đổi phải là bội số của ${formatXu(rate)} đồng.`
        : parsed < minCash
          ? `Số tiền đổi tối thiểu là ${formatXu(minCash)} đồng.`
          : cash != null && parsed > cash
            ? `Không đủ tiền mặt: bạn có ${formatXu(cash)} đồng, cần ${formatXu(parsed)} đồng.`
            : null

  async function submit() {
    if (!state || !valid || !preview || problem || locked) return
    const signature = `${direction}|${parsed}`
    if (attempt.current.signature !== signature) attempt.current = { key: newIdempotencyKey(), signature }
    setPhase("pending")
    try {
      const exchanged = await exchange.exchange({
        direction,
        amount: parsed,
        idempotency_key: attempt.current.key,
      })
      exchange.refresh()
      setResult({ xu: exchanged.balance_xu, cash: exchanged.cash_available_vnd })
      setPhase("done")
    } catch (error) {
      const failure = classifyPurchaseError(error)
      exchange.refresh()
      setPhase("confirm")
      setNotice(shopFailureMessage(failure))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !locked) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-[440px]"
        data-testid="exchange-dialog"
        onCloseAutoFocus={restoreFocus}
        onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }}
        onInteractOutside={(event) => { if (locked) event.preventDefault() }}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-base font-bold">{SHOP_COPY.exchangeTitle}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" disabled={locked} onClick={onClose} className="-mt-1 -mr-1">
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Đổi xu học tập hai chiều với tiền mặt của tài khoản Demo Trading, một xu bằng mười nghìn đồng.
        </DialogDescription>

        {phase === "done" && result ? (
          <div role="status" className="space-y-2">
            <p className="text-sm leading-6 text-foreground">
              {direction === "xu_to_cash"
                ? `Đã đổi ${formatXu(Math.abs(result.xu - balance))} xu thành tiền Demo.`
                : "Đã đổi tiền Demo thành xu."}
            </p>
            <p className="text-xs text-muted-foreground">
              {`Số dư xu hiện tại ${formatXu(result.xu)} xu. Tiền mặt Demo hiện tại ${formatMoney(result.cash)} đồng.`}
            </p>
          </div>
        ) : (
          <>
            <Tabs value={direction} onValueChange={(value) => { setDirection(value === "cash_to_xu" ? "cash_to_xu" : "xu_to_cash"); setAmount(""); setNotice(null) }}>
              <TabsList aria-label="Chiều đổi xu" className="h-9">
                <TabsTrigger value="xu_to_cash" className="px-3 text-xs">Xu → tiền Demo</TabsTrigger>
                <TabsTrigger value="cash_to_xu" className="px-3 text-xs">Tiền Demo → xu</TabsTrigger>
              </TabsList>
            </Tabs>

            <p className="text-xs text-muted-foreground" data-testid="exchange-rate">
              {state ? `Tỷ giá: 1 xu = ${formatXu(rate)} đồng. Tiền sang xu chỉ đổi được số tiền là bội số của ${formatXu(rate)} đồng.` : "Đang tải tỷ giá…"}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="exchange-amount" className="text-xs">
                {direction === "xu_to_cash" ? "Số xu muốn đổi ra tiền" : "Số tiền Demo muốn đổi thành xu"}
              </Label>
              <Input
                id="exchange-amount"
                type="number"
                inputMode="numeric"
                min={direction === "xu_to_cash" ? 1 : minCash}
                step={direction === "xu_to_cash" ? 1 : rate}
                value={amount}
                disabled={locked || !state}
                onChange={(event) => { setAmount(event.target.value); setNotice(null) }}
                placeholder={direction === "xu_to_cash" ? "100" : String(rate || 10000)}
                className="tabular-nums"
              />
            </div>

            <dl className="divide-y divide-border rounded-lg border border-border bg-background/40 px-3.5">
              <BreakdownRow label="Số dư xu hiện tại">
                <span className={COIN_TEXT}>{state ? `${formatXu(balance)} xu` : "—"}</span>
              </BreakdownRow>
              <BreakdownRow label="Số dư xu sau khi đổi">
                {preview ? `${formatXu(preview.xuAfter)} xu` : "—"}
              </BreakdownRow>
              <BreakdownRow label="Tiền mặt Demo hiện tại">{cash == null ? "—" : formatMoney(cash)}</BreakdownRow>
              <BreakdownRow label="Tiền mặt Demo sau khi đổi">
                {preview && preview.cashAfter != null ? formatMoney(preview.cashAfter) : "—"}
              </BreakdownRow>
            </dl>

            <div className="space-y-2 empty:hidden" aria-live="polite">
              {notice && <p role="alert" className="text-xs leading-relaxed text-destructive">{notice}</p>}
              {phase === "confirm" && !notice && problem && (
                <p role="alert" className="text-xs leading-relaxed text-destructive">{problem}</p>
              )}
              {phase === "confirm" && !notice && !state && (
                <p role="alert" className="text-xs leading-relaxed text-destructive">Chưa tải được số dư xu. Hãy đóng và thử lại.</p>
              )}
              {phase === "pending" && (
                <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Đang đổi xu…
                </p>
              )}
            </div>

            <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end")}>
              <Button type="button" variant="outline" disabled={locked} onClick={onClose}>Hủy</Button>
              <Button
                type="button"
                disabled={locked || !state || !valid || !preview || problem != null}
                onClick={() => void submit()}
                aria-busy={locked || undefined}
              >
                {locked ? "Đang đổi…" : direction === "xu_to_cash" ? `Đổi · ${formatXu(parsed || 0)} xu` : `Đổi · ${formatMoney(parsed || 0)}`}
              </Button>
            </div>
            {phase === "confirm" && direction === "xu_to_cash" && state && balance === 0 && (
              <>
                <p className="text-xs leading-5 text-muted-foreground">
                  Bạn chưa có xu nào để đổi. Học bài ở Học viện để nhận xu, rồi đổi sang tiền Demo.
                </p>
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => { onClose(); onEnterAcademy() }}>
                  {SHOP_COPY.enterAcademy}
                </Button>
              </>
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
