/** Shape of public/trading-floor/assets/manifest.json, plus the loader that feeds the join screen. */
import { ui } from "../bridge.ts"
import type { Facing } from "../net/types.ts"

export interface FrameArt {
  file: string
  /** Frame inside `file` (spritesheet); the whole image when absent. */
  frame?: string
  /** Texture pixels per world unit. */
  density: number
  /** Feet position inside the frame, in texture pixels. */
  anchor: [number, number]
  flipX?: boolean
}

export interface WalkArt extends FrameArt {
  cell: number
  columns: number
  frames: number
  durationsMs: number[]
  speedRef: number | null
  /** Animation key when several walks share one texture. */
  anim?: string
}

export interface CharacterMasks {
  idle: Partial<Record<Facing, string>>
  walk: Partial<Record<Facing, string>>
}

export interface CharacterArt {
  idle: Partial<Record<Facing, FrameArt>>
  walk: Partial<Record<Facing, WalkArt>>
  /** One-shot animations by name (Thần Tài's 'wave'), per facing; they end on the rest pose. */
  actions?: Record<string, Partial<Record<Facing, WalkArt>>>
  statue?: FrameArt
  masks?: CharacterMasks
  clothLuma?: number
}

export interface PropArt {
  file: string
  kind: "prop" | "texture"
  density: number
  /** Size in world units. */
  world: [number, number]
  /** Bottom-centre origin of a prop (where it meets the floor). */
  origin?: [number, number]
}

export interface Manifest {
  characters: Record<string, CharacterArt>
  props: Record<string, PropArt>
}

/** Root-absolute so the art loads the same from any route. */
export const ASSET_ROOT = "/trading-floor/assets/"

let manifestPromise: Promise<Manifest> | null = null

/** The art manifest, fetched once per page load (a failed fetch is retried on the next call). */
export function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(`${ASSET_ROOT}manifest.json`, { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`manifest ${res.status}`)
      return res.json() as Promise<Manifest>
    })
    .catch((error: unknown) => {
      manifestPromise = null
      throw error
    })
  return manifestPromise
}

/** Loads the manifest and publishes each character's front picture and cloth mask for the HTML screens. */
export async function loadAvatarArt(): Promise<Manifest> {
  const manifest = await loadManifest()
  ui.avatarImages.set(
    Object.fromEntries(
      Object.entries(manifest.characters).map(([id, c]) => [
        id,
        `${ASSET_ROOT}${(c.idle.s ?? Object.values(c.idle)[0])!.file}`,
      ])
    )
  )
  ui.avatarMasks.set(
    Object.fromEntries(
      Object.entries(manifest.characters)
        .filter(([, c]) => Boolean(c.masks?.idle.s))
        .map(([id, c]) => [
          id,
          {
            mask: `${ASSET_ROOT}${c.masks!.idle.s}`,
            luma: c.clothLuma ?? 0.42,
          },
        ])
    )
  )
  return manifest
}

export function walkAnimKey(art: WalkArt): string {
  return art.anim ?? `walk:${art.file}`
}
