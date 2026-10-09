/**
 * Shop data layer: learning coins ("xu"), the mascot catalog and ownership.
 *
 * Every number the UI shows comes from the server (`/api/v2/shop/**`). Responses
 * are checked at the boundary: a malformed or partial payload becomes an error,
 * so a screen can only ever say "0 xu" or "not owned" when the server did.
 * Money never travels from the client: a purchase sends the price the user
 * confirmed only so the server can detect that it changed.
 */
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"

export type ShopState = ApiResponseFor<"GET /api/v2/shop">
export type CatalogEntry = ShopState["catalog"][number]
export type OwnedEntry = ShopState["owned"][number]
export type LedgerPage = ApiResponseFor<"GET /api/v2/shop/coin-ledger">
export type LedgerItem = LedgerPage["items"][number]
export type PurchaseResult = ApiResponseFor<"POST /api/v2/shop/purchases">
export type PurchaseStatus = ApiResponseFor<"GET /api/v2/shop/purchases/{idempotencyKey}">
export type ActiveMascotResult = ApiResponseFor<"PUT /api/v2/shop/active-mascot">
export type PurchaseBody = ApiRequestFor<"POST /api/v2/shop/purchases">["body"]
export type AcademyProgress = ApiResponseFor<"GET /api/v2/academy/progress">
export type AcademyCatalog = ApiResponseFor<"GET /api/v2/academy/catalog">

export const LEDGER_PAGE_SIZE = 20
/** A purchase that has not answered by now is "outcome unknown", never "failed". */
export const PURCHASE_TIMEOUT_MS = 20_000
const STATUS_TIMEOUT_MS = 10_000

type JsonRecord = Record<string, unknown>

function invalid(what: string): never {
  throw new ApiError(`Phản hồi ${what} không hợp lệ`, 502, { code: "INVALID_RESPONSE" })
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function parseWallet(value: unknown, what: string): { balance: number; last_seq: number } {
  if (!isRecord(value) || !isCount(value.balance) || !isCount(value.last_seq)) invalid(what)
  return { balance: value.balance, last_seq: value.last_seq }
}

function parseActive(value: unknown, what: string): ShopState["active"] {
  if (!isRecord(value) || !isText(value.mascot_id) || !isInt(value.revision) || value.revision < 1) invalid(what)
  return value as ShopState["active"]
}

function parseOwned(value: unknown, what: string): OwnedEntry[] {
  if (!Array.isArray(value)) invalid(what)
  for (const item of value) if (!isRecord(item) || !isText(item.mascot_id)) invalid(what)
  return value as OwnedEntry[]
}

export function parseShopState(raw: unknown): ShopState {
  if (!isRecord(raw)) invalid("Shop")
  if (!isText(raw.catalog_version) || !Array.isArray(raw.catalog)) invalid("Shop")
  for (const entry of raw.catalog) {
    if (
      !isRecord(entry) || !isText(entry.mascot_id) || !isText(entry.name) || !isCount(entry.price_xu)
      || typeof entry.for_sale !== "boolean" || typeof entry.is_default !== "boolean"
      || !isInt(entry.sort_order) || typeof entry.asset_root !== "string"
    ) invalid("Shop")
  }
  const wallet = parseWallet(raw.wallet, "Shop")
  const owned = parseOwned(raw.owned, "Shop")
  const active = parseActive(raw.active, "Shop")
  if (!isRecord(raw.totals) || !isCount(raw.totals.earned_xu) || !isCount(raw.totals.spent_xu)) invalid("Shop")
  if (!isCount(raw.owned_count) || !isCount(raw.total_count)) invalid("Shop")
  return { ...(raw as ShopState), wallet, owned, active }
}

export function parseLedgerPage(raw: unknown): LedgerPage {
  if (!isRecord(raw) || !Array.isArray(raw.items)) invalid("lịch sử xu")
  for (const item of raw.items) {
    if (
      !isRecord(item) || !isText(item.id) || !isInt(item.delta) || !isCount(item.balance_after)
      || !isText(item.created_at) || !isText(item.kind) || !isRecord(item.label)
    ) invalid("lịch sử xu")
  }
  if (raw.next_cursor !== null && !isText(raw.next_cursor)) invalid("lịch sử xu")
  return raw as LedgerPage
}

export function parsePurchaseResult(raw: unknown): PurchaseResult {
  if (!isRecord(raw) || (raw.status !== "purchased" && raw.status !== "already_owned")) invalid("giao dịch mua")
  const wallet = parseWallet(raw.wallet, "giao dịch mua")
  const owned = parseOwned(raw.owned, "giao dịch mua")
  const active = parseActive(raw.active, "giao dịch mua")
  return { ...(raw as PurchaseResult), wallet, owned, active }
}

export function parsePurchaseStatus(raw: unknown): PurchaseStatus {
  if (!isRecord(raw) || (raw.status !== "completed" && raw.status !== "not_found")) invalid("trạng thái giao dịch")
  const wallet = parseWallet(raw.wallet, "trạng thái giao dịch")
  return { ...(raw as PurchaseStatus), wallet }
}

export function parseActiveResult(raw: unknown): ActiveMascotResult {
  if (!isRecord(raw) || typeof raw.changed !== "boolean") invalid("linh thú đang sử dụng")
  const active = parseActive(raw.active, "linh thú đang sử dụng")
  return { changed: raw.changed, active }
}

export async function fetchShopState(signal?: AbortSignal): Promise<ShopState> {
  return parseShopState(await requestOperation("GET /api/v2/shop", {}, { signal }))
}

export async function fetchLedgerPage(cursor: string | undefined, signal?: AbortSignal): Promise<LedgerPage> {
  const query = cursor ? { limit: LEDGER_PAGE_SIZE, cursor } : { limit: LEDGER_PAGE_SIZE }
  return parseLedgerPage(await requestOperation("GET /api/v2/shop/coin-ledger", { query }, { signal }))
}

export async function fetchAcademyProgress(signal?: AbortSignal): Promise<{ courseDone: number; courseTotal: number | null }> {
  const raw: unknown = await requestOperation("GET /api/v2/academy/progress", {}, { signal })
  if (!isRecord(raw) || !isCount(raw.course_done)) invalid("tiến độ Học viện")
  return { courseDone: raw.course_done, courseTotal: isCount(raw.course_total) ? raw.course_total : null }
}

/** Lesson names for ledger rows, keyed by both the stable lesson key and the catalog id. */
export async function fetchLessonNames(signal?: AbortSignal): Promise<ReadonlyMap<string, string>> {
  const raw: unknown = await requestOperation("GET /api/v2/academy/catalog", {}, { signal })
  const names = new Map<string, string>()
  if (!isRecord(raw) || !Array.isArray(raw.chapters)) invalid("danh mục Học viện")
  for (const chapter of raw.chapters) {
    if (!isRecord(chapter) || !Array.isArray(chapter.lessons)) continue
    for (const lesson of chapter.lessons) {
      if (!isRecord(lesson) || !isText(lesson.name)) continue
      if (isText(lesson.lesson_key)) names.set(lesson.lesson_key, lesson.name)
      if (isText(lesson.id)) names.set(lesson.id, lesson.name)
    }
  }
  return names
}

/** Runs `request` with a deadline; the deadline aborts the HTTP call, it does not cancel the purchase. */
async function withDeadline<T>(ms: number, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await request(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

export function postPurchase(body: PurchaseBody): Promise<PurchaseResult> {
  return withDeadline(PURCHASE_TIMEOUT_MS, async (signal) =>
    parsePurchaseResult(await requestOperation("POST /api/v2/shop/purchases", { body }, { signal })),
  )
}

export function fetchPurchaseStatus(idempotencyKey: string): Promise<PurchaseStatus> {
  return withDeadline(STATUS_TIMEOUT_MS, async (signal) =>
    parsePurchaseStatus(
      await requestOperation("GET /api/v2/shop/purchases/{idempotencyKey}", { path: { idempotencyKey } }, { signal }),
    ),
  )
}

export async function putActiveMascot(mascotId: string, expectedRevision: number): Promise<ActiveMascotResult> {
  return parseActiveResult(
    await requestOperation("PUT /api/v2/shop/active-mascot", {
      body: { mascot_id: mascotId, expected_revision: expectedRevision },
    }),
  )
}

/** First detail object of an error envelope (`error.details[0]`), when the server sent one. */
function firstDetail(error: ApiError): JsonRecord | null {
  const details = error.details
  return Array.isArray(details) && isRecord(details[0]) ? details[0] : null
}

function detailCount(detail: JsonRecord | null, key: string): number | null {
  const value = detail?.[key]
  return isCount(value) ? value : null
}

export type PurchaseFailure =
  | { kind: "insufficient"; balance: number | null; price: number | null }
  | { kind: "price_changed"; currentPrice: number | null }
  | { kind: "catalog_changed" }
  | { kind: "not_for_sale" }
  | { kind: "key_reused" }
  /** Network error, timeout or a server fault: the purchase may or may not have committed. */
  | { kind: "unknown_outcome" }
  /** The server refused the request; nothing was charged. */
  | { kind: "rejected"; message: string }

export function classifyPurchaseError(error: unknown): PurchaseFailure {
  if (!(error instanceof ApiError)) return { kind: "unknown_outcome" }
  if (error.status >= 500 || error.status === 408) return { kind: "unknown_outcome" }
  const detail = firstDetail(error)
  switch (error.code) {
    case "INSUFFICIENT_XU":
      return { kind: "insufficient", balance: detailCount(detail, "balance_xu"), price: detailCount(detail, "price_xu") }
    case "PRICE_CHANGED":
      return { kind: "price_changed", currentPrice: detailCount(detail, "current_price_xu") }
    case "CATALOG_CHANGED":
      return { kind: "catalog_changed" }
    case "MASCOT_NOT_FOR_SALE":
      return { kind: "not_for_sale" }
    case "IDEMPOTENCY_KEY_REUSED":
      return { kind: "key_reused" }
    default:
      return { kind: "rejected", message: error.message }
  }
}

export type ActivateFailure =
  | { kind: "revision_conflict" }
  | { kind: "not_owned" }
  | { kind: "other"; message: string }

export function classifyActivateError(error: unknown): ActivateFailure {
  if (error instanceof ApiError) {
    if (error.code === "REVISION_CONFLICT") return { kind: "revision_conflict" }
    if (error.code === "MASCOT_NOT_OWNED") return { kind: "not_owned" }
    return { kind: "other", message: error.message }
  }
  return { kind: "other", message: error instanceof Error ? error.message : "Chưa đổi được linh thú." }
}
