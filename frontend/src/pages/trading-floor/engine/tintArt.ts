import type * as Phaser from "phaser"
import { type Facing, OUTFIT_COLORS, type OutfitColorId } from "../net/types.ts"
import { recolorRgbaBuffer } from "./recolor.ts"
import {
  ASSET_ROOT,
  type CharacterArt,
  type FrameArt,
  type WalkArt,
} from "./assets.ts"

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
const sceneArtCache = new WeakMap<
  Phaser.Scene,
  Map<string, Promise<CharacterArt>>
>()

function loadMaskImage(relPath: string): Promise<HTMLImageElement | null> {
  const existing = imageCache.get(relPath)
  if (existing) return existing
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `${ASSET_ROOT}${relPath}`
  })
  imageCache.set(relPath, p)
  return p
}

function recolorToCanvas(
  srcImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement,
  hex: string,
  refLuma: number
): HTMLCanvasElement {
  const w = srcImage.width
  const h = srcImage.height
  const srcCanvas = document.createElement("canvas")
  srcCanvas.width = w
  srcCanvas.height = h
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true })!
  sctx.drawImage(srcImage, 0, 0, w, h)
  const srcData = sctx.getImageData(0, 0, w, h)

  const maskCanvas = document.createElement("canvas")
  maskCanvas.width = w
  maskCanvas.height = h
  const mctx = maskCanvas.getContext("2d", { willReadFrequently: true })!
  mctx.drawImage(maskImage, 0, 0, w, h)
  const maskData = mctx.getImageData(0, 0, w, h)

  const recolored = recolorRgbaBuffer(srcData.data, maskData.data, hex, refLuma)
  srcData.data.set(recolored)
  sctx.putImageData(srcData, 0, 0)
  return srcCanvas
}

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

  const newIdle: Partial<Record<Facing, FrameArt>> = {}
  const newWalk: Partial<Record<Facing, WalkArt>> = {}

  const idleTasks = (Object.entries(baseArt.idle) as [Facing, FrameArt][]).map(
    async ([facing, frame]) => {
      const maskPath = masks.idle[facing]
      if (!maskPath || !scene.textures.exists(frame.file)) {
        newIdle[facing] = frame
        return
      }
      const newKey = `tint:${charId}:${colorId}:rest_${facing}`
      if (!scene.textures.exists(newKey)) {
        const maskImg = await loadMaskImage(maskPath)
        if (!maskImg || !scene.sys.isActive()) {
          newIdle[facing] = frame
          return
        }
        const srcImg = scene.textures.get(frame.file).getSourceImage() as
          HTMLImageElement | HTMLCanvasElement
        const canvas = recolorToCanvas(srcImg, maskImg, hex, refLuma)
        if (!scene.textures.exists(newKey))
          scene.textures.addCanvas(newKey, canvas)
      }
      newIdle[facing] = { ...frame, file: newKey }
    }
  )

  const walkTasks = (Object.entries(baseArt.walk) as [Facing, WalkArt][]).map(
    async ([facing, walk]) => {
      const maskPath = masks.walk[facing]
      if (!maskPath || !scene.textures.exists(walk.file)) {
        newWalk[facing] = walk
        return
      }
      const newKey = `tint:${charId}:${colorId}:walk_${facing}`
      const animKey = `walk:${newKey}`
      if (!scene.textures.exists(newKey)) {
        const maskImg = await loadMaskImage(maskPath)
        if (!maskImg || !scene.sys.isActive()) {
          newWalk[facing] = walk
          return
        }
        const srcImg = scene.textures.get(walk.file).getSourceImage() as
          HTMLImageElement | HTMLCanvasElement
        const canvas = recolorToCanvas(srcImg, maskImg, hex, refLuma)
        if (!scene.textures.exists(newKey)) {
          scene.textures.addSpriteSheet(
            newKey,
            canvas as unknown as HTMLImageElement,
            {
              frameWidth: walk.cell,
              frameHeight: walk.cell,
            }
          )
        }
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
  )

  await Promise.all([...idleTasks, ...walkTasks])
  return { ...baseArt, idle: newIdle, walk: newWalk }
}

/** Returns outfit-recolored CharacterArt (cached per scene, avatar, and color). */
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
