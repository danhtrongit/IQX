import { DUPONT, TRINITY, FOOTBALL } from "./data"
import { toneColor, toneSoft } from "./util"

/* ── football-field SVG geometry (viewBox 0 0 320 120) ── */
const FF = {
  x0: 14, // axis left
  x1: 306, // axis right
  top: 16, // first band top
  bandH: 18, // band row height
  bandGap: 8, // gap between band rows
  axisY: 104, // x-axis baseline
}

const ffSpan = FOOTBALL.high - FOOTBALL.low || 1
/** map a value on [low,high] → svg x */
const ffx = (v: number) =>
  FF.x0 + ((v - FOOTBALL.low) / ffSpan) * (FF.x1 - FF.x0)

export function ResearchDepth() {
  const dupontChain = DUPONT.filter((d) => !("accent" in d && d.accent))
  const roe = DUPONT.find((d) => "accent" in d && d.accent)!

  return (
    <section className="lp-section" id="phan-tich-co-ban">
      <div className="lp-wrap">
        <span className="lp-eyebrow">Phân tích cơ bản · Báo cáo tài chính</span>
        <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12 }}>
          Bóc tách báo cáo tài chính, không cần là dân tài chính.
        </h2>
        <p className="lp-lead" style={{ marginBottom: 30 }}>
          IQX tự tính ROE theo DuPont, chấm điểm chất lượng lợi nhuận bằng bộ chỉ số gian lận, và
          định vị giá hiện tại trong vùng giá hợp lý — tất cả gói gọn trong ba thẻ dễ đọc.
        </p>

        <div className="lp-rsrch__grid">
          {/* ── CARD A · DuPont ── */}
          <article className="lp-card lp-rsrch__card lp-reveal">
            <header className="lp-rsrch__top">
              <div>
                <h3 className="lp-h3 lp-rsrch__name">DuPont 5 bước</h3>
                <p className="lp-rsrch__note">Tách ROE thành ba động lực có thể cải thiện.</p>
              </div>
              <span className="lp-badge lp-badge--free">Miễn phí</span>
            </header>

            <div className="lp-rsrch__dupont">
              {dupontChain.map((d, i) => (
                <div className="lp-rsrch__step" key={d.k}>
                  <div className="lp-rsrch__tile">
                    <span className="lp-mono lp-rsrch__tk">{d.k}</span>
                    <span className="lp-mono lp-rsrch__tv">{d.v}</span>
                  </div>
                  <span className="lp-rsrch__op lp-mono" aria-hidden="true">
                    {i < dupontChain.length - 1 ? "×" : "="}
                  </span>
                </div>
              ))}
              <div className="lp-rsrch__tile lp-rsrch__tile--roe">
                <span className="lp-mono lp-rsrch__tk">{roe.k}</span>
                <span className="lp-mono lp-rsrch__roev">{roe.v}</span>
              </div>
            </div>

            <p className="lp-rsrch__cap">
              Biên LN ròng × Vòng quay TS × Đòn bẩy = ROE. Mọi số tự tính từ BCTC đã chuẩn hoá.
            </p>
          </article>

          {/* ── CARD B · forensic trinity ── */}
          <article className="lp-card lp-rsrch__card lp-reveal">
            <header className="lp-rsrch__top">
              <div>
                <h3 className="lp-h3 lp-rsrch__name">Bộ chỉ số gian lận</h3>
                <p className="lp-rsrch__note">Altman · Piotroski · Beneish — cờ xanh/đỏ tự động.</p>
              </div>
              <span className="lp-badge lp-badge--premium">Premium</span>
            </header>

            <ul className="lp-rsrch__trinity">
              {TRINITY.map((t) => (
                <li className="lp-rsrch__trow" key={t.k}>
                  <span className="lp-rsrch__trk">{t.k}</span>
                  <span className="lp-mono lp-rsrch__trv">{t.v}</span>
                  <span
                    className="lp-rsrch__pill lp-mono"
                    style={{
                      color: toneColor[t.tone],
                      background: toneSoft[t.tone],
                      borderColor: toneColor[t.tone],
                    }}
                  >
                    {t.state}
                  </span>
                </li>
              ))}
            </ul>

            <p className="lp-rsrch__cap">
              Ba thước đo độc lập về nguy cơ phá sản, chất lượng cơ bản và dấu hiệu thao túng lợi
              nhuận — chỉ báo rủi ro, không phải phán quyết.
            </p>
          </article>

          {/* ── CARD C · football field ── */}
          <article className="lp-card lp-rsrch__card lp-reveal">
            <header className="lp-rsrch__top">
              <div>
                <h3 className="lp-h3 lp-rsrch__name">Định giá Football Field</h3>
                <p className="lp-rsrch__note">Giá hiện tại nằm ở đâu trong vùng hợp lý.</p>
              </div>
              <span className="lp-badge lp-badge--premium">Premium</span>
            </header>

            <div className="lp-rsrch__ff">
              <svg viewBox="0 0 320 120" role="img" aria-label="Biểu đồ định giá football field">
                {/* fair-value zone */}
                <rect
                  x={ffx(FOOTBALL.fairLow)}
                  y={FF.top - 4}
                  width={ffx(FOOTBALL.fairHigh) - ffx(FOOTBALL.fairLow)}
                  height={FF.axisY - FF.top + 4}
                  fill="var(--lp-azure)"
                  opacity="0.08"
                  rx="3"
                />
                <line
                  x1={ffx(FOOTBALL.fairLow)}
                  y1={FF.top - 4}
                  x2={ffx(FOOTBALL.fairLow)}
                  y2={FF.axisY}
                  stroke="var(--lp-azure-line)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
                <line
                  x1={ffx(FOOTBALL.fairHigh)}
                  y1={FF.top - 4}
                  x2={ffx(FOOTBALL.fairHigh)}
                  y2={FF.axisY}
                  stroke="var(--lp-azure-line)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />

                {/* valuation bands */}
                {FOOTBALL.bands.map((b, i) => {
                  const y = FF.top + i * (FF.bandH + FF.bandGap)
                  const x = ffx(b.lo)
                  const w = ffx(b.hi) - ffx(b.lo)
                  return (
                    <g key={b.k}>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={FF.bandH}
                        rx="4"
                        fill="var(--lp-azure)"
                        opacity="0.22"
                        stroke="var(--lp-azure)"
                        strokeOpacity="0.4"
                        strokeWidth="0.75"
                      />
                      <text
                        x={x + 6}
                        y={y + FF.bandH / 2 + 3.5}
                        className="lp-rsrch__bandlbl"
                        fill="var(--lp-t2)"
                      >
                        {b.k}
                      </text>
                    </g>
                  )
                })}

                {/* x-axis */}
                <line
                  x1={FF.x0}
                  y1={FF.axisY}
                  x2={FF.x1}
                  y2={FF.axisY}
                  stroke="var(--lp-border)"
                  strokeWidth="1"
                />
                <text x={FF.x0} y={FF.axisY + 13} className="lp-rsrch__axis" fill="var(--lp-t3)">
                  {FOOTBALL.low}
                </text>
                <text
                  x={FF.x1}
                  y={FF.axisY + 13}
                  className="lp-rsrch__axis"
                  fill="var(--lp-t3)"
                  textAnchor="end"
                >
                  {FOOTBALL.high}
                </text>

                {/* current-price marker */}
                <line
                  x1={ffx(FOOTBALL.price)}
                  y1={FF.top - 8}
                  x2={ffx(FOOTBALL.price)}
                  y2={FF.axisY}
                  stroke="var(--lp-up)"
                  strokeWidth="1.5"
                />
                <circle cx={ffx(FOOTBALL.price)} cy={FF.top - 8} r="2.5" fill="var(--lp-up)" />
                <text
                  x={ffx(FOOTBALL.price)}
                  y={FF.top - 12}
                  className="lp-rsrch__mark"
                  fill="var(--lp-up)"
                  textAnchor="middle"
                >
                  Giá HT {FOOTBALL.price}
                </text>
              </svg>
            </div>

            <p className="lp-rsrch__cap">
              Vùng giá hợp lý theo P/E, RIM, Book floor — KHÔNG dùng DCF.
            </p>
          </article>
        </div>
      </div>

      <style>{`
        .lp-rsrch__grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
        }
        @media (min-width: 880px) {
          .lp-rsrch__grid { grid-template-columns: repeat(3, 1fr); }
        }

        .lp-rsrch__card {
          display: flex;
          flex-direction: column;
          padding: 20px 20px 18px;
        }
        .lp-rsrch__top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .lp-rsrch__name { font-size: 18px; margin-bottom: 5px; }
        .lp-rsrch__note { font-size: 12.5px; line-height: 1.45; color: var(--lp-t3); max-width: 30ch; }
        .lp-rsrch__cap {
          margin-top: auto;
          padding-top: 16px;
          font-size: 11.5px;
          line-height: 1.55;
          color: var(--lp-t3);
        }

        /* ── DuPont ── */
        .lp-rsrch__dupont {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
        }
        .lp-rsrch__step { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
        .lp-rsrch__tile {
          display: flex;
          flex-direction: column;
          gap: 5px;
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r);
          padding: 11px 13px;
        }
        .lp-rsrch__tk {
          font-size: 10.5px;
          letter-spacing: 0.02em;
          color: var(--lp-t3);
          text-transform: uppercase;
        }
        .lp-rsrch__tv { font-size: 17px; font-weight: 700; color: var(--lp-t1); line-height: 1; }
        .lp-rsrch__op {
          align-self: center;
          font-size: 16px;
          font-weight: 700;
          color: var(--lp-t4);
          line-height: 1;
        }
        .lp-rsrch__tile--roe {
          background: var(--lp-azure-soft);
          border-color: var(--lp-azure-line);
        }
        .lp-rsrch__tile--roe .lp-rsrch__tk { color: var(--lp-azure); }
        .lp-rsrch__roev {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--lp-azure);
          line-height: 1;
        }

        /* ── trinity ── */
        .lp-rsrch__trinity { list-style: none; display: flex; flex-direction: column; gap: 9px; }
        .lp-rsrch__trow {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 10px;
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r);
          padding: 12px 14px;
        }
        .lp-rsrch__trk { font-size: 13.5px; font-weight: 600; color: var(--lp-t1); }
        .lp-rsrch__trv { font-size: 15px; font-weight: 700; color: var(--lp-t1); }
        .lp-rsrch__pill {
          display: inline-flex;
          align-items: center;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid;
          opacity: 0.95;
          white-space: nowrap;
        }

        /* ── football field ── */
        .lp-rsrch__ff {
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r);
          padding: 8px 10px;
        }
        .lp-rsrch__ff svg { display: block; width: 100%; height: auto; }
        .lp-rsrch__bandlbl {
          font-family: var(--lp-mono);
          font-size: 9px;
          font-weight: 600;
        }
        .lp-rsrch__axis { font-family: var(--lp-mono); font-size: 9px; }
        .lp-rsrch__mark { font-family: var(--lp-mono); font-size: 9.5px; font-weight: 700; }
      `}</style>
    </section>
  )
}
