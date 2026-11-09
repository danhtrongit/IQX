import type { CardPurchaseFailure, CandleDojoCardItem } from "../candle-dojo-api"
import { formatXu } from "./lesson-model"

/** Trạng thái nút mua thẻ ở màn kết thúc bài. */
export type PurchaseView =
  | { kind: "owned" }
  | { kind: "locked" }
  | { kind: "short"; price: number; shortfall: number }
  | { kind: "ready"; price: number }

/**
 * Thẻ của bài vừa học xong mua được ngay (không cần đủ sao). `unlockedHint` là điều server vừa báo ở kết quả
 * bài học, dùng khi danh sách thẻ trong bộ nhớ đệm chưa kịp làm mới.
 */
export function purchaseView(item: Pick<CandleDojoCardItem, "owned" | "unlocked" | "price_xu">, balance: number, unlockedHint: boolean): PurchaseView {
  if (item.owned) return { kind: "owned" }
  if (!item.unlocked && !unlockedHint) return { kind: "locked" }
  if (balance < item.price_xu) return { kind: "short", price: item.price_xu, shortfall: item.price_xu - balance }
  return { kind: "ready", price: item.price_xu }
}

export function purchaseFailureMessage(failure: CardPurchaseFailure): string {
  switch (failure.kind) {
    case "owned":
      return "Bạn đã có thẻ này. Không trừ thêm xu."
    case "locked":
      return "Hoàn thành bài học này trước khi mua thẻ."
    case "insufficient":
      return failure.price > 0
        ? `Chưa đủ xu: cần ${formatXu(failure.price)}, bạn có ${formatXu(failure.balance)}.`
        : "Số xu hiện tại chưa đủ để mua thẻ này."
    case "price_changed":
      return "Giá thẻ vừa thay đổi. Kiểm tra giá mới rồi mua lại."
    case "catalog_changed":
      return "Bộ thẻ vừa được cập nhật. Đã tải lại, hãy thử mua lại."
    case "other":
      return failure.message
  }
}

/** Lỗi mà dữ liệu thẻ trong bộ nhớ đệm đã cũ: tải lại để nút phản ánh đúng. */
export const purchaseFailureNeedsRefresh = (failure: CardPurchaseFailure) =>
  failure.kind === "owned" || failure.kind === "price_changed" || failure.kind === "catalog_changed" || failure.kind === "insufficient"
