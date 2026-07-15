import type { ReactNode } from "react"

import { fmtNum } from "../charts/chartTokens"

export interface HeroCardProps {
  ticker: string
  name: string
  exchange: string
  sector: string
  /** current market price (đồng) */
  price: number
  /** fair value / trung vị định giá (đồng) */
  fairValue: number
  /** upside % of fair value vs price (may be negative) */
  upsidePct: number
  /** one-line AI verdict (≤ 30 từ) — plain text, no pill */
  verdictOneliner: string
  /** optional scorecard slot (RadarScorecard) rendered inside the hero */
  children?: ReactNode
}

function signedPct(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  const sign = v >= 0 ? "+" : "−"
  return `${sign}${Math.abs(v).toFixed(1)}%`
}

function upsideColor(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1) return "var(--amber)"
  return n > 0 ? "var(--green)" : "var(--red)"
}

/**
 * KHỐI 0 — danh thiếp: mã · tên · sàn · ngành · giá · giá hợp lý + kết luận 1 câu.
 * KHÔNG verdict pill; kết luận nằm trong câu văn serif dưới nhãn "Kết luận một câu".
 */
export function HeroCard({
  ticker,
  name,
  exchange,
  sector,
  price,
  fairValue,
  upsidePct,
  verdictOneliner,
  children,
}: HeroCardProps) {
  return (
    <div className="bctc-hero">
      <div className="bctc-hero-top">
        <div className="bctc-ticker-block">
          <div className="bctc-ticker">{ticker}</div>
          <div className="bctc-ticker-meta">
            <div className="bctc-name">{name}</div>
            <div className="bctc-sub">
              {exchange} · {sector}
            </div>
            <div className="bctc-sector-pill">
              <span className="bctc-dot" />
              Ngành: {sector}
            </div>
          </div>
        </div>
        <div className="bctc-price-block">
          <div className="bctc-price">
            {fmtNum(price)}
            <span className="bctc-ccy"> đ</span>
          </div>
          <div className="bctc-price-chg" style={{ color: upsideColor(upsidePct) }}>
            Giá hợp lý {fmtNum(fairValue)} ({signedPct(upsidePct)})
          </div>
        </div>
      </div>

      <div className="bctc-verdict">
        <div className="bctc-v-kick">Kết luận một câu</div>
        <h2 className="bctc-verdict-title">{verdictOneliner}</h2>
      </div>

      {children ? <div className="bctc-hero-scorecard">{children}</div> : null}
    </div>
  )
}
