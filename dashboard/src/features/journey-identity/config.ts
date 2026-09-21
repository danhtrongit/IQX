import { LEVELS } from "@/features/cap0/Badge"
import type { EggEffect, EggLevel, MascotId } from "./types"

export interface EggConfig {
  level: EggLevel
  name: string
  accent: string
  secondaryAccent?: string
  effect: EggEffect
  floatAmplitude: number
  floatDuration: number
  coreDuration: number
}

export interface ArtworkSources {
  avif: string
  webp: string
  png: string
}

const effects: readonly EggEffect[] = ["orbit_ring", "evolved_core", "node_ring", "analysis_ring", "conflict_cross", "balanced_orbit", "pre_hatch"]
const motion = [[4, 7200, 5000], [5, 6800, 4800], [5, 6500, 4400], [5, 6400, 4200], [4, 6600, 4300], [2, 7600, 4600], [4, 6200, 4200]] as const
export const EGG_CONFIG: readonly EggConfig[] = effects.map((effect, level) => ({
  level: level as EggLevel,
  name: level === 6 ? "Bậc thầy" : LEVELS[level].name,
  accent: level === 6 ? "#4fd1c5" : LEVELS[level].color,
  secondaryAccent: level >= 4 ? "#e0b64d" : undefined,
  effect,
  floatAmplitude: motion[level][0],
  floatDuration: motion[level][1],
  coreDuration: motion[level][2],
}))

/** Shared species labels/accents; legacy poster sources are retained for old artwork consumers.
 * The live mascot stage loads its own versioned v2 sprite manifest. */
interface MascotDefinition { name: string; slug: string; accent: string; poster: string; sources: ArtworkSources }
export const MASCOT_MANIFEST: Record<MascotId, MascotDefinition> = Object.fromEntries([
  ["bach_ho", "Bạch Hổ", "bach-ho", "#70bbff"],
  ["thanh_long", "Thanh Long", "thanh-long", "#68d7ff"],
  ["loc_huou", "Lộc Hươu", "loc-huou", "#edc279"],
  ["phung_hoang", "Phụng Hoàng", "phung-hoang", "#ffae6c"],
  ["kim_quy", "Kim Quy", "kim-quy", "#8ee2bd"],
].map(([id, name, slug, accent]) => [id, {
  name, slug, accent,
  poster: `/journey-identity/generated/mascot-${slug}.png`,
  sources: artworkSources(`mascot-${slug}`),
}])) as Record<MascotId, MascotDefinition>

function artworkSources(stem: string): ArtworkSources {
  const root = `/journey-identity/generated/${stem}`
  return { avif: `${root}.avif`, webp: `${root}.webp`, png: `${root}.png` }
}

export function eggPosters(level: EggLevel) {
  return artworkSources(`egg-level-${level}`)
}

export function eggPoster(level: EggLevel) {
  return eggPosters(level).png
}

export function clampLevel(level: number): EggLevel {
  return Math.max(0, Math.min(6, Number.isFinite(level) ? Math.trunc(level) : 0)) as EggLevel
}
