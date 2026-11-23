/**
 * Interactive 3D Office controller:
 * - Click/tap-to-move (`250 px/s`, golden ring) + WASD/Arrow keys (paused when modal/input active)
 * - `E` opens closest interactive station (`< 95 px`), `Esc` closes active modal
 * - Smooth follow camera (`lerp 0.18`), zoom `0.55×..1.5×` via wheel (ignoring `.of-hud`) or `+`/`−`
 * - Renders ONLY online WebSocket members (+ self!) — NEVER tied to attendance
 * - Crisp projected HTML overlays: nameplates (`< 70 px` own-desk declutter for non-self staff),
 *   role-aware attendance status dots (Boss sees all staff; Staff sees self only; Boss has none),
 *   and clickable golden `E` proximity prompt pill.
 */
import { createChibiCharacter } from "@/lib/chibi-3d/character-builder.ts"
import type { ChibiSceneHost } from "@/lib/chibi-3d/scene-host.ts"
import {
  logicalToWorld,
  resolveOutfitHex,
  type ChibiRig,
} from "@/lib/chibi-3d/types.ts"

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
  OFFICE_BASE_H,
  OFFICE_BASE_W,
  OFFICE_BOSS_SPAWN,
  OFFICE_DESK_DECLUTTER_RADIUS,
  OFFICE_STAFF_FALLBACK_SPAWN,
  OFFICE_STATION_RADIUS,
  OFFICE_WALK_SPEED,
  buildDeskPositions,
  buildOfficeObstacles,
  buildOfficeStations,
  computeOfficeDimensions,
  findNearestStation,
  moveWithSlide,
  officeFacingFromDelta,
  officeFacingToRadians,
  type OfficeDeskPlacement,
  type OfficeRect,
  type OfficeStation,
} from "./office-layout.ts"
import { OfficeWorld3D } from "./office-world-3d.ts"

const MIN_ZOOM = 0.55
const MAX_ZOOM = 1.5
const ARRIVAL_PX = 4
const PEER_TELEPORT_PX = 280
const PEER_SMOOTH_RATE = 12

export interface OfficeControllerCallbacks {
  onStationTrigger?: (action: OfficeStationAction) => void
  onCloseModal?: () => void
  onSelfState?: (state: OfficeSelfStatePayload) => void
  onError?: (error: unknown) => void
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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  return target.isContentEditable
}

function isHudOrModalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(".of-hud, .of-zoom, .of-prompt, .of-ov, .of-hint")
  )
}

export class OfficeController {
  private readonly host: ChibiSceneHost
  private readonly container: HTMLElement
  private readonly callbacks: OfficeControllerCallbacks
  private readonly world3d: OfficeWorld3D
  private readonly overlayEl: HTMLDivElement
  private readonly promptBtn: HTMLButtonElement
  private readonly promptLabelEl: HTMLSpanElement

  private worldW = OFFICE_BASE_W
  private worldH = OFFICE_BASE_H
  private desks: OfficeDeskPlacement[] = []
  private readonly deskByUserId = new Map<string, OfficeDeskPlacement>()
  private obstacles: OfficeRect[] = buildOfficeObstacles(11)
  private stations: OfficeStation[] = []

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
  private modalOpen = false
  private readonly heldKeys = new Set<string>()
  private disposed = false

  private readonly cleanups: (() => void)[] = []

  constructor(
    host: ChibiSceneHost,
    container: HTMLElement,
    callbacks: OfficeControllerCallbacks
  ) {
    this.host = host
    this.container = container
    this.callbacks = callbacks
    this.world3d = new OfficeWorld3D(host.scene, host.world)

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
      if (!this.activeStation || this.modalOpen) return
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

    host.followLogical(OFFICE_BASE_W / 2, OFFICE_BASE_H / 2, true)
    this.bindInput()
    host.start((dt) => this.tick(dt))
  }

  private bindInput(): void {
    const onPointerDown = (event: PointerEvent): void => {
      if (this.disposed || this.modalOpen || !this.selfActor) return
      if (event.button !== 0 && event.pointerType === "mouse") return
      if (isHudOrModalTarget(event.target)) return

      const pt = this.host.screenToLogical(event.clientX, event.clientY)
      if (!pt) return
      const tx = Math.max(30, Math.min(this.worldW - 30, pt.x))
      const ty = Math.max(40, Math.min(this.worldH - 24, pt.y))
      this.selfActor.target = { x: tx, y: ty }
      this.world3d.showTargetRing(tx, ty)
    }

    const onWheel = (event: WheelEvent): void => {
      if (this.disposed || this.modalOpen) return
      if (isHudOrModalTarget(event.target)) return
      event.preventDefault()
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
      const next = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, this.host.getTargetZoom() * factor)
      )
      this.host.setZoom(next)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (this.disposed) return
      if (event.key === "Escape" && this.modalOpen) {
        event.preventDefault()
        this.callbacks.onCloseModal?.()
        return
      }
      if (this.modalOpen || isTypingTarget(event.target)) return

      const code = event.key.toLowerCase()
      if (
        code === "w" ||
        code === "a" ||
        code === "s" ||
        code === "d" ||
        code === "arrowup" ||
        code === "arrowdown" ||
        code === "arrowleft" ||
        code === "arrowright"
      ) {
        if (code.startsWith("arrow")) {
          event.preventDefault()
        }
        this.heldKeys.add(code)
        if (this.selfActor) {
          this.selfActor.target = null
        }
        return
      }

      if (code === "e" && !event.repeat && this.activeStation) {
        event.preventDefault()
        this.triggerStation(this.activeStation)
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      this.heldKeys.delete(event.key.toLowerCase())
    }

    const onBlur = (): void => {
      this.heldKeys.clear()
    }

    this.container.addEventListener("pointerdown", onPointerDown)
    this.container.addEventListener("wheel", onWheel, { passive: false })
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)

    this.cleanups.push(() => {
      this.container.removeEventListener("pointerdown", onPointerDown)
      this.container.removeEventListener("wheel", onWheel)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    })
  }

  private triggerStation(station: OfficeStation): void {
    this.heldKeys.clear()
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
    const next = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, this.host.getTargetZoom() * factor)
    )
    this.host.setZoom(next)
  }

  setModalOpen(open: boolean): void {
    this.modalOpen = open
    if (open) {
      this.heldKeys.clear()
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

  /** Syncs team roster, desks, self character, and interactive stations from `GET /office/me`. */
  updateTeam(me: OfficeMe): void {
    if (this.disposed || !me.member || !me.self || !me.team) return

    this.selfRole = me.self.role
    this.teamName = me.team.name
    this.currentMonth = monthNumberFromPeriod(me.periodMonth)

    this.desks = buildDeskPositions(me.members)
    this.deskByUserId.clear()
    for (const desk of this.desks) {
      this.deskByUserId.set(desk.userId, desk)
    }

    const dims = computeOfficeDimensions(this.desks.length)
    const dimsChanged =
      dims.width !== this.host.world.logicalW ||
      dims.height !== this.host.world.logicalH
    this.worldW = dims.width
    this.worldH = dims.height
    if (dimsChanged) {
      this.host.setWorldSize(this.worldW, this.worldH)
    }
    this.obstacles = buildOfficeObstacles(this.desks)

    this.world3d.rebuildTeamProps(
      me.team.bossName,
      this.desks,
      me.self.userId,
      this.worldH
    )

    const selfDesk = this.deskByUserId.get(me.self.userId) ?? null
    this.stations = buildOfficeStations(
      me.self.role,
      selfDesk ? selfDesk.home : null,
      this.currentMonth
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

    const spawn =
      me.self.role === "boss"
        ? { x: OFFICE_BOSS_SPAWN.x, y: OFFICE_BOSS_SPAWN.y }
        : selfDesk
          ? { x: selfDesk.home.x, y: selfDesk.home.y }
          : {
              x: OFFICE_STAFF_FALLBACK_SPAWN.x,
              y: OFFICE_STAFF_FALLBACK_SPAWN.y,
            }

    if (!this.selfActor || this.selfActor.userId !== me.self.userId) {
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
        facing: "down",
        moving: false,
        target: null,
      }
      this.host.followLogical(spawn.x, spawn.y - 25, true)
      this.callbacks.onSelfState?.({
        x: spawn.x,
        y: spawn.y,
        facing: "down",
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
      if (dimsChanged) {
        const selfPt = logicalToWorld(
          this.selfActor.x,
          this.selfActor.y,
          this.host.world
        )
        this.selfActor.rig.root.position.set(selfPt.x, 0, selfPt.z)
        this.host.followLogical(this.selfActor.x, this.selfActor.y - 25, true)
      }
    }

    if (dimsChanged) {
      for (const peer of this.remotePeers.values()) {
        const peerPt = logicalToWorld(peer.x, peer.y, this.host.world)
        peer.rig.root.position.set(peerPt.x, 0, peerPt.z)
      }
    }

    // Refresh Standee & Wall Screen with latest role/team context
    this.world3d.updateStandee(
      this.latestLeaderboard,
      this.teamName,
      this.selfRole === "staff"
    )
    if (this.latestMeeting !== null) {
      this.world3d.updateMeetingScreen(this.latestMeeting)
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

  /**
   * Attendance status dot visibility rule (Spec §3.2):
   * - Boss has NO dot.
   * - Viewer is Boss: sees dot on ALL staff.
   * - Viewer is Staff: sees dot on SELF ONLY.
   * - Hidden on weekends/holidays (`!attendanceWorkday`).
   */
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
  ): void {
    const dom = this.ensureNameplate(userId)

    // Own-desk declutter rule (Spec §3.2): hide non-self staff overhead nameplate within < 70 px of desk home
    if (!isSelf && role === "staff") {
      const desk = this.deskByUserId.get(userId)
      if (
        desk &&
        Math.hypot(x - desk.home.x, y - desk.home.y) <
          OFFICE_DESK_DECLUTTER_RADIUS
      ) {
        dom.el.style.display = "none"
        return
      }
    }

    const pt = this.host.projectLogicalToScreen(x, y, headHeight + 0.22)
    if (!pt.visible) {
      dom.el.style.display = "none"
      return
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
  }

  private tick(dt: number): void {
    if (this.disposed) return

    this.world3d.update(dt)

    // 1. Update local self movement (WASD/Arrows or click-to-move)
    if (this.selfActor) {
      const self = this.selfActor
      let vx = 0
      let vy = 0

      if (!this.modalOpen) {
        if (this.heldKeys.has("w") || this.heldKeys.has("arrowup")) vy -= 1
        if (this.heldKeys.has("s") || this.heldKeys.has("arrowdown")) vy += 1
        if (this.heldKeys.has("a") || this.heldKeys.has("arrowleft")) vx -= 1
        if (this.heldKeys.has("d") || this.heldKeys.has("arrowright")) vx += 1
      }

      let moved = false
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
          }
        }
      }

      const wasMoving = self.moving
      self.moving = moved
      const pt = logicalToWorld(self.x, self.y, this.host.world)
      self.rig.root.position.set(pt.x, 0, pt.z)
      self.rig.update(dt, {
        anim: moved ? "walk" : "idle",
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

      this.host.followLogical(self.x, self.y - 25)
      this.updateActorNameplate(
        self.userId,
        self.name,
        self.role,
        true,
        self.x,
        self.y,
        self.rig.headHeight
      )

      // Proximity station check (< 95 px)
      const nearest = this.modalOpen
        ? null
        : findNearestStation(
            self.x,
            self.y,
            this.stations,
            OFFICE_STATION_RADIUS
          )
      this.activeStation = nearest
      if (nearest) {
        const selfPlatePt = this.host.projectLogicalToScreen(
          self.x,
          self.y,
          self.rig.headHeight + 0.22
        )
        // Own-desk prompt anchors cleanly below character's feet on the open corridor
        // so it never overlaps the self overhead nameplate or desk nameplate.
        const anchorBelowFeet = nearest.id === "mydesk"
        const promptPt = this.host.projectLogicalToScreen(
          nearest.x,
          nearest.y,
          anchorBelowFeet ? 0.0 : 1.55
        )
        if (promptPt.visible) {
          if (this.promptLabelEl.textContent !== nearest.label) {
            this.promptLabelEl.textContent = nearest.label
            this.promptBtn.setAttribute(
              "aria-label",
              `${nearest.label} (nhấn E để mở)`
            )
          }
          // Display first so offsetWidth/offsetHeight reflect the live pill dimensions
          if (this.promptBtn.style.display === "none") {
            this.promptBtn.style.display = "inline-flex"
          }
          const vp = this.host.getViewportSize()
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
            selfPlatePt.visible &&
            Math.abs(px - selfPlatePt.x) < 170 &&
            Math.abs(py - selfPlatePt.y) < 46
          ) {
            py = Math.min(py, selfPlatePt.y - 44)
          }
          py = anchorBelowFeet
            ? Math.max(
                58,
                Math.min(Math.max(58, vp.height - measuredH - 28), py)
              )
            : Math.max(
                58 + measuredH,
                Math.min(Math.max(58 + measuredH, vp.height - 28), py)
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
      const isWalking = peer.moving || dist > 3
      const pt = logicalToWorld(peer.x, peer.y, this.host.world)
      peer.rig.root.position.set(pt.x, 0, pt.z)
      peer.rig.update(dt, {
        anim: isWalking ? "walk" : "idle",
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
    for (const cleanup of this.cleanups) {
      cleanup()
    }
    this.cleanups.length = 0

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

    this.overlayEl.remove()
    this.world3d.dispose()
  }
}
