import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { EggArtwork } from "./artwork/EggArtwork"
import { Mascot2DStage } from "./mascot-2d/Mascot2DStage"
import { deriveMascotState } from "./state"
import type { IdentityState, UIEvent } from "./types"
import { useIdentityEvent } from "./use-identity"
import { isStageVisible, useReducedMotion, useStageVisibility } from "./visibility"

/** Milestones are emitted by completed, visible presentations, never by mounting. */
export function IdentityPresentation({ level, state, revealRequested }: { level: number; state?: IdentityState; revealRequested: boolean }) {
  const stage = useRef<HTMLDivElement>(null)
  const egg = useRef<SVGSVGElement>(null)
  const clock = useRef<Animation | null>(null)
  const visible = useStageVisibility(stage)
  const reduced = useReducedMotion()
  const connection = "connection" in navigator ? navigator.connection : null
  const saveData = !!(connection && typeof connection === "object" && "saveData" in connection && connection.saveData)
  const reducedMotion = reduced || saveData
  const id = useId().replace(/:/g, "")
  const seen = useIdentityEvent()
  const completed = useRef(new Set<string>())
  const [tap, setTap] = useState(0)
  const lastTap = useRef(0)
  const mascot = state?.mascot
  const reveal = state?.lifecycle === "reveal_pending" && revealRequested
  const hatch = reveal && !state.ui_state.egg_hatch_seen_at
  const welcome = reveal && !hatch
  const showMascot = !!mascot && (welcome || state?.lifecycle === "mascot")
  const runtime = state?.lifecycle === "mascot" ? deriveMascotState(state) : "idle"
  const needsLevel = state?.lifecycle === "egg" && (state.ui_state.last_seen_egg_level ?? -1) < level
  const token = hatch ? "hatch" : welcome ? "welcome" : needsLevel ? `level:${level}`
    : runtime === "updated" ? `updated:${state!.bot_run.latest_run_id}`
      : runtime === "greet" ? `greet:${state!.today_local}` : tap && runtime === "idle" ? `tap:${tap}` : ""

  function complete(played: string) {
    // A callback from an old run/species or an occluded stage cannot advance UI state.
    if (!visible || !isStageVisible(stage.current) || played !== token || !state || completed.current.has(played)) return
    let event: UIEvent
    if (played === "hatch") event = { event: "hatch_seen" }
    else if (played === "welcome") event = { event: "reveal_seen" }
    else if (played.startsWith("level:")) event = { event: "level_seen", level }
    else if (played.startsWith("updated:")) event = { event: "bot_run_updated_seen", run_id: played.slice(8) }
    else if (played.startsWith("greet:")) event = { event: "greet_seen" }
    else { setTap(0); return }
    completed.current.add(played)
    seen.mutate({ ...event, mascot_rules_version: state.mascot_rules_version })
  }
  const finish = useRef(complete)
  useEffect(() => { finish.current = complete })
  useEffect(() => {
    if (!egg.current || !(token === "hatch" || token.startsWith("level:"))) return
    const animation = egg.current.animate(reducedMotion
      ? [{ opacity: .7 }, { opacity: 1 }]
      : token === "hatch"
        ? [{ transform: "scale(1) rotate(0deg)", opacity: 1 }, { transform: "scale(1.06) rotate(-4deg)", opacity: 1, offset: .35 }, { transform: "scale(1.08) rotate(4deg)", opacity: 1, offset: .65 }, { transform: "scale(1.15)", opacity: 0 }]
        : [{ transform: "scale(.92)", opacity: .6 }, { transform: "scale(1)", opacity: 1 }],
    { duration: reducedMotion ? 350 : token === "hatch" ? 1200 : 900, easing: "ease-out", fill: "forwards" })
    animation.pause()
    clock.current = animation
    let live = true
    void animation.finished.then(() => { if (live) finish.current(token) }).catch(() => {})
    return () => { live = false; animation.cancel(); clock.current = null }
  }, [token, reducedMotion])
  useEffect(() => {
    if (!clock.current || clock.current.playState === "finished") return
    if (visible) clock.current.play()
    else clock.current.pause()
  }, [visible, token, reducedMotion])

  return <>
    <div ref={stage} className="relative aspect-square w-full [container-type:size]" data-identity-token={token} data-paused={!visible}>
      {showMascot ? <Mascot2DStage mascotId={mascot.id} state={tap && runtime === "idle" ? "tap_reaction" : runtime}
        animationToken={token} reveal={welcome} paused={!visible} reducedMotion={reducedMotion} onComplete={complete}
        onTap={() => {
          const now = performance.now()
          if (!visible || runtime !== "idle" || tap || now - lastTap.current < 1800) return false
          lastTap.current = now
          setTap(now)
          return true
        }} /> : <svg ref={egg} viewBox="0 0 480 480" role="img" aria-label={`Trứng linh thú cấp ${level}`} className="h-full w-full">
          <ellipse cx="240" cy="446" rx="105" ry="12" className="fill-primary/10" />
          <EggArtwork level={level} accent="var(--accent)" idPrefix={id} />
        </svg>}
    </div>
    {seen.error && <div role="alert" className="space-y-2 text-xs text-destructive">
      <p>{errorMessage(seen.error)}</p>
      <Button size="sm" variant="outline" disabled={seen.isPending} onClick={() => { if (seen.variables) seen.mutate(seen.variables) }}>Lưu lại trạng thái</Button>
    </div>}
  </>
}
