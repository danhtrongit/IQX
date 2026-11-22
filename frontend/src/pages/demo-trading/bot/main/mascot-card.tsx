/**
 * The Bot overview's mascot card: the account's active mascot on its stage and the
 * strategy / holdings chips (spec v2.0 §5.2; no state chip, no on/off switch). Drawn with the same 2D
 * renderer as the workspace's `MascotStage`; no hatch, no UI milestone is written.
 */
import { useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { MASCOT_MANIFEST } from "../../journey/config"
import { Mascot2DStage } from "../../journey/mascot-2d/Mascot2DStage"
import type { MascotId } from "../../journey/types"
import { useReducedMotion, useStageVisibility } from "../../journey/visibility"

const TAP_COOLDOWN_MS = 1800

function prefersSavedData(): boolean {
  const connection = "connection" in navigator ? navigator.connection : null
  return !!(connection && typeof connection === "object" && "saveData" in connection && connection.saveData)
}

export function MascotCard({
  mascotId,
  chips,
  tagline = "Học kiến thức. Chọn chiến lược cho Bot.",
}: {
  mascotId: MascotId
  chips: { key: string; label: ReactNode; tone?: "warn" }[]
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
      <p className="w-full text-left text-[10px] tracking-wide text-academy-subtle uppercase">Linh thú của bạn</p>
      <h2 className="font-heading text-2xl leading-tight font-bold min-[1750px]:text-3xl">{definition.name}</h2>
      <p className="-mt-2 max-w-md text-xs text-foreground">{tagline}</p>
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
              "inline-flex max-w-full items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-medium",
              item.tone === "warn" ? "border-price-ref/40 bg-price-ref/10 text-price-ref" : "border-border bg-muted/40 text-foreground",
            )}
          >
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
