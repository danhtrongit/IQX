/** One pending callback of the simulation clock. */
interface Timer {
  at: number
  every: number | null
  fn: () => void
}

/**
 * Minimal game-loop scheduler (replaces Phaser's `Time.Clock`): callbacks run on
 * the animation frame that crosses their due time, so they pause with the tab
 * and stop for good after `clear()`.
 */
export class SimClock {
  private now = 0
  private timers: Timer[] = []

  /** Runs `fn` once after `ms` milliseconds of simulation time. */
  delayedCall(ms: number, fn: () => void): void {
    this.timers.push({ at: this.now + ms, every: null, fn })
  }

  /** Runs `fn` every `ms` milliseconds of simulation time. */
  every(ms: number, fn: () => void): void {
    this.timers.push({ at: this.now + ms, every: ms, fn })
  }

  /** Advances the clock by `dt` milliseconds and fires every due callback. */
  update(dt: number): void {
    this.now += dt
    const due = this.timers.filter((t) => t.at <= this.now)
    if (!due.length) return
    this.timers = this.timers.filter((t) => t.at > this.now)
    for (const t of due) {
      if (t.every !== null) {
        t.at += t.every
        this.timers.push(t)
      }
      t.fn()
    }
  }

  clear(): void {
    this.timers = []
  }
}
