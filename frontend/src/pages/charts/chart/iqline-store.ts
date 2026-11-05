/**
 * Lưu hình vẽ và chỉ báo của IQLine theo từng người dùng và từng mã (docs/iqline-design.md §11).
 *
 * Dùng lại endpoint `/chart-drawings/{symbol}` của `drawing-persistence.ts`; `state` là `ChartDocument`. API là nguồn
 * chính, bộ nhớ trình duyệt (`iqx.iqline_drawings_v1_*`) là bản đệm, khách chỉ lưu trên máy. Layout TradingView cũ
 * (`iqx.tv_drawings_v2_*` hoặc `charts` trên server) được chuyển sang IQLine khi tải, và `charts` luôn được giữ
 * khi lưu để quay lại TradingView không mất dữ liệu.
 *
 * Lỗi lưu trữ (localStorage, JSON hỏng, API) không bao giờ làm hỏng biểu đồ: `load` trả null, `save` không ném.
 */
import { toast } from "sonner"

import { api } from "@/lib/api"
import { TOOL_SPECS, anchorCountOf, fromTradingViewLayout, isDrawingTool, maxAnchorsOf, type TradingViewConversion } from "@/lib/iqline/drawings"
import { MAX_STATE_BYTES } from "@/lib/iqline/drawings/tradingview"
import { COLOR_TOKENS } from "@/lib/iqline/render/palette"
import type {
  Anchor,
  ChartDocument,
  ChartIndicatorInput,
  ChartType,
  Drawing,
  DrawingStyle,
  IQLineStore,
  IndicatorParams,
} from "@/lib/iqline/types"

import { currentOwner, lsLoad as loadTradingViewCache } from "./drawing-persistence"

const LS_PREFIX = "iqx.iqline_drawings_v1_"
const SAVE_DEBOUNCE_MS = 1500
/** Số mã tối đa mà store nhớ `charts` (mỗi layout thường dưới 50 KB). */
const MAX_REMEMBERED_CHARTS = 64

export type IQLineStoreOptions = {
  /** Báo người dùng một câu ngắn (mặc định là `toast.info`). */
  notify?: (message: string) => void
}

/** Cặp (owner, mã) đã báo "không chuyển được" trong phiên này; mỗi cặp chỉ báo một lần. */
const reported = new Set<string>()

// ------------------------------------------------------------------ API

const chartDrawingsApi = {
  get: (symbol: string) => api<{ symbol?: string; state?: unknown; updated_at?: string | null }>(`/chart-drawings/${encodeURIComponent(symbol)}`),
  /** `body` là JSON đã tuần tự hoá sẵn, để bản gửi đi đúng bằng bản đã kiểm tra kích thước. */
  put: (symbol: string, body: string) => api<unknown>(`/chart-drawings/${encodeURIComponent(symbol)}`, { method: "PUT", body }),
}

// ------------------------------------------------------------------ bản đệm trình duyệt

function cacheKey(owner: string, symbol: string): string {
  return `${LS_PREFIX}${owner}:${symbol.toUpperCase()}`
}

function readCache(owner: string, symbol: string): unknown {
  try {
    const raw = localStorage.getItem(cacheKey(owner, symbol))
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeCache(owner: string, symbol: string, json: string): void {
  try {
    localStorage.setItem(cacheKey(owner, symbol), json)
  } catch {
    // Hết dung lượng hoặc chế độ riêng tư: bỏ qua, biểu đồ vẫn dùng được.
  }
}

// ------------------------------------------------------------------ đọc và làm sạch tài liệu

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

const CHART_TYPES: readonly ChartType[] = ["candles", "hollow", "ohlc", "line", "area", "heikin-ashi"]

function chartTypeOf(value: unknown): ChartType {
  return CHART_TYPES.find((type) => type === value) ?? "candles"
}

function readAnchor(raw: unknown): Anchor | null {
  if (!isRecord(raw)) return null
  const price = finite(raw.price)
  if (price === null) return null
  const time = finite(raw.time)
  if (time !== null) return { time, price }
  const session = finite(raw.session)
  return session !== null ? { session, price } : null
}

function readStyle(raw: unknown, base: DrawingStyle): DrawingStyle {
  const style: DrawingStyle = { ...base }
  if (!isRecord(raw)) return style
  const color = COLOR_TOKENS.find((token) => token === raw.color)
  if (color) style.color = color
  const width = finite(raw.width)
  if (width !== null && width > 0) style.width = Math.min(8, width)
  if (raw.dash === "solid" || raw.dash === "dashed") style.dash = raw.dash
  if (typeof raw.fill === "boolean") style.fill = raw.fill
  return style
}

/** Hình sai kiểu, thiếu điểm neo hoặc điểm neo không hữu hạn bị bỏ. */
function readDrawing(raw: unknown): Drawing | null {
  if (!isRecord(raw)) return null
  const id = nonEmptyString(raw.id)
  if (!id || !isDrawingTool(raw.tool) || !Array.isArray(raw.anchors)) return null
  const tool = raw.tool
  const required = anchorCountOf(tool)
  if (raw.anchors.length < required) return null
  const anchors: Anchor[] = []
  // Nét bút và đường gấp khúc có số điểm thay đổi: giữ tới số điểm tối đa của công cụ, các công cụ khác giữ đúng số điểm cần.
  for (const item of raw.anchors.slice(0, maxAnchorsOf(tool))) {
    const anchor = readAnchor(item)
    if (!anchor) return null
    anchors.push(anchor)
  }
  const drawing: Drawing = { id, tool, anchors, style: readStyle(raw.style, TOOL_SPECS[tool].defaultStyle) }
  if (typeof raw.text === "string") drawing.text = raw.text
  if (raw.locked === true) drawing.locked = true
  if (raw.hidden === true) drawing.hidden = true
  return drawing
}

function readIndicator(raw: unknown): ChartIndicatorInput | null {
  if (!isRecord(raw)) return null
  const key = nonEmptyString(raw.key)
  const id = nonEmptyString(raw.id)
  if (!key || !id) return null
  const params: IndicatorParams = {}
  if (isRecord(raw.params)) {
    for (const [name, value] of Object.entries(raw.params)) {
      if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "string" || typeof value === "boolean") params[name] = value
    }
  }
  const indicator: ChartIndicatorInput = { key, id, params }
  if (raw.hidden === true) indicator.hidden = true
  return indicator
}

/** Đọc từng phần tử, bỏ phần tử hỏng và phần tử trùng khoá (`identity`) thay vì vứt cả tài liệu. */
function readList<T>(raw: readonly unknown[], read: (item: unknown) => T | null, identity: (value: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of raw) {
    const value = read(item)
    if (!value) continue
    const key = identity(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

/** Khoá `iqline` hợp lệ khi có version 1 cùng hai mảng; `chartType` lạ thì về nến thường. */
function readIqline(raw: unknown): ChartDocument["iqline"] | null {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.drawings) || !Array.isArray(raw.indicators)) return null
  return {
    version: 1,
    drawings: readList(raw.drawings, readDrawing, (drawing) => drawing.id),
    indicators: readList(raw.indicators, readIndicator, (indicator) => indicator.key),
    chartType: chartTypeOf(raw.chartType),
  }
}

type ParsedState = { document: ChartDocument; conversion: TradingViewConversion | null }

/** `iqline` hợp lệ thì dùng luôn; chỉ có `charts` thì chuyển từ layout TradingView; còn lại không đọc được. */
function parseState(raw: unknown): ParsedState | null {
  if (!isRecord(raw)) return null
  const charts = Array.isArray(raw.charts) ? raw.charts : undefined
  const iqline = readIqline(raw.iqline)
  if (iqline) return { document: charts ? { iqline, charts } : { iqline }, conversion: null }
  if (!charts) return null
  const conversion = fromTradingViewLayout(raw)
  return { document: conversion.document, conversion }
}

// ------------------------------------------------------------------ kích thước

function utf8Bytes(value: string): number {
  let bytes = 0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

/** Báo đúng một lần cho mỗi `sessionKey` (owner và mã) trong phiên. */
function reportSkipped(conversion: TradingViewConversion, notify: (message: string) => void, sessionKey: string): void {
  const total = conversion.skippedDrawings + conversion.skippedIndicators
  if (total === 0 || reported.has(sessionKey)) return
  reported.add(sessionKey)
  try {
    notify(
      conversion.skippedIndicators > 0
        ? `${total} hình vẽ hoặc chỉ báo không chuyển được sang IQLine`
        : `${total} hình vẽ không chuyển được sang IQLine`,
    )
  } catch {
    // Báo lỗi không được làm hỏng việc nạp biểu đồ.
  }
}

// ------------------------------------------------------------------ store

export function createIQLineStore(options: IQLineStoreOptions = {}): IQLineStore {
  const notify = options.notify ?? ((message: string) => void toast.info(message))
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** `charts` của lần nạp gần nhất theo (owner, mã); ghép lại khi lưu để quay về TradingView không mất hình. */
  const chartsByKey = new Map<string, unknown[]>()

  function remember(key: string, charts: unknown[] | undefined): void {
    chartsByKey.delete(key)
    if (!charts) return
    chartsByKey.set(key, charts)
    if (chartsByKey.size > MAX_REMEMBERED_CHARTS) {
      const oldest = chartsByKey.keys().next().value
      if (oldest !== undefined) chartsByKey.delete(oldest)
    }
  }

  function schedulePut(owner: string, symbol: string, body: string): void {
    const key = cacheKey(owner, symbol)
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        if (currentOwner() !== owner) return
        void (async () => {
          try {
            await chartDrawingsApi.put(symbol, body)
          } catch {
            // Lỗi mạng hoặc xác thực: bản đệm trình duyệt đã có.
          }
        })()
      }, SAVE_DEBOUNCE_MS),
    )
  }

  /** Ghi bản đệm ngay; người đăng nhập thì đặt lịch PUT (debounce theo khoá). Không bao giờ ném lỗi. */
  function persist(owner: string, symbol: string, document: ChartDocument): void {
    try {
      const key = cacheKey(owner, symbol)
      const charts = document.charts ?? chartsByKey.get(key)
      let json = JSON.stringify(charts ? { iqline: document.iqline, charts } : { iqline: document.iqline })
      let size = utf8Bytes(json)
      if (charts) {
        if (size > MAX_STATE_BYTES) {
          // Quá 512 KB thì bỏ `charts` của mã này (hình TradingView cũ không quay lại được).
          chartsByKey.delete(key)
          json = JSON.stringify({ iqline: document.iqline })
          size = utf8Bytes(json)
        } else remember(key, charts)
      }
      writeCache(owner, symbol, json)
      if (owner === "guest") return
      if (size > MAX_STATE_BYTES) {
        // Chỉ riêng `iqline` đã quá lớn: giữ bản đệm, không gửi lên server.
        clearTimeout(timers.get(key))
        timers.delete(key)
        return
      }
      schedulePut(owner, symbol, `{"state":${json}}`)
    } catch {
      // Tài liệu không tuần tự hoá được hoặc lỗi bất ngờ: bỏ qua, không làm hỏng biểu đồ.
    }
  }

  return {
    async load(symbol) {
      try {
        const sym = symbol.toUpperCase()
        const owner = currentOwner()
        if (!owner) return null

        let parsed: ParsedState | null = null
        if (owner !== "guest") {
          let state: unknown = null
          try {
            state = (await chartDrawingsApi.get(sym))?.state ?? null
          } catch {
            // Lỗi mạng: rơi về bản đệm.
          }
          // Đổi tài khoản giữa chừng thì không trả hình của tài khoản cũ.
          if (currentOwner() !== owner) return null
          parsed = parseState(state)
        }
        parsed ??= parseState(readCache(owner, sym))
        parsed ??= parseState(loadTradingViewCache(owner, sym))
        if (!parsed) return null

        const { document, conversion } = parsed
        remember(cacheKey(owner, sym), document.charts)
        if (conversion) {
          reportSkipped(conversion, notify, `${owner}:${sym}`)
          // Lưu ngay bản đã chuyển để lần nạp sau có `iqline` và không phải chuyển lại.
          if (conversion.convertedDrawings + conversion.convertedIndicators + conversion.skippedDrawings + conversion.skippedIndicators > 0) {
            persist(owner, sym, document)
          }
        }
        return document
      } catch {
        return null
      }
    },

    save(symbol, document) {
      try {
        const owner = currentOwner()
        if (!owner) return
        persist(owner, symbol.toUpperCase(), document)
      } catch {
        // Không bao giờ ném lỗi ra ngoài.
      }
    },
  }
}

/** Singleton dùng chung để mọi lần dựng biểu đồ chia sẻ một bộ hẹn giờ debounce và một bộ nhớ `charts`. */
let shared: IQLineStore | null = null
export function getIQLineStore(): IQLineStore {
  if (!shared) shared = createIQLineStore()
  return shared
}
