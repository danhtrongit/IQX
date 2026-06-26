import { MARKET } from "./data"
import { toneColor, toneSoft } from "./util"

/* Foreign net-flow bar chart — values may be negative; zero line at mid. */
function ForeignBars() {
  const vals = MARKET.foreign
  const W = 320
  const H = 70
  const mid = H / 2
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 0.0001)
  const slot = W / vals.length
  const bw = slot * 0.56
  const gap = (slot - bw) / 2
  const maxBarH = mid - 4 // keep a little headroom from the edges

  return (
    <svg
      className="lp-mkt__bars"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1={mid}
        x2={W}
        y2={mid}
        stroke="var(--lp-border)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {vals.map((v, i) => {
        const x = i * slot + gap
        const h = (Math.abs(v) / maxAbs) * maxBarH
        const up = v >= 0
        const y = up ? mid - h : mid
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={bw}
            height={Math.max(h, 1)}
            rx="1.5"
            fill={up ? "var(--lp-up)" : "var(--lp-down)"}
            opacity="0.92"
          />
        )
      })}
    </svg>
  )
}

export function MarketBriefing() {
  const { breadth } = MARKET
  const breadthTotal = breadth.up + breadth.flat + breadth.down || 1

  return (
    <section className="lp-section" id="thi-truong">
      <div className="lp-wrap lp-wrap--narrow">
        <span className="lp-eyebrow lp-reveal">
          Toàn cảnh thị trường · Miễn phí mỗi phiên
        </span>
        <h2 className="lp-h2 lp-reveal" style={{ marginTop: 14, marginBottom: 12 }}>
          Mỗi chiều, IQX đọc xong cả thị trường.
        </h2>
        <p className="lp-lead lp-reveal" style={{ marginBottom: 24 }}>
          Hết phiên, IQX tổng kết toàn cảnh sàn — chỉ số, độ rộng, dòng tiền khối ngoại
          — rồi viết thành một bản tin ngắn kèm kịch bản cho phiên sau. Tất cả miễn phí.
        </p>

        <div className="lp-mkt__card lp-card lp-reveal">
          {/* meta row */}
          <div className="lp-mkt__meta lp-mono">
            <span className="lp-mkt__dot" aria-hidden="true" />
            <span>{MARKET.status}</span>
            <span className="lp-mkt__sep">·</span>
            <span>{MARKET.date}</span>
            <span className="lp-mkt__sep">·</span>
            <span>{MARKET.time}</span>
            <span className="lp-mkt__sep">·</span>
            <span className="lp-mkt__brand">IQX</span>
          </div>

          <div className="lp-mkt__body">
            {/* verdict + headline */}
            <span
              className="lp-mkt__verdict lp-mono"
              style={{
                color: toneColor[MARKET.verdictTone],
                background: toneSoft[MARKET.verdictTone],
                borderColor: toneColor[MARKET.verdictTone],
              }}
            >
              ◆ {MARKET.verdict}
            </span>

            <h3 className="lp-mkt__headline">{MARKET.headline}</h3>
            <p className="lp-mkt__sub">{MARKET.sub}</p>

            {/* pulse bar */}
            <div className="lp-mkt__pulse">
              {MARKET.pulse.map((c) => (
                <div className="lp-mkt__cell" key={c.k}>
                  <div className="lp-mkt__cellk lp-mono">{c.k}</div>
                  <div className="lp-mkt__cellv lp-mono">{c.v}</div>
                  <div
                    className="lp-mkt__celld lp-mono"
                    style={{ color: toneColor[c.tone] }}
                  >
                    {c.d}
                  </div>
                </div>
              ))}
            </div>

            {/* nhận định */}
            <div className="lp-mkt__read">
              <div className="lp-mkt__readk lp-mono">Nhận định</div>
              <p className="lp-mkt__readp">{MARKET.read}</p>
            </div>

            {/* two mini charts */}
            <div className="lp-mkt__charts">
              <div className="lp-mkt__chart">
                <div className="lp-mkt__chartk lp-mono">
                  Khối ngoại · 15 phiên (nghìn tỷ)
                </div>
                <ForeignBars />
                <div className="lp-legend">
                  <span>
                    <i style={{ background: "var(--lp-up)" }} />
                    Mua ròng
                  </span>
                  <span>
                    <i style={{ background: "var(--lp-down)" }} />
                    Bán ròng
                  </span>
                </div>
              </div>

              <div className="lp-mkt__chart">
                <div className="lp-mkt__chartk lp-mono">Độ rộng HOSE</div>
                <div className="lp-breadth">
                  <span
                    style={{ flex: breadth.up, background: "var(--lp-up)" }}
                    title={`${breadth.up} tăng`}
                  />
                  <span
                    style={{ flex: breadth.flat, background: "var(--lp-t4)" }}
                    title={`${breadth.flat} đứng`}
                  />
                  <span
                    style={{ flex: breadth.down, background: "var(--lp-down)" }}
                    title={`${breadth.down} giảm`}
                  />
                </div>
                <div className="lp-legend">
                  <span>
                    <i style={{ background: "var(--lp-up)" }} />
                    {breadth.up} tăng
                  </span>
                  <span>
                    <i style={{ background: "var(--lp-t4)" }} />
                    {breadth.flat} đứng
                  </span>
                  <span>
                    <i style={{ background: "var(--lp-down)" }} />
                    {breadth.down} giảm
                  </span>
                </div>
                <div className="lp-mkt__chartfoot lp-mono">
                  {breadth.down}/{breadth.up} trên{" "}
                  {breadthTotal.toLocaleString("vi-VN")} mã
                </div>
              </div>
            </div>

            {/* kịch bản phiên sau */}
            <div className="lp-mkt__scen">
              <div className="lp-mkt__readk lp-mono">Kịch bản phiên sau</div>
              <div className="lp-mkt__scenrows">
                {MARKET.scenarios.map((s) => (
                  <div className="lp-mkt__scenrow" key={s.cond}>
                    <span className="lp-mkt__scencond">{s.cond}</span>
                    <span className="lp-mkt__scenarrow" aria-hidden="true">
                      →
                    </span>
                    <span
                      className="lp-mkt__scenout"
                      style={{ color: toneColor[s.tone] }}
                    >
                      {s.out}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lp-mkt__disc lp-mono">
            IQX · sinh tự động · không phải khuyến nghị đầu tư
          </div>
        </div>

        <p className="lp-mkt__close lp-reveal">
          Bản tin đầy đủ được tạo tự động mỗi phiên, sau 16:30.
        </p>
      </div>

      <style>{`
        .lp-mkt__card { padding: 0; overflow: hidden; }

        .lp-mkt__meta {
          display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
          padding: 13px 18px; border-bottom: 1px solid var(--lp-border-soft);
          font-size: 11.5px; color: var(--lp-t3); letter-spacing: 0.02em;
        }
        .lp-mkt__dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--lp-down); flex: none;
          box-shadow: 0 0 0 3px var(--lp-down-soft);
        }
        .lp-mkt__sep { color: var(--lp-border); }
        .lp-mkt__brand { margin-left: auto; color: var(--lp-t2); font-weight: 700; letter-spacing: 0.06em; }

        .lp-mkt__body { padding: 20px 20px 6px; }

        .lp-mkt__verdict {
          display: inline-flex; align-items: center;
          font-size: 11.5px; font-weight: 700; letter-spacing: 0.03em;
          padding: 4px 11px; border-radius: 999px; border: 1px solid;
          margin-bottom: 14px;
        }

        .lp-mkt__headline {
          font-size: clamp(20px, 4vw, 27px); font-weight: 700;
          line-height: 1.24; letter-spacing: -0.015em; color: var(--lp-t1);
          margin-bottom: 8px;
        }
        .lp-mkt__sub { font-size: 14px; line-height: 1.55; color: var(--lp-t2); margin-bottom: 20px; }

        /* pulse bar */
        .lp-mkt__pulse {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px;
          background: var(--lp-border-soft);
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r); overflow: hidden; margin-bottom: 20px;
        }
        .lp-mkt__cell { background: var(--lp-panel); padding: 13px 14px; }
        .lp-mkt__cellk {
          font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--lp-t3); margin-bottom: 6px;
        }
        .lp-mkt__cellv {
          font-size: clamp(16px, 3vw, 19px); font-weight: 700;
          letter-spacing: -0.01em; color: var(--lp-t1); line-height: 1.05;
        }
        .lp-mkt__celld { font-size: 11.5px; margin-top: 5px; }
        @media (min-width: 560px) {
          .lp-mkt__pulse { grid-template-columns: repeat(4, 1fr); }
        }

        /* nhận định */
        .lp-mkt__read { margin-bottom: 20px; }
        .lp-mkt__readk {
          font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--lp-azure); margin-bottom: 7px;
        }
        .lp-mkt__readp { font-size: 14.5px; line-height: 1.62; color: var(--lp-t1); }

        /* charts */
        .lp-mkt__charts {
          display: grid; grid-template-columns: 1fr; gap: 18px;
          padding: 16px; margin-bottom: 20px;
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft); border-radius: var(--lp-r);
        }
        @media (min-width: 560px) {
          .lp-mkt__charts { grid-template-columns: 1fr 1fr; gap: 22px; }
        }
        .lp-mkt__chartk {
          font-size: 11px; letter-spacing: 0.04em;
          color: var(--lp-t3); margin-bottom: 12px;
        }
        .lp-mkt__bars { display: block; width: 100%; height: 70px; }
        .lp-mkt__chartfoot { font-size: 11px; color: var(--lp-t3); margin-top: 9px; }

        /* scenarios */
        .lp-mkt__scen { margin-bottom: 4px; }
        .lp-mkt__scenrows { display: flex; flex-direction: column; gap: 8px; }
        .lp-mkt__scenrow {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 11px 14px;
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft); border-radius: 11px;
        }
        .lp-mkt__scencond {
          font-size: 13px; color: var(--lp-t2); flex: 1 1 150px; min-width: 0;
          font-family: var(--lp-mono); letter-spacing: 0.01em;
        }
        .lp-mkt__scenarrow { color: var(--lp-t4); font-size: 14px; flex: none; }
        .lp-mkt__scenout {
          font-size: 13.5px; font-weight: 700; flex: 1 1 140px;
          text-align: right; letter-spacing: -0.005em;
        }

        .lp-mkt__disc {
          font-size: 10.5px; color: var(--lp-t4);
          padding: 14px 20px 16px; border-top: 1px solid var(--lp-border-soft);
        }

        .lp-mkt__close {
          margin-top: 18px; text-align: center;
          font-size: 13.5px; color: var(--lp-t3);
        }
      `}</style>
    </section>
  )
}
