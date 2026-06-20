// Stub — fleshed out in Task 15.
import { useMarketModal } from "@/shared/contexts/market-modal-context"

export function MarketOverviewModal() {
  useMarketModal() // wire hook so the import is exercised at build time
  return null
}
