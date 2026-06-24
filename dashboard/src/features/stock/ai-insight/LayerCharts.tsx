import {
  TrendRawChart,
  LiquidityRawChart,
  MoneyFlowRawChart,
  InsiderRawChart,
} from '../components/StockAiInsightCharts'
import { ChartBlock } from './ChartBlock'
import type { InsightRawInput } from '../types'

interface LayerChartsProps {
  layer: 'L1' | 'L2' | 'L3' | 'L4'
  rawInput: InsightRawInput
}

export function LayerCharts({ layer, rawInput }: LayerChartsProps) {
  if (layer === 'L1') {
    return (
      <ChartBlock title="Giá & MA">
        <TrendRawChart ohlcv={rawInput.trend.ohlcv as Parameters<typeof TrendRawChart>[0]['ohlcv']} />
      </ChartBlock>
    )
  }

  if (layer === 'L2') {
    const avgVolume =
      rawInput.liquidity.avg30 != null &&
      typeof (rawInput.liquidity.avg30 as Record<string, unknown>).totalVolume === 'number'
        ? ((rawInput.liquidity.avg30 as Record<string, unknown>).totalVolume as number)
        : undefined
    return (
      <ChartBlock title="Thanh khoản 10 phiên">
        <LiquidityRawChart
          history={rawInput.liquidity.history as Parameters<typeof LiquidityRawChart>[0]['history']}
          avgVolume={avgVolume}
        />
      </ChartBlock>
    )
  }

  if (layer === 'L3') {
    return (
      <>
        <ChartBlock title="Nước ngoài (15 phiên)">
          <MoneyFlowRawChart
            items={rawInput.moneyFlow.foreign as Parameters<typeof MoneyFlowRawChart>[0]['items']}
            title="Nước ngoài"
          />
        </ChartBlock>
        <ChartBlock title="Tự doanh (15 phiên)">
          <MoneyFlowRawChart
            items={rawInput.moneyFlow.proprietary as Parameters<typeof MoneyFlowRawChart>[0]['items']}
            title="Tự doanh"
          />
        </ChartBlock>
      </>
    )
  }

  if (layer === 'L4') {
    return (
      <ChartBlock title="Giao dịch nội bộ">
        <InsiderRawChart
          txns={rawInput.insider.transactions as Parameters<typeof InsiderRawChart>[0]['txns']}
        />
      </ChartBlock>
    )
  }

  return null
}
