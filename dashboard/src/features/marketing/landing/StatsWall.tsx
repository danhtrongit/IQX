import { STATS, SOURCES } from "./data"

export function StatsWall() {
  return (
    <section className="lp-section lp-stats" id="du-lieu">
      <div className="lp-wrap">
        <div className="lp-stats__head lp-reveal">
          <span className="lp-eyebrow lp-eyebrow--center">Nền tảng dữ liệu</span>
          <h2 className="lp-h2 lp-stats__title">Dữ liệu thật, kiểm chứng được.</h2>
          <p className="lp-lead lp-stats__lead">
            Mọi phân tích của IQX đều dựng trên dữ liệu có thể truy vết — không phải cảm tính.
          </p>
        </div>

        <div className="lp-stats__grid lp-reveal">
          {STATS.map((s) => {
            const prefix = s.prefix ?? ""
            return (
              <div className="lp-stats__cell" key={s.label}>
                <div className="lp-stats__value lp-mono">
                  <span data-countup={s.value} data-prefix={prefix} data-decimals="0">
                    {prefix}
                    {s.value.toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="lp-stats__label">{s.label}</div>
              </div>
            )
          })}
        </div>

        <div className="lp-tape lp-stats__tape lp-reveal" />

        <div className="lp-stats__sources lp-reveal">
          <div className="lp-stats__sources-label lp-mono">Nguồn dữ liệu tích hợp</div>
          <div className="lp-stats__sources-wall">
            {SOURCES.map((name) => (
              <span className="lp-stats__source lp-mono" key={name}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .lp-stats { text-align: center; }
        .lp-stats__head {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .lp-stats__title { margin-top: 4px; }
        .lp-stats__lead {
          max-width: 50ch;
          margin-inline: auto;
        }

        .lp-stats__grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px;
          margin-top: clamp(36px, 6vw, 56px);
          background: var(--lp-border-soft);
          border: 1px solid var(--lp-border-soft);
          border-radius: var(--lp-r-lg);
          overflow: hidden;
        }
        .lp-stats__cell {
          background: var(--lp-panel);
          padding: clamp(22px, 4vw, 34px) 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .lp-stats__value {
          font-size: clamp(32px, 6vw, 52px);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--lp-t1);
        }
        .lp-stats__label {
          font-size: 13px;
          color: var(--lp-t3);
          line-height: 1.35;
        }
        /* last odd cell spans full width on the 2-col mobile layout */
        .lp-stats__cell:last-child:nth-child(odd) {
          grid-column: 1 / -1;
        }
        @media (min-width: 560px) {
          .lp-stats__grid { grid-template-columns: repeat(3, 1fr); }
          .lp-stats__cell:last-child:nth-child(odd) { grid-column: auto; }
        }
        @media (min-width: 880px) {
          .lp-stats__grid { grid-template-columns: repeat(5, 1fr); }
        }

        .lp-stats__tape {
          margin: clamp(40px, 6vw, 60px) auto;
          max-width: 720px;
        }

        .lp-stats__sources {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
        }
        .lp-stats__sources-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--lp-t3);
        }
        .lp-stats__sources-wall {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px 12px;
          max-width: 760px;
        }
        .lp-stats__source {
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--lp-t3);
          background: var(--lp-bg-2);
          border: 1px solid var(--lp-border-soft);
          border-radius: 999px;
          padding: 7px 14px;
          transition: color 0.14s ease, border-color 0.14s ease;
        }
        .lp-stats__source:hover {
          color: var(--lp-t1);
          border-color: var(--lp-azure-line);
        }
      `}</style>
    </section>
  )
}
