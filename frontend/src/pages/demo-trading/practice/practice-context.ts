import { createContext, useContext } from "react"

import type {
  PracticeChart,
  PracticeConfig,
  PracticeFailure,
  PracticeForm,
  PracticeOp,
  PracticePreview,
  PracticeRun,
  PracticeState,
  Side,
} from "./practice-api"
import type { PracticeFormState, PracticeFormValidation } from "./practice-model"
import type { PlaybackControls, PlaybackStore } from "./practice-playback"

export type DraftStatus = "idle" | "saving" | "saved" | "error"

/**
 * Where the screen is, derived from the server state, the displayed run and the replay.
 *  - ready: nothing started for this case, the form is editable
 *  - starting: the start request is in flight (form already locked)
 *  - computing / failed: a locked run without a result yet (retry keeps the same config)
 *  - replaying: result available, replay running or paused
 *  - completed: replay done, "Tập luyện tiếp" allowed
 *  - set_completed: 30/30 done (no wrap, no 31st case)
 *  - viewing_past: read-only older run
 */
export type PracticePhase = "loading" | "error" | "ready" | "starting" | "computing" | "failed" | "replaying" | "completed" | "set_completed" | "viewing_past"

export type PracticeContextValue = {
  indicatorId: string
  indicatorName: string
  state: PracticeState | null
  spec: PracticeForm | null
  phase: PracticePhase
  /** Failure of the first state load (403 -> lesson link, 404, network...). */
  loadFailure: PracticeFailure | null
  reload: () => void

  side: Side
  setSide: (side: Side) => void

  /** Form shown right now: the draft while editable, the locked config otherwise. */
  form: PracticeFormState | null
  validation: PracticeFormValidation | null
  locked: boolean
  draftStatus: DraftStatus
  editEnabled: (side: Side, enabled: boolean) => void
  editParam: (side: Side, key: string, text: string) => void
  editOp: (side: Side, ruleId: string, op: PracticeOp) => void
  editHold: (text: string) => void
  resetSide: () => void

  preview: PracticePreview | null
  previewFetching: boolean
  previewFailure: PracticeFailure | null
  retryPreview: () => void

  /** Displayed run (current or an older one being viewed); result/chart only once it succeeded. */
  run: PracticeRun | null
  runFailure: PracticeFailure | null
  chart: PracticeChart | null
  lockedConfig: PracticeConfig | null

  start: () => Promise<boolean>
  retryStart: () => Promise<boolean>
  startPending: boolean
  startFailure: PracticeFailure | null
  next: () => Promise<void>
  nextPending: boolean
  nextFailure: PracticeFailure | null

  viewRun: (runId: string | null) => void
  viewingPast: boolean
  /** True when the replay of the displayed run finished or was skipped. */
  replayDone: boolean
  canNext: boolean
  /**
   * False for a moment after the phase changed. The primary buttons of consecutive phases sit at
   * the same spot (Bắt đầu -> Xem kết quả ngay -> Tập luyện tiếp -> Bắt đầu), so a double click must
   * not fire the next phase's action by accident.
   */
  actionsArmed: boolean

  playbackStore: PlaybackStore
  playbackControls: PlaybackControls | null
}

export const PracticeContext = createContext<PracticeContextValue | null>(null)

export function usePractice(): PracticeContextValue {
  const value = useContext(PracticeContext)
  if (!value) throw new Error("usePractice must be used within PracticeProvider")
  return value
}
