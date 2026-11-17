import * as Phaser from "phaser"
import { DEPTH_LABEL } from "./Avatar.ts"

const FONT_FAMILY = '"Be Vietnam Pro", system-ui, sans-serif'

const TEX_EGG = "fx-egg"
const TEX_SHELL_0 = "fx-shell-0"
const TEX_SHELL_1 = "fx-shell-1"
const TEX_YOLK = "fx-yolk"
const TEX_SMOKE = "fx-smoke"
const TEX_SPARK = "fx-spark"
const TEX_COIN = "fx-coin"
const TEX_COIN_SHADOW = "fx-coin-shadow"
const TEX_GLINT = "fx-glint"

const FIREWORK_COLORS = [0xffd84d, 0xff4d5a, 0xff6ec7, 0x4df3ff, 0x7cff50]

/** Creates every texture this file uses once per scene (idempotent: check scene.textures.exists). */
export function ensureFxTextures(scene: Phaser.Scene): void {
  makeCanvasTex(scene, TEX_EGG, 20, 26, 2, (c) => {
    // Soft ground contact shadow inside bottom edge
    c.fillStyle = "rgba(0,0,0,0.22)"
    c.beginPath()
    c.ellipse(10, 22, 7, 3, 0, 0, Math.PI * 2)
    c.fill()
    // Egg body
    const g = c.createRadialGradient(7, 8, 2, 10, 13, 12)
    g.addColorStop(0, "#ffffff")
    g.addColorStop(0.65, "#f4eedc")
    g.addColorStop(1, "#cfc3a8")
    c.fillStyle = g
    c.beginPath()
    c.ellipse(10, 12.5, 7.5, 10, 0, 0, Math.PI * 2)
    c.fill()
    c.lineWidth = 1.2
    c.strokeStyle = "#8d8169"
    c.stroke()
    // Specular highlight
    c.fillStyle = "rgba(255,255,255,0.8)"
    c.beginPath()
    c.ellipse(7.5, 8.5, 2, 3.2, -0.35, 0, Math.PI * 2)
    c.fill()
  })

  makeCanvasTex(scene, TEX_SHELL_0, 12, 12, 2, (c) => {
    c.fillStyle = "#faf5e8"
    c.strokeStyle = "#9c8f77"
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(2, 9)
    c.lineTo(6, 1.5)
    c.lineTo(10.5, 8)
    c.closePath()
    c.fill()
    c.stroke()
  })

  makeCanvasTex(scene, TEX_SHELL_1, 12, 12, 2, (c) => {
    c.fillStyle = "#f2ead4"
    c.strokeStyle = "#948770"
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(1.5, 3)
    c.lineTo(10.5, 4.5)
    c.lineTo(5, 10.5)
    c.closePath()
    c.fill()
    c.stroke()
  })

  makeCanvasTex(scene, TEX_YOLK, 34, 22, 2, (c) => {
    // Pale albumen puddle
    c.fillStyle = "rgba(255,252,238,0.68)"
    c.beginPath()
    c.ellipse(17, 12, 15, 8, 0.1, 0, Math.PI * 2)
    c.fill()
    // Broken yolk splat
    const g = c.createRadialGradient(15, 10, 1, 16, 11, 8)
    g.addColorStop(0, "#ffe46b")
    g.addColorStop(0.7, "#f5a618")
    g.addColorStop(1, "#c97408")
    c.fillStyle = g
    c.beginPath()
    c.ellipse(16, 11, 7.5, 5, -0.1, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = "rgba(255,255,255,0.72)"
    c.beginPath()
    c.ellipse(14, 9.5, 2.2, 1.2, -0.2, 0, Math.PI * 2)
    c.fill()
  })

  makeCanvasTex(scene, TEX_SMOKE, 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 1, 16, 16, 15)
    g.addColorStop(0, "rgba(155,160,170,0.85)")
    g.addColorStop(0.55, "rgba(115,120,130,0.45)")
    g.addColorStop(1, "rgba(90,95,105,0)")
    c.fillStyle = g
    c.fillRect(0, 0, 32, 32)
  })

  makeCanvasTex(scene, TEX_SPARK, 16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.38, "rgba(255,255,255,0.85)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    c.fillStyle = g
    c.fillRect(0, 0, 16, 16)
  })

  makeCanvasTex(scene, TEX_COIN, 26, 26, 2, (c) => {
    // Outer darker gold rim
    c.fillStyle = "#9e6908"
    c.beginPath()
    c.arc(13, 13, 12, 0, Math.PI * 2)
    c.fill()
    // Main coin face
    const g = c.createLinearGradient(3, 3, 23, 23)
    g.addColorStop(0, "#fff29c")
    g.addColorStop(0.45, "#f7c232")
    g.addColorStop(1, "#c7850c")
    c.fillStyle = g
    c.beginPath()
    c.arc(13, 13, 10.2, 0, Math.PI * 2)
    c.fill()
    // Inner engraved ring
    c.strokeStyle = "#a36b08"
    c.lineWidth = 1.2
    c.beginPath()
    c.arc(13, 13, 7.6, 0, Math.PI * 2)
    c.stroke()
    // Embossed square hole (classic coin mark)
    c.fillStyle = "#8a5605"
    c.fillRect(10.3, 10.3, 5.4, 5.4)
    c.strokeStyle = "#ffe885"
    c.lineWidth = 0.8
    c.strokeRect(10.3, 10.3, 5.4, 5.4)
    // Top-left rim highlight
    c.strokeStyle = "rgba(255,255,230,0.7)"
    c.lineWidth = 1.2
    c.beginPath()
    c.arc(13, 13, 10.6, Math.PI * 1.05, Math.PI * 1.65)
    c.stroke()
  })

  makeCanvasTex(scene, TEX_COIN_SHADOW, 28, 12, 2, (c) => {
    const g = c.createRadialGradient(14, 6, 1, 14, 6, 13)
    g.addColorStop(0, "rgba(0,0,0,0.65)")
    g.addColorStop(0.65, "rgba(0,0,0,0.28)")
    g.addColorStop(1, "rgba(0,0,0,0)")
    c.save()
    c.scale(1, 12 / 28)
    c.fillStyle = g
    c.beginPath()
    c.arc(14, 14, 13, 0, Math.PI * 2)
    c.fill()
    c.restore()
  })

  makeCanvasTex(scene, TEX_GLINT, 16, 16, (c) => {
    c.fillStyle = "#fffbe0"
    c.beginPath()
    c.moveTo(8, 0.5)
    c.lineTo(9.8, 6.2)
    c.lineTo(15.5, 8)
    c.lineTo(9.8, 9.8)
    c.lineTo(8, 15.5)
    c.lineTo(6.2, 9.8)
    c.lineTo(0.5, 8)
    c.lineTo(6.2, 6.2)
    c.closePath()
    c.fill()
  })
}

/**
 * "Xa xui" (shake off bad luck): a white egg appears on the floor in front of the feet at (x, y),
 * the character stomps it (call `hop(dy)` with negative values to lift the figure: a short
 * anticipation hop up ~18 units then slam down to 0 at ~260 ms), the egg cracks: 8-12 shell shards
 * (white/cream irregular triangles) fly out and fall with gravity and fade, a small yellow yolk
 * splat + a puff of grey "bad luck" smoke wisps rises and dissolves, light camera shake ONLY when
 * `local` is true (scene.cameras.main.shake(120, 0.004)). Total ~1.6 s, then everything is destroyed.
 */
export function playXaXui(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: { local: boolean; hop?: (dy: number) => void }
): void {
  if (!scene.sys.isActive()) return
  ensureFxTextures(scene)

  const eggX = x + 2
  const eggY = y + 4
  const egg = scene.add
    .image(eggX, eggY, TEX_EGG)
    .setOrigin(0.5, 0.85)
    .setDepth(y + 4)
    .setScale(0.35)

  scene.tweens.add({
    targets: egg,
    scale: 1,
    duration: 90,
    ease: "Back.easeOut",
  })

  if (opts.hop) {
    const hopState = { dy: 0 }
    const hopFn = opts.hop
    scene.tweens.add({
      targets: hopState,
      dy: -18,
      duration: 120,
      ease: "Quad.easeOut",
      onUpdate: () => {
        if (scene.sys.isActive()) hopFn(hopState.dy)
      },
      onComplete: () => {
        if (!scene.sys.isActive()) return
        scene.tweens.add({
          targets: hopState,
          dy: 0,
          duration: 140,
          ease: "Quad.easeIn",
          onUpdate: () => {
            if (scene.sys.isActive()) hopFn(hopState.dy)
          },
          onComplete: () => {
            if (scene.sys.isActive()) hopFn(0)
          },
        })
      },
    })
  }

  scene.time.delayedCall(260, () => {
    if (!scene.sys.isActive()) {
      egg.destroy()
      return
    }
    egg.destroy()

    if (opts.local) {
      scene.cameras.main?.shake(120, 0.004)
    }

    // Yolk splat on the floor
    const yolk = scene.add
      .image(eggX, eggY, TEX_YOLK)
      .setDepth(y + 3)
      .setScale(0.3)
    scene.tweens.add({
      targets: yolk,
      scale: 1,
      duration: 120,
      ease: "Back.easeOut",
      onComplete: () => {
        if (!yolk.scene) return
        scene.tweens.add({
          targets: yolk,
          alpha: 0,
          delay: 850,
          duration: 360,
          onComplete: () => yolk.destroy(),
        })
      },
    })

    // 10 irregular shell shards (5 of each shape)
    const shardCfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      speedX: { min: -110, max: 110 },
      speedY: { min: -175, max: -60 },
      gravityY: 460,
      rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.7 },
      alpha: { start: 1, end: 0 },
      lifespan: 720,
      emitting: false,
    }
    const shardsA = scene.add
      .particles(eggX, eggY - 4, TEX_SHELL_0, shardCfg)
      .setDepth(y + 6)
    const shardsB = scene.add
      .particles(eggX, eggY - 4, TEX_SHELL_1, shardCfg)
      .setDepth(y + 6)
    shardsA.explode(5)
    shardsB.explode(5)
    scene.time.delayedCall(780, () => {
      if (shardsA.scene) shardsA.destroy()
      if (shardsB.scene) shardsB.destroy()
    })

    // Bad-luck smoke wisps rising and dissolving
    const smoke = scene.add
      .particles(eggX, eggY - 10, TEX_SMOKE, {
        x: { min: -10, max: 10 },
        speedX: { min: -28, max: 28 },
        speedY: { min: -80, max: -36 },
        scale: { start: 0.45, end: 1.5 },
        alpha: { start: 0.62, end: 0 },
        rotate: { min: -45, max: 45 },
        lifespan: { min: 750, max: 1150 },
        emitting: false,
      })
      .setDepth(DEPTH_LABEL + y + 2)
    smoke.explode(10)
    scene.time.delayedCall(1220, () => {
      if (smoke.scene) smoke.destroy()
    })
  })
}

/**
 * "Gay" (crow / brag): 3-5 fireworks bursts launched from around the figure (x, y): each a rocket
 * trail rising 220-360 units above the head, then a radial burst of 40-70 colored spark particles
 * (gold, red, pink, cyan, lime; ADD blend) with gravity, slight drag and fade over ~1.2 s, staggered
 * 0-700 ms. Plus a big banner text `text` above the head (y - 150): Be Vietnam Pro 800 20px,
 * gold fill #ffe08a with dark stroke, word-wrapped at 260, origin (0.5,1), pops in with scale
 * 0.6->1.08->1 and floats up 24 units, stays 4.5 s, fades out. `name` is shown as a small line
 * "<name> gay:" above the text (13px, #ffffff, 600). Destroy everything after.
 */
export function playGay(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
  text: string
): void {
  if (!scene.sys.isActive()) return
  ensureFxTextures(scene)

  const effectDepth = DEPTH_LABEL + y + 2
  const count = Phaser.Math.Between(3, 5)
  const headY = y - 108

  for (let i = 0; i < count; i += 1) {
    const delay = i === 0 ? 0 : Phaser.Math.Between(120, 700)
    scene.time.delayedCall(delay, () => {
      if (!scene.sys.isActive()) return
      const startX = x + Phaser.Math.Between(-56, 56)
      const startY = y - 30
      const apexX = startX + Phaser.Math.Between(-36, 36)
      const apexY = headY - Phaser.Math.Between(220, 360)
      const color = FIREWORK_COLORS[i % FIREWORK_COLORS.length]

      const rocket = scene.add
        .image(startX, startY, TEX_SPARK)
        .setTint(color)
        .setBlendMode("ADD")
        .setScale(0.75)
        .setDepth(effectDepth)

      const trail = scene.add
        .particles(0, 0, TEX_SPARK, {
          speed: { min: 4, max: 18 },
          scale: { start: 0.55, end: 0 },
          alpha: { start: 0.85, end: 0 },
          lifespan: 240,
          frequency: 26,
          tint: color,
          blendMode: "ADD",
          follow: rocket,
        })
        .setDepth(effectDepth)

      const riseMs = Phaser.Math.Between(320, 440)
      scene.tweens.add({
        targets: rocket,
        x: apexX,
        y: apexY,
        duration: riseMs,
        ease: "Quad.easeOut",
        onComplete: () => {
          if (trail.scene) {
            trail.stop()
            scene.time.delayedCall(260, () => {
              if (trail.scene) trail.destroy()
            })
          }
          if (!rocket.scene) return
          const bx = rocket.x
          const by = rocket.y
          rocket.destroy()
          if (!scene.sys.isActive()) return

          const burst = scene.add
            .particles(bx, by, TEX_SPARK, {
              speed: { min: 65, max: 215 },
              angle: { min: 0, max: 360 },
              gravityY: 165,
              // Subtle air drag via speed damping curve
              scale: { start: 0.95, end: 0 },
              alpha: { start: 1, end: 0 },
              lifespan: { min: 900, max: 1200 },
              tint: FIREWORK_COLORS,
              blendMode: "ADD",
              emitting: false,
            })
            .setDepth(effectDepth)
          // Apply gentle air drag across particle lifetimes
          burst.particleBringToTop = false
          burst.explode(Phaser.Math.Between(42, 56))
          scene.time.delayedCall(1260, () => {
            if (burst.scene) burst.destroy()
          })
        },
      })
    })
  }

  // Banner text and "<name> gáy:" header above the head
  const baseY = y - 150
  const banner = scene.add
    .text(x, baseY, text, {
      fontFamily: FONT_FAMILY,
      fontSize: "20px",
      fontStyle: "800",
      color: "#ffe08a",
      stroke: "#1d1204",
      strokeThickness: 5,
      align: "center",
      wordWrap: { width: 260 },
      resolution: 3,
    })
    .setOrigin(0.5, 1)
    .setScale(0.6)
    .setDepth(effectDepth)

  const nameLabel = scene.add
    .text(x, baseY - banner.height - 4, `${name} gáy:`, {
      fontFamily: FONT_FAMILY,
      fontSize: "13px",
      fontStyle: "600",
      color: "#ffffff",
      stroke: "#121622",
      strokeThickness: 3,
      align: "center",
      resolution: 3,
    })
    .setOrigin(0.5, 1)
    .setScale(0.6)
    .setDepth(effectDepth)

  const popIn = (target: Phaser.GameObjects.Text, liftY: number): void => {
    scene.tweens.add({
      targets: target,
      scale: 1.08,
      duration: 140,
      ease: "Quad.easeOut",
      onComplete: () => {
        if (!target.scene) return
        scene.tweens.add({
          targets: target,
          scale: 1,
          duration: 110,
          ease: "Sine.easeOut",
        })
      },
    })
    scene.tweens.add({
      targets: target,
      y: liftY,
      duration: 500,
      ease: "Quad.easeOut",
    })
  }

  popIn(banner, baseY - 24)
  popIn(nameLabel, baseY - banner.height - 4 - 24)

  scene.time.delayedCall(4500, () => {
    if (!scene.sys.isActive()) {
      banner.destroy()
      nameLabel.destroy()
      return
    }
    const targets = [banner, nameLabel].filter((t) => t.scene)
    if (!targets.length) return
    scene.tweens.add({
      targets,
      alpha: 0,
      duration: 350,
      onComplete: () => {
        banner.destroy()
        nameLabel.destroy()
      },
    })
  })
}

/** One coin lying on the floor (part of a "tan loc" coin rain). */
export interface FloorCoin {
  readonly x: number
  readonly y: number
  /** Removes the coin with a pickup effect: it jumps up, shrinks, shows "+<value> xu" floating text in gold (only when `label` is true), sparkles. */
  pick(label: boolean, value: number): void
  /** Removes the coin quietly (rain ended, unmounted): short fade. */
  remove(): void
}

/**
 * Drops a gold coin from the sky (start at y - 520, alpha 0->1) onto the floor point (x, y)
 * after `delayMs`: falls ~600-800 ms with Bounce/Quad ease, small bounce, then lies there with a
 * slow "spin" (scaleX oscillating 1 -> 0.25 -> 1 every ~1.4 s, random phase) and an occasional
 * glint sparkle, and a soft shadow ellipse under it. Coin texture: 26x26 gold circle with darker
 * rim, inner ring and a simple embossed mark (small square hole like an old coin, or a star).
 * Depth = y. Returns the handle. Coins with `mine: true` get alpha 0.75.
 */
export function dropCoin(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: { delayMs: number; mine: boolean }
): FloorCoin {
  ensureFxTextures(scene)

  const targetAlpha = opts.mine ? 0.75 : 1
  const shadowAlpha = opts.mine ? 0.28 : 0.42
  let closed = false
  let delayTimer: Phaser.Time.TimerEvent | null = null
  let glintTimer: Phaser.Time.TimerEvent | null = null
  let spinTween: Phaser.Tweens.Tween | null = null

  const shadow = scene.add
    .image(x, y + 2, TEX_COIN_SHADOW)
    .setDepth(y - 0.1)
    .setScale(0.35)
    .setAlpha(0)

  const coin = scene.add
    .image(x, y - 520, TEX_COIN)
    .setDepth(y)
    .setAlpha(0)

  const stopMotion = (): void => {
    delayTimer?.remove()
    delayTimer = null
    glintTimer?.remove()
    glintTimer = null
    spinTween?.stop()
    spinTween = null
    if (scene.sys.isActive()) {
      scene.tweens.killTweensOf(coin)
      scene.tweens.killTweensOf(shadow)
    }
  }

  const startIdle = (): void => {
    if (closed || !scene.sys.isActive() || !coin.scene) return
    spinTween = scene.tweens.add({
      targets: coin,
      scaleX: 0.25,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Phaser.Math.Between(0, 700),
    })
    glintTimer = scene.time.addEvent({
      delay: Phaser.Math.Between(1800, 3200),
      loop: true,
      callback: () => {
        if (closed || !scene.sys.isActive() || !coin.scene) return
        const glint = scene.add
          .image(
            x + Phaser.Math.Between(-7, 7),
            y + Phaser.Math.Between(-8, 4),
            TEX_GLINT
          )
          .setDepth(y + 0.5)
          .setScale(0)
        scene.tweens.add({
          targets: glint,
          scale: 0.75,
          angle: 45,
          duration: 180,
          yoyo: true,
          ease: "Sine.easeOut",
          onComplete: () => glint.destroy(),
        })
      },
    })
  }

  const startDrop = (): void => {
    delayTimer = null
    if (closed || !scene.sys.isActive() || !coin.scene) return

    const fallMs = Phaser.Math.Between(480, 620)
    scene.tweens.add({
      targets: coin,
      alpha: targetAlpha,
      duration: 160,
      ease: "Quad.easeOut",
    })
    scene.tweens.add({
      targets: shadow,
      alpha: shadowAlpha,
      scale: 1,
      duration: fallMs,
      ease: "Quad.easeIn",
    })
    scene.tweens.add({
      targets: coin,
      y,
      duration: fallMs,
      ease: "Quad.easeIn",
      onComplete: () => {
        if (closed || !scene.sys.isActive() || !coin.scene) return
        scene.tweens.add({
          targets: coin,
          y: y - 14,
          duration: 90,
          yoyo: true,
          ease: "Quad.easeOut",
          onComplete: startIdle,
        })
      },
    })
  }

  if (opts.delayMs > 0) {
    delayTimer = scene.time.delayedCall(opts.delayMs, startDrop)
  } else {
    startDrop()
  }

  return {
    x,
    y,
    pick(label: boolean, value: number): void {
      if (closed) return
      closed = true
      stopMotion()

      if (!scene.sys.isActive()) {
        coin.destroy()
        shadow.destroy()
        return
      }

      const cx = coin.scene ? coin.x : x
      const cy = coin.scene ? coin.y : y
      const effectDepth = DEPTH_LABEL + y + 2

      if (shadow.scene) {
        scene.tweens.add({
          targets: shadow,
          alpha: 0,
          scale: 0.3,
          duration: 160,
          onComplete: () => shadow.destroy(),
        })
      }

      if (coin.scene) {
        scene.tweens.add({
          targets: coin,
          y: cy - 36,
          scaleX: 0,
          scaleY: 0,
          alpha: 0,
          duration: 260,
          ease: "Quad.easeOut",
          onComplete: () => coin.destroy(),
        })
      }

      const sparks = scene.add
        .particles(cx, cy, TEX_GLINT, {
          speed: { min: 40, max: 115 },
          angle: { min: 0, max: 360 },
          scale: { start: 0.75, end: 0 },
          alpha: { start: 1, end: 0 },
          lifespan: 420,
          tint: [0xfff4a3, 0xffd24d],
          blendMode: "ADD",
          emitting: false,
        })
        .setDepth(effectDepth)
      sparks.explode(6)
      scene.time.delayedCall(460, () => {
        if (sparks.scene) sparks.destroy()
      })

      if (label) {
        const txt = scene.add
          .text(cx, cy - 12, `+${value} xu`, {
            fontFamily: FONT_FAMILY,
            fontSize: "15px",
            fontStyle: "800",
            color: "#ffe08a",
            stroke: "#261602",
            strokeThickness: 4,
            resolution: 3,
          })
          .setOrigin(0.5, 1)
          .setDepth(effectDepth)
        scene.tweens.add({
          targets: txt,
          y: cy - 46,
          alpha: 0,
          duration: 760,
          ease: "Quad.easeOut",
          onComplete: () => txt.destroy(),
        })
      }
    },
    remove(): void {
      if (closed) return
      closed = true
      stopMotion()

      if (!scene.sys.isActive()) {
        coin.destroy()
        shadow.destroy()
        return
      }

      const targets = [coin, shadow].filter((obj) => obj.scene)
      if (!targets.length) return
      scene.tweens.add({
        targets,
        alpha: 0,
        duration: 220,
        onComplete: () => {
          coin.destroy()
          shadow.destroy()
        },
      })
    },
  }
}

/**
 * Short celebratory shower when a rain starts: 24 small coin particles burst from (x, y - 120)
 * over the giver's head and fall around for ~1 s (purely decorative, does not create FloorCoins).
 */
export function playRainBurst(scene: Phaser.Scene, x: number, y: number): void {
  if (!scene.sys.isActive()) return
  ensureFxTextures(scene)

  const emitter = scene.add
    .particles(x, y - 120, TEX_COIN, {
      speedX: { min: -145, max: 145 },
      speedY: { min: -190, max: -65 },
      gravityY: 430,
      rotate: { min: 0, max: 360 },
      scale: { start: 0.72, end: 0.45 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 780, max: 1050 },
      emitting: false,
    })
    .setDepth(DEPTH_LABEL + y + 2)
  emitter.explode(24)
  scene.time.delayedCall(1120, () => {
    if (emitter.scene) emitter.destroy()
  })
}

function makeCanvasTex(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  resOrDraw: number | ((ctx: CanvasRenderingContext2D) => void),
  maybeDraw?: (ctx: CanvasRenderingContext2D) => void
): void {
  if (scene.textures.exists(key)) return
  // `res` > 1 draws the same art bigger (the egg and the coin read better at twice their sketch size).
  const res = typeof resOrDraw === "number" ? resOrDraw : 1
  const draw = typeof resOrDraw === "number" ? maybeDraw! : resOrDraw
  const tex = scene.textures.createCanvas(key, w * res, h * res)
  if (!tex) return
  const ctx = tex.getContext()
  ctx.scale(res, res)
  draw(ctx)
  tex.refresh()
}
