import { ChartLine, Landmark, Vault } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_TONE_FRAME, CARD_TONE_TEXT, STATE_BG, STATE_BORDER, STATE_TEXT } from "./block-tones"
import type { BlockOf } from "./block-types"

const STAT_ICON = { vault: Vault, landmark: Landmark, "chart-line": ChartLine } as const

const STAT_COLUMNS = {
  2: "grid-cols-2",
  3: "grid-cols-1 @min-[480px]:grid-cols-3",
  4: "grid-cols-2 @min-[640px]:grid-cols-4",
} as const

/** `.three3` (hero, Lucide icon), `.mini3` (chip) and `.big3` (big) figures. */
export function StatsBlock({ block }: { block: BlockOf<"stats"> }) {
  const columns = STAT_COLUMNS[block.items.length as 2 | 3 | 4]
  if (block.variant === "chip") {
    return (
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {block.items.map((item, index) => (
          <li
            key={index}
            className={cn("inline-flex items-baseline gap-2 rounded-full border px-3 py-1 text-sm", item.highlight ? CARD_TONE_FRAME.highlight : CARD_TONE_FRAME[item.tone ?? "neutral"])}
          >
            <span className="text-academy-subtle">{item.label}</span>
            <b className={cn("font-semibold tabular-nums", item.tone ? CARD_TONE_TEXT[item.tone] : "text-foreground")}>{item.value}</b>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className={cn("grid gap-3", columns)}>
      {block.items.map((item, index) => {
        const Icon = item.icon ? STAT_ICON[item.icon] : null
        return (
          <div
            key={index}
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-md border p-3",
              block.variant === "big" && "items-center text-center",
              item.highlight ? CARD_TONE_FRAME.highlight : CARD_TONE_FRAME[item.tone ?? "neutral"],
            )}
          >
            {Icon && <Icon aria-hidden="true" className={cn("size-5", item.highlight ? "text-chart-1" : item.tone ? CARD_TONE_TEXT[item.tone] : "text-academy-subtle")} />}
            {block.variant === "big" ? (
              <>
                <p className={cn("font-heading text-2xl font-bold tabular-nums", item.tone ? CARD_TONE_TEXT[item.tone] : "text-foreground")}>{item.value}</p>
                <p className="text-sm text-foreground">{item.label}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className={cn("font-heading text-xl font-bold tabular-nums", item.highlight ? "text-chart-1" : item.tone ? CARD_TONE_TEXT[item.tone] : "text-foreground")}>
                  {item.value}
                </p>
              </>
            )}
            {item.note && <p className="text-xs text-academy-subtle">{item.note}</p>}
          </div>
        )
      })}
    </div>
  )
}

/** `.st3` margin gauges: a bar per state with its value, caption and badge. */
export function GaugesBlock({ block }: { block: BlockOf<"gauges"> }) {
  return (
    <div className={cn("grid gap-3", block.items.length === 2 ? "grid-cols-1 @min-[480px]:grid-cols-2" : "grid-cols-1 @min-[560px]:grid-cols-3")}>
      {block.items.map((item, index) => (
        <div key={index} className={cn("flex min-w-0 flex-col gap-2 rounded-md border p-3", STATE_BORDER[item.tone])}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{item.label}</p>
            <p className={cn("font-heading text-lg font-bold tabular-nums", STATE_TEXT[item.tone])}>{item.value}</p>
          </div>
          <div
            role="meter"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={item.pct}
            aria-valuetext={item.value}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className={cn("h-full rounded-full", STATE_BG[item.tone])} style={{ width: `${item.pct}%` }} />
          </div>
          <p className="text-xs text-academy-subtle tabular-nums">{item.caption}</p>
          <p className={cn("text-xs font-semibold", STATE_TEXT[item.tone])}>{item.badge}</p>
        </div>
      ))}
    </div>
  )
}

/** Receipts and order tickets (C1L3-g1, C1L4-g2). */
export function KvCardsBlock({ block }: { block: BlockOf<"kv_cards"> }) {
  return (
    <div className={cn("grid gap-3", block.items.length > 1 ? "grid-cols-1 @min-[480px]:grid-cols-2" : "grid-cols-1 @min-[480px]:max-w-sm")}>
      {block.items.map((item, index) => (
        <div key={index} className={cn("min-w-0 rounded-md border p-3", CARD_TONE_FRAME[item.tone ?? "neutral"])}>
          <p className={cn("mb-2 text-sm font-bold tracking-wide", item.tone ? CARD_TONE_TEXT[item.tone] : "text-foreground")}>{item.title}</p>
          <dl className="m-0 space-y-1 text-sm">
            {item.rows.map((row, rowIndex) => (
              <div key={rowIndex} className="flex items-baseline justify-between gap-3">
                <dt className="text-academy-subtle">{row.label}</dt>
                <dd className="m-0 font-medium text-foreground tabular-nums">{row.value}</dd>
              </div>
            ))}
            {item.total && (
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-2">
                <dt className="font-semibold text-foreground">{item.total.label}</dt>
                <dd className={cn("m-0 font-bold tabular-nums", item.total.tone ? CARD_TONE_TEXT[item.total.tone] : "text-foreground")}>{item.total.value}</dd>
              </div>
            )}
          </dl>
        </div>
      ))}
    </div>
  )
}

const OP_LABEL = { "÷": "chia", "×": "nhân", "+": "cộng", "-": "trừ" } as const

/** `a ÷ b = c` rows (C5L2-g3). */
export function FormulaBlock({ block }: { block: BlockOf<"formula"> }) {
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {block.rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-1 px-3 py-2.5 @min-[560px]:flex-row @min-[560px]:items-center @min-[560px]:gap-4">
          <p className="shrink-0 font-heading text-sm font-bold text-chart-1 @min-[560px]:w-16">{row.label}</p>
          <p className="min-w-0 flex-1 text-sm text-foreground tabular-nums">
            <span>{row.a}</span>
            <span className="mx-1.5 font-semibold text-academy-subtle" aria-label={OP_LABEL[row.op]}>
              {row.op}
            </span>
            <span>{row.b}</span>
          </p>
          <p className="shrink-0 text-sm font-bold text-foreground tabular-nums">
            <span className="mr-1.5 font-semibold text-academy-subtle" aria-hidden="true">
              =
            </span>
            {row.result}
          </p>
        </div>
      ))}
    </div>
  )
}

type Tile = BlockOf<"tiles">["items"][number]

function TileCard({ tile }: { tile: Tile }) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-center", tile.highlight ? CARD_TONE_FRAME.highlight : "border-border")}>
      <span className={cn("font-heading text-xl font-bold tabular-nums", tile.highlight ? "text-chart-1" : "text-foreground")}>{tile.glyph}</span>
      {tile.title && <span className="text-xs font-semibold text-foreground">{tile.title}</span>}
      {tile.sub && <span className="text-[11px] leading-snug text-academy-subtle">{tile.sub}</span>}
    </div>
  )
}

/** Big glyph tiles with optional groups (C4L9-g1, C5L3-g1, C5L4-g1). */
export function TilesBlock({ block }: { block: BlockOf<"tiles"> }) {
  const titled = block.items.some((item) => item.title || item.sub)
  const grid = titled ? "grid-cols-2 @min-[560px]:grid-cols-4" : "grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))]"
  const groups = block.groups ?? []
  const grouped = new Set(groups.flatMap((group) => Array.from({ length: group.to - group.from + 1 }, (_, k) => group.from + k)))
  return (
    <div className="space-y-3">
      {groups.length > 0 ? (
        <div className="flex flex-col gap-3 @min-[560px]:flex-row">
          {groups.map((group, index) => (
            <fieldset key={index} className="m-0 min-w-0 rounded-md border border-dashed border-chart-1/50 p-2" style={{ flexGrow: group.to - group.from + 1 }}>
              <legend className="px-1 text-xs font-semibold text-chart-1">{group.label}</legend>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2">
                {block.items.slice(group.from, group.to + 1).map((tile, tileIndex) => (
                  <TileCard key={tileIndex} tile={tile} />
                ))}
              </div>
            </fieldset>
          ))}
          {block.items.some((_, index) => !grouped.has(index)) && (
            <div className={cn("grid gap-2", grid)}>
              {block.items.map((tile, index) => (grouped.has(index) ? null : <TileCard key={index} tile={tile} />))}
            </div>
          )}
        </div>
      ) : (
        <div className={cn("grid gap-2", grid)}>
          {block.items.map((tile, index) => (
            <TileCard key={index} tile={tile} />
          ))}
        </div>
      )}
      {block.facts && (
        <div className="grid grid-cols-1 gap-2 @min-[480px]:grid-cols-3">
          {block.facts.map((fact, index) => (
            <div key={index} className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-academy-subtle tabular-nums">{fact.label}</p>
              <p className="font-heading text-lg font-bold text-foreground tabular-nums">{fact.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
