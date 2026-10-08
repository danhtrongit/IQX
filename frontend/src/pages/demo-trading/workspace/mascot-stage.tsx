/**
 * The default main view: the account's active mascot on its stage.
 *
 * Drawn with the existing 2D mascot renderer. The mascot is present from the
 * first visit (no egg, no reveal sequence), so nothing here plays a hatch or
 * writes UI milestones; the only interaction is an optional tap reaction.
 */
import { useRef, useState } from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { MASCOT_MANIFEST } from "../journey/config"
import { Mascot2DStage } from "../journey/mascot-2d/Mascot2DStage"
import type { MascotId } from "../journey/types"
import { useReducedMotion, useStageVisibility } from "../journey/visibility"

const TAP_COOLDOWN_MS = 1800

function prefersSavedData(): boolean {
  const connection = "connection" in navigator ? navigator.connection : null
  return !!(connection && typeof connection === "object" && "saveData" in connection && connection.saveData)
}

export function MascotStage({
  mascotId,
  tagline = "Học kiến thức. Tự thiết lập điều kiện cho Bot.",
  className,
}: {
  mascotId: MascotId
  tagline?: string
  className?: string
}) {
  const stage = useRef<HTMLDivElement>(null)
  const lastTap = useRef(Number.NEGATIVE_INFINITY)
  const [tap, setTap] = useState(0)
  const visible = useStageVisibility(stage)
  const reducedMotion = useReducedMotion() || prefersSavedData()
  const definition = MASCOT_MANIFEST[mascotId]

  return (
    <Card
      aria-label="Linh thú của bạn"
      className={cn("items-center border border-border px-4 text-center @container", className)}
      role="region"
    >
      <p className="w-full text-left text-[10px] tracking-wide text-muted-foreground uppercase">Linh thú của bạn</p>
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
    </Card>
  )
}
