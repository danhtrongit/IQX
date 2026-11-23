/**
 * Pure Three.js procedural 3D FX & Coin Rain manager for Khu Giao Dịch:
 * - Xả xui: 3D egg pop -> hop -> 10 flying shell shards + yolk splat + 10 rising grey smoke puffs + local shake + xaxui.mp3
 * - Gáy: 6-8 3D firework rockets -> dual-ring starbursts + golden willow climax + flash + dark-red/gold banner + rooster/firework.mp3
 * - Khấn: 3D gold incense bowl + 3 glowing sticks + curling smoke + bow 3x + warm gold aura + 20 rising sparks + bell.mp3
 * - Tán lộc (RainCoinManager): 24 decorative burst coins + spinning/bouncing/glinting 3D gold coins + grab pop + "+10 xu" + coins/coin.mp3
 */
import * as THREE from "three"

import {
  logicalToWorld,
  type ChibiAnimMode,
  type ProjectedPoint,
  type WorldTransformConfig,
} from "@/lib/chibi-3d/types.ts"

import type { Rain } from "../net/types.ts"
import { playFx, type FxSoundKey } from "./fx-sound.ts"
import type { OverlayLayer } from "./overlay-layer.ts"

const FIREWORK_COLORS = [0xffd84d, 0xff4d5a, 0xff6ec7, 0x4df3ff, 0x7cff50]

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
  private readonly spawnSparks: (
    wx: number,
    wy: number,
    wz: number,
    count: number,
    color: number
  ) => void
  private readonly spawnBurstCoins: (wx: number, wy: number, wz: number) => void

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
      spawnSparks: (
        wx: number,
        wy: number,
        wz: number,
        count: number,
        color: number
      ) => void
      spawnBurstCoins: (wx: number, wy: number, wz: number) => void
    }
  ) {
    this.parent = parent
    this.world = world
    this.overlay = overlay
    this.spawnSparks = hooks.spawnSparks
    this.spawnBurstCoins = hooks.spawnBurstCoins

    this.coinRimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.055, 20)
    this.coinRimGeo.rotateX(Math.PI / 2)
    this.coinFaceGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.062, 18)
    this.coinFaceGeo.rotateX(Math.PI / 2)
    this.coinHoleGeo = new THREE.BoxGeometry(0.085, 0.085, 0.068)
    this.shadowGeo = new THREE.CircleGeometry(0.24, 16)
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

    // Keep base targetOpacity via userData for clean transitions
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

    this.spawnSparks(
      coin.wx,
      Math.max(0.32, coin.coinMesh.position.y),
      coin.wz,
      6,
      0xffe066
    )
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
        const pt = projectLogical(c.lx, c.ly, Math.max(0.24, c.coinMesh.position.y))
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
    for (const rain of this.rains.values()) {
      for (const coin of rain.coins.values()) {
        this.stepLiveCoin(coin, dt)
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

  private stepLiveCoin(coin: ActiveCoin, dt: number): void {
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
      const t = Math.min(1, coin.timer / coin.fallS)
      const easeIn = t * t
      coin.coinMesh.position.y = 8.2 * (1 - easeIn) + 0.24 * easeIn
      coin.coinMesh.rotation.y += dt * 7
      this.setCoinOpacity(coin, Math.min(1, coin.timer / 0.16))
      coin.shadowMat.opacity = shadowBase * t
      coin.shadowMesh.scale.setScalar(0.35 + 0.65 * t)
      if (t >= 1) {
        coin.state = "bouncing"
        coin.timer = 0
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
    coin.spinPhase += dt * 2.5
    coin.coinMesh.rotation.y = coin.spinPhase
    coin.coinMesh.position.y = 0.25 + Math.sin(coin.spinPhase * 1.4) * 0.04
    this.setCoinOpacity(coin, 1)
    coin.shadowMat.opacity = shadowBase
    coin.shadowMesh.scale.setScalar(1)

    coin.glintCooldown -= dt
    if (coin.glintCooldown <= 0) {
      coin.glintCooldown = randRange(1.9, 3.4)
      this.spawnSparks(
        coin.wx + randRange(-0.12, 0.12),
        0.34,
        coin.wz + randRange(-0.12, 0.12),
        1,
        0xfffbe0
      )
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

    // Quiet fade out
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
  private readonly tasks: ScheduledTask[] = []
  private readonly particles: Particle3D[] = []
  private readonly rockets: FireworkRocket[] = []
  private readonly rings: FloorRingFx[] = []
  private readonly eggs: EggFx[] = []
  private readonly yolks: YolkFx[] = []
  private readonly incenses: IncenseFx[] = []
  private readonly flashLights: FlashLightFx[] = []

  // Shared lightweight procedural geometries (disposed cleanly in dispose())
  private readonly sparkGeo = new THREE.OctahedronGeometry(0.085, 0)
  private readonly smokeGeo = new THREE.SphereGeometry(0.14, 10, 8)
  private readonly shardGeo = new THREE.TetrahedronGeometry(0.1, 0)
  private readonly rocketGeo = new THREE.SphereGeometry(0.095, 8, 8)
  private readonly burstCoinGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 14)
  private readonly ringGeo = new THREE.RingGeometry(0.32, 0.44, 32)
  private readonly eggGeo = new THREE.SphereGeometry(0.16, 14, 12)
  private readonly yolkPuddleGeo = new THREE.CircleGeometry(0.32, 18)
  private readonly yolkCenterGeo = new THREE.SphereGeometry(0.14, 12, 10)
  private readonly bowlGeo = new THREE.CylinderGeometry(0.16, 0.11, 0.15, 16)
  private readonly bowlRimGeo = new THREE.TorusGeometry(0.16, 0.022, 8, 18)
  private readonly stickGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.56, 6)
  private readonly emberGeo = new THREE.SphereGeometry(0.026, 8, 6)

  private clockS = 0
  private shakeRemainingS = 0
  private shakeDurationS = 0.12
  private shakeAmp = 0.12
  private disposed = false

  constructor(
    scene: THREE.Scene,
    world: WorldTransformConfig,
    overlay: OverlayLayer
  ) {
    this.world = world
    this.overlay = overlay
    this.group = new THREE.Group()
    this.group.name = "trading-floor-fx-3d"
    scene.add(this.group)

    this.ringGeo.rotateX(-Math.PI / 2)
    this.yolkPuddleGeo.rotateX(-Math.PI / 2)
    this.bowlRimGeo.rotateX(Math.PI / 2)
    this.burstCoinGeo.rotateX(Math.PI / 2)

    this.coins = new RainCoinManager(this.group, world, overlay, {
      spawnSparks: (wx, wy, wz, count, color) => {
        this.spawnRadialSparks(wx, wy, wz, count, color, 1.2, 2.5, 0.44)
      },
      spawnBurstCoins: (wx, wy, wz) => {
        for (let i = 0; i < 24; i += 1) {
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
            spinX: randRange(-10, 10),
            spinY: randRange(-12, 12),
            spinZ: randRange(-8, 8),
            life: randRange(0.78, 1.08),
            startScale: 1.0,
            endScale: 0.55,
            startAlpha: 1,
            additive: false,
          })
        }
      },
    })
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
      spinX?: number
      spinY?: number
      spinZ?: number
      life: number
      startScale: number
      endScale: number
      startAlpha: number
      additive: boolean
    }
  ): void {
    if (this.disposed) return
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: cfg.startAlpha,
      depthWrite: !cfg.additive,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
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
    startScale = 0.85
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
    const light = new THREE.PointLight(color, peakIntensity, 16, 1.4)
    light.position.set(wx, wy, wz)
    this.group.add(light)
    this.flashLights.push({ light, age: 0, life, peakIntensity })
  }

  /** Glowing golden floor click ripple marker (`520ms`). */
  spawnClickRing(lx: number, ly: number): void {
    if (this.disposed) return
    const pt = logicalToWorld(lx, ly, this.world)
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(this.ringGeo, mat)
    mesh.position.set(pt.x, 0.032, pt.z)
    mesh.scale.setScalar(0.45)
    this.group.add(mesh)
    this.rings.push({
      mesh,
      mat,
      age: 0,
      life: 0.52,
      startScale: 0.45,
      endScale: 1.55,
      startAlpha: 0.95,
    })
  }

  /** Xả xui: 3D egg pop -> hop -> 10 shell shards + yolk splat + 10 rising grey smoke puffs + local shake + xaxui.mp3. */
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
    mesh.castShadow = true
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
    if (egg.isSelf) {
      this.shakeRemainingS = 0.12
      this.shakeDurationS = 0.12
      this.shakeAmp = 0.12
    }

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
      stayS: 0.85,
      fadeS: 0.36,
    })

    // 10 flying eggshell shards with gravity
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + randRange(-0.25, 0.25)
      const spd = randRange(1.2, 2.6)
      this.addParticle(this.shardGeo, i % 2 === 0 ? 0xfaf5e8 : 0xefe6cf, {
        x: egg.wx,
        y: 0.2,
        z: egg.wz,
        vx: Math.cos(a) * spd,
        vy: randRange(1.6, 3.2),
        vz: Math.sin(a) * spd,
        gravity: 7.5,
        spinX: randRange(-12, 12),
        spinY: randRange(-12, 12),
        spinZ: randRange(-12, 12),
        life: 0.72,
        startScale: 1.05,
        endScale: 0.6,
        startAlpha: 1,
        additive: false,
      })
    }

    // 10 rising grey "bad-luck" smoke wisps
    for (let i = 0; i < 10; i += 1) {
      this.addParticle(this.smokeGeo, 0x949ba8, {
        x: egg.wx + randRange(-0.22, 0.22),
        y: 0.22 + randRange(0, 0.15),
        z: egg.wz + randRange(-0.22, 0.22),
        vx: randRange(-0.42, 0.42),
        vy: randRange(0.75, 1.45),
        vz: randRange(-0.42, 0.42),
        gravity: -0.25,
        life: randRange(0.78, 1.15),
        startScale: 0.55,
        endScale: 1.85,
        startAlpha: 0.58,
        additive: false,
      })
    }
  }

  /** Gáy: 6-8 firework rockets -> dual-ring starbursts + golden willow burst + flash + DOM banner + sounds. */
  playGay(
    lx: number,
    ly: number,
    name: string,
    text: string,
    opts: { isSelf: boolean; soundVol?: number }
  ): void {
    if (this.disposed) return
    const vol = opts.soundVol ?? 1
    const base = logicalToWorld(lx, ly, this.world)
    const count = 6 + Math.floor(Math.random() * 3) // 6..8

    this.scheduleSound(0, "rooster", vol)
    this.scheduleSound(0.5, "firework", vol)
    this.scheduleSound(1.3, "firework", vol)

    this.overlay.showFxBanner(lx, ly, 2.4, "gay", `${name} gáy:`, text, 5000)

    for (let i = 0; i < count; i += 1) {
      const delayS =
        i === 0
          ? 0
          : Math.min(1.1, (i / (count - 1)) * 1.02 + randRange(0, 0.08))
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
          randRange(4.4, 6.6),
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

    // Final golden willow burst at +1300ms + warm flash light
    this.schedule(1.3, () => {
      const wx = base.x + randRange(-0.25, 0.25)
      const wy = randRange(5.1, 6.2)
      const wz = base.z + randRange(-0.25, 0.25)
      this.spawnFlashLight(wx, wy, wz, 0xffdc8c, 5.2, 0.34)
      this.spawnRadialSparks(wx, wy, wz, 56, 0xffd84d, 1.0, 4.1, 1.55, 2.3, 1.05)
      this.spawnRadialSparks(wx, wy, wz, 28, 0xfff4b8, 0.6, 2.2, 1.35, 2.1, 0.85)
    })
  }

  /** Khấn: 3D incense bowl + 3 sticks + rising smoke + bow 3x + warm gold aura + 20 sparks + celebrate + DOM banner + bell.mp3. */
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
    const vol = opts.soundVol ?? 1
    this.scheduleSound(0, "bell", vol)
    opts.onAnim?.("bow", 2.7)
    opts.onCelebrate?.(opts.isSelf ? 3 : 2)

    this.overlay.showFxBanner(lx, ly, 2.35, "khan", `${name} khấn:`, text, 4500)

    const charPt = logicalToWorld(lx, ly, this.world)
    const bowlPt = logicalToWorld(lx + 28, ly - 8, this.world)

    // 3D golden incense bowl + 3 glowing incense sticks
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
      burnS: 3.5,
      fadeS: 0.6,
      smokeAccum: 0,
    })

    // Warm expanding golden floor aura ring
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const auraRing = new THREE.Mesh(this.ringGeo, auraMat)
    auraRing.position.set(charPt.x, 0.036, charPt.z)
    auraRing.scale.setScalar(1.2)
    this.group.add(auraRing)
    this.rings.push({
      mesh: auraRing,
      mat: auraMat,
      age: 0,
      life: 2.4,
      startScale: 1.2,
      endScale: 2.5,
      startAlpha: 0.65,
    })

    // Warm golden glow light + 20 rising golden sparks
    this.spawnFlashLight(charPt.x, 1.3, charPt.z, 0xffd86b, 2.4, 2.2)
    for (let i = 0; i < 20; i += 1) {
      this.addParticle(this.sparkGeo, i % 2 === 0 ? 0xfff0a0 : 0xffc83d, {
        x: charPt.x + randRange(-0.5, 0.5),
        y: randRange(0.2, 1.2),
        z: charPt.z + randRange(-0.5, 0.5),
        vx: randRange(-0.18, 0.18),
        vy: randRange(0.6, 1.35),
        vz: randRange(-0.18, 0.18),
        gravity: -0.1,
        spinY: randRange(-4, 4),
        life: randRange(1.4, 2.1),
        startScale: 0.9,
        endScale: 0.08,
        startAlpha: 0.95,
        additive: true,
      })
    }
  }

  /** Current camera shake displacement (non-zero briefly during local Xả xui stomp). */
  getCameraShakeOffset(): { x: number; y: number; z: number } {
    if (this.shakeRemainingS <= 0) return { x: 0, y: 0, z: 0 }
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
      if (r.trailAccum >= 0.035) {
        r.trailAccum = 0
        this.addParticle(this.sparkGeo, r.outerColor, {
          x: r.mesh.position.x,
          y: r.mesh.position.y,
          z: r.mesh.position.z,
          vx: randRange(-0.25, 0.25),
          vy: randRange(-0.4, 0.1),
          vz: randRange(-0.25, 0.25),
          gravity: 0.8,
          life: 0.24,
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
        // Dual-ring starburst + falling gold glitter
        this.spawnRadialSparks(
          pos.x,
          pos.y,
          pos.z,
          26,
          r.outerColor,
          2.2,
          3.8,
          0.74,
          2.6,
          0.95
        )
        this.spawnRadialSparks(
          pos.x,
          pos.y,
          pos.z,
          16,
          r.innerColor,
          0.8,
          2.0,
          0.66,
          2.3,
          0.8
        )
        this.spawnRadialSparks(
          pos.x,
          pos.y,
          pos.z,
          8,
          0xfff0a0,
          0.4,
          1.1,
          0.72,
          2.2,
          0.6
        )
      }
    }

    // 5. Update incense bowls (Khấn)
    for (let i = this.incenses.length - 1; i >= 0; i -= 1) {
      const inc = this.incenses[i]!
      inc.age += dt
      if (inc.age < inc.burnS) {
        inc.smokeAccum += dt
        if (inc.smokeAccum >= 0.15) {
          inc.smokeAccum = 0
          for (const tip of inc.tipWorldPos) {
            this.addParticle(this.smokeGeo, 0xedf2f7, {
              x: tip.x + randRange(-0.02, 0.02),
              y: tip.y + 0.02,
              z: tip.z + randRange(-0.02, 0.02),
              vx: randRange(-0.1, 0.1),
              vy: randRange(0.45, 0.72),
              vz: randRange(-0.1, 0.1),
              gravity: -0.05,
              life: 1.5,
              startScale: 0.28,
              endScale: 1.0,
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

    // 6. Update expanding floor rings (click ripple & khấn aura)
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

    // 8. Update 3D particles
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
      p.vy -= p.gravity * dt
      p.mesh.position.x += p.vx * dt
      p.mesh.position.y = Math.max(0.04, p.mesh.position.y + p.vy * dt)
      p.mesh.position.z += p.vz * dt
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
