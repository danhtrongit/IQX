import type { DirectoryEntry, IndexQuote, Quote } from "./types.ts"
import {
  envelopeTime,
  parseDirectory,
  parseErrorBody,
  parseGroupSymbols,
  parseIndices,
  parsePriceBoard,
} from "./parse.ts"
import { retryDelay } from "./polling.ts"

/** The board API takes at most this many symbols per request. */
export const PRICE_BOARD_CHUNK = 50
const INDEX_SYMBOLS = "VNINDEX,VN30,HNXIndex,HNX30,HNXUpcomIndex"

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_BASE_MS = 400
/** A server asking for a longer pause than this is left to the poller's own back-off. */
const MAX_RETRY_AFTER_MS = 5_000

export class MarketApiError extends Error {
  readonly status: number | null
  readonly code: string | null
  /** True when trying again may work: network trouble, timeouts, 429 and 5xx. */
  readonly retryable: boolean
  /** Pause the server asked for with `Retry-After`, capped. */
  readonly retryAfterMs: number | null

  constructor(
    message: string,
    options: {
      status?: number | null
      code?: string | null
      retryable?: boolean
      retryAfterMs?: number | null
    } = {}
  ) {
    super(message)
    this.name = "MarketApiError"
    this.status = options.status ?? null
    this.code = options.code ?? null
    this.retryable = options.retryable ?? false
    this.retryAfterMs = options.retryAfterMs ?? null
  }
}

export interface MarketApiOptions {
  /** API root without a trailing slash, for example `https://iqx.vn/api/v2` or `/market-api`. */
  baseUrl: string
  fetchImpl?: typeof fetch
  /** Per attempt. */
  timeoutMs?: number
  /** Extra attempts after the first one. */
  retries?: number
  retryBaseMs?: number
  /** Replaceable so tests do not wait. Must reject when the signal aborts. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export interface IndicesResult {
  indices: IndexQuote[]
  /** Server time of the answer, epoch ms. */
  asOf: number | null
}

export interface MarketApi {
  indices(signal?: AbortSignal): Promise<IndicesResult>
  quotes(symbols: readonly string[], signal?: AbortSignal): Promise<Quote[]>
  groupSymbols(group: string, signal?: AbortSignal): Promise<string[]>
  directory(signal?: AbortSignal): Promise<DirectoryEntry[]>
}

function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError")
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"))
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : null
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

export function createMarketApi(options: MarketApiOptions): MarketApi {
  const {
    baseUrl,
    fetchImpl,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    sleep = defaultSleep,
  } = options

  /** One attempt. Aborts on the caller's signal or after `timeoutMs`. */
  async function attempt(
    path: string,
    init: RequestInit,
    signal?: AbortSignal
  ): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const onCallerAbort = (): void => controller.abort()
    if (signal?.aborted) controller.abort()
    else signal?.addEventListener("abort", onCallerAbort, { once: true })

    try {
      let response: Response
      try {
        const doFetch = fetchImpl ?? fetch
        response = await doFetch(joinUrl(baseUrl, path), {
          ...init,
          signal: controller.signal,
          credentials: "omit",
        })
      } catch {
        if (signal?.aborted) throw abortError()
        throw new MarketApiError(
          timedOut ? "Hết thời gian chờ" : "Không kết nối được máy chủ",
          { retryable: true }
        )
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const { code, message } = parseErrorBody(body)
        const retryable =
          response.status === 429 ||
          response.status === 408 ||
          response.status >= 500
        throw new MarketApiError(message ?? `HTTP ${response.status}`, {
          status: response.status,
          code,
          retryable,
          retryAfterMs: retryAfterMs(response),
        })
      }
      try {
        return await response.json()
      } catch {
        if (signal?.aborted) throw abortError()
        throw new MarketApiError("Phản hồi không phải JSON", {
          status: response.status,
          retryable: false,
        })
      }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onCallerAbort)
    }
  }

  /** Request with retry and exponential back-off. Only transient failures are retried. */
  async function request(
    path: string,
    init: RequestInit,
    signal?: AbortSignal
  ): Promise<unknown> {
    for (let tries = 0; ; tries += 1) {
      try {
        return await attempt(path, init, signal)
      } catch (error) {
        const canRetry =
          error instanceof MarketApiError && error.retryable && tries < retries
        if (!canRetry) throw error
        await sleep(
          error.retryAfterMs ?? retryDelay(tries, retryBaseMs),
          signal
        )
      }
    }
  }

  const invalid = (what: string): MarketApiError =>
    new MarketApiError(`Dữ liệu ${what} không đúng định dạng`)

  return {
    async indices(signal) {
      const payload = await request(
        `market-data/overview/market-index?symbols=${INDEX_SYMBOLS}`,
        { method: "GET" },
        signal
      )
      const indices = parseIndices(payload)
      if (!indices) throw invalid("chỉ số")
      return { indices, asOf: envelopeTime(payload) }
    },

    async quotes(symbols, signal) {
      const codes = [
        ...new Set(
          symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)
        ),
      ]
      const chunks: string[][] = []
      for (let index = 0; index < codes.length; index += PRICE_BOARD_CHUNK) {
        chunks.push(codes.slice(index, index + PRICE_BOARD_CHUNK))
      }
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const payload = await request(
            "market-data/trading/price-board",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbols: chunk }),
            },
            signal
          )
          const rows = parsePriceBoard(payload)
          if (!rows) throw invalid("bảng giá")
          return rows
        })
      )
      return results.flat()
    },

    async groupSymbols(group, signal) {
      const payload = await request(
        `market-data/reference/groups/${encodeURIComponent(group)}/symbols`,
        { method: "GET" },
        signal
      )
      const symbols = parseGroupSymbols(payload)
      if (!symbols) throw invalid("rổ cổ phiếu")
      return symbols
    },

    async directory(signal) {
      const payload = await request(
        "market-data/reference/symbols",
        { method: "GET" },
        signal
      )
      const entries = parseDirectory(payload)
      if (!entries) throw invalid("danh sách mã")
      return entries
    },
  }
}
