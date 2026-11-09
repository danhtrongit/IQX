/**
 * Pure rules of the «Thẻ nến» part of the Shop (Candle Dojo spec v1.2, section 8): which cards each tab
 * lists, how they group by tier, which sentence an empty tab or a refused purchase shows. The server decides
 * ownership, unlocking, price and balance; nothing here touches the network or React.
 */
import { CD_CARD_COUNT, type CdTier } from "@/lib/candle-dojo/cards"
import type { CandleDojoCardItem, CandleDojoCards, CardPurchaseFailure } from "../candle-dojo/candle-dojo-api"

export type CardsView = "store" | "owned"

export const CANDLE_TIERS: readonly CdTier[] = [1, 2, 3, 4, 5]

export const CANDLE_COPY = {
  title: "Thẻ nến",
  tabsLabel: "Thẻ nến",
  tabStore: "Cửa hàng",
  tabOwned: "Đã sở hữu",
  buy: "Mua",
  short: "Chưa đủ xu",
  owned: "Đã sở hữu",
  seen: "Đã gặp",
  viewOwned: "Xem kho thẻ",
  dialogTitle: "Mua thẻ nến",
  dialogNote: "Thẻ sẽ hiện trong Flashback khi gặp đúng mẫu nến này.",
  emptyNoLesson: "Chưa có thẻ nào. Học xong một bài ở Candle Dojo để mở thẻ của bài đó.",
  emptyAllBought: "Bạn đã mua hết thẻ của các bài đã học.",
  emptyOwned: "Kho thẻ trống. Mua thẻ ở tab Cửa hàng.",
  loadFailed: "Chưa tải được thẻ nến. Linh thú và số dư xu vẫn dùng được; thẻ sẽ hiển thị khi tải lại thành công.",
  refreshFailed: "Chưa cập nhật được thẻ nến. Đang hiển thị dữ liệu đã xác nhận gần nhất.",
  ownedNoCharge: "Bạn đã có thẻ này. Không trừ thêm xu.",
  locked: "Học xong bài ở Candle Dojo để mở thẻ này.",
  insufficient: "Số xu hiện tại không đủ. Không thực hiện giao dịch.",
  priceChanged: "Giá thẻ đã thay đổi. Đã cập nhật, vui lòng xác nhận lại.",
  catalogChanged: "Bộ thẻ đã thay đổi. Đã cập nhật, vui lòng xác nhận lại.",
  purchaseFailed: "Chưa xác nhận được giao dịch. Hãy kiểm tra số dư và kho thẻ trước khi thử lại.",
} as const

export function candleCardAdded(name: string): string {
  return `Đã thêm ${name} vào kho thẻ.`
}

/** A cards payload is only trusted when it has the list the screens are drawn from. */
export function isUsableCards(data: CandleDojoCards | undefined): data is CandleDojoCards {
  return !!data && Array.isArray(data.items) && Number.isSafeInteger(data.owned_count) && typeof data.catalog_version === "string"
}

export function asTier(value: number): CdTier | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null
}

/** "Cửa hàng": cards whose lesson is learned and that the learner does not own yet. "Đã sở hữu": the owned ones. */
export function cardsOfView(items: readonly CandleDojoCardItem[], view: CardsView): CandleDojoCardItem[] {
  return items.filter((item) => asTier(item.tier) !== null && (view === "owned" ? item.owned : item.unlocked && !item.owned))
}

export type CardTierGroup = { tier: CdTier; items: CandleDojoCardItem[] }

/** Groups by tier, in tier order, leaving out empty tiers. */
export function groupByTier(items: readonly CandleDojoCardItem[]): CardTierGroup[] {
  return CANDLE_TIERS
    .map((tier) => ({ tier, items: items.filter((item) => item.tier === tier) }))
    .filter((group) => group.items.length > 0)
}

/** The sentence of an empty tab: "Chưa học bài nào" and "đã mua hết" are different situations. */
export function emptyCardsText(items: readonly CandleDojoCardItem[], view: CardsView): string {
  if (view === "owned") return CANDLE_COPY.emptyOwned
  return items.some((item) => item.unlocked) ? CANDLE_COPY.emptyAllBought : CANDLE_COPY.emptyNoLesson
}

/** How many cards of each tier the learner owns (panel block). */
export function ownedCountsByTier(items: readonly CandleDojoCardItem[]): Record<CdTier, number> {
  const counts: Record<CdTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const item of items) {
    const tier = asTier(item.tier)
    if (tier && item.owned) counts[tier] += 1
  }
  return counts
}

export function ownedTotal(data: CandleDojoCards): { owned: number; total: number } {
  return { owned: data.owned_count, total: data.total_count ?? CD_CARD_COUNT }
}

/** A refused purchase that leaves nothing to confirm again: the learner can only close the dialog. */
export function isBlockingFailure(failure: CardPurchaseFailure): boolean {
  return failure.kind === "owned" || failure.kind === "locked" || failure.kind === "insufficient"
}

/** The Vietnamese sentence of each refused purchase (spec 8.2), in the Shop's own wording. */
export function cardPurchaseMessage(failure: CardPurchaseFailure): string {
  switch (failure.kind) {
    case "owned":
      return CANDLE_COPY.ownedNoCharge
    case "locked":
      return CANDLE_COPY.locked
    case "insufficient":
      return CANDLE_COPY.insufficient
    case "price_changed":
      return CANDLE_COPY.priceChanged
    case "catalog_changed":
      return CANDLE_COPY.catalogChanged
    default:
      return failure.message || CANDLE_COPY.purchaseFailed
  }
}
