/**
 * One detail layer (L1–L5): number + name, status label with the 5-step scale,
 * the narrative field list, an optional chart/news slot and the diff footer.
 */
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import type { LayerCard as LayerCardData } from "../types"

import { LayerDiff } from "./layer-diff"
import { NarrativeText } from "./narrative-text"
import { StatusScale } from "./status-scale"

type L1To5 = 1 | 2 | 3 | 4 | 5

const STATUS_TONE: Record<L1To5, string> = {
  1: "text-price-down",
  2: "text-price-down",
  3: "text-foreground",
  4: "text-price-up",
  5: "text-price-up",
}

export function LayerCard({ data, chart }: { data: LayerCardData; chart?: ReactNode }) {
  const fields = data.fields ?? []

  return (
    <section
      data-tour-id={`tour-phantich-${data.layerNum?.toLowerCase()}`}
      className="rounded-lg border-0 bg-card px-4 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-xs font-semibold tracking-wide text-price-ref">{data.layerNum}</span>
          <span className="font-heading text-base font-bold">{data.layerName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-xs font-semibold tracking-wide uppercase",
              STATUS_TONE[data.statusLevel] ?? "text-foreground",
            )}
          >
            {data.statusLabel}
          </span>
          <StatusScale level={data.statusLevel} />
        </div>
      </div>

      {fields.length > 0 ? (
        <div className="flex flex-col gap-2.5 pt-3">
          {fields.map((field, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-0.5 text-xs leading-5 md:grid-cols-[150px_1fr] md:gap-4"
            >
              <span className="pt-px text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {field.label}
              </span>
              <span>
                <NarrativeText fragments={field.value} />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {chart}

      {data.diff ? <LayerDiff diff={data.diff} /> : null}
    </section>
  )
}
