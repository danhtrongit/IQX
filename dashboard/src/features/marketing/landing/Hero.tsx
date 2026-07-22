import { useEffect, useRef } from "react"
import gsap from "gsap"
import { GridBackground } from "./GridBackground"
import { HERO_METRICS, DEMO_STOCKS, type Tone } from "./data"

const SWAP_WORDS = ["cổ phiếu", "thị trường", "danh mục", "rủi ro"]

const toneColor: Record<Tone, string> = {
  up: "var(--lp-up)",
  down: "var(--lp-down)",
  warn: "var(--lp-gold)",
  flat: "var(--lp-t3)",
}

function sparkPath(values: number[], w: number, h: number, pad = 4) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (w - pad * 2) / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return [x, y] as const
  })
  const line = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ")
  const area = `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`
  return { line, area }
}

export function Hero({ onPrimary }: { onPrimary: () => void }) {
  const swapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = swapRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const words = Array.from(el.querySelectorAll<HTMLElement>("span"))
    gsap.set(words, { opacity: 0, y: 14 })
    gsap.set(words[0], { opacity: 1, y: 0 })
    const tl = gsap.timeline({ repeat: -1, delay: 1.4 })
    words.forEach((_, i) => {
      const next = words[(i + 1) % words.length]
      tl.to(words[i], { opacity: 0, y: -14, duration: 0.5, ease: "power2.in" }, "+=1.6")
        .fromTo(next, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, "<")
    })
    return () => {
      tl.kill()
    }
  }, [])

  const stock = DEMO_STOCKS[2] // HPG
  const spark = sparkPath([26.9, 27.1, 26.8, 27.0, 27.4, 27.2, 27.6, 27.85], 320, 92)

  return (
    <header className="lp-hero" id="top">
      <div className="lp-hero__bg">
        <GridBackground />
      </div>
      <div className="lp-hero__fallback" aria-hidden="true" />
      <div className="lp-hero__veil" aria-hidden="true" />

      <div className="lp-wrap lp-hero__grid">
        <div className="lp-hero__copy">
          <span className="lp-hero__eyebrow">
            <span className="lp-pip" />
            Trợ lý phân tích chứng khoán Việt Nam
          </span>

          <h1>
            IQX đọc xong{" "}
            <span className="lp-hero__swap" ref={swapRef}>
              {SWAP_WORDS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </span>
            <br />— bạn chỉ cần xem kết luận.
          </h1>

          <p className="lp-hero__lead">
            Gõ một mã, nhận bản phân tích AI 6 lớp trong vài giây. Từ toàn cảnh thị trường đến từng cổ
            phiếu bạn đang giữ — bằng tiếng Việt, miễn phí để xem thử.
          </p>

          <div className="lp-hero__cta">
            <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onPrimary}>
              Phân tích miễn phí một mã ngay →
            </button>
            <a className="lp-btn lp-btn--ghost lp-btn--lg" href="#tinh-nang">
              Xem tất cả tính năng
            </a>
          </div>

          <div className="lp-hero__reassure">
            Miễn phí <span className="sep">·</span> Không cần thẻ <span className="sep">·</span> 30 giây
          </div>

          <div className="lp-metrics">
            {HERO_METRICS.map((m) => (
              <div className="lp-metrics__cell" key={m.label}>
                <div
                  className="lp-metrics__v"
                  data-countup={m.value}
                  data-prefix={m.prefix ?? ""}
                  data-suffix={m.suffix ?? ""}
                >
                  {m.prefix ?? ""}
                  {m.value.toLocaleString("en-US")}
                  {m.suffix ?? ""}
                </div>
                <div className="lp-metrics__k">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-hero__card lp-reveal">
          <div className="lp-term">
            <div className="lp-term__bar">
              <span className="lp-term__dot" />
              <span className="lp-term__dot" />
              <span className="lp-term__dot" />
              <span className="lp-term__title">IQX · AI INSIGHT</span>
            </div>
            <div className="lp-term__head">
              <div>
                <div className="lp-term__tick">{stock.ticker}</div>
                <div className="lp-term__sec">{stock.sector}</div>
              </div>
              <div className="lp-term__px">
                <div className="lp-term__price">{stock.price}</div>
                <div className="lp-term__chg" style={{ color: toneColor[stock.tone] }}>
                  ▲ {stock.change}
                </div>
              </div>
            </div>
            <svg className="lp-term__spark" viewBox="0 0 320 92" preserveAspectRatio="none" aria-hidden="true">
              <path d={spark.area} fill="var(--lp-up)" fillOpacity="0.08" />
              <path d={spark.line} fill="none" stroke="var(--lp-up)" strokeWidth="2" />
            </svg>
            <div className="lp-term__sig">
              <div>
                <div className="lp-term__sigk">Gợi ý hôm nay</div>
                <div className="lp-term__sigv">{stock.recommendation}</div>
              </div>
              <div className="lp-term__layers" title="6 lớp phân tích">
                {stock.layers.map((l) => (
                  <span
                    key={l.id}
                    className="lp-term__layer"
                    style={{ background: toneColor[l.tone], opacity: 0.85 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .lp-hero__card { perspective: 1000px; }
        @media (min-width: 1000px) {
          .lp-hero__card { transform: translateY(6px); }
        }
      `}</style>
    </header>
  )
}
