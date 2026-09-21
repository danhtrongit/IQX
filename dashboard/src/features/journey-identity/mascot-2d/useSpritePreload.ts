import { useEffect, useState } from "react"
import { identityEvent } from "../state"
import type { MascotId } from "../types"
import { MASCOT_ASSET_VERSION, mascotAssetRoot, validateMascotManifest, type Mascot2DManifest } from "./mascotManifest"

const manifests = new Map<MascotId, Promise<Mascot2DManifest>>()
type SpriteSize = { width: number; height: number }
const images = new Map<string, Promise<SpriteSize>>()
const decodedImages = new Map<string, SpriteSize>()
export function loadMascotManifest(id: MascotId): Promise<Mascot2DManifest> {
  let result = manifests.get(id)
  if (!result) {
    result = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await fetch(`${mascotAssetRoot(id)}/manifest.json?v=${MASCOT_ASSET_VERSION}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`)
        return validateMascotManifest(await response.json(), id)
      } finally { clearTimeout(timer) }
    })()
    manifests.set(id, result)
    void result.catch(() => { manifests.delete(id) })
  }
  return result
}
export function preloadSprite(src: string): Promise<SpriteSize> {
  let result = images.get(src)
  if (!result) {
    result = new Promise((resolve, reject) => {
      const image = new Image()
      let done = false
      const finish = (error?: Error) => {
        if (done) return
        done = true; clearTimeout(timer); image.onload = null; image.onerror = null
        if (error) reject(error)
        else resolve({ width: image.naturalWidth, height: image.naturalHeight })
      }
      const timer = setTimeout(() => finish(new Error("Image timeout")), 8000)
      image.onload = () => {
        if (typeof image.decode !== "function") { finish(); return }
        // Some browser/image implementations throw before returning the decode
        // promise. Treat that the same as an asynchronous decode rejection so a
        // corrupt strip cannot leave the shared cache pending until timeout.
        try {
          void image.decode().then(() => finish(), () => finish(new Error("Image decode failed")))
        } catch {
          finish(new Error("Image decode failed"))
        }
      }
      image.onerror = () => finish(new Error("Image load failed"))
      image.src = src
    })
    images.set(src, result)
    void result.then(size => { decodedImages.set(src, size) }, () => { images.delete(src) })
  }
  return result
}
export function useMascotManifest(id: MascotId) {
  const [result, setResult] = useState<{ id: MascotId; data?: Mascot2DManifest; error?: boolean }>()
  useEffect(() => {
    let live = true
    void loadMascotManifest(id).then(data => { if (live) setResult({ id, data }) }, () => {
      if (live) {
        identityEvent("mascot_manifest_invalid", { mascot_id: id })
        setResult({ id, error: true })
      }
    })
    return () => { live = false }
  }, [id])
  return result?.id === id ? result : undefined
}
export function useSpritePreload(src: string | undefined) {
  const [result, setResult] = useState<{ src: string; width?: number; height?: number; error?: boolean }>()
  useEffect(() => {
    if (!src) return
    // A state/token transition remounts the player intentionally. Reuse a
    // decoded strip during that first render so it cannot flash back to poster.
    if (decodedImages.has(src)) return
    let live = true
    void preloadSprite(src).then(size => { if (live) setResult({ src, ...size }) }, () => { if (live) setResult({ src, error: true }) })
    return () => { live = false }
  }, [src])
  const decoded = src ? decodedImages.get(src) : undefined
  if (src && decoded) return { src, ...decoded }
  return src && result?.src === src ? result : undefined
}
