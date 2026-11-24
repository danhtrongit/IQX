import { type JSX, useEffect, useRef, useState } from "react"

import {
  ChibiMascotSvg,
  DoorSpinnerCoinSvg,
  FloorMiniTicker,
  OfficeDeskAccentSvg,
  ProgressRunnerSvg,
  SparklesOverlay,
  ThanTaiCoinSvg,
} from "./LoadingArt.tsx"
import {
  clampProgress,
  computeMonotonicProgress,
  detectReducedMotion,
  formatDoorSign,
  formatRoomTitle,
  getExitDurationMs,
  progressToPercent,
  type SpaceRoom,
  TIP_ROTATE_INTERVAL_MS,
} from "./loading-helpers.ts"
import { DEFAULT_STAGE_TEXT, getRoomTips } from "./loading-tips.ts"
import "./space-loading.css"

export type { SpaceRoom }

export type SpaceLoadingProps = {
  room: SpaceRoom
  progress: number /* 0..1, may jump or stay */
  stage?: string /* Vietnamese status text e.g. "Đang dựng sàn giao dịch" */
  mode: "enter" | "door" /* first entry vs switching rooms through a door */
  done: boolean /* when true play the exit animation then call onExited */
  onExited?: () => void
  teamName?: string /* office: "Nhóm Trưởng Nhóm An" */
}

type LoadingPhase = "visible" | "exiting" | "exited"

export function SpaceLoadingScreen({
  room,
  progress,
  stage,
  mode,
  done,
  onExited,
  teamName,
}: SpaceLoadingProps): JSX.Element | null {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    detectReducedMotion()
  )

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches)
    }
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handleChange)
      return () => {
        mql.removeEventListener("change", handleChange)
      }
    }
    return undefined
  }, [])

  const onExitedRef = useRef(onExited)
  useEffect(() => {
    onExitedRef.current = onExited
  }, [onExited])

  // Track visibility -> exiting -> exited lifecycle
  const [phaseState, setPhaseState] = useState<{
    done: boolean
    phase: LoadingPhase
  }>(() => ({
    done,
    phase: done ? "exiting" : "visible",
  }))

  const restarted = phaseState.done && !done
  let phase: LoadingPhase = phaseState.phase
  if (phaseState.done !== done) {
    phase = done ? "exiting" : "visible"
    setPhaseState({ done, phase })
  }

  // Track monotonic visual progress per (room, mode) loading session
  const sessionKey = `${room}:${mode}`
  const clampedIncoming = clampProgress(progress)
  const [progressState, setProgressState] = useState(() => ({
    sessionKey,
    max: done ? 1 : clampedIncoming,
  }))

  let displayProgress = progressState.max
  if (progressState.sessionKey !== sessionKey || restarted) {
    displayProgress = done ? 1 : clampedIncoming
    setProgressState({ sessionKey, max: displayProgress })
  } else {
    const nextMax = computeMonotonicProgress(
      progressState.max,
      clampedIncoming,
      done
    )
    if (nextMax !== progressState.max) {
      displayProgress = nextMax
      setProgressState({ sessionKey, max: nextMax })
    }
  }

  useEffect(() => {
    if (phase !== "exiting") return
    const durationMs = getExitDurationMs(mode, reducedMotion)
    const timer = window.setTimeout(() => {
      setPhaseState((prev) =>
        prev.done ? { done: true, phase: "exited" } : prev
      )
      onExitedRef.current?.()
    }, durationMs)
    return () => {
      window.clearTimeout(timer)
    }
  }, [phase, mode, reducedMotion])

  // Rotating friendly Vietnamese tips filtered by room (enter mode only)
  const tips = getRoomTips(room)
  const [tipState, setTipState] = useState<{ room: SpaceRoom; index: number }>(
    () => ({ room, index: 0 })
  )

  let tipIndex = tipState.index
  if (tipState.room !== room) {
    tipIndex = 0
    setTipState({ room, index: 0 })
  }

  useEffect(() => {
    if (mode !== "enter" || phase !== "visible" || tips.length <= 1) {
      return
    }
    const timer = window.setInterval(() => {
      setTipState((prev) =>
        prev.room === room
          ? { room, index: (prev.index + 1) % tips.length }
          : { room, index: 0 }
      )
    }, TIP_ROTATE_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
    }
  }, [mode, phase, room, tips.length])

  if (phase === "exited") {
    return null
  }

  const isExiting = phase === "exiting"
  const percent = progressToPercent(displayProgress)
  const stageText = stage?.trim() || DEFAULT_STAGE_TEXT[room]
  const currentTip = tips[tipIndex % tips.length] ?? ""
  const trimmedTeam = teamName?.trim()

  const rootClassName = [
    "sls-root",
    mode === "door" ? "sls-mode-door" : "sls-mode-enter",
    isExiting ? "is-exiting" : "",
    reducedMotion ? "sls-reduced-motion" : "",
  ]
    .filter(Boolean)
    .join(" ")

  if (mode === "door") {
    return (
      <div
        className={rootClassName}
        role="status"
        aria-live="polite"
        aria-busy={!done}
        data-testid="space-loading-screen"
        data-mode="door"
        data-room={room}
        data-reduced-motion={reducedMotion ? "true" : "false"}
      >
        <div
          className="sls-door-panel sls-door-panel-left"
          data-testid="door-panel-left"
          aria-hidden="true"
        >
          <span className="sls-door-handle" />
        </div>
        <div
          className="sls-door-panel sls-door-panel-right"
          data-testid="door-panel-right"
          aria-hidden="true"
        >
          <span className="sls-door-handle" />
        </div>

        <div className="sls-door-center">
          <span className="sls-door-plaque">{formatDoorSign(room)}</span>
          {room === "office" && trimmedTeam ? (
            <p className="sls-door-team">{trimmedTeam}</p>
          ) : null}
          <div className="sls-door-status-row">
            <DoorSpinnerCoinSvg />
            <p className="sls-door-stage">{stageText}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={rootClassName}
      role="status"
      aria-live="polite"
      aria-busy={!done}
      data-testid="space-loading-screen"
      data-mode="enter"
      data-room={room}
      data-reduced-motion={reducedMotion ? "true" : "false"}
    >
      <SparklesOverlay />

      <div className="sls-enter-card">
        <div className="sls-stage-scene">
          <ChibiMascotSvg room={room} waving={isExiting} />
          {room === "floor" ? <ThanTaiCoinSvg /> : <OfficeDeskAccentSvg />}
        </div>

        {room === "floor" ? <FloorMiniTicker /> : null}

        <div className="sls-heading-row">
          <span className="sls-brand-mark" aria-hidden="true">
            IQX
          </span>
          <h2 className="sls-title">{formatRoomTitle(room, teamName)}</h2>
        </div>

        <div className="sls-progress-block">
          <div className="sls-progress-shell">
            <div
              className="sls-progress-track"
              role="progressbar"
              aria-label={stageText}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="sls-progress-fill"
                data-testid="loading-progress-fill"
                style={{ width: `${percent}%` }}
              >
                <span
                  className="sls-progress-fill-surface"
                  aria-hidden="true"
                />
                <span className="sls-progress-runner" aria-hidden="true">
                  <ProgressRunnerSvg room={room} />
                </span>
              </div>
            </div>
          </div>

          <div className="sls-status-row">
            <p className="sls-stage-text" data-testid="loading-stage-text">
              {stageText}
            </p>
            <span className="sls-percent" aria-hidden="true">
              {percent}%
            </span>
          </div>
        </div>

        <div className="sls-tip-bubble" aria-live="off">
          <span className="sls-tip-tag">Mẹo nhỏ</span>
          <p
            key={`${room}-${tipIndex}`}
            className="sls-tip-text"
            data-testid="loading-tip-text"
          >
            {currentTip}
          </p>
        </div>
      </div>
    </div>
  )
}
