/**
 * Inline HTML sanitizer — allowlist-only, no external dependencies.
 *
 * Allowed tags:
 *   - <span class="num|up-text|down-text">…</span>
 *   - <strong>…</strong>
 *
 * All other tags are stripped (inner text is preserved).
 * All attributes except the allowed `class` on span are removed.
 * Script/style tag content is also stripped (not just the tags).
 */

import { normalizeNumberFormat } from "@/shared/lib/normalizeNumberFormat"

const ALLOWED_SPAN = /^(num|up-text|down-text)$/

export function sanitizeInline(html: string): string {
  if (!html) return ""
  // First strip script/style blocks entirely (including their content).
  let result = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
  // Track which span tags are allowed so we can correctly handle closing tags.
  const spanStack: boolean[] = []
  result = result.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_m, close, tag, attrs) => {
    const t = tag.toLowerCase()
    if (t === "strong") return `<${close}strong>`
    if (t === "span") {
      if (close) {
        const wasAllowed = spanStack.pop() ?? false
        return wasAllowed ? "</span>" : ""
      }
      const cls = /class\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1] ?? ""
      const allowed = ALLOWED_SPAN.test(cls.trim())
      spanStack.push(allowed)
      return allowed ? `<span class="${cls.trim()}">` : ""
    }
    return "" // drop any other tag, keep inner text
  })
  // AI market-analysis narrative is rendered verbatim → normalize vi-VN number
  // formatting (e.g. "1,85%") to the app-wide en-US standard. Runs on the
  // already-sanitized output; the allowed class values contain no digit,digit
  // sequences so tags are untouched.
  return normalizeNumberFormat(result)
}
