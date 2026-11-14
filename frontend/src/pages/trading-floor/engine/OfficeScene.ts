import * as Phaser from "phaser"
import {
  appDialogOpen,
  commands,
  logChat,
  openInteract,
  typing,
  ui,
  world,
} from "../bridge.ts"
import { formatIndex, formatPercent } from "../net/market/format.ts"
import {
  heatColour,
  heatPct,
  heatPrice,
  marketWeather,
} from "../net/market/heat.ts"
import type { IndexQuote, Quote } from "../net/market/types.ts"
import { PRICE_COLORS, indexTone } from "../net/market/tone.ts"
import {
  isSelf,
  presence,
  sendEmote,
  sendState,
  startPresence,
} from "../net/presence.ts"
import { floorSocket } from "../net/socket.ts"
import {
  type Facing,
  type LeaderRow,
  type Peer,
  type PostCard,
  type Profile,
  type RitualStats,
  normalizeAvatarId,
} from "../net/types.ts"
import {
  ASSET_ROOT,
  type CharacterArt,
  type FrameArt,
  type Manifest,
  type WalkArt,
  walkAnimKey,
} from "./assets.ts"
import { Avatar, DEPTH_LABEL, facingOf } from "./Avatar.ts"
import {
  BOARDS,
  NAV_CELL,
  PLACEMENTS,
  RECEPTIONIST,
  SIDE,
  SPAWN,
  WALK_SPEED,
  WALL_H,
  WORLD_H,
  WORLD_W,
  ZONE_LABELS,
  type Interact,
  type Placement,
} from "./layout.ts"
import { NavGrid, type Point } from "./nav.ts"
import { drawPlaceholder } from "./placeholders.ts"
import { evictTintedArt, getTintedCharacterArt } from "./tintArt.ts"

const DEPTH = {
  FLOOR: -10_000,
  CARPET: -9_500,
  FLAT: -9_000,
  DECAL: -8_800,
  WALL: -8_000,
  WALL_DECOR: -7_900,
}
const FONT = '"Be Vietnam Pro", system-ui, sans-serif'
/** Generated floor texture and the size of one tile in world units. */
const FLOOR_TILES = "floor-tiles"
const FLOOR_TILE = 64
const TEXT_RES = 3
const NEAR = 84
const SEND_EVERY_MS = 100
/** Thần Tài greets whoever walks into this circle in front of the shrine (world px). */
const GREET = { x: 1024, y: 500, r: 210, leave: 260, gapMs: 2600 }
const GREETINGS = [
  (n: string) => `Chào ${n}! Chúc danh mục xanh rực, lệnh nào cũng khớp!`,
  (n: string) => `${n} đến rồi! Thần Tài chúc tiền vô như nước!`,
  (n: string) => `Chào ${n}, chúc phát tài phát lộc!`,
  (n: string) => `A, ${n}! Gieo một quẻ lấy hên đầu phiên nhé!`,
]

interface Hot {
  rect: Phaser.Geom.Rectangle
  interact: Interact
  depth: number
}

interface RemotePeer {
  avatar: Avatar
  charId: string
  color: string
  /** Reported positions not yet walked through, oldest first: the figure retraces the real route. */
  path: Point[]
  /** Facing as last reported (used while standing). */
  facing: Facing
  /** As last reported. */
  moving: boolean
  /** Scene time of the last report. */
  at: number
}

/** A walking peer reports every 100 ms; this long without a word means they stopped (lost packet, hidden tab). */
const PEER_STALE_MS = 700
/** A remote figure trails the reports by about this much walking, enough to ride out network jitter. */
const PEER_BUFFER_S = 0.14
/** A report this far from the last one is a jump (reconnect, respawn): the figure is moved there at once. */
const PEER_TELEPORT = 260
/** Unused walk sheets and recoloured outfits are freed this long after the last figure wearing them left. */
const ART_SWEEP_MS = 20_000

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v))

/** Keys move the player and open things only when nothing in the HTML is using them. */
function keysFree(): boolean {
  return !ui.panel.get() && !typing() && !appDialogOpen()
}


export class OfficeScene extends Phaser.Scene {
  private readonly manifest: Manifest
  private readonly nav = new NavGrid(WORLD_W, WORLD_H, NAV_CELL)
  private readonly hots: Hot[] = []
  private readonly interacts: Interact[] = []
  private readonly peers = new Map<string, RemotePeer>()
  private player: Avatar | null = null
  private playerArt: { charId: string; color: string } | null = null
  /** Walk sheets per character: loaded the first time someone on the floor wears that character. */
  private readonly walkLoads = new Map<string, Promise<void>>()
  private loadChain: Promise<void> = Promise.resolve()
  /** Figures per `character|outfit` on the floor right now, for freeing art nobody wears. */
  private readonly artUse = new Map<string, number>()
  private readonly tinted = new Set<string>()
  /** Recoloured outfits that are built: their wearers no longer need the original walk sheets. */
  private readonly tintReady = new Set<string>()
  private sweepTimer: Phaser.Time.TimerEvent | null = null
  private path: Point[] = []
  private pending: Interact | null = null
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {}
  private last = { t: 0, facing: "s" as Facing, moving: false }
  private hintKey = ""
  private userZoom = 1
  private ledTiles: {
    sym: Phaser.GameObjects.Text
    price: Phaser.GameObjects.Text
    pct: Phaser.GameObjects.Text
    x: number
    y: number
  }[] = []
  private ledGfx!: Phaser.GameObjects.Graphics
  private ledIndex!: Phaser.GameObjects.Text
  private ledTileSize = { w: 0, h: 0 }
  private postLines: Phaser.GameObjects.Text[] = []
  private readonly disposers: (() => void)[] = []
  private disposed = false
  private statues: {
    img: Phaser.GameObjects.Image
    name: Phaser.GameObjects.Text
    sub: Phaser.GameObjects.Text
    base: number
  }[] = []
  private shrineCounter!: Phaser.GameObjects.Text
  private shrineGlow!: Phaser.GameObjects.Image
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter
  /** Thần Tài on the shrine when his art exists, and who he has already greeted. */
  private deity: Avatar | null = null
  private readonly nearDeity = new Set<string>()
  private greetQueue: string[] = []
  private deityFreeAt = 0

  constructor(manifest: Manifest) {
    super("office")
    this.manifest = manifest
  }

  preload(): void {
    this.load.setPath(ASSET_ROOT)
    const seen = new Set<string>()
    const image = (f: { file: string }): void => {
      if (seen.has(f.file)) return
      seen.add(f.file)
      this.load.image(f.file, f.file)
    }
    for (const p of Object.values(this.manifest.props)) image(p)
    // Only standing frames, statues and Thần Tài's wave load up front. A character's walk sheets (about
    // 34 MB of pixels each) load when someone on the floor wears it: see ensureWalks.
    for (const c of Object.values(this.manifest.characters)) {
      Object.values(c.idle).forEach(image)
      if (c.statue) image(c.statue)
      for (const w of Object.values(c.actions ?? {}).flatMap((a) =>
        Object.values(a)
      )) {
        if (seen.has(w.file)) continue
        seen.add(w.file)
        this.load.spritesheet(w.file, w.file, {
          frameWidth: w.cell,
          frameHeight: w.cell,
        })
      }
    }
  }

  create(): void {
    this.makeTextures()
    this.makeAnims()
    this.buildRoom()
    this.buildBoards()
    for (const p of PLACEMENTS) this.place(p)
    this.buildShrine()
    this.buildStatues()
    this.buildPeople()
    this.buildLabels()
    this.setupInput()
    this.setupCamera()
    this.bindData()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.dispose())
    ui.ready.set(true)
  }

  /** Detaches everything this scene hung on the bridge stores, the socket and the window. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const off of this.disposers.splice(0)) off()
  }

  // ---------- art helpers ----------

  private prop(key: string) {
    const p = this.manifest.props[key]
    return p && this.textures.exists(p.file) ? p : undefined
  }

  private readonly fallbackCharacter: CharacterArt = {
    idle: { s: { file: "char-placeholder", density: 1, anchor: [32, 108] } },
    walk: {},
  }

  /** Manifest key of the art an avatar id is drawn with (unknown ids fall back like `character`). */
  private characterId(id: string): string {
    const chars = this.manifest.characters
    const normalized = normalizeAvatarId(id) ?? id
    if (chars[normalized]) return normalized
    if (chars[id]) return id
    if (chars.male01) return "male01"
    return Object.keys(chars)[0] ?? ""
  }

  private character(id: string): CharacterArt {
    return (
      this.manifest.characters[this.characterId(id)] ?? this.fallbackCharacter
    )
  }

  // ---------- art on demand ----------

  /** Loads a character's walk sheets once; loads run one batch at a time through the scene loader. */
  private ensureWalks(id: string): Promise<void> {
    const charId = this.characterId(id)
    const existing = this.walkLoads.get(charId)
    if (existing) return existing
    const art = this.manifest.characters[charId]
    if (!art) return Promise.resolve()
    const job = (this.loadChain = this.loadChain.then(() =>
      this.loadSheets(Object.values(art.walk))
    )).then(() => {
      if (this.sys.isActive()) this.makeWalkAnims(art)
    })
    this.walkLoads.set(charId, job)
    return job
  }

  private loadSheets(sheets: WalkArt[]): Promise<void> {
    const missing = sheets.filter((w) => !this.textures.exists(w.file))
    if (!missing.length || !this.sys.isActive()) return Promise.resolve()
    return new Promise((resolve) => {
      this.load.setPath(ASSET_ROOT)
      for (const w of missing)
        this.load.spritesheet(w.file, w.file, {
          frameWidth: w.cell,
          frameHeight: w.cell,
        })
      // COMPLETE fires after failures too; a figure without its walk just glides.
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve())
      this.load.start()
    })
  }

  /** Someone on the floor now wears this character and outfit. */
  private useArt(charId: string, color: string): void {
    const key = `${charId}|${color}`
    this.artUse.set(key, (this.artUse.get(key) ?? 0) + 1)
  }

  private releaseArt(charId: string, color: string): void {
    const key = `${charId}|${color}`
    const n = (this.artUse.get(key) ?? 0) - 1
    if (n > 0) this.artUse.set(key, n)
    else this.artUse.delete(key)
    this.scheduleSweep()
  }

  private scheduleSweep(): void {
    this.sweepTimer?.remove()
    this.sweepTimer = this.time.delayedCall(ART_SWEEP_MS, () => this.sweepArt())
  }

  /** Frees walk sheets and recoloured outfits that no figure on the floor uses any more. */
  private sweepArt(): void {
    this.sweepTimer = null
    // A character's original sheets stay while someone wears its default outfit or waits for a recolour.
    const usedChars = new Set(
      [...this.artUse.keys()]
        .filter((k) => k.endsWith("|default") || !this.tintReady.has(k))
        .map((k) => k.split("|")[0])
    )
    for (const [charId, art] of Object.entries(this.manifest.characters)) {
      if (usedChars.has(charId) || !Object.keys(art.walk).length) continue
      let freed = false
      for (const w of Object.values(art.walk)) {
        const key = walkAnimKey(w)
        if (this.anims.exists(key)) this.anims.remove(key)
        if (this.textures.exists(w.file)) {
          this.textures.remove(w.file)
          freed = true
        }
      }
      if (freed || this.walkLoads.has(charId)) this.walkLoads.delete(charId)
    }
    for (const key of [...this.tinted]) {
      if (this.artUse.has(key)) continue
      const [charId, color] = key.split("|")
      evictTintedArt(this, charId, color)
      this.tinted.delete(key)
      this.tintReady.delete(key)
    }
  }

  /**
   * Gives a figure its walk (and recoloured outfit) once they are ready. `current` says whether the
   * figure is still on the floor wearing this art when the async work finishes.
   */
  private async dress(
    avatar: Avatar,
    avatarId: string,
    color: string,
    current: () => boolean
  ): Promise<void> {
    const charId = this.characterId(avatarId)
    await this.ensureWalks(charId)
    if (!this.sys.isActive() || !current() || color === "default") return
    const key = `${charId}|${color}`
    this.tinted.add(key)
    const tinted = await getTintedCharacterArt(
      this,
      charId,
      this.character(charId),
      color as Profile["color"]
    )
    if (!this.sys.isActive()) return
    if (current()) avatar.setArt(tinted)
    const walks = Object.values(tinted.walk)
    if (walks.length && walks.every((w) => w.file.startsWith("tint:"))) {
      this.tintReady.add(key)
      this.scheduleSweep()
    }
  }

  private makeTextures(): void {
    const radial = (
      key: string,
      size: number,
      stops: [number, string][]
    ): void => {
      if (this.textures.exists(key)) return
      const tex = this.textures.createCanvas(key, size, size)!
      const ctx = tex.getContext()
      const g = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
      )
      for (const [at, colour] of stops) g.addColorStop(at, colour)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, size, size)
      tex.refresh()
    }
    radial("shadow", 64, [
      [0, "rgba(0,0,0,0.75)"],
      [0.6, "rgba(0,0,0,0.35)"],
      [1, "rgba(0,0,0,0)"],
    ])
    radial("glow", 256, [
      [0, "rgba(255,224,130,0.95)"],
      [0.35, "rgba(255,190,80,0.45)"],
      [1, "rgba(255,160,40,0)"],
    ])
    radial("spark", 24, [
      [0, "rgba(255,255,230,1)"],
      [0.35, "rgba(255,214,110,0.9)"],
      [1, "rgba(255,170,40,0)"],
    ])
    if (!this.textures.exists("shade")) {
      const tex = this.textures.createCanvas("shade", 4, 64)!
      const ctx = tex.getContext()
      const g = ctx.createLinearGradient(0, 0, 0, 64)
      g.addColorStop(0, "rgba(20,12,6,0.5)")
      g.addColorStop(1, "rgba(20,12,6,0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 4, 64)
      tex.refresh()
    }
    this.makeFloorTiles()
    if (!this.textures.exists("char-placeholder")) {
      const tex = this.textures.createCanvas("char-placeholder", 64, 112)!
      const c = tex.getContext()
      c.lineWidth = 2
      c.strokeStyle = "#2a1a10"
      // Legs
      c.fillStyle = "#2c3340"
      c.fillRect(21, 78, 9, 28)
      c.strokeRect(21, 78, 9, 28)
      c.fillRect(34, 78, 9, 28)
      c.strokeRect(34, 78, 9, 28)
      // Torso
      c.fillStyle = "#22345e"
      c.beginPath()
      c.roundRect(16, 42, 32, 38, 8)
      c.fill()
      c.stroke()
      // Tie accent
      c.fillStyle = "#d9ab45"
      c.fillRect(30, 45, 4, 22)
      // Head
      c.fillStyle = "#f1c6a2"
      c.beginPath()
      c.arc(32, 26, 13, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      tex.refresh()
    }
  }

  /**
   * Polished ceramic floor: a 4 x 4 block of tiles (each a slightly different shade, with a soft bevel
   * and fine speckle) that repeats over the floor. Drawn at 2x so the grout stays crisp when zoomed in.
   */
  private makeFloorTiles(): void {
    if (this.textures.exists(FLOOR_TILES)) return
    const px = FLOOR_TILE * 2
    const n = 4
    const tex = this.textures.createCanvas(FLOOR_TILES, px * n, px * n)!
    const c = tex.getContext()
    let seed = 7
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const grout = 3
    c.fillStyle = "#9c8466"
    c.fillRect(0, 0, px * n, px * n)
    for (let row = 0; row < n; row += 1)
      for (let col = 0; col < n; col += 1) {
        const x = col * px + grout / 2
        const y = row * px + grout / 2
        const s = px - grout
        const shade = Math.round((rand() - 0.5) * 14)
        const base = [226 + shade, 211 + shade, 186 + shade]
        const g = c.createLinearGradient(x, y, x + s, y + s)
        g.addColorStop(0, `rgb(${base[0] + 8},${base[1] + 8},${base[2] + 8})`)
        g.addColorStop(1, `rgb(${base[0] - 10},${base[1] - 10},${base[2] - 12})`)
        c.fillStyle = g
        c.fillRect(x, y, s, s)
        // Soft marble veins.
        c.strokeStyle = "rgba(150,120,90,0.10)"
        c.lineWidth = 1.2
        for (let v = 0; v < 2; v += 1) {
          c.beginPath()
          let vx = x + rand() * s
          let vy = y
          c.moveTo(vx, vy)
          while (vy < y + s) {
            vx = Math.max(x, Math.min(x + s, vx + (rand() - 0.5) * 22))
            vy += 10 + rand() * 14
            c.lineTo(vx, Math.min(vy, y + s))
          }
          c.stroke()
        }
        // Speckle.
        for (let k = 0; k < 26; k += 1) {
          c.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(110,85,60,0.10)"
          c.fillRect(x + rand() * s, y + rand() * s, 1.6, 1.6)
        }
        // Bevel: light on the top and left edge, shade on the bottom and right.
        c.fillStyle = "rgba(255,255,255,0.35)"
        c.fillRect(x, y, s, 2)
        c.fillRect(x, y, 2, s)
        c.fillStyle = "rgba(90,66,40,0.22)"
        c.fillRect(x, y + s - 2, s, 2)
        c.fillRect(x + s - 2, y, 2, s)
      }
    tex.refresh()
  }

  private makeAnims(): void {
    const make = (w: WalkArt, repeat: number): void => {
      const key = walkAnimKey(w)
      if (this.anims.exists(key)) return
      const meanMs =
        w.durationsMs.reduce((a, b) => a + b, 0) / w.durationsMs.length
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(w.file, {
          start: 0,
          end: w.frames - 1,
        }),
        frameRate: 1000 / meanMs,
        repeat,
      })
    }
    for (const c of Object.values(this.manifest.characters)) {
      for (const w of Object.values(c.walk))
        if (this.textures.exists(w.file)) make(w, -1)
      for (const a of Object.values(c.actions ?? {}))
        for (const w of Object.values(a)) make(w, 0)
    }
  }

  private makeWalkAnims(c: CharacterArt): void {
    for (const w of Object.values(c.walk)) {
      const key = walkAnimKey(w)
      if (this.anims.exists(key) || !this.textures.exists(w.file)) continue
      const meanMs =
        w.durationsMs.reduce((a, b) => a + b, 0) / w.durationsMs.length
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(w.file, {
          start: 0,
          end: w.frames - 1,
        }),
        frameRate: 1000 / meanMs,
        repeat: -1,
      })
    }
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number,
    colour: string,
    weight = "600"
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: weight,
      color: colour,
      resolution: TEXT_RES,
    })
  }

  // ---------- room ----------

  private buildRoom(): void {
    // Tiled ceramic floor (the texture is drawn at 2x, hence the half tile scale).
    this.add
      .tileSprite(0, WALL_H, WORLD_W, WORLD_H - WALL_H, FLOOR_TILES)
      .setOrigin(0)
      .setTileScale(0.5)
      .setDepth(DEPTH.FLOOR)
    const wall = this.prop("wall")
    if (wall) {
      this.add
        .tileSprite(0, 0, WORLD_W, WALL_H, wall.file)
        .setOrigin(0)
        .setTileScale(1 / wall.density, WALL_H / wall.world[1] / wall.density)
        .setDepth(DEPTH.WALL)
    } else {
      this.add
        .rectangle(0, 0, WORLD_W, WALL_H, 0x6aa9d8)
        .setOrigin(0)
        .setDepth(DEPTH.WALL)
    }
    this.add
      .image(0, WALL_H, "shade")
      .setOrigin(0)
      .setDisplaySize(WORLD_W, 34)
      .setDepth(DEPTH.FLAT + 1)

    const carpet = this.prop("carpet")
    const cx = 1024 - 64
    if (carpet) {
      this.add
        .tileSprite(cx, 470, 128, WORLD_H - SIDE - 470, carpet.file)
        .setOrigin(0)
        .setTileScale(1 / carpet.density)
        .setDepth(DEPTH.CARPET)
    }

    // Side and front walls; the front wall has the entrance in the middle.
    const g = this.add.graphics().setDepth(DEPTH.WALL + 1)
    g.fillStyle(0x2c1d12)
      .fillRect(0, 0, SIDE, WORLD_H)
      .fillRect(WORLD_W - SIDE, 0, SIDE, WORLD_H)
    g.fillRect(0, WORLD_H - SIDE, 936, SIDE).fillRect(
      1112,
      WORLD_H - SIDE,
      WORLD_W - 1112,
      SIDE
    )
    g.fillStyle(0xd9ab45)
      .fillRect(SIDE - 3, WALL_H, 3, WORLD_H - WALL_H)
      .fillRect(WORLD_W - SIDE, WALL_H, 3, WORLD_H - WALL_H)
    g.fillRect(0, WORLD_H - SIDE, 936, 3).fillRect(
      1112,
      WORLD_H - SIDE,
      WORLD_W - 1112,
      3
    )
    g.fillStyle(0x1a120c).fillRect(936, WORLD_H - 10, 176, 10)

    this.nav.blockRect(0, 0, WORLD_W, WALL_H + 36)
    this.nav.blockRect(0, 0, SIDE + 14, WORLD_H)
    this.nav.blockRect(WORLD_W - SIDE - 14, 0, SIDE + 14, WORLD_H)
    this.nav.blockRect(0, WORLD_H - SIDE - 10, WORLD_W, SIDE + 10)
  }

  private addHot(
    rect: Phaser.Geom.Rectangle,
    interact: Interact,
    depth: number
  ): void {
    this.hots.push({ rect, interact, depth })
    if (
      !this.interacts.some(
        (i) =>
          i.kind === interact.kind &&
          i.access.x === interact.access.x &&
          i.access.y === interact.access.y
      )
    ) {
      this.interacts.push(interact)
    }
  }

  private place(p: Placement): void {
    if (p.id.startsWith("statue-")) return // built by buildStatues
    if (p.id === "thantai" && this.manifest.characters.thantai) return // an animated figure, built by buildShrine
    const art = p.art ? this.prop(p.art) : undefined
    const depth = p.flat ? DEPTH.FLAT : p.y
    let rect: Phaser.Geom.Rectangle
    if (art) {
      const img = this.add
        .image(p.x, p.y, art.file)
        .setOrigin(art.origin?.[0] ?? 0.5, art.origin?.[1] ?? 1)
        .setScale((p.scale ?? 1) / art.density)
        .setDepth(depth)
      img.setData("placement", p.id)
      rect = img.getBounds()
    } else if (p.placeholder) {
      const g = this.add.graphics({ x: p.x, y: p.y }).setDepth(depth)
      drawPlaceholder(g, p.placeholder, p.w, p.h)
      rect = new Phaser.Geom.Rectangle(p.x - p.w / 2, p.y - p.h, p.w, p.h)
    } else {
      return
    }
    if (p.foot)
      this.nav.blockRect(
        p.x - p.foot[0] / 2,
        p.y - p.foot[1],
        p.foot[0],
        p.foot[1]
      )
    if (p.interact) this.addHot(rect, p.interact, depth)
  }

  // ---------- wall boards ----------

  private buildBoards(): void {
    const { led, saco } = BOARDS
    const g = this.add.graphics().setDepth(DEPTH.WALL_DECOR)
    const frame = (
      b: { x: number; y: number; w: number; h: number },
      body: number,
      screen: number
    ): void => {
      const x = b.x - b.w / 2
      const y = b.y - b.h / 2
      g.fillStyle(0x000000, 0.28).fillRoundedRect(x + 6, y + 8, b.w, b.h, 10)
      g.fillStyle(body).fillRoundedRect(x, y, b.w, b.h, 10)
      g.lineStyle(3, 0xd9ab45, 1).strokeRoundedRect(x, y, b.w, b.h, 10)
      g.fillStyle(screen).fillRoundedRect(x + 12, y + 12, b.w - 24, b.h - 24, 6)
    }

    // LED market wall: VN30 heatmap, 10 × 3 tiles.
    frame(led, 0x3a2716, 0x0b0f17)
    const left = led.x - led.w / 2 + 22
    const top = led.y - led.h / 2 + 18
    const innerW = led.w - 44
    this.text(
      left + 2,
      top,
      "IQX · BẢNG ĐIỆN VN30",
      12,
      "#e3b341",
      "800"
    ).setDepth(DEPTH.WALL_DECOR + 1)
    this.ledIndex = this.text(
      left + innerW - 2,
      top,
      "Đang tải…",
      12,
      "#e8ecf4",
      "700"
    )
      .setOrigin(1, 0)
      .setDepth(DEPTH.WALL_DECOR + 1)
    this.ledGfx = this.add.graphics().setDepth(DEPTH.WALL_DECOR + 0.5)
    const cols = 10
    const rows = 3
    const gap = 4
    const gridTop = top + 22
    const tileW = (innerW - gap * (cols - 1)) / cols
    const tileH = (led.y + led.h / 2 - 16 - gridTop - gap * (rows - 1)) / rows
    this.ledTileSize = { w: tileW, h: tileH }
    for (let i = 0; i < cols * rows; i += 1) {
      const x = left + (i % cols) * (tileW + gap)
      const y = gridTop + Math.floor(i / cols) * (tileH + gap)
      const cx = x + tileW / 2
      const t = (
        dy: number,
        size: number,
        weight: string
      ): Phaser.GameObjects.Text =>
        this.text(cx, y + dy, "", size, "#ffffff", weight)
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.WALL_DECOR + 1)
      this.ledTiles.push({
        sym: t(2, 12, "800"),
        price: t(17, 10, "600"),
        pct: t(29, 10, "600"),
        x,
        y,
      })
    }
    this.addHot(
      new Phaser.Geom.Rectangle(
        led.x - led.w / 2,
        led.y - led.h / 2,
        led.w,
        led.h
      ),
      led.interact,
      DEPTH.WALL_DECOR
    )

    // SACO NHẬN ĐỊNH board: the three newest headlines of today
    frame(saco, 0x14244a, 0x0d1830)
    const sx = saco.x - saco.w / 2
    const sy = saco.y - saco.h / 2
    g.fillStyle(0xd9ab45).fillRoundedRect(saco.x - 120, sy - 14, 240, 32, 8)
    this.text(saco.x, sy + 2, "SACO NHẬN ĐỊNH", 16, "#131a28", "800")
      .setOrigin(0.5)
      .setDepth(DEPTH.WALL_DECOR + 1)
    for (let i = 0; i < 3; i += 1) {
      this.postLines.push(
        this.text(sx + 28, sy + 34 + i * 36, "", 14, "#e8ecf4").setDepth(
          DEPTH.WALL_DECOR + 1
        )
      )
    }
    this.text(
      saco.x + saco.w / 2 - 26,
      sy + saco.h - 32,
      "Chạm để xem chi tiết ›",
      11,
      "#e3b341"
    )
      .setOrigin(1, 0)
      .setDepth(DEPTH.WALL_DECOR + 1)
    this.addHot(
      new Phaser.Geom.Rectangle(sx, sy - 14, saco.w, saco.h + 14),
      saco.interact,
      DEPTH.WALL_DECOR
    )
  }

  private updateLedIndex(indices: IndexQuote[] | null): void {
    const q = indices?.find((x) => x.code === "VNINDEX")
    if (!q) return void this.ledIndex.setText("VN-Index —").setColor("#93a0b8")
    const w = marketWeather(q)
    this.ledIndex
      .setText(
        `VN-Index ${formatIndex(q.value)} ${formatPercent(q.pct)} · ${w.icon} ${w.label}`
      )
      .setColor(PRICE_COLORS[indexTone(q)])
  }

  private updateLedTiles(rows: Quote[] | null): void {
    const g = this.ledGfx.clear()
    const { w, h } = this.ledTileSize
    this.ledTiles.forEach((tile, i) => {
      const q = rows?.[i]
      if (!q) {
        g.fillStyle(0x1a2335).fillRoundedRect(tile.x, tile.y, w, h, 4)
        tile.sym.setText(rows ? "" : "·")
        tile.price.setText("")
        tile.pct.setText("")
        return
      }
      const { bg, fg } = heatColour(q)
      g.fillStyle(Number.parseInt(bg.slice(1), 16)).fillRoundedRect(
        tile.x,
        tile.y,
        w,
        h,
        4
      )
      tile.sym.setText(q.symbol).setColor(fg)
      tile.price.setText(heatPrice(q.price)).setColor(fg)
      tile.pct.setText(heatPct(q.pct)).setColor(fg)
    })
  }

  /** Up to three newest headlines as `SACO name: headline`, cut with an ellipsis to the board width. */
  private updatePosts(posts: PostCard[]): void {
    const maxWidth = BOARDS.saco.w - 24 - 56
    this.postLines.forEach((line, i) => {
      const post = posts[i]
      if (post)
        return void this.fitText(
          line,
          `${post.sacoName}: ${post.headline}`,
          maxWidth
        ).setColor("#e8ecf4")
      if (i === 0 && !posts.length)
        return void line
          .setText("Chưa có nhận định hôm nay")
          .setColor("#93a0b8")
      line.setText("")
    })
  }

  /** Sets `value` and, while it is wider than `maxWidth`, trims it and adds an ellipsis. */
  private fitText(
    obj: Phaser.GameObjects.Text,
    value: string,
    maxWidth: number
  ): Phaser.GameObjects.Text {
    obj.setText(value)
    if (obj.width <= maxWidth) return obj
    let lo = 0
    let hi = value.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      obj.setText(`${value.slice(0, mid).trimEnd()}…`)
      if (obj.width <= maxWidth) lo = mid
      else hi = mid - 1
    }
    return obj.setText(`${value.slice(0, lo).trimEnd()}…`)
  }

  // ---------- shrine ----------

  private buildShrine(): void {
    const statue = this.children.list.find(
      (o) => o.getData?.("placement") === "thantai"
    ) as Phaser.GameObjects.Image | undefined
    const p = PLACEMENTS.find((x) => x.id === "thantai")!
    this.shrineGlow = this.add
      .image(p.x, p.y - p.h * 0.55, "glow")
      .setScale(1.9)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(p.y - 1)
    this.tweens.add({
      targets: this.shrineGlow,
      alpha: 0.78,
      scale: 2.05,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    })
    const art = this.manifest.characters.thantai
    if (art) {
      // Thần Tài is a character on the shrine: he waves at visitors (greetVisitors) and at a good omen.
      this.deity = new Avatar(this, art, p.x, p.y, "s", {
        name: "Thần Tài",
        kind: "npc",
        tag: false,
        height: 182,
        shadow: [110, 24],
        bubble: "right",
      })
      if (p.foot)
        this.nav.blockRect(
          p.x - p.foot[0] / 2,
          p.y - p.foot[1],
          p.foot[0],
          p.foot[1]
        )
      if (p.interact)
        this.addHot(
          new Phaser.Geom.Rectangle(p.x - p.w / 2, p.y - 176, p.w, 176),
          p.interact,
          p.y
        )
    } else if (statue) {
      // A slow breath, so the statue feels alive without an animation sheet.
      const sy = statue.scaleY
      this.tweens.add({
        targets: statue,
        scaleY: sy * 1.007,
        duration: 2200,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      })
    }
    this.sparks = this.add
      .particles(p.x, p.y - 30, "spark", {
        x: { min: -80, max: 80 },
        y: { min: -10, max: 30 },
        speedY: { min: -38, max: -14 },
        speedX: { min: -8, max: 8 },
        lifespan: { min: 1800, max: 3200 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.9, end: 0 },
        frequency: 260,
        blendMode: "ADD",
      })
      .setDepth(p.y + 100)
    this.shrineCounter = this.text(p.x, 18, "", 15, "#ffe7a3", "700")
      .setOrigin(0.5, 0)
      .setBackgroundColor("rgba(60,14,10,0.78)")
      .setPadding(12, 5, 12, 5)
      .setDepth(DEPTH.WALL_DECOR + 2)
  }

  private updateShrine(stats: RitualStats | null): void {
    const n = stats?.total ?? 0
    this.shrineCounter.setText(
      n
        ? `🙏 ${n} lượt khấn cho phiên ${stats!.session.slice(8)}/${stats!.session.slice(5, 7)}`
        : "🙏 Thần Tài · Gieo quẻ đầu phiên"
    )
  }

  private celebrate(luck: number): void {
    this.deity?.act("wave")
    this.sparks.explode(18 + luck * 8)
    this.tweens.add({
      targets: this.shrineGlow,
      alpha: 1,
      scale: 2.6,
      duration: 260,
      yoyo: true,
      ease: "Quad.easeOut",
    })
  }

  // ---------- hall of fame ----------

  private buildStatues(): void {
    for (const rank of [1, 2, 3]) {
      const p = PLACEMENTS.find((x) => x.id === `statue-${rank}`)!
      // `top` is where the statue stands; `face` is the middle of the podium's front, for the name.
      let top = p.y - p.h + 4
      let face = p.y - p.h * 0.6 + 8
      const art = this.prop("podium")
      if (art) {
        const podium = this.add
          .image(p.x, p.y, art.file)
          .setOrigin(art.origin?.[0] ?? 0.5, art.origin?.[1] ?? 1)
          .setScale(1 / art.density)
          .setDepth(p.y)
        // A round podium seen from 22° above: its top face is an ellipse 0.375 × width tall.
        const lid = podium.displayWidth * 0.375
        top = p.y - podium.displayHeight + lid / 2
        face = (p.y - podium.displayHeight + lid + p.y) / 2
      } else {
        const g = this.add.graphics({ x: p.x, y: p.y }).setDepth(p.y)
        drawPlaceholder(g, p.placeholder ?? "podium", p.w, p.h)
      }
      if (p.foot)
        this.nav.blockRect(
          p.x - p.foot[0] / 2,
          p.y - p.foot[1],
          p.foot[0],
          p.foot[1]
        )
      const base = rank === 1 ? 1.1 : 1
      const img = this.add.image(p.x, top, "__WHITE").setDepth(p.y + 0.5)
      const medal = ["🥇", "🥈", "🥉"][rank - 1]
      const name = this.text(p.x, face, "", 12, "#2a1a08", "800")
        .setOrigin(0.5, 0.5)
        .setDepth(p.y + 1)
      const sub = this.text(p.x, p.y + 6, "", 12, "#ffe7a3", "700")
        .setOrigin(0.5, 0)
        .setBackgroundColor("rgba(12,17,27,0.6)")
        .setPadding(6, 2, 6, 2)
        .setDepth(DEPTH_LABEL + p.y)
      this.text(p.x, top - 104 * base - 34, medal, 22, "#ffffff")
        .setOrigin(0.5, 1)
        .setDepth(p.y + 1)
      this.statues.push({ img, name, sub, base })
      const rect = new Phaser.Geom.Rectangle(
        p.x - p.w / 2,
        top - 110 * base,
        p.w,
        p.y - top + 110 * base
      )
      this.addHot(rect, p.interact!, p.y)
    }
    this.updateStatues([])
  }

  private updateStatues(rows: LeaderRow[]): void {
    this.statues.forEach((s, i) => {
      const row = rows[i]
      const art = this.character(row?.avatar ?? "male01").statue
      if (art) {
        s.img.setVisible(true)
        this.setFrame(s.img, art, s.base)
      } else {
        s.img.setVisible(false)
      }
      if (row) {
        s.img.setAlpha(1).clearTint()
        s.name.setText(
          row.name.length > 14 ? `${row.name.slice(0, 13)}…` : row.name
        )
        s.sub.setText(`${row.correct}/${row.total} lần đúng`)
      } else {
        s.img.setAlpha(0.35).setTint(0x8a8f99)
        s.name.setText("Còn trống")
        s.sub.setText("Dự đoán đúng để lên tượng")
      }
    })
  }

  private setFrame(
    img: Phaser.GameObjects.Image,
    art: FrameArt,
    base: number
  ): void {
    const src = this.textures.get(art.file).getSourceImage() as {
      width: number
      height: number
    }
    img
      .setTexture(art.file)
      .setOrigin(art.anchor[0] / src.width, art.anchor[1] / src.height)
      .setScale(base / art.density)
  }

  // ---------- people ----------

  private buildPeople(): void {
    const r = RECEPTIONIST
    const art = this.character(r.art)
    new Avatar(this, art, r.x, r.y, r.facing, { name: r.name, kind: "npc" })
    const desk = PLACEMENTS.find((p) => p.id === "reception")!
    this.addHot(
      new Phaser.Geom.Rectangle(r.x - 28, r.y - 108, 56, 60),
      desk.interact!,
      r.y
    )
  }

  private buildLabels(): void {
    for (const l of ZONE_LABELS) {
      this.text(l.x, l.y, l.text, 18, "#7a4f1d", "800")
        .setOrigin(0.5)
        .setAlpha(0.55)
        .setDepth(DEPTH.DECAL)
    }
  }

  /** SPAWN, moved a little at random so visitors arriving together do not stand inside each other. */
  private spawnPoint(): typeof SPAWN {
    for (let i = 0; i < 12; i += 1) {
      const p = {
        ...SPAWN,
        x: SPAWN.x + Math.round((Math.random() * 2 - 1) * 90),
        y: SPAWN.y + Math.round(Math.random() * 40),
      }
      if (this.nav.free(p)) return p
    }
    return SPAWN
  }

  /**
   * The player's avatar. The first call puts it at the spawn point and starts presence there; a later
   * call (the profile was edited) swaps name, art and outfit in place, standing where the player stands.
   */
  private spawnPlayer(profile: Profile | null): void {
    if (!profile) return
    const baseArt = this.character(profile.avatar)
    const first = !this.player
    const at = this.player
      ? { x: this.player.x, y: this.player.y, facing: this.player.facing }
      : this.spawnPoint()
    this.player?.destroy()
    if (this.playerArt)
      this.releaseArt(this.playerArt.charId, this.playerArt.color)
    const created = new Avatar(this, baseArt, at.x, at.y, at.facing, {
      name: profile.name,
      kind: "self",
    })
    this.player = created
    this.playerArt = {
      charId: this.characterId(profile.avatar),
      color: profile.color,
    }
    this.useArt(this.playerArt.charId, profile.color)
    this.cameras.main.startFollow(created.sprite, true, 0.14, 0.14, 0, 40)
    void this.dress(
      created,
      profile.avatar,
      profile.color,
      () => this.player === created
    )
    if (first) {
      this.disposers.push(
        startPresence({ x: at.x, y: at.y, facing: at.facing, moving: false })
      )
      // The socket may have said `ready` before presence was listening: say hello now.
      if (floorSocket.status.get() === "online")
        floorSocket.send({
          type: "hello",
          x: at.x,
          y: at.y,
          facing: at.facing,
          moving: false,
        })
    }
  }

  private addPeer(p: Peer): void {
    if (isSelf(p.id)) return
    const previous = this.peers.get(p.id)
    if (previous) {
      previous.avatar.destroy()
      this.releaseArt(previous.charId, previous.color)
    }
    const charId = this.characterId(p.avatar)
    const avatar = new Avatar(this, this.character(p.avatar), p.x, p.y, p.facing, {
      name: p.name,
      kind: "peer",
    })
    this.useArt(charId, p.color)
    this.peers.set(p.id, {
      avatar,
      charId,
      color: p.color,
      path: [],
      facing: p.facing,
      moving: p.moving,
      at: this.time.now,
    })
    void this.dress(
      avatar,
      p.avatar,
      p.color,
      () => this.peers.get(p.id)?.avatar === avatar
    )
  }

  /** A peer edited name, avatar or outfit: redraw them where they stand. This account's own edit comes back here too. */
  private updatePeer(p: Peer): void {
    if (isSelf(p.id)) {
      const mine = ui.profile.get()
      if (
        !mine ||
        mine.name !== p.name ||
        mine.avatar !== p.avatar ||
        mine.color !== p.color
      ) {
        ui.profile.set({ name: p.name, avatar: p.avatar, color: p.color })
      }
      return
    }
    const peer = this.peers.get(p.id)
    if (!peer) return this.addPeer(p)
    const end = peer.path.at(-1) ?? peer.avatar
    this.addPeer({
      ...p,
      x: end.x,
      y: end.y,
      facing: peer.facing,
      moving: peer.moving,
    })
  }

  private removePeer(id: string): void {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.avatar.destroy()
    this.releaseArt(peer.charId, peer.color)
    this.peers.delete(id)
  }

  // ---------- input and camera ----------

  private setupInput(): void {
    const kb = this.input.keyboard
    if (kb) {
      // No key capture: HTML inputs on top of the game must still receive W, A, S, D and the arrows.
      this.keys = kb.addKeys(
        {
          up: "UP",
          down: "DOWN",
          left: "LEFT",
          right: "RIGHT",
          w: "W",
          a: "A",
          s: "S",
          d: "D",
        },
        false
      ) as Record<string, Phaser.Input.Keyboard.Key>
      const fire = (free: () => boolean) => (): void => {
        const h = ui.hint.get()
        if (h && free()) openInteract(h.kind, h.data)
      }
      // Enter belongs to the quick chat (QuickChat.tsx); E opens what the player stands next to.
      kb.on("keydown-E", fire(keysFree))
    }
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.player || ui.panel.get() || appDialogOpen()) return
      const hot = this.hotAt(pointer.worldX, pointer.worldY)
      if (hot) this.goInteract(hot.interact)
      else this.walkTo({ x: pointer.worldX, y: pointer.worldY })
    })
    this.input.on(
      "wheel",
      (_p: unknown, _o: unknown, _dx: number, dy: number) => {
        this.userZoom = clamp(this.userZoom * (dy > 0 ? 0.9 : 1.1), 0.6, 1.8)
        this.applyZoom()
      }
    )
  }

  private hotAt(x: number, y: number): Hot | undefined {
    let best: Hot | undefined
    for (const h of this.hots)
      if (h.rect.contains(x, y) && (!best || h.depth > best.depth)) best = h
    return best
  }

  private marker(x: number, y: number): void {
    const ring = this.add
      .ellipse(x, y, 34, 14)
      .setStrokeStyle(2.5, 0xffd76a, 1)
      .setDepth(DEPTH.DECAL + 1)
    this.tweens.add({
      targets: ring,
      scale: 1.6,
      alpha: 0,
      duration: 520,
      ease: "Quad.easeOut",
      onComplete: () => ring.destroy(),
    })
  }

  private walkTo(target: Point, then: Interact | null = null): void {
    if (!this.player) return
    this.path = this.nav.findPath(
      { x: this.player.x, y: this.player.y },
      target
    )
    this.pending = then
    if (this.path.length)
      this.marker(
        this.path[this.path.length - 1].x,
        this.path[this.path.length - 1].y
      )
    else if (then) this.arrive()
  }

  private goInteract(i: Interact): void {
    if (!this.player) return
    if (
      Math.hypot(this.player.x - i.access.x, this.player.y - i.access.y) < 30
    ) {
      this.path = []
      this.pending = i
      this.arrive()
      return
    }
    this.walkTo(i.access, i)
  }

  private arrive(): void {
    const i = this.pending
    this.pending = null
    if (!i || !this.player) return
    this.player.set(i.face, false)
    openInteract(i.kind, i.data)
  }

  private setupCamera(): void {
    const cam = this.cameras.main
    cam.setBounds(0, 0, WORLD_W, WORLD_H)
    cam.setBackgroundColor("#0c111b")
    cam.centerOn(1024, 640)
    this.applyZoom()
    this.scale.on("resize", () => this.applyZoom())
  }

  applyZoom(): void {
    const dpr = window.devicePixelRatio || 1
    const cssW = this.scale.width / dpr
    const cssH = this.scale.height / dpr
    // About 1000 × 640 world units on a laptop. Phones get about 640 units across, and the view never
    // shows past the room (a tall portrait screen would otherwise see the void under the floor).
    let base = clamp(Math.min(cssW / 1000, cssH / 640), 0.5, 1.5)
    if (cssW < 600) base = Math.max(base, cssW / 640)
    base = Math.max(base, cssW / WORLD_W, cssH / WORLD_H)
    this.cameras.main.setZoom(base * this.userZoom * dpr)
  }

  // ---------- data ----------

  private bindData(): void {
    this.updateLedIndex(world.indices.get())
    this.updateLedTiles(world.vn30.get())
    this.updateShrine(world.ritual.get())
    this.updatePosts(world.posts.get())
    this.updateStatues(world.leaders.get())
    this.disposers.push(
      world.indices.subscribe((v) => this.updateLedIndex(v)),
      world.vn30.subscribe((v) => this.updateLedTiles(v)),
      world.ritual.subscribe((v) => this.updateShrine(v)),
      world.leaders.subscribe((v) => this.updateStatues(v)),
      world.posts.subscribe((v) => this.updatePosts(v))
    )

    this.spawnPlayer(ui.profile.get())
    this.disposers.push(ui.profile.subscribe((p) => this.spawnPlayer(p)))

    // Leaving the tab or window: keys held down never see their key-up (the player would walk on by
    // itself), and a hidden tab stops sending, so tell everyone we stopped.
    const pause = (): void => {
      this.input.keyboard?.resetKeys()
      const me = this.player
      if (me && this.last.moving) {
        this.path = []
        this.pending = null
        me.set(me.facing, false)
        sendState({ x: me.x, y: me.y, facing: me.facing, moving: false })
        this.last = { t: this.time.now, facing: me.facing, moving: false }
      }
    }
    const onHidden = (): void => {
      if (document.hidden) pause()
    }
    window.addEventListener("blur", pause)
    document.addEventListener("visibilitychange", onHidden)
    this.disposers.push(() => {
      window.removeEventListener("blur", pause)
      document.removeEventListener("visibilitychange", onHidden)
    })

    this.disposers.push(
      commands.on("emote", (text) => {
        this.player?.say(text)
        logChat(ui.profile.get()?.name ?? "Tôi", text, true)
        sendEmote(text)
      }),
      commands.on("celebrate", ({ luck }) => this.celebrate(luck)),
      commands.on("goTo", (kind) => {
        const target = this.interacts.find((i) => i.kind === kind)
        if (target) this.goInteract(target)
      }),
      presence.on("welcome", ({ peers }) => {
        for (const id of [...this.peers.keys()]) this.removePeer(id)
        peers.forEach((p) => this.addPeer(p))
      }),
      presence.on("join", (p) => this.addPeer(p)),
      presence.on("update", (p) => this.updatePeer(p)),
      presence.on("leave", ({ id }) => this.removePeer(id)),
      presence.on("state", (s) => {
        const peer = this.peers.get(s.id)
        if (!peer) return
        const end = peer.path.at(-1) ?? peer.avatar
        const jump = Math.hypot(s.x - end.x, s.y - end.y)
        if (jump > PEER_TELEPORT || peer.path.length > 40) {
          // Too far behind to walk it (reconnect, a long hidden tab): stand at the reported spot.
          peer.path = []
          peer.avatar.setPosition(s.x, s.y)
        } else if (jump > 0.5) {
          peer.path.push({ x: s.x, y: s.y })
        }
        peer.facing = s.facing
        peer.moving = s.moving
        peer.at = this.time.now
      }),
      presence.on("emote", ({ id, text }) => {
        if (isSelf(id)) return
        const avatar = this.peers.get(id)?.avatar
        avatar?.say(text)
        logChat(avatar?.name ?? "Ai đó", text, false)
      }),
      presence.on("ritual", (r) => this.celebrate(r.luck))
    )
  }

  // ---------- frame ----------

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000
    if (this.player) this.movePlayer(dt, delta, time)
    for (const peer of this.peers.values()) this.movePeer(peer, dt, delta)
    this.greetVisitors(time)
    this.updateHint()
  }

  /**
   * A remote figure retraces the reported route at walking pace, trailing the reports by a small buffer.
   * The pace eases up a little when it falls behind and down when it runs ahead of the buffer, and the
   * walk cycle runs at the same pace, so feet stay planted instead of skating between reports.
   */
  private movePeer(peer: RemotePeer, dt: number, delta: number): void {
    const a = peer.avatar
    let backlog = 0
    let px = a.x
    let py = a.y
    for (const p of peer.path) {
      backlog += Math.hypot(p.x - px, p.y - py)
      px = p.x
      py = p.y
    }
    const fresh = peer.moving && this.time.now - peer.at < PEER_STALE_MS
    const lagS = backlog / WALK_SPEED
    // Still reporting: hold about PEER_BUFFER_S of route in hand. Stopped: finish the route briskly.
    const pace = fresh
      ? clamp(1 + (lagS - PEER_BUFFER_S) * 1.6, 0.75, 1.6)
      : clamp(1 + lagS * 0.8, 1, 1.6)
    const speed = WALK_SPEED * pace
    let budget = speed * dt
    let x = a.x
    let y = a.y
    let facing: Facing | null = null
    while (budget > 0 && peer.path.length) {
      const t = peer.path[0]
      const dx = t.x - x
      const dy = t.y - y
      const d = Math.hypot(dx, dy)
      if (d > 0.5) facing = facingOf(dx, dy)
      if (d <= budget) {
        x = t.x
        y = t.y
        budget -= d
        peer.path.shift()
      } else {
        x += (dx / d) * budget
        y += (dy / d) * budget
        budget = 0
      }
    }
    const moved = x !== a.x || y !== a.y
    if (moved) a.setPosition(x, y)
    // Between two reports the legs keep going; a peer that went quiet (stop lost, tab hidden) stands.
    const walking = moved || fresh
    a.setSpeed(moved ? speed : WALK_SPEED)
    a.set(facing ?? (walking ? a.facing : peer.facing), walking)
    a.tick(delta)
  }

  /**
   * Whoever walks up to the shrine (the player or a peer) gets a wave and a greeting by name. Each
   * visitor is greeted once per visit: they must step back out of the circle to be greeted again.
   * Arrivals during a wave wait and are greeted together.
   */
  private greetVisitors(time: number): void {
    const deity = this.deity
    if (!deity) return
    const visitors: [string, Avatar][] = [...this.peers].map(([id, p]) => [
      id,
      p.avatar,
    ])
    if (this.player) visitors.push(["self", this.player])
    const present = new Set<string>()
    for (const [id, a] of visitors) {
      present.add(id)
      const d = Math.hypot(a.x - GREET.x, a.y - GREET.y)
      if (d < GREET.r && !this.nearDeity.has(id)) {
        this.nearDeity.add(id)
        this.greetQueue.push(a.name)
      } else if (d > GREET.leave) {
        this.nearDeity.delete(id)
      }
    }
    for (const id of this.nearDeity)
      if (!present.has(id)) this.nearDeity.delete(id)
    if (!this.greetQueue.length || time < this.deityFreeAt || deity.acting)
      return
    const names = [...new Set(this.greetQueue)]
    this.greetQueue = []
    const who =
      names.length > 3
        ? `${names.slice(0, 3).join(", ")} và mọi người`
        : names.join(", ")
    deity.act("wave")
    deity.say(GREETINGS[Math.floor(Math.random() * GREETINGS.length)](who))
    this.deityFreeAt = time + GREET.gapMs
  }

  private movePlayer(dt: number, delta: number, time: number): void {
    const me = this.player!
    const blocked = !keysFree()
    const k = this.keys
    let vx = 0
    let vy = 0
    if (!blocked && k.up) {
      vx =
        (k.right.isDown || k.d.isDown ? 1 : 0) -
        (k.left.isDown || k.a.isDown ? 1 : 0)
      vy =
        (k.down.isDown || k.s.isDown ? 1 : 0) -
        (k.up.isDown || k.w.isDown ? 1 : 0)
    }
    let facing = me.facing
    let moving = false
    let x = me.x
    let y = me.y
    if (vx || vy) {
      this.path = []
      this.pending = null
      const len = Math.hypot(vx, vy)
      const nx = x + (vx / len) * WALK_SPEED * dt
      const ny = y + (vy / len) * WALK_SPEED * dt
      if (this.nav.free({ x: nx, y: ny })) [x, y] = [nx, ny]
      else if (this.nav.free({ x: nx, y })) x = nx
      else if (this.nav.free({ x, y: ny })) y = ny
      facing = facingOf(vx, vy)
      // Pressing into a wall turns but does not walk.
      moving = x !== me.x || y !== me.y
    } else if (this.path.length && !blocked) {
      let budget = WALK_SPEED * dt
      while (budget > 0 && this.path.length) {
        const t = this.path[0]
        const dx = t.x - x
        const dy = t.y - y
        const d = Math.hypot(dx, dy)
        if (d > 0.5) facing = facingOf(dx, dy)
        if (d <= budget) {
          x = t.x
          y = t.y
          budget -= d
          this.path.shift()
        } else {
          x += (dx / d) * budget
          y += (dy / d) * budget
          budget = 0
        }
      }
      moving = this.path.length > 0
      if (!this.path.length) {
        me.setPosition(x, y)
        me.set(facing, false)
        this.arrive()
        facing = me.facing
      }
    }
    me.setPosition(x, y)
    me.set(facing, moving)
    me.tick(delta)

    const changed = moving !== this.last.moving || facing !== this.last.facing
    if (changed || (moving && time - this.last.t > SEND_EVERY_MS)) {
      sendState({ x, y, facing: me.facing, moving })
      this.last = { t: time, facing: me.facing, moving }
    }
  }

  private updateHint(): void {
    const me = this.player
    let best: Interact | null = null
    if (me) {
      let bestD = NEAR
      for (const i of this.interacts) {
        const d = Math.hypot(me.x - i.access.x, me.y - i.access.y)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
    }
    const key = best ? `${best.kind}:${best.access.x}:${best.access.y}` : ""
    if (key === this.hintKey) return
    this.hintKey = key
    ui.hint.set(
      best ? { kind: best.kind, label: best.label, data: best.data } : null
    )
  }
}
