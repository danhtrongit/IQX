/**
 * Boot progress for the 3D rooms: Vietnamese stage labels and the 0..1 progress ranges each boot phase
 * owns, shared by `startFloor` / `startOffice` and shown by `SpaceLoadingScreen`.
 *
 * 0.00-0.05 fonts · 0.05-0.15 WebGL host · 0.15-0.60 scene build · 0.60-0.70 people / desks ·
 * 0.70-0.95 shader warm-up (ready/total programs) · 0.95-1.00 texture uploads + first frame.
 */
import type { ScenePrepareProgress } from "@/lib/chibi-3d/scene-host.ts"

export type BootProgressFn = (progress: number, stage: string) => void

export const BOOT_STAGES = {
  fonts: "Đang tải phông chữ",
  gpu: "Đang khởi tạo đồ họa 3D",
  floorBuild: "Đang dựng sàn giao dịch",
  floorActors: "Đang mời nhà đầu tư vào sàn",
  officeBuild: "Đang dựng văn phòng",
  officeActors: "Đang kê bàn ghế cho nhân viên",
  lights: "Đang chuẩn bị ánh sáng",
  images: "Đang tải hình ảnh",
} as const

export const BOOT_RANGES = {
  fonts: [0, 0.05],
  gpu: [0.05, 0.15],
  build: [0.15, 0.6],
  actors: [0.6, 0.7],
  lights: [0.7, 0.95],
  images: [0.95, 1],
} as const satisfies Record<string, readonly [number, number]>

/** Maps a phase-local fraction (0..1) into its global progress range. */
export function phaseProgress(
  range: readonly [number, number],
  fraction: number
): number {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  return range[0] + (range[1] - range[0]) * f
}

/** Stage label + global progress for a scene-host warm-up update. */
export function describePrepareProgress(p: ScenePrepareProgress): {
  progress: number
  stage: string
} {
  if (p.phase === "shaders") {
    return {
      progress: phaseProgress(BOOT_RANGES.lights, p.fraction),
      stage:
        p.total > 0
          ? `${BOOT_STAGES.lights} (${Math.min(p.ready, p.total)}/${p.total})`
          : BOOT_STAGES.lights,
    }
  }
  return {
    progress: phaseProgress(BOOT_RANGES.images, p.fraction * 0.9),
    stage: BOOT_STAGES.images,
  }
}

export interface BootReporter {
  report: (progress: number, stage: string) => void
  reportPrepare: (p: ScenePrepareProgress) => void
}

/**
 * Wraps a progress callback: progress never goes backwards and duplicate updates (same whole percent and
 * same label) are dropped, so React only re-renders the loading screen when something visible changes.
 */
export function createBootReporter(onProgress?: BootProgressFn): BootReporter {
  let lastPercent = -1
  let lastStage = ""
  let max = 0
  const report = (progress: number, stage: string): void => {
    if (!onProgress) return
    const clamped = Number.isFinite(progress)
      ? Math.min(1, Math.max(0, progress))
      : 0
    max = Math.max(max, clamped)
    const percent = Math.round(max * 100)
    if (percent === lastPercent && stage === lastStage) return
    lastPercent = percent
    lastStage = stage
    try {
      onProgress(max, stage)
    } catch {
      // A broken listener must never break the room boot.
    }
  }
  return {
    report,
    reportPrepare: (p) => {
      const next = describePrepareProgress(p)
      report(next.progress, next.stage)
    },
  }
}
