/**
 * Pure Three.js procedural 3D FX & Coin Rain manager for Khu Giao Dịch:
 * - Xả xui: 3D egg pop -> hop -> bouncing shell shards + yolk splat + swirling grey smoke wisps + golden cleanse sparks + local shake + xaxui.mp3
 * - Gáy: firework rockets -> air-drag starburst blooms + golden willow climax + fluttering confetti + flash + DOM banner + rooster/firework.mp3
 * - Khấn: 3D gold incense bowl + 3 glowing sticks + swirling incense smoke + bow 3x + concentric gold lotus aura + spiraling sparks + bell.mp3
 * - Tán lộc (RainCoinManager): bouncing fountain burst coins + spinning/glinting 3D gold coins + landing/grab rings + "+10 xu" + coins/coin.mp3
 *
 * Respects `lite` mode (lower segments & particle caps for mobile Safari) and `prefers-reduced-motion`
 * (fewer/shorter particles, no camera shake, no strobe flashes).
 */
import * as THREE from "three"

import { prefersReducedMotion } from "@/lib/chibi-3d/character-builder.ts"
import {
  getSceneHostBridge,
  logicalToWorld,
  type ChibiAnimMode,
  type ChibiSceneHostBridge,
  type ProjectedPoint,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import type { Rain } from "../net/types.ts"
import { playFx, type FxSoundKey } from "./fx-sound.ts"
import type { OverlayLayer } from "./overlay-layer.ts"

const FIREWORK_COLORS = [0xffd84d, 0xff4d5a, 0xff6ec7, 0x4df3ff, 0x7cff50]
const CONFETTI_COLORS = [0xffd84d, 0xfff1a8, 0xff5e6c, 0x34d399, 0x60a5fa]

export interface FloorFx3DOptions {
  lite?: boolean
}

interface ScheduledTask {
  atS: number
  run: () => void
}

interface Particle3D {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  vx: number
  vy: number
  vz: number
  gravity: number
  drag: number
  bounce: number
  swirlAmp: number
  swirlFreq: number
  swirlPhase: number
  spinX: number
  spinY: number
  spinZ: number
  age: number
  life: number
  startScale: number
  endScale: number
  startAlpha: number
}

interface FireworkRocket {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  start: THREE.Vector3
  apex: THREE.Vector3
  age: number
  riseS: number
  trailAccum: number
  outerColor: number
  innerColor: number
}

interface FloorRingFx {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  age: number
  life: number
  startScale: number
  endScale: number
  startAlpha: number
}

interface EggFx {
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  age: number
  crackAt: number
  cracked: boolean
  wx: number
  wz: number
  isSelf: boolean
}

interface YolkFx {
  group: THREE.Group
  mats: THREE.MeshStandardMaterial[]
  age: number
  popS: number
  stayS: number
  fadeS: number
}

interface IncenseFx {
  group: THREE.Group
  mats: THREE.Material[]
  tipWorldPos: THREE.Vector3[]
  age: number
  burnS: number
  fadeS: number
  smokeAccum: number
}

interface FlashLightFx {
  light: THREE.PointLight
  age: number
  life: number
  peakIntensity: number
}

export interface FloorCoinInfo {
  readonly rainId: string
  readonly index: number
  readonly x: number
  readonly y: number
  readonly mine: boolean
}

interface ActiveCoin {
  rainId: string
  index: number
  lx: number
  ly: number
  wx: number
  wz: number
  mine: boolean
  root: THREE.Group
  coinMesh: THREE.Group
  shadowMesh: THREE.Mesh
  coinMats: THREE.MeshStandardMaterial[]
  shadowMat: THREE.MeshBasicMaterial
  state: "waiting" | "falling" | "bouncing" | "idle" | "picking" | "fading"
  timer: number
  delayS: number
  fallS: number
  spinPhase: number
  glintCooldown: number
}

function randRange(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

export class RainCoinManager {
  private readonly parent: THREE.Group
  private readonly world: WorldTransformConfig
  private readonly overlay: OverlayLayer
  private readonly lite: boolean
  private readonly spawnSparks: (
    wx: number,
    wy: number,
    wz: number,
    count: number,
    color: number
  ) => void
  private readonly spawnBurstCoins: (wx: number, wy: number, wz: number) => void
  private readonly spawnFloorRing: (
    wx: number,
    wz: number,
    color: number,
    startScale: number,
    endScale: number,
    life: number,
    alpha: number
  ) => void

  private readonly rains = new Map<
    string,
    { mine: boolean; coins: Map<number, ActiveCoin> }
  >()
  private readonly dyingCoins: ActiveCoin[] = []
  private readonly coinRimGeo: THREE.CylinderGeometry
  private readonly coinFaceGeo: THREE.CylinderGeometry
  private readonly coinHoleGeo: THREE.BoxGeometry
  private readonly shadowGeo: THREE.CircleGeometry
  private disposed = false

  constructor(
    parent: THREE.Group,
    world: WorldTransformConfig,
    overlay: OverlayLayer,
    hooks: {
      lite?: boolean
      spawnSparks: (
        wx: number,
        wy: number,
        wz: number,
        count: number,
        color: number
      ) => void
      spawnBurstCoins: (wx: number, wy: number, wz: number) => void
      spawnFloorRing?: (
        wx: number,
        wz: number,
        color: number,
        startScale: number,
        endScale: number,
        life: number,
        alpha: number
      ) => void
    }
  ) {
    this.parent = parent
    this.world = world
    this.overlay = overlay
    this.lite = hooks.lite ?? false
    this.spawnSparks = hooks.spawnSparks
    this.spawnBurstCoins = hooks.spawnBurstCoins
    this.spawnFloorRing = hooks.spawnFloorRing ?? (() => undefined)

    const segs = this.lite ? 12 : 20
    this.coinRimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.055, segs)
    this.coinRimGeo.rotateX(Math.PI / 2)
    this.coinFaceGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.062, segs)
    this.coinFaceGeo.rotateX(Math.PI / 2)
    this.coinHoleGeo = new THREE.BoxGeometry(0.085, 0.085, 0.068)
    this.shadowGeo = new THREE.CircleGeometry(0.24, this.lite ? 10 : 16)
    this.shadowGeo.rotateX(-Math.PI / 2)
  }

  playRainBurst(lx: number, ly: number): void {
    if (this.disposed) return
    const pt = logicalToWorld(lx, ly, this.world)
    this.spawnBurstCoins(pt.x, 1.9, pt.z)
  }

  addRain(rain: Rain, isMine: boolean): void {
    if (this.disposed) return
    this.removeRain(rain.id)
    const coinMap = new Map<number, ActiveCoin>()
    rain.coins.forEach((c, idx) => {
      const coin = this.createCoin(rain.id, c.i, c.x, c.y, idx * 0.035, isMine)
      coinMap.set(c.i, coin)
    })
    this.rains.set(rain.id, { mine: isMine, coins: coinMap })
  }

  private createCoin(
    rainId: string,
    index: number,
    lx: number,
    ly: number,
    delayS: number,
    mine: boolean
  ): ActiveCoin {
    const pt = logicalToWorld(lx, ly, this.world)
    const root = new THREE.Group()
    root.position.set(pt.x, 0, pt.z)

    const targetOpacity = mine ? 0.72 : 1
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd99616,
      metalness: 0.85,
      roughness: 0.24,
      emissive: 0x6b4404,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0,
    })
    const faceMat = new THREE.MeshStandardMaterial({
      color: 0xffe066,
      metalness: 0.88,
      roughness: 0.18,
      emissive: 0x8a5a08,
      emissiveIntensity: 0.24,
      transparent: true,
      opacity: 0,
    })
    const holeMat = new THREE.MeshStandardMaterial({
      color: 0x6c4205,
      metalness: 0.5,
      roughness: 0.55,
      transparent: true,
      opacity: 0,
    })
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0b0f18,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })

    const coinMesh = new THREE.Group()
    const rim = new THREE.Mesh(this.coinRimGeo, rimMat)
    const face = new THREE.Mesh(this.coinFaceGeo, faceMat)
    const hole = new THREE.Mesh(this.coinHoleGeo, holeMat)
    coinMesh.add(rim, face, hole)
    coinMesh.position.y = 8.2
    coinMesh.visible = false

    const shadowMesh = new THREE.Mesh(this.shadowGeo, shadowMat)
    shadowMesh.position.y = 0.018
    shadowMesh.scale.setScalar(0.35)
    shadowMesh.visible = false

    root.add(shadowMesh, coinMesh)
    this.parent.add(root)

    rimMat.userData.targetOpacity = targetOpacity
    faceMat.userData.targetOpacity = targetOpacity
    holeMat.userData.targetOpacity = targetOpacity
    shadowMat.userData.targetOpacity = mine ? 0.22 : 0.36

    return {
      rainId,
      index,
      lx,
      ly,
      wx: pt.x,
      wz: pt.z,
      mine,
      root,
      coinMesh,
      shadowMesh,
      coinMats: [rimMat, faceMat, holeMat],
      shadowMat,
      state: delayS > 0 ? "waiting" : "falling",
      timer: 0,
      delayS,
      fallS: randRange(0.48, 0.62),
      spinPhase: randRange(0, Math.PI * 2),
      glintCooldown: randRange(1.6, 3.2),
    }
  }

  takeCoin(
    rainId: string,
    coinIndex: number,
    isSelfGrab: boolean,
    value: number
  ): void {
    const rain = this.rains.get(rainId)
    const coin = rain?.coins.get(coinIndex)
    if (!coin) return
    rain!.coins.delete(coinIndex)
    coin.state = "picking"
    coin.timer = 0
    this.dyingCoins.push(coin)

    const reduced = prefersReducedMotion()
    const sparkCount = reduced ? 3 : this.lite ? 4 : 8
    this.spawnSparks(
      coin.wx,
      Math.max(0.32, coin.coinMesh.position.y),
      coin.wz,
      sparkCount,
      0xffe066
    )
    if (!reduced) {
      this.spawnFloorRing(coin.wx, coin.wz, 0xffe066, 0.35, 1.15, 0.34, 0.78)
    }
    if (isSelfGrab) {
      playFx("coin")
      this.overlay.showPlusXu(coin.lx, coin.ly, 0.72, value)
    }
  }

  removeRain(rainId: string): void {
    const rain = this.rains.get(rainId)
    if (!rain) return
    for (const coin of rain.coins.values()) {
      coin.state = "fading"
      coin.timer = 0
      this.dyingCoins.push(coin)
    }
    this.rains.delete(rainId)
  }

  reset(): void {
    for (const rain of this.rains.values()) {
      for (const coin of rain.coins.values()) {
        this.destroyCoin(coin)
      }
    }
    this.rains.clear()
    for (const coin of this.dyingCoins.splice(0)) {
      this.destroyCoin(coin)
    }
  }

  /** Iterates all live non-owned floor coins (for proximity auto-grab). */
  forEachGrabbableCoin(cb: (coin: FloorCoinInfo) => void): void {
    for (const rain of this.rains.values()) {
      if (rain.mine) continue
      for (const c of rain.coins.values()) {
        cb({
          rainId: c.rainId,
          index: c.index,
          x: c.lx,
          y: c.ly,
          mine: c.mine,
        })
      }
    }
  }

  /** Finds the nearest unowned coin within `maxLogicalDist` of `(lx, ly)`. */
  findCoinNear(
    lx: number,
    ly: number,
    maxLogicalDist: number
  ): FloorCoinInfo | null {
    let best: FloorCoinInfo | null = null
    let bestD = maxLogicalDist
    for (const rain of this.rains.values()) {
      if (rain.mine) continue
      for (const c of rain.coins.values()) {
        const d = Math.hypot(lx - c.lx, ly - c.ly)
        if (d < bestD) {
          bestD = d
          best = {
            rainId: c.rainId,
            index: c.index,
            x: c.lx,
            y: c.ly,
            mine: c.mine,
          }
        }
      }
    }
    return best
  }

  /** Finds the nearest unowned coin within `maxCssPx` of a screen point. */
  findCoinAtScreen(
    localX: number,
    localY: number,
    projectLogical: (
      lx: number,
      ly: number,
      heightWorld: number
    ) => ProjectedPoint,
    maxCssPx = 28
  ): FloorCoinInfo | null {
    let best: FloorCoinInfo | null = null
    let bestD = maxCssPx
    for (const rain of this.rains.values()) {
      if (rain.mine) continue
      for (const c of rain.coins.values()) {
        if (!c.coinMesh.visible) continue
        const pt = projectLogical(
          c.lx,
          c.ly,
          Math.max(0.24, c.coinMesh.position.y)
        )
        if (!pt.visible) continue
        const d = Math.hypot(localX - pt.x, localY - pt.y)
        if (d < bestD) {
          bestD = d
          best = {
            rainId: c.rainId,
            index: c.index,
            x: c.lx,
            y: c.ly,
            mine: c.mine,
          }
        }
      }
    }
    return best
  }

  update(dt: number): void {
    if (this.disposed) return
    const reduced = prefersReducedMotion()
    for (const rain of this.rains.values()) {
      for (const coin of rain.coins.values()) {
        this.stepLiveCoin(coin, dt, reduced)
      }
    }
    for (let i = this.dyingCoins.length - 1; i >= 0; i -= 1) {
      const coin = this.dyingCoins[i]!
      if (this.stepDyingCoin(coin, dt)) {
        this.destroyCoin(coin)
        this.dyingCoins.splice(i, 1)
      }
    }
  }

  private setCoinOpacity(coin: ActiveCoin, factor: number): void {
    for (const m of coin.coinMats) {
      const base = (m.userData.targetOpacity as number | undefined) ?? 1
      m.opacity = base * factor
    }
  }

  private stepLiveCoin(coin: ActiveCoin, dt: number, reduced: boolean): void {
    coin.timer += dt
    const shadowBase =
      (coin.shadowMat.userData.targetOpacity as number | undefined) ?? 0.36

    if (coin.state === "waiting") {
      if (coin.timer >= coin.delayS) {
        coin.state = "falling"
        coin.timer = 0
        coin.coinMesh.visible = true
        coin.shadowMesh.visible = true
      }
      return
    }

    coin.coinMesh.visible = true
    coin.shadowMesh.visible = true

    if (coin.state === "falling") {
      const fallDur = reduced ? coin.fallS * 0.55 : coin.fallS
      const t = Math.min(1, coin.timer / fallDur)
      const easeIn = t * t
      const startY = reduced ? 2.4 : 8.2
      coin.coinMesh.position.y = startY * (1 - easeIn) + 0.24 * easeIn
      coin.coinMesh.rotation.y += dt * (reduced ? 2.2 : 7)
      this.setCoinOpacity(coin, Math.min(1, coin.timer / 0.16))
      coin.shadowMat.opacity = shadowBase * t
      coin.shadowMesh.scale.setScalar(0.35 + 0.65 * t)
      if (t >= 1) {
        coin.state = reduced ? "idle" : "bouncing"
        coin.timer = 0
        if (!this.lite && !reduced) {
          this.spawnFloorRing(coin.wx, coin.wz, 0xffdf70, 0.24, 0.72, 0.28, 0.48)
        }
      }
      return
    }

    if (coin.state === "bouncing") {
      const bounceS = 0.2
      const t = Math.min(1, coin.timer / bounceS)
      const arc = Math.sin(t * Math.PI)
      coin.coinMesh.position.y = 0.24 + arc * 0.36
      coin.coinMesh.rotation.y += dt * 5
      this.setCoinOpacity(coin, 1)
      coin.shadowMat.opacity = shadowBase
      coin.shadowMesh.scale.setScalar(1 - arc * 0.22)
      if (t >= 1) {
        coin.state = "idle"
        coin.timer = 0
      }
      return
    }

    // Idle spin + subtle bob + periodic sparkle glint
    coin.spinPhase += dt * (reduced ? 0.65 : 2.5)
    coin.coinMesh.rotation.y = coin.spinPhase
    coin.coinMesh.position.y = reduced
      ? 0.25
      : 0.25 + Math.sin(coin.spinPhase * 1.4) * 0.04
    this.setCoinOpacity(coin, 1)
    coin.shadowMat.opacity = shadowBase
    coin.shadowMesh.scale.setScalar(1)

    if (!reduced) {
      coin.glintCooldown -= dt
      if (coin.glintCooldown <= 0) {
        coin.glintCooldown = this.lite ? randRange(3.2, 5.4) : randRange(1.8, 3.2)
        this.spawnSparks(
          coin.wx + randRange(-0.12, 0.12),
          0.34,
          coin.wz + randRange(-0.12, 0.12),
          1,
          0xfffbe0
        )
      }
    }
  }

  private stepDyingCoin(coin: ActiveCoin, dt: number): boolean {
    coin.timer += dt
    const shadowBase =
      (coin.shadowMat.userData.targetOpacity as number | undefined) ?? 0.36

    if (coin.state === "picking") {
      const t = Math.min(1, coin.timer / 0.26)
      const easeOut = 1 - (1 - t) * (1 - t)
      coin.coinMesh.position.y += dt * 2.4
      coin.coinMesh.rotation.y += dt * 16
      const s = Math.max(0.01, 1 - easeOut)
      coin.coinMesh.scale.setScalar(s)
      this.setCoinOpacity(coin, 1 - easeOut)
      coin.shadowMat.opacity = shadowBase * Math.max(0, 1 - t * 1.6)
      coin.shadowMesh.scale.setScalar(Math.max(0.2, 1 - t * 0.7))
      return t >= 1
    }

    const t = Math.min(1, coin.timer / 0.22)
    this.setCoinOpacity(coin, 1 - t)
    coin.shadowMat.opacity = shadowBase * (1 - t)
    return t >= 1
  }

  private destroyCoin(coin: ActiveCoin): void {
    this.parent.remove(coin.root)
    for (const m of coin.coinMats) m.dispose()
    coin.shadowMat.dispose()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.reset()
    this.coinRimGeo.dispose()
    this.coinFaceGeo.dispose()
    this.coinHoleGeo.dispose()
    this.shadowGeo.dispose()
  }
}

export class FloorFx3D {
  readonly group: THREE.Group
  readonly coins: RainCoinManager

  private readonly world: WorldTransformConfig
  private readonly overlay: OverlayLayer
  private readonly lite: boolean
  private readonly maxParticles: number
  private readonly tasks: ScheduledTask[] = []
  private readonly particles: Particle3D[] = []
  private readonly rockets: FireworkRocket[] = []
  private readonly rings: FloorRingFx[] = []
  private readonly eggs: EggFx[] = []
  private readonly yolks: YolkFx[] = []
  private readonly incenses: IncenseFx[] = []
  private readonly flashLights: FlashLightFx[] = []

  // Shared lightweight procedural geometries (disposed cleanly in dispose())
  private readonly sparkGeo: THREE.OctahedronGeometry
  private readonly smokeGeo: THREE.SphereGeometry
  private readonly shardGeo: THREE.TetrahedronGeometry
  private readonly confettiGeo: THREE.PlaneGeometry
  private readonly rocketGeo: THREE.SphereGeometry
  private readonly burstCoinGeo: THREE.CylinderGeometry
  private readonly ringGeo: THREE.RingGeometry
  private readonly eggGeo: THREE.SphereGeometry
  private readonly yolkPuddleGeo: THREE.CircleGeometry
  private readonly yolkCenterGeo: THREE.SphereGeometry
  private readonly bowlGeo: THREE.CylinderGeometry
  private readonly bowlRimGeo: THREE.TorusGeometry
  private readonly stickGeo: THREE.CylinderGeometry
  private readonly emberGeo: THREE.SphereGeometry

  private clockS = 0
  private shakeRemainingS = 0
  private shakeDurationS = 0.12
  private shakeAmp = 0.12
  private disposed = false

  constructor(
    scene: THREE.Scene,
    world: WorldTransformConfig,
    overlay: OverlayLayer,
    opts?: FloorFx3DOptions
  ) {
    this.world = world
    this.overlay = overlay
    this.lite = opts?.lite ?? false
    this.maxParticles = this.lite ? 72 : 220
    this.group = new THREE.Group()
    this.group.name = "trading-floor-fx-3d"
    scene.add(this.group)

    this.sparkGeo = new THREE.OctahedronGeometry(0.085, 0)
    this.smokeGeo = new THREE.SphereGeometry(0.14, this.lite ? 6 : 10, this.lite ? 5 : 8)
    this.shardGeo = new THREE.TetrahedronGeometry(0.1, 0)
    this.confettiGeo = new THREE.PlaneGeometry(0.12, 0.055)
    this.rocketGeo = new THREE.SphereGeometry(0.095, this.lite ? 6 : 8, this.lite ? 5 : 8)
    this.burstCoinGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, this.lite ? 10 : 14)
    this.ringGeo = new THREE.RingGeometry(0.32, 0.44, this.lite ? 20 : 32)
    this.eggGeo = new THREE.SphereGeometry(0.16, this.lite ? 10 : 14, this.lite ? 8 : 12)
    this.yolkPuddleGeo = new THREE.CircleGeometry(0.32, this.lite ? 12 : 18)
    this.yolkCenterGeo = new THREE.SphereGeometry(0.14, this.lite ? 8 : 12, this.lite ? 6 : 10)
    this.bowlGeo = new THREE.CylinderGeometry(0.16, 0.11, 0.15, this.lite ? 10 : 16)
    this.bowlRimGeo = new THREE.TorusGeometry(0.16, 0.022, 6, this.lite ? 12 : 18)
    this.stickGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.56, 6)
    this.emberGeo = new THREE.SphereGeometry(0.026, 6, 6)

    this.ringGeo.rotateX(-Math.PI / 2)
    this.yolkPuddleGeo.rotateX(-Math.PI / 2)
    this.bowlRimGeo.rotateX(Math.PI / 2)
    this.burstCoinGeo.rotateX(Math.PI / 2)

    this.coins = new RainCoinManager(this.group, world, overlay, {
      lite: this.lite,
      spawnSparks: (wx, wy, wz, count, color) => {
        this.spawnRadialSparks(wx, wy, wz, count, color, 1.2, 2.5, 0.44)
      },
      spawnFloorRing: (wx, wz, color, startScale, endScale, life, alpha) => {
        this.spawnWorldRing(wx, wz, color, startScale, endScale, life, alpha)
      },
      spawnBurstCoins: (wx, wy, wz) => {
        const reduced = prefersReducedMotion()
        const count = Math.max(
          6,
          Math.round(24 * (this.lite ? 0.5 : 1) * (reduced ? 0.5 : 1))
        )
        const lifeMul = reduced ? 0.65 : 1
        for (let i = 0; i < count; i += 1) {
          const angle = Math.random() * Math.PI * 2
          const speed = randRange(1.2, 3.0)
          this.addParticle(this.burstCoinGeo, 0xffd84d, {
            x: wx + randRange(-0.15, 0.15),
            y: wy,
            z: wz + randRange(-0.15, 0.15),
            vx: Math.cos(angle) * speed,
            vy: randRange(1.8, 3.8),
            vz: Math.sin(angle) * speed,
            gravity: 7.4,
            bounce: 0.42,
            spinX: randRange(-10, 10),
            spinY: randRange(-12, 12),
            spinZ: randRange(-8, 8),
            life: randRange(0.78, 1.08) * lifeMul,
            startScale: 1.0,
            endScale: 0.55,
            startAlpha: 1,
            additive: false,
          })
        }
      },
    })
  }

  /** Exposed for diagnostics & unit tests. */
  getActiveParticleCount(): number {
    return this.particles.length
  }

  private scaleCount(base: number, min = 2): number {
    const reduced = prefersReducedMotion()
    const mul = (this.lite ? 0.5 : 1) * (reduced ? 0.55 : 1)
    return Math.max(min, Math.round(base * mul))
  }

  private scaleLife(base: number): number {
    return prefersReducedMotion() ? base * 0.65 : base
  }

  private schedule(delayS: number, run: () => void): void {
    this.tasks.push({ atS: this.clockS + Math.max(0, delayS), run })
  }

  private scheduleSound(delayS: number, key: FxSoundKey, vol: number): void {
    if (delayS <= 0) {
      playFx(key, vol)
      return
    }
    this.schedule(delayS, () => playFx(key, vol))
  }

  private addParticle(
    geo: THREE.BufferGeometry,
    color: number,
    cfg: {
      x: number
      y: number
      z: number
      vx: number
      vy: number
      vz: number
      gravity: number
      drag?: number
      bounce?: number
      swirlAmp?: number
      swirlFreq?: number
      spinX?: number
      spinY?: number
      spinZ?: number
      life: number
      startScale: number
      endScale: number
      startAlpha: number
      additive: boolean
      doubleSide?: boolean
    }
  ): void {
    if (this.disposed) return
    if (this.particles.length >= this.maxParticles) {
      const oldest = this.particles.shift()
      if (oldest) {
        this.group.remove(oldest.mesh)
        oldest.mat.dispose()
      }
    }
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: cfg.startAlpha,
      depthWrite: !cfg.additive,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: cfg.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(cfg.x, cfg.y, cfg.z)
    mesh.scale.setScalar(cfg.startScale)
    this.group.add(mesh)
    this.particles.push({
      mesh,
      mat,
      vx: cfg.vx,
      vy: cfg.vy,
      vz: cfg.vz,
      gravity: cfg.gravity,
      drag: cfg.drag ?? 0,
      bounce: cfg.bounce ?? 0,
      swirlAmp: cfg.swirlAmp ?? 0,
      swirlFreq: cfg.swirlFreq ?? 0,
      swirlPhase: randRange(0, Math.PI * 2),
      spinX: cfg.spinX ?? 0,
      spinY: cfg.spinY ?? 0,
      spinZ: cfg.spinZ ?? 0,
      age: 0,
      life: cfg.life,
      startScale: cfg.startScale,
      endScale: cfg.endScale,
      startAlpha: cfg.startAlpha,
    })
  }

  private spawnRadialSparks(
    wx: number,
    wy: number,
    wz: number,
    count: number,
    color: number,
    minSpeed: number,
    maxSpeed: number,
    life: number,
    gravity = 2.8,
    startScale = 0.85,
    drag = 0
  ): void {
    for (let i = 0; i < count; i += 1) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(randRange(-0.85, 0.95))
      const speed = randRange(minSpeed, maxSpeed)
      this.addParticle(this.sparkGeo, color, {
        x: wx,
        y: wy,
        z: wz,
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.cos(phi) * speed,
        vz: Math.sin(phi) * Math.sin(theta) * speed,
        gravity,
        drag,
        spinY: randRange(-6, 6),
        life: life * randRange(0.85, 1.15),
        startScale,
        endScale: 0.05,
        startAlpha: 1,
        additive: true,
      })
    }
  }

  private spawnFlashLight(
    wx: number,
    wy: number,
    wz: number,
    color: number,
    peakIntensity: number,
    life: number
  ): void {
    if (prefersReducedMotion()) return
    if (this.lite && this.flashLights.length >= 1) return
    const light = new THREE.PointLight(color, peakIntensity, 16, 1.4)
    light.position.set(wx, wy, wz)
    this.group.add(light)
    this.flashLights.push({ light, age: 0, life, peakIntensity })
  }

  private spawnWorldRing(
    wx: number,
    wz: number,
    color: number,
    startScale: number,
    endScale: number,
    life: number,
    startAlpha: number,
    additive = false
  ): void {
    if (this.disposed) return
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: startAlpha,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(this.ringGeo, mat)
    mesh.position.set(wx, 0.034, wz)
    mesh.scale.setScalar(startScale)
    this.group.add(mesh)
    this.rings.push({
      mesh,
      mat,
      age: 0,
      life,
      startScale,
      endScale,
      startAlpha,
    })
  }

  /** Glowing golden floor click ripple marker (`520ms`). */
  spawnClickRing(lx: number, ly: number): void {
    if (this.disposed) return
    const pt = logicalToWorld(lx, ly, this.world)
    this.spawnWorldRing(
      pt.x,
      pt.z,
      0xffd76a,
      0.45,
      1.55,
      this.scaleLife(0.52),
      0.95
    )
  }

  /** Xả xui: 3D egg pop -> hop -> bouncing shell shards + yolk splat + swirling bad-luck smoke + golden cleanse sparks + local shake + xaxui.mp3. */
  playXaXui(
    lx: number,
    ly: number,
    opts: {
      isSelf: boolean
      soundVol?: number
      onAnim?: (mode: ChibiAnimMode, durationS: number) => void
    }
  ): void {
    if (this.disposed) return
    const pt = logicalToWorld(lx + 2, ly + 8, this.world)
    opts.onAnim?.("hop", 0.52)

    const mat = new THREE.MeshStandardMaterial({
      color: 0xf7f1e1,
      roughness: 0.34,
      metalness: 0.05,
    })
    const mesh = new THREE.Mesh(this.eggGeo, mat)
    mesh.position.set(pt.x, 0.21, pt.z)
    mesh.scale.set(0.3, 0.38, 0.3)
    mesh.castShadow = !this.lite
    this.group.add(mesh)

    this.eggs.push({
      mesh,
      mat,
      age: 0,
      crackAt: 0.26,
      cracked: false,
      wx: pt.x,
      wz: pt.z,
      isSelf: opts.isSelf,
    })

    this.scheduleSound(0.25, "xaxui", opts.soundVol ?? 1)
  }

  private crackEgg(egg: EggFx): void {
    const reduced = prefersReducedMotion()
    if (egg.isSelf && !reduced) {
      this.shakeRemainingS = 0.12
      this.shakeDurationS = 0.12
      this.shakeAmp = 0.12
    }

    // Crisp stomp impact ring on the floor
    this.spawnWorldRing(
      egg.wx,
      egg.wz,
      0xf6c65b,
      0.4,
      1.7,
      this.scaleLife(0.42),
      0.75,
      true
    )

    // Yolk splat on floor
    const group = new THREE.Group()
    group.position.set(egg.wx, 0.024, egg.wz)
    group.scale.setScalar(0.3)

    const albumenMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e6,
      roughness: 0.22,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
    const yolkMat = new THREE.MeshStandardMaterial({
      color: 0xf6ae1c,
      roughness: 0.18,
      emissive: 0x995800,
      emissiveIntensity: 0.16,
      transparent: true,
      opacity: 0.96,
    })
    const puddle = new THREE.Mesh(this.yolkPuddleGeo, albumenMat)
    puddle.scale.set(1.1, 1, 0.85)
    const yolkCenter = new THREE.Mesh(this.yolkCenterGeo, yolkMat)
    yolkCenter.scale.set(1.15, 0.28, 0.95)
    yolkCenter.position.y = 0.03
    group.add(puddle, yolkCenter)
    this.group.add(group)
    this.yolks.push({
      group,
      mats: [albumenMat, yolkMat],
      age: 0,
      popS: 0.12,
      stayS: reduced ? 0.55 : 0.85,
      fadeS: 0.36,
    })

    // Bouncing eggshell shards with gravity
    const shardCount = this.scaleCount(12, 4)
    for (let i = 0; i < shardCount; i += 1) {
      const a = (i / shardCount) * Math.PI * 2 + randRange(-0.25, 0.25)
      const spd = randRange(1.2, 2.7)
      this.addParticle(this.shardGeo, i % 2 === 0 ? 0xfaf5e8 : 0xefe6cf, {
        x: egg.wx,
        y: 0.2,
        z: egg.wz,
        vx: Math.cos(a) * spd,
        vy: randRange(1.7, 3.3),
        vz: Math.sin(a) * spd,
        gravity: 7.8,
        bounce: 0.38,
        spinX: randRange(-12, 12),
        spinY: randRange(-12, 12),
        spinZ: randRange(-12, 12),
        life: this.scaleLife(0.76),
        startScale: 1.05,
        endScale: 0.55,
        startAlpha: 1,
        additive: false,
      })
    }

    // Rising swirling dark-slate "vía xui" smoke wisps
    const smokeCount = this.scaleCount(10, 4)
    for (let i = 0; i < smokeCount; i += 1) {
      this.addParticle(this.smokeGeo, i % 3 === 0 ? 0x7c8396 : 0x9aa2b2, {
        x: egg.wx + randRange(-0.24, 0.24),
        y: 0.22 + randRange(0, 0.16),
        z: egg.wz + randRange(-0.24, 0.24),
        vx: randRange(-0.32, 0.32),
        vy: randRange(0.78, 1.45),
        vz: randRange(-0.32, 0.32),
        gravity: -0.25,
        swirlAmp: reduced ? 0 : 0.22,
        swirlFreq: 4.5,
        life: this.scaleLife(randRange(0.78, 1.15)),
        startScale: 0.55,
        endScale: 1.9,
        startAlpha: 0.56,
        additive: false,
      })
    }

    // Golden cleanse sparks signaling bad luck dispelled
    const cleanseCount = this.scaleCount(8, 3)
    for (let i = 0; i < cleanseCount; i += 1) {
      const a = (i / cleanseCount) * Math.PI * 2
      this.addParticle(this.sparkGeo, 0xffe07a, {
        x: egg.wx + Math.cos(a) * 0.25,
        y: 0.24,
        z: egg.wz + Math.sin(a) * 0.25,
        vx: Math.cos(a) * 0.6,
        vy: randRange(1.2, 2.1),
        vz: Math.sin(a) * 0.6,
        gravity: 1.2,
        spinY: 5,
        life: this.scaleLife(0.62),
        startScale: 0.72,
        endScale: 0.06,
        startAlpha: 0.95,
        additive: true,
      })
    }
  }

  /** Gáy: firework rockets -> air-drag starburst blooms + golden willow + confetti + flash + DOM banner + sounds. */
  playGay(
    lx: number,
    ly: number,
    name: string,
    text: string,
    opts: { isSelf: boolean; soundVol?: number }
  ): void {
    if (this.disposed) return
    const reduced = prefersReducedMotion()
    const vol = opts.soundVol ?? 1
    const base = logicalToWorld(lx, ly, this.world)
    const count = reduced
      ? 3
      : this.lite
        ? 4
        : 6 + Math.floor(Math.random() * 3)

    this.scheduleSound(0, "rooster", vol)
    this.scheduleSound(0.5, "firework", vol)
    if (!reduced) this.scheduleSound(1.3, "firework", vol)

    this.overlay.showFxBanner(
      lx,
      ly,
      2.4,
      "gay",
      `${name} gáy:`,
      text,
      reduced ? 3500 : 5000
    )

    for (let i = 0; i < count; i += 1) {
      const delayS =
        i === 0
          ? 0
          : Math.min(1.05, (i / Math.max(1, count - 1)) * 0.98 + randRange(0, 0.08))
      const outerColor = FIREWORK_COLORS[i % FIREWORK_COLORS.length]!
      const innerColor = FIREWORK_COLORS[(i + 2) % FIREWORK_COLORS.length]!
      this.schedule(delayS, () => {
        const start = new THREE.Vector3(
          base.x + randRange(-0.9, 0.9),
          0.5,
          base.z + randRange(-0.5, 0.5)
        )
        const apex = new THREE.Vector3(
          start.x + randRange(-0.6, 0.6),
          randRange(4.4, 6.4),
          start.z + randRange(-0.5, 0.5)
        )
        const mat = new THREE.MeshBasicMaterial({
          color: outerColor,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const mesh = new THREE.Mesh(this.rocketGeo, mat)
        mesh.position.copy(start)
        this.group.add(mesh)
        this.rockets.push({
          mesh,
          mat,
          start,
          apex,
          age: 0,
          riseS: randRange(0.32, 0.44),
          trailAccum: 0,
          outerColor,
          innerColor,
        })
      })
    }

    // Final golden willow climax burst + fluttering celebratory confetti
    this.schedule(reduced ? 0.85 : 1.3, () => {
      const wx = base.x + randRange(-0.25, 0.25)
      const wy = randRange(5.0, 6.0)
      const wz = base.z + randRange(-0.25, 0.25)
      this.spawnFlashLight(wx, wy, wz, 0xffdc8c, 5.0, 0.34)
      this.spawnRadialSparks(
        wx,
        wy,
        wz,
        this.scaleCount(48, 12),
        0xffd84d,
        1.2,
        4.3,
        this.scaleLife(1.5),
        2.1,
        1.05,
        1.45
      )
      this.spawnRadialSparks(
        wx,
        wy,
        wz,
        this.scaleCount(24, 6),
        0xfff4b8,
        0.7,
        2.3,
        this.scaleLife(1.3),
        1.9,
        0.85,
        1.35
      )

      const confettiCount = this.scaleCount(20, 6)
      for (let i = 0; i < confettiCount; i += 1) {
        const a = Math.random() * Math.PI * 2
        const r = randRange(0.4, 1.7)
        this.addParticle(
          this.confettiGeo,
          CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
          {
            x: base.x + Math.cos(a) * r,
            y: randRange(2.4, 3.8),
            z: base.z + Math.sin(a) * r,
            vx: randRange(-0.4, 0.4),
            vy: randRange(-0.3, 0.4),
            vz: randRange(-0.4, 0.4),
            gravity: 1.1,
            drag: 1.2,
            swirlAmp: reduced ? 0 : 0.35,
            swirlFreq: 3.4,
            spinX: randRange(-7, 7),
            spinY: randRange(-8, 8),
            spinZ: randRange(-6, 6),
            life: this.scaleLife(randRange(1.4, 2.0)),
            startScale: 1.0,
            endScale: 0.75,
            startAlpha: 0.96,
            additive: false,
            doubleSide: true,
          }
        )
      }
    })
  }

  /** Khấn: 3D incense bowl + 3 sticks + swirling smoke + bow 3x + double gold lotus aura + spiraling sparks + bell.mp3. */
  playKhan(
    lx: number,
    ly: number,
    name: string,
    text: string,
    opts: {
      isSelf: boolean
      soundVol?: number
      onAnim?: (mode: ChibiAnimMode, durationS: number) => void
      onCelebrate?: (luck: number) => void
    }
  ): void {
    if (this.disposed) return
    const reduced = prefersReducedMotion()
    const vol = opts.soundVol ?? 1
    this.scheduleSound(0, "bell", vol)
    opts.onAnim?.("bow", 2.7)
    opts.onCelebrate?.(opts.isSelf ? 3 : 2)

    this.overlay.showFxBanner(
      lx,
      ly,
      2.35,
      "khan",
      `${name} khấn:`,
      text,
      reduced ? 3200 : 4500
    )

    const charPt = logicalToWorld(lx, ly, this.world)
    const bowlPt = logicalToWorld(lx + 28, ly - 8, this.world)

    const group = new THREE.Group()
    group.position.set(bowlPt.x, 0, bowlPt.z)

    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0xe9b949,
      metalness: 0.84,
      roughness: 0.24,
      emissive: 0x8a5a08,
      emissiveIntensity: 0.16,
      transparent: true,
      opacity: 1,
    })
    const stickMat = new THREE.MeshStandardMaterial({
      color: 0x7c1512,
      roughness: 0.65,
      transparent: true,
      opacity: 1,
    })
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0xff7b24,
      emissive: 0xff6200,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 1,
    })

    const bowl = new THREE.Mesh(this.bowlGeo, bowlMat)
    bowl.position.y = 0.08
    const rim = new THREE.Mesh(this.bowlRimGeo, bowlMat)
    rim.position.y = 0.15
    group.add(bowl, rim)

    const tipWorldPos: THREE.Vector3[] = []
    for (const [dx, tilt] of [
      [-0.045, 0.16],
      [0, 0],
      [0.045, -0.16],
    ] as const) {
      const stick = new THREE.Mesh(this.stickGeo, stickMat)
      stick.position.set(dx, 0.36, 0)
      stick.rotation.z = tilt
      group.add(stick)

      const tipX = dx - Math.sin(tilt) * 0.28
      const tipY = 0.36 + Math.cos(tilt) * 0.28
      const ember = new THREE.Mesh(this.emberGeo, emberMat)
      ember.position.set(tipX, tipY, 0)
      group.add(ember)
      tipWorldPos.push(new THREE.Vector3(bowlPt.x + tipX, tipY, bowlPt.z))
    }

    this.group.add(group)
    this.incenses.push({
      group,
      mats: [bowlMat, stickMat, emberMat],
      tipWorldPos,
      age: 0,
      burnS: reduced ? 2.2 : 3.5,
      fadeS: 0.6,
      smokeAccum: 0,
    })

    // Concentric golden sacred lotus floor aura rings
    this.spawnWorldRing(
      charPt.x,
      charPt.z,
      0xffd76a,
      1.1,
      2.5,
      this.scaleLife(2.4),
      0.68,
      true
    )
    if (!this.lite && !reduced) {
      this.schedule(0.38, () => {
        this.spawnWorldRing(
          charPt.x,
          charPt.z,
          0xfff0a8,
          0.85,
          2.1,
          2.0,
          0.52,
          true
        )
      })
    }

    // Warm golden glow light + spiraling rising golden sparks
    this.spawnFlashLight(charPt.x, 1.3, charPt.z, 0xffd86b, 2.4, 2.2)
    const sparkCount = this.scaleCount(24, 6)
    for (let i = 0; i < sparkCount; i += 1) {
      const a = (i / sparkCount) * Math.PI * 2
      const r = randRange(0.25, 0.65)
      this.addParticle(this.sparkGeo, i % 2 === 0 ? 0xfff0a0 : 0xffc83d, {
        x: charPt.x + Math.cos(a) * r,
        y: randRange(0.18, 1.15),
        z: charPt.z + Math.sin(a) * r,
        vx: Math.cos(a + Math.PI / 2) * 0.24,
        vy: randRange(0.65, 1.35),
        vz: Math.sin(a + Math.PI / 2) * 0.24,
        gravity: -0.08,
        swirlAmp: reduced ? 0 : 0.28,
        swirlFreq: 2.8,
        spinY: randRange(-4, 4),
        life: this.scaleLife(randRange(1.4, 2.1)),
        startScale: 0.92,
        endScale: 0.08,
        startAlpha: 0.95,
        additive: true,
      })
    }
  }

  /** Current camera shake displacement (always zero when prefers-reduced-motion is active). */
  getCameraShakeOffset(): { x: number; y: number; z: number } {
    if (this.shakeRemainingS <= 0 || prefersReducedMotion()) {
      return { x: 0, y: 0, z: 0 }
    }
    const k = this.shakeRemainingS / Math.max(0.01, this.shakeDurationS)
    const a = this.shakeAmp * k
    return {
      x: randRange(-a, a),
      y: randRange(-a * 0.6, a * 0.6),
      z: randRange(-a * 0.5, a * 0.5),
    }
  }

  update(dt: number): void {
    if (this.disposed) return
    this.clockS += dt
    const reduced = prefersReducedMotion()

    if (this.shakeRemainingS > 0) {
      this.shakeRemainingS = Math.max(0, this.shakeRemainingS - dt)
    }

    // 1. Run scheduled FX milestones
    for (let i = this.tasks.length - 1; i >= 0; i -= 1) {
      const task = this.tasks[i]!
      if (this.clockS >= task.atS) {
        this.tasks.splice(i, 1)
        task.run()
      }
    }

    // 2. Update eggs (Xả xui)
    for (let i = this.eggs.length - 1; i >= 0; i -= 1) {
      const egg = this.eggs[i]!
      egg.age += dt
      const pop = Math.min(1, egg.age / 0.09)
      egg.mesh.scale.set(0.3 + 0.7 * pop, 0.38 + 0.92 * pop, 0.3 + 0.7 * pop)
      if (!egg.cracked && egg.age >= egg.crackAt) {
        egg.cracked = true
        this.group.remove(egg.mesh)
        egg.mat.dispose()
        this.eggs.splice(i, 1)
        this.crackEgg(egg)
      }
    }

    // 3. Update yolk splats
    for (let i = this.yolks.length - 1; i >= 0; i -= 1) {
      const yolk = this.yolks[i]!
      yolk.age += dt
      if (yolk.age < yolk.popS) {
        const t = yolk.age / yolk.popS
        yolk.group.scale.setScalar(0.3 + 0.7 * (1 - (1 - t) * (1 - t)))
      } else if (yolk.age < yolk.popS + yolk.stayS) {
        yolk.group.scale.setScalar(1)
      } else {
        const ft = (yolk.age - yolk.popS - yolk.stayS) / yolk.fadeS
        if (ft >= 1) {
          this.group.remove(yolk.group)
          for (const m of yolk.mats) m.dispose()
          this.yolks.splice(i, 1)
        } else {
          yolk.mats[0]!.opacity = 0.72 * (1 - ft)
          yolk.mats[1]!.opacity = 0.96 * (1 - ft)
        }
      }
    }

    // 4. Update firework rockets
    for (let i = this.rockets.length - 1; i >= 0; i -= 1) {
      const r = this.rockets[i]!
      r.age += dt
      const t = Math.min(1, r.age / r.riseS)
      const easeOut = 1 - (1 - t) * (1 - t)
      r.mesh.position.lerpVectors(r.start, r.apex, easeOut)

      r.trailAccum += dt
      const trailStep = this.lite || reduced ? 0.07 : 0.035
      if (r.trailAccum >= trailStep) {
        r.trailAccum = 0
        this.addParticle(this.sparkGeo, r.outerColor, {
          x: r.mesh.position.x,
          y: r.mesh.position.y,
          z: r.mesh.position.z,
          vx: randRange(-0.25, 0.25),
          vy: randRange(-0.4, 0.1),
          vz: randRange(-0.25, 0.25),
          gravity: 0.8,
          life: this.scaleLife(0.24),
          startScale: 0.6,
          endScale: 0.05,
          startAlpha: 0.85,
          additive: true,
        })
      }

      if (t >= 1) {
        const pos = r.mesh.position.clone()
        this.group.remove(r.mesh)
        r.mat.dispose()
        this.rockets.splice(i, 1)
        // Air-drag dual-ring starburst + falling gold glitter
        this.spawnRadialSparks(
          pos.x,
          pos.y,
          pos.z,
          this.scaleCount(24, 6),
          r.outerColor,
          2.4,
          4.1,
          this.scaleLife(0.82),
          2.3,
          0.95,
          1.85
        )
        this.spawnRadialSparks(
          pos.x,
          pos.y,
          pos.z,
          this.scaleCount(14, 4),
          r.innerColor,
          0.9,
          2.2,
          this.scaleLife(0.72),
          2.1,
          0.8,
          1.6
        )
        this.spawnRadialSparks(
          pos.x,
          pos.y,
          pos.z,
          this.scaleCount(8, 2),
          0xfff0a0,
          0.4,
          1.2,
          this.scaleLife(0.78),
          2.0,
          0.6,
          1.2
        )
      }
    }

    // 5. Update incense bowls (Khấn)
    for (let i = this.incenses.length - 1; i >= 0; i -= 1) {
      const inc = this.incenses[i]!
      inc.age += dt
      if (inc.age < inc.burnS) {
        inc.smokeAccum += dt
        const smokeInterval = this.lite || reduced ? 0.3 : 0.15
        if (inc.smokeAccum >= smokeInterval) {
          inc.smokeAccum = 0
          const tips = this.lite ? [inc.tipWorldPos[1]!] : inc.tipWorldPos
          for (const tip of tips) {
            this.addParticle(this.smokeGeo, 0xf1f5f9, {
              x: tip.x + randRange(-0.02, 0.02),
              y: tip.y + 0.02,
              z: tip.z + randRange(-0.02, 0.02),
              vx: randRange(-0.08, 0.08),
              vy: randRange(0.45, 0.72),
              vz: randRange(-0.08, 0.08),
              gravity: -0.05,
              swirlAmp: reduced ? 0 : 0.18,
              swirlFreq: 3.2,
              life: this.scaleLife(1.5),
              startScale: 0.28,
              endScale: 1.05,
              startAlpha: 0.42,
              additive: false,
            })
          }
        }
      } else {
        const ft = (inc.age - inc.burnS) / inc.fadeS
        if (ft >= 1) {
          this.group.remove(inc.group)
          for (const m of inc.mats) m.dispose()
          this.incenses.splice(i, 1)
        } else {
          for (const m of inc.mats) {
            ;(m as THREE.MeshStandardMaterial).opacity = 1 - ft
          }
        }
      }
    }

    // 6. Update expanding floor rings (click ripple, stomp, landing & khấn aura)
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i]!
      ring.age += dt
      const t = Math.min(1, ring.age / ring.life)
      const easeOut = 1 - (1 - t) * (1 - t)
      ring.mesh.scale.setScalar(
        ring.startScale + (ring.endScale - ring.startScale) * easeOut
      )
      ring.mat.opacity = ring.startAlpha * (1 - t)
      if (t >= 1) {
        this.group.remove(ring.mesh)
        ring.mat.dispose()
        this.rings.splice(i, 1)
      }
    }

    // 7. Update flash lights
    for (let i = this.flashLights.length - 1; i >= 0; i -= 1) {
      const fl = this.flashLights[i]!
      fl.age += dt
      const t = Math.min(1, fl.age / fl.life)
      fl.light.intensity = fl.peakIntensity * (1 - t) * (1 - t)
      if (t >= 1) {
        this.group.remove(fl.light)
        this.flashLights.splice(i, 1)
      }
    }

    // 8. Update 3D particles (with drag, floor bounce, and organic swirl)
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!
      p.age += dt
      if (p.age >= p.life) {
        this.group.remove(p.mesh)
        p.mat.dispose()
        this.particles.splice(i, 1)
        continue
      }
      const t = p.age / p.life
      if (p.drag > 0) {
        const damp = Math.exp(-p.drag * dt)
        p.vx *= damp
        p.vy *= damp
        p.vz *= damp
      }
      p.vy -= p.gravity * dt

      const swirlX =
        p.swirlAmp > 0
          ? Math.cos(p.age * p.swirlFreq + p.swirlPhase) * p.swirlAmp
          : 0
      const swirlZ =
        p.swirlAmp > 0
          ? Math.sin(p.age * p.swirlFreq + p.swirlPhase) * p.swirlAmp
          : 0

      p.mesh.position.x += (p.vx + swirlX) * dt
      p.mesh.position.z += (p.vz + swirlZ) * dt
      const nextY = p.mesh.position.y + p.vy * dt
      if (nextY <= 0.04) {
        p.mesh.position.y = 0.04
        if (p.bounce > 0 && p.vy < -0.35) {
          p.vy = -p.vy * p.bounce
          p.vx *= 0.72
          p.vz *= 0.72
        } else {
          p.vy = 0
        }
      } else {
        p.mesh.position.y = nextY
      }

      if (p.spinX) p.mesh.rotation.x += p.spinX * dt
      if (p.spinY) p.mesh.rotation.y += p.spinY * dt
      if (p.spinZ) p.mesh.rotation.z += p.spinZ * dt
      p.mesh.scale.setScalar(
        p.startScale + (p.endScale - p.startScale) * t
      )
      p.mat.opacity = p.startAlpha * (1 - t)
    }

    // 9. Update coin rain
    this.coins.update(dt)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.tasks.length = 0
    this.coins.dispose()

    for (const p of this.particles.splice(0)) {
      this.group.remove(p.mesh)
      p.mat.dispose()
    }
    for (const r of this.rockets.splice(0)) {
      this.group.remove(r.mesh)
      r.mat.dispose()
    }
    for (const ring of this.rings.splice(0)) {
      this.group.remove(ring.mesh)
      ring.mat.dispose()
    }
    for (const egg of this.eggs.splice(0)) {
      this.group.remove(egg.mesh)
      egg.mat.dispose()
    }
    for (const yolk of this.yolks.splice(0)) {
      this.group.remove(yolk.group)
      for (const m of yolk.mats) m.dispose()
    }
    for (const inc of this.incenses.splice(0)) {
      this.group.remove(inc.group)
      for (const m of inc.mats) m.dispose()
    }
    for (const fl of this.flashLights.splice(0)) {
      this.group.remove(fl.light)
    }

    this.sparkGeo.dispose()
    this.smokeGeo.dispose()
    this.shardGeo.dispose()
    this.confettiGeo.dispose()
    this.rocketGeo.dispose()
    this.burstCoinGeo.dispose()
    this.ringGeo.dispose()
    this.eggGeo.dispose()
    this.yolkPuddleGeo.dispose()
    this.yolkCenterGeo.dispose()
    this.bowlGeo.dispose()
    this.bowlRimGeo.dispose()
    this.stickGeo.dispose()
    this.emberGeo.dispose()
    this.group.parent?.remove(this.group)
  }
}
