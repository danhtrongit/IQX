import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cdCard } from "@/lib/candle-dojo/cards"
import { cn } from "@/lib/utils"
import {
  CANDLE_DOJO_QUERY_ROOT,
  classifyCardPurchaseError,
  useCandleDojoCards,
  usePurchaseCandleCard,
  type CardPurchaseFailure,
} from "../candle-dojo-api"
import { formatXu, localCardPrice } from "./lesson-model"
import { purchaseFailureMessage, purchaseFailureNeedsRefresh, purchaseView } from "./purchase-model"

const BUY_BUTTON = "h-9 w-full min-w-32 font-bold"

function OwnedLabel() {
  return (
    <span className="inline-flex h-9 items-center gap-1 text-sm font-bold text-(--status-success)">
      <Check aria-hidden="true" className="size-4" />
      Đã sở hữu
    </span>
  )
}

/** Nút mua của một thẻ ở màn kết thúc bài. Xem trước thì không đọc, không gọi gì và không mua được. */
export function CardPurchase({ cardId, preview, unlocked }: { cardId: string; preview: boolean; unlocked: boolean }) {
  return preview ? <PreviewPurchase cardId={cardId} /> : <LivePurchase cardId={cardId} unlocked={unlocked} />
}

function PreviewPurchase({ cardId }: { cardId: string }) {
  const card = cdCard(cardId)
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <Button type="button" variant="secondary" disabled className={cn(BUY_BUTTON, "text-foreground disabled:opacity-100")}>
        Mua · {card ? formatXu(localCardPrice(card)) : "..."}
      </Button>
      <p className="text-center text-xs font-medium text-foreground">Xem trước: chưa mua được</p>
    </div>
  )
}

function LivePurchase({ cardId, unlocked }: { cardId: string; unlocked: boolean }) {
  const queryClient = useQueryClient()
  const cards = useCandleDojoCards()
  const purchase = usePurchaseCandleCard()
  const [failure, setFailure] = useState<CardPurchaseFailure | null>(null)

  if (cards.isPending) return <Skeleton className="h-9 w-full min-w-32" />
  const item = cards.data?.items.find((entry) => entry.card_id === cardId)
  if (!cards.data || !item) {
    return (
      <div className="flex w-full flex-col items-center gap-1">
        <p role="alert" className="text-center text-xs font-medium text-destructive">
          Chưa tải được giá thẻ.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void cards.refetch()}>
          Thử lại
        </Button>
      </div>
    )
  }

  const view = purchaseView(item, cards.data.wallet.balance, unlocked)
  if (view.kind === "owned" || purchase.isSuccess) return <OwnedLabel />

  function buy() {
    if (!cards.data || !item) return
    setFailure(null)
    purchase.mutate(
      { cardId, expected_price_xu: item.price_xu, catalog_version: cards.data.catalog_version },
      {
        onError: (error) => {
          const reason = classifyCardPurchaseError(error)
          setFailure(reason)
          if (purchaseFailureNeedsRefresh(reason)) void queryClient.invalidateQueries({ queryKey: CANDLE_DOJO_QUERY_ROOT })
        },
      },
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-1">
      {view.kind === "ready" ? (
        <Button type="button" className={BUY_BUTTON} disabled={purchase.isPending} onClick={buy}>
          {purchase.isPending ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
          {purchase.isPending ? "Đang mua" : `Mua · ${formatXu(view.price)}`}
        </Button>
      ) : view.kind === "short" ? (
        <>
          <Button type="button" variant="secondary" disabled className={cn(BUY_BUTTON, "text-foreground disabled:opacity-100")}>
            Mua · {formatXu(view.price)}
          </Button>
          <p className="text-center text-xs font-medium text-foreground">Còn thiếu {formatXu(view.shortfall)}</p>
        </>
      ) : (
        <Button type="button" variant="secondary" disabled className={cn(BUY_BUTTON, "text-foreground disabled:opacity-100")}>
          Chưa mở khoá
        </Button>
      )}
      {failure ? (
        <p role="alert" className="text-center text-xs font-medium text-destructive">
          {purchaseFailureMessage(failure)}
        </p>
      ) : null}
    </div>
  )
}
