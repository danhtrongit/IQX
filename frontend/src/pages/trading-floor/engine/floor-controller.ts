/**
 * Interactive 3D Trading Floor controller:
 * - WASD / Arrow 8-way movement with X/Y wall sliding + click-to-walk A* pathfinding
 * - Exact pointer-down priority (coin -> remote SACO peer -> interactive hotspot -> walkable floor)
 * - Smooth follow camera with wheel & pinch zoom + mobile auto-zoom
 * - Outbound presence sync (100ms throttle) + inbound remote peer waypoint smoothing
 * - Proximity hints (`NEAR = 84` + `E` shortcut), coin auto-grab (`< 40u` every 100ms),
 *   Thần Tài greetings/celebrations, and full `bridge.ts` / `floorFx` wiring.
 */
import * as THREE from "three"

import { createChibiCharacter } from "@/lib/chibi-3d/character-builder.ts"
import type { ChibiSceneHost } from "@/lib/chibi-3d/scene-host.ts"
import {
  facingToRadians,
  logicalToWorld,
  resolveOutfitHex,
  type ChibiAnimMode,
  type ChibiCharacterSpec,
  type ChibiRig,
} from "@/lib/chibi-3d/types.ts"

import {
  appDialogOpen,
  commands,
  logChat,
  needLogin,
  openInteract,
  typing,
  ui,
  world,
} from "../bridge.ts"
import { openDirectChat } from "../net/chat.ts"
import {
  floorFx,
  sendFx,
  sendRainGive,
  sendRainGrab,
  startFx,
} from "../net/fx.ts"
import {
  isOwnSaco,
  isSelf,
  presence,
  sendEmote,
  sendState,
  startPresence,
} from "../net/presence.ts"
import { floorSocket } from "../net/socket.ts"
import {
  RAIN_COIN_VALUE,
  RAIN_MAX,
  RAIN_MIN,
  nameBadges,
  normalizeAvatarId,
  type Facing,
  type Peer,
  type Profile,
} from "../net/types.ts"
import { FloorFx3D } from "./floor-fx-3d.ts"
import {
  FLOOR_WORLD_CONFIG,
  FloorWorld3D,
  buildFloorNavGrid,
  type VisitorSnapshot,
} from "./floor-world-3d.ts"
import { distanceVolume, playFx } from "./fx-sound.ts"
import {
  createChibiPortalDoor,
  type ChibiPortalDoor,
} from "@/pages/spaces/door-3d.ts"
import {
  DOOR_MAX_WALK_SECONDS,
  DOOR_STEP_THROUGH_S,
  DOOR_SWING_CLOSE_S,
  DOOR_SWING_OPEN_S,
  shouldAutoWalkToDoor,
} from "@/pages/spaces/door-transition.ts"

import {
  FLOOR_OFFICE_DOOR,
  SPAWN,
  WALK_SPEED,
  WORLD_H,
  WORLD_W,
  type Interact,
} from "./layout.ts"
import type { NavGrid, Point } from "./nav.ts"
import { OverlayLayer, type ScreenBox } from "./overlay-layer.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"

const FACINGS: readonly Facing[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"]
const NEAR = 84
const SEND_EVERY_MS = 100
const PEER_STALE_MS = 700
const PEER_BUFFER_S = 0.14
const PEER_TELEPORT = 260
const GRAB_CHECK_MS = 100
const GRAB_REACH = 40
const GRAB_RETRY_MS = 1500
const MIN_TOUCH_TARGET_PX = 44
const MAX_FULL_RATE_PEERS_LITE = 6
const FAR_PEER_DIST_LITE = 480
const VERY_FAR_PEER_DIST_LITE = 850
const FAR_PEER_DIST_DESKTOP = 900

type CharacterSpecWithLite = ChibiCharacterSpec & { lite?: boolean }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** 8-way logical facing for screen/floor delta `(dx, dy)` where `+y` is South. */
export function facingOf(dx: number, dy: number): Facing {
  const a = Math.atan2(dy, dx)
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
  return FACINGS[i]!
}

/**
 * Computes responsive zoom so desktop viewports frame LED board, Thần Tài altar, SACO board,
 * Lounge and Vinh danh without dead void bands, while portrait phones center tightly on the player.
 */
export function computeResponsiveZoom(
  userZoom: number,
  width: number,
  height: number,
  minFillZoom = 0.72
): number {
  const aspect = width / Math.max(1, height)
  const baseFactor = aspect < 0.72 ? 1.18 : aspect < 1.12 ? 1.04 : 0.94
  const floorZoom = clamp(minFillZoom * 0.96, 0.72, 1.35)
  return clamp(userZoom * baseFactor, floorZoom, 2.3)
}

/**
 * True when a Meta/Control/Alt key is pressed or released: macOS drops `keyup` of other held keys
 * while Command is down, so we clear all held movement keys whenever these modifiers are involved.
 */
export function isModifierResetEvent(e: {
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}): boolean {
  return (
    Boolean(e.metaKey || e.ctrlKey || e.altKey) ||
    e.code === "MetaLeft" ||
    e.code === "MetaRight" ||
    e.code === "ControlLeft" ||
    e.code === "ControlRight" ||
    e.code === "AltLeft" ||
    e.code === "AltRight"
  )
}

function keysFree(): boolean {
  return (
    !ui.panel.get() &&
    !ui.posts.get().open &&
    !ui.loginPrompt.get() &&
    !typing() &&
    !appDialogOpen()
  )
}

interface AnimOverride {
  mode: ChibiAnimMode
  startedAtS: number
  untilS: number
}

interface PlayerActor {
  rig: ChibiRig
  avatarId: string
  color: string
  name: string
  x: number
  y: number
  facing: Facing
  moving: boolean
  animOverride: AnimOverride | null
}

interface RemotePeerActor {
  id: string
  rig: ChibiRig
  avatarId: string
  color: string
  name: string
  x: number
  y: number
  facing: Facing
  reportedFacing: Facing
  moving: boolean
  speed: number
  path: Point[]
  reportedAtMs: number
  sacoId?: string
  animOverride: AnimOverride | null
  rigAccumDt: number
  rigInitialized: boolean
}

export interface FloorControllerOptions {
  /** Spawn player just inside the West portal door with open->close door animation. */
  arrivedViaDoor?: boolean
  /** Notified when player enters or leaves proximity of the Floor -> Office portal door. */
  onDoorHintChange?: (near: boolean) => void
  /** Invoked when the player clicks the 3D door or presses E while near it. */
  onDoorRequest?: () => void
}

interface FloorDoorExitState {
  phase: "walking" | "opening" | "entering" | "opening-skip" | "fading"
  phaseS: number
  walkElapsedS: number
  waypoints: Point[]
  startX: number
  startY: number
  onFadeStart: () => void
  fadeTriggered: boolean
}

interface FloorDoorArrivalState {
  stepActive: boolean
  elapsedS: number
  closeS: number
}

export class FloorController {
  private readonly host: ChibiSceneHost
  private readonly nav: NavGrid
  private readonly overlay: OverlayLayer
  private readonly world3d: FloorWorld3D
  private readonly fx3d: FloorFx3D
  private readonly officeDoor: ChibiPortalDoor
  private readonly options: FloorControllerOptions
  private readonly hotspotByRoot = new Map<THREE.Object3D, Interact>()
  private readonly hotspotRoots: THREE.Object3D[] = []

  private player: PlayerActor | null = null
  private selfSaco = false
  private presenceStarted = false
  private readonly peers = new Map<string, RemotePeerActor>()
  private path: Point[] = []
  private pending: Interact | null = null
  private readonly heldKeys = new Set<string>()
  private lastSent = { t: 0, facing: "s" as Facing, moving: false }
  private hintKey = ""
  private doorNear = false
  private pendingDoorArrival = false
  private doorExit: FloorDoorExitState | null = null
  private doorArrival: FloorDoorArrivalState | null = null
  private lastGrabCheckMs = 0
  private readonly recentGrab = new Map<string, number>()

  private userZoom = 1
  private elapsedS = 0
  private lastHoverRayMs = 0
  private readonly activeTouches = new Map<number, { x: number; y: number }>()
  private pinchStartDist = 0
  private pinchStartZoom = 1
  private pinchMoved = false
  private lastTouchDownMs = 0

  private readonly disposers: (() => void)[] = []
  private disposed = false

  constructor(
    host: ChibiSceneHost,
    container: HTMLElement,
    options: FloorControllerOptions = {}
  ) {
    this.host = host
    this.options = options
    this.pendingDoorArrival = Boolean(options.arrivedViaDoor)
    this.nav = buildFloorNavGrid()
    const doorObs = FLOOR_OFFICE_DOOR.obstacle
    this.nav.blockRect(doorObs.x, doorObs.y, doorObs.w, doorObs.h)

    this.overlay = new OverlayLayer(container)
    this.world3d = new FloorWorld3D(host.scene, this.overlay, {
      lite: host.lite,
    })
    this.fx3d = new FloorFx3D(host.scene, FLOOR_WORLD_CONFIG, this.overlay, {
      lite: host.lite,
    })

    // Attach procedural chibi portal door to the West side wall near Phòng chờ
    this.officeDoor = createChibiPortalDoor({
      signText: "VĂN PHÒNG NHÓM",
      signSubtext: "LỐI VÀO",
      openingWidth: 1.24,
      openingHeight: 1.72,
      frameDepth: 0.36,
      lite: host.lite,
    })
    const doorPt = logicalToWorld(
      FLOOR_OFFICE_DOOR.x + 8,
      FLOOR_OFFICE_DOOR.y,
      FLOOR_WORLD_CONFIG
    )
    this.officeDoor.group.position.set(doorPt.x, 0, doorPt.z)
    this.officeDoor.group.rotation.y = Math.PI / 2
    host.scene.add(this.officeDoor.group)

    for (const h of this.world3d.hotspots) {
      this.hotspotByRoot.set(h.root, h.interact)
      this.hotspotRoots.push(h.root)
    }

    this.applyZoom(true)
    if (this.pendingDoorArrival) {
      host.followLogical(
        FLOOR_OFFICE_DOOR.spawnInside.x,
        FLOOR_OFFICE_DOOR.spawnInside.y,
        true
      )
    } else {
      host.followLogical(1024, 580, true)
    }

    this.setupInput()
    this.bindWorldData()
    this.bindCommandsAndPresence()
    this.bindFx()
    this.disposers.push(startFx())

    host.start((dt, elapsedS) => this.tick(dt, elapsedS))

    // Pause background 3D loop while JoinScreen is open (renders 1 crisp initial frame for backdrop)
    if (!ui.profile.get()) {
      this.renderStaticBackdropFrame()
      host.setPaused(true)
    }
  }

  private createCharacterRig(
    avatarId: string,
    outfitColorHex: string | null
  ): ChibiRig {
    const spec: CharacterSpecWithLite = {
      avatarId,
      outfitColorHex,
      lite: this.host.lite,
    }
    return createChibiCharacter(spec)
  }

  /** Called by `ChibiSceneHost` ResizeObserver so framing stays filled across layout shifts. */
  handleResize(): void {
    if (this.disposed) return
    this.applyZoom(false)
  }

  /** Re-uploads procedural wall textures after WebGL context restoration. */
  handleContextRestored(): void {
    if (this.disposed) return
    this.world3d.refreshDynamicTextures()
    if (this.host.isPaused()) {
      this.renderStaticBackdropFrame()
    }
  }

  private renderStaticBackdropFrame(): void {
    if (this.disposed) return
    const projectLogical = (lx: number, ly: number, heightWorld: number) =>
      this.host.projectLogicalToScreen(lx, ly, heightWorld)
    this.world3d.update(0, this.elapsedS, projectLogical, this.overlay)
    this.host.renderOnce()
  }

  private effectiveZoom(): number {
    const { width, height } = this.host.getViewportSize()
    const minFillZoom = this.host.getClampBounds(1).minFillZoom
    return computeResponsiveZoom(this.userZoom, width, height, minFillZoom)
  }

  private applyZoom(instant = false): void {
    this.host.setZoom(this.effectiveZoom(), instant)
  }

  private setActorPosition(
    actor: { rig: ChibiRig; x: number; y: number },
    x: number,
    y: number
  ): void {
    actor.x = x
    actor.y = y
    const pt = logicalToWorld(x, y, FLOOR_WORLD_CONFIG)
    actor.rig.root.position.set(pt.x, 0, pt.z)
  }

  private spawnPoint(): { x: number; y: number; facing: Facing } {
    for (let i = 0; i < 12; i += 1) {
      const p = {
        x: SPAWN.x + Math.round((Math.random() * 2 - 1) * 56),
        y: SPAWN.y + Math.round(Math.random() * 28),
        facing: SPAWN.facing,
      }
      if (this.nav.free(p)) return p
    }
    return { ...SPAWN }
  }

  private spawnOrUpdatePlayer(profile: Profile | null): void {
    if (!profile || this.disposed) return
    const avatarId = normalizeAvatarId(profile.avatar) ?? "male01"
    const outfitHex = resolveOutfitHex(profile.color)

    if (this.player) {
      this.player.name = profile.name
      this.player.color = profile.color
      if (this.player.avatarId !== avatarId) {
        const { x, y, facing, moving, animOverride } = this.player
        this.host.scene.remove(this.player.rig.root)
        this.player.rig.dispose()
        const rig = this.createCharacterRig(avatarId, outfitHex)
        this.host.scene.add(rig.root)
        this.player = {
          rig,
          avatarId,
          color: profile.color,
          name: profile.name,
          x,
          y,
          facing,
          moving,
          animOverride,
        }
        this.setActorPosition(this.player, x, y)
      } else {
        this.player.rig.setOutfitColor(outfitHex)
      }
      this.overlay.setNameplate({
        id: "self",
        name: profile.name,
        kind: "self",
        badges: nameBadges(avatarId, this.selfSaco),
      })
      return
    }

    const arrivedViaDoor = this.pendingDoorArrival
    this.pendingDoorArrival = false
    const at = arrivedViaDoor
      ? {
          x: FLOOR_OFFICE_DOOR.spawnInside.x,
          y: FLOOR_OFFICE_DOOR.spawnInside.y,
          facing: FLOOR_OFFICE_DOOR.enterFace,
        }
      : this.spawnPoint()
    const rig = this.createCharacterRig(avatarId, outfitHex)
    this.host.scene.add(rig.root)
    this.player = {
      rig,
      avatarId,
      color: profile.color,
      name: profile.name,
      x: at.x,
      y: at.y,
      facing: at.facing,
      moving: false,
      animOverride: null,
    }
    this.setActorPosition(this.player, at.x, at.y)
    this.host.followLogical(at.x, at.y, true)
    if (arrivedViaDoor && !prefersReducedMotion()) {
      this.officeDoor.setOpenProgress(1)
      this.doorArrival = { stepActive: true, elapsedS: 0, closeS: 0 }
    } else {
      this.officeDoor.setOpenProgress(0)
    }
    this.overlay.setNameplate({
      id: "self",
      name: profile.name,
      kind: "self",
      badges: nameBadges(avatarId, this.selfSaco),
    })

    if (!this.presenceStarted) {
      this.presenceStarted = true
      this.disposers.push(
        startPresence({ x: at.x, y: at.y, facing: at.facing, moving: false })
      )
      if (floorSocket.status.get() === "online") {
        floorSocket.send({
          type: "hello",
          x: at.x,
          y: at.y,
          facing: at.facing,
          moving: false,
        })
      }
    }
  }

  private setSelfSaco(saco: boolean): void {
    if (this.selfSaco === saco) return
    this.selfSaco = saco
    if (this.player) {
      this.overlay.setNameplate({
        id: "self",
        name: this.player.name,
        kind: "self",
        badges: nameBadges(this.player.avatarId, saco),
      })
    }
  }

  private addPeer(p: Peer): void {
    if (isSelf(p.id) || this.disposed) return
    this.removePeer(p.id)
    const avatarId = normalizeAvatarId(p.avatar) ?? "male01"
    const rig = this.createCharacterRig(avatarId, resolveOutfitHex(p.color))
    this.host.scene.add(rig.root)
    const actor: RemotePeerActor = {
      id: p.id,
      rig,
      avatarId,
      color: p.color,
      name: p.name,
      x: p.x,
      y: p.y,
      facing: p.facing,
      reportedFacing: p.facing,
      moving: p.moving,
      speed: WALK_SPEED,
      path: [],
      reportedAtMs: performance.now(),
      sacoId: p.sacoId,
      animOverride: null,
      rigAccumDt: 0,
      rigInitialized: false,
    }
    this.setActorPosition(actor, p.x, p.y)
    this.peers.set(p.id, actor)
    this.overlay.setNameplate({
      id: p.id,
      name: p.name,
      kind: "peer",
      badges: nameBadges(avatarId, p.saco),
    })
  }

  private updatePeer(p: Peer): void {
    if (isSelf(p.id)) {
      this.setSelfSaco(Boolean(p.saco))
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
    const existing = this.peers.get(p.id)
    if (!existing) {
      this.addPeer(p)
      return
    }
    const avatarId = normalizeAvatarId(p.avatar) ?? "male01"
    existing.name = p.name
    existing.color = p.color
    existing.sacoId = p.sacoId
    if (existing.avatarId !== avatarId) {
      this.host.scene.remove(existing.rig.root)
      existing.rig.dispose()
      const rig = this.createCharacterRig(avatarId, resolveOutfitHex(p.color))
      this.host.scene.add(rig.root)
      existing.rig = rig
      existing.avatarId = avatarId
      existing.rigInitialized = false
      this.setActorPosition(existing, existing.x, existing.y)
    } else {
      existing.rig.setOutfitColor(resolveOutfitHex(p.color))
    }
    this.overlay.setNameplate({
      id: p.id,
      name: p.name,
      kind: "peer",
      badges: nameBadges(avatarId, p.saco),
    })
  }

  private removePeer(id: string): void {
    const peer = this.peers.get(id)
    if (!peer) return
    this.host.scene.remove(peer.rig.root)
    peer.rig.dispose()
    this.peers.delete(id)
    this.overlay.removeNameplate(id)
    this.overlay.removeBubble(id)
  }

  // ---------- Input & Hit-Testing ----------

  /** Clears all held movement keys and cancels any active click-to-walk target. */
  private stopMovementAndTarget(): void {
    this.heldKeys.clear()
    const hadWalk = this.path.length > 0 || this.pending !== null
    this.path = []
    this.pending = null
    const me = this.player
    if (me && (this.lastSent.moving || hadWalk || me.moving)) {
      me.moving = false
      sendState({ x: me.x, y: me.y, facing: me.facing, moving: false })
      this.lastSent = {
        t: performance.now(),
        facing: me.facing,
        moving: false,
      }
    }
  }

  private setupInput(): void {
    const dom = this.host.renderer.domElement

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isModifierResetEvent(e)) {
        this.heldKeys.clear()
        return
      }
      if (!keysFree() || this.doorExit) {
        this.heldKeys.clear()
        return
      }
      const code = e.code
      if (code === "KeyE") {
        if (e.repeat) return
        if (this.doorNear) {
          e.preventDefault()
          this.options.onDoorRequest?.()
          return
        }
        const hint = ui.hint.get()
        if (hint) {
          e.preventDefault()
          openInteract(hint.kind, hint.data)
        }
        return
      }
      if (
        code === "ArrowUp" ||
        code === "ArrowDown" ||
        code === "ArrowLeft" ||
        code === "ArrowRight"
      ) {
        e.preventDefault()
        this.heldKeys.add(code)
      } else if (
        code === "KeyW" ||
        code === "KeyA" ||
        code === "KeyS" ||
        code === "KeyD"
      ) {
        this.heldKeys.add(code)
      }
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (isModifierResetEvent(e)) {
        this.heldKeys.clear()
        return
      }
      this.heldKeys.delete(e.code)
    }

    const pauseMovement = (): void => {
      this.stopMovementAndTarget()
    }

    const onVisibility = (): void => {
      if (document.hidden) pauseMovement()
    }

    const onWheel = (e: WheelEvent): void => {
      if (
        ui.panel.get() ||
        ui.posts.get().open ||
        ui.loginPrompt.get() ||
        appDialogOpen()
      ) {
        return
      }
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.91 : 1.1
      this.userZoom = clamp(this.userZoom * factor, 0.72, 2.2)
      this.applyZoom(false)
    }

    const onPointerDown = (e: PointerEvent): void => {
      if (e.pointerType === "touch") {
        this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (this.activeTouches.size === 2) {
          const pts = [...this.activeTouches.values()]
          this.pinchStartDist = Math.hypot(
            pts[0]!.x - pts[1]!.x,
            pts[0]!.y - pts[1]!.y
          )
          this.pinchStartZoom = this.userZoom
          this.pinchMoved = true
          // Cancel a walk accidentally triggered by the first finger of a pinch gesture
          if (performance.now() - this.lastTouchDownMs < 180) {
            this.path = []
            this.pending = null
          }
          return
        }
        this.lastTouchDownMs = performance.now()
        this.pinchMoved = false
      } else if (e.button !== 0) {
        return
      }

      if (
        !this.player ||
        this.doorExit ||
        ui.panel.get() ||
        ui.posts.get().open ||
        ui.loginPrompt.get() ||
        appDialogOpen()
      ) {
        return
      }

      const rect = dom.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const groundPt = this.host.screenToLogical(e.clientX, e.clientY)

      // Priority 1: Unowned floor coin (screen proximity OR within 30 logical units)
      const coin =
        this.fx3d.coins.findCoinAtScreen(
          localX,
          localY,
          (lx, ly, h) => this.host.projectLogicalToScreen(lx, ly, h),
          28
        ) ??
        (groundPt
          ? this.fx3d.coins.findCoinNear(groundPt.x, groundPt.y, 30)
          : null)
      if (coin) {
        if (ui.guest.get()) {
          needLogin("Đăng nhập để nhặt lộc")
          return
        }
        this.walkTo({ x: coin.x, y: coin.y })
        return
      }

      // Priority 2: Remote SACO peer (figure or nameplate, ≥44 CSS px touch target)
      const sacoId = this.sacoAtScreen(localX, localY)
      if (sacoId) {
        void openDirectChat(sacoId)
        return
      }

      // Priority 3: Interactive 3D hotspot (portal door, boards, Thần Tài, altar, statues, reception)
      if (this.isDoorHitAtClient(e.clientX, e.clientY)) {
        this.options.onDoorRequest?.()
        return
      }
      const hot = this.hotAtClient(e.clientX, e.clientY)
      if (hot) {
        this.goInteract(hot)
        return
      }

      // Priority 4: Walkable floor
      if (groundPt) {
        this.walkTo({
          x: clamp(groundPt.x, 0, WORLD_W),
          y: clamp(groundPt.y, 0, WORLD_H),
        })
      }
    }

    const onPointerMove = (e: PointerEvent): void => {
      if (e.pointerType === "touch") {
        if (!this.activeTouches.has(e.pointerId)) return
        this.activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (this.activeTouches.size === 2 && this.pinchStartDist > 8) {
          const pts = [...this.activeTouches.values()]
          const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y)
          this.userZoom = clamp(
            this.pinchStartZoom * (dist / this.pinchStartDist),
            0.72,
            2.2
          )
          this.applyZoom(false)
        }
        return
      }

      if (
        !this.player ||
        ui.panel.get() ||
        ui.posts.get().open ||
        appDialogOpen()
      ) {
        dom.style.cursor = ""
        return
      }

      const nowMs = performance.now()
      if (nowMs - this.lastHoverRayMs < 48) return
      this.lastHoverRayMs = nowMs

      const rect = dom.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const groundPt = this.host.screenToLogical(e.clientX, e.clientY)

      const overCoin =
        this.fx3d.coins.findCoinAtScreen(
          localX,
          localY,
          (lx, ly, h) => this.host.projectLogicalToScreen(lx, ly, h),
          28
        ) !== null ||
        (groundPt !== null &&
          this.fx3d.coins.findCoinNear(groundPt.x, groundPt.y, 30) !== null)
      const overSaco = this.sacoAtScreen(localX, localY) !== null
      const overDoor = this.isDoorHitAtClient(e.clientX, e.clientY)
      const overHot = overDoor || this.hotAtClient(e.clientX, e.clientY) !== null
      dom.style.cursor = overCoin || overSaco || overHot ? "pointer" : ""
    }

    const onPointerUp = (e: PointerEvent): void => {
      if (e.pointerType === "touch") {
        this.activeTouches.delete(e.pointerId)
        if (this.activeTouches.size < 2 && this.pinchMoved) {
          this.pinchStartDist = 0
        }
      }
    }

    const onResize = (): void => this.applyZoom(false)

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", pauseMovement)
    window.addEventListener("pagehide", pauseMovement)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("resize", onResize)
    dom.addEventListener("wheel", onWheel, { passive: false })
    dom.addEventListener("pointerdown", onPointerDown)
    dom.addEventListener("pointermove", onPointerMove)
    dom.addEventListener("pointerup", onPointerUp)
    dom.addEventListener("pointercancel", onPointerUp)

    this.disposers.push(() => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", pauseMovement)
      window.removeEventListener("pagehide", pauseMovement)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("resize", onResize)
      dom.removeEventListener("wheel", onWheel)
      dom.removeEventListener("pointerdown", onPointerDown)
      dom.removeEventListener("pointermove", onPointerMove)
      dom.removeEventListener("pointerup", onPointerUp)
      dom.removeEventListener("pointercancel", onPointerUp)
    })
  }

  private expandBoxToMinTouch(box: ScreenBox): ScreenBox {
    const w = Math.max(box.w, MIN_TOUCH_TARGET_PX)
    const h = Math.max(box.h, MIN_TOUCH_TARGET_PX)
    const cx = box.x + box.w / 2
    const cy = box.y + box.h / 2
    return { x: cx - w / 2, y: cy - h / 2, w, h }
  }

  private pointInBox(px: number, py: number, box: ScreenBox): boolean {
    return (
      px >= box.x &&
      px <= box.x + box.w &&
      py >= box.y &&
      py <= box.y + box.h
    )
  }

  /** Front-most remote SACO peer whose figure or nameplate (≥44 CSS px target) contains `(localX, localY)`. */
  private sacoAtScreen(localX: number, localY: number): string | null {
    let found: { sacoId: string; depth: number } | null = null
    for (const peer of this.peers.values()) {
      if (!peer.sacoId || isOwnSaco(peer.sacoId)) continue
      const foot = this.host.projectLogicalToScreen(peer.x, peer.y, 0.05)
      const head = this.host.projectLogicalToScreen(
        peer.x,
        peer.y,
        peer.rig.headHeight
      )
      let hit = false
      if (foot.visible && head.visible) {
        const figH = Math.max(38, Math.abs(foot.y - head.y))
        const figW = Math.max(30, figH * 0.56)
        const figBox = this.expandBoxToMinTouch({
          x: (foot.x + head.x) / 2 - figW / 2,
          y: Math.min(head.y, foot.y),
          w: figW,
          h: figH,
        })
        if (this.pointInBox(localX, localY, figBox)) hit = true
      }
      if (!hit) {
        const tagBox = this.overlay.getNameplateBox(peer.id)
        if (
          tagBox &&
          this.pointInBox(localX, localY, this.expandBoxToMinTouch(tagBox))
        ) {
          hit = true
        }
      }
      if (hit && (!found || peer.y > found.depth)) {
        found = { sacoId: peer.sacoId, depth: peer.y }
      }
    }
    return found?.sacoId ?? null
  }

  /** True when the pointer ray hits the Floor -> Office 3D portal door mesh. */
  private isDoorHitAtClient(clientX: number, clientY: number): boolean {
    return (
      this.host.pickObjects(clientX, clientY, [this.officeDoor.hitTarget])
        .length > 0
    )
  }

  /**
   * Starts the animated exit through the Floor -> Office portal door:
   * - `prefers-reduced-motion`: immediate cross-fade callback, zero walk/swing animation.
   * - Reachable within ~4 s: auto-walk via `NavGrid`, swing open (~0.35 s), step through, fade.
   * - Blocked or > 4 s away: skip walk, swing open + fade immediately.
   */
  beginDoorExit(onFadeStart: () => void): void {
    if (this.disposed || this.doorExit) return
    this.doorArrival = null
    this.stopMovementAndTarget()
    this.setDoorNear(false)
    this.hintKey = ""
    ui.hint.set(null)

    const me = this.player
    if (prefersReducedMotion() || !me) {
      this.doorExit = {
        phase: "fading",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints: [],
        startX: me?.x ?? 0,
        startY: me?.y ?? 0,
        onFadeStart,
        fadeTriggered: true,
      }
      onFadeStart()
      return
    }

    const start = { x: me.x, y: me.y }
    const waypoints = this.nav.findPath(start, FLOOR_OFFICE_DOOR.access)
    const decision = shouldAutoWalkToDoor(
      start,
      FLOOR_OFFICE_DOOR.access,
      waypoints,
      WALK_SPEED,
      DOOR_MAX_WALK_SECONDS,
      32
    )

    if (decision.mode === "walk") {
      this.doorExit = {
        phase: "walking",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints,
        startX: me.x,
        startY: me.y,
        onFadeStart,
        fadeTriggered: false,
      }
      const dest = waypoints[waypoints.length - 1]
      if (dest) this.fx3d.spawnClickRing(dest.x, dest.y)
    } else if (decision.mode === "at-door") {
      me.facing = FLOOR_OFFICE_DOOR.face
      me.moving = false
      this.doorExit = {
        phase: "opening",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints: [],
        startX: me.x,
        startY: me.y,
        onFadeStart,
        fadeTriggered: false,
      }
    } else {
      this.doorExit = {
        phase: "opening-skip",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints: [],
        startX: me.x,
        startY: me.y,
        onFadeStart,
        fadeTriggered: false,
      }
    }
  }

  private setDoorNear(near: boolean): void {
    if (this.doorNear === near) return
    this.doorNear = near
    this.options.onDoorHintChange?.(near)
  }

  /** Resolves the closest raycasted 3D interactive hotspot under `(clientX, clientY)`. */
  private hotAtClient(clientX: number, clientY: number): Interact | null {
    const hits = this.host.pickObjects(clientX, clientY, this.hotspotRoots)
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        const interact = this.hotspotByRoot.get(obj)
        if (interact) return interact
        obj = obj.parent
      }
    }
    return null
  }

  private walkTo(target: Point, then: Interact | null = null): void {
    if (!this.player) return
    this.path = this.nav.findPath(
      { x: this.player.x, y: this.player.y },
      target
    )
    this.pending = then
    if (this.path.length) {
      const dest = this.path[this.path.length - 1]!
      this.fx3d.spawnClickRing(dest.x, dest.y)
    } else if (then) {
      this.arrive()
    }
  }

  private goInteract(interact: Interact): void {
    if (!this.player) return
    if (
      Math.hypot(
        this.player.x - interact.access.x,
        this.player.y - interact.access.y
      ) < 30
    ) {
      this.path = []
      this.pending = interact
      this.arrive()
      return
    }
    this.walkTo(interact.access, interact)
  }

  private arrive(): void {
    const interact = this.pending
    this.pending = null
    if (!interact || !this.player) return
    this.player.facing = interact.face
    this.player.moving = false
    openInteract(interact.kind, interact.data)
  }

  // ---------- Bridge, Presence & FX Subscriptions ----------

  private bindWorldData(): void {
    const refreshIfPaused = (): void => {
      if (this.host.isPaused()) this.renderStaticBackdropFrame()
    }
    const syncMarket = (): void => {
      this.world3d.updateMarket(world.indices.get(), world.vn30.get())
      refreshIfPaused()
    }
    syncMarket()
    this.world3d.updatePosts(world.posts.get())
    this.world3d.updateLeaderboard(world.leaderboard.get(), this.overlay)

    this.disposers.push(
      world.indices.subscribe(syncMarket),
      world.vn30.subscribe(syncMarket),
      world.posts.subscribe((posts) => {
        this.world3d.updatePosts(posts)
        refreshIfPaused()
      }),
      world.leaderboard.subscribe((board) => {
        this.world3d.updateLeaderboard(board, this.overlay)
        refreshIfPaused()
      })
    )
  }

  private bindCommandsAndPresence(): void {
    this.spawnOrUpdatePlayer(ui.profile.get())
    this.disposers.push(
      ui.panel.subscribe((panel) => {
        if (panel) this.stopMovementAndTarget()
      }),
      ui.posts.subscribe((posts) => {
        if (posts.open) this.stopMovementAndTarget()
      }),
      ui.loginPrompt.subscribe((prompt) => {
        if (prompt !== null) this.stopMovementAndTarget()
      }),
      ui.profile.subscribe((p) => {
        if (p) {
          this.spawnOrUpdatePlayer(p)
          this.host.setPaused(false)
        } else {
          this.renderStaticBackdropFrame()
          this.host.setPaused(true)
        }
      }),
      commands.on("emote", (text) => {
        if (this.player) {
          this.overlay.showBubble("self", text, "above")
        }
        logChat(ui.profile.get()?.name ?? "Tôi", text, true)
        sendEmote(text)
      }),
      commands.on("celebrate", ({ luck }) => {
        this.world3d.celebrate(luck, this.elapsedS)
      }),
      commands.on("goTo", (kind) => {
        const target = this.world3d.interacts.find((i) => i.kind === kind)
        if (target) this.goInteract(target)
      }),
      presence.on("welcome", ({ self, peers }) => {
        this.setSelfSaco(Boolean(self.saco))
        for (const id of [...this.peers.keys()]) this.removePeer(id)
        for (const p of peers) this.addPeer(p)
      }),
      presence.on("join", (p) => this.addPeer(p)),
      presence.on("update", (p) => this.updatePeer(p)),
      presence.on("leave", ({ id }) => this.removePeer(id)),
      presence.on("state", (s) => {
        const peer = this.peers.get(s.id)
        if (!peer) return
        const end = peer.path.at(-1) ?? peer
        const jump = Math.hypot(s.x - end.x, s.y - end.y)
        if (jump > PEER_TELEPORT || peer.path.length > 40) {
          peer.path = []
          this.setActorPosition(peer, s.x, s.y)
        } else if (jump > 0.5) {
          peer.path.push({ x: s.x, y: s.y })
        }
        peer.reportedFacing = s.facing
        peer.moving = s.moving
        peer.reportedAtMs = performance.now()
      }),
      presence.on("emote", ({ id, text }) => {
        if (isSelf(id)) return
        const peer = this.peers.get(id)
        if (peer) this.overlay.showBubble(id, text, "above")
        logChat(peer?.name ?? "Ai đó", text, false)
      })
    )
  }

  private bindFx(): void {
    this.disposers.push(
      commands.on("fx", (arg) => {
        if (
          arg.kind === "xaxui" ||
          arg.kind === "gay" ||
          arg.kind === "khan"
        ) {
          sendFx(arg.kind, "text" in arg ? arg.text : undefined)
        }
      }),
      commands.on("rainGive", (amount) => {
        if (amount < RAIN_MIN || amount > RAIN_MAX || amount % 10 !== 0) return
        const count = Math.round(amount / RAIN_COIN_VALUE)
        const spots: { x: number; y: number }[] = []
        if (this.player) {
          const { x, y } = this.player
          for (let i = 0; i < count; i += 1) {
            for (let attempt = 0; attempt < 50; attempt += 1) {
              const angle = Math.random() * Math.PI * 2
              const dist = 60 + Math.random() * 240
              const sx = clamp(x + Math.cos(angle) * dist, 40, 2008)
              const sy = clamp(y + Math.sin(angle) * dist, 260, 1368)
              if (this.nav.free({ x: sx, y: sy })) {
                spots.push({ x: sx, y: sy })
                break
              }
            }
          }
        }
        sendRainGive(amount, spots.length === count ? spots : undefined)
      }),
      floorFx.on("selfFx", (msg) => {
        const me = this.player
        if (!me) return
        const onAnim = (mode: ChibiAnimMode, durationS: number): void => {
          me.animOverride = {
            mode,
            startedAtS: this.elapsedS,
            untilS: this.elapsedS + durationS,
          }
        }
        if (msg.kind === "xaxui") {
          this.fx3d.playXaXui(me.x, me.y, {
            isSelf: true,
            soundVol: 1,
            onAnim,
          })
        } else if (msg.kind === "gay") {
          this.fx3d.playGay(me.x, me.y, me.name, msg.text ?? "", {
            isSelf: true,
            soundVol: 1,
          })
        } else if (msg.kind === "khan") {
          me.facing = "n"
          me.moving = false
          this.path = []
          this.pending = null
          sendState({ x: me.x, y: me.y, facing: "n", moving: false })
          this.lastSent = { t: performance.now(), facing: "n", moving: false }
          this.fx3d.playKhan(me.x, me.y, me.name, msg.text ?? "", {
            isSelf: true,
            soundVol: 1,
            onAnim,
            onCelebrate: (luck) => this.world3d.celebrate(luck, this.elapsedS),
          })
        }
      }),
      floorFx.on("fx", (msg) => {
        if (isSelf(msg.id)) return
        const peer = this.peers.get(msg.id)
        if (!peer) return
        const vol = distanceVolume(
          peer.x - (this.player?.x ?? 0),
          peer.y - (this.player?.y ?? 0)
        )
        const onAnim = (mode: ChibiAnimMode, durationS: number): void => {
          peer.animOverride = {
            mode,
            startedAtS: this.elapsedS,
            untilS: this.elapsedS + durationS,
          }
        }
        if (msg.kind === "xaxui") {
          this.fx3d.playXaXui(peer.x, peer.y, {
            isSelf: false,
            soundVol: vol,
            onAnim,
          })
        } else if (msg.kind === "gay") {
          this.fx3d.playGay(
            peer.x,
            peer.y,
            msg.name ?? peer.name,
            msg.text ?? "",
            { isSelf: false, soundVol: vol }
          )
        } else if (msg.kind === "khan") {
          this.fx3d.playKhan(
            peer.x,
            peer.y,
            msg.name ?? peer.name,
            msg.text ?? "",
            {
              isSelf: false,
              soundVol: vol,
              onAnim,
              onCelebrate: (luck) =>
                this.world3d.celebrate(luck, this.elapsedS),
            }
          )
        }
      }),
      floorFx.on("rainStart", (rain) => {
        const giver = rain.by
          ? isSelf(rain.by)
            ? this.player
            : this.peers.get(rain.by)
          : null
        if (giver) {
          this.fx3d.coins.playRainBurst(giver.x, giver.y)
          if (giver === this.player) {
            playFx("coins")
          } else if (this.player) {
            playFx(
              "coins",
              distanceVolume(giver.x - this.player.x, giver.y - this.player.y)
            )
          }
        }
        const mine = rain.by !== null && isSelf(rain.by)
        this.fx3d.coins.addRain(rain, mine)
      }),
      floorFx.on("rainTaken", (msg) => {
        this.fx3d.coins.takeCoin(msg.rainId, msg.coin, isSelf(msg.by), 10)
      }),
      floorFx.on("rainEnd", (msg) => {
        this.fx3d.coins.removeRain(msg.rainId)
      }),
      floorFx.on("rainReset", () => {
        this.recentGrab.clear()
        this.fx3d.coins.reset()
      })
    )
  }

  // ---------- Frame Loop ----------

  private tick(dt: number, elapsedS: number): void {
    if (this.disposed) return
    this.elapsedS = elapsedS
    const nowMs = performance.now()
    const reducedMotion = prefersReducedMotion()

    this.officeDoor.update(dt, elapsedS, reducedMotion)

    if (this.player) {
      if (this.doorExit) {
        this.stepDoorExit(this.player, dt, nowMs, reducedMotion)
      } else {
        if (this.doorArrival) {
          this.stepDoorArrival(this.player, dt, reducedMotion)
        }
        if (!this.doorArrival?.stepActive) {
          this.stepPlayer(this.player, dt, nowMs, reducedMotion)
        }
        this.checkCoinAutoGrab(this.player, nowMs)
      }
      this.host.followLogical(this.player.x, this.player.y)
    }

    // Prioritize near peers for full-rate animation and throttle far peers (especially in lite mode)
    const refX = this.player?.x ?? 1024
    const refY = this.player?.y ?? 540
    let fullRatePeers: Set<string> | null = null
    if (this.host.lite && this.peers.size > MAX_FULL_RATE_PEERS_LITE) {
      const ranked = [...this.peers.values()]
        .map((peer) => ({
          id: peer.id,
          dist: Math.hypot(peer.x - refX, peer.y - refY),
        }))
        .sort((a, b) => a.dist - b.dist)
      fullRatePeers = new Set(
        ranked.slice(0, MAX_FULL_RATE_PEERS_LITE).map((item) => item.id)
      )
    }

    for (const peer of this.peers.values()) {
      const dist = Math.hypot(peer.x - refX, peer.y - refY)
      let rigIntervalS = 0
      if (this.host.lite) {
        const withinQuota = fullRatePeers === null || fullRatePeers.has(peer.id)
        if (dist > VERY_FAR_PEER_DIST_LITE) {
          rigIntervalS = 0.2
        } else if (!withinQuota || dist > FAR_PEER_DIST_LITE) {
          rigIntervalS = 0.1
        }
      } else if (dist > FAR_PEER_DIST_DESKTOP) {
        rigIntervalS = 0.066
      }
      this.stepPeer(peer, dt, nowMs, reducedMotion, rigIntervalS)
    }

    // Update FX & apply brief local camera shake if active (suppressed under reduced-motion)
    this.fx3d.update(dt)
    const shake = reducedMotion
      ? { x: 0, y: 0, z: 0 }
      : this.fx3d.getCameraShakeOffset()
    this.host.setCameraShake(shake.x, shake.y, shake.z)

    // Update world NPCs, sparkles, statues & Thần Tài greetings
    const visitors: VisitorSnapshot[] = []
    for (const peer of this.peers.values()) {
      visitors.push({ id: peer.id, name: peer.name, x: peer.x, y: peer.y })
    }
    if (this.player) {
      visitors.push({
        id: "self",
        name: this.player.name,
        x: this.player.x,
        y: this.player.y,
      })
    }
    this.world3d.greetVisitors(nowMs, elapsedS, visitors, this.overlay)

    const projectLogical = (lx: number, ly: number, heightWorld: number) =>
      this.host.projectLogicalToScreen(lx, ly, heightWorld)

    this.world3d.update(dt, elapsedS, projectLogical, this.overlay)

    // Project all actor nameplates first so speech bubble avoidance has exact same-frame boxes
    const selfTop = this.player
      ? projectLogical(
          this.player.x,
          this.player.y,
          this.player.rig.headHeight + 0.14
        )
      : null
    if (this.player && selfTop) {
      this.overlay.positionNameplate("self", selfTop, this.player.y)
    }
    const peerTops: { id: string; pt: ReturnType<typeof projectLogical> }[] = []
    for (const peer of this.peers.values()) {
      const top = projectLogical(
        peer.x,
        peer.y,
        peer.rig.headHeight + 0.14
      )
      this.overlay.positionNameplate(peer.id, top, peer.y)
      peerTops.push({ id: peer.id, pt: top })
    }
    if (selfTop) {
      this.overlay.positionBubble("self", selfTop)
    }
    for (const { id, pt } of peerTops) {
      this.overlay.positionBubble(id, pt)
    }

    this.updateHint()
    this.overlay.update(dt * 1000, nowMs, projectLogical)
  }

  private resolveAnim(
    moving: boolean,
    override: AnimOverride | null
  ): { anim: ChibiAnimMode; activeOverride: AnimOverride | null } {
    if (override && this.elapsedS < override.untilS) {
      return { anim: override.mode, activeOverride: override }
    }
    return { anim: moving ? "walk" : "idle", activeOverride: null }
  }

  private stepPlayer(
    me: PlayerActor,
    dt: number,
    nowMs: number,
    reducedMotion: boolean
  ): void {
    const blocked = !keysFree()
    if (blocked && (this.path.length > 0 || this.pending !== null || this.heldKeys.size > 0)) {
      this.path = []
      this.pending = null
      this.heldKeys.clear()
    }
    let vx = 0
    let vy = 0
    if (!blocked) {
      vx =
        (this.heldKeys.has("ArrowRight") || this.heldKeys.has("KeyD") ? 1 : 0) -
        (this.heldKeys.has("ArrowLeft") || this.heldKeys.has("KeyA") ? 1 : 0)
      vy =
        (this.heldKeys.has("ArrowDown") || this.heldKeys.has("KeyS") ? 1 : 0) -
        (this.heldKeys.has("ArrowUp") || this.heldKeys.has("KeyW") ? 1 : 0)
    }

    let facing = me.facing
    let moving = false
    let x = me.x
    let y = me.y

    if (vx !== 0 || vy !== 0) {
      this.path = []
      this.pending = null
      const len = Math.hypot(vx, vy)
      const nx = x + (vx / len) * WALK_SPEED * dt
      const ny = y + (vy / len) * WALK_SPEED * dt
      if (this.nav.free({ x: nx, y: ny })) {
        x = nx
        y = ny
      } else if (this.nav.free({ x: nx, y })) {
        x = nx
      } else if (this.nav.free({ x, y: ny })) {
        y = ny
      }
      facing = facingOf(vx, vy)
      moving = x !== me.x || y !== me.y
    } else if (this.path.length > 0 && !blocked) {
      let budget = WALK_SPEED * dt
      while (budget > 0 && this.path.length > 0) {
        const target = this.path[0]!
        const dx = target.x - x
        const dy = target.y - y
        const d = Math.hypot(dx, dy)
        if (d > 0.5) facing = facingOf(dx, dy)
        if (d <= budget) {
          x = target.x
          y = target.y
          budget -= d
          this.path.shift()
        } else {
          x += (dx / d) * budget
          y += (dy / d) * budget
          budget = 0
        }
      }
      moving = this.path.length > 0
      if (this.path.length === 0) {
        this.setActorPosition(me, x, y)
        me.facing = facing
        me.moving = false
        this.arrive()
        facing = me.facing
      }
    }

    this.setActorPosition(me, x, y)
    me.facing = facing
    me.moving = moving

    const { anim, activeOverride } = this.resolveAnim(moving, me.animOverride)
    me.animOverride = activeOverride
    const animTime = activeOverride
      ? Math.max(0, this.elapsedS - activeOverride.startedAtS)
      : reducedMotion && anim === "idle"
        ? 0
        : undefined
    me.rig.update(dt, {
      anim,
      facingRad: facingToRadians(me.facing),
      moveFactor: reducedMotion ? 0 : moving ? 1 : 0,
      animTime,
    })

    const changed =
      moving !== this.lastSent.moving || me.facing !== this.lastSent.facing
    if (changed || (moving && nowMs - this.lastSent.t > SEND_EVERY_MS)) {
      sendState({ x, y, facing: me.facing, moving })
      this.lastSent = { t: nowMs, facing: me.facing, moving }
    }
  }

  private stepPeer(
    peer: RemotePeerActor,
    dt: number,
    nowMs: number,
    reducedMotion: boolean,
    rigIntervalS: number
  ): void {
    let backlog = 0
    let px = peer.x
    let py = peer.y
    for (const pt of peer.path) {
      backlog += Math.hypot(pt.x - px, pt.y - py)
      px = pt.x
      py = pt.y
    }

    const fresh = peer.moving && nowMs - peer.reportedAtMs < PEER_STALE_MS
    const lagS = backlog / WALK_SPEED
    const pace = fresh
      ? clamp(1 + (lagS - PEER_BUFFER_S) * 1.6, 0.75, 1.6)
      : clamp(1 + lagS * 0.8, 1, 1.6)
    const speed = WALK_SPEED * pace
    let budget = speed * dt
    let x = peer.x
    let y = peer.y
    let facing: Facing | null = null

    while (budget > 0 && peer.path.length > 0) {
      const target = peer.path[0]!
      const dx = target.x - x
      const dy = target.y - y
      const d = Math.hypot(dx, dy)
      if (d > 0.5) facing = facingOf(dx, dy)
      if (d <= budget) {
        x = target.x
        y = target.y
        budget -= d
        peer.path.shift()
      } else {
        x += (dx / d) * budget
        y += (dy / d) * budget
        budget = 0
      }
    }

    const moved = x !== peer.x || y !== peer.y
    if (moved) this.setActorPosition(peer, x, y)
    const walking = moved || fresh
    peer.speed = moved ? speed : WALK_SPEED
    peer.facing = facing ?? (walking ? peer.facing : peer.reportedFacing)

    const { anim, activeOverride } = this.resolveAnim(
      walking,
      peer.animOverride
    )
    peer.animOverride = activeOverride

    peer.rigAccumDt += dt
    if (
      peer.rigInitialized &&
      rigIntervalS > 0 &&
      !activeOverride &&
      peer.rigAccumDt < rigIntervalS
    ) {
      return
    }
    const stepDt = peer.rigAccumDt
    peer.rigAccumDt = 0
    peer.rigInitialized = true

    const animTime = activeOverride
      ? Math.max(0, this.elapsedS - activeOverride.startedAtS)
      : reducedMotion && anim === "idle"
        ? 0
        : undefined
    peer.rig.update(stepDt, {
      anim,
      facingRad: facingToRadians(peer.facing),
      moveFactor: reducedMotion
        ? 0
        : walking
          ? clamp(peer.speed / WALK_SPEED, 0.75, 1.4)
          : 0,
      animTime,
    })
  }

  private checkCoinAutoGrab(me: PlayerActor, nowMs: number): void {
    if (nowMs - this.lastGrabCheckMs < GRAB_CHECK_MS) return
    this.lastGrabCheckMs = nowMs
    if (ui.guest.get()) return
    this.fx3d.coins.forEachGrabbableCoin((coin) => {
      if (Math.hypot(me.x - coin.x, me.y - coin.y) < GRAB_REACH) {
        const key = `${coin.rainId}:${coin.index}`
        const last = this.recentGrab.get(key)
        if (last === undefined || nowMs - last > GRAB_RETRY_MS) {
          sendRainGrab(coin.rainId, coin.index)
          this.recentGrab.set(key, nowMs)
        }
      }
    })
  }

  private stepDoorExit(
    me: PlayerActor,
    dt: number,
    nowMs: number,
    reducedMotion: boolean
  ): void {
    const exit = this.doorExit
    if (!exit) return

    let moving = false
    if (exit.phase === "walking") {
      exit.walkElapsedS += dt
      let budget = WALK_SPEED * dt
      let x = me.x
      let y = me.y
      let facing = me.facing

      while (budget > 0 && exit.waypoints.length > 0) {
        const target = exit.waypoints[0]!
        const dx = target.x - x
        const dy = target.y - y
        const d = Math.hypot(dx, dy)
        if (d > 0.5) facing = facingOf(dx, dy)
        if (d <= budget) {
          x = target.x
          y = target.y
          budget -= d
          exit.waypoints.shift()
        } else {
          x += (dx / d) * budget
          y += (dy / d) * budget
          budget = 0
        }
      }

      this.setActorPosition(me, x, y)
      me.facing = facing
      moving = exit.waypoints.length > 0

      if (
        exit.waypoints.length === 0 ||
        exit.walkElapsedS >= DOOR_MAX_WALK_SECONDS + 0.5
      ) {
        me.facing = FLOOR_OFFICE_DOOR.face
        moving = false
        exit.phase = "opening"
        exit.phaseS = 0
        exit.startX = me.x
        exit.startY = me.y
      }
    } else if (exit.phase === "opening") {
      exit.phaseS += dt
      const progress = Math.min(1, exit.phaseS / DOOR_SWING_OPEN_S)
      this.officeDoor.setOpenProgress(progress)
      me.facing = FLOOR_OFFICE_DOOR.face
      if (exit.phaseS >= DOOR_SWING_OPEN_S) {
        exit.phase = "entering"
        exit.phaseS = 0
        exit.startX = me.x
        exit.startY = me.y
      }
    } else if (exit.phase === "entering") {
      exit.phaseS += dt
      const t = Math.min(1, exit.phaseS / DOOR_STEP_THROUGH_S)
      const x = exit.startX + (FLOOR_OFFICE_DOOR.through.x - exit.startX) * t
      const y = exit.startY + (FLOOR_OFFICE_DOOR.through.y - exit.startY) * t
      this.setActorPosition(me, x, y)
      me.facing = FLOOR_OFFICE_DOOR.face
      moving = t < 1
      if (exit.phaseS >= DOOR_STEP_THROUGH_S) {
        exit.phase = "fading"
        exit.phaseS = 0
        if (!exit.fadeTriggered) {
          exit.fadeTriggered = true
          exit.onFadeStart()
        }
      }
    } else if (exit.phase === "opening-skip") {
      exit.phaseS += dt
      const progress = Math.min(1, exit.phaseS / DOOR_SWING_OPEN_S)
      this.officeDoor.setOpenProgress(progress)
      if (!exit.fadeTriggered && exit.phaseS >= DOOR_SWING_OPEN_S * 0.55) {
        exit.fadeTriggered = true
        exit.onFadeStart()
      }
      if (exit.phaseS >= DOOR_SWING_OPEN_S) {
        exit.phase = "fading"
      }
    }

    me.moving = moving
    me.rig.update(dt, {
      anim: moving ? "walk" : "idle",
      facingRad: facingToRadians(me.facing),
      moveFactor: reducedMotion ? 0 : moving ? 1 : 0,
    })

    if (moving && nowMs - this.lastSent.t > SEND_EVERY_MS) {
      sendState({ x: me.x, y: me.y, facing: me.facing, moving: true })
      this.lastSent = { t: nowMs, facing: me.facing, moving: true }
    }
  }

  private stepDoorArrival(
    me: PlayerActor,
    dt: number,
    reducedMotion: boolean
  ): void {
    const arrival = this.doorArrival
    if (!arrival) return

    // Yield immediately to player input while letting the door finish swinging closed
    if (this.heldKeys.size > 0 || this.path.length > 0) {
      arrival.stepActive = false
    }

    arrival.elapsedS += dt
    const STEP_DELAY_S = 0.16
    const STEP_DUR_S = 0.24

    if (arrival.stepActive) {
      if (arrival.elapsedS >= STEP_DELAY_S) {
        const t = Math.min(1, (arrival.elapsedS - STEP_DELAY_S) / STEP_DUR_S)
        const sx = FLOOR_OFFICE_DOOR.spawnInside.x
        const sy = FLOOR_OFFICE_DOOR.spawnInside.y
        const tx = FLOOR_OFFICE_DOOR.access.x
        const ty = FLOOR_OFFICE_DOOR.access.y
        this.setActorPosition(me, sx + (tx - sx) * t, sy + (ty - sy) * t)
        me.facing = FLOOR_OFFICE_DOOR.enterFace
        me.moving = t < 1
        me.rig.update(dt, {
          anim: t < 1 ? "walk" : "idle",
          facingRad: facingToRadians(me.facing),
          moveFactor: reducedMotion ? 0 : t < 1 ? 1 : 0,
        })
        if (t >= 1) {
          arrival.stepActive = false
          me.moving = false
          sendState({ x: me.x, y: me.y, facing: me.facing, moving: false })
        }
      } else {
        me.rig.update(dt, {
          anim: "idle",
          facingRad: facingToRadians(FLOOR_OFFICE_DOOR.enterFace),
          moveFactor: 0,
        })
      }
    }

    if (arrival.elapsedS >= STEP_DELAY_S + 0.08) {
      arrival.closeS += dt
      const openLeft = Math.max(0, 1 - arrival.closeS / DOOR_SWING_CLOSE_S)
      this.officeDoor.setOpenProgress(openLeft)
      if (openLeft <= 0 && !arrival.stepActive) {
        this.doorArrival = null
      }
    }
  }

  private updateHint(): void {
    const me = this.player
    if (!me || this.doorExit) {
      this.setDoorNear(false)
      if (this.hintKey !== "") {
        this.hintKey = ""
        ui.hint.set(null)
      }
      return
    }

    let best: Interact | null = null
    let bestD = NEAR
    for (const i of this.world3d.interacts) {
      const d = Math.hypot(me.x - i.access.x, me.y - i.access.y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }

    const doorDist = Math.hypot(
      me.x - FLOOR_OFFICE_DOOR.access.x,
      me.y - FLOOR_OFFICE_DOOR.access.y
    )
    if (doorDist < FLOOR_OFFICE_DOOR.radius && doorDist <= bestD) {
      this.setDoorNear(true)
      if (this.hintKey !== "") {
        this.hintKey = ""
        ui.hint.set(null)
      }
      return
    }

    this.setDoorNear(false)
    const key = best ? `${best.kind}:${best.access.x}:${best.access.y}` : ""
    if (key === this.hintKey) return
    this.hintKey = key
    ui.hint.set(
      best ? { kind: best.kind, label: best.label, data: best.data } : null
    )
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.setDoorNear(false)
    for (const off of this.disposers.splice(0)) off()
    this.heldKeys.clear()
    this.activeTouches.clear()
    this.recentGrab.clear()
    if (this.player) {
      this.host.scene.remove(this.player.rig.root)
      this.player.rig.dispose()
      this.player = null
    }
    for (const id of [...this.peers.keys()]) this.removePeer(id)
    this.host.scene.remove(this.officeDoor.group)
    this.officeDoor.dispose()
    this.fx3d.dispose()
    this.world3d.dispose()
    this.overlay.dispose()
  }
}
