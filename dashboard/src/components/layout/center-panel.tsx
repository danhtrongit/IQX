import { useCallback } from "react"
import { useNavigate } from "react-router"
import { TVChart } from "@/components/chart/tv-chart"
import { useSymbol } from "@/contexts/symbol-context"

interface CenterPanelProps {
  onMarkClick?: (markId: string | number) => void
}

export function CenterPanel({ onMarkClick }: CenterPanelProps = {}) {
  const { symbol } = useSymbol()
  const navigate = useNavigate()

  const handleSymbolChanged = useCallback(
    (newSymbol: string) => {
      const clean = newSymbol.split(":").pop()?.toUpperCase() || newSymbol.toUpperCase()
      if (clean) {
        navigate(`/co-phieu/${clean}`)
      }
    },
    [navigate],
  )

  return (
    <section
      id="center-panel"
      className="flex flex-1 flex-col min-w-0 bg-background"
    >
      {/* TradingView Chart - fills entire center panel */}
      <div className="flex-1 min-h-0">
        <TVChart
          symbol={symbol}
          interval="D"
          theme="dark"
          onSymbolChanged={handleSymbolChanged}
          onMarkClick={onMarkClick}
        />
      </div>
    </section>
  )
}
