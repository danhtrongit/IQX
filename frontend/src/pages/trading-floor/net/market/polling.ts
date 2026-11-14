import { msToNextPhase, sessionPhase } from "./time.ts"

export const POLL_MS = {
  /** While the market is open and no live socket is feeding the board. */
  open: 20_000,
  /** While the market is open and the socket delivers ticks. REST then only refreshes reference data. */
  openLive: 30_000,
  /** Lunch break: nothing moves. */
  lunch: 120_000,
  /** Evenings, weekends and mornings before the open. */
  closed: 300_000,
  /** Longest wait after repeated failures. */
  maxBackoff: 300_000,
} as const

/** Spread of the random jitter around a delay, as a fraction. Keeps many tabs from polling in step. */
const JITTER = 0.1
/** Never poll faster than this, even right before a phase change. */
const MIN_DELAY_MS = 1_000
/** A poll shortly after the open or close picks up the first or last numbers. */
const PHASE_SLACK_MS = 2_000

export interface PollInput {
  now: number
  /** Consecutive failed refreshes. */
  failures: number
  /** True while the WebSocket has delivered data recently. */
  socketLive?: boolean
  /** Random source in [0, 1). */
  random?: () => number
}

/** Interval between refreshes for the current time of day, ignoring failures. */
export function basePollInterval(now: number, socketLive = false): number {
  switch (sessionPhase(now)) {
    case "open":
      return socketLive ? POLL_MS.openLive : POLL_MS.open
    case "lunch":
      return POLL_MS.lunch
    default:
      return POLL_MS.closed
  }
}

/** Exponential back-off: the base doubles with every consecutive failure, up to the cap. */
export function backoff(base: number, failures: number): number {
  if (failures <= 0) return base
  return Math.min(Math.max(POLL_MS.maxBackoff, base), base * 2 ** failures)
}

/** Wait before the next refresh. */
export function nextPollDelay({
  now,
  failures,
  socketLive = false,
  random = Math.random,
}: PollInput): number {
  let delay = backoff(basePollInterval(now, socketLive), failures)
  if (failures === 0) {
    // Do not sleep through the open or the close.
    const untilPhase = msToNextPhase(now)
    if (untilPhase !== null)
      delay = Math.min(delay, untilPhase + PHASE_SLACK_MS)
  }
  const jitter = 1 + (random() * 2 - 1) * JITTER
  return Math.max(MIN_DELAY_MS, Math.round(delay * jitter))
}

/** Wait before retrying one failed request: 400 ms, 800 ms, 1.6 s... */
export function retryDelay(attempt: number, baseMs: number): number {
  return baseMs * 2 ** attempt
}
