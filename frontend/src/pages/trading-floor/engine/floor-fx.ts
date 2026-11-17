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
const TEX_INCENSE = "fx-incense"
const TEX_BOWL = "fx-bowl"
const TEX_AURA = "fx-aura"

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

  makeCanvasTex(scene, TEX_INCENSE, 3, 34, 2, (c) => {
    // Bamboo foot at bottom
    c.fillStyle = "#c89b54"
    c.fillRect(0.9, 26, 1.2, 8)
    // Dark-red incense stick body
    const bodyGrad = c.createLinearGradient(0.5, 4, 2.5, 4)
    bodyGrad.addColorStop(0, "#4a0906")
    bodyGrad.addColorStop(0.5, "#8c1812")
    bodyGrad.addColorStop(1, "#4a0906")
    c.fillStyle = bodyGrad
    c.fillRect(0.6, 3.5, 1.8, 22.5)
    // Thin ash collar below tip
    c.fillStyle = "#524a46"
    c.fillRect(0.6, 2.5, 1.8, 1.2)
    // Glowing orange tip
    const tipGrad = c.createRadialGradient(1.5, 1.5, 0.2, 1.5, 1.5, 1.8)
    tipGrad.addColorStop(0, "#fff4b8")
    tipGrad.addColorStop(0.45, "#ff7b00")
    tipGrad.addColorStop(1, "rgba(255,90,0,0)")
    c.fillStyle = tipGrad
    c.beginPath()
    c.arc(1.5, 1.5, 1.6, 0, Math.PI * 2)
    c.fill()
  })

  makeCanvasTex(scene, TEX_BOWL, 22, 15, 2, (c) => {
    // Soft ground shadow
    c.fillStyle = "rgba(0,0,0,0.32)"
    c.beginPath()
    c.ellipse(11, 13, 8.5, 2, 0, 0, Math.PI * 2)
    c.fill()
    // Gold incense bowl body
    const bowlGrad = c.createLinearGradient(2, 4, 20, 12)
    bowlGrad.addColorStop(0, "#ffe47a")
    bowlGrad.addColorStop(0.45, "#d99518")
    bowlGrad.addColorStop(1, "#7d4a06")
    c.fillStyle = bowlGrad
    c.beginPath()
    c.moveTo(2.5, 4.5)
    c.quadraticCurveTo(3, 12.5, 11, 12.5)
    c.quadraticCurveTo(19, 12.5, 19.5, 4.5)
    c.closePath()
    c.fill()
    c.strokeStyle = "#6e3f04"
    c.lineWidth = 0.9
    c.stroke()
    // Rim and ash bed
    c.fillStyle = "#574f48"
    c.beginPath()
    c.ellipse(11, 4.5, 8.5, 2.7, 0, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = "#ffd666"
    c.lineWidth = 1.2
    c.stroke()
    c.fillStyle = "#7a7169"
    c.beginPath()
    c.ellipse(11, 4.4, 6.2, 1.7, 0, 0, Math.PI * 2)
    c.fill()
  })

  makeCanvasTex(scene, TEX_AURA, 128, 128, 2, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, "rgba(255,224,130,0.95)")
    g.addColorStop(0.35, "rgba(255,190,80,0.45)")
    g.addColorStop(1, "rgba(255,160,40,0)")
    c.fillStyle = g
    c.fillRect(0, 0, 128, 128)
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

interface BannerCardStyle {
  plateFill: number
  headerText: string
  bodyText: string
  bodyFontSize: string
  bodyFontWeight: string
  bodyFill: string
  bodyStroke: string
  bodyStrokeThickness: number
  wordWrapWidth: number
  shadow?: boolean
}

function createBannerCard(
  scene: Phaser.Scene,
  x: number,
  baseY: number,
  depth: number,
  opts: BannerCardStyle
): Phaser.GameObjects.Container {
  const platePad = 14
  const headerGap = 2

  const banner = scene.add
    .text(0, -platePad, opts.bodyText, {
      fontFamily: FONT_FAMILY,
      fontSize: opts.bodyFontSize,
      fontStyle: opts.bodyFontWeight,
      color: opts.bodyFill,
      stroke: opts.bodyStroke,
      strokeThickness: opts.bodyStrokeThickness,
      align: "center",
      wordWrap: { width: opts.wordWrapWidth, useAdvancedWrap: true },
      padding: { x: 8, y: 8 },
      resolution: 3,
    })
    .setOrigin(0.5, 1)
  if (opts.shadow) {
    banner.setShadow(0, 3, "rgba(0,0,0,0.6)", 6, true, true)
  }

  const header = scene.add
    .text(0, -platePad - banner.height - headerGap, opts.headerText, {
      fontFamily: FONT_FAMILY,
      fontSize: "14px",
      fontStyle: "700",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
      align: "center",
      padding: { x: 6, y: 4 },
      resolution: 3,
    })
    .setOrigin(0.5, 1)

  const contentW = Math.max(banner.width, header.width)
  const contentH = banner.height + headerGap + header.height
  const plateW = contentW + platePad * 2
  const plateH = contentH + platePad * 2

  const plate = scene.add.graphics()
  plate.fillStyle(opts.plateFill, 0.85)
  plate.fillRoundedRect(-plateW / 2, -plateH, plateW, plateH, 12)
  plate.lineStyle(2, 0xffd56a, 1)
  plate.strokeRoundedRect(-plateW / 2, -plateH, plateW, plateH, 12)

  return scene.add.container(x, baseY, [plate, banner, header]).setDepth(depth)
}

function scheduleBannerDestroy(
  scene: Phaser.Scene,
  card: Phaser.GameObjects.Container,
  stayMs: number
): void {
  scene.time.delayedCall(stayMs, () => {
    if (!scene.sys.isActive()) {
      card.destroy()
      return
    }
    if (!card.scene) return
    scene.tweens.add({
      targets: card,
      alpha: 0,
      duration: 350,
      onComplete: () => card.destroy(),
    })
  })
}

function spawnFireworkBurst(
  scene: Phaser.Scene,
  bx: number,
  by: number,
  outerColor: number,
  innerColor: number,
  depth: number
): void {
  const flash = scene.add
    .circle(bx, by, 16, 0xffffff, 1)
    .setBlendMode("ADD")
    .setScale(0)
    .setAlpha(0.9)
    .setDepth(depth)
  scene.tweens.add({
    targets: flash,
    scale: 2.2,
    alpha: 0,
    duration: 220,
    ease: "Quad.easeOut",
    onComplete: () => flash.destroy(),
  })

  const total = Phaser.Math.Between(70, 110)
  const outerCount = Math.round(total * 0.6)
  const innerCount = total - outerCount

  const outerBurst = scene.add
    .particles(bx, by, TEX_SPARK, {
      speed: { min: 155, max: 245 },
      angle: { min: 0, max: 360 },
      gravityY: 165,
      scale: { start: 0.95, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 600, max: 820 },
      tint: outerColor,
      blendMode: "ADD",
      emitting: false,
    })
    .setDepth(depth)
  outerBurst.explode(outerCount)

  const innerBurst = scene.add
    .particles(bx, by, TEX_SPARK, {
      speed: { min: 45, max: 115 },
      angle: { min: 0, max: 360 },
      gravityY: 140,
      scale: { start: 0.85, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 560, max: 780 },
      tint: innerColor,
      blendMode: "ADD",
      emitting: false,
    })
    .setDepth(depth)
  innerBurst.explode(innerCount)

  const glitter = scene.add
    .particles(bx, by, TEX_SPARK, {
      x: { min: -16, max: 16 },
      y: { min: -10, max: 10 },
      speedX: { min: -35, max: 35 },
      speedY: { min: -20, max: 20 },
      gravityY: 130,
      scale: { start: 0.65, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 620, max: 820 },
      tint: [0xfff0a0, 0xffd24d],
      blendMode: "ADD",
      emitting: false,
    })
    .setDepth(depth)
  glitter.explode(12)

  scene.time.delayedCall(880, () => {
    if (outerBurst.scene) outerBurst.destroy()
    if (innerBurst.scene) innerBurst.destroy()
    if (glitter.scene) glitter.destroy()
  })
}

/**
 * "Gay" (crow / brag): 6-8 fireworks bursts launched from around the figure (x, y) rising 260-420
 * units above the head, staggered 0-1100 ms, each bursting into 2 coloured rings + white flash +
 * falling gold glitter, followed by a final golden willow burst at ~1300 ms with camera flash.
 * Plus a rounded dark-red banner plate above the head (y - 150) staying 5 s before fading out.
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
  const count = Phaser.Math.Between(6, 8)
  const headY = y - 108

  for (let i = 0; i < count; i += 1) {
    const delay =
      i === 0
        ? 0
        : Math.min(
            1100,
            Math.round((i / (count - 1)) * 1020) + Phaser.Math.Between(0, 80)
          )
    scene.time.delayedCall(delay, () => {
      if (!scene.sys.isActive()) return
      const startX = x + Phaser.Math.Between(-56, 56)
      const startY = y - 30
      const apexX = startX + Phaser.Math.Between(-36, 36)
      const apexY = headY - Phaser.Math.Between(260, 420)
      const outerColor = FIREWORK_COLORS[i % FIREWORK_COLORS.length]
      const innerColor = FIREWORK_COLORS[(i + 2) % FIREWORK_COLORS.length]

      const rocket = scene.add
        .image(startX, startY, TEX_SPARK)
        .setTint(outerColor)
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
          tint: outerColor,
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
          spawnFireworkBurst(scene, bx, by, outerColor, innerColor, effectDepth)
        },
      })
    })
  }

  // Final golden willow burst above the head
  scene.time.delayedCall(1300, () => {
    if (!scene.sys.isActive()) return
    const wx = x + Phaser.Math.Between(-16, 16)
    const wy = headY - Phaser.Math.Between(290, 350)

    const flash = scene.add
      .circle(wx, wy, 20, 0xffffff, 1)
      .setBlendMode("ADD")
      .setScale(0)
      .setAlpha(0.9)
      .setDepth(effectDepth)
    scene.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 220,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    })

    const willow = scene.add
      .particles(wx, wy, TEX_SPARK, {
        speed: { min: 45, max: 245 },
        angle: { min: 0, max: 360 },
        gravityY: 160,
        scale: { start: 1.05, end: 0.08 },
        alpha: { start: 1, end: 0 },
        lifespan: 1800,
        tint: [0xfff4b8, 0xffd84d, 0xffb732],
        blendMode: "ADD",
        emitting: false,
      })
      .setDepth(effectDepth)
    willow.explode(140)
    scene.time.delayedCall(1860, () => {
      if (willow.scene) willow.destroy()
    })

    scene.cameras.main?.flash(120, 255, 220, 140, false)
  })

  const baseY = y - 150
  const card = createBannerCard(scene, x, baseY, effectDepth, {
    plateFill: 0x5a0e0e,
    headerText: `${name} gáy:`,
    bodyText: text,
    bodyFontSize: "26px",
    bodyFontWeight: "800",
    bodyFill: "#ffe08a",
    bodyStroke: "#3a1a00",
    bodyStrokeThickness: 6,
    wordWrapWidth: 300,
    shadow: true,
  }).setScale(0.6)

  scene.tweens.add({
    targets: card,
    scale: 1.08,
    duration: 140,
    ease: "Quad.easeOut",
    onComplete: () => {
      if (!card.scene) return
      scene.tweens.add({
        targets: card,
        scale: 1,
        duration: 110,
        ease: "Sine.easeOut",
      })
    },
  })
  scene.tweens.add({
    targets: card,
    y: baseY - 24,
    duration: 500,
    ease: "Quad.easeOut",
  })

  scheduleBannerDestroy(scene, card, 5000)
}

/**
 * "Khan Than Tai" (prayer to the god of wealth): three lit incense sticks in a gold bowl on the
 * floor at (x + 26, y - 6) with curling smoke wisps for 3.5 s, figure bows 3 times via `opts.hop`,
 * warm gold aura + 20 rising gold sparks, and a calm dark-red prayer banner staying 4.5 s.
 */
export function playKhan(
  scene: Phaser.Scene,
  x: number,
  y: number,
  name: string,
  text: string,
  opts: { hop?: (dy: number) => void } = {}
): void {
  if (!scene.sys.isActive()) return
  ensureFxTextures(scene)

  const effectDepth = DEPTH_LABEL + y + 2
  const bowlX = x + 26
  const bowlY = y - 6

  const bowl = scene.add
    .image(bowlX, bowlY, TEX_BOWL)
    .setOrigin(0.5, 0.72)
    .setScale(0.7)
    .setDepth(bowlY)

  const stickScale = 0.65
  const stickTipDist = 34 * 2 * stickScale - 2
  const stickSpecs = [
    { dx: -3, angle: -11 },
    { dx: 0, angle: 0 },
    { dx: 3, angle: 11 },
  ]

  const sticks: Phaser.GameObjects.Image[] = []
  const smokes: Phaser.GameObjects.Particles.ParticleEmitter[] = []

  for (const spec of stickSpecs) {
    const sx = bowlX + spec.dx
    const sy = bowlY - 6
    const stick = scene.add
      .image(sx, sy, TEX_INCENSE)
      .setOrigin(0.5, 1)
      .setScale(stickScale)
      .setAngle(spec.angle)
      .setDepth(bowlY - 0.1)
    sticks.push(stick)

    const rad = Phaser.Math.DegToRad(spec.angle)
    const tipX = sx + Math.sin(rad) * stickTipDist
    const tipY = sy - Math.cos(rad) * stickTipDist
    const smoke = scene.add
      .particles(tipX, tipY, TEX_SMOKE, {
        speedY: { min: -30, max: -18 },
        speedX: { min: -6, max: 6 },
        alpha: { start: 0.5, end: 0 },
        scale: { start: 0.3, end: 1.1 },
        rotate: { min: -30, max: 30 },
        lifespan: 2200,
        frequency: 140,
        tint: 0xf0f0f0,
      })
      .setDepth(effectDepth)
    smokes.push(smoke)
  }

  scene.time.delayedCall(3500, () => {
    for (const s of smokes) {
      if (s.scene) s.stop()
    }
    if (!scene.sys.isActive()) {
      bowl.destroy()
      for (const st of sticks) st.destroy()
      for (const s of smokes) s.destroy()
      return
    }
    const fadeTargets = [bowl, ...sticks, ...smokes].filter((o) => o.scene)
    if (fadeTargets.length) {
      scene.tweens.add({
        targets: fadeTargets,
        alpha: 0,
        duration: 600,
        onComplete: () => {
          bowl.destroy()
          for (const st of sticks) st.destroy()
          for (const s of smokes) s.destroy()
        },
      })
    }
  })

  if (opts.hop) {
    const hopFn = opts.hop
    const bowState = { dy: 0 }
    const runBowCycle = (remaining: number): void => {
      if (!scene.sys.isActive()) return
      scene.tweens.add({
        targets: bowState,
        dy: 7,
        duration: 260,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          if (scene.sys.isActive()) hopFn(bowState.dy)
        },
        onComplete: () => {
          if (!scene.sys.isActive()) return
          scene.tweens.add({
            targets: bowState,
            dy: 0,
            duration: 260,
            ease: "Sine.easeInOut",
            onUpdate: () => {
              if (scene.sys.isActive()) hopFn(bowState.dy)
            },
            onComplete: () => {
              if (!scene.sys.isActive()) return
              if (remaining > 1) {
                scene.time.delayedCall(120, () => runBowCycle(remaining - 1))
              } else {
                hopFn(0)
              }
            },
          })
        },
      })
    }
    runBowCycle(3)
  }

  const auraKey = scene.textures.exists("glow") ? "glow" : TEX_AURA
  const aura = scene.add
    .image(x, y - 50, auraKey)
    .setBlendMode("ADD")
    .setAlpha(0)
    .setScale(1.2)
    .setDepth(y - 1)
  scene.tweens.add({
    targets: aura,
    scale: 1.6,
    duration: 2400,
    ease: "Sine.easeOut",
  })
  scene.tweens.add({
    targets: aura,
    alpha: 0.55,
    duration: 700,
    ease: "Sine.easeOut",
    onComplete: () => {
      if (!aura.scene || !scene.sys.isActive()) {
        aura.destroy()
        return
      }
      scene.tweens.add({
        targets: aura,
        alpha: 0,
        duration: 1700,
        ease: "Sine.easeInOut",
        onComplete: () => aura.destroy(),
      })
    },
  })

  const auraSparks = scene.add
    .particles(x, y - 45, TEX_SPARK, {
      x: { min: -28, max: 28 },
      y: { min: -35, max: 25 },
      speedX: { min: -10, max: 10 },
      speedY: { min: -42, max: -18 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: { min: 1400, max: 2100 },
      tint: [0xfff0a0, 0xffd24d, 0xffb830],
      blendMode: "ADD",
      emitting: false,
    })
    .setDepth(y + 4)
  auraSparks.explode(20)
  scene.time.delayedCall(2160, () => {
    if (auraSparks.scene) auraSparks.destroy()
  })

  const baseY = y - 150
  const card = createBannerCard(scene, x, baseY, effectDepth, {
    plateFill: 0x3a0d06,
    headerText: `${name} khấn:`,
    bodyText: text,
    bodyFontSize: "20px",
    bodyFontWeight: "700",
    bodyFill: "#ffd56a",
    bodyStroke: "#2a0a00",
    bodyStrokeThickness: 4,
    wordWrapWidth: 280,
  }).setAlpha(0)
  scene.tweens.add({
    targets: card,
    alpha: 1,
    duration: 300,
    ease: "Quad.easeOut",
  })
  scene.tweens.add({
    targets: card,
    y: baseY - 16,
    duration: 500,
    ease: "Sine.easeOut",
  })
  scheduleBannerDestroy(scene, card, 4500)
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
