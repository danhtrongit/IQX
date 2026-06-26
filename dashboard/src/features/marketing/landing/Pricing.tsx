import { PLANS, type Plan } from "./data"

function ctaClass(plan: Plan) {
  if (plan.highlight) return "lp-btn lp-btn--primary lp-btn--block lp-btn--lg"
  if (plan.id === "pro") return "lp-btn lp-btn--ghost lp-btn--block"
  return "lp-btn lp-btn--soft lp-btn--block"
}

export function Pricing({ onRegister }: { onRegister: () => void }) {
  return (
    <section className="lp-section" id="gia">
      <div className="lp-wrap">
        <div className="lp-price__head">
          <span className="lp-eyebrow lp-eyebrow--center">Bảng giá · Bắt đầu miễn phí</span>
          <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 14 }}>
            Miễn phí để bắt đầu. Nâng cấp khi cần.
          </h2>
          <p className="lp-lead lp-price__lead">
            Bắt đầu đọc thị trường ngay hôm nay mà không mất phí. Khi muốn dùng AI phân tích, backtest
            và cảnh báo, bạn nâng cấp lên Premium — đơn giản, minh bạch.
          </p>
        </div>

        <div className="lp-price__grid">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`lp-card lp-reveal lp-price__card${plan.highlight ? " is-highlight" : ""}`}
            >
              {plan.highlight && plan.badge && (
                <span className="lp-price__pill">{plan.badge}</span>
              )}

              <h3 className="lp-h3 lp-price__name">{plan.name}</h3>

              <div className="lp-price__pxrow">
                <span className="lp-mono lp-price__px">{plan.price}</span>
                <span className="lp-price__period">{plan.period}</span>
              </div>

              <p className="lp-price__note">{plan.note}</p>

              <span className="lp-price__divider" aria-hidden="true" />

              <ul className="lp-price__feats">
                {plan.features.map((f) => (
                  <li key={f} className="lp-price__feat">
                    <span className="lp-price__check" aria-hidden="true">
                      ✓
                    </span>
                    <span className="lp-price__feattext">{f}</span>
                  </li>
                ))}
              </ul>

              <button className={`${ctaClass(plan)} lp-price__cta`} onClick={onRegister}>
                {plan.cta}
              </button>
            </article>
          ))}
        </div>

        <p className="lp-price__reassure lp-mono">
          Mọi gói đều bắt đầu bằng 7 ngày Premium miễn phí · không cần thẻ · huỷ bất cứ lúc nào.
        </p>
      </div>

      <style>{`
        .lp-price__head {
          max-width: 60ch;
          margin: 0 auto clamp(28px, 4vw, 46px);
          text-align: center;
        }
        .lp-price__lead {
          margin-left: auto;
          margin-right: auto;
        }

        .lp-price__grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          align-items: stretch;
        }

        .lp-price__card {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 26px;
          transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
        }
        .lp-price__card:hover {
          transform: translateY(-4px);
          box-shadow: var(--lp-shadow);
        }

        .lp-price__name {
          font-weight: 800;
        }

        .lp-price__pxrow {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 14px;
        }
        .lp-price__px {
          font-size: clamp(26px, 5vw, 38px);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--lp-t1);
        }
        .lp-price__period {
          font-size: 13px;
          color: var(--lp-t3);
        }

        .lp-price__note {
          margin-top: 10px;
          font-size: 14px;
          line-height: 1.55;
          color: var(--lp-t2);
        }

        .lp-price__divider {
          display: block;
          height: 1px;
          margin: 18px 0;
          background: var(--lp-hairline);
        }

        .lp-price__feats {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 11px;
          margin-bottom: 22px;
        }
        .lp-price__feat {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .lp-price__check {
          flex: none;
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          margin-top: 1px;
          border-radius: 50%;
          font-size: 11px;
          font-weight: 800;
          line-height: 1;
          color: var(--lp-up);
          background: var(--lp-up-soft);
        }
        .lp-price__feattext {
          font-size: 14px;
          line-height: 1.5;
          color: var(--lp-t1);
        }

        .lp-price__cta {
          margin-top: auto;
        }

        /* highlighted (Premium trial) */
        .lp-price__pill {
          position: absolute;
          top: -11px;
          left: 50%;
          transform: translateX(-50%);
          display: inline-flex;
          align-items: center;
          font-family: var(--lp-mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #fff;
          background: linear-gradient(180deg, var(--lp-azure-2), var(--lp-azure));
          border-radius: 999px;
          padding: 5px 13px;
          box-shadow: 0 10px 22px -10px var(--lp-glow);
          white-space: nowrap;
        }
        .lp-price__card.is-highlight {
          border-color: var(--lp-azure);
          background:
            linear-gradient(180deg, var(--lp-azure-soft), transparent 60%),
            var(--lp-panel);
          box-shadow: var(--lp-shadow);
        }
        .lp-price__card.is-highlight .lp-price__check {
          color: var(--lp-azure);
          background: var(--lp-azure-soft);
        }

        .lp-price__reassure {
          margin-top: clamp(24px, 4vw, 36px);
          text-align: center;
          font-size: 12.5px;
          line-height: 1.6;
          color: var(--lp-t3);
        }

        @media (min-width: 880px) {
          .lp-price__grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 18px;
          }
          .lp-price__card.is-highlight {
            transform: scale(1.03);
          }
          .lp-price__card.is-highlight:hover {
            transform: scale(1.03) translateY(-4px);
          }
        }
      `}</style>
    </section>
  )
}
