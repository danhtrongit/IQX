/**
 * «Mua thẻ nến» (Candle Dojo spec v1.2, section 8.2): the Shop's own purchase modal, with the card, its name,
 * the Số dư hiện tại / Giá thẻ / Số dư sau khi mua table and Hủy / Mua · {giá} xu.
 *
 * - Opening the dialog spends nothing; the confirm button is locked while the request is in flight (a double
 *   click sends one purchase) and the dialog cannot be dismissed then, so the outcome is always shown.
 * - The request carries the price the learner saw and the catalog version of the cards response; the server
 *   decides again. A card is bought once per account, so a retry after a lost answer is answered with
 *   CARD_OWNED and never charges twice.
 * - Success closes the dialog, shows the toast and moves the card to "Đã sở hữu" at once from the server's
 *   answer; every Shop and Candle Dojo query is read again so the balances agree everywhere.
 * - A refused purchase is shown in the dialog in the Shop's error style, in the spec's sentences. Price or
 *   catalog changes reread the cards and ask for a new confirmation.
 */
import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { LoaderCircle, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/hooks/use-auth"
import { CandleCard } from "../candle-dojo/candle-card"
import {
  CANDLE_DOJO_QUERY_ROOT,
  candleDojoKeys,
  classifyCardPurchaseError,
  usePurchaseCandleCard,
  useCandleDojoCards,
  type CandleDojoCards,
  type CandleDojoPurchaseResult,
} from "../candle-dojo/candle-dojo-api"
import {
  CANDLE_COPY,
  candleCardAdded,
  cardPurchaseMessage,
  isBlockingFailure,
  isUsableCards,
} from "./candle-cards-model"
import { Breakdown, BreakdownRow } from "./purchase-dialog"
import { SHOP_QUERY_ROOT, WORKSPACE_STATE_KEY, formatXu } from "./shop-model"
import { COIN_TEXT } from "./shop-ui"
import { useReturnFocus } from "./use-return-focus"
import { useShopState } from "./use-shop"

type Notice = { message: string; blocked: boolean }

/** The server's answer applied to the cards already on screen, so the card moves tabs before the reread lands. */
function markBought(data: CandleDojoCards | undefined, result: CandleDojoPurchaseResult): CandleDojoCards | undefined {
  if (!data || !data.items.some((item) => item.card_id === result.card_id && !item.owned)) return data
  return {
    ...data,
    wallet: { balance: result.balance },
    owned_count: data.owned_count + 1,
    items: data.items.map((item) => (item.card_id === result.card_id ? { ...item, owned: true, acquired_at: result.acquired_at } : item)),
  }
}

export function CandleCardPurchaseDialog({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { user } = useAuth()
  const userId = user?.id ?? ""
  const queryClient = useQueryClient()
  const cards = useCandleDojoCards()
  const shop = useShopState()
  const purchase = usePurchaseCandleCard()
  const [notice, setNotice] = useState<Notice | null>(null)
  const [closing, setClosing] = useState(false)
  const sending = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useReturnFocus(true, () => document.querySelector<HTMLElement>("[data-candle-cards-section]"))

  const data = isUsableCards(cards.data) ? cards.data : undefined
  const item = data?.items.find((entry) => entry.card_id === cardId)
  const price = item?.price_xu ?? 0
  const balance = shop.data?.wallet.balance
  const affordable = balance !== undefined && balance >= price
  const locked = purchase.isPending

  // What the server's data says right now, unless a refused purchase already explained itself.
  const standing: Notice | null = closing
    ? null
    : notice
      ?? (item?.owned ? { message: CANDLE_COPY.ownedNoCharge, blocked: true }
        : item && !item.unlocked ? { message: CANDLE_COPY.locked, blocked: true }
          : item && balance !== undefined && !affordable ? { message: CANDLE_COPY.insufficient, blocked: false }
            : null)
  const blocked = standing?.blocked === true

  function reread() {
    return Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: CANDLE_DOJO_QUERY_ROOT }),
      queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT }),
    ])
  }

  async function submit() {
    if (!data || !item || sending.current) return
    sending.current = true
    setNotice(null)
    try {
      const result = await purchase.mutateAsync({ cardId, expected_price_xu: item.price_xu, catalog_version: data.catalog_version })
      queryClient.setQueryData<CandleDojoCards>(candleDojoKeys.cards(userId), (current) => markBought(current, result))
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_STATE_KEY })
      setClosing(true)
      toast.success(candleCardAdded(result.name))
      onClose()
    } catch (error) {
      const failure = classifyCardPurchaseError(error)
      setNotice({ message: cardPurchaseMessage(failure), blocked: isBlockingFailure(failure) })
      await reread()
    } finally {
      sending.current = false
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !locked) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-[480px]"
        data-testid="candle-card-purchase-dialog"
        onCloseAutoFocus={restoreFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onEscapeKeyDown={(event) => { if (locked) event.preventDefault() }}
        onInteractOutside={(event) => { if (locked) event.preventDefault() }}
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="text-base font-bold">{CANDLE_COPY.dialogTitle}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Đóng" disabled={locked} onClick={onClose} className="-mt-1 -mr-1">
            <X aria-hidden="true" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Xác nhận mua một thẻ nến bằng xu học tập. Thẻ chỉ mua một lần cho mỗi tài khoản.
        </DialogDescription>

        {item ? (
          <>
            <div className="flex justify-center pt-1.5 pb-3">
              <CandleCard card={item.card_id} width={120} />
            </div>
            <div className="text-center">
              <h3 className="font-heading text-lg font-bold">{item.name}</h3>
              <p className="mt-1 text-xs">{CANDLE_COPY.dialogNote}</p>
            </div>
            <Breakdown>
              <BreakdownRow label="Số dư hiện tại">{balance !== undefined ? `${formatXu(balance)} xu` : "—"}</BreakdownRow>
              <BreakdownRow label="Giá thẻ"><span className={COIN_TEXT}>{`${formatXu(price)} xu`}</span></BreakdownRow>
              <BreakdownRow label="Số dư sau khi mua">{balance !== undefined && affordable ? `${formatXu(balance - price)} xu` : "—"}</BreakdownRow>
            </Breakdown>
          </>
        ) : (
          <p role="alert" className="text-xs leading-relaxed text-destructive">Chưa tải được thẻ này. Hãy đóng và thử lại.</p>
        )}

        <div className="space-y-2 empty:hidden" aria-live="polite">
          {standing && <p role="alert" className="text-xs leading-relaxed text-destructive">{standing.message}</p>}
          {locked && (
            <p role="status" className="flex items-center gap-2 text-xs">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Đang xử lý giao dịch…
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {blocked ? (
            <Button type="button" variant="outline" ref={cancelRef} onClick={onClose}>Đóng</Button>
          ) : (
            <>
              <Button type="button" variant="outline" ref={cancelRef} disabled={locked} onClick={onClose}>Hủy</Button>
              <Button
                type="button"
                disabled={locked || !item || !data || balance === undefined || !affordable}
                aria-busy={locked || undefined}
                onClick={() => void submit()}
              >
                {locked ? "Đang mua…" : `Mua · ${formatXu(price)} xu`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
