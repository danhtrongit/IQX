import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { MASCOT_MANIFEST } from "../config"
import { identityEvent } from "../state"
import type { MascotId, MascotState } from "../types"
import { MASCOT_PLACEHOLDER, mascotAssetUrl } from "./mascotManifest"
import { SpriteStripPlayer } from "./SpriteStripPlayer"
import { useMascotManifest, useSpritePreload } from "./useSpritePreload"
import { useVisibleDelay } from "./useVisibleDelay"
import "./mascot2d.css"

export interface Mascot2DStageProps {
  mascotId: MascotId
  state: MascotState
  animationToken: string
  reveal?: boolean
  paused: boolean
  reducedMotion: boolean
  onReady?: () => void
  onComplete?: (token: string) => void
  onTap?: () => boolean | void
}

export function Mascot2DStage(props: Mascot2DStageProps) {
  // Switching panels does not change this key; switching signed-in species does.
  return <MascotPresentation key={props.mascotId} {...props} />
}
function MascotPresentation({ mascotId, state, animationToken, reveal = false, paused, reducedMotion, onReady, onComplete, onTap }: Mascot2DStageProps) {
  const manifestResult = useMascotManifest(mascotId)
  const manifest = manifestResult?.data
  const animationState = reveal ? "greet" : state
  const animation = manifest?.states[animationState]
  const posterSrc = mascotAssetUrl(mascotId, manifest?.assets.poster ?? "poster.webp", manifest?.assetVersion)
  const silhouetteSrc = reveal ? mascotAssetUrl(mascotId, manifest?.assets.revealSilhouette ?? "reveal-silhouette.webp", manifest?.assetVersion) : undefined
  const stripSrc = animation ? mascotAssetUrl(mascotId, animation.file, manifest?.assetVersion) : undefined
  const poster = useSpritePreload(posterSrc)
  const silhouette = useSpritePreload(silhouetteSrc)
  const placeholder = useSpritePreload(poster?.error ? MASCOT_PLACEHOLDER : undefined)
  const [stripReady, setStripReady] = useState("")
  const [stripFailure, setStripFailure] = useState("")
  const [hidden, setHidden] = useState(document.visibilityState !== "visible")
  useEffect(() => {
    const update = () => setHidden(document.visibilityState !== "visible")
    document.addEventListener("visibilitychange", update)
    return () => document.removeEventListener("visibilitychange", update)
  }, [])
  const suspended = paused || hidden
  const playKey = `${mascotId}:${manifest?.assetVersion ?? "fallback"}:${animationState}:${animationToken}`
  const hasSprite = !!stripSrc && stripReady === stripSrc && stripFailure !== stripSrc
  const displayedPoster = poster?.width ? posterSrc : placeholder?.width ? MASCOT_PLACEHOLDER : undefined
  const neutralFallback = !!poster?.error && !!placeholder?.error
  const ready = hasSprite || !!displayedPoster || neutralFallback
  const fallback = !!manifestResult?.error || !!stripSrc && stripFailure === stripSrc || reducedMotion && animationState === "idle"
  const completed = useRef(new Set<string>())
  const complete = useCallback(() => {
    if (!animationToken || completed.current.has(playKey)) return
    completed.current.add(playKey)
    onComplete?.(animationToken)
  }, [animationToken, onComplete, playKey])

  useEffect(() => { if (ready) onReady?.() }, [ready, onReady])
  const errors = useRef(new Set<string>())
  const reportError = useCallback((asset: string, code: string) => {
    const key = `${asset}:${code}`
    if (errors.current.has(key)) return
    errors.current.add(key)
    identityEvent("mascot_asset_error", { mascot_id: mascotId, asset, error_code: code })
  }, [mascotId])
  useEffect(() => { if (poster?.error) reportError(posterSrc, "poster_load_failed") }, [poster?.error, posterSrc, reportError])
  useEffect(() => { if (silhouette?.error && silhouetteSrc) reportError(silhouetteSrc, "silhouette_load_failed") }, [silhouette?.error, silhouetteSrc, reportError])
  const revealed = useVisibleDelay(`reveal:${mascotId}`, reducedMotion ? 180 : 600,
    reveal && ready && !suspended && !!silhouette, () => {})
  const showColor = !reveal || revealed
  const crossfaded = useVisibleDelay(`crossfade:${mascotId}`, reducedMotion ? 120 : 300,
    reveal && revealed && !suspended, () => {})
  // No arbitrary guessed sprite duration: only fallback presentation uses a short hold.
  useVisibleDelay(`fallback:${playKey}`, 300,
    !!animationToken && fallback && ready && (!reveal || crossfaded) && !suspended, complete)
  const begun = useRef(new Set<string>())
  useEffect(() => {
    if (suspended || !ready || !showColor || begun.current.has(playKey)) return
    begun.current.add(playKey)
    identityEvent("mascot_animation_play", { mascot_id: mascotId, state: animationState,
      trigger: reveal ? "reveal" : animationToken.split(":")[0] || "ambient", renderer: fallback ? "poster-fallback" : "sprite-frame-v2" })
    if (reveal) identityEvent("mascot_reveal_start", { mascot_id: mascotId })
  }, [suspended, ready, showColor, playKey, mascotId, animationState, animationToken, reveal, fallback])
  const interactive = !reveal && state === "idle" && ready && !suspended
  const definition = MASCOT_MANIFEST[mascotId]
  const style = { "--mascot-accent": definition.accent,
    "--mascot-desktop-scale": manifest?.presentation.preferredScaleDesktop ?? 1,
    "--mascot-mobile-scale": manifest?.presentation.preferredScaleMobile ?? .86 } as CSSProperties
  return <div className="mascot-2d-stage" style={style} data-testid="mascot-2d-stage" data-mascot={mascotId}
    data-state={animationState} data-renderer={hasSprite && !fallback ? "sprite-frame-v2" : "poster-fallback"}
    data-reveal={reveal} data-color={showColor} data-paused={suspended} data-reduced={reducedMotion}>
    <div className="mascot-stage-orbit" aria-hidden="true" />
    <div className="mascot-stage-halo" aria-hidden="true" />
    <div className="mascot-2d-character" role={interactive ? "button" : "img"} tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Linh thú ${definition.name}. Chạm để tương tác.` : `Linh thú ${definition.name}`}
      onClick={() => { if (interactive) onTap?.() }}
      onKeyDown={event => {
        if (interactive && !event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onTap?.() }
      }}>
      {reveal && !silhouette?.error && silhouette?.width && <img className="mascot-reveal-silhouette" src={silhouetteSrc} alt="" aria-hidden="true" />}
      <div className="mascot-color-layer">
        {displayedPoster && <img src={displayedPoster} className="mascot-poster" alt="" draggable={false} aria-hidden="true" style={{ opacity: hasSprite && !fallback ? 0 : 1 }} />}
        {neutralFallback && <div className="mascot-neutral-placeholder" data-testid="mascot-neutral-placeholder" aria-hidden="true"><i /></div>}
        {animation && stripSrc && !fallback && <SpriteStripPlayer key={playKey} src={stripSrc} animation={animation}
          paused={suspended || reveal && !crossfaded} reducedMotion={reducedMotion}
          onReady={() => setStripReady(stripSrc)}
          onError={() => { setStripFailure(stripSrc); reportError(stripSrc, "strip_decode_or_dimensions") }}
          onComplete={complete} />}
      </div>
    </div>
  </div>
}
