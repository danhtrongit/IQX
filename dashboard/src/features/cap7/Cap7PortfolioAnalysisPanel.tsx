import { useCap7Events } from "./Cap7Context"
import { useCap7Portfolio } from "./hooks"
import "./cap7-analysis.css"

function pct(value: number | null): string {
  return value == null ? "Chưa xác định" : `${value.toFixed(1)}%`
}


/** Live holdings allocation view, intentionally unavailable outside Cấp 7's provider. */
export function Cap7PortfolioAnalysisPanel() {
  const { isCap7Active } = useCap7Events()
  return isCap7Active ? <ActiveCap7PortfolioAnalysis /> : null
}

/**
 * This boundary is mounted only after the provider check so ordinary Holdings
 * never requires a QueryClient or initiates a Level 7 allocation query.
 */
function ActiveCap7PortfolioAnalysis() {
  const { data, isLoading } = useCap7Portfolio(true)
  if (isLoading) {
    return <section data-testid="cap7-portfolio-loading">Đang tải phân bổ danh mục…</section>
  }
  if (!data) return null

  return (
    <section className="cap7-analysis" data-testid="cap7-portfolio-analysis">
      <h3>Phân bổ danh mục hiện tại</h3>
      <p>Tiền mặt: <strong>{data.cash_vnd == null ? "Chưa xác định" : `${Math.round(data.cash_vnd).toLocaleString("en-US")} VND`} · {pct(data.cash_weight_pct)}</strong></p>
      <h4>Theo mã</h4>
      <ul>{data.positions.map((position) => <li key={position.symbol}>{position.symbol} · {pct(position.weight_pct)} · {position.sector ?? "Chưa rõ ngành"}</li>)}</ul>
      <h4>Theo ngành</h4>
      <ul>{data.sectors.map((sector) => <li key={sector.sector}>{sector.sector} · {pct(sector.weight_pct)}</li>)}</ul>
      {(data.unpriced_symbols.length > 0 || data.unknown_sector_symbols.length > 0) && (
        <p className="cap7-warning" data-testid="cap7-portfolio-warning">
          Không thể xác nhận cân đối: {data.unpriced_symbols.length > 0 && `chưa có giá ${data.unpriced_symbols.join(", ")}`}{data.unpriced_symbols.length > 0 && data.unknown_sector_symbols.length > 0 && "; "}{data.unknown_sector_symbols.length > 0 && `chưa rõ ngành ${data.unknown_sector_symbols.join(", ")}`}.
        </p>
      )}
      {!data.can_doi_ok && data.data_complete && <p className="cap7-warning">Danh mục chưa đạt đồng thời giới hạn 30% mỗi mã, 40% mỗi ngành và đa dạng 4 mã / 3 ngành.</p>}
    </section>
  )
}
