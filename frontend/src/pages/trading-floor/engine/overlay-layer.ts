/**
 * Crisp DOM projection layer mounted over the Trading Floor WebGL canvas.
 * Renders retina-sharp Vietnamese nameplates (with IT/SACO badges + decluttering),
 * speech bubbles, Hall of Fame statue plaques, FX banners (Gáy / Khấn), and "+10 xu" popups.
 */
import type { ProjectedPoint } from "@/lib/chibi-3d/types.ts"

import type { NameBadge } from "../net/types.ts"
import { prefersReducedMotion } from "./reduced-motion.ts"
import { liftTags, type TagBox } from "./tags.ts"

export type NameplateKind = "self" | "peer" | "npc"
export type BubbleSide = "above" | "right"
export type FxBannerTone = "gay" | "khan"

export interface NameplateSpec {
  id: string
  name: string
  kind: NameplateKind
  badges: readonly NameBadge[]
}

export interface ScreenBox {
  x: number
  y: number
  w: number
  h: number
}

interface NameplateEntry {
  id: string
  kind: NameplateKind
  signature: string
  el: HTMLDivElement
  width: number
  height: number
  screenX: number
  screenY: number
  depth: number
  visible: boolean
  lift: number
  liftTarget: number
}

interface BubbleEntry {
  id: string
  side: BubbleSide
  el: HTMLDivElement
  expiresAt: number
  fadeStarted: boolean
  screenX: number
  screenY: number
  visible: boolean
}

interface StatuePlaqueEntry {
  rank: 1 | 2 | 3
  signature: string
  el: HTMLDivElement
  nameEl: HTMLDivElement
  subEl: HTMLDivElement
}

interface FloatingBanner {
  id: number
  lx: number
  ly: number
  heightWorld: number
  el: HTMLDivElement
  bornAt: number
  stayMs: number
  fadeMs: number
}

interface PlusXuPopup {
  id: number
  lx: number
  ly: number
  heightWorld: number
  el: HTMLDivElement
  bornAt: number
  durationMs: number
}

const TAG_DECLUTTER_MS = 120
const TAG_GAP_PX = 4
const TAG_MAX_STEPS = 4
const BUBBLE_STAY_MS = 4200
const BUBBLE_FADE_MS = 300

function badgeSignature(
  name: string,
  kind: NameplateKind,
  badges: readonly NameBadge[]
): string {
  const b = badges.map((item) => `${item.tone}:${item.text}`).join(",")
  return `${kind}|${name}|${b}`
}

export class OverlayLayer {
  private readonly root: HTMLDivElement
  private readonly nameplates = new Map<string, NameplateEntry>()
  private readonly bubbles = new Map<string, BubbleEntry>()
  private readonly plaques = new Map<1 | 2 | 3, StatuePlaqueEntry>()
  private readonly banners: FloatingBanner[] = []
  private readonly popups: PlusXuPopup[] = []
  private nextId = 1
  private nextDeclutterMs = 0
  private disposed = false

  constructor(container: HTMLElement) {
    const el = document.createElement("div")
    el.className = "tf-overlay-layer"
    el.setAttribute("aria-hidden", "true")
    container.appendChild(el)
    this.root = el
  }

  /** Creates or updates a character nameplate DOM node (text & IT/SACO pills). */
  setNameplate(spec: NameplateSpec): void {
    if (this.disposed) return
    const sig = badgeSignature(spec.name, spec.kind, spec.badges)
    const existing = this.nameplates.get(spec.id)
    if (existing && existing.signature === sig) return

    const el = existing?.el ?? document.createElement("div")
    el.className = "tf-nameplate"
    el.dataset.kind = spec.kind
    el.replaceChildren()

    for (const badge of spec.badges) {
      const pill = document.createElement("span")
      pill.className =
        badge.tone === "owner" ? "tf-badge-it" : "tf-badge-saco"
      pill.textContent = badge.text
      el.appendChild(pill)
    }

    const label = document.createElement("span")
    label.className = "tf-nameplate-label"
    label.textContent = spec.name
    el.appendChild(label)

    if (!existing) {
      el.style.display = "none"
      this.root.appendChild(el)
      this.nameplates.set(spec.id, {
        id: spec.id,
        kind: spec.kind,
        signature: sig,
        el,
        width: 0,
        height: 0,
        screenX: 0,
        screenY: 0,
        depth: 0,
        visible: false,
        lift: 0,
        liftTarget: 0,
      })
    } else {
      existing.kind = spec.kind
      existing.signature = sig
      existing.width = 0
      existing.height = 0
    }
  }

  removeNameplate(id: string): void {
    const entry = this.nameplates.get(id)
    if (!entry) return
    entry.el.remove()
    this.nameplates.delete(id)
  }

  private getViewportSize(): { vw: number; vh: number } {
    const vw =
      this.root.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 1280)
    const vh =
      this.root.clientHeight ||
      (typeof window !== "undefined" ? window.innerHeight : 720)
    return { vw: Math.max(1, vw), vh: Math.max(1, vh) }
  }

  /** Updates screen coordinates for a nameplate after projecting its 3D anchor. */
  positionNameplate(
    id: string,
    pt: ProjectedPoint,
    sortDepth: number
  ): void {
    const entry = this.nameplates.get(id)
    if (!entry) return
    entry.visible = pt.visible
    entry.screenY = pt.y
    entry.depth = sortDepth
    if (!pt.visible) {
      entry.screenX = pt.x
      entry.el.style.display = "none"
      return
    }
    entry.el.style.display = "inline-flex"
    if (entry.width <= 0 || entry.height <= 0) {
      entry.width = Math.max(44, entry.el.offsetWidth || 72)
      entry.height = Math.max(20, entry.el.offsetHeight || 22)
    }
    const { vw } = this.getViewportSize()
    const halfW = entry.width / 2
    const padX = 6
    let clampedX = pt.x
    if (pt.x >= 0 && pt.x <= vw && halfW + padX < vw - halfW - padX) {
      clampedX = Math.max(halfW + padX, Math.min(vw - halfW - padX, pt.x))
    }
    entry.screenX = clampedX
    const y = pt.y - entry.lift
    entry.el.style.transform = `translate3d(${Math.round(clampedX)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`
    entry.el.style.zIndex = String(100 + Math.round(sortDepth * 0.1))
  }

  /** Returns the current CSS hit box of a nameplate (used for SACO direct-chat tap targets). */
  getNameplateBox(id: string): ScreenBox | null {
    const entry = this.nameplates.get(id)
    if (!entry || !entry.visible) return null
    const w = entry.width || 72
    const h = entry.height || 22
    return {
      x: entry.screenX - w / 2,
      y: entry.screenY - entry.lift - h,
      w,
      h,
    }
  }

  /** Shows or replaces a speech bubble over/beside a character (`4200ms` stay + `300ms` fade). */
  showBubble(
    id: string,
    text: string,
    side: BubbleSide = "above",
    nowMs = performance.now()
  ): void {
    if (this.disposed) return
    const existing = this.bubbles.get(id)
    const el = existing?.el ?? document.createElement("div")
    el.className =
      side === "right" ? "tf-bubble tf-bubble-right" : "tf-bubble"
    el.textContent = text
    el.style.opacity = "1"
    if (!existing) {
      el.style.display = "none"
      this.root.appendChild(el)
    }
    this.bubbles.set(id, {
      id,
      side,
      el,
      expiresAt: nowMs + BUBBLE_STAY_MS,
      fadeStarted: false,
      screenX: existing?.screenX ?? 0,
      screenY: existing?.screenY ?? 0,
      visible: false,
    })
  }

  removeBubble(id: string): void {
    const entry = this.bubbles.get(id)
    if (!entry) return
    entry.el.remove()
    this.bubbles.delete(id)
  }

  positionBubble(id: string, pt: ProjectedPoint): void {
    const entry = this.bubbles.get(id)
    if (!entry) return
    entry.visible = pt.visible
    entry.screenX = pt.x
    entry.screenY = pt.y
    if (!pt.visible) {
      entry.el.style.display = "none"
      return
    }
    // Display before reading offsetWidth/offsetHeight so clamping uses live measured size
    entry.el.style.display = "block"
    const { vw, vh } = this.getViewportSize()
    const bubbleW = Math.max(48, entry.el.offsetWidth || 200)
    const bubbleH = Math.max(28, entry.el.offsetHeight || 42)
    const padX = 10
    const compact = vw <= 640
    const minTop = vw <= 540 ? 114 : compact ? 104 : 68
    const maxTop = Math.max(minTop, vh - (compact ? 156 : 96) - bubbleH)
    const maxLeft = Math.max(padX, vw - padX - bubbleW)

    let left: number
    let top: number

    if (entry.side === "right") {
      // Right-of-head placement on wide screens; cleanly clamped inside viewport & below top HUD on narrow mobile
      left = Math.max(padX, Math.min(maxLeft, pt.x + 14))
      top = Math.max(minTop, Math.min(maxTop, pt.y - bubbleH / 2))
    } else {
      const tag = this.nameplates.get(id)
      const tagExtra =
        tag && tag.visible ? (tag.height || 22) + tag.lift + 8 : 0
      const halfW = bubbleW / 2
      const cx =
        halfW + padX >= vw - halfW - padX
          ? vw / 2
          : Math.max(halfW + padX, Math.min(vw - halfW - padX, pt.x))
      left = Math.max(padX, Math.min(maxLeft, cx - halfW))
      top = pt.y - tagExtra - bubbleH

      // Lift cleanly above any nearby visible actor's nameplate that our clamped bubble would overlap
      const boxPad = 4
      for (const other of this.nameplates.values()) {
        if (other.id === id || !other.visible) continue
        const ow = other.width || 72
        const oh = other.height || 22
        const ox = other.screenX - ow / 2
        const oy = other.screenY - other.lift - oh
        const overlapX =
          left < ox + ow + boxPad && left + bubbleW + boxPad > ox
        const overlapY =
          top < oy + oh + boxPad && top + bubbleH + boxPad > oy
        if (overlapX && overlapY) {
          top = Math.min(top, oy - bubbleH - 6)
        }
      }

      top = Math.max(minTop, Math.min(maxTop, top))
    }

    entry.el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`
  }

  /** Creates or updates a Hall of Fame statue plaque beneath its podium. */
  setStatuePlaque(
    rank: 1 | 2 | 3,
    name: string,
    subtitle: string | null,
    filled: boolean
  ): void {
    if (this.disposed) return
    const sig = `${filled ? 1 : 0}|${name}|${subtitle ?? ""}`
    const existing = this.plaques.get(rank)
    if (existing && existing.signature === sig) return

    if (!existing) {
      const el = document.createElement("div")
      el.className = "tf-statue-plaque"
      el.dataset.rank = String(rank)
      el.style.display = "none"

      const nameEl = document.createElement("div")
      nameEl.className = "tf-statue-name"
      const subEl = document.createElement("div")
      subEl.className = "tf-statue-sub"
      el.append(nameEl, subEl)
      this.root.appendChild(el)

      const entry: StatuePlaqueEntry = {
        rank,
        signature: sig,
        el,
        nameEl,
        subEl,
      }
      this.plaques.set(rank, entry)
      this.applyStatuePlaqueContent(entry, name, subtitle, filled)
    } else {
      existing.signature = sig
      this.applyStatuePlaqueContent(existing, name, subtitle, filled)
    }
  }

  private applyStatuePlaqueContent(
    entry: StatuePlaqueEntry,
    name: string,
    subtitle: string | null,
    filled: boolean
  ): void {
    entry.el.dataset.filled = filled ? "1" : "0"
    entry.nameEl.textContent = name
    if (subtitle) {
      entry.subEl.textContent = subtitle
      entry.subEl.style.display = "block"
    } else {
      entry.subEl.textContent = ""
      entry.subEl.style.display = "none"
    }
  }

  positionStatuePlaque(rank: 1 | 2 | 3, pt: ProjectedPoint): void {
    const entry = this.plaques.get(rank)
    if (!entry) return
    if (!pt.visible) {
      entry.el.style.display = "none"
      return
    }
    entry.el.style.display = "flex"
    entry.el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y + 6)}px, 0) translate(-50%, 0)`
  }

  /** Shows a celebratory dark-red & gold banner for "gáy" (5s) or "khấn" (4.5s). */
  showFxBanner(
    lx: number,
    ly: number,
    heightWorld: number,
    tone: FxBannerTone,
    headerText: string,
    bodyText: string,
    stayMs: number,
    nowMs = performance.now()
  ): void {
    if (this.disposed) return
    const el = document.createElement("div")
    el.className = `tf-fx-banner tf-fx-banner-${tone}`
    const header = document.createElement("div")
    header.className = "tf-fx-banner-head"
    header.textContent = headerText
    const body = document.createElement("div")
    body.className = "tf-fx-banner-body"
    body.textContent = bodyText
    el.append(header, body)
    el.style.display = "none"
    this.root.appendChild(el)

    this.banners.push({
      id: this.nextId++,
      lx,
      ly,
      heightWorld,
      el,
      bornAt: nowMs,
      stayMs,
      fadeMs: 350,
    })
  }

  /** Shows a floating golden "+10 xu" pickup popup. */
  showPlusXu(
    lx: number,
    ly: number,
    heightWorld: number,
    value: number,
    nowMs = performance.now()
  ): void {
    if (this.disposed) return
    const el = document.createElement("div")
    el.className = "tf-plus-xu"
    el.textContent = `+${value} xu`
    el.style.display = "none"
    this.root.appendChild(el)
    this.popups.push({
      id: this.nextId++,
      lx,
      ly,
      heightWorld,
      el,
      bornAt: nowMs,
      durationMs: 760,
    })
  }

  /**
   * Advances tag decluttering, lift easing, speech bubble expiration, FX banners, and "+10 xu" popups.
   */
  update(
    dtMs: number,
    nowMs: number,
    projectLogical: (
      lx: number,
      ly: number,
      heightWorld: number
    ) => ProjectedPoint
  ): void {
    if (this.disposed) return

    // 1. Declutter overlapping nameplates every 120ms (front-most figure stays anchored)
    if (nowMs >= this.nextDeclutterMs) {
      this.nextDeclutterMs = nowMs + TAG_DECLUTTER_MS
      const visibleEntries: NameplateEntry[] = []
      for (const entry of this.nameplates.values()) {
        if (entry.visible) visibleEntries.push(entry)
      }
      visibleEntries.sort((a, b) => b.depth - a.depth)
      const boxes: TagBox[] = visibleEntries.map((e) => {
        const w = e.width || 72
        const h = e.height || 22
        return {
          x: e.screenX - w / 2,
          y: e.screenY - h,
          w,
          h,
        }
      })
      const lifts = liftTags(boxes, TAG_GAP_PX, TAG_MAX_STEPS)
      visibleEntries.forEach((e, idx) => {
        e.liftTarget = lifts[idx] ?? 0
      })
    }

    // Smoothly ease lift offsets
    const ease = Math.min(1, dtMs / 90)
    for (const entry of this.nameplates.values()) {
      if (entry.lift !== entry.liftTarget) {
        const gap = entry.liftTarget - entry.lift
        entry.lift =
          Math.abs(gap) < 0.4 ? entry.liftTarget : entry.lift + gap * ease
      }
    }

    // 2. Expire speech bubbles gracefully
    for (const [id, bubble] of [...this.bubbles]) {
      const remaining = bubble.expiresAt - nowMs
      if (remaining <= -BUBBLE_FADE_MS) {
        bubble.el.remove()
        this.bubbles.delete(id)
      } else if (remaining <= 0 && !bubble.fadeStarted) {
        bubble.fadeStarted = true
        bubble.el.style.opacity = "0"
      }
    }

    const reducedMotion = prefersReducedMotion()

    // 3. Project & animate FX banners
    for (let i = this.banners.length - 1; i >= 0; i -= 1) {
      const b = this.banners[i]!
      const age = nowMs - b.bornAt
      if (age >= b.stayMs + b.fadeMs) {
        b.el.remove()
        this.banners.splice(i, 1)
        continue
      }
      const pt = projectLogical(b.lx, b.ly, b.heightWorld)
      if (!pt.visible) {
        b.el.style.display = "none"
        continue
      }
      const riseT = Math.min(1, age / 500)
      const risePx = reducedMotion ? 10 : 22 * (1 - (1 - riseT) * (1 - riseT))
      const alpha =
        age < 180
          ? age / 180
          : age > b.stayMs
            ? Math.max(0, 1 - (age - b.stayMs) / b.fadeMs)
            : 1
      const popScale = reducedMotion
        ? 1
        : age < 140
          ? 0.72 + (age / 140) * 0.34
          : age < 250
            ? 1.06 - ((age - 140) / 110) * 0.06
            : 1
      b.el.style.display = "flex"
      b.el.style.opacity = alpha.toFixed(3)
      b.el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y - risePx)}px, 0) translate(-50%, -100%) scale(${popScale.toFixed(3)})`
    }

    // 4. Project & animate "+10 xu" popups
    for (let i = this.popups.length - 1; i >= 0; i -= 1) {
      const p = this.popups[i]!
      const age = nowMs - p.bornAt
      if (age >= p.durationMs) {
        p.el.remove()
        this.popups.splice(i, 1)
        continue
      }
      const pt = projectLogical(p.lx, p.ly, p.heightWorld)
      if (!pt.visible) {
        p.el.style.display = "none"
        continue
      }
      const t = age / p.durationMs
      const floatPx = reducedMotion ? 12 : 38 * (1 - (1 - t) * (1 - t))
      const alpha = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45)
      p.el.style.display = "block"
      p.el.style.opacity = alpha.toFixed(3)
      p.el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y - floatPx)}px, 0) translate(-50%, -100%)`
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.nameplates.clear()
    this.bubbles.clear()
    this.plaques.clear()
    this.banners.length = 0
    this.popups.length = 0
    this.root.remove()
  }
}
