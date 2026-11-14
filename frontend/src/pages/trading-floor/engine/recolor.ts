/**
 * Luminance-preserving cloth recoloring on premultiplied-straight RGBA image buffers.
 * Pure TypeScript so it runs identically in the browser UI, Phaser texture cache, and Node tests.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex
  if (clean.length !== 6) throw new Error(`Invalid hex color: ${hex}`)
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ]
}

/**
 * Recolors pixels indicated by `mask` towards `hex` while preserving cloth folds, shading,
 * highlights, and alpha transparency.
 */
export function recolorRgbaBuffer(
  src: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  hex: string,
  refLuma = 0.42
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length)
  const [tr, tg, tb] = hexToRgb(hex)
  const ref = Math.max(0.16, Math.min(0.84, refLuma))

  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    if (a === 0) {
      out[i] = 0
      out[i + 1] = 0
      out[i + 2] = 0
      out[i + 3] = 0
      continue
    }

    const r = src[i]
    const g = src[i + 1]
    const b = src[i + 2]
    const m = (mask[i] / 255) * (mask[i + 3] / 255)

    if (m < 0.02) {
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
      out[i + 3] = a
      continue
    }

    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    let nr: number
    let ng: number
    let nb: number
    if (luma <= ref) {
      const k = Math.pow(luma / ref, 0.92)
      nr = tr * k
      ng = tg * k
      nb = tb * k
    } else {
      const t = ((luma - ref) / (1 - ref)) * 0.72
      nr = tr + (255 - tr) * t
      ng = tg + (255 - tg) * t
      nb = tb + (255 - tb) * t
    }

    out[i] = Math.round(r * (1 - m) + nr * m)
    out[i + 1] = Math.round(g * (1 - m) + ng * m)
    out[i + 2] = Math.round(b * (1 - m) + nb * m)
    out[i + 3] = a
  }

  return out
}
