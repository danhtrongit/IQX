import { useEffect, useMemo, useState, type FormEvent } from "react"

import { world } from "../../bridge.ts"
import { directory, quotes, searchDirectory } from "../../net/market.ts"
import {
  formatIndex,
  formatPercent,
  formatPrice,
} from "../../net/market/format.ts"
import {
  heatColour,
  heatPct,
  heatPrice,
  marketWeather,
} from "../../net/market/heat.ts"
import { PRICE_COLORS, indexTone, priceTone } from "../../net/market/tone.ts"
import type { DirectoryEntry, Quote } from "../../net/market/types.ts"
import { TICKER_RE } from "../../ritual.ts"
import { useStore } from "../../use-store.ts"
import { cx } from "../utils.ts"

const WATCH_KEY = "iqx-trading-floor:watchlist"
const WATCH_MAX = 30
const WATCH_REFRESH_MS = 15_000

function loadWatch(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(WATCH_KEY) ?? "[]") as unknown
    return Array.isArray(list)
      ? list
          .filter(
            (s): s is string => typeof s === "string" && TICKER_RE.test(s)
          )
          .slice(0, WATCH_MAX)
      : []
  } catch {
    return []
  }
}

function saveWatch(list: string[]): void {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(list))
  } catch {
    // Storage blocked: the list lasts for this visit only.
  }
}

type Tab = "vn30" | "watch" | "edit"

const stockHref = (symbol: string): string => `/co-phieu/${symbol}`

/** Bảng điện: VN30 heatmap, the visitor's watchlist and the most-prayed tickers. */
export function MarketPanel() {
  const indices = useStore(world.indices)
  const vn30 = useStore(world.vn30)
  const ritual = useStore(world.ritual)
  const [tab, setTab] = useState<Tab>("vn30")
  const [watch, setWatch] = useState<string[]>(loadWatch)
  const [watchRows, setWatchRows] = useState<Record<string, Quote>>({})
  const [topRows, setTopRows] = useState<Record<string, Quote>>({})
  const top = useMemo(() => ritual?.topTickers ?? [], [ritual])
  const topKey = top.map((t) => t.symbol).join(",")
  const watchKey = watch.join(",")
  const vnindex = indices?.find((q) => q.code === "VNINDEX")
  const weather = marketWeather(vnindex)

  const updateWatch = (list: string[]): void => {
    setWatch(list)
    saveWatch(list)
  }

  useEffect(() => {
    if (!watchKey) return
    const symbols = watchKey.split(",")
    let live = true
    const load = (): void =>
      void quotes(symbols)
        .then((r) => live && setWatchRows(r))
        .catch(() => undefined)
    load()
    const timer = setInterval(load, WATCH_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [watchKey])

  useEffect(() => {
    let live = true
    quotes(topKey ? topKey.split(",") : [])
      .then((r) => live && setTopRows(r))
      .catch(() => live && setTopRows({}))
    return () => {
      live = false
    }
  }, [topKey])

  const tiles =
    tab === "vn30"
      ? vn30
      : watch.map((s) => watchRows[s]).filter((q): q is Quote => !!q)

  return (
    <div className="market">
      <div className="heat">
        <div className="heat-bar">
          <div className="heat-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "vn30"}
              className={tab === "vn30" ? "on" : ""}
              onClick={() => setTab("vn30")}
            >
              VN30
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "watch"}
              className={tab === "watch" ? "on" : ""}
              onClick={() => setTab("watch")}
            >
              Theo dõi của tôi ({watch.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "edit"}
              className={tab === "edit" ? "on" : ""}
              onClick={() => setTab("edit")}
            >
              + Sửa danh mục theo dõi
            </button>
          </div>
          <div className="heat-index">
            <span className="muted">VN-Index</span>{" "}
            <b
              style={{
                color: vnindex ? PRICE_COLORS[indexTone(vnindex)] : undefined,
              }}
            >
              {vnindex
                ? `${formatIndex(vnindex.value)} ${formatPercent(vnindex.pct)}`
                : "—"}
            </b>
            {" · "}
            <span>
              {weather.icon} {weather.label}
            </span>
          </div>
        </div>

        {tab === "edit" ? (
          <WatchEditor watch={watch} onChange={updateWatch} />
        ) : !tiles ? (
          <p className="muted center">Đang tải bảng điện…</p>
        ) : tab === "watch" && !watch.length ? (
          <p className="muted center">
            Chưa theo dõi mã nào.{" "}
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setTab("edit")}
            >
              + Thêm mã
            </button>
          </p>
        ) : (
          <div className="heat-grid">
            {tiles.map((q) => (
              <HeatTile
                key={q.symbol}
                q={q}
                watched={tab === "vn30" && watch.includes(q.symbol)}
              />
            ))}
          </div>
        )}
      </div>

      <h3>Mã được khấn nhiều nhất hôm nay</h3>
      {top.length === 0 && (
        <p className="muted">Chưa có ai khấn trong phiên này.</p>
      )}
      {top.length > 0 && (
        <table className="quote-table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Giá</th>
              <th>+/-</th>
              <th>Lượt khấn</th>
            </tr>
          </thead>
          <tbody>
            {top.map((t) => {
              const q = topRows[t.symbol]
              const colour = q ? PRICE_COLORS[priceTone(q)] : undefined
              return (
                <tr key={t.symbol}>
                  <td>
                    <a
                      href={stockHref(t.symbol)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.symbol}
                    </a>
                  </td>
                  <td style={{ color: colour }}>
                    {q ? formatPrice(q.price) : "—"}
                  </td>
                  <td style={{ color: colour }}>
                    {q ? formatPercent(q.pct) : "—"}
                  </td>
                  <td>{t.count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="fineprint">
        Nguồn: dữ liệu thị trường IQX · giá nghìn đồng. Viền sáng: mã bạn đang
        theo dõi.
      </p>
    </div>
  )
}

function HeatTile({ q, watched }: { q: Quote; watched: boolean }) {
  const { bg, fg } = heatColour(q)
  return (
    <a
      className={cx("heat-tile", watched && "watched")}
      style={{ background: bg, color: fg }}
      href={stockHref(q.symbol)}
      target="_blank"
      rel="noreferrer"
    >
      <b>{q.symbol}</b>
      <span>{heatPrice(q.price)}</span>
      <span>{heatPct(q.pct)}</span>
    </a>
  )
}

function WatchEditor({
  watch,
  onChange,
}: {
  watch: string[]
  onChange: (list: string[]) => void
}) {
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null)
  const [query, setQuery] = useState("")
  useEffect(() => {
    let live = true
    directory()
      .then((e) => live && setEntries(e))
      .catch(() => live && setEntries([]))
    return () => {
      live = false
    }
  }, [])
  const hits = useMemo(
    () =>
      entries
        ? searchDirectory(entries, query).filter(
            (e) => !watch.includes(e.symbol)
          )
        : [],
    [entries, query, watch]
  )
  const add = (symbol: string): void => {
    const s = symbol.trim().toUpperCase()
    if (!TICKER_RE.test(s) || watch.includes(s) || watch.length >= WATCH_MAX)
      return
    onChange([...watch, s])
    setQuery("")
  }
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    add(hits[0]?.symbol ?? query)
  }

  return (
    <div className="watch-edit">
      <div className="chips">
        {watch.map((s) => (
          <button
            key={s}
            type="button"
            className="ticker-chip"
            onClick={() => onChange(watch.filter((x) => x !== s))}
            aria-label={`Bỏ ${s}`}
          >
            {s} ✕
          </button>
        ))}
        {!watch.length && <span className="muted small">Danh mục trống.</span>}
      </div>
      <form className="watch-search" onSubmit={submit}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            watch.length >= WATCH_MAX
              ? `Tối đa ${WATCH_MAX} mã`
              : "Tìm mã hoặc tên công ty…"
          }
          disabled={watch.length >= WATCH_MAX}
          aria-label="Tìm mã"
        />
      </form>
      {hits.length > 0 && (
        <ul className="watch-hits">
          {hits.map((e) => (
            <li key={e.symbol}>
              <button type="button" onClick={() => add(e.symbol)}>
                <b>{e.symbol}</b>{" "}
                <span className="muted small">
                  {e.exchange} · {e.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
