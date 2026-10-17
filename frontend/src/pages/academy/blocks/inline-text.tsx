import type { ElementType } from "react"

import { sanitizeLessonHtml } from "../sanitize"

export type InlineTextProps = {
  /** Inline HTML of the content schema (b/strong/em/br and tone-* spans only). */
  html: string
  as?: ElementType
  className?: string
}

/** One Inline string of lesson content, sanitized. F0 stub with the final signature (P5 fills it). */
export function InlineText({ html, as: Tag = "span", className }: InlineTextProps) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(html, "inline") }} />
}
