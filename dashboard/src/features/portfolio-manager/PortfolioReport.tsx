import { useEffect } from "react"
import { Spin } from "@arco-design/web-react"
import "./portfolio-manager.css"
import type { AnalyzeResponse } from "./types"
import { useAnalyzePortfolio } from "./hooks"
import { Masthead } from "./components/Masthead"
import { HeroScore } from "./components/HeroScore"
import { ProgressCompare } from "./components/ProgressCompare"
import { HoldingsTable } from "./components/HoldingsTable"
import { StatGrid } from "./components/StatGrid"
import { PerformanceStats } from "./components/PerformanceStats"
import { AllocationBars } from "./components/AllocationBars"
import { StressTest } from "./components/StressTest"
import { CorrelationHeatmap } from "./components/CorrelationHeatmap"
import { RevealInsight } from "./components/RevealInsight"
import { Attribution } from "./components/Attribution"
import { QualitySector } from "./components/QualitySector"
import { BehaviorLowData } from "./components/BehaviorLowData"
import { HealthPillars } from "./components/HealthPillars"
import { ActionsWatchClosing } from "./components/ActionsWatchClosing"
import { signedPct, vndShort, points } from "./format"

function LoadingState() {
  return (
    <div className="portfolio-manager" data-testid="pm-skeleton">
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "32px 24px" }}>
        <Spin />
        <div>AI đang phân tích danh mục của bạn…</div>
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skel" style={{ height: 80, margin: "0 24px 12px" }} />
      ))}
    </div>
  )
}

export function PortfolioReport({ injected }: { injected?: AnalyzeResponse }) {
  const { report: fetched, analyze, isPending, isError } = useAnalyzePortfolio()
  const report = injected ?? fetched

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!injected) analyze() }, [])

  // Loading state: pending or pre-first render
  if (!injected && (isPending || (!fetched && !isError))) {
    return <LoadingState />
  }

  // Error state
  if (!injected && isError) {
    return (
      <div className="portfolio-manager" style={{ padding: "32px 24px" }}>
        <p role="alert">
          Không thể tải phân tích — vui lòng thử lại sau.
        </p>
      </div>
    )
  }

  if (!report) return null

  const { analysis, narrative } = report

  // Insufficient data state
  if (analysis.insufficient_data) {
    return (
      <div className="portfolio-manager" style={{ padding: "32px 24px" }}>
        <p>{analysis.reason}</p>
      </div>
    )
  }

  // Narrative must be present for the success path
  if (!narrative) return null

  // Build overview StatGrid cells
  const overviewCells = [
    {
      label: "Giá trị danh mục",
      value: `${Math.round(analysis.overview.nav / 1_000_000)}tr ₫`,
    },
    {
      label: "Số mã",
      value: String(analysis.overview.n_positions),
    },
    {
      label: "Lợi nhuận",
      value: signedPct(analysis.overview.total_return),
      tone: analysis.overview.total_return >= 0 ? ("up" as const) : ("down" as const),
    },
    {
      label: "Lãi/lỗ tuyệt đối",
      value: vndShort(analysis.overview.total_pnl),
      tone: analysis.overview.total_pnl >= 0 ? ("up" as const) : ("down" as const),
    },
    {
      label: "Thời gian nắm giữ",
      value: `${analysis.overview.holding_months} tháng`,
    },
    {
      label: "Vượt chuẩn",
      value: points(analysis.performance.excess_return),
      tone: analysis.performance.excess_return >= 0 ? ("up" as const) : ("down" as const),
    },
  ]

  return (
    <div className="portfolio-manager">
      {/* 1-2b. Masthead + HeroScore + Lede — Người quản lý danh mục tour (T4) step 2 */}
      <div data-tour-id="tour-pm-overview">
        <Masthead
          title={narrative.title}
          meta={analysis.meta}
          nav={analysis.overview.nav}
        />

        <HeroScore
          scores={analysis.scores}
          verdict={narrative.verdict}
        />

        <p className="lede">{narrative.lede}</p>
      </div>

      {/* 3. ProgressCompare — tour step 3 */}
      <div data-tour-id="tour-pm-progress">
        <ProgressCompare
          meta={analysis.meta}
          scores={analysis.scores}
          progress={analysis.progress}
          progress_text={narrative.progress_text}
        />
      </div>

      {/* 4. HoldingsTable + overview StatGrid — tour step 4 */}
      <div data-tour-id="tour-pm-holdings">
        <HoldingsTable
          positions={analysis.overview.positions}
          cash_pct={analysis.overview.cash_pct}
          managerVoice={narrative.layers.overview}
        />
        <StatGrid cells={overviewCells} cols={4} />
      </div>

      {/* 5. PerformanceStats — tour step 5 */}
      <div data-tour-id="tour-pm-performance">
        <PerformanceStats
          performance={analysis.performance}
          managerVoice={narrative.layers.performance}
        />
      </div>

      {/* 6. AllocationBars — tour step 6 */}
      <div data-tour-id="tour-pm-allocation">
        <AllocationBars
          allocation={analysis.allocation}
          managerVoice={narrative.layers.allocation}
        />
      </div>

      {/* 7. StressTest — tour step 7 */}
      <div data-tour-id="tour-pm-stress">
        <StressTest
          beta={analysis.risk.beta}
          nav={analysis.overview.nav}
          managerVoice={narrative.layers.stress}
          topHoldings={[...analysis.overview.positions]
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 3)
            .map((p) => p.ticker)}
        />
      </div>

      {/* 8. CorrelationHeatmap — tour step 8 (no managerVoice: narrative.layers.risk
          is never rendered here — see quanLyDanhMucTour.ts's FAITHFULNESS note) */}
      <div data-tour-id="tour-pm-correlation">
        <CorrelationHeatmap
          correlation={analysis.risk.correlation}
          positions={analysis.overview.positions}
        />
      </div>

      {/* 9. RevealInsight — tour step 9 */}
      <div data-tour-id="tour-pm-insight">
        <RevealInsight insight={narrative.insight} />
      </div>

      {/* 10. Attribution — tour step 10 */}
      <div data-tour-id="tour-pm-attribution">
        <Attribution
          attribution={analysis.attribution}
          managerVoice={narrative.layers.attribution}
        />
      </div>

      {/* 11. QualitySector + BehaviorLowData — tour step 11 */}
      <div data-tour-id="tour-pm-quality-behavior">
        <QualitySector
          quality={analysis.quality}
          managerVoice={narrative.layers.quality}
        />

        <BehaviorLowData
          behavior={analysis.behavior}
          managerVoice={narrative.layers.behavior}
          lowDataNote={narrative.low_data_note}
        />
      </div>

      {/* 12-13. HealthPillars + ActionsWatchClosing — tour step 12 */}
      <div data-tour-id="tour-pm-pillars-actions">
        <HealthPillars pillars={analysis.scores.pillars} />

        <ActionsWatchClosing
          actions={narrative.actions}
          watch={narrative.watch}
          closing={narrative.closing}
        />
      </div>
    </div>
  )
}
