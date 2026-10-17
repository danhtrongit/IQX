import { MessageCircleQuestion, Quote, UserRound } from "lucide-react"

import { cn } from "@/lib/utils"
import { TONE_BG } from "../charts/chart-theme"
import { STATE_BORDER, STATE_TEXT } from "./block-tones"
import type { BlockOf } from "./block-types"
import { InlineText } from "./inline-text"

/** `.say`: a sample line, marked Nên (good), Không nên (bad) or Mẫu (neutral) by its label. */
export function QuoteBlock({ block }: { block: BlockOf<"quote"> }) {
  return (
    <figure className={cn("m-0 rounded-md border border-l-4 p-3", STATE_BORDER[block.tone])}>
      <figcaption className={cn("mb-1 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase", STATE_TEXT[block.tone])}>
        <Quote aria-hidden="true" className="size-3.5" />
        {block.label}
      </figcaption>
      <InlineText as="blockquote" html={block.text} className="m-0 text-sm leading-6 text-foreground" />
    </figure>
  )
}

/** `.obj`: a customer objection and the suggested response. */
export function ObjectionBlock({ block }: { block: BlockOf<"objection"> }) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
        <MessageCircleQuestion aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-warning" />
        <span>{block.objection}</span>
      </p>
      <InlineText as="p" html={block.response} className="border-l-2 border-chart-1/50 pl-3 text-sm leading-6 text-foreground" />
    </div>
  )
}

/** `.fun`: funnel bars, centred and narrowing, with the stage label and note beside them. */
export function FunnelBlock({ block }: { block: BlockOf<"funnel"> }) {
  return (
    <ol className="m-0 list-none space-y-1.5 p-0">
      {block.items.map((item, index) => (
        <li key={index} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 @min-[560px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex justify-center">
            <div className={cn("h-7 rounded-sm", TONE_BG[item.tone])} style={{ width: `${item.pct}%` }} aria-hidden="true" />
          </div>
          <div className="min-w-0 text-center @min-[560px]:text-left">
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            {item.note && <p className="text-xs text-academy-subtle">{item.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** `.post`: a social post mockup; the body keeps its line breaks. */
export function SamplePostBlock({ block }: { block: BlockOf<"sample_post"> }) {
  return (
    <figure className="m-0 overflow-hidden rounded-md border border-border">
      <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold tracking-wide text-academy-subtle uppercase">{block.kicker}</p>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-foreground">
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{block.author}</p>
            <p className="text-xs text-academy-subtle">{block.audience}</p>
          </div>
        </div>
        <p className="text-sm leading-6 whitespace-pre-line text-foreground">{block.body}</p>
      </div>
      <InlineText as="figcaption" html={block.why} className="block border-t border-border bg-muted/40 px-3 py-2 text-sm leading-6 text-foreground" />
    </figure>
  )
}
