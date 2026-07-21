import "./cap0.css"
import type { TradingMode } from "./types"

/**
 * Trading-mode pill shown throughout Cấp 0 (spec §2). `san_tap` → yellow
 * "SÂN TẬP · T+0", `thuc_chien` → brand-blue "THỰC CHIẾN". Presentational only;
 * the consumer positions it (the mockup drops it into the journey bar's
 * top-right via `margin-left:auto`).
 */
export function ModeBadge({ mode }: { mode: TradingMode }) {
  const practice = mode === "san_tap"
  return (
    <span className={`cap0-mode ${practice ? "cap0-mode--warn" : "cap0-mode--brand"}`}>
      {practice ? "SÂN TẬP · T+0" : "THỰC CHIẾN"}
    </span>
  )
}
