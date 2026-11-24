/**
 * Shared door transition constants, timing, reduced-motion detection,
 * and obstacle-aware pathfinding helpers for Khu giao dịch <-> Khu Văn phòng.
 */
import type { OfficeRect } from "@/pages/office/engine/office-layout.ts"
import { NavGrid, type Point } from "@/pages/trading-floor/engine/nav.ts"

/** Maximum auto-walk time before skipping straight to door-open + fade. */
export const DOOR_MAX_WALK_SECONDS = 4.0

/** Door hinge swing-open animation duration in seconds (~0.35 s). */
export const DOOR_SWING_OPEN_S = 0.35

/** Brief step-through animation duration after the door opens. */
export const DOOR_STEP_THROUGH_S = 0.26

/** Screen fade-to-dark duration in milliseconds (~0.35 s). */
export const DOOR_FADE_OUT_MS = 350

/** Screen fade-in duration in milliseconds after destination room boots. */
export const DOOR_FADE_IN_MS = 320

/** Door swing-close animation duration after spawning inside destination room. */
export const DOOR_SWING_CLOSE_S = 0.42

/** Quick cross-fade duration under `prefers-reduced-motion: reduce`. */
export const DOOR_REDUCED_FADE_MS = 150

/** Exact guest LoginPrompt headline when clicking the Floor -> Office door/button. */
export const FLOOR_GUEST_OFFICE_PROMPT = "Đăng nhập để vào Văn phòng nhóm"

/** Exact toast copy when a signed-in user without a team tries to enter Office from Floor. */
export const OFFICE_NON_MEMBER_TOAST =
  "Bạn chưa thuộc nhóm nào. Liên hệ trưởng nhóm để được thêm vào văn phòng."

/** Handle exposed by each room's 3D controller so the shell can trigger door exit animations. */
export interface RoomDoorHandle {
  beginDoorExit: (onFadeStart: () => void) => void
}

/** True when the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Computes total polyline length from `start` through `waypoints`. */
export function computePathLength(
  start: Point,
  waypoints: readonly Point[]
): number {
  let total = 0
  let px = start.x
  let py = start.y
  for (const pt of waypoints) {
    total += Math.hypot(pt.x - px, pt.y - py)
    px = pt.x
    py = pt.y
  }
  return total
}

/**
 * Evaluates whether a path from `start` through `waypoints` at `walkSpeed`
 * is reachable within `maxSeconds` (default 4 s).
 */
export function shouldAutoWalkToDoor(
  start: Point,
  target: Point,
  waypoints: readonly Point[],
  walkSpeed: number,
  maxSeconds = DOOR_MAX_WALK_SECONDS,
  alreadyAtDoorDist = 30
): {
  mode: "at-door" | "walk" | "skip"
  estimatedSeconds: number
} {
  const directDist = Math.hypot(target.x - start.x, target.y - start.y)
  if (directDist <= alreadyAtDoorDist) {
    return { mode: "at-door", estimatedSeconds: 0 }
  }
  if (waypoints.length === 0 || walkSpeed <= 0) {
    return { mode: "skip", estimatedSeconds: Infinity }
  }
  const len = computePathLength(start, waypoints)
  const seconds = len / walkSpeed
  if (seconds <= maxSeconds) {
    return { mode: "walk", estimatedSeconds: seconds }
  }
  return { mode: "skip", estimatedSeconds: seconds }
}

const OFFICE_NAV_CELL = 24
const OFFICE_ACTOR_PAD_X = 14
const OFFICE_ACTOR_PAD_TOP = 16
const OFFICE_ACTOR_PAD_BOTTOM = 4

/**
 * Computes an obstacle-avoiding A* path across the Office floorplan to the exit door
 * using the shared `NavGrid` with exact office actor footprint padding.
 */
export function findOfficeDoorPath(
  from: Point,
  to: Point,
  obstacles: readonly OfficeRect[],
  worldW: number,
  worldH: number
): Point[] {
  const grid = new NavGrid(worldW, worldH, OFFICE_NAV_CELL)
  // Outer office walkable bounds match `isOfficeBlocked`: x in [30..worldW-30], y in [40..worldH-24]
  grid.blockRect(0, 0, 30, worldH)
  grid.blockRect(worldW - 30, 0, 30, worldH)
  grid.blockRect(0, 0, worldW, 40)
  grid.blockRect(0, worldH - 24, worldW, 24)

  for (const r of obstacles) {
    // Expand obstacle by actor footprint `[x-12, x+12] × [y-14, y+2]`
    grid.blockRect(
      r.x - OFFICE_ACTOR_PAD_X,
      r.y - OFFICE_ACTOR_PAD_BOTTOM,
      r.w + OFFICE_ACTOR_PAD_X * 2,
      r.h + OFFICE_ACTOR_PAD_TOP + OFFICE_ACTOR_PAD_BOTTOM
    )
  }

  return grid.findPath(from, to)
}
