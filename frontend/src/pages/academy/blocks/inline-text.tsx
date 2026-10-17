import { useMemo, type ElementType } from "react"

import { cn } from "@/lib/utils"
import { sanitizeLessonHtml } from "../sanitize"

export type InlineTextProps = {
  /** Inline HTML of the content schema (b/strong/em/br and tone-* spans only). */
  html: string
  as?: ElementType
  className?: string
}

/**
 * One Inline string of lesson content. It is rebuilt by the allowlist sanitizer before it is
 * injected; tone spans are styled by `academy.css` (`.academy-inline`).
 */
export function InlineText({ html, as: Tag = "span", className }: InlineTextProps) {
  const clean = useMemo(() => sanitizeLessonHtml(html), [html])
  return <Tag className={cn("academy-inline", className)} dangerouslySetInnerHTML={{ __html: clean }} />
}
