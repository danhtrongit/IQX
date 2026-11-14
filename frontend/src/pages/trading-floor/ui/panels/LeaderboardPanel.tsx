import { useEffect, useState } from "react"

import { avatarImage, ui, world } from "../../bridge.ts"
import { floorApi } from "../../net/api.ts"
import { formatIndex } from "../../net/market/format.ts"
import type { Leaderboard } from "../../net/types.ts"
import { RITUAL_RULES, vnDay } from "../../ritual.ts"
import { useStore } from "../../use-store.ts"

function monthKey(offset: number): string {
  const [y, m] = vnDay(Date.now()).split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

const MEDALS = ["🥇", "🥈", "🥉"]

type Loaded =
  { month: string; board: Leaderboard } | { month: string; error: string }

export function LeaderboardPanel() {
  const images = useStore(ui.avatarImages)
  const [offset, setOffset] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const month = monthKey(offset)

  useEffect(() => {
    let live = true
    floorApi
      .leaderboard(month)
      .then((board) => {
        if (!live) return
        setLoaded({ month, board })
        if (offset === 0) world.leaders.set(board.rows)
      })
      .catch((e: Error) => live && setLoaded({ month, error: e.message }))
    return () => {
      live = false
    }
  }, [month, offset])

  // Until the answer for the month on screen arrives, the previous month is not shown as if it were this one.
  const current = loaded?.month === month ? loaded : null
  const board = current && "board" in current ? current.board : null
  const error = current && "error" in current ? current.error : ""

  return (
    <div className="leaders">
      <div className="seg" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={offset === 0}
          className={offset === 0 ? "on" : ""}
          onClick={() => setOffset(0)}
        >
          Tháng này
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={offset === -1}
          className={offset === -1 ? "on" : ""}
          onClick={() => setOffset(-1)}
        >
          Tháng trước
        </button>
      </div>
      <p className="muted small">
        Tháng {month.slice(5)}/{month.slice(0, 4)} · {RITUAL_RULES.statues}{" "}
        người đứng đầu được dựng tượng vàng trong khu giao dịch.
      </p>
      {error && <p className="error">{error}</p>}
      {!current && <p className="muted center">Đang tải…</p>}
      {board && board.rows.length === 0 && (
        <p className="empty">
          Chưa ai đoán đúng trong tháng này. Ghé Thần Tài để là người đầu tiên
          lên tượng!
        </p>
      )}
      {board && board.rows.length > 0 && (
        <ol className="rank-list">
          {board.rows.map((r) => (
            <li key={r.id} className={r.rank <= 3 ? "podium" : ""}>
              <span className="rank">{MEDALS[r.rank - 1] ?? r.rank}</span>
              {avatarImage(images, r.avatar) && (
                <img src={avatarImage(images, r.avatar)} alt="" />
              )}
              <span className="who">{r.name}</span>
              <span className="score">
                <b>{r.correct}</b>/{r.total} đúng
                {r.avgError !== null && (
                  <small>lệch TB {formatIndex(r.avgError)} điểm</small>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <details className="rules">
        <summary>Cách tính</summary>
        <ul>
          <li>
            Mỗi người dự đoán một lần mỗi phiên, trước{" "}
            {RITUAL_RULES.cutoff.hour}:
            {String(RITUAL_RULES.cutoff.minute).padStart(2, "0")}.
          </li>
          <li>
            Đúng khi đoán đúng hướng tăng/giảm của VNINDEX so với tham chiếu.
          </li>
          <li>
            Xếp hạng theo số lần đúng trong tháng; bằng nhau thì ai đoán sát
            điểm đóng cửa hơn đứng trên.
          </li>
          <li>
            Kết quả được chấm sau {RITUAL_RULES.resolveAfter.hour}:00 mỗi ngày
            giao dịch.
          </li>
        </ul>
      </details>
    </div>
  )
}
