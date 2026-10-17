import { Check, CircleX, Lightbulb } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_TONE_BG, CARD_TONE_FRAME, CARD_TONE_TEXT } from "./block-tones"
import type { BlockOf } from "./block-types"
import { InlineText } from "./inline-text"

/** Card grids collapse to one column below 560px of the reader (container query on BlockRenderer). */
const GRID_COLUMNS = {
  2: "grid-cols-1 @min-[560px]:grid-cols-2",
  3: "grid-cols-1 @min-[560px]:grid-cols-3",
  4: "grid-cols-1 @min-[560px]:grid-cols-2 @min-[760px]:grid-cols-4",
} as const

type Card = BlockOf<"cards">["items"][number]

function CardBody({ item, style }: { item: Card; style: BlockOf<"cards">["style"] }) {
  return (
    <>
      {item.eyebrow && <p className="text-[11px] font-semibold tracking-wide text-academy-subtle uppercase">{item.eyebrow}</p>}
      <p className={cn("text-sm leading-snug font-semibold", item.title_tone ? CARD_TONE_TEXT[item.title_tone] : "text-foreground")}>
        {style === "tip" && <Lightbulb aria-hidden="true" className="mr-1.5 mb-0.5 inline size-4 text-status-warning" />}
        {style === "mistake" && <CircleX aria-hidden="true" className="mr-1.5 mb-0.5 inline size-4 text-destructive" />}
        {item.title}
      </p>
      {item.subtitle && <p className="text-xs text-academy-subtle">{item.subtitle}</p>}
      {item.text && <InlineText as="p" html={item.text} className="text-sm leading-6 text-foreground" />}
      {item.bullets && (
        <ul className="m-0 list-disc space-y-1 pl-4 text-sm leading-6 text-foreground">
          {item.bullets.map((bullet, index) => (
            <InlineText key={index} as="li" html={bullet} />
          ))}
        </ul>
      )}
      {item.facts && (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {item.facts.map((fact, index) => (
            <div key={index} className="contents">
              <dt className="text-academy-subtle">{fact.label}</dt>
              <dd className="m-0 text-right font-semibold text-foreground tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  )
}

/** `.ex2`, `.ex3`, `.vvca` (card), `.three` (tip) and `.mis` (mistake) grids. */
export function CardsBlock({ block }: { block: BlockOf<"cards"> }) {
  return (
    <div className={cn("grid gap-3", GRID_COLUMNS[block.columns])}>
      {block.items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "flex min-w-0 flex-col gap-1.5 rounded-md border p-3",
            block.style === "tip" && "bg-muted/40",
            block.style === "mistake" && "border-l-2 border-l-destructive/70",
            CARD_TONE_FRAME[item.tone ?? "neutral"],
          )}
        >
          <CardBody item={item} style={block.style} />
        </div>
      ))}
    </div>
  )
}

/** `.flow4` and step figures: a numbered row on a wide reader, a numbered list on a phone. */
export function StepsBlock({ block }: { block: BlockOf<"steps"> }) {
  const columns =
    block.items.length <= 3
      ? "@min-[560px]:grid-cols-3"
      : block.items.length === 4
        ? "@min-[560px]:grid-cols-2 @min-[720px]:grid-cols-4"
        : "@min-[560px]:grid-cols-3"
  return (
    <ol className={cn("m-0 grid list-none grid-cols-1 gap-3 p-0", block.items.length === 2 ? "@min-[560px]:grid-cols-2" : columns)}>
      {block.items.map((item, index) => (
        <li key={index} className="flex min-w-0 gap-3 rounded-md border border-border p-3">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-chart-1/15 text-xs font-semibold text-chart-1 tabular-nums">
            {index + 1}
          </span>
          <div className="min-w-0 space-y-1">
            {item.label && <p className="text-[11px] font-semibold tracking-wide text-academy-subtle uppercase">{item.label}</p>}
            <p className="text-sm leading-snug font-semibold text-foreground">{item.title}</p>
            {item.value && <p className="text-sm font-semibold text-foreground tabular-nums">{item.value}</p>}
            {item.text && <InlineText as="p" html={item.text} className="text-sm leading-6 text-foreground" />}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** `.roles` term lists, and the read-only checklist card (`marker: 'check'`). */
export function DefinitionsBlock({ block }: { block: BlockOf<"definitions"> }) {
  return (
    <div className="space-y-2">
      {block.title && <p className="text-sm font-semibold text-foreground">{block.title}</p>}
      {block.marker === "check" ? (
        <ul className="m-0 list-none space-y-2 rounded-md border border-border p-3">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm leading-6">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-(--status-success)" />
              <span className="min-w-0">
                <b className={cn("font-semibold", item.tone ? CARD_TONE_TEXT[item.tone] : "text-foreground")}>{item.term}</b>{" "}
                <InlineText html={item.text} className="text-foreground" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <dl className="m-0 divide-y divide-border rounded-md border border-border">
          {block.items.map((item, index) => (
            <div key={index} className="flex flex-col gap-0.5 px-3 py-2 @min-[560px]:flex-row @min-[560px]:gap-4">
              <dt className={cn("flex shrink-0 items-start gap-2 text-sm font-semibold @min-[560px]:w-44", item.tone ? CARD_TONE_TEXT[item.tone] : "text-foreground")}>
                {item.tone && <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", CARD_TONE_BG[item.tone])} />}
                {item.term}
              </dt>
              <dd className="m-0 min-w-0 text-sm leading-6 text-foreground">
                <InlineText html={item.text} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
