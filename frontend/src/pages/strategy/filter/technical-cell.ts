/**
 * What one technical cell of the result table shows. The server sends the text of the value at T
 * (`display`, e.g. `63,7` or `0,41 / 0,28`) and the row's verdict; a row that cannot be evaluated is
 * NO_SIGNAL (`status: "missing"`): it shows "—" with its reason, is never a pass and never 0.
 */
import { reasonLabel } from "./reasons"
import type { TechnicalCell } from "./types"

export type TechnicalCellView = {
  /** The value at T, or "—". */
  text: string
  /** Line under the value: the NO_SIGNAL reason, or "Không đạt" when the row is false. */
  caption: string | null
  ok: boolean
  /** `pass`: the row is true at T; `fail`: false; `none`: NO_SIGNAL. */
  verdict: "pass" | "fail" | "none"
  title: string | null
}

export function technicalCellView(cell: TechnicalCell | undefined): TechnicalCellView {
  if (!cell) return { text: "—", caption: reasonLabel("insufficient_price_history"), ok: false, verdict: "none", title: null }
  if (cell.status === "ok" && cell.display !== null) {
    return { text: cell.display, caption: cell.result === false ? "Không đạt" : null, ok: true, verdict: cell.result === true ? "pass" : "fail", title: null }
  }
  return { text: "—", caption: reasonLabel(cell.reason_code ?? "insufficient_price_history"), ok: false, verdict: "none", title: cell.reason ?? null }
}

/** `phiên dd/mm` under a technical column title, from the session `YYYY-MM-DD`. */
export function sessionCaption(session: string | null | undefined): string | null {
  const match = session ? /^\d{4}-(\d{2})-(\d{2})$/.exec(session) : null
  return match ? `phiên ${match[2]}/${match[1]}` : null
}
