import type { ThanTaiToday } from "../../net/types.ts"
import type { Failure } from "../../than-tai.ts"

export type Step = 1 | 2 | 3 | 4

export type ActResult = { ok: ThanTaiToday } | { fail: Failure }

/**
 * Sends one step to the server. On success the panel already holds the new state; on `HET_GIO` the
 * dialog is already closed with a toast; any other failure comes back for the step to show.
 */
export type Act = (call: () => Promise<ThanTaiToday>) => Promise<ActResult>
