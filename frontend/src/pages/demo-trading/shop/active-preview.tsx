/**
 * The mascot that is actually in use, drawn by the existing 2D renderer
 * (the same `Mascot2DStage` the workspace stage uses), so what the Shop shows
 * as "Đang sử dụng" is what the rest of the workspace draws. Cards and rows use
 * the light poster instead; only this one live renderer is mounted.
 */
import { useRef, useState } from "react"

import { Mascot2DStage } from "../journey/mascot-2d/Mascot2DStage"
import type { MascotId } from "../journey/types"
import { useReducedMotion, useStageVisibility } from "../journey/visibility"
import { MascotArt } from "./mascot-art"
import { isMascotId } from "./shop-model"

const TAP_COOLDOWN_MS = 1800

function prefersSavedData(): boolean {
  const connection = "connection" in navigator ? navigator.connection : null
  return !!(connection && typeof connection === "object" && "saveData" in connection && connection.saveData)
}

function LiveStage({ mascotId }: { mascotId: MascotId }) {
  const stage = useRef<HTMLDivElement>(null)
  const lastTap = useRef(Number.NEGATIVE_INFINITY)
  const [tap, setTap] = useState(0)
  const visible = useStageVisibility(stage)
  const reducedMotion = useReducedMotion() || prefersSavedData()
  return (
    <div ref={stage} className="relative size-full origin-[50%_58%] scale-[1.45] [container-type:size]" data-testid="shop-active-stage" data-mascot-id={mascotId}>
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
  )
}

export function ActivePreview({ mascotId, name, className }: { mascotId: string; name: string; className?: string }) {
  return (
    <div className={className} data-testid="shop-active-preview">
      {isMascotId(mascotId)
        ? <LiveStage mascotId={mascotId} />
        : <MascotArt mascotId={mascotId} name={name} className="size-full" />}
    </div>
  )
}
