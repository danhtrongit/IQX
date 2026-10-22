/**
 * Tiến hoá linh thú (spec 1.2): lên cấp 2 (10.000 xu) rồi mới lên cấp 3 (30.000 xu).
 *
 * - Mở hộp thoại không tốn xu; một idempotency key được tạo khi mở và dùng lại cho mọi lần
 *   thử lại của cùng một xác nhận.
 * - Giá hiển thị là giá phía client biết; server quyết định lại và trả PRICE_CHANGED nếu
 *   đã lệch, lúc đó hộp thoại tải lại trạng thái và xin xác nhận lại.
 * - Tiến hoá chỉ đổi hình ảnh linh thú, không cho lợi thế giao dịch nào.
 */
import { useRef, useState } from "react"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { MascotArt } from "./mascot-art"
import { classifyPurchaseError } from "./shop-api"
import {
  PET_EVOLVE_TOTAL_XU,
  PET_MAX_LEVEL,
  SHOP_COPY,
  findEntry,
  formatXu,
  newIdempotencyKey,
  nextPetLevel,
  petEvolvePrice,
  petLevelOf,
  shopFailureMessage,
} from "./shop-model"
import { COIN_TEXT } from "./shop-ui"
import { useReturnFocus } from "./use-return-focus"
import { useEvolvePet, useShopState } from "./use-shop"

function BreakdownRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

export function EvolveDialog({ mascotId, onClose, onEnterAcademy }: {
  mascotId: string
  onClose: () => void
  onEnterAcademy: () => void
}) {
  const shop = useShopState()
  const evolve = useEvolvePet()
  const [phase, setPhase] = useState<"confirm" | "pending" | "done">("confirm")
  const [notice, setNotice] = useState<string | null>(null)
  const [openedKey] = useState(newIdempotencyKey)
  const attempt = useRef({ key: openedKey, signature: "" })
  const restoreFocus = useReturnFocus(true, () =>
    document.querySelector<HTMLElement>(`[data-shop-card="${mascotId}"], [data-shop-owned="${mascotId}"]`),
  )

  const state = shop.data
  const entry = state ? findEntry(state, mascotId) : undefined
  const name = entry?.name ?? "linh thú"
  const level = state ? petLevelOf(state, mascotId) : 1
  const target = state ? nextPetLevel(state, mascotId) : null
  const price = target ? petEvolvePrice(target) : 0
  const balance = state?.wallet.balance ?? 0
  const affordable = !!state && target !== null && balance >= price
  const locked = phase === "pending"

  async function submit() {
    if (!state || !target || locked) return
    const signature = `${mascotId}|${target}|${price}`
    if (attempt.current.signature !== signature) attempt.current = { key: newIdempotencyKey(), signature }
    setPhase("pending")
    try {
      await evolve.evolve({
        mascotId,
        target_level: target,
        expected_price_xu: price,
        idempotency_key: attempt.current.key,
      })
      evolve.refresh()
      setPhase("done")
    } catch (error) {
      const failure = classifyPurchaseError(error)
      evolve.refresh()
      if (failure.kind === "price_changed") {
        setPhase("confirm")
        setNotice(shopFailureMessage(failure))
        return
      }
      setPhase("confirm")
      setNotice(shopFailureMessage(failure))
    }
  }

  const title = phase === "done" ? `${name} đã lên cấp ${target ?? level}` : SHOP_COPY.evolveTitle

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !locked) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-[480px]"
        data-testid="evolve-dialog"
        onCloseAutoFocus={restoreFocus}
        onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }}
        onInteractOutside={(event) => { if (locked) event.preventDefault() }}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-base font-bold">{title}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" disabled={locked} onClick={onClose} className="-mt-1 -mr-1">
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Xác nhận tiến hoá linh thú lên cấp mới bằng xu học tập. Tiến hoá chỉ đổi hình ảnh, không cho lợi thế giao dịch nào.
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
            {phase === "done"
              ? `Đã lên cấp ${target ?? level}. Hình ảnh và cấp tiến hoá được giữ nguyên khi bạn đổi linh thú.`
              : "Tiến hoá chỉ đổi hình ảnh linh thú, không cho lợi thế giao dịch nào trong Bot, Demo hay Flashback."}
          </p>
        </div>

        <dl className="divide-y divide-border rounded-lg border border-border bg-background/40 px-3.5">
          <BreakdownRow label="Cấp hiện tại">Cấp {level}</BreakdownRow>
          <BreakdownRow label="Cấp mới">{target ? `Cấp ${target}` : `Cấp cao nhất (${PET_MAX_LEVEL})`}</BreakdownRow>
          <BreakdownRow label="Giá tiến hoá">
            {target ? <span className={COIN_TEXT}>{formatXu(price)} xu</span> : "—"}
          </BreakdownRow>
          <BreakdownRow label={`Tổng chi phí lên cấp ${PET_MAX_LEVEL}`}>
            <span className={COIN_TEXT}>{formatXu(PET_EVOLVE_TOTAL_XU)} xu</span>
          </BreakdownRow>
          <BreakdownRow label="Số dư hiện tại">{state ? `${formatXu(balance)} xu` : "—"}</BreakdownRow>
          <BreakdownRow label="Số dư sau khi tiến hoá">
            {state && target && affordable ? `${formatXu(balance - price)} xu` : "—"}
          </BreakdownRow>
        </dl>

        <div className="space-y-2 empty:hidden" aria-live="polite">
          {notice && <p role="alert" className="text-xs leading-relaxed text-destructive">{notice}</p>}
          {phase === "confirm" && !notice && state && target && !affordable && (
            <p role="alert" className="text-xs leading-relaxed text-destructive">
              {`Chưa đủ xu: bạn có ${formatXu(balance)} xu, cần ${formatXu(price)} xu.`}
            </p>
          )}
          {phase === "confirm" && !state && (
            <p role="alert" className="text-xs leading-relaxed text-destructive">Chưa tải được trạng thái Shop. Hãy đóng và thử lại.</p>
          )}
          {phase === "pending" && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Đang tiến hoá linh thú…
            </p>
          )}
        </div>

        <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end")}>
          {phase === "done" ? (
            <Button type="button" variant="outline" onClick={onClose}>Đóng</Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={locked} onClick={onClose}>Hủy</Button>
              <Button
                type="button"
                disabled={locked || !state || !target || !affordable}
                onClick={() => void submit()}
                aria-busy={locked || undefined}
              >
                {locked ? "Đang tiến hoá…" : target ? `${SHOP_COPY.evolve} · ${formatXu(price)} xu` : SHOP_COPY.evolve}
              </Button>
            </>
          )}
        </div>
        {phase === "confirm" && state && target && !affordable && (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => { onClose(); onEnterAcademy() }}>
            {SHOP_COPY.enterAcademy}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
