/**
 * The Bot overview's mascot card: the account's active mascot on its stage, the
 * configuration state chip and the source / holdings chips. Drawn with the same 2D
 * renderer as the workspace's `MascotStage`; no hatch, no UI milestone is written.
 */
import { useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { MASCOT_MANIFEST } from "../../journey/config"
import { Mascot2DStage } from "../../journey/mascot-2d/Mascot2DStage"
import type { MascotId } from "../../journey/types"
import { useReducedMotion, useStageVisibility } from "../../journey/visibility"
import type { StateChip } from "./state"

const TAP_COOLDOWN_MS = 1800

function prefersSavedData(): boolean {
  const connection = "connection" in navigator ? navigator.connection : null
  return !!(connection && typeof connection === "object" && "saveData" in connection && connection.saveData)
}

const CHIP_TONE: Record<StateChip["tone"], string> = {
  good: "border-price-up/40 bg-price-up/10 text-price-up",
  info: "border-primary/40 bg-primary/10 text-primary",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
}

export function StateChipView({ chip }: { chip: StateChip }) {
  return (
    <span
      role="status"
      data-testid="bot-state-chip"
      title={chip.detail ?? undefined}
      className={cn("inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium", CHIP_TONE[chip.tone])}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="min-w-0 truncate">{chip.label}</span>
    </span>
  )
}

export function MascotCard({
  mascotId,
  chip,
  chips,
  tagline = "Học kiến thức. Tự thiết lập điều kiện cho Bot.",
}: {
  mascotId: MascotId
  chip: StateChip
  chips: { key: string; label: string; tone?: "warn" }[]
  tagline?: string
}) {
  const stage = useRef<HTMLDivElement>(null)
  const lastTap = useRef(Number.NEGATIVE_INFINITY)
  const [tap, setTap] = useState(0)
  const visible = useStageVisibility(stage)
  const reducedMotion = useReducedMotion() || prefersSavedData()
  const definition = MASCOT_MANIFEST[mascotId]

  return (
    <section aria-label="Linh thú của bạn" className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-4 text-center @container">
      <div className="flex w-full items-center justify-between gap-2">
        <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Linh thú của bạn</p>
        <StateChipView chip={chip} />
      </div>
      <h2 className="font-heading text-2xl leading-tight font-bold min-[1750px]:text-3xl">{definition.name}</h2>
      <p className="-mt-2 max-w-md text-xs text-muted-foreground">{tagline}</p>
      <div
        ref={stage}
        data-testid="mascot-stage"
        data-mascot-id={mascotId}
        className="relative h-64 w-full [container-type:size] min-[901px]:h-72 min-[1750px]:h-96"
      >
        <Mascot2DStage
          mascotId={mascotId}
          state={tap ? "tap_reaction" : "idle"}
          animationToken={tap ? `tap:${tap}` : ""}
          paused={!visible}
          reducedMotion={reducedMotion}
          onComplete={() => setTap(0)}
          onTap={() => {
            const now = performance.now()
            if (!visible || tap || now - lastTap.current < TAP_COOLDOWN_MS) return false
            lastTap.current = now
            setTap(now)
            return true
          }}
        />
      </div>
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        {chips.map((item) => (
          <li
            key={item.key}
            className={cn(
              "rounded-sm border px-2 py-0.5 text-[10px] font-medium",
              item.tone === "warn" ? "border-price-ref/40 bg-price-ref/10 text-price-ref" : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
