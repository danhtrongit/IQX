import { useEffect, useId, useRef, useState } from "react"
import { EGG_CONFIG, MASCOT_MANIFEST, clampLevel, eggPosters } from "./config"
import { EggArtwork } from "./artwork/EggArtwork"
import { EggEffectOverlay } from "./artwork/EggEffectOverlay"
import { MascotEffectOverlay } from "./artwork/MascotEffectOverlay"
import { mascotAssetUrl } from "./mascot-2d/mascotManifest"
import type { MascotId, MascotState } from "./types"

export interface JourneyCreatureIllustrationProps {
  level: number
  accent: string
  mascotId?: MascotId
  phase: "egg" | "hatch" | "welcome" | "mascot"
  runtimeState: MascotState
  animationToken?: string
  paused: boolean
  reducedMotion: boolean
  previousLevel?: number
  firstPlacement?: boolean
  getHatchProgress?: () => number
  getLevelProgress?: () => number
  onReady?: () => void
  onError?: () => void
  onTap?: () => boolean | void
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => { const p = clamp(value); return p * p * (3 - 2 * p) }

interface ArtPart {
  node: SVGGraphicsElement
  originalTransform: string
  restOpacity: number
  pivot?: { x: number; y: number }
  motionScale: number
  layer?: string
}

/** ImageGen posters and code-rendered effects share one paused, accessible animation surface. */
export function JourneyCreatureIllustration(props: JourneyCreatureIllustrationProps) {
  const { onReady, phase, previousLevel } = props
  const svg = useRef<SVGSVGElement>(null)
  const current = useRef(props)
  const sync = useRef<(() => void) | null>(null)
  const id = useId().replace(/:/g, "")
  const showEgg = props.phase === "egg" || props.phase === "hatch"
  const showMascot = props.phase !== "egg"
  const eggSources = eggPosters(clampLevel(props.level))
  const previousEggSources = props.previousLevel == null ? null : eggPosters(clampLevel(props.previousLevel))
  const mascotSources = props.mascotId ? MASCOT_MANIFEST[props.mascotId].sources : null
  const eggCandidates = [eggSources.avif, eggSources.webp, eggSources.png]
  const previousEggCandidates = previousEggSources ? [previousEggSources.avif, previousEggSources.webp, previousEggSources.png] : []
  const mascotCandidates = props.phase === "hatch" && props.mascotId
    ? [mascotAssetUrl(props.mascotId, "reveal-silhouette.webp")]
    : mascotSources ? [mascotSources.avif, mascotSources.webp, mascotSources.png] : []
  const eggKey = `egg:${clampLevel(props.level)}`
  const previousEggKey = props.previousLevel == null ? "egg:previous-missing" : `egg:${clampLevel(props.previousLevel)}`
  const mascotKey = props.mascotId ? `mascot:${props.mascotId}` : "mascot:missing"
  const [assetAttempts, setAssetAttempts] = useState<Record<string, number>>({})
  const [loadedAssets, setLoadedAssets] = useState<Record<string, true>>({})
  const readyNotification = useRef("")
  const eggAttempt = assetAttempts[eggKey] ?? 0
  const previousEggAttempt = assetAttempts[previousEggKey] ?? 0
  const mascotAttempt = assetAttempts[mascotKey] ?? 0
  const eggVectorFallback = eggAttempt >= eggCandidates.length
  const previousEggVectorFallback = previousEggCandidates.length > 0 && previousEggAttempt >= previousEggCandidates.length
  const mascotPlaceholderFallback = mascotCandidates.length === 0 || mascotAttempt >= mascotCandidates.length
  useEffect(() => { current.current = props; sync.current?.() }, [props])

  const handleAssetError = (key: string, attempt: number, count: number) => {
    const next = attempt + 1
    setAssetAttempts(previous => ({ ...previous, [key]: next }))
    if (next >= count) props.onError?.()
  }
  const handleAssetLoad = (key: string) => setLoadedAssets(previous => previous[key] ? previous : { ...previous, [key]: true })

  useEffect(() => {
    const root = svg.current
    if (!root) return
    let frame = 0, priorFrame = 0, time = 0, stateTime = 0, stateKey = "", disposed = false, touch = 0
    let parts = new Map<string, ArtPart[]>()
    const originalTransforms = new WeakMap<SVGGraphicsElement, string>()
    const originalOpacities = new WeakMap<SVGGraphicsElement, number>()
    const collect = () => {
      parts = new Map()
      root.querySelectorAll<SVGGraphicsElement>("[data-part]").forEach(node => {
        if (!originalTransforms.has(node)) originalTransforms.set(node, node.getAttribute("transform") ?? "")
        if (!originalOpacities.has(node)) {
          const opacity = Number(node.style.opacity || node.getAttribute("opacity") || 1)
          originalOpacities.set(node, Number.isFinite(opacity) ? clamp(opacity) : 1)
        }
        const x = Number(node.dataset.pivotX), y = Number(node.dataset.pivotY)
        const pivot = node.hasAttribute("data-pivot-x") && node.hasAttribute("data-pivot-y") && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined
        const scale = Number(node.dataset.motionScale ?? 1)
        node.style.transformOrigin = "0px 0px"
        node.style.transformBox = "view-box"
        const name = node.dataset.part!
        parts.set(name, [...(parts.get(name) ?? []), { node, originalTransform: originalTransforms.get(node)!, pivot,
          restOpacity: originalOpacities.get(node)!,
          motionScale: Number.isFinite(scale) && scale > 0 ? scale : 1,
          layer: node.closest<SVGGElement>("[data-layer]")?.dataset.layer }])
      })
    }
    const pose = (name: string, motion: (part: ArtPart) => string, alpha?: number | ((part: ArtPart) => number), withinLayer?: string) => {
      for (const part of parts.get(name) ?? []) {
        if (withinLayer && part.layer !== withinLayer) continue
        part.node.setAttribute("transform", `${part.originalTransform} ${motion(part)}`.trim())
        if (alpha != null) {
          const opacity = String(typeof alpha === "function" ? alpha(part) : alpha)
          part.node.setAttribute("opacity", opacity); part.node.style.opacity = opacity
        }
      }
    }
    const rotate = (part: ArtPart, angle: number) => part.pivot ? `rotate(${angle} ${part.pivot.x} ${part.pivot.y})` : ""
    const translate = (part: ArtPart, x: number, y: number) => `translate(${x * part.motionScale} ${y * part.motionScale})`
    const layer = (name: string, opacity: number, transform = "") => {
      const node = root.querySelector<SVGGElement>(`[data-layer="${name}"]`)
      if (node) { node.setAttribute("opacity", String(opacity)); node.setAttribute("transform", transform) }
    }
    const active = () => {
      const value = current.current
      return !value.paused && (value.phase === "hatch" || value.previousLevel != null || value.firstPlacement || touch > .001 ||
        !value.reducedMotion)
    }
    const draw = (stamp: number) => {
      frame = 0
      if (disposed || current.current.paused) return
      const value = current.current
      const dt = priorFrame ? Math.min(.06, (stamp - priorFrame) / 1000) : 0
      priorFrame = stamp; time += dt
      const nextState = `${value.phase}:${value.runtimeState}:${value.animationToken ?? ""}`
      if (stateKey !== nextState) { stateTime = 0; stateKey = nextState }
      stateTime += dt; touch = Math.max(0, touch - dt * 1.7)
      const duration = value.runtimeState === "updated" ? 1.35 : value.runtimeState === "tap_reaction" ? .65 : 1.2
      const greeting = value.phase === "welcome" || value.runtimeState === "greet"
      const reacting = value.runtimeState === "tap_reaction"
      const updated = value.runtimeState === "updated"
      const hasCue = greeting || reacting || updated
      const cue = value.reducedMotion ? 0 : hasCue ? Math.sin(clamp(stateTime / duration) * Math.PI) : touch * .5
      const analyzing = !value.reducedMotion && value.runtimeState === "analyzing" ? (Math.sin(time * 1.6) + 1) * .09 : 0
      const motionTime = value.reducedMotion ? 0 : time
      // A flat poster is a fallback, not a rig. Keep its authored pose untouched.
      pose("mascot-poster", () => "")
      pose("egg-orbit-a", part => rotate(part, value.reducedMotion ? 0 : motionTime * 360 / 11))
      pose("egg-orbit-b", part => rotate(part, value.reducedMotion ? 0 : -motionTime * 360 / 14))
      pose("egg-core-node", () => "", part => value.reducedMotion ? part.restOpacity : .25 + .75 * Math.max(0, Math.sin(motionTime * Math.PI * 2 / 5.4 - Number(part.node.dataset.nodeIndex ?? 0) * .52)))
      pose("egg-node", () => "", part => value.reducedMotion ? part.restOpacity : .2 + .8 * Math.max(0, Math.sin(motionTime * Math.PI * 2 / 5.4 - Number(part.node.dataset.nodeIndex ?? 0) * .88)))
      const radarCycle = motionTime % 6.7
      pose("egg-radar", part => rotate(part, value.reducedMotion ? 0 : Math.min(1, radarCycle / 1.4) * 360))
      pose("egg-blip", () => "", part => value.reducedMotion ? part.restOpacity : radarCycle < 1.4 ? .2 + .8 * Math.max(0, Math.sin(radarCycle * Math.PI * 2 - Number(part.node.dataset.nodeIndex ?? 0) * 2.2)) : .2)
      pose("egg-flow-a", part => rotate(part, value.reducedMotion ? 0 : motionTime * 60))
      pose("egg-flow-b", part => rotate(part, value.reducedMotion ? 0 : -motionTime * 60))
      pose("egg-segment-ring", part => rotate(part, value.reducedMotion ? 0 : motionTime * 360 / 13))
      pose("egg-wisp", part => translate(part, 0, value.reducedMotion ? 0 : -5 + Math.sin(motionTime * .9 + Number(part.node.dataset.nodeIndex ?? 0) * Math.PI) * 5), part => value.reducedMotion ? .4 : .25 + .5 * (Math.sin(motionTime * .9 + Number(part.node.dataset.nodeIndex ?? 0) * Math.PI) + 1) / 2)
      const halo = root.querySelector<SVGEllipseElement>('[data-part="creature-halo"]')
      if (halo) {
        const pulse = value.reducedMotion ? .18 : .15 + (Math.sin(time * Math.PI * 2 / 4.2) + 1) * .035
        halo.setAttribute("opacity", String(value.phase === "mascot" || value.phase === "welcome" ? pulse + cue * .25 + analyzing : 0))
      }
      layer("outside-sparkles", clamp(cue + touch * .4))
      if (value.phase === "hatch") {
        const progress = value.getHatchProgress?.() ?? 0
        // §11.5 fallback: 700ms core, 150ms light, then a 350ms poster crossfade.
        const blend = value.reducedMotion ? progress : smooth((progress - 850 / 1200) / (350 / 1200))
        const core = value.reducedMotion ? 0 : smooth(progress / (700 / 1200)) * (1 - blend)
        const flash = value.reducedMotion ? 0 : Math.sin(clamp((progress - 700 / 1200) / (150 / 1200)) * Math.PI)
        pose("egg-effects", () => "", 1 - blend)
        pose("egg-core", () => "", core * .65)
        layer("egg", 1 - blend); layer("previous-egg", 0)
        layer("mascot", blend)
        layer("hatch-light", flash * .32)
      } else if (value.phase === "egg") {
        const progress = value.previousLevel == null && !value.firstPlacement ? 1 : value.getLevelProgress?.() ?? 0
        const blend = value.reducedMotion || value.firstPlacement ? progress : smooth((progress - .344) / .219)
        const config = EGG_CONFIG[clampLevel(value.level)]
        const dy = value.reducedMotion ? 0 : Math.sin(time * Math.PI * 2 / (config.floatDuration / 1000)) * config.floatAmplitude
        const tapRebound = value.reducedMotion ? 0 : Math.sin((1 - touch) * Math.PI * 3) * touch
        const tapSquash = value.reducedMotion ? 0 : Math.sin(touch * Math.PI) * .022
        const restingShell = (part: ArtPart) => {
          const pivot = part.pivot
          const squash = pivot ? `translate(${pivot.x} ${pivot.y}) scale(${1 + tapSquash} ${1 - tapSquash}) translate(${-pivot.x} ${-pivot.y})` : ""
          return `${translate(part, 0, tapRebound * -2)} ${rotate(part, tapRebound * 2.2)} ${squash}`.trim()
        }
        pose("egg-shell-top", restingShell); pose("egg-shell-bottom", restingShell)
        pose("egg-effects", () => "", 1); pose("egg-core", () => "", 0)
        layer("egg", blend, `translate(0 ${dy})`); layer("previous-egg", 1 - blend, `translate(0 ${dy})`)
        layer("mascot", 0); layer("hatch-light", 0)
      } else {
        layer("egg", 0); layer("previous-egg", 0); layer("mascot", 1); layer("hatch-light", 0)
      }
      if (active()) frame = requestAnimationFrame(draw)
    }
    const requestDraw = () => { if (!frame && !disposed && !current.current.paused) frame = requestAnimationFrame(draw) }
    const interact = () => {
      if (current.current.paused || current.current.phase !== "mascot" || current.current.runtimeState !== "idle") return
      const accepted = current.current.onTap?.()
      if (accepted === true) touch = 1
      requestDraw()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!event.repeat) interact() }
    }
    root.addEventListener("click", interact); root.addEventListener("keydown", key)
    sync.current = () => {
      collect()
      if (current.current.paused) { cancelAnimationFrame(frame); frame = 0; priorFrame = 0 }
      else requestDraw()
    }
    collect(); requestDraw()
    return () => { disposed = true; sync.current = null; cancelAnimationFrame(frame); root.removeEventListener("click", interact); root.removeEventListener("keydown", key) }
  }, [])

  useEffect(() => {
    const required = [
      ...(showEgg ? [[eggKey, loadedAssets[eggKey] || eggVectorFallback] as const] : []),
      ...(showEgg && previousLevel != null ? [[previousEggKey, loadedAssets[previousEggKey] || previousEggVectorFallback] as const] : []),
      ...(showMascot ? [[mascotKey, loadedAssets[mascotKey] || mascotPlaceholderFallback] as const] : []),
    ]
    const notificationKey = `${phase}:${required.map(([key]) => key).join("|")}`
    if (required.length > 0 && required.every(([, ready]) => ready) && readyNotification.current !== notificationKey) {
      readyNotification.current = notificationKey
      onReady?.()
    }
  }, [onReady, phase, previousLevel, showEgg, showMascot, eggKey, previousEggKey, mascotKey,
    loadedAssets, eggVectorFallback, previousEggVectorFallback, mascotPlaceholderFallback])

  const accent = props.mascotId && props.phase !== "egg" ? MASCOT_MANIFEST[props.mascotId].accent : props.accent
  const displayAccent = mascotPlaceholderFallback && showMascot ? "#94a3b8" : accent
  const interactive = props.phase === "mascot" && props.runtimeState === "idle" && !props.paused
  const usesRelevantFallback = (showEgg && (eggVectorFallback || previousEggVectorFallback)) || (showMascot && mascotPlaceholderFallback)
  return <svg ref={svg} className="identity-creature-illustration" viewBox="0 0 480 520" data-renderer={usesRelevantFallback ? "fallback" : "imagegen-poster"}
    role={interactive ? "button" : "img"} tabIndex={interactive ? 0 : undefined}
    aria-label={interactive ? `Linh thú ${props.mascotId ? MASCOT_MANIFEST[props.mascotId].name : "IQX"}. Chạm, Enter hoặc phím cách để tương tác.` : showEgg ? `Trứng hành trình IQX cấp ${props.level}` : `Linh thú ${props.mascotId ? MASCOT_MANIFEST[props.mascotId].name : "IQX"}`}
    aria-disabled={interactive ? undefined : true}>
    <defs><radialGradient id={`${id}-light`}><stop stopColor={displayAccent} stopOpacity=".85" /><stop offset="1" stopColor={displayAccent} stopOpacity="0" /></radialGradient></defs>
    <ellipse data-part="creature-halo" cx="240" cy="446" rx="110" ry="14" fill="none" stroke={displayAccent} strokeWidth="1" opacity="0" aria-hidden="true" />
    <g data-layer="mascot" opacity={props.phase === "mascot" || props.phase === "welcome" ? 1 : 0} aria-hidden="true">
      {showMascot && (mascotPlaceholderFallback
        ? <g data-part="mascot-placeholder" data-testid="mascot-neutral-placeholder">
            <ellipse cx="240" cy="438" rx="88" ry="12" fill={displayAccent} opacity=".16" />
            <circle cx="240" cy="224" r="66" fill={displayAccent} opacity=".22" stroke={displayAccent} strokeWidth="2" />
            <path d="M139 414C149 326 186 288 240 288C294 288 331 326 341 414Z" fill={displayAccent} opacity=".18" stroke={displayAccent} strokeWidth="2" />
            <path d="M240 323L260 349L240 375L220 349Z" fill="none" stroke={displayAccent} strokeWidth="3" />
          </g>
        : <image data-part="mascot-poster" data-asset-format={mascotCandidates[mascotAttempt].split("?")[0].split(".").pop()} href={mascotCandidates[mascotAttempt]} x="42" y="40" width="396" height="414" preserveAspectRatio="xMidYMid meet"
            onLoad={() => handleAssetLoad(mascotKey)} onError={() => handleAssetError(mascotKey, mascotAttempt, mascotCandidates.length)} />)}
      {props.mascotId && showMascot && !mascotPlaceholderFallback && <MascotEffectOverlay mascotId={props.mascotId} state={props.runtimeState} accent={accent} idPrefix={`${id}-mascot-effect`} />}
    </g>
    <g data-layer="previous-egg" opacity={props.previousLevel != null ? 1 : 0} aria-hidden="true">
      {showEgg && props.previousLevel != null && (previousEggVectorFallback
        ? <EggArtwork key={props.previousLevel} level={props.previousLevel} accent={EGG_CONFIG[clampLevel(props.previousLevel)].accent} idPrefix={`${id}-previous`} />
        : <image data-part="previous-egg-poster" data-asset-format={previousEggCandidates[previousEggAttempt].split(".").pop()}
            href={previousEggCandidates[previousEggAttempt]} x="45" y="42" width="390" height="410" preserveAspectRatio="xMidYMid meet"
            onLoad={() => handleAssetLoad(previousEggKey)} onError={() => handleAssetError(previousEggKey, previousEggAttempt, previousEggCandidates.length)} />)}
    </g>
    <g data-layer="egg" opacity={showEgg && props.previousLevel == null && !props.firstPlacement ? 1 : 0} aria-hidden="true">
      {showEgg && (eggVectorFallback
        ? <EggArtwork key={props.level} level={props.level} accent={props.accent} idPrefix={`${id}-egg`} />
        : <><image data-part="egg-poster" data-asset-format={eggCandidates[eggAttempt].split(".").pop()} href={eggCandidates[eggAttempt]} x="45" y="42" width="390" height="410" preserveAspectRatio="xMidYMid meet"
              onLoad={() => handleAssetLoad(eggKey)} onError={() => handleAssetError(eggKey, eggAttempt, eggCandidates.length)} />
            <EggEffectOverlay level={props.level} accent={props.accent} idPrefix={`${id}-effect`} /></>)}
    </g>
    <g data-layer="hatch-light" opacity="0" aria-hidden="true"><ellipse cx="240" cy="255" rx="195" ry="225" fill={`url(#${id}-light)`} /></g>
    <g data-layer="outside-sparkles" opacity="0" fill={displayAccent} aria-hidden="true">
      {[[48, 174], [431, 205], [51, 377], [424, 391]].map(([x, y], i) => <path key={i} d={`M${x} ${y-5}Q${x+1} ${y-1} ${x+5} ${y}Q${x+1} ${y+1} ${x} ${y+5}Q${x-1} ${y+1} ${x-5} ${y}Q${x-1} ${y-1} ${x} ${y-5}Z`} />)}
    </g>
  </svg>
}
