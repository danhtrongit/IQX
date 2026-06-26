import { EQUITY, ALERT_SAMPLE } from "./data"
import { toneColor } from "./util"

/* SVG geometry (viewBox units). preserveAspectRatio="none" stretches to fill. */
const VW = 360
const VH = 150
const PAD = 8

/** Map an equity series to a polyline string on a SHARED min/max scale. */
function polyline(values: number[], min: number, max: number) {
  const span = max - min || 1
  const step = (VW - PAD * 2) / Math.max(values.length - 1, 1)
  const pts = values.map((v, i) => {
    const x = PAD + i * step
    const y = PAD + (1 - (v - min) / span) * (VH - PAD * 2)
    return [x, y] as const
  })
  const line = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ")
  const area = `${line} L${pts[pts.length - 1][0]},${VH} L${pts[0][0]},${VH} Z`
  return { line, area }
}

export function StrategyAlerts({ onRegister }: { onRegister: () => void }) {
  /* shared y-scale across BOTH series so the lines are comparable */
  const all = [...EQUITY.strategy, ...EQUITY.index]
  const min = Math.min(...all)
  const max = Math.max(...all)

  const strat = polyline(EQUITY.strategy, min, max)
  const idx = polyline(EQUITY.index, min, max)

  return (
    <section className="lp-section lp-section--tint lp-strat" id="chien-luoc">
      <div className="lp-wrap">
        <div className="lp-strat__intro lp-reveal">
          <span className="lp-eyebrow">Dành cho nhà đầu tư chủ động · Premium</span>
          <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12 }}>
            Kiểm chứng chiến lược. Nhận tín hiệu tận Telegram.
          </h2>
          <p className="lp-lead">
            Backtest chiến lược trên dữ liệu lịch sử để biết nó từng hoạt động ra sao, rồi để IQX quét
            thị trường và đẩy tín hiệu mua/bán thẳng vào Telegram — bạn nắm thông tin để tự quyết định.
          </p>
        </div>

        <div className="lp-strat__grid">
          {/* ── LEFT: Backtester ── */}
          <div className="lp-card lp-strat__lab lp-reveal">
            <div className="lp-strat__labhead">
              <span className="lp-mono lp-strat__tag">STRATEGY LAB · BACKTEST</span>
              <span className="lp-badge lp-badge--premium">Premium</span>
            </div>

            <div className="lp-strat__chart">
              <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="lpStratFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--lp-azure)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--lp-azure)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* index — thin dashed reference (buy & hold) */}
                <path
                  d={idx.line}
                  fill="none"
                  stroke="var(--lp-t4)"
                  strokeWidth="1.4"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
                {/* strategy — area fill + thicker line */}
                <path d={strat.area} fill="url(#lpStratFill)" />
                <path
                  d={strat.line}
                  fill="none"
                  stroke="var(--lp-azure)"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            <div className="lp-strat__legend lp-mono">
              <span>
                <i style={{ background: "var(--lp-azure)" }} />Chiến lược
              </span>
              <span>
                <i style={{ background: "var(--lp-t4)" }} />VN-Index
              </span>
            </div>

            <div className="lp-strat__kpis">
              {EQUITY.kpis.map((kpi) => (
                <div className="lp-strat__kpi" key={kpi.k}>
                  <span className="lp-mono lp-strat__kpik">{kpi.k}</span>
                  <span className="lp-mono lp-strat__kpiv" style={{ color: toneColor[kpi.tone] }}>
                    {kpi.v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Telegram alert mock ── */}
          <div className="lp-card lp-strat__chat lp-reveal">
            <div className="lp-strat__chathead">
              <span className="lp-strat__plane" aria-hidden="true">
                ➤
              </span>
              <span className="lp-mono lp-strat__botname">Telegram · {ALERT_SAMPLE.bot}</span>
              <span className="lp-strat__azuredot" aria-hidden="true" />
            </div>

            <div className="lp-strat__chatbody">
              <div className="lp-strat__bubble">
                <div className="lp-strat__bubtop">
                  <span className="lp-strat__buy" style={{ color: toneColor.up, borderColor: toneColor.up }}>
                    ▲ MUA
                  </span>
                  <span className="lp-mono lp-strat__bubtick">{ALERT_SAMPLE.ticker}</span>
                </div>
                <p className="lp-strat__signal">{ALERT_SAMPLE.signal}</p>
                <p className="lp-strat__detail">{ALERT_SAMPLE.detail}</p>
                <span className="lp-mono lp-strat__time">{ALERT_SAMPLE.time}</span>
              </div>

              <div className="lp-strat__chips">
                <span className="lp-chip">10 tín hiệu preset</span>
                <span className="lp-chip">Quét intraday ~10 phút</span>
                <span className="lp-chip">5 mua · 5 bán</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA row ── */}
        <div className="lp-strat__cta lp-reveal">
          <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onRegister}>
            Dùng thử Strategy Lab 7 ngày →
          </button>
          <p className="lp-strat__ctanote lp-mono">
            Backtest mô phỏng T+2 · Sharpe 95% CI · so với mua-và-giữ. Kết quả quá khứ không đảm bảo
            tương lai.
          </p>
        </div>
      </div>

      <style>{`
        .lp-strat__intro { max-width: 760px; margin-bottom: clamp(28px, 4vw, 44px); }

        .lp-strat__grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(16px, 2.4vw, 22px);
        }
        @media (min-width: 880px) {
          .lp-strat__grid { grid-template-columns: 1fr 1fr; align-items: stretch; }
        }

        /* ── backtester card ── */
        .lp-strat__lab { padding: clamp(18px, 2.4vw, 24px); display: flex; flex-direction: column; }
        .lp-strat__labhead {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-bottom: 16px;
        }
        .lp-strat__tag {
          font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--lp-t3);
        }
        .lp-strat__chart {
          position: relative;
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r);
          background: var(--lp-bg-2);
          padding: 6px;
          overflow: hidden;
        }
        .lp-strat__chart svg {
          display: block; width: 100%; height: 150px;
        }
        .lp-strat__legend {
          display: flex; gap: 18px; margin-top: 12px;
          font-size: 11.5px; color: var(--lp-t3);
        }
        .lp-strat__legend i {
          display: inline-block; width: 9px; height: 9px; border-radius: 50%;
          margin-right: 6px; vertical-align: -1px;
        }

        .lp-strat__kpis {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 1px; margin-top: 18px;
          background: var(--lp-border-soft);
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r);
          overflow: hidden;
        }
        .lp-strat__kpi {
          background: var(--lp-panel);
          padding: 14px 16px;
          display: flex; flex-direction: column; gap: 7px;
        }
        .lp-strat__kpik {
          font-size: 11px; letter-spacing: 0.04em; color: var(--lp-t3);
        }
        .lp-strat__kpiv {
          font-size: clamp(20px, 2.6vw, 26px); font-weight: 700;
          letter-spacing: -0.01em; line-height: 1;
        }

        /* ── telegram chat card ── */
        .lp-strat__chat { display: flex; flex-direction: column; overflow: hidden; }
        .lp-strat__chathead {
          display: flex; align-items: center; gap: 9px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--lp-border-soft);
          background: var(--lp-bg-2);
        }
        .lp-strat__plane {
          display: inline-grid; place-items: center;
          width: 26px; height: 26px; border-radius: 8px;
          background: var(--lp-azure-soft); color: var(--lp-azure);
          font-size: 13px; flex: none;
          transform: rotate(-12deg);
        }
        .lp-strat__botname {
          font-size: 12.5px; font-weight: 700; color: var(--lp-t2);
          letter-spacing: 0.02em;
        }
        .lp-strat__azuredot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--lp-azure); margin-left: auto; flex: none;
          box-shadow: 0 0 0 3px var(--lp-azure-soft);
        }
        .lp-strat__chatbody {
          padding: 18px; flex: 1;
          display: flex; flex-direction: column; gap: 16px;
        }
        .lp-strat__bubble {
          align-self: flex-start;
          max-width: 92%;
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft);
          border-radius: 4px 16px 16px 16px;
          padding: 13px 15px;
        }
        .lp-strat__bubtop {
          display: flex; align-items: center; gap: 9px; margin-bottom: 9px;
        }
        .lp-strat__buy {
          display: inline-flex; align-items: center; gap: 3px;
          font-family: var(--lp-mono);
          font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
          padding: 3px 9px; border-radius: 999px;
          border: 1px solid; background: var(--lp-up-soft);
        }
        .lp-strat__bubtick {
          font-size: 17px; font-weight: 800; letter-spacing: 0.02em;
          color: var(--lp-t1);
        }
        .lp-strat__signal {
          font-size: 14px; font-weight: 700; color: var(--lp-t1);
          line-height: 1.45; margin-bottom: 6px;
        }
        .lp-strat__detail {
          font-size: 12.5px; color: var(--lp-t2); line-height: 1.55;
          margin-bottom: 9px;
        }
        .lp-strat__time {
          display: block; text-align: right;
          font-size: 10.5px; color: var(--lp-t3); letter-spacing: 0.03em;
        }
        .lp-strat__chips {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto;
        }

        /* ── CTA row ── */
        .lp-strat__cta {
          display: flex; flex-wrap: wrap; align-items: center; gap: 16px;
          margin-top: clamp(24px, 3.5vw, 36px);
        }
        .lp-strat__ctanote {
          font-size: 11.5px; color: var(--lp-t3); line-height: 1.6;
          max-width: 52ch;
        }
      `}</style>
    </section>
  )
}
