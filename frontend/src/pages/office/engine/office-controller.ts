/**
 * Interactive 3D Open-Floor Office controller (KGD camera & interaction language):
 * - Click/tap-to-move (`250 px/s`, golden ring) + click directly on own desk / boss desk /
 *   meeting table / archive shelf / standee to walk & open modal + WASD/Arrow keys via `event.code`
 *   (cleared on blur, visibilitychange hidden, Meta/Control, or modal open)
 * - `E` (`KeyE`) opens closest interactive station (`< 95 px`), `Esc` closes active modal
 * - KGD-style follow camera with cover default zoom (fills canvas, zero empty margins),
 *   wheel + two-finger pinch zoom (`0.72×..2.3×`), and HUD-aware horizontal clamping:
 *   - Desktop (`>= 1101px`, 330px HUD columns) & tablet (`721–1100px`, 290px HUD columns):
 *     offsets camera target horizontally so the player sits centered between HUD columns.
 *   - Phones (`<= 720px`): centers on the player below the collapsed top-right HUD cards.
 * - North-wall portal door (`Khu giao dịch`) with 3D hit-testing, proximity E hint, and
 *   walk -> swing-open -> step-through -> fade choreography.
 * - Renders ONLY online WebSocket members (+ self) — NEVER tied to attendance.
 */
import { createChibiCharacter } from "@/lib/chibi-3d/character-builder.ts"
import {
  runBuildChunked,
  runBuildSync,
  type BuildSteps,
  type ChunkedBuildOptions,
} from "@/lib/chibi-3d/chunked-build.ts"
import {
  computeCameraClampBounds,
  type ChibiSceneHost,
} from "@/lib/chibi-3d/scene-host.ts"
import {
  logicalToWorld,
  resolveOutfitHex,
  type ChibiRig,
} from "@/lib/chibi-3d/types.ts"

import {
  createChibiPortalDoor,
  type ChibiPortalDoor,
} from "@/pages/spaces/door-3d.ts"
import {
  DOOR_MAX_WALK_SECONDS,
  DOOR_STEP_THROUGH_S,
  DOOR_SWING_CLOSE_S,
  DOOR_SWING_OPEN_S,
  findOfficeDoorPath,
  shouldAutoWalkToDoor,
} from "@/pages/spaces/door-transition.ts"
import type { Point } from "@/pages/trading-floor/engine/nav.ts"

import type {
  OfficeAttendanceDisplayState,
  OfficeAttendanceToday,
  OfficeFacing,
  OfficeLeaderboard,
  OfficeMe,
  OfficeMeeting,
  OfficeOnlinePeer,
  OfficeRole,
  OfficeSelfStatePayload,
  OfficeStationAction,
} from "../types.ts"
import { monthNumberFromPeriod, resolveOfficeAvatarId } from "../utils.ts"
import {
  MAX_STAFF_DESKS,
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_DESK_DECLUTTER_RADIUS,
  OFFICE_STAFF_FALLBACK_SPAWN,
  OFFICE_STATION_RADIUS,
  OFFICE_WALK_SPEED,
  OFFICE_WORLD_SCALE,
  buildDeskPositions,
  buildOfficeObstacles,
  buildOfficeStations,
  computeOfficeDimensions,
  findClickedStation,
  findNearestStation,
  getOfficeExitDoor,
  moveWithSlide,
  officeFacingFromDelta,
  officeFacingToRadians,
  prefersReducedMotion,
  type OfficeDeskPlacement,
  type OfficeRect,
  type OfficeStation,
} from "./office-layout.ts"
import { OfficeWorld3D } from "./office-world-3d.ts"

export const OFFICE_CAMERA_FOV = 36
export const OFFICE_CAMERA_PITCH_DEG = 48
export const OFFICE_CAMERA_BASE_DISTANCE = 18.8
export const OFFICE_CAMERA_NORTH_MARGIN = 6.4
export const OFFICE_CAMERA_SOUTH_MARGIN = 0.85
export const OFFICE_DESKTOP_BREAKPOINT_PX = 1101
export const OFFICE_MOBILE_BREAKPOINT_PX = 720
export const OFFICE_DESKTOP_HUD_COL_PX = 330 + 14
export const OFFICE_TABLET_HUD_COL_PX = 290 + 14
export const OFFICE_MIN_ZOOM = 0.72
export const OFFICE_MAX_ZOOM = 2.3
export const OFFICE_DEFAULT_DESKTOP_ZOOM = 0.96
export const OFFICE_DEFAULT_MOBILE_ZOOM = 1.24

const ARRIVAL_PX = 4
const PEER_TELEPORT_PX = 280
const PEER_SMOOTH_RATE = 12
const HALF_FOV_TAN = Math.tan(((OFFICE_CAMERA_FOV / 2) * Math.PI) / 180)
const OFFICE_MAX_USER_ZOOM =
  OFFICE_MAX_ZOOM / Math.min(1, OFFICE_DEFAULT_DESKTOP_ZOOM)

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Computes the cover minimum zoom for a viewport + office world size so the pitched
 * PerspectiveCamera fills the entire canvas with zero empty margins.
 */
export function computeOfficeCoverMinZoom(
  viewportW: number,
  viewportH: number,
  worldW = OFFICE_BASE_W,
  worldH = OFFICE_BASE_H
): number {
  const aspect = Math.max(0.25, viewportW / Math.max(1, viewportH))
  const bounds = computeCameraClampBounds({
    roomW: worldW * OFFICE_WORLD_SCALE,
    roomH: worldH * OFFICE_WORLD_SCALE,
    baseDistance: OFFICE_CAMERA_BASE_DISTANCE,
    zoom: 1,
    fovDeg: OFFICE_CAMERA_FOV,
    pitchRad: (OFFICE_CAMERA_PITCH_DEG * Math.PI) / 180,
    aspect,
    boundsMargin: 0.6,
    northMargin: OFFICE_CAMERA_NORTH_MARGIN,
    southMargin: OFFICE_CAMERA_SOUTH_MARGIN,
  })
  return clamp(bounds.minFillZoom, OFFICE_MIN_ZOOM, 1.45)
}

/**
 * KGD-style responsive cover zoom:
 * - Default (`userZoom = 1.0`) frames the open floor cleanly in cover mode (fills canvas, no empty margins).
 * - Clamps strictly between `max(OFFICE_MIN_ZOOM, minFillZoom)` and `OFFICE_MAX_ZOOM` (`2.3×`).
 */
export function computeOfficeResponsiveZoom(
  userZoom: number,
  viewportW: number,
  viewportH: number,
  minFillZoom?: number
): number {
  const aspect = viewportW / Math.max(1, viewportH)
  const baseFactor =
    aspect < 0.72
      ? OFFICE_DEFAULT_MOBILE_ZOOM
      : aspect < 1.12
        ? 1.08
        : OFFICE_DEFAULT_DESKTOP_ZOOM
  const coverMin = clamp(
    minFillZoom ?? computeOfficeCoverMinZoom(viewportW, viewportH),
    OFFICE_MIN_ZOOM,
    1.45
  )
  return clamp(userZoom * baseFactor, coverMin, OFFICE_MAX_ZOOM)
}

export interface OfficeCameraTargetParams {
  readonly lx: number
  readonly ly: number
  readonly worldW: number
  readonly worldH: number
  readonly viewportW: number
  readonly viewportH: number
  readonly zoom: number
  readonly role: OfficeRole
}

/**
 * Resolves the HUD column widths (left & right screen insets in CSS px) that occlude
 * the canvas at a given viewport width and role:
 * - `<= 720px`: collapsed top-right cards (`0` horizontal side columns).
 * - `721–1100px`: `290px + 14px` cards (Boss has both left & right; Staff has right only).
 * - `>= 1101px`: `330px + 14px` cards (Boss has both left & right; Staff has right only).
 */
export function resolveOfficeHudInsets(
  viewportW: number,
  role: OfficeRole
): { readonly leftPx: number; readonly rightPx: number } {
  if (viewportW <= OFFICE_MOBILE_BREAKPOINT_PX) {
    return { leftPx: 0, rightPx: 0 }
  }
  const colPx =
    viewportW >= OFFICE_DESKTOP_BREAKPOINT_PX
      ? OFFICE_DESKTOP_HUD_COL_PX
      : OFFICE_TABLET_HUD_COL_PX
  return {
    leftPx: role === "boss" ? colPx : 0,
    rightPx: colPx,
  }
}

/**
 * Computes the ideal camera logical look target:
 * - On phones (`<= 720px`): centers on the player horizontally and shifts slightly north
 *   (`-48 px`) so the player sits cleanly below the collapsed top HUD cards.
 * - On tablet (`721–1100px`) & desktop (`>= 1101px`): shifts the camera target horizontally
 *   so the player sits in the visible center between the left & right HUD columns, while
 *   softly clamping against the world edges using HUD-aware margins.
 */
export function computeOfficeCameraTarget(
  params: OfficeCameraTargetParams
): { readonly x: number; readonly y: number } {
  const { lx, ly, worldW, viewportW, viewportH, role } = params
  if (viewportW <= OFFICE_MOBILE_BREAKPOINT_PX) {
    return { x: lx, y: ly - 48 }
  }

  const safeW = Math.max(1, viewportW)
  const safeH = Math.max(1, viewportH)
  const safeZoom = clamp(params.zoom, OFFICE_MIN_ZOOM, OFFICE_MAX_ZOOM)
  const aspect = Math.max(0.5, safeW / safeH)
  const dist = OFFICE_CAMERA_BASE_DISTANCE / safeZoom
  const halfVisXLogical = (dist * HALF_FOV_TAN * aspect) / OFFICE_WORLD_SCALE

  const { leftPx, rightPx } = resolveOfficeHudInsets(safeW, role)
  const hudOffsetLogical = ((rightPx - leftPx) / safeW) * halfVisXLogical
  const desiredX = lx + hudOffsetLogical

  const leftHudLogical = (leftPx / (safeW / 2)) * halfVisXLogical
  const rightHudLogical = (rightPx / (safeW / 2)) * halfVisXLogical
  const minEdgeX = halfVisXLogical * 0.88 - leftHudLogical
  const maxEdgeX = worldW - halfVisXLogical * 0.88 + rightHudLogical

  const targetX =
    minEdgeX >= maxEdgeX
      ? worldW / 2 + hudOffsetLogical
      : Math.max(minEdgeX, Math.min(maxEdgeX, desiredX))

  // At default/wide cover zoom, bias look target gently northward (KGD-like framing) so the
  // North back wall & LED boards read cleanly across the top even when spawned at Desk #0;
  // taper smoothly back to player-centered framing when zoomed in closely.
  const wideT = clamp((1.75 - safeZoom) / 0.75, 0, 1)
  const verticalOffset = 30 + wideT * 240
  return { x: targetX, y: ly - verticalOffset }
}

const MOVE_KEY_CODES: ReadonlySet<string> = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
])

const MODIFIER_KEY_CODES: ReadonlySet<string> = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
])

export interface OfficeControllerCallbacks {
  arrivedViaDoor?: boolean
  onStationTrigger?: (action: OfficeStationAction) => void
  onDoorRequest?: () => void
  onCloseModal?: () => void
  onSelfState?: (state: OfficeSelfStatePayload) => void
  onError?: (error: unknown) => void
}

interface OfficeDoorExitState {
  phase: "walking" | "opening" | "entering" | "opening-skip" | "fading"
  phaseS: number
  walkElapsedS: number
  waypoints: Point[]
  startX: number
  startY: number
  onFadeStart: () => void
  fadeTriggered: boolean
}

interface OfficeDoorArrivalState {
  stepActive: boolean
  elapsedS: number
  closeS: number
}

interface SelfActor {
  userId: string
  name: string
  role: OfficeRole
  avatarId: string
  outfitColorHex: string | null
  rig: ChibiRig
  x: number
  y: number
  facing: OfficeFacing
  moving: boolean
  target: { x: number; y: number } | null
  pendingStation: OfficeStation | null
}

interface RemotePeerActor {
  userId: string
  name: string
  role: OfficeRole
  avatarId: string
  outfitColorHex: string | null
  rig: ChibiRig
  x: number
  y: number
  targetX: number
  targetY: number
  facing: OfficeFacing
  moving: boolean
}

interface NameplateDom {
  el: HTMLDivElement
  dotEl: HTMLSpanElement
  textEl: HTMLSpanElement
  signature: string
}

function isEditableNode(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return target.isContentEditable
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    isEditableNode(target) ||
    (typeof document !== "undefined" && isEditableNode(document.activeElement))
  )
}

function isHudOrModalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      ".of-hud, .of-door-btn, .of-zoom, .of-prompt, .of-ov, .of-hint"
    )
  )
}

function buildTeamLayoutSignature(
  bossName: string,
  selfUserId: string,
  worldH: number,
  totalDesks: number,
  desks: readonly OfficeDeskPlacement[]
): string {
  const parts = [
    bossName.trim(),
    selfUserId,
    String(worldH),
    String(totalDesks),
  ]
  for (const d of desks) {
    parts.push(
      `${d.index}:${d.userId}:${d.displayName}:${d.x},${d.y},${d.w},${d.h}:${d.hasMug ? 1 : 0}`
    )
  }
  return parts.join("|")
}

export class OfficeController {
  private readonly host: ChibiSceneHost
  private readonly container: HTMLElement
  private readonly callbacks: OfficeControllerCallbacks
  private readonly world3d: OfficeWorld3D
  private readonly exitDoor: ChibiPortalDoor
  private readonly overlayEl: HTMLDivElement
  private readonly promptBtn: HTMLButtonElement
  private readonly promptLabelEl: HTMLSpanElement

  private worldW = OFFICE_BASE_W
  private worldH = OFFICE_BASE_H
  private desks: OfficeDeskPlacement[] = []
  private readonly deskByUserId = new Map<string, OfficeDeskPlacement>()
  private obstacles: OfficeRect[] = buildOfficeObstacles(MAX_STAFF_DESKS)
  private stations: OfficeStation[] = []
  private lastTeamLayoutSignature = ""

  private selfActor: SelfActor | null = null
  private selfRole: OfficeRole = "staff"
  private teamName = ""
  private currentMonth = new Date().getMonth() + 1

  private readonly remotePeers = new Map<string, RemotePeerActor>()
  private readonly nameplates = new Map<string, NameplateDom>()

  private attendanceWorkday = true
  private readonly attendanceByUser = new Map<
    string,
    OfficeAttendanceDisplayState
  >()
  private latestMeeting: OfficeMeeting | null = null
  private latestLeaderboard: OfficeLeaderboard | null = null

  private activeStation: OfficeStation | null = null
  private activeDoor = false
  private pendingDoorArrival = false
  private doorExit: OfficeDoorExitState | null = null
  private doorArrival: OfficeDoorArrivalState | null = null
  private elapsedS = 0
  private modalOpen = false
  private userZoom = 1.0
  private readonly activeTouches = new Map<number, { x: number; y: number }>()
  private pinchStartDist = 0
  private pinchStartZoom = 1.0
  private lastTouchDownMs = 0
  private readonly heldKeys = new Set<string>()
  private disposed = false

  private readonly cleanups: (() => void)[] = []

  constructor(
    host: ChibiSceneHost,
    container: HTMLElement,
    callbacks: OfficeControllerCallbacks,
    /** World already built by the boot sequence (time-sliced); the controller takes ownership. */
    prebuiltWorld?: OfficeWorld3D
  ) {
    this.host = host
    this.container = container
    this.callbacks = callbacks
    this.pendingDoorArrival = Boolean(callbacks.arrivedViaDoor)
    this.world3d =
      prebuiltWorld ?? new OfficeWorld3D(host.scene, host.world, host.lite)

    // North-wall portal door facing South (+Z) straight toward the camera
    this.exitDoor = createChibiPortalDoor({
      signText: "KHU GIAO DỊCH",
      signSubtext: "LỐI RA",
      openingWidth: 1.24,
      openingHeight: 1.72,
      frameDepth: 0.34,
      doubleSidedSign: false,
      lite: host.lite,
    })
    this.positionExitDoor()
    host.scene.add(this.exitDoor.group)

    const overlay = document.createElement("div")
    overlay.className = "of-overlay-layer"
    container.appendChild(overlay)
    this.overlayEl = overlay

    // Floating golden proximity E prompt pill (clickable/tappable!)
    const promptBtn = document.createElement("button")
    promptBtn.type = "button"
    promptBtn.className = "of-prompt"
    promptBtn.style.display = "none"

    const labelSpan = document.createElement("span")
    const kbd = document.createElement("kbd")
    kbd.textContent = "E"
    promptBtn.append(labelSpan, kbd)

    const onPromptClick = (event: MouseEvent): void => {
      event.stopPropagation()
      if (this.modalOpen || this.doorExit) return
      if (this.activeDoor) {
        this.callbacks.onDoorRequest?.()
        return
      }
      if (!this.activeStation) return
      this.triggerStation(this.activeStation)
    }
    const onPromptPointerDown = (event: PointerEvent): void => {
      event.stopPropagation()
    }
    promptBtn.addEventListener("click", onPromptClick)
    promptBtn.addEventListener("pointerdown", onPromptPointerDown)
    this.cleanups.push(() => {
      promptBtn.removeEventListener("click", onPromptClick)
      promptBtn.removeEventListener("pointerdown", onPromptPointerDown)
    })

    overlay.appendChild(promptBtn)
    this.promptBtn = promptBtn
    this.promptLabelEl = labelSpan

    this.applyResponsiveZoom(true)
    host.followLogical(OFFICE_BASE_W / 2, OFFICE_BASE_H / 2, true)
    this.bindInput()
    host.start((dt) => this.tick(dt))
  }

  private effectiveZoom(): number {
    const vp = this.host.getViewportSize()
    const minFillZoom =
      typeof this.host.getClampBounds === "function"
        ? this.host.getClampBounds(1).minFillZoom
        : computeOfficeCoverMinZoom(vp.width, vp.height, this.worldW, this.worldH)
    return computeOfficeResponsiveZoom(
      this.userZoom,
      vp.width,
      vp.height,
      minFillZoom
    )
  }

  private applyResponsiveZoom(instant = false): void {
    this.host.setZoom(this.effectiveZoom(), instant)
  }

  /** Computes ideal camera look target respecting desktop/tablet HUD columns and mobile centering. */
  private computeCameraFollowLogical(
    lx: number,
    ly: number
  ): { x: number; y: number } {
    const vp = this.host.getViewportSize()
    return computeOfficeCameraTarget({
      lx,
      ly,
      worldW: this.worldW,
      worldH: this.worldH,
      viewportW: vp.width,
      viewportH: vp.height,
      zoom: this.host.getTargetZoom(),
      role: this.selfRole,
    })
  }

  /** Re-flags live canvas textures after a WebGL context restore. */
  handleContextRestored(): void {
    if (this.disposed) return
    this.world3d.refreshDynamicTextures()
  }

  /** Adjusts cover zoom & framing immediately when the canvas container resizes. */
  handleViewportResize(): void {
    if (this.disposed) return
    this.applyResponsiveZoom(false)
    if (this.selfActor) {
      const target = this.computeCameraFollowLogical(
        this.selfActor.x,
        this.selfActor.y
      )
      this.host.followLogical(target.x, target.y, true)
    }
  }

  private bindInput(): void {
    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType === "touch") {
        this.activeTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
        if (this.activeTouches.size === 2) {
          const pts = [...this.activeTouches.values()]
          this.pinchStartDist = Math.hypot(
            pts[0]!.x - pts[1]!.x,
            pts[0]!.y - pts[1]!.y
          )
          this.pinchStartZoom = this.userZoom
          // Cancel a walk accidentally triggered by the first finger of a pinch gesture
          if (this.selfActor && performance.now() - this.lastTouchDownMs < 180) {
            this.selfActor.target = null
            this.selfActor.pendingStation = null
          }
          return
        }
        this.lastTouchDownMs = performance.now()
      } else if (event.button !== 0 && event.pointerType === "mouse") {
        return
      }

      if (this.disposed || this.modalOpen || this.doorExit || !this.selfActor) {
        return
      }
      if (isHudOrModalTarget(event.target)) return

      if (this.isExitDoorHit(event.clientX, event.clientY)) {
        this.callbacks.onDoorRequest?.()
        return
      }

      const pt = this.host.screenToLogical(event.clientX, event.clientY)
      if (!pt) return

      // Direct click on own desk / boss desk / meeting table / docs shelf / standee
      const clickedStation = findClickedStation(pt.x, pt.y, this.stations)
      if (clickedStation) {
        const dist = Math.hypot(
          this.selfActor.x - clickedStation.x,
          this.selfActor.y - clickedStation.y
        )
        if (dist < OFFICE_STATION_RADIUS) {
          this.triggerStation(clickedStation)
          return
        }
        this.selfActor.target = { x: clickedStation.x, y: clickedStation.y }
        this.selfActor.pendingStation = clickedStation
        this.world3d.showTargetRing(clickedStation.x, clickedStation.y)
        return
      }

      const tx = Math.max(30, Math.min(this.worldW - 30, pt.x))
      const ty = Math.max(40, Math.min(this.worldH - 24, pt.y))
      this.selfActor.target = { x: tx, y: ty }
      this.selfActor.pendingStation = null
      this.world3d.showTargetRing(tx, ty)
    }

    const onWheel = (event: WheelEvent): void => {
      if (this.disposed || this.modalOpen) return
      if (isHudOrModalTarget(event.target)) return
      event.preventDefault()
      const factor = event.deltaY < 0 ? 1.1 : 0.91
      this.userZoom = clamp(
        this.userZoom * factor,
        OFFICE_MIN_ZOOM,
        OFFICE_MAX_USER_ZOOM
      )
      this.applyResponsiveZoom(false)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (this.disposed) return
      if (
        (event.code === "Escape" || event.key === "Escape") &&
        this.modalOpen
      ) {
        event.preventDefault()
        this.callbacks.onCloseModal?.()
        return
      }
      if (
        event.metaKey ||
        event.ctrlKey ||
        MODIFIER_KEY_CODES.has(event.code)
      ) {
        this.heldKeys.clear()
        return
      }
      if (this.modalOpen || this.doorExit || isTypingTarget(event.target))
        return

      const code = event.code
      if (MOVE_KEY_CODES.has(code)) {
        if (code.startsWith("Arrow")) {
          event.preventDefault()
        }
        this.heldKeys.add(code)
        if (this.selfActor) {
          this.selfActor.target = null
          this.selfActor.pendingStation = null
        }
        return
      }

      if (code === "KeyE" && !event.repeat) {
        if (this.activeDoor) {
          event.preventDefault()
          this.callbacks.onDoorRequest?.()
          return
        }
        if (this.activeStation) {
          event.preventDefault()
          this.triggerStation(this.activeStation)
        }
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (MODIFIER_KEY_CODES.has(event.code)) {
        this.heldKeys.clear()
        return
      }
      this.heldKeys.delete(event.code)
    }

    const onBlur = (): void => {
      this.heldKeys.clear()
    }

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        this.heldKeys.clear()
      }
    }

    let lastHoverMs = 0
    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch") {
        if (!this.activeTouches.has(event.pointerId)) return
        this.activeTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        })
        if (this.activeTouches.size === 2 && this.pinchStartDist > 8) {
          const pts = [...this.activeTouches.values()]
          const dist = Math.hypot(
            pts[0]!.x - pts[1]!.x,
            pts[0]!.y - pts[1]!.y
          )
          this.userZoom = clamp(
            this.pinchStartZoom * (dist / this.pinchStartDist),
            OFFICE_MIN_ZOOM,
            OFFICE_MAX_USER_ZOOM
          )
          this.applyResponsiveZoom(false)
        }
        return
      }

      const dom = this.host.renderer?.domElement
      if (!dom?.style) return
      if (
        this.disposed ||
        this.modalOpen ||
        this.doorExit ||
        !this.selfActor ||
        isHudOrModalTarget(event.target)
      ) {
        if (dom.style.cursor) dom.style.cursor = ""
        return
      }
      const now = performance.now()
      if (now - lastHoverMs < 60) return
      lastHoverMs = now
      const overDoor = this.isExitDoorHit(event.clientX, event.clientY)
      let overStation = false
      if (!overDoor) {
        const pt = this.host.screenToLogical(event.clientX, event.clientY)
        overStation = Boolean(
          pt && findClickedStation(pt.x, pt.y, this.stations)
        )
      }
      dom.style.cursor = overDoor || overStation ? "pointer" : ""
    }

    const onPointerUp = (event: PointerEvent): void => {
      if (event.pointerType === "touch") {
        this.activeTouches.delete(event.pointerId)
        if (this.activeTouches.size < 2) {
          this.pinchStartDist = 0
        }
      }
    }

    this.container.addEventListener("pointerdown", onPointerDown)
    this.container.addEventListener("pointermove", onPointerMove)
    this.container.addEventListener("pointerup", onPointerUp)
    this.container.addEventListener("pointercancel", onPointerUp)
    this.container.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    document.addEventListener("visibilitychange", onVisibilityChange)

    this.cleanups.push(() => {
      const dom = this.host.renderer?.domElement
      if (dom?.style) dom.style.cursor = ""
      this.container.removeEventListener("pointerdown", onPointerDown)
      this.container.removeEventListener("pointermove", onPointerMove)
      this.container.removeEventListener("pointerup", onPointerUp)
      this.container.removeEventListener("pointercancel", onPointerUp)
      this.container.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    })
  }

  private positionExitDoor(): void {
    const door = getOfficeExitDoor(this.worldH)
    const pt = logicalToWorld(door.x, door.y, this.host.world)
    this.exitDoor.group.position.set(pt.x, 0, pt.z)
    // Flush on North back wall facing South (+Z) into the open floor
    this.exitDoor.group.rotation.y = 0
  }

  private isExitDoorHit(clientX: number, clientY: number): boolean {
    return (
      this.host.pickObjects(clientX, clientY, [this.exitDoor.hitTarget])
        .length > 0
    )
  }

  /**
   * Starts the animated exit through the Office -> Trading Floor portal door on the North wall:
   * - `prefers-reduced-motion`: immediate fade callback with zero walk or hinge swing.
   * - Reachable within ~4 s via A* around furniture: auto-walk, face north, swing open (~0.35 s), step through, fade.
   * - Blocked or > 4 s away: skip walk, swing open + fade immediately.
   */
  beginDoorExit(onFadeStart: () => void): void {
    if (this.disposed || this.doorExit) return
    this.doorArrival = null
    this.heldKeys.clear()
    this.activeStation = null
    this.activeDoor = false
    this.promptBtn.style.display = "none"
    this.world3d.hideTargetRing()
    if (this.selfActor) {
      this.selfActor.target = null
      this.selfActor.pendingStation = null
    }

    const self = this.selfActor
    if (prefersReducedMotion() || !self) {
      this.doorExit = {
        phase: "fading",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints: [],
        startX: self?.x ?? 0,
        startY: self?.y ?? 0,
        onFadeStart,
        fadeTriggered: true,
      }
      onFadeStart()
      return
    }

    const door = getOfficeExitDoor(this.worldH)
    const start = { x: self.x, y: self.y }
    const waypoints = findOfficeDoorPath(
      start,
      door.access,
      this.obstacles,
      this.worldW,
      this.worldH
    )
    const decision = shouldAutoWalkToDoor(
      start,
      door.access,
      waypoints,
      OFFICE_WALK_SPEED,
      DOOR_MAX_WALK_SECONDS,
      36
    )

    if (decision.mode === "walk") {
      this.doorExit = {
        phase: "walking",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints,
        startX: self.x,
        startY: self.y,
        onFadeStart,
        fadeTriggered: false,
      }
      this.world3d.showTargetRing(door.access.x, door.access.y)
    } else if (decision.mode === "at-door") {
      self.facing = "up"
      self.moving = false
      this.doorExit = {
        phase: "opening",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints: [],
        startX: self.x,
        startY: self.y,
        onFadeStart,
        fadeTriggered: false,
      }
    } else {
      this.doorExit = {
        phase: "opening-skip",
        phaseS: 0,
        walkElapsedS: 0,
        waypoints: [],
        startX: self.x,
        startY: self.y,
        onFadeStart,
        fadeTriggered: false,
      }
    }
  }

  private triggerStation(station: OfficeStation): void {
    this.heldKeys.clear()
    if (this.selfActor) {
      this.selfActor.target = null
      this.selfActor.pendingStation = null
    }
    this.world3d.hideTargetRing()
    this.callbacks.onStationTrigger?.({
      station: station.id,
      modal: station.modal,
      focusProposal: station.focusProposal,
    })
  }

  /** Programmatic zoom step for corner `+` / `−` buttons (`1.15×` / `1/1.15×`). */
  setZoomDelta(delta: 1 | -1): void {
    if (this.disposed) return
    const factor = delta > 0 ? 1.15 : 1 / 1.15
    this.userZoom = clamp(
      this.userZoom * factor,
      OFFICE_MIN_ZOOM,
      OFFICE_MAX_USER_ZOOM
    )
    this.applyResponsiveZoom(false)
  }

  setModalOpen(open: boolean): void {
    this.modalOpen = open
    if (open) {
      this.heldKeys.clear()
      if (this.selfActor) {
        this.selfActor.target = null
        this.selfActor.pendingStation = null
      }
      this.world3d.hideTargetRing()
      this.promptBtn.style.display = "none"
    }
  }

  /** Re-emits the current local spawn/pose immediately after WebSocket `welcome`. */
  resendSelfState(): void {
    if (this.disposed || !this.selfActor) return
    this.callbacks.onSelfState?.({
      x: this.selfActor.x,
      y: this.selfActor.y,
      facing: this.selfActor.facing,
      moving: this.selfActor.moving,
    })
  }

  /**
   * Syncs team roster, desks, self character, and interactive stations from `GET /office/me`.
   * Compares a layout signature so desks/textures are ONLY rebuilt when names, layout, or
   * desk indices actually change.
   */
  updateTeam(me: OfficeMe): void {
    runBuildSync(this.updateTeamSteps(me))
  }

  /** `updateTeam` with the desk/pod rebuild time-sliced (used once during boot behind the loading screen). */
  updateTeamAsync(
    me: OfficeMe,
    opts: ChunkedBuildOptions = {}
  ): Promise<boolean> {
    return runBuildChunked(this.updateTeamSteps(me), opts)
  }

  private *updateTeamSteps(me: OfficeMe): BuildSteps {
    if (this.disposed || !me.member || !me.self || !me.team) return

    const prevRole = this.selfRole
    const prevTeamName = this.teamName
    this.selfRole = me.self.role
    this.teamName = me.team.name
    this.currentMonth = monthNumberFromPeriod(me.periodMonth)
    this.attendanceWorkday = me.isWorkday

    if (
      me.self.role === "staff" &&
      me.hud?.kind === "staff" &&
      !this.attendanceByUser.has(me.self.userId)
    ) {
      this.attendanceByUser.set(me.self.userId, me.hud.myAttendanceStatus)
    }

    const nextDesks = buildDeskPositions(me.members)
    const dims = computeOfficeDimensions(nextDesks.length)
    const nextSignature = buildTeamLayoutSignature(
      me.team.bossName,
      me.self.userId,
      dims.height,
      dims.totalDesks,
      nextDesks
    )
    const layoutChanged = nextSignature !== this.lastTeamLayoutSignature

    const dimsChanged =
      dims.width !== this.host.world.logicalW ||
      dims.height !== this.host.world.logicalH

    if (layoutChanged) {
      this.lastTeamLayoutSignature = nextSignature
      this.desks = nextDesks
      this.deskByUserId.clear()
      for (const desk of this.desks) {
        this.deskByUserId.set(desk.userId, desk)
      }
      this.worldW = dims.width
      this.worldH = dims.height
      if (dimsChanged) {
        this.host.setWorldSize(this.worldW, this.worldH)
        this.applyResponsiveZoom(true)
      }
      this.obstacles = buildOfficeObstacles(this.desks)
      yield* this.world3d.rebuildTeamPropsSteps(
        me.team.bossName,
        this.desks,
        me.self.userId,
        this.worldH,
        dims.totalDesks
      )
      this.positionExitDoor()
    }

    const selfDesk = this.deskByUserId.get(me.self.userId) ?? null
    this.stations = buildOfficeStations(
      me.self.role,
      selfDesk ? selfDesk.home : null,
      this.currentMonth,
      selfDesk
        ? { x: selfDesk.x, y: selfDesk.y, w: selfDesk.w, h: selfDesk.h }
        : null
    )

    // Spawn or update local self Chibi character
    const avatarId = resolveOfficeAvatarId(
      me.self.userId,
      me.self.avatar,
      me.self.displayName,
      me.self.role === "boss"
    )
    const outfitHex =
      resolveOutfitHex(me.self.avatarColor) ??
      resolveOutfitHex(me.self.accentColor)

    const defaultSpawn =
      me.self.role === "boss"
        ? { x: OFFICE_BOSS_SPAWN.x, y: OFFICE_BOSS_SPAWN.y }
        : selfDesk
          ? { x: selfDesk.home.x, y: selfDesk.home.y }
          : {
              x: OFFICE_STAFF_FALLBACK_SPAWN.x,
              y: OFFICE_STAFF_FALLBACK_SPAWN.y,
            }

    if (!this.selfActor || this.selfActor.userId !== me.self.userId) {
      const arrivedViaDoor = this.pendingDoorArrival
      this.pendingDoorArrival = false
      const exitDoorSpec = getOfficeExitDoor(this.worldH)
      const spawn = arrivedViaDoor
        ? { x: exitDoorSpec.spawnInside.x, y: exitDoorSpec.spawnInside.y }
        : defaultSpawn
      const initialFacing: OfficeFacing = "down"

      if (this.selfActor) {
        this.host.scene.remove(this.selfActor.rig.root)
        this.selfActor.rig.dispose()
        this.removeNameplate(this.selfActor.userId)
      }
      const rig = createChibiCharacter({
        avatarId,
        outfitColorHex: outfitHex,
        isBoss: me.self.role === "boss",
      })
      const pt = logicalToWorld(spawn.x, spawn.y, this.host.world)
      rig.root.position.set(pt.x, 0, pt.z)
      this.host.scene.add(rig.root)

      this.selfActor = {
        userId: me.self.userId,
        name: me.self.displayName,
        role: me.self.role,
        avatarId,
        outfitColorHex: outfitHex,
        rig,
        x: spawn.x,
        y: spawn.y,
        facing: initialFacing,
        moving: false,
        target: null,
        pendingStation: null,
      }
      if (arrivedViaDoor && !prefersReducedMotion()) {
        this.exitDoor.setOpenProgress(1)
        this.doorArrival = { stepActive: true, elapsedS: 0, closeS: 0 }
      } else {
        this.exitDoor.setOpenProgress(0)
      }
      const camTarget = this.computeCameraFollowLogical(spawn.x, spawn.y)
      this.host.followLogical(camTarget.x, camTarget.y, true)
      this.callbacks.onSelfState?.({
        x: spawn.x,
        y: spawn.y,
        facing: initialFacing,
        moving: false,
      })
    } else {
      this.selfActor.name = me.self.displayName
      this.selfActor.role = me.self.role
      if (this.selfActor.avatarId !== avatarId) {
        const prev = this.selfActor
        this.host.scene.remove(prev.rig.root)
        prev.rig.dispose()
        const rig = createChibiCharacter({
          avatarId,
          outfitColorHex: outfitHex,
          isBoss: me.self.role === "boss",
        })
        const pt = logicalToWorld(prev.x, prev.y, this.host.world)
        rig.root.position.set(pt.x, 0, pt.z)
        this.host.scene.add(rig.root)
        this.selfActor = {
          ...prev,
          avatarId,
          outfitColorHex: outfitHex,
          rig,
        }
      } else if (this.selfActor.outfitColorHex !== outfitHex) {
        this.selfActor.outfitColorHex = outfitHex
        this.selfActor.rig.setOutfitColor(outfitHex)
      }
      if (dimsChanged || prevRole !== this.selfRole) {
        const selfPt = logicalToWorld(
          this.selfActor.x,
          this.selfActor.y,
          this.host.world
        )
        this.selfActor.rig.root.position.set(selfPt.x, 0, selfPt.z)
        const camTarget = this.computeCameraFollowLogical(
          this.selfActor.x,
          this.selfActor.y
        )
        this.host.followLogical(camTarget.x, camTarget.y, true)
      }
    }

    if (dimsChanged) {
      for (const peer of this.remotePeers.values()) {
        const peerPt = logicalToWorld(peer.x, peer.y, this.host.world)
        peer.rig.root.position.set(peerPt.x, 0, peerPt.z)
      }
    }

    if (
      layoutChanged ||
      prevRole !== this.selfRole ||
      prevTeamName !== this.teamName
    ) {
      this.world3d.updateStandee(
        this.latestLeaderboard,
        this.teamName,
        this.selfRole === "staff"
      )
      if (this.latestMeeting !== null) {
        this.world3d.updateMeetingScreen(this.latestMeeting)
      }
    }
  }

  /**
   * Syncs remote online WebSocket peers onto the 3D floor.
   * ONLY renders currently connected online peers (NEVER tied to attendance!).
   */
  updateOnlinePeers(peers: readonly OfficeOnlinePeer[]): void {
    if (this.disposed) return
    const activeIds = new Set<string>()

    for (const peer of peers) {
      if (this.selfActor && peer.userId === this.selfActor.userId) continue
      activeIds.add(peer.userId)

      const avatarId = resolveOfficeAvatarId(
        peer.userId,
        peer.avatarId,
        peer.name,
        peer.role === "boss"
      )
      const outfitHex =
        resolveOutfitHex(peer.avatarColor) ??
        resolveOutfitHex(peer.accentColor)

      const existing = this.remotePeers.get(peer.userId)
      if (!existing) {
        const rig = createChibiCharacter({
          avatarId,
          outfitColorHex: outfitHex,
          isBoss: peer.role === "boss",
        })
        const pt = logicalToWorld(peer.x, peer.y, this.host.world)
        rig.root.position.set(pt.x, 0, pt.z)
        this.host.scene.add(rig.root)
        this.remotePeers.set(peer.userId, {
          userId: peer.userId,
          name: peer.name,
          role: peer.role,
          avatarId,
          outfitColorHex: outfitHex,
          rig,
          x: peer.x,
          y: peer.y,
          targetX: peer.x,
          targetY: peer.y,
          facing: peer.facing,
          moving: peer.moving,
        })
      } else {
        existing.name = peer.name
        existing.role = peer.role
        existing.targetX = peer.x
        existing.targetY = peer.y
        existing.facing = peer.facing
        existing.moving = peer.moving
        if (
          Math.hypot(existing.x - peer.x, existing.y - peer.y) >
          PEER_TELEPORT_PX
        ) {
          existing.x = peer.x
          existing.y = peer.y
        }
      }
    }

    for (const [userId, actor] of [...this.remotePeers]) {
      if (!activeIds.has(userId)) {
        this.host.scene.remove(actor.rig.root)
        actor.rig.dispose()
        this.remotePeers.delete(userId)
        this.removeNameplate(userId)
      }
    }
  }

  /** Syncs daily attendance status dots map (never hides/shows avatars!). */
  updateAttendance(attendance: OfficeAttendanceToday | null): void {
    this.attendanceByUser.clear()
    if (!attendance) return
    this.attendanceWorkday = attendance.isWorkday
    for (const entry of attendance.roster.ok) {
      this.attendanceByUser.set(entry.userId, "ok")
    }
    for (const entry of attendance.roster.late) {
      this.attendanceByUser.set(entry.userId, "late")
    }
    for (const entry of attendance.roster.absent) {
      this.attendanceByUser.set(entry.userId, "absent")
    }
  }

  updateMeeting(meeting: OfficeMeeting | null): void {
    this.latestMeeting = meeting
    this.world3d.updateMeetingScreen(meeting)
  }

  updateStandee(leaderboard: OfficeLeaderboard | null): void {
    this.latestLeaderboard = leaderboard
    this.world3d.updateStandee(
      leaderboard,
      this.teamName,
      this.selfRole === "staff"
    )
  }

  private ensureNameplate(userId: string): NameplateDom {
    const existing = this.nameplates.get(userId)
    if (existing) return existing
    const el = document.createElement("div")
    el.className = "of-nameplate"
    el.style.display = "none"

    const dotEl = document.createElement("span")
    dotEl.className = "of-att-dot"
    dotEl.style.display = "none"

    const textEl = document.createElement("span")
    el.append(dotEl, textEl)
    this.overlayEl.appendChild(el)

    const dom: NameplateDom = { el, dotEl, textEl, signature: "" }
    this.nameplates.set(userId, dom)
    return dom
  }

  private removeNameplate(userId: string): void {
    const dom = this.nameplates.get(userId)
    if (!dom) return
    dom.el.remove()
    this.nameplates.delete(userId)
  }

  private resolveAttendanceDot(
    userId: string,
    role: OfficeRole,
    isSelf: boolean
  ): OfficeAttendanceDisplayState | null {
    if (!this.attendanceWorkday || role === "boss") return null
    if (this.selfRole === "staff" && !isSelf) return null
    return this.attendanceByUser.get(userId) ?? null
  }

  private updateActorNameplate(
    userId: string,
    name: string,
    role: OfficeRole,
    isSelf: boolean,
    x: number,
    y: number,
    headHeight: number
  ): boolean {
    const dom = this.ensureNameplate(userId)

    // Own-desk declutter rule (Spec §3.2)
    if (role === "staff") {
      const desk = this.deskByUserId.get(userId)
      if (
        desk &&
        Math.hypot(x - desk.home.x, y - desk.home.y) <
          OFFICE_DESK_DECLUTTER_RADIUS
      ) {
        dom.el.style.display = "none"
        return false
      }
    }

    const pt = this.host.projectLogicalToScreen(x, y, headHeight + 0.22)
    if (!pt.visible) {
      dom.el.style.display = "none"
      return false
    }

    const dotStatus = this.resolveAttendanceDot(userId, role, isSelf)
    const displayLabel = isSelf ? `${name} (bạn)` : name
    const sig = `${isSelf ? 1 : 0}|${dotStatus ?? ""}|${displayLabel}`
    if (dom.signature !== sig) {
      dom.signature = sig
      dom.el.dataset.self = isSelf ? "1" : "0"
      dom.textEl.textContent = displayLabel
      if (dotStatus) {
        dom.dotEl.dataset.status = dotStatus
        dom.dotEl.style.display = "inline-block"
      } else {
        dom.dotEl.style.display = "none"
      }
    }

    dom.el.style.display = "inline-flex"
    dom.el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y)}px, 0) translate(-50%, -100%)`
    dom.el.style.zIndex = String(10 + Math.round(y * 0.05))
    return true
  }

  private stepDoorExit(
    self: SelfActor,
    dt: number,
    reducedMotion: boolean
  ): void {
    const exit = this.doorExit
    if (!exit) return
    const door = getOfficeExitDoor(this.worldH)

    let moved = false
    if (exit.phase === "walking") {
      exit.walkElapsedS += dt
      let budget = OFFICE_WALK_SPEED * dt
      let x = self.x
      let y = self.y

      while (budget > 0 && exit.waypoints.length > 0) {
        const target = exit.waypoints[0]!
        const dx = target.x - x
        const dy = target.y - y
        const dist = Math.hypot(dx, dy)
        if (dist > 0.5) self.facing = officeFacingFromDelta(dx, dy)
        if (dist <= budget) {
          x = target.x
          y = target.y
          budget -= dist
          exit.waypoints.shift()
        } else {
          x += (dx / dist) * budget
          y += (dy / dist) * budget
          budget = 0
        }
      }

      self.x = x
      self.y = y
      moved = exit.waypoints.length > 0

      if (
        exit.waypoints.length === 0 ||
        exit.walkElapsedS >= DOOR_MAX_WALK_SECONDS + 0.5
      ) {
        this.world3d.hideTargetRing()
        self.facing = "up"
        moved = false
        exit.phase = "opening"
        exit.phaseS = 0
        exit.startX = self.x
        exit.startY = self.y
      }
    } else if (exit.phase === "opening") {
      exit.phaseS += dt
      this.exitDoor.setOpenProgress(
        Math.min(1, exit.phaseS / DOOR_SWING_OPEN_S)
      )
      self.facing = "up"
      if (exit.phaseS >= DOOR_SWING_OPEN_S) {
        exit.phase = "entering"
        exit.phaseS = 0
        exit.startX = self.x
        exit.startY = self.y
      }
    } else if (exit.phase === "entering") {
      exit.phaseS += dt
      const t = Math.min(1, exit.phaseS / DOOR_STEP_THROUGH_S)
      self.x = exit.startX + (door.through.x - exit.startX) * t
      self.y = exit.startY + (door.through.y - exit.startY) * t
      self.facing = "up"
      moved = t < 1
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
      this.exitDoor.setOpenProgress(
        Math.min(1, exit.phaseS / DOOR_SWING_OPEN_S)
      )
      if (!exit.fadeTriggered && exit.phaseS >= DOOR_SWING_OPEN_S * 0.55) {
        exit.fadeTriggered = true
        exit.onFadeStart()
      }
      if (exit.phaseS >= DOOR_SWING_OPEN_S) {
        exit.phase = "fading"
      }
    }

    self.moving = moved
    const pt = logicalToWorld(self.x, self.y, this.host.world)
    self.rig.root.position.set(pt.x, 0, pt.z)
    self.rig.update(dt, {
      anim: reducedMotion ? "walk" : moved ? "walk" : "idle",
      moveFactor: reducedMotion ? 0 : 1,
      facingRad: officeFacingToRadians(self.facing),
    })

    if (moved) {
      this.callbacks.onSelfState?.({
        x: self.x,
        y: self.y,
        facing: self.facing,
        moving: true,
      })
    }

    const camTarget = this.computeCameraFollowLogical(self.x, self.y)
    this.host.followLogical(camTarget.x, camTarget.y)
    this.updateActorNameplate(
      self.userId,
      self.name,
      self.role,
      true,
      self.x,
      self.y,
      self.rig.headHeight
    )
    this.activeStation = null
    this.activeDoor = false
    this.promptBtn.style.display = "none"
  }

  private stepDoorArrival(
    self: SelfActor,
    dt: number,
    reducedMotion: boolean
  ): boolean {
    const arrival = this.doorArrival
    if (!arrival) return false

    if (this.heldKeys.size > 0 || self.target !== null) {
      arrival.stepActive = false
    }

    arrival.elapsedS += dt
    const STEP_DELAY_S = 0.16
    const STEP_DUR_S = 0.24
    const door = getOfficeExitDoor(this.worldH)

    if (arrival.stepActive) {
      if (arrival.elapsedS >= STEP_DELAY_S) {
        const t = Math.min(1, (arrival.elapsedS - STEP_DELAY_S) / STEP_DUR_S)
        self.x =
          door.spawnInside.x + (door.access.x - door.spawnInside.x) * t
        self.y =
          door.spawnInside.y + (door.access.y - door.spawnInside.y) * t
        self.facing = "down"
        self.moving = t < 1
        const pt = logicalToWorld(self.x, self.y, this.host.world)
        self.rig.root.position.set(pt.x, 0, pt.z)
        self.rig.update(dt, {
          anim: reducedMotion ? "walk" : t < 1 ? "walk" : "idle",
          moveFactor: reducedMotion ? 0 : 1,
          facingRad: officeFacingToRadians(self.facing),
        })
        if (t >= 1) {
          arrival.stepActive = false
          self.moving = false
          this.callbacks.onSelfState?.({
            x: self.x,
            y: self.y,
            facing: self.facing,
            moving: false,
          })
        }
      } else {
        self.rig.update(dt, {
          anim: "idle",
          moveFactor: 0,
          facingRad: officeFacingToRadians("down"),
        })
      }
    }

    if (arrival.elapsedS >= STEP_DELAY_S + 0.08) {
      arrival.closeS += dt
      const openLeft = Math.max(0, 1 - arrival.closeS / DOOR_SWING_CLOSE_S)
      this.exitDoor.setOpenProgress(openLeft)
      if (openLeft <= 0 && !arrival.stepActive) {
        this.doorArrival = null
      }
    }

    return arrival.stepActive
  }

  private tick(dt: number): void {
    if (this.disposed) return

    this.elapsedS += dt
    this.world3d.update(dt)
    const reducedMotion = prefersReducedMotion()
    this.exitDoor.update(dt, this.elapsedS, reducedMotion)

    // 1. Update local self movement
    if (this.selfActor && this.doorExit) {
      this.stepDoorExit(this.selfActor, dt, reducedMotion)
    } else if (this.selfActor) {
      const self = this.selfActor
      const arrivalStepping = this.doorArrival
        ? this.stepDoorArrival(self, dt, reducedMotion)
        : false

      let vx = 0
      let vy = 0

      if (!this.modalOpen && !arrivalStepping) {
        if (this.heldKeys.has("KeyW") || this.heldKeys.has("ArrowUp")) vy -= 1
        if (this.heldKeys.has("KeyS") || this.heldKeys.has("ArrowDown"))
          vy += 1
        if (this.heldKeys.has("KeyA") || this.heldKeys.has("ArrowLeft"))
          vx -= 1
        if (this.heldKeys.has("KeyD") || this.heldKeys.has("ArrowRight"))
          vx += 1
      }

      let moved = false
      let arrivedStation: OfficeStation | null = null
      if (!arrivalStepping) {
        if (vx !== 0 || vy !== 0) {
          const len = Math.hypot(vx, vy)
          const step = OFFICE_WALK_SPEED * dt
          const dx = (vx / len) * step
          const dy = (vy / len) * step
          self.facing = officeFacingFromDelta(dx, dy)
          const res = moveWithSlide(
            self.x,
            self.y,
            dx,
            dy,
            this.obstacles,
            this.worldW,
            this.worldH
          )
          self.x = res.x
          self.y = res.y
          moved = res.moved
        } else if (self.target && !this.modalOpen) {
          const rx = self.target.x - self.x
          const ry = self.target.y - self.y
          const dist = Math.hypot(rx, ry)
          if (dist < ARRIVAL_PX) {
            self.target = null
            if (self.pendingStation) {
              arrivedStation = self.pendingStation
              self.pendingStation = null
            }
          } else {
            const step = Math.min(dist, OFFICE_WALK_SPEED * dt)
            const dx = (rx / dist) * step
            const dy = (ry / dist) * step
            self.facing = officeFacingFromDelta(dx, dy)
            const res = moveWithSlide(
              self.x,
              self.y,
              dx,
              dy,
              this.obstacles,
              this.worldW,
              this.worldH
            )
            self.x = res.x
            self.y = res.y
            moved = res.moved
            if (!moved) {
              self.target = null
              if (
                self.pendingStation &&
                Math.hypot(
                  self.x - self.pendingStation.x,
                  self.y - self.pendingStation.y
                ) < OFFICE_STATION_RADIUS
              ) {
                arrivedStation = self.pendingStation
              }
              self.pendingStation = null
            }
          }
        }

        const wasMoving = self.moving
        self.moving = moved
        const pt = logicalToWorld(self.x, self.y, this.host.world)
        self.rig.root.position.set(pt.x, 0, pt.z)
        self.rig.update(dt, {
          anim: reducedMotion ? "walk" : moved ? "walk" : "idle",
          moveFactor: reducedMotion ? 0 : 1,
          facingRad: officeFacingToRadians(self.facing),
        })

        if (moved || wasMoving) {
          this.callbacks.onSelfState?.({
            x: self.x,
            y: self.y,
            facing: self.facing,
            moving: moved,
          })
        }

        if (arrivedStation) {
          this.triggerStation(arrivedStation)
        }
      }

      const camTarget = this.computeCameraFollowLogical(self.x, self.y)
      this.host.followLogical(camTarget.x, camTarget.y)
      const selfPlateShown = this.updateActorNameplate(
        self.userId,
        self.name,
        self.role,
        true,
        self.x,
        self.y,
        self.rig.headHeight
      )

      // Proximity station & exit-door check (< 95 px)
      const nearestStation = this.modalOpen
        ? null
        : findNearestStation(
            self.x,
            self.y,
            this.stations,
            OFFICE_STATION_RADIUS
          )
      const exitDoorSpec = getOfficeExitDoor(this.worldH)
      const doorDist = this.modalOpen
        ? Infinity
        : Math.hypot(
            self.x - exitDoorSpec.access.x,
            self.y - exitDoorSpec.access.y
          )
      const stationDist = nearestStation
        ? Math.hypot(self.x - nearestStation.x, self.y - nearestStation.y)
        : Infinity
      const doorCloser =
        doorDist < exitDoorSpec.radius && doorDist <= stationDist

      this.activeDoor = doorCloser
      this.activeStation = doorCloser ? null : nearestStation

      const promptTarget = doorCloser
        ? {
            id: "exit-door" as const,
            x: exitDoorSpec.access.x,
            y: exitDoorSpec.access.y,
            label: exitDoorSpec.label,
          }
        : nearestStation

      if (promptTarget) {
        const vp = this.host.getViewportSize()
        const isMobile = vp.width <= OFFICE_MOBILE_BREAKPOINT_PX
        const selfPlatePt = this.host.projectLogicalToScreen(
          self.x,
          self.y,
          self.rig.headHeight + 0.22
        )
        const anchorBelowFeet =
          promptTarget.id === "mydesk" ||
          promptTarget.id === "boss" ||
          isMobile
        const promptAnchorX = anchorBelowFeet ? self.x : promptTarget.x
        const promptAnchorY = anchorBelowFeet ? self.y : promptTarget.y
        const promptPt = this.host.projectLogicalToScreen(
          promptAnchorX,
          promptAnchorY,
          anchorBelowFeet ? 0.0 : 1.55
        )
        if (promptPt.visible) {
          if (this.promptLabelEl.textContent !== promptTarget.label) {
            this.promptLabelEl.textContent = promptTarget.label
            this.promptBtn.setAttribute(
              "aria-label",
              `${promptTarget.label} (nhấn E để mở)`
            )
          }
          if (doorCloser) {
            this.promptBtn.dataset.testid = "office-door-prompt"
          } else {
            delete this.promptBtn.dataset.testid
          }
          if (this.promptBtn.style.display === "none") {
            this.promptBtn.style.display = "inline-flex"
          }
          const measuredW = this.promptBtn.offsetWidth || 240
          const measuredH = this.promptBtn.offsetHeight || 42
          const halfW = Math.ceil(measuredW / 2) + 12
          const px =
            halfW * 2 >= vp.width
              ? vp.width / 2
              : Math.max(halfW, Math.min(vp.width - halfW, promptPt.x))
          let py = anchorBelowFeet ? promptPt.y + 18 : promptPt.y
          if (
            !anchorBelowFeet &&
            selfPlateShown &&
            selfPlatePt.visible &&
            Math.abs(px - selfPlatePt.x) < 170 &&
            Math.abs(py - selfPlatePt.y) < 46
          ) {
            py = Math.min(py, selfPlatePt.y - 44)
          }
          let minTop = 58
          if (isMobile) {
            const stageRoot = this.container.parentElement
            const hudTr = stageRoot?.querySelector(".of-hud-tr")
            if (hudTr instanceof HTMLElement) {
              const hudRect = hudTr.getBoundingClientRect()
              const stageRect = this.container.getBoundingClientRect()
              if (hudRect.height > 0) {
                minTop = Math.max(
                  minTop,
                  Math.ceil(hudRect.bottom - stageRect.top) + 10
                )
              }
            }
          }
          py = anchorBelowFeet
            ? Math.max(
                minTop,
                Math.min(Math.max(minTop, vp.height - measuredH - 28), py)
              )
            : Math.max(
                minTop + measuredH,
                Math.min(Math.max(minTop + measuredH, vp.height - 28), py)
              )

          this.promptBtn.style.transform = anchorBelowFeet
            ? `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0) translate(-50%, 0)`
            : `translate3d(${Math.round(px)}px, ${Math.round(py)}px, 0) translate(-50%, -100%)`
        } else {
          this.promptBtn.style.display = "none"
        }
      } else {
        this.promptBtn.style.display = "none"
      }
    }

    // 2. Smoothly animate online remote WebSocket peers
    const alpha = 1 - Math.exp(-PEER_SMOOTH_RATE * dt)
    for (const peer of this.remotePeers.values()) {
      const dx = peer.targetX - peer.x
      const dy = peer.targetY - peer.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.5) {
        peer.x += dx * alpha
        peer.y += dy * alpha
      } else {
        peer.x = peer.targetX
        peer.y = peer.targetY
      }
      const isMoving = peer.moving || dist > 2.5
      const pt = logicalToWorld(peer.x, peer.y, this.host.world)
      peer.rig.root.position.set(pt.x, 0, pt.z)
      peer.rig.update(dt, {
        anim: reducedMotion ? "walk" : isMoving ? "walk" : "idle",
        moveFactor: reducedMotion ? 0 : 1,
        facingRad: officeFacingToRadians(peer.facing),
      })
      this.updateActorNameplate(
        peer.userId,
        peer.name,
        peer.role,
        false,
        peer.x,
        peer.y,
        peer.rig.headHeight
      )
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const fn of this.cleanups.splice(0)) fn()

    if (this.selfActor) {
      this.host.scene.remove(this.selfActor.rig.root)
      this.selfActor.rig.dispose()
      this.selfActor = null
    }
    for (const peer of this.remotePeers.values()) {
      this.host.scene.remove(peer.rig.root)
      peer.rig.dispose()
    }
    this.remotePeers.clear()

    for (const dom of this.nameplates.values()) {
      dom.el.remove()
    }
    this.nameplates.clear()

    this.host.scene.remove(this.exitDoor.group)
    this.exitDoor.dispose()
    this.world3d.dispose()
    this.overlayEl.remove()
  }
}
