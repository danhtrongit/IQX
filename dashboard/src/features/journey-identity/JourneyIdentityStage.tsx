import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { EGG_CONFIG, MASCOT_MANIFEST, clampLevel } from "./config"
import { JourneyCreatureIllustration } from "./JourneyCreatureIllustration"
import { Mascot2DStage } from "./mascot-2d/Mascot2DStage"
import { mascotAssetUrl } from "./mascot-2d/mascotManifest"
import { useIdentity, useIdentityEvent } from "./hooks"
import { deriveMascotState, identityEvent, revealPhase } from "./state"
import { useReducedMotion, useStageVisibility } from "./visibility"
import type { IdentityState, MascotState, UIEvent } from "./types"
import "./identity.css"

function eventKey(event: UIEvent) {
  if (event.event === "level_seen") return `${event.event}:${event.level}`
  if (event.event === "bot_run_updated_seen") return `${event.event}:${event.run_id}`
  if (event.event === "reveal_seen" || event.event === "greet_seen") return `${event.event}:${event.local_date ?? ""}`
  return event.event
}

function viewportKind() {
  if (typeof window === "undefined") return "desktop"
  if (window.innerWidth <= 600) return "mobile"
  if (window.innerWidth <= 1024) return "tablet"
  return "desktop"
}

const RENDERER = "sprite-frame-v2"
const HATCH_FALLBACK_MS = 1200

export function JourneyIdentityStage({ level }: { level: number }) {
  const { user } = useAuth()
  const identity = useIdentity()
  const persist = useIdentityEvent()
  return <IdentityScene key={user?.id ?? "guest"} level={level} state={identity.data}
    canPersist={!!user} persist={persist} />
}

/** Exported for deterministic QA with supplied server fixtures, not a demo route. */
export function IdentityScene({ level: fallbackLevel, state, canPersist, persist }: {
  level: number
  state?: IdentityState
  canPersist: boolean
  persist: (event: UIEvent) => Promise<unknown>
}) {
  const stageRef = useRef<HTMLElement>(null)
  const eggRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<Animation | null>(null)
  const animationStarted = useRef(false)
  const visible = useStageVisibility(stageRef)
  const reduced = useReducedMotion()
  const saveData = typeof navigator !== "undefined" && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
  const level = clampLevel(state?.current_level ?? fallbackLevel)
  const config = EGG_CONFIG[level]
  const mascotId = state?.mascot?.id
  const lifecycle = state?.lifecycle
  const mascot = mascotId ? MASCOT_MANIFEST[mascotId] : null
  const [readyModel, setReadyModel] = useState<string>()
  const onModelError = useCallback(() => {
    setReadyModel(undefined)
    if (mascotId && lifecycle !== "egg" && lifecycle !== "pending_data_repair") {
      identityEvent("mascot_asset_error", { mascot_id: mascotId, asset: mascotAssetUrl(mascotId, "reveal-silhouette.webp"), error_code: "hatch_silhouette_failed" })
    } else {
      identityEvent("journey_egg_asset_error", { level, asset: `/journey-identity/generated/egg-level-${level}` })
    }
  }, [level, lifecycle, mascotId])
  const [completed, setCompleted] = useState<UIEvent[]>([])
  const [queue, setQueue] = useState<UIEvent[]>([])
  const [tap, setTap] = useState<{ token: number; context: string } | null>(null)
  const lastTap = useRef(-Infinity)
  const completedRef = useRef(new Set<string>())
  const finish = useCallback((event: UIEvent) => {
    const key = eventKey(event)
    if (completedRef.current.has(key)) return
    completedRef.current.add(key)
    setCompleted(previous => [...previous, event])
    if (canPersist) setQueue(previous => [...previous, event])
  }, [canPersist])

  // Persist in order (hatch before welcome), retry without restarting visuals.
  const nextEvent = queue[0]
  useEffect(() => {
    if (!nextEvent) return
    let live = true, attempt = 0, timer: ReturnType<typeof setTimeout>
    const write = async () => {
      try {
        await persist(nextEvent)
        if (live) setQueue(previous => previous.slice(1))
      } catch {
        if (!live) return
        identityEvent("identity_persist_retry", { event: nextEvent.event })
        timer = setTimeout(write, Math.min(30_000, 1000 * 2 ** attempt++))
      }
    }
    void write()
    return () => { live = false; clearTimeout(timer) }
  }, [nextEvent, persist])

  const effective = useMemo(() => {
    const effective = state ? { ...state, ui_state: { ...state.ui_state } } : undefined
    if (effective) {
      for (const event of completed) {
        if (event.event === "hatch_seen") effective.ui_state.egg_hatch_seen_at ||= "presented"
        if (event.event === "reveal_seen") effective.ui_state.reveal_seen_at ||= "presented"
        if (event.event === "level_seen") effective.ui_state.last_seen_egg_level = Math.max(effective.ui_state.last_seen_egg_level ?? 0, event.level!)
        if ("local_date" in event) {
          const day = event.local_date ?? effective.today_local
          if (!effective.ui_state.greeted_local_date || day > effective.ui_state.greeted_local_date) effective.ui_state.greeted_local_date = day
        }
        // A completed local animation only suppresses that exact current run.
        // Never replace a newer server cursor received from another device.
        if (event.event === "bot_run_updated_seen" && event.run_id === effective.bot_run.latest_run_id) effective.ui_state.last_animated_bot_run_id = event.run_id!
      }
    }
    return effective
  }, [state, completed])
  const requestedPhase = effective ? revealPhase(effective) : "egg"
  const phase = requestedPhase
  const artworkPhase = phase === "welcome" ? "mascot" : phase
  const modelKey = `${level}:${artworkPhase}:${phase === "egg" ? "egg" : state?.mascot?.id ?? "egg"}`
  const onModelReady = useCallback(() => setReadyModel(modelKey), [modelKey])
  const mascotState = effective && phase === "mascot" ? deriveMascotState(effective) : "idle"
  const tapContext = `${effective?.today_local}:${effective?.bot_run.latest_run_id}:${effective?.bot_run.status}`
  const activeTap = tap?.context === tapContext && mascotState === "idle" ? tap.token : 0
  const seenLevel = effective?.ui_state.last_seen_egg_level
  const needsLevel = phase === "egg" && (seenLevel == null || seenLevel < level) &&
    !completed.some(event => event.event === "level_seen" && event.level === level)
  const oneShot = phase === "hatch" ? "hatch" : phase === "welcome" ? "welcome"
    : needsLevel ? `level:${level}` : mascotState === "greet" ? `greet:${effective!.today_local}`
      : mascotState === "updated" ? `updated:${effective!.bot_run.latest_run_id}`
        : activeTap ? `tap:${activeTap}` : ""
  const ready = readyModel === modelKey
  const finishRef = useRef<() => void>(() => {})
  useEffect(() => {
    finishRef.current = () => {
      if (phase === "hatch") finish({ event: "hatch_seen" })
      else if (phase === "welcome") finish({ event: "reveal_seen", local_date: effective!.today_local })
      else if (needsLevel) finish({ event: "level_seen", level })
      else if (mascotState === "updated") finish({ event: "bot_run_updated_seen", run_id: effective!.bot_run.latest_run_id!, local_date: effective!.today_local })
      else if (mascotState === "greet") finish({ event: "greet_seen", local_date: effective!.today_local })
      else if (activeTap) setTap(null)
    }
  }, [effective, finish, level, mascotState, needsLevel, phase, activeTap])

  const levelDuration = seenLevel == null ? 300 : reduced ? 250 : 1600
  useEffect(() => {
    if (!oneShot || !ready) return
    const isEgg = oneShot === "hatch" || oneShot.startsWith("level:")
    if (!isEgg) return
    const target = isEgg ? eggRef.current : cueRef.current
    if (!target) return
    // The native clock owns fallback presentation completion and pause/resume.
    // The renderer reads this same clock for the poster crossfade and light cue.
    const duration = oneShot === "hatch" ? reduced ? 350 : HATCH_FALLBACK_MS
      : oneShot.startsWith("level:") ? levelDuration
        : oneShot.startsWith("tap:") ? 650 : reduced ? 300 : oneShot === "welcome" || oneShot.startsWith("greet:") ? 1200 : 1350
    const frames = [{ opacity: 1 }, { opacity: 1 }]
    const animation = target.animate(frames, { duration, easing: "linear", fill: "forwards" })
    const complete = finishRef.current
    animation.pause()
    animationRef.current = animation
    animationStarted.current = false
    let alive = true
    animation.finished.then(() => {
      if (!alive) return
      complete()
      if (oneShot === "hatch") identityEvent("journey_egg_hatch_complete", { duration_ms: duration, renderer: RENDERER })
      else if (oneShot.startsWith("level:")) identityEvent("journey_egg_levelup_complete", { from_level: seenLevel ?? level, to_level: level, duration_ms: duration, renderer: RENDERER })
      else if (oneShot === "welcome" && mascotId) identityEvent("mascot_reveal_complete", { mascot_id: mascotId, context: "main_stage" })
      else if (mascotId) identityEvent("mascot_animation_complete", { mascot_id: mascotId, state: oneShot, context: "main_stage", duration_ms: duration, renderer: RENDERER })
    }).catch(() => {})
    return () => { alive = false; animation.cancel(); animationRef.current = null }
  }, [oneShot, ready, reduced, levelDuration, seenLevel, level, mascotId])
  useEffect(() => {
    const animation = animationRef.current
    if (!animation || animation.playState === "finished") return
    if (visible && ready) {
      animation.play()
      if (!animationStarted.current) {
        animationStarted.current = true
        if (oneShot === "hatch") identityEvent("journey_egg_hatch_start", { renderer: RENDERER })
        else if (oneShot.startsWith("level:")) identityEvent("journey_egg_levelup_start", { from_level: seenLevel ?? level, to_level: level, renderer: RENDERER })
        else if (oneShot === "welcome" && mascotId) identityEvent("mascot_reveal_start", { mascot_id: mascotId })
        else if (mascotId) identityEvent("mascot_animation_play", { mascot_id: mascotId, state: oneShot, trigger: oneShot.split(":", 1)[0], context: "main_stage", renderer: RENDERER })
      }
    } else {
      animation.pause()
    }
  }, [visible, oneShot, ready, reduced, saveData, levelDuration, seenLevel, level, mascotId])

  const viewed = useRef(new Set<string>())
  useEffect(() => {
    if (!visible) return
    const key = state?.mascot && phase === "mascot" ? state.mascot.id : `egg:${level}`
    if (viewed.current.has(key)) return
    viewed.current.add(key)
    if (phase === "mascot" && mascotId) identityEvent("mascot_view", { mascot_id: mascotId, context: "main_stage" })
    else identityEvent("journey_egg_view", { level, viewport: viewportKind() })
  }, [visible, level, state?.mascot, mascotId, phase])

  const modeLogged = useRef(new Set<string>())
  useEffect(() => {
    if (!visible) return
    if (reduced && !modeLogged.current.has("reduced")) {
      modeLogged.current.add("reduced")
      identityEvent(phase === "mascot" ? "mascot_reduced_motion" : "journey_egg_reduced_motion", phase === "mascot" ? { enabled: true } : { level })
    }
    if (saveData && !modeLogged.current.has("save-data")) {
      modeLogged.current.add("save-data")
      identityEvent("journey_egg_save_data_static", { level })
    }
    if (state?.lifecycle === "pending_data_repair" && !modeLogged.current.has("pending-data-repair")) {
      modeLogged.current.add("pending-data-repair")
      identityEvent("mascot_pending_data_repair", { reason: "identity_dataset_incomplete" })
    }
  }, [visible, reduced, saveData, phase, level, state?.lifecycle])
  const runtimeState: MascotState = activeTap ? "tap_reaction" : mascotState
  const onTap = () => {
    if (phase !== "mascot" || mascotState !== "idle" || activeTap || !visible || !ready) return false
    const now = performance.now()
    if (now - lastTap.current < 1800) return false
    lastTap.current = now
    setTap({ token: now || 1, context: tapContext })
    identityEvent("mascot_tap", { mascot_id: state!.mascot!.id, context: "main_stage" })
    return true
  }
  const completeMascot = (token: string) => {
    // The renderer returns the token it actually played, never the latest polled run.
    if (token === "welcome") {
      finish({ event: "reveal_seen", local_date: effective!.today_local })
      identityEvent("mascot_reveal_complete", { mascot_id: mascotId! })
    } else if (token.startsWith("updated:")) {
      finish({ event: "bot_run_updated_seen", run_id: token.slice(8), local_date: effective!.today_local })
    } else if (token.startsWith("greet:")) {
      finish({ event: "greet_seen", local_date: token.slice(6) })
    } else if (token.startsWith("tap:")) setTap(null)
    identityEvent("mascot_animation_complete", { mascot_id: mascotId!, state: token.split(":")[0], renderer: RENDERER })
  }
  const label = phase === "egg" ? `Trứng hành trình IQX — Cấp ${level} ${config.name}` : `Linh thú ${mascot?.name ?? "IQX"} của Bot IQX`
  const getHatchProgress = useCallback(() => Math.min(1, Number(animationRef.current?.currentTime ?? 0) / (reduced ? 350 : HATCH_FALLBACK_MS)), [reduced])
  const getLevelProgress = useCallback(() => Math.min(1, Number(animationRef.current?.currentTime ?? 0) / levelDuration), [levelDuration])
  return <section ref={stageRef} className="journey-identity-stage" aria-label={label}
    data-testid="journey-identity-stage" data-level={level} data-phase={phase} data-state={runtimeState}
    data-paused={!visible} data-reduced={reduced || saveData} data-transition={needsLevel ? "level" : phase === "hatch" ? "hatch" : "none"}
    data-previous-level={needsLevel && seenLevel != null && seenLevel < level}
    style={{ "--identity-accent": mascot && phase !== "egg" ? mascot.accent : config.accent,
      "--egg-float": `${config.floatAmplitude}px`, "--egg-float-duration": `${config.floatDuration}ms`,
      "--egg-core-duration": `${config.coreDuration}ms` } as CSSProperties}>
    <div className="identity-ambient" aria-hidden="true" />
    <div className="identity-model-wrap" ref={eggRef}>
      {(phase === "welcome" || phase === "mascot") && mascotId ? <Mascot2DStage mascotId={mascotId}
        state={runtimeState} animationToken={oneShot} reveal={phase === "welcome"} paused={!visible}
        reducedMotion={reduced || saveData} onReady={onModelReady} onComplete={completeMascot} onTap={onTap} />
        : <JourneyCreatureIllustration level={level} accent={config.accent} mascotId={state?.mascot?.id}
        phase={phase} runtimeState={runtimeState} animationToken={oneShot} paused={!visible} reducedMotion={reduced || saveData}
        previousLevel={needsLevel && seenLevel != null && seenLevel < level ? clampLevel(seenLevel) : undefined}
        firstPlacement={needsLevel && seenLevel == null}
        getHatchProgress={getHatchProgress} getLevelProgress={getLevelProgress}
        onReady={onModelReady} onError={onModelError} onTap={onTap} />}
    </div>
    <div className="identity-cue" ref={cueRef} aria-hidden="true" />
  </section>
}
