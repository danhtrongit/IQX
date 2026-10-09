import type { BotPosition } from "../types"

/** Current relation of a held symbol to the buy source. Held positions are always watched for Sell. */
export function scopeBadge(position: Pick<BotPosition, "source_scope" | "in_universe">): { label: string; inSource: boolean | null } {
  const scope = position.source_scope ?? (position.in_universe === null ? null : position.in_universe ? "in_buy_source" : "sell_watch_only")
  if (scope === "in_buy_source") return { label: "Trong nguồn mua", inSource: true }
  if (scope === "sell_watch_only") return { label: "Chỉ theo dõi Bán", inSource: false }
  return { label: "Chưa xác định", inSource: null }
}
