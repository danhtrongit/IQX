/**
 * Nhập liệu và định dạng của màn soạn bản tin: ô số điểm chấp nhận kiểu Việt Nam (`1.755,5`),
 * bản nháp là chuỗi người dùng gõ, còn nội dung gửi máy chủ là số hoặc null.
 */
import type {
  AdminBulletinChecks,
  AdminBulletinContent,
  AdminBulletinStatus,
  AdminBulletinSuggestion,
  CommentKey,
  LevelKey,
} from "./bulletin-admin-api"

export const COMMENT_LIMIT = 420

export const COMMENT_FIELDS: { key: CommentKey; label: string }[] = [
  { key: "trend", label: "Xu hướng" },
  { key: "momentum", label: "Động lượng" },
  { key: "liquidity", label: "Thanh khoản" },
]

export const RESISTANCE_KEYS = ["r1", "r2"] as const satisfies readonly LevelKey[]
export const SUPPORT_KEYS = ["s1", "s2"] as const satisfies readonly LevelKey[]
export const LEVEL_KEYS: readonly LevelKey[] = ["r1", "r2", "s1", "s2", "pa", "pt", "na", "nt"]

export const STATUS_LABEL: Record<AdminBulletinStatus, string> = {
  draft: "Nháp",
  public: "Đang trên web",
  unpublic: "Đã gỡ",
}

export type LevelDraft = Record<LevelKey, string>
export type ContentDraft = { trend: string; momentum: string; liquidity: string; levels: LevelDraft }

export type ParsedLevel = { ok: true; value: number | null } | { ok: false }

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/

/**
 * `1.755,5` và `1755,5` là 1755,5; `1.755` là 1755 (dấu chấm hàng nghìn); `1755.5` cũng được hiểu
 * là 1755,5. Ô trống là chưa nhập (null); chữ, số âm hoặc bằng 0 là không hợp lệ.
 */
export function parseLevelInput(text: string): ParsedLevel {
  const raw = text.trim().replace(/\s+/g, "")
  if (raw === "") return { ok: true, value: null }
  let normalized: string | null = null
  if (raw.includes(",")) {
    const [integerPart = "", fractionPart = "", ...rest] = raw.split(",")
    const integerOk = /^\d+$/.test(integerPart) || THOUSANDS.test(integerPart)
    if (rest.length === 0 && integerOk && /^\d+$/.test(fractionPart)) {
      normalized = `${integerPart.replaceAll(".", "")}.${fractionPart}`
    }
  } else if (THOUSANDS.test(raw)) {
    normalized = raw.replaceAll(".", "")
  } else if (/^\d+$/.test(raw) || /^\d+\.\d+$/.test(raw)) {
    normalized = raw
  }
  if (normalized === null) return { ok: false }
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? { ok: true, value } : { ok: false }
}

export function formatLevelInput(value: number | null): string {
  if (value === null) return ""
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2, minimumFractionDigits: 0, useGrouping: true }).format(value)
}

export function draftFromContent(content: AdminBulletinContent): ContentDraft {
  const levels = {} as LevelDraft
  for (const key of LEVEL_KEYS) levels[key] = formatLevelInput(content.levels[key])
  return { trend: content.trend, momentum: content.momentum, liquidity: content.liquidity, levels }
}

/** Các ô mức giá đang gõ sai (không phải số điểm). */
export function invalidLevels(draft: ContentDraft): LevelKey[] {
  return LEVEL_KEYS.filter((key) => !parseLevelInput(draft.levels[key]).ok)
}

/** Nội dung gửi máy chủ; null khi còn ô số gõ sai (không lưu, không xem trước). */
export function contentFromDraft(draft: ContentDraft): AdminBulletinContent | null {
  const levels = {} as AdminBulletinContent["levels"]
  for (const key of LEVEL_KEYS) {
    const parsed = parseLevelInput(draft.levels[key])
    if (!parsed.ok) return null
    levels[key] = parsed.value
  }
  return { trend: draft.trend, momentum: draft.momentum, liquidity: draft.liquidity, levels }
}

/** Khoá so sánh nội dung: máy chủ cắt khoảng trắng hai đầu nên so sánh cũng cắt. */
export function contentKey(content: AdminBulletinContent): string {
  return JSON.stringify([
    content.trend.trim(),
    content.momentum.trim(),
    content.liquidity.trim(),
    LEVEL_KEYS.map((key) => content.levels[key]),
  ])
}

function sortedLevels(values: (number | null)[], side: "resistance" | "support"): (number | null)[] {
  const filled = values.filter((value): value is number => value !== null)
  filled.sort((a, b) => (side === "resistance" ? a - b : b - a))
  return [...filled, ...values.filter((value) => value === null)]
}

/**
 * Bấm một gợi ý: mức cao hơn giá điền ô kháng cự trống đầu tiên, mức thấp hơn điền ô hỗ trợ trống
 * đầu tiên; hai ô đã đầy thì thay ô thứ 2. Sau đó xếp lại để mức 1 gần giá nhất. Mức đã có thì giữ nguyên.
 */
export function applySuggestion(levels: LevelDraft, suggestion: Pick<AdminBulletinSuggestion, "value" | "side">): LevelDraft {
  const keys = suggestion.side === "resistance" ? RESISTANCE_KEYS : SUPPORT_KEYS
  const current = keys.map((key) => {
    const parsed = parseLevelInput(levels[key])
    return parsed.ok ? parsed.value : null
  })
  if (current.includes(suggestion.value)) return levels
  const emptyIndex = current.indexOf(null)
  current[emptyIndex >= 0 ? emptyIndex : 1] = suggestion.value
  const ordered = sortedLevels(current, suggestion.side)
  return { ...levels, [keys[0]]: formatLevelInput(ordered[0] ?? null), [keys[1]]: formatLevelInput(ordered[1] ?? null) }
}

/** Các ô chữ đang có lỗi (viền đỏ) theo kết quả kiểm tra của máy chủ. */
export function errorFields(checks: Pick<AdminBulletinChecks, "items">): Set<string> {
  return new Set(checks.items.filter((item) => item.level === "error" && item.field).map((item) => item.field as string))
}

/** Trang Bộ lọc; có `filter` thì nạp đúng bộ lọc đã đẩy (phiên bản hiện tại của nó). */
export function filterPageHref(filterId?: string): string {
  const query = new URLSearchParams({ tab: "bo-loc" })
  if (filterId) query.set("filter", filterId)
  return `/chien-luoc?${query}`
}
