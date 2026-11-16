/** Step 4: what the whole floor thinks today — VNINDEX split and the 5 most prayed tickers. */
import { Trophy } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { openPanel } from "../../bridge.ts"
import { floorApi } from "../../net/api.ts"
import type { ThanTaiResults, ThanTaiToday } from "../../net/types.ts"
import {
  DIRECTION_META,
  describeFailure,
  formatCount,
  splitSegments,
  topWidths,
  vnClock,
} from "../../than-tai.ts"
import { cx } from "../utils.ts"
import { MiniQue } from "./QueCard.tsx"

interface Props {
  today: ThanTaiToday
  onOpenCard: () => void
  onClose: () => void
}

export function StepResults({ today, onOpenCard, onClose }: Props) {
  const [data, setData] = useState<ThanTaiResults | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError("")
    try {
      setData(await floorApi.thanTai.results())
    } catch (e) {
      setError(describeFailure(e).text)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let live = true
    floorApi.thanTai
      .results()
      .then((r) => live && setData(r))
      .catch((e: unknown) => live && setError(describeFailure(e).text))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  const done = today.status === "da_xong"

  return (
    <div className="tt-res">
      <h3 className="tt-h3 tt-center">Lộc hôm nay của cả sàn</h3>
      {data && (
        <p className="tt-lead tt-center">
          Số liệu tính tới {vnClock(data.asOf)}
        </p>
      )}
      {today.la && <MiniQue la={today.la} onOpen={onOpenCard} />}
      {loading && !data && (
        <p className="tt-lead tt-center">Đang xem lộc cả sàn…</p>
      )}
      {error && (
        <div className="tt-rbox">
          <p className="tt-error" role="alert">
            {error}
          </p>
          <div className="tt-act">
            <button
              type="button"
              className="tt-btn-ghost"
              disabled={loading}
              onClick={() => void load()}
            >
              Thử lại
            </button>
          </div>
        </div>
      )}
      {data && <Prediction data={data} mine={today.prediction} />}
      {data && <TopTickers data={data} mine={today.tickers} done={done} />}
      <div className="tt-act">
        <button
          type="button"
          className="tt-btn-ghost"
          onClick={() => openPanel("leaderboard")}
        >
          <Trophy size={16} aria-hidden="true" /> Xem bảng vinh danh
        </button>
        <button type="button" className="tt-btn-main" onClick={onClose}>
          {done ? "Hoàn tất" : "Đóng"}
        </button>
      </div>
    </div>
  )
}

function Prediction({
  data,
  mine,
}: {
  data: ThanTaiResults
  mine: ThanTaiToday["prediction"]
}) {
  const segments = splitSegments(data)
  return (
    <section className="tt-rbox">
      <h4>Dự đoán VNINDEX</h4>
      <div className="tt-s">Cả sàn đang nghĩ gì</div>
      <div>
        <span className="tt-big">{formatCount(data.total)}</span>{" "}
        <span className="tt-dim">người đã dự đoán</span>
      </div>
      <div
        className="tt-bar3"
        role="img"
        aria-label={segments
          .map((s) => `${DIRECTION_META[s.key].label} ${s.pct}%`)
          .join(", ")}
      >
        {segments.map((s) =>
          s.pct > 0 ? (
            <div
              key={s.key}
              className={cx("tt-seg", s.key === "flat" && "tt-seg-dark")}
              style={{
                width: `${s.pct}%`,
                background: DIRECTION_META[s.key].color,
              }}
            >
              {s.label}
            </div>
          ) : null
        )}
      </div>
      <div className="tt-leg">
        {segments.map((s) => (
          <span key={s.key} className={cx(mine === s.key && "tt-me")}>
            <i style={{ background: DIRECTION_META[s.key].color }} />
            {DIRECTION_META[s.key].label} {formatCount(s.count)}
            {mine === s.key && " · bạn"}
          </span>
        ))}
      </div>
    </section>
  )
}

function TopTickers({
  data,
  mine,
  done,
}: {
  data: ThanTaiResults
  mine: string[] | null
  done: boolean
}) {
  const widths = topWidths(data.top5)
  return (
    <section className="tt-rbox">
      <h4>Top 5 mã được cầu nhiều nhất</h4>
      <div className="tt-s">Theo số người dâng lễ cầu</div>
      {data.top5.length === 0 && (
        <div className="tt-s">Chưa có ai cầu mã hôm nay.</div>
      )}
      {data.top5.map((row, i) => (
        <div
          key={row.ticker}
          className={cx("tt-trow", mine?.includes(row.ticker) && "tt-my")}
        >
          <span className={cx("tt-medal", i < 3 && `tt-m${i + 1}`)}>
            {i + 1}
          </span>
          <span className="tt-cd">{row.ticker}</span>
          <div className="tt-bb">
            <i style={{ width: `${widths[i]}%` }} />
          </div>
          <span className="tt-c">{formatCount(row.count)} người</span>
        </div>
      ))}
      {done && mine && (
        <div className="tt-s tt-mine-line">
          Bạn đã cầu:{" "}
          {mine.length
            ? mine.map((t, i) => (
                <span key={t}>
                  {i > 0 && " · "}
                  <b>{t}</b>
                </span>
              ))
            : "không cầu mã"}
        </div>
      )}
    </section>
  )
}
