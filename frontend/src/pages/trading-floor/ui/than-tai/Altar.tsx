/** The altar screen: hoành phi, lanterns, the statue, the altar table, clock, status line and main button. */
import { Clock } from "lucide-react"
import type { ThanTaiStatus, ThanTaiToday } from "../../net/types.ts"
import {
  DIRECTION_META,
  HANG_META,
  altarCopy,
  vnClock,
} from "../../than-tai.ts"
import { AltarTable, Lantern, Statue } from "./ShrineArt.tsx"

interface Props {
  today: ThanTaiToday
  status: ThanTaiStatus
  /** Server clock, epoch ms. */
  now: number
  onOpen: () => void
}

export function Altar({ today, status, now, onOpen }: Props) {
  const copy = altarCopy(status, !!today.la)
  const done = status === "da_xong"
  return (
    <div className="tt-stage">
      <div className="tt-topbar">
        <div className="tt-crumb">
          Khu giao dịch › <b>Tượng Thần Tài</b>
        </div>
        <div className="tt-clock">
          <Clock size={13} aria-hidden="true" /> {vnClock(now)} · hạn khấn{" "}
          <i>{vnClock(today.deadline)}</i> · ngày <i>{today.day.canChi}</i> hành{" "}
          <i>{today.day.hanhLabel}</i>
        </div>
      </div>

      <div className="tt-shrine">
        <Lantern side="l" glyph="福" />
        <Lantern side="r" glyph="祿" />
        <div className="tt-plaque">
          <h3>THẦN TÀI</h3>
          <small>LỘC ĐẾN · TÀI VƯỢNG</small>
        </div>
        <div className="tt-altar">
          <Statue blessed={done} />
          <AltarTable />
        </div>

        <div className="tt-cta">
          <p className="tt-status" aria-live="polite">
            {copy.status}
          </p>
          <button
            type="button"
            className={copy.primary ? "tt-btn-pray" : "tt-btn-ghost"}
            onClick={onOpen}
          >
            {copy.button}
          </button>
          <TodayChips today={today} done={done} />
        </div>
      </div>
    </div>
  )
}

function TodayChips({ today, done }: { today: ThanTaiToday; done: boolean }) {
  if (!today.la) return null
  const hang = HANG_META[today.la.hang]
  return (
    <div className="tt-chips">
      <span className="tt-chip">
        <i style={{ background: hang.color }} />
        Quẻ <b>{today.la.que.ten}</b>
      </span>
      {today.prediction && (
        <span className="tt-chip">
          VNINDEX <b>{DIRECTION_META[today.prediction].label}</b>
        </span>
      )}
      {done && today.tickers && (
        <span className="tt-chip">
          Cầu{" "}
          {today.tickers.length ? (
            today.tickers.map((t, i) => (
              <span key={t}>
                {i > 0 && " · "}
                <b>{t}</b>
              </span>
            ))
          ) : (
            <b>không cầu mã</b>
          )}
        </span>
      )}
    </div>
  )
}
