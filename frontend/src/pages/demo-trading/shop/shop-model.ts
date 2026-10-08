/**
 * Pure rules of the Shop screens: which state a mascot card is in, how xu and
 * ledger rows read, and the Vietnamese messages of Shop spec section 11.
 * Nothing here touches the network or React.
 */
import { MASCOT_MANIFEST } from "../journey/config"
import { mascotAssetRoot } from "../journey/mascot-2d/mascotManifest"
import type { MascotId } from "../journey/types"
import type { CatalogEntry, LedgerItem, ShopState } from "./shop-api"

export const SHOP_QUERY_ROOT = ["shop"] as const
/** Prefix of `["workspace", "state", userId]` (see workspace/use-workspace.ts): the mascot stage everywhere reads it. */
export const WORKSPACE_STATE_KEY = ["workspace", "state"] as const
export const IQX_TIME_ZONE = "Asia/Ho_Chi_Minh"

export const shopKeys = {
  state: (userId: string) => [...SHOP_QUERY_ROOT, "state", userId] as const,
  ledger: (userId: string) => [...SHOP_QUERY_ROOT, "ledger", userId] as const,
  progress: (userId: string) => [...SHOP_QUERY_ROOT, "academy-progress", userId] as const,
  lessonNames: (userId: string) => [...SHOP_QUERY_ROOT, "lesson-names", userId] as const,
}

export const SHOP_COPY = {
  title: "Linh thú",
  tabStore: "Cửa hàng",
  tabOwned: "Đã sở hữu",
  buy: "Mua",
  short: "Chưa đủ xu",
  use: "Sử dụng",
  wearing: "Đang sử dụng",
  owned: "Đã sở hữu",
  defaultMascot: "Linh thú mặc định",
  unavailable: "Chưa sẵn sàng",
  loadFailed: "Chưa tải được dữ liệu Shop. Số dư xu và linh thú sẽ hiển thị khi tải lại thành công.",
  retry: "Thử lại",
  enterAcademy: "Vào Học viện",
  history: "Lịch sử xu",
  alreadyOwnedNoCharge: "Đã sở hữu. Không trừ thêm xu.",
  insufficient: "Chưa đủ xu",
} as const

export type CardState = "buy" | "short" | "owned" | "active" | "unavailable"

const MASCOT_IDS = Object.keys(MASCOT_MANIFEST) as MascotId[]

export function isMascotId(value: string): value is MascotId {
  return (MASCOT_IDS as string[]).includes(value)
}

/** The server's asset mapping is only trusted when it matches the renderer this client really has. */
export function hasVerifiedAsset(entry: Pick<CatalogEntry, "mascot_id" | "asset_root">): boolean {
  return isMascotId(entry.mascot_id) && entry.asset_root === mascotAssetRoot(entry.mascot_id)
}

export function ownedIds(state: Pick<ShopState, "owned">): ReadonlySet<string> {
  return new Set(state.owned.map((item) => item.mascot_id))
}

export function isOwned(state: Pick<ShopState, "owned">, mascotId: string): boolean {
  return state.owned.some((item) => item.mascot_id === mascotId)
}

/** Card state per Shop spec 3.2; ownership and balance come only from the server state. */
export function deriveCardState(entry: CatalogEntry, state: ShopState): CardState {
  if (!hasVerifiedAsset(entry)) return "unavailable"
  if (isOwned(state, entry.mascot_id)) return state.active.mascot_id === entry.mascot_id ? "active" : "owned"
  if (!entry.for_sale) return "unavailable"
  return state.wallet.balance >= entry.price_xu ? "buy" : "short"
}

/** Mascots shown on the "Cửa hàng" tab: the ones for sale. */
export function storeEntries(state: ShopState): CatalogEntry[] {
  return sortCatalog(state.catalog.filter((entry) => entry.for_sale && !entry.is_default))
}

/** Mascots shown on the "Đã sở hữu" tab: the default one plus everything bought or granted. */
export function ownedEntries(state: ShopState): CatalogEntry[] {
  return sortCatalog(state.catalog.filter((entry) => isOwned(state, entry.mascot_id)))
}

function sortCatalog(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => a.sort_order - b.sort_order)
}

export function findEntry(state: ShopState, mascotId: string): CatalogEntry | undefined {
  return state.catalog.find((entry) => entry.mascot_id === mascotId)
}

const xuFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

export function formatXu(value: number): string {
  return xuFormat.format(value)
}

export function formatSignedXu(delta: number): string {
  if (delta === 0) return "0"
  return `${delta > 0 ? "+" : "−"}${formatXu(Math.abs(delta))}`
}

const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: IQX_TIME_ZONE,
  day: "numeric",
  month: "numeric",
  year: "numeric",
})
const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: IQX_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** Ledger timestamps are real write times shown in the IQX time zone. */
export function formatLedgerTime(iso: string): { date: string; time: string } {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return { date: "—", time: "" }
  return { date: dateFormat.format(at), time: timeFormat.format(at) }
}

export function mascotDisplayName(mascotId: string | null | undefined, fallback = "linh thú"): string {
  return mascotId && isMascotId(mascotId) ? MASCOT_MANIFEST[mascotId].name : fallback
}

/** What a ledger row says: lesson name or mascot name, never a raw id when a name is known. */
export function ledgerRowLabel(item: LedgerItem, lessonNames: ReadonlyMap<string, string> | undefined): { title: string; detail: string | null } {
  switch (item.kind) {
    case "lesson_first_completion": {
      const { lesson_key: key, lesson_id: id } = item.label
      const name = (key && lessonNames?.get(key)) || (id && lessonNames?.get(id)) || null
      if (name) return { title: `Hoàn thành bài ${name}`, detail: null }
      return { title: "Hoàn thành bài học", detail: id ?? key }
    }
    case "mascot_purchase": {
      const name = item.label.mascot_name ?? mascotDisplayName(item.label.mascot_id, "")
      return { title: name ? `Mua ${name}` : "Mua linh thú", detail: null }
    }
    default:
      return { title: "Điều chỉnh xu", detail: null }
  }
}

/** Unique per confirmation; sent with the purchase and reused when the same confirmation is retried. */
export function newIdempotencyKey(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`
  return `shop-${random}`
}

export function priceChangedMessage(currentPrice: number | null): string {
  return currentPrice == null
    ? "Giá linh thú đã thay đổi. Đã cập nhật, vui lòng xác nhận lại."
    : `Giá linh thú đã thay đổi, hiện là ${formatXu(currentPrice)} xu. Đã cập nhật, vui lòng xác nhận lại.`
}

export const CATALOG_CHANGED_MESSAGE = "Danh mục linh thú đã thay đổi. Đã cập nhật, vui lòng xác nhận lại."

export function insufficientMessage(balance: number | null, price: number | null): string {
  if (balance == null || price == null) return "Chưa đủ xu để mua linh thú này."
  return `Chưa đủ xu: bạn có ${formatXu(balance)} xu, cần ${formatXu(price)} xu.`
}
