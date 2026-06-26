import { FEATURES, type Feature } from "./data"

function tierLabel(tier: Feature["tier"]) {
  return tier === "free" ? "Miễn phí" : "Premium"
}

export function FeaturesBento({ onRegister }: { onRegister: () => void }) {
  return (
    <section className="lp-section lp-section--tint" id="tinh-nang">
      <div className="lp-wrap">
        <div className="lp-bento__head">
          <span className="lp-eyebrow">Tất cả công cụ · Một terminal</span>
          <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 14 }}>
            Cả một phòng phân tích định lượng, trong trình duyệt.
          </h2>
          <p className="lp-lead">
            38 chỉ báo, backtest chiến lược, cảnh báo Telegram, BCTC, định giá — tất cả trên dữ liệu
            thật của ~2.048 mã.
          </p>
        </div>

        <div className="lp-bento__grid">
          {FEATURES.map((f) => {
            const flagship = f.id === "ai-insight"
            return (
              <article
                key={f.id}
                className={`lp-card lp-reveal lp-bento__cell${flagship ? " is-flagship" : ""}`}
              >
                <div className="lp-bento__top">
                  <span className="lp-bento__icon" aria-hidden="true">
                    {f.icon}
                  </span>
                  <span
                    className={`lp-badge ${f.tier === "free" ? "lp-badge--free" : "lp-badge--premium"}`}
                  >
                    {tierLabel(f.tier)}
                  </span>
                </div>
                <h3 className="lp-bento__name">{f.name}</h3>
                <p className="lp-bento__tag">{f.tagline}</p>
                {flagship && (
                  <div className="lp-bento__viz" aria-hidden="true">
                    {["L1", "L2", "L3", "L4", "L5", "L6"].map((id, i) => (
                      <span className="lp-bento__viz-col" key={id}>
                        <span
                          className="lp-bento__viz-bar"
                          style={{ height: `${[58, 44, 38, 74, 52, 66][i]}%` }}
                        />
                        <span className="lp-bento__viz-id lp-mono">{id}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="lp-bento__proof lp-mono">{f.proof}</p>
              </article>
            )
          })}
        </div>

        <div className="lp-bento__cta">
          <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onRegister}>
            Đăng ký miễn phí — mở mọi công cụ →
          </button>
          <p className="lp-bento__reassure lp-mono">Tặng 7 ngày Premium · không cần thẻ</p>
        </div>
      </div>

      <style>{`
        .lp-bento__head { max-width: 64ch; margin-bottom: clamp(28px, 4vw, 44px); }

        .lp-bento__grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        .lp-bento__cell {
          display: flex;
          flex-direction: column;
          padding: 20px;
          border-radius: var(--lp-r);
          transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
        }
        .lp-bento__cell:hover {
          transform: translateY(-4px);
          border-color: var(--lp-azure);
          box-shadow: var(--lp-shadow);
        }

        .lp-bento__top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .lp-bento__icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          flex: none;
          border-radius: 11px;
          background: var(--lp-azure-soft);
          color: var(--lp-azure);
          font-size: 20px;
          line-height: 1;
        }
        .lp-bento__top .lp-badge { margin-left: auto; }

        .lp-bento__name {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.01em;
          line-height: 1.25;
          color: var(--lp-t1);
          margin-bottom: 7px;
        }
        .lp-bento__tag {
          font-size: 14.5px;
          line-height: 1.55;
          color: var(--lp-t2);
          margin-bottom: 16px;
        }
        .lp-bento__proof {
          margin-top: auto;
          font-size: 11.5px;
          line-height: 1.5;
          color: var(--lp-t3);
          letter-spacing: 0.01em;
        }

        /* flagship */
        .lp-bento__cell.is-flagship {
          background:
            linear-gradient(180deg, var(--lp-azure-soft), transparent 70%),
            var(--lp-panel);
          border-color: var(--lp-azure-line);
        }
        .is-flagship .lp-bento__icon {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          font-size: 28px;
          box-shadow: 0 10px 24px -12px var(--lp-glow);
        }
        .is-flagship .lp-bento__name {
          font-size: clamp(21px, 3.4vw, 27px);
          letter-spacing: -0.02em;
          line-height: 1.18;
          margin-bottom: 10px;
        }
        .is-flagship .lp-bento__tag {
          font-size: clamp(15px, 2vw, 17px);
          line-height: 1.6;
        }
        .is-flagship .lp-bento__proof { font-size: 12.5px; }

        .lp-bento__viz {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex: 1;
          min-height: 116px;
          margin: 4px 0 18px;
          padding: 16px 16px 12px;
          border: 1px solid var(--lp-border-soft);
          border-radius: 14px;
          background: var(--lp-bg-2);
        }
        .lp-bento__viz-col {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .lp-bento__viz-bar {
          width: 100%;
          border-radius: 6px 6px 3px 3px;
          background: linear-gradient(180deg, var(--lp-azure-2), var(--lp-azure));
          opacity: 0.9;
        }
        .lp-bento__viz-id { font-size: 10.5px; color: var(--lp-t3); }

        .lp-bento__cta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-top: clamp(32px, 5vw, 48px);
          text-align: center;
        }
        .lp-bento__reassure {
          font-size: 12.5px;
          color: var(--lp-t3);
        }

        @media (min-width: 640px) {
          .lp-bento__grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (min-width: 1000px) {
          .lp-bento__grid {
            grid-template-columns: repeat(4, 1fr);
            grid-auto-rows: 1fr;
            gap: 16px;
          }
          .lp-bento__cell.is-flagship {
            grid-column: span 2;
            grid-row: span 2;
            padding: 28px;
          }
        }
      `}</style>
    </section>
  )
}
