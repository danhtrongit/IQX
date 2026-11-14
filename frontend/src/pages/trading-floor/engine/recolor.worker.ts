/**
 * Recolors one sprite sheet off the main thread: the page hands over the sheet as an ImageBitmap and the
 * mask URL; the worker fetches and decodes the mask itself, so neither the pixel loop nor the mask decode
 * costs the game a frame.
 */
import { recolorRgbaBuffer } from "./recolor.ts"

export interface RecolorRequest {
  id: number
  source: ImageBitmap
  maskUrl: string
  hex: string
  refLuma: number
}

export type RecolorReply =
  | { id: number; bitmap: ImageBitmap }
  | { id: number; error: string }

/** The worker global, typed without the webworker lib (the app compiles against the DOM lib). */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RecolorRequest>) => void) | null
  postMessage(message: RecolorReply, transfer?: Transferable[]): void
}

scope.onmessage = (event) => void handle(event.data)

async function handle(request: RecolorRequest): Promise<void> {
  const { id, source, maskUrl, hex, refLuma } = request
  try {
    const res = await fetch(maskUrl)
    if (!res.ok) throw new Error(`mask ${res.status}`)
    const mask = await createImageBitmap(await res.blob())
    const { width: w, height: h } = source
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.drawImage(source, 0, 0)
    const src = ctx.getImageData(0, 0, w, h)
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(mask, 0, 0, w, h)
    const maskData = ctx.getImageData(0, 0, w, h)
    source.close()
    mask.close()
    src.data.set(recolorRgbaBuffer(src.data, maskData.data, hex, refLuma))
    ctx.putImageData(src, 0, 0)
    const bitmap = canvas.transferToImageBitmap()
    scope.postMessage({ id, bitmap }, [bitmap])
  } catch (error) {
    source.close()
    scope.postMessage({ id, error: String(error) })
  }
}
