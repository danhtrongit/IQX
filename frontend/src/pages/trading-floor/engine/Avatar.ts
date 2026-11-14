import * as Phaser from "phaser"
import type { Facing } from "../net/types.ts"
import { type CharacterArt, type FrameArt, walkAnimKey } from "./assets.ts"

export const DEPTH_LABEL = 1_000_000
const FACINGS: Facing[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]

/** 8-way facing of a screen-space direction (y down). */
export function facingOf(dx: number, dy: number): Facing {
  const a = Math.atan2(dy, dx) // 0 = east, +π/2 = south
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
  return FACINGS[i]
}

export interface AvatarOptions {
  name: string
  /** Small line under the name (role). */
  title?: string
  kind: "self" | "peer" | "npc"
  /** Height of the name tag (and speech bubble) above the feet; a broker is 104 tall. */
  height?: number
  /** False hides the name tag. */
  tag?: boolean
  /** Floor shadow size. */
  shadow?: [number, number]
  /** Speech bubble above the head (default) or beside it, to the right: for a tall figure near the wall, out of view above. */
  bubble?: "above" | "right"
}

/**
 * A character standing or walking on the floor: shadow, sprite, name tag and speech bubble.
 * Walks play the packaged cycle at its native cadence; a character without walk art glides with a light bob.
 */
export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite
  readonly name: string
  facing: Facing = "s"
  moving = false
  x: number
  y: number
  private readonly scene: Phaser.Scene
  private art: CharacterArt
  private readonly shadow: Phaser.GameObjects.Image
  private readonly tag: Phaser.GameObjects.Text | null
  private readonly height: number
  private readonly bubbleSide: "above" | "right"
  private bubble: Phaser.GameObjects.Text | null = null
  private bubbleTimer: Phaser.Time.TimerEvent | null = null
  private bob = 0
  private shown: string | null = null

  constructor(
    scene: Phaser.Scene,
    art: CharacterArt,
    x: number,
    y: number,
    facing: Facing,
    opts: AvatarOptions
  ) {
    this.scene = scene
    this.art = art
    this.x = x
    this.y = y
    this.facing = facing
    this.name = opts.name
    this.height = opts.height ?? 112
    this.bubbleSide = opts.bubble ?? "above"
    const [sw, sh] = opts.shadow ?? [54, 16]
    this.shadow = scene.add
      .image(x, y, "shadow")
      .setDisplaySize(sw, sh)
      .setAlpha(0.42)
    const first = idleOf(art, facing)
    this.sprite = scene.add.sprite(x, y, first.file, first.frame)
    const colour =
      opts.kind === "self"
        ? "#ffd76a"
        : opts.kind === "npc"
          ? "#9fd3ff"
          : "#ffffff"
    const label = opts.title ? `${opts.name}\n${opts.title}` : opts.name
    this.tag =
      opts.tag === false
        ? null
        : scene.add
            .text(x, y, label, {
              fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
              fontSize: "13px",
              fontStyle: "600",
              color: colour,
              align: "center",
              backgroundColor: "rgba(12,17,27,0.62)",
              padding: { x: 6, y: 2 },
              resolution: 3,
            })
            .setOrigin(0.5, 1)
    this.refresh()
    this.place()
  }

  /** Name tag height above the feet. */
  private get headY(): number {
    return this.y - this.height
  }

  /** Anchor of the speech bubble: above the name tag (or the head), or beside the head on the right. */
  private bubbleAt(): [number, number] {
    // Level with the face and clear of a waving hand (Thần Tài's reaches about 0.45 of his height).
    if (this.bubbleSide === "right")
      return [this.x + this.height * 0.5, this.y - this.height * 0.42]
    return [this.x, this.headY - (this.tag ? this.tag.height + 6 : 6)]
  }

  setPosition(x: number, y: number): void {
    this.x = x
    this.y = y
    this.place()
  }

  set(facing: Facing, moving: boolean): void {
    if (facing === this.facing && moving === this.moving) return
    this.facing = facing
    this.moving = moving
    this.refresh()
  }

  /** Swaps the character's sprite art (used when async tinted textures finish generating). */
  setArt(art: CharacterArt): void {
    this.art = art
    this.shown = null
    this.refresh()
  }

  /** Glide characters (no walk art) bob while moving. */
  tick(dtMs: number): void {
    if (this.moving && !this.art.walk[this.facing]) {
      this.bob += dtMs / 1000
      this.place()
    } else if (this.bob) {
      this.bob = 0
      this.place()
    }
  }

  say(text: string): void {
    this.bubble?.destroy()
    this.bubbleTimer?.remove()
    this.bubble = this.scene.add
      .text(...this.bubbleAt(), text, {
        fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
        fontSize: "15px",
        fontStyle: "600",
        color: "#101522",
        backgroundColor: "#fff6dc",
        padding: { x: 9, y: 5 },
        align: "center",
        wordWrap: { width: 220 },
        resolution: 3,
      })
      .setOrigin(this.bubbleSide === "right" ? 0 : 0.5, 1)
      .setDepth(DEPTH_LABEL + this.y + 1)
    this.bubbleTimer = this.scene.time.delayedCall(4200, () => {
      const b = this.bubble
      this.bubble = null
      if (b)
        this.scene.tweens.add({
          targets: b,
          alpha: 0,
          duration: 300,
          onComplete: () => b.destroy(),
        })
    })
  }

  destroy(): void {
    this.bubbleTimer?.remove()
    this.bubble?.destroy()
    this.sprite.destroy()
    this.shadow.destroy()
    this.tag?.destroy()
  }

  private place(): void {
    const lift = this.bob
      ? Math.abs(Math.sin(this.bob * Math.PI * 3.2)) * 2.4
      : 0
    this.sprite.setPosition(this.x, this.y - lift).setDepth(this.y)
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 0.5)
    this.tag?.setPosition(this.x, this.headY).setDepth(DEPTH_LABEL + this.y)
    this.bubble
      ?.setPosition(...this.bubbleAt())
      .setDepth(DEPTH_LABEL + this.y + 1)
  }

  /**
   * Plays a one-shot action (a baked 'wave', say) for the current facing, then returns to the idle
   * frame. Ignored while walking or when the art has no such action.
   */
  act(name: string): boolean {
    const art = this.art.actions?.[name]?.[this.facing]
    if (!art || this.moving) return false
    const key = walkAnimKey(art)
    this.apply(art)
    this.sprite.setFlipX(!!art.flipX).play(key)
    this.shown = key
    this.sprite.once(
      `${Phaser.Animations.Events.ANIMATION_COMPLETE_KEY}${key}`,
      () => {
        if (this.shown !== key) return // started walking meanwhile
        this.shown = null
        this.refresh()
      }
    )
    return true
  }

  /** True while an action plays. */
  get acting(): boolean {
    return !!this.shown?.startsWith("act:")
  }

  private refresh(): void {
    const walk = this.moving ? this.art.walk[this.facing] : undefined
    if (walk) {
      const key = walkAnimKey(walk)
      if (this.shown !== key) {
        this.apply(walk)
        this.sprite.play(key)
        this.shown = key
      }
      this.sprite.setFlipX(!!walk.flipX)
      return
    }
    const idle = idleOf(this.art, this.facing)
    this.sprite.stop()
    this.apply(idle)
    this.sprite.setTexture(idle.file, idle.frame).setFlipX(!!idle.flipX)
    this.shown = null
  }

  private apply(f: FrameArt): void {
    // The anchor is in frame pixels: a named frame, a spritesheet cell (frame 0) or the whole image.
    const frame = this.scene.textures.getFrame(
      f.file,
      f.frame ?? ("cell" in f ? 0 : undefined)
    )
    this.sprite
      .setOrigin(f.anchor[0] / frame.width, f.anchor[1] / frame.height)
      .setScale(1 / f.density)
  }
}

function idleOf(art: CharacterArt, facing: Facing): FrameArt {
  return art.idle[facing] ?? art.idle.s ?? Object.values(art.idle)[0]!
}
