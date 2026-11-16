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

/**
 * Phones and tablets get the lite floor: an iPhone reloads the page ("the tab keeps resetting") once
 * the full character sheets of a busy floor are in memory. Touch-first devices and machines that
 * report 4 GB of RAM or less count.
 */
export function liteDevice(): boolean {
  if (typeof window === "undefined") return false
  const memory = (navigator as { deviceMemory?: number }).deviceMemory
  return (
    window.matchMedia?.("(pointer: coarse)").matches === true ||
    (memory !== undefined && memory <= 4)
  )
}

/** Device pixels the canvas draws per CSS pixel: the lite floor stops at 2, a third of the buffer of a 3x phone. */
export function renderRatio(): number {
  const dpr = window.devicePixelRatio || 1
  return liteDevice() ? Math.min(dpr, LITE_MAX_RATIO) : dpr
}

const LITE_MAX_RATIO = 2
const FULL_SUFFIX = "@2x.webp"
const LITE_SUFFIX = "@1x.webp"

function liteFrame<T extends FrameArt>(art: T): T {
  if (!art.file.endsWith(FULL_SUFFIX)) return art
  const half: T = {
    ...art,
    file: art.file.slice(0, -FULL_SUFFIX.length) + LITE_SUFFIX,
    density: art.density / 2,
    anchor: [art.anchor[0] / 2, art.anchor[1] / 2],
  }
  if ("cell" in half && typeof half.cell === "number") half.cell /= 2
  return half
}

const liteFrames = <T extends FrameArt>(
  frames: Partial<Record<Facing, T>>
): Partial<Record<Facing, T>> =>
  Object.fromEntries(
    Object.entries(frames).map(([facing, art]) => [facing, liteFrame(art)])
  )

/**
 * The same manifest pointing at the half-size character sheets (`*@1x.webp`, a quarter of the pixels,
 * written by `scripts/trading-floor-lite-art.py`). Masks stay as they are: a mask is scaled onto its
 * sheet when an outfit is recoloured.
 */
export function liteManifest(manifest: Manifest): Manifest {
  return {
    ...manifest,
    characters: Object.fromEntries(
      Object.entries(manifest.characters).map(([id, c]) => [
        id,
        {
          ...c,
          idle: liteFrames(c.idle),
          walk: liteFrames(c.walk),
          ...(c.actions && {
            actions: Object.fromEntries(
              Object.entries(c.actions).map(([name, a]) => [
                name,
                liteFrames(a),
              ])
            ),
          }),
          ...(c.statue && { statue: liteFrame(c.statue) }),
        },
      ])
    ),
  }
}

export function walkAnimKey(art: WalkArt): string {
  return art.anim ?? `walk:${art.file}`
}
