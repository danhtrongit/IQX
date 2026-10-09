import { useMemo } from "react"

import { cn } from "@/lib/utils"
import { sanitizeLessonHtml, type SanitizeMode } from "../sanitize"
import "../academy.css"

/**
 * Renders lesson HTML after the allowlist sanitizer. `flow` is for `html` blocks and step bodies
 * (paragraphs, formulas, fractions, sub/sup, lists, tables); `inline` is for table cells and
 * summaries. `< > ∈ ∉ &` arrive as text, never as markup.
 */
export function HtmlContent({ html, mode = "flow", className }: { html: string; mode?: SanitizeMode; className?: string }) {
  const safe = useMemo(() => sanitizeLessonHtml(html, mode), [html, mode])
  if (mode === "inline") return <span className={className} dangerouslySetInnerHTML={{ __html: safe }} />
  return <div className={cn("academy-prose", className)} dangerouslySetInnerHTML={{ __html: safe }} />
}
