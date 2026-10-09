/**
 * Replay of a locked run. The server already holds the full immutable result; the replay only moves
 * a display cursor ("sessions revealed") and never changes a fill, a price or the capital. The cursor
 * lives in a tiny external store so the 11 ticks per second repaint the chart and the running
 * results only, not the form.
 */
import { useSyncExternalStore } from "react"

export type PlaybackSpeed = 1 | 3 | 6
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [1, 3, 6]
/** Sessions revealed per tick (90 ms) at each speed, as in the approved sample. */
export const SPEED_STEP: Record<PlaybackSpeed, number> = { 1: 1, 3: 5, 6: 18 }
export const TICK_MS = 90

export type PlaybackState = {
  runId: string | null
  /** Last test session shown (Phiên n). */
  revealed: number
  playing: boolean
  speed: PlaybackSpeed
  /** Replay finished or skipped: the run counts as completed on screen. */
  done: boolean
}

export const EMPTY_PLAYBACK: PlaybackState = { runId: null, revealed: 0, playing: false, speed: 6, done: false }

export type PlaybackStore = {
  get: () => PlaybackState
  set: (patch: Partial<PlaybackState>) => void
  subscribe: (listener: () => void) => () => void
}

export function createPlaybackStore(): PlaybackStore {
  let state = EMPTY_PLAYBACK
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch }
      if ((Object.keys(next) as Array<keyof PlaybackState>).every((key) => next[key] === state[key])) return
      state = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Subscribe to a primitive slice of the playback state. */
export function usePlayback<T extends string | number | boolean | null>(store: PlaybackStore, select: (state: PlaybackState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(EMPTY_PLAYBACK))
}

// ---------------------------------------------------------------- persistence (UI preference only)

const storageKey = (runId: string) => `iqx.practice.replay.v1:${runId}`

export type SavedReplay = { revealed: number; speed: PlaybackSpeed; done: boolean }

export function loadReplay(runId: string): SavedReplay | null {
  try {
    const raw = window.localStorage.getItem(storageKey(runId))
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return null
    const { revealed, speed, done } = value as Record<string, unknown>
    if (typeof revealed !== "number" || !Number.isFinite(revealed) || revealed < 0) return null
    const safeSpeed = speed === 1 || speed === 3 || speed === 6 ? speed : 6
    return { revealed: Math.floor(revealed), speed: safeSpeed, done: done === true }
  } catch {
    return null
  }
}

export function saveReplay(runId: string, state: SavedReplay): void {
  try {
    window.localStorage.setItem(storageKey(runId), JSON.stringify(state))
  } catch {
    // Storage can be blocked; the replay still works, it just is not remembered.
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Stops a running replay and remembers where it was (before another run is shown). */
export function pausePlayback(store: PlaybackStore): void {
  const { runId, revealed, speed, done, playing } = store.get()
  if (!playing || runId === null) return
  store.set({ playing: false })
  saveReplay(runId, { revealed, speed, done })
}

// ---------------------------------------------------------------- controls

export type PlaybackControls = {
  play: () => void
  pause: () => void
  toggle: () => void
  setSpeed: (speed: PlaybackSpeed) => void
  /** "Xem kết quả ngay". */
  finish: () => void
  tick: () => void
  /** Prepare the store for a run (restored, fresh replay, or completed). */
  attach: (mode: "fresh" | "restore" | "complete") => void
}

export function createPlaybackControls(store: PlaybackStore, runId: string, lastSession: number): PlaybackControls {
  const persist = () => {
    const { revealed, speed, done } = store.get()
    saveReplay(runId, { revealed, speed, done })
  }
  const controls: PlaybackControls = {
    play() {
      const state = store.get()
      if (state.done || state.runId !== runId) return
      store.set({ playing: true })
    },
    pause() {
      const state = store.get()
      if (state.runId !== runId || !state.playing) return
      store.set({ playing: false })
      persist()
    },
    toggle() {
      if (store.get().playing) controls.pause()
      else controls.play()
    },
    setSpeed(speed) {
      store.set({ speed })
      persist()
    },
    finish() {
      store.set({ runId, revealed: lastSession, playing: false, done: true })
      persist()
    },
    tick() {
      const state = store.get()
      if (!state.playing || state.runId !== runId) return
      const next = Math.min(lastSession, state.revealed + SPEED_STEP[state.speed])
      if (next >= lastSession) {
        controls.finish()
        return
      }
      store.set({ revealed: next })
      if (next % 36 < SPEED_STEP[state.speed]) persist()
    },
    attach(mode) {
      if (mode === "complete") {
        store.set({ runId, revealed: lastSession, playing: false, done: true })
        return
      }
      if (mode === "restore") {
        const saved = loadReplay(runId)
        if (saved && !saved.done && saved.revealed >= 1 && saved.revealed < lastSession) {
          store.set({ runId, revealed: saved.revealed, speed: saved.speed, playing: false, done: false })
        } else {
          store.set({ runId, revealed: lastSession, speed: saved?.speed ?? 6, playing: false, done: true })
        }
        return
      }
      store.set({ runId, revealed: Math.min(1, lastSession), playing: !prefersReducedMotion(), done: false })
      persist()
    },
  }
  return controls
}
