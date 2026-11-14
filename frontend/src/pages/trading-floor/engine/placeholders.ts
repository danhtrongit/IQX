/**
 * Temporary code-drawn stand-ins for props whose generated art does not exist yet
 * (agy image quota ran out). Each one is replaced automatically once the art is in the manifest.
 * Drawn around (0, 0) = bottom-centre of the object.
 */
import type * as Phaser from "phaser"
import type { Placeholder } from "./layout.ts"

const GOLD = 0xd9ab45
const WALNUT = 0x5b3a24
const WALNUT_DARK = 0x3e2716
const STONE = 0xf0ece4
const OUTLINE = 0x2a1a10

export function drawPlaceholder(
  g: Phaser.GameObjects.Graphics,
  kind: Placeholder,
  w: number,
  h: number
): void {
  g.lineStyle(2, OUTLINE, 1)
  switch (kind) {
    case "plant":
    case "plant-small": {
      const potH = h * (kind === "plant" ? 0.3 : 0.42)
      const potW = w * 0.56
      g.fillStyle(0x1c1e24)
        .fillRoundedRect(-potW / 2, -potH, potW, potH, 4)
        .strokeRoundedRect(-potW / 2, -potH, potW, potH, 4)
      g.fillStyle(GOLD).fillRect(-potW / 2, -potH, potW, 3)
      const cy = -potH - (h - potH) * 0.48
      const r = w * 0.36
      const leaves: [number, number, number, number][] = [
        [0, cy, r * 1.05, 0x2e6e43],
        [-r * 0.6, cy + r * 0.35, r * 0.75, 0x357d4c],
        [r * 0.6, cy + r * 0.3, r * 0.75, 0x357d4c],
        [-r * 0.3, cy - r * 0.55, r * 0.7, 0x449a5f],
        [r * 0.35, cy - r * 0.5, r * 0.68, 0x4fae6c],
        [0, cy - r * 0.05, r * 0.5, 0x5fbf79],
      ]
      for (const [x, y, rr, c] of leaves) g.fillStyle(c).fillCircle(x, y, rr)
      break
    }
    case "offering": {
      g.fillStyle(0x8f1717)
        .fillRect(-w / 2 + 6, -h * 0.62, w - 12, h * 0.62)
        .strokeRect(-w / 2 + 6, -h * 0.62, w - 12, h * 0.62)
      g.fillStyle(0xbf2d24)
        .fillRect(-w / 2, -h * 0.82, w, h * 0.22)
        .strokeRect(-w / 2, -h * 0.82, w, h * 0.22)
      g.fillStyle(GOLD)
        .fillRect(-w / 2, -h * 0.62, w, 3)
        .fillRect(-w / 2 + 6, -h * 0.34, w - 12, 2)
      // Incense burner, fruit plate and candles on top
      g.fillStyle(0xe2b64a)
        .fillRoundedRect(-14, -h * 0.82 - 16, 28, 16, 4)
        .strokeRoundedRect(-14, -h * 0.82 - 16, 28, 16, 4)
      g.fillStyle(0xf1d36b)
        .fillCircle(-w * 0.3, -h * 0.82 - 8, 9)
        .fillStyle(0xf39c34)
        .fillCircle(-w * 0.3 + 12, -h * 0.82 - 7, 8)
      g.fillStyle(0x6fae3e).fillCircle(-w * 0.3 - 10, -h * 0.82 - 6, 7)
      g.fillStyle(0xd23a2f)
        .fillRect(w * 0.28, -h * 0.82 - 18, 6, 18)
        .fillRect(w * 0.36, -h * 0.82 - 18, 6, 18)
      break
    }
    case "sofa": {
      g.fillStyle(0x1e3058)
        .fillRoundedRect(-w / 2 + 10, -h, w - 20, h * 0.55, 10)
        .strokeRoundedRect(-w / 2 + 10, -h, w - 20, h * 0.55, 10)
      g.fillStyle(0x2b4579)
        .fillRoundedRect(-w / 2 + 14, -h * 0.55, w - 28, h * 0.36, 8)
        .strokeRoundedRect(-w / 2 + 14, -h * 0.55, w - 28, h * 0.36, 8)
      g.fillStyle(0x182746)
        .fillRoundedRect(-w / 2, -h * 0.75, 24, h * 0.62, 8)
        .strokeRoundedRect(-w / 2, -h * 0.75, 24, h * 0.62, 8)
      g.fillRoundedRect(
        w / 2 - 24,
        -h * 0.75,
        24,
        h * 0.62,
        8
      ).strokeRoundedRect(w / 2 - 24, -h * 0.75, 24, h * 0.62, 8)
      g.fillStyle(GOLD)
        .fillRect(-w / 2 + 8, -h * 0.13, 5, h * 0.13)
        .fillRect(w / 2 - 13, -h * 0.13, 5, h * 0.13)
      break
    }
    case "coffee-table": {
      g.fillStyle(GOLD)
        .fillRect(-w * 0.32, -h * 0.5, 4, h * 0.5)
        .fillRect(w * 0.32 - 4, -h * 0.5, 4, h * 0.5)
      g.fillStyle(STONE)
        .fillEllipse(0, -h * 0.62, w, h * 0.62)
        .strokeEllipse(0, -h * 0.62, w, h * 0.62)
      g.fillStyle(0xffffff)
        .fillCircle(-12, -h * 0.66, 5)
        .fillCircle(10, -h * 0.6, 5)
      break
    }
    case "counter": {
      g.fillStyle(WALNUT)
        .fillRect(-w / 2, -h * 0.68, w, h * 0.68)
        .strokeRect(-w / 2, -h * 0.68, w, h * 0.68)
      g.fillStyle(WALNUT_DARK)
        .fillRect(-w / 2 + 8, -h * 0.58, w / 2 - 12, h * 0.5)
        .fillRect(4, -h * 0.58, w / 2 - 12, h * 0.5)
      g.fillStyle(STONE)
        .fillRect(-w / 2 - 4, -h * 0.8, w + 8, h * 0.13)
        .strokeRect(-w / 2 - 4, -h * 0.8, w + 8, h * 0.13)
      g.fillStyle(0x2b2d33)
        .fillRoundedRect(-w * 0.3, -h, 40, h * 0.22, 4)
        .strokeRoundedRect(-w * 0.3, -h, 40, h * 0.22, 4)
      g.fillStyle(0xc9ced6).fillRect(-w * 0.3 + 6, -h * 0.93, 28, 6)
      g.fillStyle(0xffffff)
        .fillRect(w * 0.1, -h * 0.88, 9, 10)
        .fillRect(w * 0.18, -h * 0.88, 9, 10)
      g.fillStyle(0xf39c34)
        .fillCircle(w * 0.33, -h * 0.85, 7)
        .fillStyle(0xf1d36b)
        .fillCircle(w * 0.33 + 9, -h * 0.84, 6)
      break
    }
    case "reception": {
      g.fillStyle(WALNUT)
        .fillRoundedRect(-w / 2, -h * 0.74, w, h * 0.74, 14)
        .strokeRoundedRect(-w / 2, -h * 0.74, w, h * 0.74, 14)
      g.fillStyle(GOLD).fillRect(-w / 2 + 6, -h * 0.42, w - 12, 5)
      g.fillStyle(STONE)
        .fillRoundedRect(-w / 2 - 6, -h, w + 12, h * 0.28, 12)
        .strokeRoundedRect(-w / 2 - 6, -h, w + 12, h * 0.28, 12)
      break
    }
    case "rug": {
      g.fillStyle(0xefe4cf).fillEllipse(0, -h / 2, w, h)
      g.lineStyle(7, 0x22345e, 1).strokeEllipse(0, -h / 2, w - 8, h - 8)
      g.lineStyle(2, GOLD, 1).strokeEllipse(0, -h / 2, w - 22, h - 22)
      break
    }
    case "podium": {
      g.fillStyle(0x23262e)
        .fillRect(-w / 2, -h * 0.72, w, h * 0.72)
        .strokeRect(-w / 2, -h * 0.72, w, h * 0.72)
      g.fillStyle(0x3a3f4c)
        .fillRect(-w / 2 - 4, -h, w + 8, h * 0.3)
        .strokeRect(-w / 2 - 4, -h, w + 8, h * 0.3)
      g.fillStyle(GOLD).fillRect(-w * 0.36, -h * 0.6, w * 0.72, h * 0.36)
      break
    }
  }
}
