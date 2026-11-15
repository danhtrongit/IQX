import { X } from "lucide-react"
/** Step 3: offer up to 3 listed stocks in the gold-ingot slots, or skip. */
import { useEffect, useMemo, useState, type KeyboardEvent } from "react"

import { floorApi } from "../../net/api.ts"
import { directory, searchDirectory } from "../../net/market.ts"
import type { DirectoryEntry } from "../../net/market/types.ts"
import { THAN_TAI, exchangeLabel, tickerSuggestions } from "../../than-tai.ts"
import { cx } from "../utils.ts"
import { IngotSlotArt } from "./ShrineArt.tsx"
import type { Act } from "./types.ts"

interface Props {
  act: Act
  onDone: () => void
}

export function StepCau({ act, onDone }: Props) {
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null)
  const [dirFailed, setDirFailed] = useState(false)
  const [query, setQuery] = useState("")
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const full = chosen.length >= THAN_TAI.maxTickers

  useEffect(() => {
    let live = true
    directory()
      .then((d) => live && setEntries(d))
      .catch(() => live && setDirFailed(true))
    return () => {
      live = false
    }
  }, [])

  const suggestions = useMemo(
    () =>
      entries && query.trim()
        ? tickerSuggestions(searchDirectory(entries, query, 40), chosen)
        : [],
    [entries, query, chosen]
  )
  const exchangeOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries ?? []) map.set(e.symbol, e.exchange)
    return map
  }, [entries])

  const add = (symbol: string): void => {
    if (full || chosen.includes(symbol)) return
    setChosen([...chosen, symbol])
    setQuery("")
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && suggestions[0]) {
      e.preventDefault()
      add(suggestions[0].symbol)
    }
  }

  const offer = async (tickers: string[]): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError("")
    const res = await act(() => floorApi.thanTai.cau(tickers))
    setBusy(false)
    if ("ok" in res) onDone()
    else if (res.fail.kind !== "het_gio") setError(res.fail.text)
  }

  return (
    <>
      <h3 className="tt-h3">Cầu mã tăng</h3>
      <p className="tt-lead">
        Dâng tối đa 3 mã bất kỳ để cầu Thần Tài phù hộ. Có thể bỏ qua bước này.
      </p>
      <div className="tt-srch">
        <input
          type="search"
          autoComplete="off"
          aria-label="Tìm mã hoặc tên công ty"
          placeholder={full ? "Đã đủ 3 mã" : "Gõ mã hoặc tên công ty…"}
          disabled={full || busy}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        {query.trim() && !full && (
          <div className="tt-sug" role="listbox">
            {!entries && !dirFailed && (
              <div className="tt-sug-empty">Đang tải danh sách mã…</div>
            )}
            {dirFailed && (
              <div className="tt-sug-empty">Chưa tải được danh sách mã.</div>
            )}
            {entries && suggestions.length === 0 && (
              <div className="tt-sug-empty">Không tìm thấy mã</div>
            )}
            {suggestions.map((s) => (
              <button
                key={s.symbol}
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => add(s.symbol)}
              >
                <b>{s.symbol}</b>
                <span>{s.name}</span>
                <em>{exchangeLabel(s.exchange)}</em>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tt-slots">
        {Array.from({ length: THAN_TAI.maxTickers }, (_, i) => {
          const symbol = chosen[i]
          const exchange = symbol ? exchangeOf.get(symbol) : undefined
          return (
            <div
              key={symbol ?? `empty-${i}`}
              className={cx("tt-slot", symbol && "tt-slot-fill")}
            >
              <IngotSlotArt full={!!symbol} />
              {symbol ? (
                <>
                  {exchange && (
                    <span className="tt-slot-sx">
                      {exchangeLabel(exchange)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="tt-slot-rm"
                    aria-label={`Bỏ ${symbol}`}
                    disabled={busy}
                    onClick={() =>
                      setChosen(chosen.filter((c) => c !== symbol))
                    }
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                  <span className="tt-slot-t">{symbol}</span>
                </>
              ) : (
                <span className="tt-slot-e">Nén {i + 1}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="tt-note">Mã đã dâng thì không đổi được.</div>
      {error && (
        <p className="tt-error" role="alert">
          {error}
        </p>
      )}
      <div className="tt-act">
        <button
          type="button"
          className="tt-btn-ghost"
          disabled={busy}
          onClick={() => void offer([])}
        >
          Bỏ qua
        </button>
        <button
          type="button"
          className="tt-btn-main"
          disabled={!chosen.length || busy}
          onClick={() => void offer(chosen)}
        >
          {busy
            ? "Đang dâng lễ…"
            : `Dâng lễ cầu ${chosen.length || ""} mã`.replace("  ", " ")}
        </button>
      </div>
    </>
  )
}
