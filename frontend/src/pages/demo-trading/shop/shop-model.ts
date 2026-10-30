/**
 * Pure rules of the Shop screens: which state a mascot card is in, how xu and
 * ledger rows read, and the Vietnamese messages of Shop spec section 11.
 * Nothing here touches the network or React.
 */
import { MASCOT_MANIFEST } from "../journey/config"
import { mascotAssetRoot } from "../journey/mascot-2d/mascotManifest"
import type { MascotId } from "../journey/types"
import type { CatalogEntry, LedgerItem, PurchaseFailure, ShopState } from "./shop-api"

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
  evolve: "Tiến hoá",
  evolveTitle: "Tiến hoá linh thú",
  premium: "Premium",
  premiumBuy: "Mua Premium",
  exchange: "Đổi xu",
  exchangeTitle: "Đổi xu với tiền Demo",
} as const

/**
 * Giá tiến hoá theo cấp đích (spec 1.2): lên cấp 2 là 10.000 xu, lên cấp 3 là 30.000 xu, tổng
 * 40.000 xu cho một linh thú. Server quyết định lại giá và trả PRICE_CHANGED nếu đã lệch.
 */
export const PET_EVOLVE_PRICE_XU: Readonly<Record<2 | 3, number>> = { 2: 10_000, 3: 30_000 }
export const PET_EVOLVE_TOTAL_XU = 40_000
export const PET_MAX_LEVEL = 3
export type PetLevelValue = 1 | 2 | 3
export type PetTargetLevel = 2 | 3

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

/** Cấp tiến hoá của một linh thú: 1 khi chưa tiến hoá. */
export function petLevelOf(state: Pick<ShopState, "pet_levels">, mascotId: string): PetLevelValue {
  const level = state.pet_levels.find((item) => item.mascot_id === mascotId)?.level
  return level === 2 || level === 3 ? level : 1
}

/** Cấp đích tiếp theo của một linh thú; null khi đã ở cấp cao nhất. */
export function nextPetLevel(state: Pick<ShopState, "pet_levels">, mascotId: string): PetTargetLevel | null {
  const level = petLevelOf(state, mascotId)
  return level === 1 ? 2 : level === 2 ? 3 : null
}

/** Giá của một bước tiến hoá. */
export function petEvolvePrice(target: PetTargetLevel): number {
  return PET_EVOLVE_PRICE_XU[target]
}

/** Nhãn cấp của một linh thú ("Cấp 2"); cấp 1 không ghi ra để khỏi rối. */
export function petLevelLabel(level: PetLevelValue): string | null {
  return level > 1 ? `Cấp ${level}` : null
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

export type LedgerRowInput = Omit<LedgerItem, "kind"> & {
  kind: LedgerItem["kind"] | "flashback_fee" | "flashback_reward" | (string & {})
}

/** What a ledger row says: lesson name or mascot name, never a raw id when a name is known. */
export function ledgerRowLabel(item: LedgerRowInput, lessonNames: ReadonlyMap<string, string> | undefined): { title: string; detail: string | null } {
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
    case "pet_purchase": {
      const name = item.label.mascot_name ?? mascotDisplayName(item.label.mascot_id, "")
      return { title: "Mua linh thú", detail: name || null }
    }
    case "pet_evolve": {
      const name = item.label.mascot_name ?? mascotDisplayName(item.label.mascot_id, "")
      return { title: "Tiến hoá linh thú", detail: name || null }
    }
    case "premium_purchase":
      return { title: "Mua Premium", detail: null }
    case "demo_deposit":
      return { title: "Đổi tiền sang xu", detail: null }
    case "demo_withdraw":
      return { title: "Đổi xu sang tiền", detail: null }
    case "flashback_fee":
      return { title: "Tham gia Flashback", detail: null }
    case "flashback_reward":
      return { title: "Thưởng Flashback", detail: null }
    case "flashback_stake":
      return { title: "Cược Flashback", detail: null }
    case "flashback_win":
      return { title: "Thắng Flashback", detail: null }
    case "flashback_refund":
      return { title: "Hoàn xu cược Flashback", detail: null }
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

export function priceChangedMessage(currentPrice: number | null, what = "linh thú"): string {
  return currentPrice == null
    ? `Giá ${what} đã thay đổi. Đã cập nhật, vui lòng xác nhận lại.`
    : `Giá ${what} đã thay đổi, hiện là ${formatXu(currentPrice)} xu. Đã cập nhật, vui lòng xác nhận lại.`
}

export const CATALOG_CHANGED_MESSAGE = "Danh mục linh thú đã thay đổi. Đã cập nhật, vui lòng xác nhận lại."

/** Câu thông báo tiếng Việt cho một lỗi của Shop: mua, tiến hoá, Premium và đổi xu dùng chung. */
export function shopFailureMessage(failure: PurchaseFailure): string {
  switch (failure.kind) {
    case "insufficient":
      return failure.balance == null || failure.price == null
        ? "Chưa đủ xu để thực hiện."
        : `Chưa đủ xu: bạn có ${formatXu(failure.balance)} xu, cần ${formatXu(failure.price)} xu.`
    case "insufficient_cash":
      return failure.available == null || failure.need == null
        ? "Không đủ tiền mặt trong tài khoản Demo Trading."
        : `Không đủ tiền mặt: bạn có ${formatXu(failure.available)} đồng, cần ${formatXu(failure.need)} đồng.`
    case "price_changed":
      return priceChangedMessage(failure.currentPrice)
    case "catalog_changed":
      return CATALOG_CHANGED_MESSAGE
    case "not_for_sale":
      return "Linh thú này hiện không bán."
    case "not_owned":
      return "Bạn chưa sở hữu linh thú này."
    case "level_locked":
      return `Phải lên cấp ${failure.requiredLevel ?? 2} trước khi lên cấp tiếp theo.`
    case "max_level":
      return `Linh thú đã ở cấp cao nhất (${failure.currentLevel ?? PET_MAX_LEVEL}).`
    case "limit_reached":
      return failure.message
    case "phone_not_verified":
      return "Tài khoản chưa xác thực số điện thoại nên chưa đổi Premium bằng xu được."
    case "invalid_amount":
      return failure.message
    case "key_reused":
      return "Yêu cầu trước chưa hoàn tất. Vui lòng xác nhận lại."
    case "unknown_outcome":
      return "Chưa xác định được giao dịch đã được ghi nhận hay chưa. Hãy kiểm tra lại trước khi thử lại."
    default:
      return failure.message
  }
}

export function insufficientMessage(balance: number | null, price: number | null): string {
  if (balance == null || price == null) return "Chưa đủ xu để mua linh thú này."
  return `Chưa đủ xu: bạn có ${formatXu(balance)} xu, cần ${formatXu(price)} xu.`
}
