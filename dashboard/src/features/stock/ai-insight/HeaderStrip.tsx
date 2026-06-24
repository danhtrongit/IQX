import type { StockHeader } from '../types'

interface HeaderStripProps {
  header: StockHeader
}

/**
 * HeaderStrip — stock identification bar.
 * §4.3.2: ticker block (symbol, sector · indexGroup) + 4-cell price grid + live indicator.
 */
export function HeaderStrip({ header }: HeaderStripProps) {
  const { symbol, sector, indexGroup, price, changePercent, high, low, volume, isLive } = header

  // Format a number with thousands separator (Vietnamese locale)
  function fmtPrice(n: number): string {
    return n.toLocaleString('vi-VN')
  }

  // Format changePercent with explicit sign and 2 decimals, e.g. "+0.16%" or "-1.23%"
  function fmtPct(n: number): string {
    const sign = n >= 0 ? '+' : ''
    return `${sign}${n.toFixed(2)}%`
  }

  const pctClass = changePercent > 0 ? 'val pos' : changePercent < 0 ? 'val neg' : 'val'

  return (
    <div className="header-strip">
      {/* Left — Ticker block */}
      <div className="ticker-block">
        <div className="ticker-symbol serif">{symbol}</div>
        <div className="ticker-sector">
          {sector} · {indexGroup}
        </div>
      </div>

      {/* Middle — Price grid */}
      <div className="price-grid">
        <div className="price-cell">
          <span className="lbl">Giá</span>
          <span className="val big num">{fmtPrice(price)}</span>
        </div>
        <div className="price-cell">
          <span className="lbl">% Phiên</span>
          <span className={`${pctClass} num`} data-change={changePercent >= 0 ? 'pos' : 'neg'}>
            {fmtPct(changePercent)}
          </span>
        </div>
        <div className="price-cell">
          <span className="lbl">Cao / Thấp</span>
          <span className="val num">
            {fmtPrice(high)} / {fmtPrice(low)}
          </span>
        </div>
        <div className="price-cell">
          <span className="lbl">Khối lượng</span>
          <span className="val num">{volume}</span>
        </div>
      </div>

      {/* Right — Live indicator */}
      {isLive && (
        <div className="live-indicator">
          <span className="live-dot" />
          LIVE
        </div>
      )}
    </div>
  )
}
