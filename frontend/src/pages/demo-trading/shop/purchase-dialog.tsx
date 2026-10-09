/**
 * Purchase confirmation (Shop spec 6.1 - 6.3).
 *
 * - Opening the dialog spends nothing; one idempotency key is created when it opens
 *   and is reused for every retry of the same confirmation.
 * - The confirm button is locked while the request is in flight and the dialog
 *   cannot be dismissed then, so the outcome is always shown.
 * - A timeout, a network error or a server fault is "outcome unknown": the dialog
 *   looks the key up (`GET /shop/purchases/:key`) and only offers another attempt
 *   once the server said the purchase does not exist.
 * - A changed price or catalog refreshes the Shop state and asks for a new
 *   confirmation; it never charges a price the user has not seen.
 * - Buying never switches the active mascot; "Sử dụng" is a separate, explicit step.
 */
import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { MascotArt } from "./mascot-art"
import {
  classifyPurchaseError,
  fetchPurchaseStatus,
  postPurchase,
  type CatalogEntry,
  type ShopState,
} from "./shop-api"
import {
  CATALOG_CHANGED_MESSAGE,
  SHOP_COPY,
  SHOP_QUERY_ROOT,
  WORKSPACE_STATE_KEY,
  findEntry,
  formatXu,
  insufficientMessage,
  newIdempotencyKey,
  priceChangedMessage,
  shopKeys,
} from "./shop-model"
import { COIN_TEXT } from "./shop-ui"
import { useReturnFocus } from "./use-return-focus"
import { useActivateMascot, useShopState } from "./use-shop"

type Phase =
  | { kind: "confirm"; notice: string | null }
  | { kind: "pending" }
  | { kind: "verifying" }
  | { kind: "unverified" }
  | { kind: "retry" }
  | { kind: "blocked"; message: string; canLearn: boolean }
  | { kind: "done"; status: "purchased" | "already_owned"; balanceAfter: number }

type Attempt = { key: string; signature: string }

function BreakdownRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

function Breakdown({ children }: { children: React.ReactNode }) {
  return <dl className="divide-y divide-border rounded-lg border border-border bg-background/40 px-3.5">{children}</dl>
}

export function PurchaseDialog({ mascotId, onClose, onEnterAcademy }: {
  mascotId: string
  onClose: () => void
  onEnterAcademy: () => void
}) {
  const { user } = useAuth()
  const userId = user?.id ?? ""
  const queryClient = useQueryClient()
  const shop = useShopState()
  const activation = useActivateMascot()
  const [phase, setPhase] = useState<Phase>({ kind: "confirm", notice: null })
  const [useError, setUseError] = useState<string | null>(null)
  const [openedKey] = useState(newIdempotencyKey)
  const attempt = useRef<Attempt>({ key: openedKey, signature: "" })
  const cancelRef = useRef<HTMLButtonElement>(null)
  const submitted = useRef(false)
  const restoreFocus = useReturnFocus(true, () => document.querySelector<HTMLElement>(`[data-shop-card="${mascotId}"]`))

  const state: ShopState | undefined = shop.data
  const entry: CatalogEntry | undefined = state ? findEntry(state, mascotId) : undefined
  const name = entry?.name ?? "linh thú"
  const price = entry?.price_xu ?? 0
  const balance = state?.wallet.balance ?? 0
  const affordable = !!state && balance >= price
  const locked = phase.kind === "pending" || phase.kind === "verifying"
  const alreadyActive = state?.active.mascot_id === mascotId

  function refreshShop() {
    return queryClient.refetchQueries({ queryKey: shopKeys.state(userId) }).catch(() => undefined)
  }

  function purchaseCommitted() {
    void queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT })
    void queryClient.invalidateQueries({ queryKey: WORKSPACE_STATE_KEY })
  }

  /** The same key while the confirmed values are unchanged; a new confirmation gets a new key. */
  function keyFor(signature: string): string {
    const current = attempt.current
    if (current.signature && current.signature !== signature) attempt.current = { key: newIdempotencyKey(), signature }
    else attempt.current = { key: current.key, signature }
    return attempt.current.key
  }

  async function verify(key: string) {
    setPhase({ kind: "verifying" })
    try {
      const status = await fetchPurchaseStatus(key)
      if (status.status === "completed") {
        purchaseCommitted()
        setPhase({ kind: "done", status: "purchased", balanceAfter: status.wallet.balance })
      } else {
        setPhase({ kind: "retry" })
      }
    } catch {
      setPhase({ kind: "unverified" })
    }
  }

  async function submit() {
    if (!state || !entry || locked) return
    const body = { mascot_id: entry.mascot_id, expected_price_xu: entry.price_xu, catalog_version: state.catalog_version }
    const key = keyFor(`${body.mascot_id}|${body.expected_price_xu}|${body.catalog_version}`)
    submitted.current = true
    setPhase({ kind: "pending" })
    try {
      const result = await postPurchase({ ...body, idempotency_key: key })
      purchaseCommitted()
      setPhase({ kind: "done", status: result.status, balanceAfter: result.wallet.balance })
    } catch (error) {
      const failure = classifyPurchaseError(error)
      switch (failure.kind) {
        case "unknown_outcome":
          await verify(key)
          return
        case "insufficient":
          await refreshShop()
          setPhase({
            kind: "blocked",
            message: insufficientMessage(failure.balance ?? queryClient.getQueryData<ShopState>(shopKeys.state(userId))?.wallet.balance ?? null, failure.price ?? price),
            canLearn: true,
          })
          return
        case "price_changed":
          await refreshShop()
          setPhase({ kind: "confirm", notice: priceChangedMessage(failure.currentPrice) })
          return
        case "catalog_changed":
          await refreshShop()
          setPhase({ kind: "confirm", notice: CATALOG_CHANGED_MESSAGE })
          return
        case "not_for_sale":
          await refreshShop()
          setPhase({ kind: "blocked", message: `${name} hiện không bán.`, canLearn: false })
          return
        case "key_reused":
          attempt.current = { key: newIdempotencyKey(), signature: "" }
          setPhase({ kind: "confirm", notice: "Yêu cầu trước chưa hoàn tất. Vui lòng xác nhận lại." })
          return
        default:
          await refreshShop()
          setPhase({ kind: "confirm", notice: failure.message })
      }
    }
  }

  /** After any attempt the server may know more than this screen (a lost response), so reread before leaving. */
  function close() {
    if (submitted.current) void queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT })
    onClose()
  }

  async function activateNow() {
    if (!entry) return
    setUseError(null)
    const outcome = await activation.activate(entry)
    if (outcome.ok) close()
    else setUseError(outcome.message)
  }

  const title = phase.kind === "done" ? `Đã sở hữu ${name}` : "Mua linh thú"

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !locked) close() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-[480px]"
        data-testid="purchase-dialog"
        onCloseAutoFocus={restoreFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }}
        onInteractOutside={(event) => { if (locked) event.preventDefault() }}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" disabled={locked} onClick={close} className="-mt-1 -mr-1">
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          {phase.kind === "done" ? "Giao dịch mua linh thú đã hoàn tất." : "Xác nhận mua một linh thú bằng xu học tập. Mua không tự đổi linh thú đang sử dụng."}
        </DialogDescription>

        <MascotArt
          mascotId={mascotId}
          name={name}
          showReload={false}
          className="mx-auto h-[170px] w-[150px] rounded-lg bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_70%)] max-[650px]:h-[150px]"
        />
        <div className="text-center">
          <h3 className="font-heading text-lg font-bold">{name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {phase.kind === "done"
              ? phase.status === "already_owned" ? SHOP_COPY.alreadyOwnedNoCharge : "Đã thêm vào bộ sưu tập của bạn."
              : "Mua một lần, đổi sử dụng miễn phí."}
          </p>
        </div>

        {phase.kind === "done" ? (
          <div role="status">
            <Breakdown>
              <BreakdownRow label="Xu còn lại"><span className={COIN_TEXT}>{formatXu(phase.balanceAfter)} xu</span></BreakdownRow>
            </Breakdown>
          </div>
        ) : (
          <Breakdown>
            <BreakdownRow label="Số dư hiện tại">{state ? `${formatXu(balance)} xu` : "—"}</BreakdownRow>
            <BreakdownRow label="Giá linh thú"><span className={COIN_TEXT}>{entry ? `${formatXu(price)} xu` : "—"}</span></BreakdownRow>
            <BreakdownRow label="Số dư sau khi mua">{state && entry && affordable ? `${formatXu(balance - price)} xu` : "—"}</BreakdownRow>
          </Breakdown>
        )}

        <div className="space-y-2 empty:hidden" aria-live="polite">
          {phase.kind === "confirm" && phase.notice && <p role="alert" className="text-xs leading-relaxed text-destructive">{phase.notice}</p>}
          {phase.kind === "confirm" && !phase.notice && state && entry && !affordable && (
            <p role="alert" className="text-xs leading-relaxed text-destructive">{insufficientMessage(balance, price)}</p>
          )}
          {phase.kind === "confirm" && !state && <p role="alert" className="text-xs leading-relaxed text-destructive">Chưa tải được số dư xu. Hãy đóng và thử lại.</p>}
          {phase.kind === "pending" && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Đang xử lý giao dịch…</p>}
          {phase.kind === "verifying" && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />Chưa nhận được phản hồi. Đang kiểm tra xem giao dịch đã được ghi nhận chưa…</p>}
          {phase.kind === "unverified" && <p role="alert" className="text-xs leading-relaxed text-destructive">Chưa xác định được giao dịch đã được ghi nhận hay chưa. Hãy kiểm tra lại trước khi thử mua lần nữa.</p>}
          {phase.kind === "retry" && <p role="alert" className="text-xs leading-relaxed text-destructive">Giao dịch chưa được ghi nhận và chưa trừ xu. Bạn có thể thử lại.</p>}
          {phase.kind === "blocked" && <p role="alert" className="text-xs leading-relaxed text-destructive">{phase.message}</p>}
          {useError && <p role="alert" className="text-xs leading-relaxed text-destructive">{useError}</p>}
        </div>

        <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end")}>
          {phase.kind === "done" ? (
            <>
              <Button type="button" variant="outline" ref={cancelRef} onClick={close}>Để sau</Button>
              {alreadyActive ? (
                <Button type="button" variant="secondary" disabled>{SHOP_COPY.wearing}</Button>
              ) : (
                <Button type="button" disabled={activation.busy || !entry} onClick={() => void activateNow()}>
                  {activation.busy ? "Đang đổi…" : SHOP_COPY.use}
                </Button>
              )}
            </>
          ) : phase.kind === "blocked" ? (
            <>
              <Button type="button" variant="outline" ref={cancelRef} onClick={close}>Đóng</Button>
              {phase.canLearn && <Button type="button" onClick={() => { close(); onEnterAcademy() }}>{SHOP_COPY.enterAcademy}</Button>}
            </>
          ) : phase.kind === "unverified" ? (
            <>
              <Button type="button" variant="outline" ref={cancelRef} onClick={close}>Đóng</Button>
              <Button type="button" onClick={() => void verify(attempt.current.key)}>Kiểm tra lại</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" ref={cancelRef} disabled={locked} onClick={close}>Hủy</Button>
              <Button type="button" disabled={locked || !state || !entry || !affordable} onClick={() => void submit()} aria-busy={locked || undefined}>
                {phase.kind === "pending" ? "Đang mua…" : phase.kind === "verifying" ? "Đang xác minh…" : phase.kind === "retry" ? `Thử lại · ${formatXu(price)} xu` : `Mua · ${formatXu(price)} xu`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
