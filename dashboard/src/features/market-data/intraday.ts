/**
 * Pure helpers for intraday index charts (no I/O — unit-testable).
 * `fetchIndexIntraday` in api.ts feeds raw OHLCV rows through these.
 */

/** Today's 5m closes for an index + the previous session's reference close. */
export interface IndexIntraday {
  /** Epoch seconds of today's bars (ascending). */
  times: number[]
  /** Closes of today's bars (points, ascending). */
  closes: number[]
  /** Close of the last bar BEFORE today (giá tham chiếu), or null. */
  refValue: number | null
}

/**
 * Split ascending OHLCV rows into today's session closes and the previous
 * session's last close (reference). Rows are tolerant of `close`/`close_price`
 * and `time`/`t` field variants; invalid rows are skipped.
 */
export function splitIntradayRows(
  rows: Record<string, unknown>[],
  startOfTodayEpochS: number,
): IndexIntraday {
  const times: number[] = []
  const closes: number[] = []
  let refValue: number | null = null

  for (const row of rows) {
    const t = Number(row.time ?? row.t ?? 0)
    const c = Number(row.close ?? row.close_price ?? 0)
    if (!t || !(c > 0)) continue
    if (t >= startOfTodayEpochS) {
      times.push(t)
      closes.push(c)
    } else {
      // Nến cuối cùng của phiên trước → giá tham chiếu (rows ascending).
      refValue = c
    }
  }

  return { times, closes, refValue }
}
