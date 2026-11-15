/** Step 2: Tăng / Đi ngang / Giảm for today's VNINDEX close, locked on confirm. */
import { useState, type CSSProperties } from "react"

import { floorApi } from "../../net/api.ts"
import type { Direction, ThanTaiToday } from "../../net/types.ts"
import { DIRECTIONS, DIRECTION_META, formatRef } from "../../than-tai.ts"
import { cx } from "../utils.ts"
import type { Act } from "./types.ts"

interface Props {
  today: ThanTaiToday
  act: Act
  onDone: () => void
}

export function StepPredict({ today, act, onDone }: Props) {
  const locked = today.prediction
  const [pick, setPick] = useState<Direction | null>(locked)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const confirm = async (): Promise<void> => {
    if (!pick || busy || locked) return
    setBusy(true)
    setError("")
    const res = await act(() => floorApi.thanTai.predict(pick))
    setBusy(false)
    if ("ok" in res) onDone()
    else if (res.fail.kind !== "het_gio") setError(res.fail.text)
  }

  return (
    <>
      <h3 className="tt-h3">Hôm nay VNINDEX sẽ thế nào?</h3>
      {today.vnindexRef !== null && (
        <div className="tt-vn">
          Tham chiếu <b>{formatRef(today.vnindexRef)}</b> · tính theo giá đóng
          cửa
        </div>
      )}
      <div className="tt-pred" role="radiogroup" aria-label="Dự đoán VNINDEX">
        {DIRECTIONS.map((d) => {
          const meta = DIRECTION_META[d]
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={pick === d}
              className={cx("tt-pred-btn", pick === d && "tt-on")}
              style={{ "--dc": meta.color } as CSSProperties}
              disabled={!!locked || busy}
              onClick={() => setPick(d)}
            >
              <DirectionIcon direction={d} />
              <span>
                <b>{meta.label}</b>
                <small>{meta.hint}</small>
              </span>
            </button>
          )
        })}
      </div>
      <div className="tt-note">Xác nhận xong thì không đổi được.</div>
      {error && (
        <p className="tt-error" role="alert">
          {error}
        </p>
      )}
      <div className="tt-act">
        <button
          type="button"
          className="tt-btn-main"
          disabled={!pick || busy || !!locked}
          onClick={() => void confirm()}
        >
          {busy ? "Đang gửi…" : "Xác nhận dự đoán"}
        </button>
      </div>
    </>
  )
}

function DirectionIcon({ direction }: { direction: Direction }) {
  const color = DIRECTION_META[direction].color
  const line =
    direction === "up"
      ? "#4ade80"
      : direction === "down"
        ? "#f87171"
        : "#fde68a"
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="22"
        fill={`${color}26`}
        stroke={color}
        strokeWidth="2"
      />
      {direction === "up" && (
        <>
          <path
            d="M12 30l9-9 6 6 9-11"
            fill="none"
            stroke={line}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M30 16h6v6"
            fill="none"
            stroke={line}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {direction === "flat" && (
        <>
          <path
            d="M12 24h24"
            stroke={line}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M31 19l5 5-5 5"
            fill="none"
            stroke={line}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {direction === "down" && (
        <>
          <path
            d="M12 18l9 9 6-6 9 11"
            fill="none"
            stroke={line}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M30 32h6v-6"
            fill="none"
            stroke={line}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}
