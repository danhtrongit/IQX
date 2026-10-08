import { toNumber } from "../format"
import type { BotExecution, BotJournalItem } from "../types"

export type ExecutionRow = {
  id: string
  item: BotJournalItem
  execution: BotExecution
  side: "buy" | "sell"
  symbol: string
  /** Net P&L of the closed trade (sell net + the paired buy's cash out); `null` until both legs are loaded. */
  realizedPnl: number | null
  /** The paired buy's cash out (value + fee), the base of the percentage. */
  entryCost: number | null
  /** Session of the paired buy. */
  openedSession: string | null
  /** The decision that opened the position (the row itself for a buy); source of "Nguồn mua". */
  entryItem: BotJournalItem | null
}

function chronological(a: BotJournalItem, b: BotJournalItem): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1
}

/**
 * Executions (Mua/Bán) of the loaded journal pages, newest first, each sell paired with
 * the buy it closed. The Bot never adds to a position and always sells all of it, so a
 * sell closes the latest open buy of the same symbol:
 *   realized = sell net cash in + buy net cash out (a negative number).
 * A sell whose buy is not loaded yet keeps `realizedPnl = null` rather than a guess.
 */
export function executionRows(items: readonly BotJournalItem[]): ExecutionRow[] {
  const executed = items.filter((item): item is BotJournalItem & { execution: BotExecution } => item.execution !== null && !!item.symbol)
  const ascending = [...executed].sort(chronological)
  const openBuys = new Map<string, BotJournalItem & { execution: BotExecution }>()
  const closed = new Map<string, { pnl: number; cost: number; opened: string; entry: BotJournalItem }>()
  for (const item of ascending) {
    const symbol = item.symbol as string
    if (item.execution.side === "buy") {
      openBuys.set(symbol, item)
      continue
    }
    const buy = openBuys.get(symbol)
    if (!buy) continue
    openBuys.delete(symbol)
    const sellNet = toNumber(item.execution.net_cash_delta_vnd)
    const buyNet = toNumber(buy.execution.net_cash_delta_vnd)
    if (sellNet === null || buyNet === null) continue
    closed.set(item.id, { pnl: sellNet + buyNet, cost: -buyNet, opened: buy.trading_date, entry: buy })
  }
  return [...ascending].reverse().map((item) => {
    const pair = closed.get(item.id)
    return {
      id: item.id,
      item,
      execution: item.execution,
      side: item.execution.side,
      symbol: item.symbol as string,
      realizedPnl: pair?.pnl ?? null,
      entryCost: pair?.cost ?? null,
      openedSession: pair?.opened ?? null,
      entryItem: item.execution.side === "buy" ? item : (pair?.entry ?? null),
    }
  })
}
