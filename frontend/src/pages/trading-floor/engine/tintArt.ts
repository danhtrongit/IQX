import type * as Phaser from "phaser"
import { type Facing, OUTFIT_COLORS, type OutfitColorId } from "../net/types.ts"
import { recolorRgbaBuffer } from "./recolor.ts"
import type { RecolorReply, RecolorRequest } from "./recolor.worker.ts"
import {
  ASSET_ROOT,
  type CharacterArt,
  type FrameArt,
  type WalkArt,
} from "./assets.ts"

/**
 * Outfit recoloring of a character's sheets. The pixel work runs in a Web Worker (one sheet at a time),
 * so a visitor in a coloured outfit joining the floor does not freeze the game, and masks are decoded
 * only while a sheet is being recoloured: nothing but the finished textures stays in memory.
 */

const sceneArtCache = new WeakMap<
  Phaser.Scene,
  Map<string, Promise<CharacterArt>>
>()

type Source = HTMLImageElement | HTMLCanvasElement

// ---------- worker ----------

let worker: Worker | null = null
let workerBroken = false
let nextId = 1
const waiting = new Map<number, (reply: RecolorReply) => void>()

function getWorker(): Worker | null {
  if (workerBroken || typeof OffscreenCanvas === "undefined") return null
  if (worker) return worker
  try {
    worker = new Worker(new URL("./recolor.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.onmessage = (event: MessageEvent<RecolorReply>) => {
      const done = waiting.get(event.data.id)
      waiting.delete(event.data.id)
      done?.(event.data)
    }
    worker.onerror = () => {
      // The worker could not start (old browser, blocked script): every pending sheet falls back.
      workerBroken = true
      for (const [id, done] of waiting)
        done({ id, error: "worker failed" })
      waiting.clear()
      worker?.terminate()
      worker = null
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

/** Stops the recolor worker (the floor was left). */
export function stopRecolorWorker(): void {
  worker?.terminate()
  worker = null
  for (const [id, done] of waiting) done({ id, error: "stopped" })
  waiting.clear()
}

async function recolorInWorker(
  source: Source,
  maskPath: string,
  hex: string,
  refLuma: number
): Promise<HTMLCanvasElement | null> {
  const w = getWorker()
  if (!w) return null
  const bitmap = await createImageBitmap(source)
  const id = nextId++
  const request: RecolorRequest = {
    id,
    source: bitmap,
    maskUrl: new URL(`${ASSET_ROOT}${maskPath}`, location.href).href,
    hex,
    refLuma,
  }
  const reply = await new Promise<RecolorReply>((resolve) => {
    waiting.set(id, resolve)
    w.postMessage(request, [bitmap])
  })
  if ("error" in reply) return null
  const canvas = document.createElement("canvas")
  canvas.width = reply.bitmap.width
  canvas.height = reply.bitmap.height
  canvas.getContext("2d")!.drawImage(reply.bitmap, 0, 0)
  reply.bitmap.close()
  return canvas
}

// ---------- main-thread fallback ----------

function loadImage(relPath: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `${ASSET_ROOT}${relPath}`
  })
}

async function recolorOnPage(
  source: Source,
  maskPath: string,
  hex: string,
  refLuma: number
): Promise<HTMLCanvasElement | null> {
  const mask = await loadImage(maskPath)
  if (!mask) return null
  // Give the game a frame before the pixel loop.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const w = source.width
  const h = source.height
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(mask, 0, 0, w, h)
  const maskData = ctx.getImageData(0, 0, w, h)
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  const src = ctx.getImageData(0, 0, w, h)
  src.data.set(recolorRgbaBuffer(src.data, maskData.data, hex, refLuma))
  ctx.putImageData(src, 0, 0)
  return canvas
}

async function recolor(
  source: Source,
  maskPath: string,
  hex: string,
  refLuma: number
): Promise<HTMLCanvasElement | null> {
  try {
    const done = await recolorInWorker(source, maskPath, hex, refLuma)
    if (done) return done
  } catch {
    // createImageBitmap or the worker failed: recolour here instead.
  }
  return recolorOnPage(source, maskPath, hex, refLuma)
}

// ---------- tinted art ----------

const tintKey = (charId: string, colorId: string, part: string): string =>
  `tint:${charId}:${colorId}:${part}`

async function buildTintedCharacterArt(
  scene: Phaser.Scene,
  charId: string,
  baseArt: CharacterArt,
  colorId: OutfitColorId,
  hex: string
): Promise<CharacterArt> {
  const masks = baseArt.masks
  if (!masks) return baseArt
  const refLuma = baseArt.clothLuma ?? 0.42
  const alive = (): boolean => scene.sys.isActive()

  const newIdle: Partial<Record<Facing, FrameArt>> = {}
  const newWalk: Partial<Record<Facing, WalkArt>> = {}

  // One sheet at a time keeps the peak memory to a single sheet's pixel buffers.
  for (const [facing, frame] of Object.entries(baseArt.idle) as [
    Facing,
    FrameArt,
  ][]) {
    const maskPath = masks.idle[facing]
    const newKey = tintKey(charId, colorId, `rest_${facing}`)
    if (!scene.textures.exists(newKey)) {
      if (!maskPath || !alive() || !scene.textures.exists(frame.file)) {
        newIdle[facing] = frame
        continue
      }
      const src = scene.textures.get(frame.file).getSourceImage() as Source
      const canvas = await recolor(src, maskPath, hex, refLuma)
      if (!canvas || !alive()) {
        newIdle[facing] = frame
        continue
      }
      if (!scene.textures.exists(newKey))
        scene.textures.addCanvas(newKey, canvas)
    }
    newIdle[facing] = { ...frame, file: newKey }
  }

  for (const [facing, walk] of Object.entries(baseArt.walk) as [
    Facing,
    WalkArt,
  ][]) {
    const maskPath = masks.walk[facing]
    const newKey = tintKey(charId, colorId, `walk_${facing}`)
    const animKey = `walk:${newKey}`
    if (!scene.textures.exists(newKey)) {
      if (!maskPath || !alive() || !scene.textures.exists(walk.file)) {
        newWalk[facing] = walk
        continue
      }
      const src = scene.textures.get(walk.file).getSourceImage() as Source
      const canvas = await recolor(src, maskPath, hex, refLuma)
      if (!canvas || !alive()) {
        newWalk[facing] = walk
        continue
      }
      if (!scene.textures.exists(newKey))
        scene.textures.addSpriteSheet(
          newKey,
          canvas as unknown as HTMLImageElement,
          { frameWidth: walk.cell, frameHeight: walk.cell }
        )
    }
    if (!scene.anims.exists(animKey) && scene.textures.exists(newKey)) {
      const meanMs =
        walk.durationsMs.reduce((a, b) => a + b, 0) / walk.durationsMs.length
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(newKey, {
          start: 0,
          end: walk.frames - 1,
        }),
        frameRate: 1000 / meanMs,
        repeat: -1,
      })
    }
    newWalk[facing] = { ...walk, file: newKey, anim: animKey }
  }

  return { ...baseArt, idle: newIdle, walk: newWalk }
}

/**
 * Returns outfit-recolored CharacterArt (cached per scene, avatar, and color). The character's walk
 * sheets must already be loaded, or the walk stays in the original colour.
 */
export function getTintedCharacterArt(
  scene: Phaser.Scene,
  charId: string,
  baseArt: CharacterArt,
  colorId?: OutfitColorId
): Promise<CharacterArt> {
  if (!colorId || colorId === "default" || !baseArt.masks)
    return Promise.resolve(baseArt)
  const swatch = OUTFIT_COLORS.find((c) => c.id === colorId)
  if (!swatch?.hex) return Promise.resolve(baseArt)

  let cache = sceneArtCache.get(scene)
  if (!cache) {
    cache = new Map()
    sceneArtCache.set(scene, cache)
  }
  const cacheKey = `${charId}:${colorId}`
  const existing = cache.get(cacheKey)
  if (existing) return existing

  const job = buildTintedCharacterArt(
    scene,
    charId,
    baseArt,
    colorId,
    swatch.hex
  ).catch(() => baseArt)
  cache.set(cacheKey, job)
  return job
}

/** Frees the recoloured textures of one character and outfit (nobody on the floor wears it any more). */
export function evictTintedArt(
  scene: Phaser.Scene,
  charId: string,
  colorId: string
): void {
  sceneArtCache.get(scene)?.delete(`${charId}:${colorId}`)
  const prefix = tintKey(charId, colorId, "")
  for (const key of scene.textures.getTextureKeys())
    if (key.startsWith(prefix)) {
      const anim = `walk:${key}`
      if (scene.anims.exists(anim)) scene.anims.remove(anim)
      scene.textures.remove(key)
    }
}
