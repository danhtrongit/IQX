export type SpaceRoom = "floor" | "office"

export type SpaceLoadingMode = "enter" | "door"

/** Exit duration for full-cover enter loading screen (matches the 420 ms opacity fade). */
export const EXIT_DURATION_ENTER_MS = 440

/** Exit duration for door panels sliding open (close ~240 ms + open ~320 ms ≈ 0.56 s). */
export const EXIT_DURATION_DOOR_MS = 320

/** Short fade-only exit duration when prefers-reduced-motion is enabled. */
export const EXIT_DURATION_REDUCED_MS = 160

/** Rotation cadence for friendly tips in enter mode (~3.5 s). */
export const TIP_ROTATE_INTERVAL_MS = 3500

/** Clamps arbitrary numeric input to the [0, 1] range. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/**
 * Computes monotonic progress in [0, 1].
 * Never goes backwards visually within a loading session; snaps to 1 on done.
 */
export function computeMonotonicProgress(
  previous: number,
  incoming: number,
  done: boolean
): number {
  if (done) return 1
  return Math.max(clampProgress(previous), clampProgress(incoming))
}

/** Converts a [0, 1] progress value into an integer percentage [0, 100]. */
export function progressToPercent(progress: number): number {
  return Math.round(clampProgress(progress) * 100)
}

/** Returns the exit animation duration matching mode and reduced-motion preference. */
export function getExitDurationMs(
  mode: SpaceLoadingMode,
  reducedMotion: boolean
): number {
  if (reducedMotion) return EXIT_DURATION_REDUCED_MS
  return mode === "door" ? EXIT_DURATION_DOOR_MS : EXIT_DURATION_ENTER_MS
}

/** Safe client check for `prefers-reduced-motion: reduce`. */
export function detectReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Formats the main heading shown in enter mode. */
export function formatRoomTitle(room: SpaceRoom, teamName?: string): string {
  if (room === "floor") return "Khu Giao Dịch"
  const trimmed = teamName?.trim()
  return trimmed ? `Văn phòng · ${trimmed}` : "Văn phòng"
}

/** Formats the bold room sign shown on the double doors in door mode. */
export function formatDoorSign(room: SpaceRoom): string {
  return room === "office" ? "VĂN PHÒNG NHÓM" : "KHU GIAO DỊCH"
}
