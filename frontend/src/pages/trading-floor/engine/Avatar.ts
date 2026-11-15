import * as Phaser from "phaser"
import type { Facing, NameBadge } from "../net/types.ts"
import {
  type CharacterArt,
  type FrameArt,
  type WalkArt,
  walkAnimKey,
} from "./assets.ts"

export const DEPTH_LABEL = 1_000_000
const FACINGS: Facing[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]

/** 8-way facing of a screen-space direction (y down). */
export function facingOf(dx: number, dy: number): Facing {
  const a = Math.atan2(dy, dx) // 0 = east, +π/2 = south
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
  return FACINGS[i]
}

interface BadgeArt {
  bg: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  w: number
}

/** Pill colours: gold for the owner tag, bright teal for SACO; dark text on both. */
const BADGE_TONES: Record<
  NameBadge["tone"],
  { text: string; glow: number; fill: number; shine: number; line: number }
> = {
  owner: {
    text: "#2a1a02",
    glow: 0xffc83d,
    fill: 0xf5b81c,
    shine: 0xffe58a,
    line: 0xfff3c4,
  },
  saco: {
    text: "#022a26",
    glow: 0x2ee6c8,
    fill: 0x14c8ac,
    shine: 0x7ff2dc,
    line: 0xc9fff4,
  },
}

export interface AvatarOptions {
  name: string
  /** Pills drawn before the name (owner-only avatar, SACO). */
  badges?: NameBadge[]
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
  private badges: BadgeArt[] = []
  private readonly height: number
  private readonly bubbleSide: "above" | "right"
  private bubble: Phaser.GameObjects.Text | null = null
  private bubbleTimer: Phaser.Time.TimerEvent | null = null
  private bob = 0
  private shown: string | null = null
  /** World units per second the figure is moving at; the walk cycle runs in proportion so feet do not slide. */
  private speed = 0

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
    if (this.tag) for (const b of opts.badges ?? []) this.makeBadge(b)
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

  /** Walking pace in world units per second (0 = native cadence). Remote figures catching up walk a little faster. */
  setSpeed(speed: number): void {
    if (Math.abs(speed - this.speed) < 1) return
    this.speed = speed
    this.applyPace()
  }

  /** Glide characters (no walk art yet) bob while moving; the walk takes over once its sheet has loaded. */
  tick(dtMs: number): void {
    if (this.moving && this.shown === null && this.walkFor(this.facing))
      this.refresh()
    if (this.moving && !this.walkFor(this.facing)) {
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
    this.clearBadges()
  }

  /** Replaces the pills before the name where the character stands (a SACO right granted or removed). */
  setBadges(badges: NameBadge[]): void {
    this.clearBadges()
    if (this.tag) for (const b of badges) this.makeBadge(b)
    this.place()
  }

  private clearBadges(): void {
    for (const b of this.badges) {
      b.bg.destroy()
      b.label.destroy()
    }
    this.badges = []
  }

  /** Short pill badge (e.g. "IT", "SACO") drawn just left of the name tag, in its tone with a soft glow. */
  private makeBadge(badge: NameBadge): void {
    const tone = BADGE_TONES[badge.tone]
    const label = this.scene.add
      .text(0, 0, badge.text, {
        fontFamily: '"Be Vietnam Pro", system-ui, sans-serif',
        fontSize: "11px",
        fontStyle: "800",
        color: tone.text,
        resolution: 3,
      })
      .setOrigin(0.5, 0.5)
    const w = Math.ceil(label.width) + 12
    const h = 17
    const g = this.scene.add.graphics()
    g.fillStyle(tone.glow, 0.28)
    g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, (h + 4) / 2)
    g.fillStyle(tone.fill, 1)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2)
    g.fillStyle(tone.shine, 1)
    g.fillRoundedRect(
      -w / 2 + 2,
      -h / 2 + 1.5,
      w - 4,
      h / 2 - 1.5,
      (h / 2 - 1.5) / 2
    )
    g.lineStyle(1, tone.line, 0.95)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2)
    this.badges.push({ bg: g, label, w })
  }

  private place(): void {
    const lift = this.bob
      ? Math.abs(Math.sin(this.bob * Math.PI * 3.2)) * 2.4
      : 0
    this.sprite.setPosition(this.x, this.y - lift).setDepth(this.y)
    this.shadow.setPosition(this.x, this.y - 1).setDepth(this.y - 0.5)
    if (this.tag && this.badges.length) {
      const gap = 4
      const badgesW = this.badges.reduce((sum, b) => sum + b.w + gap, 0)
      let left = this.x - (badgesW + this.tag.width) / 2
      // Level with the first line of the name tag (13px text + 2px padding).
      const by = this.headY - this.tag.height + 11
      for (const b of this.badges) {
        const bx = left + b.w / 2
        b.bg.setPosition(bx, by).setDepth(DEPTH_LABEL + this.y)
        b.label.setPosition(bx, by + 0.5).setDepth(DEPTH_LABEL + this.y + 0.1)
        left += b.w + gap
      }
      this.tag
        .setPosition(left + this.tag.width / 2, this.headY)
        .setDepth(DEPTH_LABEL + this.y)
    } else {
      this.tag?.setPosition(this.x, this.headY).setDepth(DEPTH_LABEL + this.y)
    }
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
    this.sprite.anims.timeScale = 1
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

  /** The walk of a facing once its sheet is loaded (walk sheets load on demand). */
  private walkFor(facing: Facing): WalkArt | undefined {
    const walk = this.art.walk[facing]
    return walk && this.scene.anims.exists(walkAnimKey(walk)) ? walk : undefined
  }

  private applyPace(): void {
    const walk = this.moving ? this.walkFor(this.facing) : undefined
    const ref = walk?.speedRef
    this.sprite.anims.timeScale =
      walk && ref && this.speed > 0
        ? Math.max(0.5, Math.min(2, this.speed / ref))
        : 1
  }

  private refresh(): void {
    const walk = this.moving ? this.walkFor(this.facing) : undefined
    if (walk) {
      const key = walkAnimKey(walk)
      if (this.shown !== key) {
        this.apply(walk)
        this.sprite.play(key)
        this.shown = key
      }
      this.sprite.setFlipX(!!walk.flipX)
      this.applyPace()
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
