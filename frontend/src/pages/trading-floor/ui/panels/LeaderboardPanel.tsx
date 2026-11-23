import { useEffect, useState } from "react"

import { useAuth } from "@/hooks/use-auth"
import { renderChibiPortraitDataUrl } from "@/lib/chibi-3d/portrait-renderer.ts"

import { avatarImage, ui, world } from "../../bridge.ts"
import { refreshLeaderboard } from "../../net/leaderboard.ts"
import type { LeaderRow, ThanTaiLeaderboard } from "../../net/types.ts"
import { useStore } from "../../use-store.ts"
import { cx } from "../utils.ts"
import "./leaderboard.css"

/** "2026-11" to "11/2026". */
function monthLabel(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`
}

function accuracy(row: LeaderRow): string {
  return `${Math.round((row.correct / Math.max(1, row.total)) * 100)}%`
}

/**
 * Hall of fame of the month: who called the VNINDEX direction right most often (the Thần Tài step 2
 * predictions, scored once the day's close is stored). The board is shared with the statues through
 * `world.leaderboard`; opening the panel asks the server again.
 */
export function LeaderboardPanel() {
  const board = useStore(world.leaderboard)
  const guest = useStore(ui.guest)
  const images = useStore(ui.avatarImages)
  const { openAuth } = useAuth()
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")

  // Bumped by the retry button to run the request again.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    refreshLeaderboard().then(
      () => live && setStatus("ok"),
      () => live && setStatus("error")
    )
    return () => {
      live = false
    }
  }, [attempt])

  const retry = (): void => {
    setStatus("loading")
    setAttempt((n) => n + 1)
  }

  // A refresh that fails while an older board is on screen keeps showing it.
  const failed = status === "error" && !board

  return (
    <div className="lb">
      <p className="lb-note">
        Xếp theo số lần dự đoán VNINDEX đúng trong tháng. Kết quả cập nhật sau
        khi có giá đóng cửa (khoảng 15:15).
      </p>
      {board && (
        <p className="lb-month">
          <b>Tháng {monthLabel(board.month)}</b>
          <span>
            {board.scoredDays > 0
              ? `${board.scoredDays} phiên đã chấm`
              : "Chưa có phiên nào được chấm"}
          </span>
        </p>
      )}
      {!board && status === "loading" && (
        <p className="lb-state" role="status">
          Đang tải bảng vinh danh…
        </p>
      )}
      {failed && (
        <div className="lb-state" role="alert">
          <p>Không tải được bảng vinh danh.</p>
          <button type="button" className="btn gold small" onClick={retry}>
            Thử lại
          </button>
        </div>
      )}
      {board && (
        <Board board={board} images={images} loading={status === "loading"} />
      )}
      {!guest && board && board.rows.length > 0 && !board.me && (
        <p className="lb-note">
          Bạn chưa có lượt dự đoán nào được chấm trong tháng này.
        </p>
      )}
      {guest && (
        <div className="lb-guest">
          <p>Đăng nhập để được xếp hạng</p>
          <button
            type="button"
            className="btn gold"
            onClick={() => openAuth("login")}
          >
            Đăng nhập
          </button>
        </div>
      )}
    </div>
  )
}

function Board({
  board,
  images,
  loading,
}: {
  board: ThanTaiLeaderboard
  images: Record<string, string>
  loading: boolean
}) {
  if (board.rows.length === 0) {
    return (
      <p className="lb-state">Chưa có phiên nào được chấm trong tháng này.</p>
    )
  }
  const meOutside =
    board.me && !board.rows.some((r) => r.rank === board.me!.rank)
      ? board.me
      : null
  return (
    <div aria-busy={loading}>
      <ol className="lb-list">
        {board.rows.map((row) => (
          <Row
            key={row.rank}
            row={row}
            images={images}
            me={board.me?.rank === row.rank}
          />
        ))}
      </ol>
      {meOutside && (
        <>
          <p className="lb-gap" aria-hidden="true">
            ···
          </p>
          <ol className="lb-list lb-pinned">
            <Row row={meOutside} images={images} me />
          </ol>
        </>
      )}
    </div>
  )
}

function Row({
  row,
  images,
  me,
}: {
  row: LeaderRow
  images: Record<string, string>
  me: boolean
}) {
  const src =
    avatarImage(images, row.avatar) ?? renderChibiPortraitDataUrl(row.avatar)
  return (
    <li
      className={cx(
        "lb-row",
        row.rank <= 3 && `lb-top${row.rank}`,
        me && "lb-me"
      )}
    >
      <span className="lb-rank" aria-label={`Hạng ${row.rank}`}>
        {row.rank}
      </span>
      {src ? (
        <img className="lb-avatar" src={src} alt="" />
      ) : (
        <span className="lb-avatar" aria-hidden="true" />
      )}
      <span className="lb-who">
        <span className="lb-name">{row.name}</span>
        {me && <small className="lb-you">Bạn</small>}
      </span>
      <span className="lb-score">
        <b>
          {row.correct}/{row.total}
        </b>
        <small>{accuracy(row)}</small>
      </span>
    </li>
  )
}
