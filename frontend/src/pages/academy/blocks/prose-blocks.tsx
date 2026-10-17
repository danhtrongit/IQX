import { Info } from "lucide-react"

import type { BlockOf } from "./block-types"
import { InlineText } from "./inline-text"

export function ParagraphBlock({ block }: { block: BlockOf<"paragraph"> }) {
  return <InlineText as="p" html={block.text} className="academy-paragraph" />
}

/** A second heading inside one section (the section title itself is an h3 of the reader). */
export function HeadingBlock({ block }: { block: BlockOf<"heading"> }) {
  return <h4 className="font-heading text-[0.9375rem] leading-snug font-semibold text-foreground">{block.text}</h4>
}

/** Disclaimer label of chapter 2 ("Số liệu giả định để minh họa"). */
export function NoteBlock({ block }: { block: BlockOf<"note"> }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-5 text-academy-subtle">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{block.text}</span>
    </p>
  )
}
