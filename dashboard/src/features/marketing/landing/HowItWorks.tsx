import { HOW_BEATS, SOURCES, DEMO_STOCKS } from "./data"
import { toneColor } from "./util"

function BeatFigure({ index }: { index: number }) {
  const layers = DEMO_STOCKS[0].layers

  if (index === 0) {
    return (
      <div className="lp-how__fig">
        <div className="lp-how__sources">
          {SOURCES.map((s) => (
            <span className="lp-mono lp-how__src" key={s}>
              {s}
            </span>
          ))}
        </div>
        <div className="lp-how__pipe">
          <span className="lp-how__pipeline" />
          <span className="lp-how__pipenode lp-mono">38 chỉ báo</span>
        </div>
      </div>
    )
  }

  if (index === 1) {
    return (
      <div className="lp-how__fig">
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
    )
  }

  return (
    <div className="lp-how__fig">
      <div className="lp-how__concltick lp-mono">VCB · Ngân hàng</div>
      <p className="lp-how__conclbrief">
        Khối ngoại bán mạnh phiên thứ 3 khiến VCB khó bứt phá quanh 61.600. Vùng 61.600–61.900 quyết
        định hướng đi.
      </p>
      <div className="lp-how__conclrec" style={{ color: toneColor.warn }}>
        → Gợi ý: Quan sát thêm
      </div>
    </div>
  )
}

export function HowItWorks() {
  return (
    <section className="lp-section lp-section--tint" id="quy-trinh">
      <div className="lp-wrap">
        <span className="lp-eyebrow">Quy trình · Không phải tín hiệu hộp đen</span>
        <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 10, maxWidth: "16ch" }}>
          AI phân tích một mã như thế nào
        </h2>
        <p className="lp-lead" style={{ marginBottom: 28 }}>
          Ba bước, từ dữ liệu thô đến một kết luận bạn có thể đọc trong 10 giây.
        </p>

        <div className="lp-how">
          {HOW_BEATS.map((b, i) => (
            <article className="lp-how__card lp-card lp-reveal" key={b.n}>
              <div className="lp-how__head">
                <span className="lp-how__num lp-mono">{b.n}</span>
                <h3 className="lp-how__title">{b.title}</h3>
              </div>
              <p className="lp-how__body">{b.body}</p>
              <span className="lp-how__stat lp-mono">{b.stat}</span>
              <BeatFigure index={i} />
            </article>
          ))}
        </div>
      </div>

      <style>{`
        .lp-how { display: grid; grid-template-columns: 1fr; gap: 14px; }

        .lp-how__card { display: flex; flex-direction: column; padding: 20px; border-radius: var(--lp-r); }
        .lp-how__head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .lp-how__num {
          font-size: 15px; font-weight: 800; color: var(--lp-azure); flex: none;
          width: 38px; height: 38px; display: grid; place-items: center;
          border: 1px solid var(--lp-azure-line); border-radius: 10px; background: var(--lp-azure-soft);
        }
        .lp-how__title { font-size: 17px; font-weight: 800; color: var(--lp-t1); line-height: 1.2; }
        .lp-how__body { font-size: 14px; line-height: 1.55; color: var(--lp-t2); margin-bottom: 8px; }
        .lp-how__stat { font-size: 12px; color: var(--lp-azure); letter-spacing: 0.04em; margin-bottom: 16px; }

        .lp-how__fig {
          margin-top: auto; padding: 14px; border-radius: 12px;
          background: var(--lp-bg-2); border: 1px solid var(--lp-border-soft);
        }
        .lp-how__sources { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .lp-how__src {
          font-size: 11.5px; font-weight: 600; color: var(--lp-t2);
          background: var(--lp-panel); border: 1px solid var(--lp-border-soft);
          border-radius: 6px; padding: 4px 8px;
        }
        .lp-how__pipe { display: flex; align-items: center; gap: 10px; }
        .lp-how__pipeline { flex: 1; height: 2px; background: var(--lp-azure-line); border-radius: 2px; }
        .lp-how__pipenode {
          font-size: 12px; font-weight: 700; color: #fff; background: var(--lp-azure);
          border-radius: 7px; padding: 6px 10px; white-space: nowrap;
        }

        .lp-how__layers { display: grid; gap: 9px; }
        .lp-how__layer { display: grid; grid-template-columns: 26px 78px 1fr; gap: 8px; align-items: center; }
        .lp-how__layerid { font-size: 11.5px; font-weight: 700; color: var(--lp-azure); }
        .lp-how__layername { font-size: 12.5px; font-weight: 600; color: var(--lp-t1); }
        .lp-how__bar { height: 7px; border-radius: 999px; background: var(--lp-panel); overflow: hidden; }
        .lp-how__bar i { display: block; height: 100%; border-radius: 999px; }

        .lp-how__concltick { font-size: 12.5px; color: var(--lp-t3); margin-bottom: 8px; }
        .lp-how__conclbrief { font-size: 13.5px; line-height: 1.55; color: var(--lp-t1); margin-bottom: 10px; }
        .lp-how__conclrec { font-size: 15px; font-weight: 800; }

        @media (min-width: 880px) {
          .lp-how { grid-template-columns: repeat(3, 1fr); gap: 18px; }
        }
      `}</style>
    </section>
  )
}
