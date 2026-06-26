import { useRef, useState } from "react"
import { useAuth } from "@/features/auth"
import { DEMO_STOCKS, type DemoStock } from "./data"
import { toneColor, toneSoft } from "./util"

function VerdictChip({ tone, children }: { tone: DemoStock["tone"]; children: React.ReactNode }) {
  return (
    <span
      className="lp-vchip"
      style={{ color: toneColor[tone], background: toneSoft[tone], borderColor: toneColor[tone] }}
    >
      {children}
    </span>
  )
}

function LayerRow({ layer, locked }: { layer: DemoStock["layers"][number]; locked?: boolean }) {
  return (
    <div className={`lp-layer${locked ? " is-locked" : ""}`}>
      <div className="lp-layer__head">
        <span className="lp-layer__num lp-mono">{layer.id}</span>
        <span className="lp-layer__name">{layer.name}</span>
        <VerdictChip tone={layer.tone}>{layer.verdict}</VerdictChip>
      </div>
      <p className="lp-layer__note">{layer.note}</p>
    </div>
  )
}

export function DemoGate({ onRegister }: { onRegister: () => void }) {
  const { isAuthenticated } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState<DemoStock>(DEMO_STOCKS[0])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState("")
  const [unknown, setUnknown] = useState<string | null>(null)

  const run = (query: string) => {
    const q = query.trim().toUpperCase()
    if (!q) return
    const found = DEMO_STOCKS.find((s) => s.ticker === q)
    setPending(q)
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      if (found) {
        setUnknown(null)
        setActive(found)
      } else {
        setUnknown(q)
      }
    }, 600)
  }

  const free = active.layers.filter((l) => l.id === "L1")
  const gated = active.layers.filter((l) => ["L2", "L3", "L4", "L5"].includes(l.id))
  const l6 = active.layers.find((l) => l.id === "L6")!
  const locked = !isAuthenticated

  return (
    <section className="lp-section" id="demo">
      <div className="lp-wrap lp-wrap--narrow">
        <span className="lp-eyebrow">AI Phân tích cổ phiếu · Xem thử miễn phí</span>
        <h2 className="lp-h2" style={{ marginTop: 14, marginBottom: 12 }}>
          Gõ một mã. Đọc phân tích AI 6 lớp.
        </h2>
        <p className="lp-lead" style={{ marginBottom: 22 }}>
          Không cần đăng ký để xem thử. IQX phân tích kỹ thuật, thanh khoản, dòng tiền và tin tức của
          cổ phiếu bạn quan tâm — rồi viết thành một bản briefing dễ đọc.
        </p>

        <div className="lp-console lp-reveal">
          <div className="lp-console__input">
            <span className="lp-mono lp-console__prompt">›</span>
            <input
              ref={inputRef}
              defaultValue=""
              placeholder="Nhập mã, ví dụ VCB…"
              aria-label="Nhập mã cổ phiếu"
              onKeyDown={(e) => {
                if (e.key === "Enter") run(e.currentTarget.value)
              }}
            />
            <button className="lp-btn lp-btn--primary lp-btn--sm" onClick={() => run(inputRef.current?.value ?? "")}>
              Phân tích →
            </button>
          </div>
          <div className="lp-console__chips">
            <span className="lp-console__hint lp-mono">Thử nhanh:</span>
            {DEMO_STOCKS.map((s) => (
              <button
                key={s.ticker}
                className={`lp-console__chip lp-mono${active.ticker === s.ticker && !unknown ? " is-active" : ""}`}
                onClick={() => {
                  if (inputRef.current) inputRef.current.value = s.ticker
                  run(s.ticker)
                }}
              >
                {s.ticker}
              </button>
            ))}
          </div>
        </div>

        <div className="lp-result lp-card lp-reveal">
          {loading ? (
            <div className="lp-result__loading">
              <span className="lp-mono">IQX đang phân tích {pending || active.ticker}…</span>
              <div className="lp-shimmer" />
              <div className="lp-shimmer" style={{ width: "82%" }} />
              <div className="lp-shimmer" style={{ width: "64%" }} />
            </div>
          ) : unknown ? (
            <div className="lp-result__unknown">
              <div className="lp-result__unknown-em">🔒</div>
              <h3 className="lp-h3" style={{ marginBottom: 8 }}>
                Phân tích <span className="lp-mono lp-accent">{unknown}</span> cần tài khoản
              </h3>
              <p className="lp-lead" style={{ fontSize: 15, marginBottom: 18 }}>
                Bản xem thử hỗ trợ VCB, FPT, HPG. Đăng ký miễn phí để phân tích bất kỳ mã nào trong
                ~2.048 cổ phiếu trên sàn.
              </p>
              <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onRegister}>
                Đăng ký miễn phí để phân tích {unknown} →
              </button>
            </div>
          ) : (
            <>
              <div className="lp-result__head">
                <div>
                  <div className="lp-term__tick">{active.ticker}</div>
                  <div className="lp-term__sec">{active.sector}</div>
                </div>
                <div className="lp-term__px">
                  <div className="lp-term__price">{active.price}</div>
                  <div className="lp-term__chg" style={{ color: toneColor[active.tone] }}>
                    {active.change}
                  </div>
                </div>
              </div>

              <div className="lp-result__body">
                <div className="lp-result__meta">
                  <div>
                    <span className="lp-result__metak">Xu hướng</span>
                    <span className="lp-result__metav">{active.trend}</span>
                  </div>
                  <div>
                    <span className="lp-result__metak">Trạng thái</span>
                    <span className="lp-result__metav" style={{ color: toneColor[active.statusTone] }}>
                      {active.status}
                    </span>
                  </div>
                  <div>
                    <span className="lp-result__metak">Khung phân tích</span>
                    <span className="lp-result__metav">{active.horizon}</span>
                  </div>
                </div>

                <p className="lp-result__brief">{active.brief}</p>

                <div className="lp-conclusion" style={{ borderColor: toneColor[l6.tone] }}>
                  <span className="lp-conclusion__k lp-mono">Kết luận của AI</span>
                  <span className="lp-conclusion__v" style={{ color: toneColor[l6.tone] }}>
                    {active.recommendation}
                  </span>
                </div>

                <div className="lp-result__divider">
                  <span className="lp-mono">Chi tiết 6 lớp phân tích</span>
                  <span className="rule" />
                </div>

                {free.map((l) => (
                  <LayerRow key={l.id} layer={l} />
                ))}

                <div className={`lp-lockzone${locked ? " is-locked" : ""}`}>
                  <div className="lp-lockzone__body">
                    {gated.map((l) => (
                      <LayerRow key={l.id} layer={l} locked={locked} />
                    ))}
                    {!locked && <LayerRow layer={l6} />}
                  </div>

                  {locked && (
                    <div className="lp-gate">
                      <div className="lp-gate__card lp-card">
                        <div className="lp-gate__badge">🔒</div>
                        <h3 className="lp-gate__title">
                          Mở khóa <b>4 lớp phân tích còn lại</b>
                        </h3>
                        <p className="lp-gate__sub">
                          Xem đầy đủ thanh khoản, dòng tiền khối ngoại, giao dịch nội bộ và tin tức —
                          kèm biểu đồ từng lớp, cho mọi mã bạn theo dõi.
                        </p>
                        <div className="lp-gate__feats">
                          <span className="lp-chip">L1–L6 đầy đủ</span>
                          <span className="lp-chip">Mọi mã bạn giữ</span>
                          <span className="lp-chip">Tặng 7 ngày Premium</span>
                        </div>
                        <button className="lp-btn lp-btn--primary lp-btn--block lp-btn--lg" onClick={onRegister}>
                          Đăng ký miễn phí để mở khóa →
                        </button>
                        <div className="lp-gate__note lp-mono">Miễn phí · Không cần thẻ · 30 giây</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          <div className="lp-result__disc lp-mono">IQX · sinh tự động · không phải khuyến nghị đầu tư · số liệu minh hoạ</div>
        </div>
      </div>

      <style>{`
        .lp-console { margin-bottom: 16px; }
        .lp-console__input {
          display: flex; align-items: center; gap: 10px;
          background: var(--lp-panel); border: 1px solid var(--lp-border);
          border-radius: 14px; padding: 8px 8px 8px 16px; box-shadow: var(--lp-shadow-sm);
        }
        .lp-console__input:focus-within { border-color: var(--lp-azure); }
        .lp-console__prompt { color: var(--lp-azure); font-size: 18px; }
        .lp-console__input input {
          flex: 1; background: transparent; border: 0; outline: 0;
          font-family: var(--lp-mono); font-size: 16px; letter-spacing: 0.04em;
          color: var(--lp-t1); text-transform: uppercase; min-width: 0;
        }
        .lp-console__input input::placeholder { color: var(--lp-t4); text-transform: none; letter-spacing: 0; }
        .lp-console__chips { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .lp-console__hint { font-size: 12px; color: var(--lp-t3); }
        .lp-console__chip {
          font-size: 13px; font-weight: 700; color: var(--lp-t2);
          background: var(--lp-bg-2); border: 1px solid var(--lp-border-soft);
          border-radius: 8px; padding: 6px 11px; cursor: pointer; transition: all 0.14s ease;
        }
        .lp-console__chip:hover { color: var(--lp-azure); border-color: var(--lp-azure); }
        .lp-console__chip.is-active { color: #fff; background: var(--lp-azure); border-color: var(--lp-azure); }

        .lp-result { padding: 0; overflow: hidden; }
        .lp-result__loading { padding: 26px 22px; }
        .lp-result__loading > span { color: var(--lp-t3); font-size: 13px; display: block; margin-bottom: 16px; }
        .lp-shimmer {
          height: 13px; border-radius: 6px; margin-bottom: 11px;
          background: linear-gradient(90deg, var(--lp-bg-2) 25%, var(--lp-border-soft) 37%, var(--lp-bg-2) 63%);
          background-size: 400% 100%; animation: lp-sh 1.3s ease infinite;
        }
        @keyframes lp-sh { 0% { background-position: 100% 0 } 100% { background-position: 0 0 } }

        .lp-result__unknown { padding: 40px 24px; text-align: center; }
        .lp-result__unknown-em { font-size: 34px; margin-bottom: 12px; }

        .lp-result__head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border-bottom: 1px solid var(--lp-border-soft);
        }
        .lp-result__body { padding: 18px 20px 6px; }
        .lp-result__meta { display: flex; flex-wrap: wrap; gap: 26px; margin-bottom: 14px; }
        .lp-result__meta > div { display: flex; flex-direction: column; gap: 3px; }
        .lp-result__metak { font-size: 11px; color: var(--lp-t3); }
        .lp-result__metav { font-size: 15px; font-weight: 700; color: var(--lp-t1); }
        .lp-result__brief { font-size: 14.5px; line-height: 1.62; color: var(--lp-t1); margin-bottom: 16px; }

        .lp-conclusion {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          border: 1px solid; border-radius: 12px; padding: 13px 16px; margin-bottom: 18px;
          background: var(--lp-bg-2);
        }
        .lp-conclusion__k { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--lp-t3); }
        .lp-conclusion__v { font-size: 18px; font-weight: 800; }

        .lp-result__divider { display: flex; align-items: center; gap: 12px; margin: 6px 0 14px; }
        .lp-result__divider > span:first-child { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--lp-t3); }
        .lp-result__divider .rule { flex: 1; height: 1px; background: var(--lp-border); }

        .lp-vchip {
          display: inline-flex; align-items: center; font-family: var(--lp-mono);
          font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
          padding: 3px 9px; border-radius: 999px; border: 1px solid; opacity: 0.95;
        }
        .lp-layer { padding: 12px 14px; background: var(--lp-bg-2); border: 1px solid var(--lp-border-soft); border-radius: 12px; margin-bottom: 10px; }
        .lp-layer__head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
        .lp-layer__num { font-size: 12px; font-weight: 700; color: var(--lp-azure); }
        .lp-layer__name { font-size: 14.5px; font-weight: 700; color: var(--lp-t1); margin-right: auto; }
        .lp-layer__note { font-size: 13px; line-height: 1.5; color: var(--lp-t2); }

        .lp-lockzone { position: relative; }
        .lp-lockzone.is-locked { padding-bottom: 250px; }
        .lp-lockzone.is-locked .lp-lockzone__body {
          max-height: 168px; overflow: hidden;
          -webkit-mask-image: linear-gradient(180deg, #000 38%, transparent 100%);
          mask-image: linear-gradient(180deg, #000 38%, transparent 100%);
        }
        .lp-gate { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; padding: 0 4px; }
        .lp-gate__card { width: 100%; max-width: 460px; text-align: center; padding: 24px 22px; }
        .lp-gate__badge {
          width: 46px; height: 46px; border-radius: 13px; margin: 0 auto 14px; display: grid; place-items: center;
          font-size: 22px; background: var(--lp-azure-soft); border: 1px solid var(--lp-azure-line);
        }
        .lp-gate__title { font-size: 19px; font-weight: 800; line-height: 1.3; margin-bottom: 8px; color: var(--lp-t1); }
        .lp-gate__title b { color: var(--lp-azure); }
        .lp-gate__sub { color: var(--lp-t2); font-size: 14px; line-height: 1.55; margin-bottom: 16px; }
        .lp-gate__feats { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 18px; }
        .lp-gate__note { color: var(--lp-t3); font-size: 12px; margin-top: 11px; }

        .lp-result__disc { font-size: 10.5px; color: var(--lp-t4); padding: 14px 20px 16px; }
      `}</style>
    </section>
  )
}
