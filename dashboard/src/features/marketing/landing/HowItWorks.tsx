import { HOW_BEATS, SOURCES, DEMO_STOCKS } from "./data"
import { toneColor } from "./util"

export function HowItWorks() {
  const layers = DEMO_STOCKS[0].layers

  return (
    <section className="lp-section lp-section--tint" id="quy-trinh">
      <div className="lp-wrap">
        <span className="lp-eyebrow">Quy trình · Không phải tín hiệu hộp đen</span>
        <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12, maxWidth: "16ch" }}>
          AI phân tích một mã như thế nào
        </h2>
        <p className="lp-lead" style={{ marginBottom: 30 }}>
          Ba bước, từ dữ liệu thô đến một kết luận bạn có thể đọc trong 10 giây.
        </p>

        <div className="lp-how" data-pin>
          <div className="lp-how__beats">
            {HOW_BEATS.map((b) => (
              <div className="lp-how__beat" data-beat key={b.n}>
                <div className="lp-how__beatnum lp-mono">{b.n}</div>
                <div>
                  <h3 className="lp-how__beattitle">{b.title}</h3>
                  <p className="lp-how__beatbody">{b.body}</p>
                  <span className="lp-how__beatstat lp-mono">{b.stat}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="lp-how__figs">
            {/* fig 0 — Dữ liệu */}
            <div className="lp-how__fig lp-card" data-fig>
              <div className="lp-how__figk lp-mono">17 NGUỒN → 38 CHỈ BÁO</div>
              <div className="lp-how__sources">
                {SOURCES.map((s) => (
                  <span className="lp-mono lp-how__src" key={s}>
                    {s}
                  </span>
                ))}
              </div>
              <div className="lp-how__pipe">
                <span className="lp-how__pipeline" />
                <span className="lp-how__pipenode lp-mono">38 chỉ báo kỹ thuật</span>
              </div>
            </div>

            {/* fig 1 — Mô hình */}
            <div className="lp-how__fig lp-card" data-fig>
              <div className="lp-how__figk lp-mono">6 LỚP · THANG 5 ĐIỂM</div>
              <div className="lp-how__layers">
                {layers.map((l, i) => (
                  <div className="lp-how__layer" key={l.id}>
                    <span className="lp-how__layerid lp-mono">{l.id}</span>
                    <span className="lp-how__layername">{l.name}</span>
                    <span className="lp-how__bar">
                      <i style={{ width: `${[62, 48, 40, 78, 55, 60][i]}%`, background: toneColor[l.tone] }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* fig 2 — Kết luận */}
            <div className="lp-how__fig lp-card" data-fig>
              <div className="lp-how__figk lp-mono">BRIEFING · TIẾNG VIỆT</div>
              <div className="lp-how__concl">
                <div className="lp-how__concltick lp-mono">VCB · Ngân hàng</div>
                <p className="lp-how__conclbrief">
                  Khối ngoại bán mạnh phiên thứ 3 khiến VCB khó bứt phá quanh 61.600. Nội bộ mua vào
                  giữ tâm lý ổn định. Vùng 61.600–61.900 quyết định hướng đi.
                </p>
                <div className="lp-how__conclrec" style={{ color: toneColor.warn }}>
                  → Gợi ý: Quan sát thêm
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .lp-how { display: grid; gap: 28px; }
        .lp-how__beats { display: grid; gap: 18px; }
        .lp-how__beat {
          display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start;
          padding: 16px; border-radius: 16px; border: 1px solid transparent;
          transition: opacity 0.45s ease, border-color 0.3s ease, background 0.3s ease;
        }
        .lp-how__beatnum {
          font-size: 22px; font-weight: 800; color: var(--lp-azure);
          width: 46px; height: 46px; display: grid; place-items: center;
          border: 1px solid var(--lp-azure-line); border-radius: 12px; background: var(--lp-azure-soft);
        }
        .lp-how__beattitle { font-size: 19px; font-weight: 800; color: var(--lp-t1); margin-bottom: 6px; }
        .lp-how__beatbody { font-size: 14.5px; line-height: 1.6; color: var(--lp-t2); margin-bottom: 8px; }
        .lp-how__beatstat { font-size: 12px; color: var(--lp-azure); letter-spacing: 0.04em; }

        .lp-how__figs { position: relative; }
        .lp-how__fig { padding: 20px; }
        .lp-how__figk { font-size: 11px; letter-spacing: 0.08em; color: var(--lp-t3); margin-bottom: 16px; }

        .lp-how__sources { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 18px; }
        .lp-how__src {
          font-size: 12px; font-weight: 600; color: var(--lp-t2);
          background: var(--lp-bg-2); border: 1px solid var(--lp-border-soft);
          border-radius: 7px; padding: 5px 9px;
        }
        .lp-how__pipe { display: flex; align-items: center; gap: 12px; }
        .lp-how__pipeline { flex: 1; height: 2px; background: linear-gradient(90deg, transparent, var(--lp-azure)); border-radius: 2px; }
        .lp-how__pipenode {
          font-size: 13px; font-weight: 700; color: #fff; background: var(--lp-azure);
          border-radius: 8px; padding: 8px 12px; white-space: nowrap;
        }

        .lp-how__layers { display: grid; gap: 11px; }
        .lp-how__layer { display: grid; grid-template-columns: 30px 92px 1fr; gap: 10px; align-items: center; }
        .lp-how__layerid { font-size: 12px; font-weight: 700; color: var(--lp-azure); }
        .lp-how__layername { font-size: 13.5px; font-weight: 600; color: var(--lp-t1); }
        .lp-how__bar { height: 8px; border-radius: 999px; background: var(--lp-bg-2); overflow: hidden; }
        .lp-how__bar i { display: block; height: 100%; border-radius: 999px; }

        .lp-how__concltick { font-size: 13px; color: var(--lp-t3); margin-bottom: 10px; }
        .lp-how__conclbrief { font-size: 14.5px; line-height: 1.62; color: var(--lp-t1); margin-bottom: 14px; }
        .lp-how__conclrec { font-size: 16px; font-weight: 800; }

        /* default (no-JS / reduced motion): all figs visible, stacked */
        .lp-how__fig { margin-bottom: 14px; }

        @media (min-width: 880px) {
          .lp-how { grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; min-height: 64vh; }
          .lp-how__beats { gap: 8px; }
          /* when motion is on, figures stack & swap */
          .lp-js .lp-how__figs { min-height: 360px; }
          .lp-js .lp-how__fig {
            position: absolute; inset: 0; margin: 0; opacity: 0; transform: translateY(18px);
            transition: opacity 0.5s ease, transform 0.5s ease; pointer-events: none;
          }
          .lp-js .lp-how__fig.is-active { opacity: 1; transform: none; pointer-events: auto; }
          .lp-js .lp-how__beat { opacity: 0.42; }
          .lp-js .lp-how__beat.is-active {
            opacity: 1; border-color: var(--lp-border); background: var(--lp-panel);
          }
        }
      `}</style>
    </section>
  )
}
