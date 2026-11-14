import { useEffect, useMemo, useState, type FormEvent } from "react"

import { commands, openPanel, toast, ui, world } from "../../bridge.ts"
import { floorApi } from "../../net/api.ts"
import { refreshRitual } from "../../net/data.ts"
import { directory, quotes, searchDirectory } from "../../net/market.ts"
import {
  formatIndex,
  formatIndexChange,
  formatPercent,
} from "../../net/market/format.ts"
import { PRICE_COLORS, indexTone, priceTone } from "../../net/market/tone.ts"
import type { DirectoryEntry, Quote } from "../../net/market/types.ts"
import type { MyRitual, RitualToday } from "../../net/types.ts"
import {
  RITUAL_RULES,
  TICKER_RE,
  normaliseTickers,
  queById,
  type Direction,
  type Que,
} from "../../ritual.ts"
import { useStore } from "../../use-store.ts"
import { vnDate, cx } from "../utils.ts"

const SHAKE_MS = 1500

/** Gieo quẻ → dự đoán VNINDEX → khấn 3 mã → thống kê phiên. */
export function ThanTaiPanel() {
  const [today, setToday] = useState<RitualToday | null>(null)
  const [error, setError] = useState("")
  const [openedAt] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    void refreshRitual().then((t) => {
      if (!live) return
      if (t) setToday(t)
      else setError("Không tải được nghi lễ. Kiểm tra kết nối rồi mở lại.")
    })
    return () => {
      live = false
    }
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!today) return <p className="muted center">Đang thắp hương…</p>

  const mine = today.mine
  const cutoff = new Date(today.cutoffAt)
  const closed = openedAt >= today.cutoffAt
  const header = (
    <p className="session-line">
      Phiên <b>{vnDate(today.session)}</b> · nhận dự đoán đến{" "}
      <b>
        {cutoff.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Ho_Chi_Minh",
        })}
      </b>
    </p>
  )

  if (!mine) {
    return (
      <>
        {header}
        <DrawStep
          disabled={closed}
          onDrawn={(ritual) => setToday({ ...today, mine: ritual })}
        />
      </>
    )
  }
  const que = queById(mine.queId)
  if (!que)
    return (
      <p className="error">Không đọc được quẻ của bạn. Mở lại sau ít phút.</p>
    )
  if (!mine.direction) {
    return (
      <>
        {header}
        <QueCard que={que} />
        <PredictForm
          onDone={(res) => {
            setToday({ ...today, mine: res.mine, stats: res.stats })
            world.ritual.set(res.stats)
            commands.emit("celebrate", {
              luck: que.luck,
              name: ui.profile.get()?.name ?? "",
              self: true,
            })
            toast("🧧 Đã khấn xong. Chúc phiên giao dịch hanh thông!", "gold")
          }}
        />
      </>
    )
  }
  return (
    <>
      {header}
      <Result today={today} mine={mine} que={que} />
    </>
  )
}

function DrawStep({
  disabled,
  onDrawn,
}: {
  disabled: boolean
  onDrawn: (r: MyRitual) => void
}) {
  const [shaking, setShaking] = useState(false)
  const [error, setError] = useState("")

  const draw = async (): Promise<void> => {
    setShaking(true)
    setError("")
    const started = Date.now()
    try {
      const res = await floorApi.draw()
      await new Promise((r) =>
        setTimeout(r, Math.max(0, SHAKE_MS - (Date.now() - started)))
      )
      onDrawn(res.ritual)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setShaking(false)
    }
  }

  return (
    <div className="draw">
      <div className={cx("cup", shaking && "shaking")} aria-hidden="true">
        <div className="sticks">
          {Array.from({ length: 9 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${i * 7}px`,
                height: `${58 + ((i * 13) % 22)}px`,
                transform: `rotate(${(i - 4) * 3}deg)`,
              }}
            />
          ))}
        </div>
        <div className="cup-body">QUẺ</div>
      </div>
      <h3>Bước 1 · Gieo quẻ đầu phiên</h3>
      <p className="muted">
        Thành tâm lắc ống xăm để xin một quẻ cho phiên giao dịch. Mỗi người một
        quẻ mỗi phiên.
      </p>
      {error && <p className="error">{error}</p>}
      <button
        type="button"
        className="btn gold big"
        disabled={shaking || disabled}
        onClick={() => void draw()}
      >
        {shaking ? "Đang lắc…" : "Lắc ống xăm"}
      </button>
    </div>
  )
}

function stars(luck: number): string {
  return "★".repeat(luck) + "☆".repeat(5 - luck)
}

function QueCard({ que, compact }: { que: Que; compact?: boolean }) {
  return (
    <article className={cx("que", `luck-${que.luck}`, compact && "compact")}>
      <div className="que-head">
        <span className="que-no">Quẻ số {que.id}</span>
        <span className="que-stars" aria-label={`${que.luck} trên 5`}>
          {stars(que.luck)}
        </span>
      </div>
      <h3 className="que-name">{que.name}</h3>
      <p className="que-verse">“{que.verse}”</p>
      {!compact && <p className="que-advice">Lời nhắn: {que.advice}</p>}
    </article>
  )
}

function PredictForm({
  onDone,
}: {
  onDone: (res: { mine: MyRitual; stats: RitualToday["stats"] }) => void
}) {
  const indices = useStore(world.indices)
  const vn = indices?.find((q) => q.code === "VNINDEX")
  const [direction, setDirection] = useState<Direction | null>(null)
  // Until the person types a level, the field shows the current VNINDEX.
  const [typedLevel, setTypedLevel] = useState<string | null>(null)
  const [tickers, setTickers] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const level = typedLevel ?? (vn ? vn.value.toFixed(2) : "")

  useEffect(() => {
    let live = true
    directory()
      .then((e) => live && setEntries(e))
      .catch(() => live && setEntries([]))
    return () => {
      live = false
    }
  }, [])

  const suggestions = useMemo(
    () =>
      entries
        ? searchDirectory(entries, query).filter(
            (e) => !tickers.includes(e.symbol)
          )
        : [],
    [entries, query, tickers]
  )
  const levelNum = Number(level.replace(",", "."))
  const deviation =
    vn && levelNum ? Math.abs(levelNum - vn.value) / vn.value : 0
  const levelOk =
    Number.isFinite(levelNum) &&
    levelNum > 0 &&
    deviation <= RITUAL_RULES.maxLevelDeviation
  const need = RITUAL_RULES.tickersToPray
  const ready =
    direction !== null && levelOk && normaliseTickers(tickers) !== null && !busy

  const add = (symbol: string): void => {
    const s = symbol.trim().toUpperCase()
    if (!TICKER_RE.test(s) || tickers.includes(s) || tickers.length >= need)
      return
    if (entries && entries.length && !entries.some((e) => e.symbol === s)) {
      setError(`Không thấy mã ${s} trên HOSE, HNX hay UPCOM.`)
      return
    }
    setError("")
    setTickers([...tickers, s])
    setQuery("")
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const list = normaliseTickers(tickers)
    if (!ready || !direction || !list) return
    setBusy(true)
    setError("")
    try {
      onDone(
        await floorApi.submit({ direction, level: levelNum, tickers: list })
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="predict" onSubmit={(e) => void submit(e)}>
      <h3>Bước 2 · Dự đoán VNINDEX lúc đóng cửa</h3>
      {vn ? (
        <p className="now" style={{ color: PRICE_COLORS[indexTone(vn)] }}>
          Hiện tại {formatIndex(vn.value)}{" "}
          <small>
            {formatIndexChange(vn.change)} ({formatPercent(vn.pct)})
          </small>
        </p>
      ) : (
        <p className="muted">Đang tải VNINDEX…</p>
      )}
      <div className="dir-toggle" role="radiogroup" aria-label="Hướng VNINDEX">
        <button
          type="button"
          role="radio"
          aria-checked={direction === "up"}
          className={cx("dir up", direction === "up" && "on")}
          onClick={() => setDirection("up")}
        >
          ▲ Tăng
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={direction === "down"}
          className={cx("dir down", direction === "down" && "on")}
          onClick={() => setDirection("down")}
        >
          ▼ Giảm
        </button>
      </div>
      <label className="field">
        <span>Điểm đóng cửa dự đoán</span>
        <input
          inputMode="decimal"
          value={level}
          onChange={(e) => setTypedLevel(e.target.value)}
          aria-invalid={!levelOk}
        />
        {!levelOk && level && (
          <small className="error">
            Nhập mức trong ±{RITUAL_RULES.maxLevelDeviation * 100}% so với hiện
            tại.
          </small>
        )}
      </label>

      <h3>Bước 3 · Khấn {need} mã cổ phiếu</h3>
      <div className="chips">
        {tickers.map((t) => (
          <button
            key={t}
            type="button"
            className="ticker-chip"
            onClick={() => setTickers(tickers.filter((x) => x !== t))}
            aria-label={`Bỏ ${t}`}
          >
            {t} <span aria-hidden="true">✕</span>
          </button>
        ))}
        {Array.from({ length: need - tickers.length }, (_, i) => (
          <span key={i} className="ticker-slot">
            Mã {tickers.length + i + 1}
          </span>
        ))}
      </div>
      {tickers.length < need && (
        <div className="picker">
          <input
            value={query}
            placeholder="Gõ mã hoặc tên: FPT, Hòa Phát…"
            aria-label="Tìm mã cổ phiếu"
            autoCapitalize="characters"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add(suggestions[0]?.symbol ?? query)
              }
            }}
          />
          {suggestions.length > 0 && (
            <ul className="suggest" role="listbox">
              {suggestions.map((s) => (
                <li key={s.symbol}>
                  <button type="button" onClick={() => add(s.symbol)}>
                    <b>{s.symbol}</b> <span>{s.name}</span>{" "}
                    <small>{s.exchange}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" className="btn gold big" disabled={!ready}>
        {busy ? "Đang dâng lễ…" : "Thành tâm khấn"}
      </button>
      <p className="fineprint">
        Quẻ và dự đoán mang tính giải trí, không phải khuyến nghị đầu tư.
      </p>
    </form>
  )
}

function Result({
  today,
  mine,
  que,
}: {
  today: RitualToday
  mine: MyRitual
  que: Que
}) {
  const live = useStore(world.ritual)
  const stats = live?.session === today.session ? live : today.stats
  const [prices, setPrices] = useState<Record<string, Quote>>({})
  const symbolsKey = [
    ...new Set([...stats.topTickers.map((t) => t.symbol), ...mine.tickers]),
  ].join(",")

  useEffect(() => {
    let alive = true
    quotes(symbolsKey ? symbolsKey.split(",") : [])
      .then((r) => alive && setPrices(r))
      .catch(() => alive && setPrices({}))
    return () => {
      alive = false
    }
  }, [symbolsKey])

  const upPct = stats.total ? Math.round((stats.up / stats.total) * 100) : 0
  const max = stats.topTickers[0]?.count ?? 1
  const last = today.lastResult

  return (
    <div className="result">
      <div className="done-banner">
        <span>🧧</span>
        <div>
          <b>Bạn đã khấn xong phiên {vnDate(mine.session)}</b>
          <p>
            Dự đoán VNINDEX{" "}
            <b className={mine.direction === "up" ? "up" : "down"}>
              {mine.direction === "up" ? "▲ tăng" : "▼ giảm"}
            </b>
            , đóng cửa <b>{formatIndex(mine.level)}</b>
            {mine.correct !== null && (
              <>
                {" "}
                ·{" "}
                {mine.correct ? (
                  <b className="up">Đoán đúng ✓</b>
                ) : (
                  <b className="down">Chưa đúng</b>
                )}
              </>
            )}
          </p>
          <div className="chips">
            {mine.tickers.map((t) => (
              <Ticker key={t} symbol={t} quote={prices[t]} />
            ))}
          </div>
        </div>
      </div>
      <QueCard que={que} compact />

      <h3>Cả khu giao dịch phiên {vnDate(stats.session)}</h3>
      <div className="stat-row">
        <div className="stat">
          <b>{stats.total}</b>
          <span>lượt dự đoán</span>
        </div>
        <div className="stat">
          <b>{stats.avgLevel ? formatIndex(stats.avgLevel) : "—"}</b>
          <span>điểm đóng cửa trung bình</span>
        </div>
      </div>
      <div
        className="split"
        aria-label={`${stats.up} tăng, ${stats.down} giảm`}
      >
        <div className="split-up" style={{ width: `${upPct}%` }}>
          {stats.up ? `▲ ${stats.up}` : ""}
        </div>
        <div className="split-down" style={{ width: `${100 - upPct}%` }}>
          {stats.down ? `▼ ${stats.down}` : ""}
        </div>
      </div>

      <h3>Top {RITUAL_RULES.topTickers} mã được khấn nhiều nhất</h3>
      <ol className="top-tickers">
        {stats.topTickers.map((t) => (
          <li key={t.symbol}>
            <Ticker symbol={t.symbol} quote={prices[t.symbol]} />
            <div className="bar">
              <i style={{ width: `${(t.count / max) * 100}%` }} />
            </div>
            <span className="count">{t.count}</span>
          </li>
        ))}
      </ol>

      {last && (
        <p className="last-result">
          Phiên {vnDate(last.session)} đóng cửa <b>{formatIndex(last.close)}</b>{" "}
          ({formatIndexChange(last.change)}):{" "}
          <b>
            {last.correct}/{last.total}
          </b>{" "}
          người đoán đúng hướng.
        </p>
      )}
      <button
        type="button"
        className="btn ghost"
        onClick={() => openPanel("leaderboard")}
      >
        🏆 Xem bảng vinh danh
      </button>
    </div>
  )
}

function Ticker({ symbol, quote }: { symbol: string; quote?: Quote }) {
  const tone = quote ? priceTone(quote) : "ref"
  return (
    <a
      className="ticker-chip link"
      href={`/co-phieu/${symbol}`}
      target="_blank"
      rel="noreferrer"
    >
      {symbol}
      {quote && (
        <small style={{ color: PRICE_COLORS[tone] }}>
          {formatPercent(quote.pct)}
        </small>
      )}
    </a>
  )
}
