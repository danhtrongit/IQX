import { useCallback, useEffect, useRef, useState } from "react"

import { commands, toast, ui } from "../../bridge.ts"
import { floorApi } from "../../net/api.ts"
import type { ThanTaiToday } from "../../net/types.ts"
import {
  HANG_META,
  MSG_HET_GIO,
  THAN_TAI,
  effectiveStatus,
  openingStep,
  serverOffset,
  vnDate,
} from "../../than-tai.ts"
import { Altar } from "../than-tai/Altar.tsx"
import {
  useReducedMotion,
  useSerifFont,
  useServerNow,
} from "../than-tai/hooks.ts"
import { RitualDialog } from "../than-tai/RitualDialog.tsx"
import type { Step } from "../than-tai/types.ts"
import "../than-tai/than-tai.css"

/** Coins in one rain. */
const RAIN_COINS = 26
/** The Đại cát rain starts when the card has flipped. */
const DAI_CAT_RAIN_DELAY = 900

/**
 * Thần Tài v2: the altar and the daily ritual (gieo quẻ → dự đoán VNINDEX → cầu mã → kết quả).
 * The server decides the quẻ, the status and the 11:30 deadline; this screen only animates.
 */
export function ThanTaiPanel() {
  const [today, setToday] = useState<ThanTaiToday | null>(null)
  const [offset, setOffset] = useState(0)
  const [loadError, setLoadError] = useState("")
  const [dialog, setDialog] = useState<Step | null>(null)
  const [rain, setRain] = useState(0)
  const reduced = useReducedMotion()
  const now = useServerNow(offset)
  const rainTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const loadedDay = useRef<string | null>(null)
  useSerifFont()

  const apply = useCallback((next: ThanTaiToday, receivedAt: number) => {
    setToday(next)
    setOffset(serverOffset(next.serverTime, receivedAt))
    loadedDay.current = next.day.date
  }, [])

  const load = useCallback(
    (): Promise<void> =>
      floorApi.thanTai.today().then(
        (next) => {
          apply(next, Date.now())
          setLoadError("")
        },
        () =>
          setLoadError("Không mở được điện thờ. Kiểm tra kết nối rồi thử lại.")
      ),
    [apply]
  )

  useEffect(() => {
    void load()
  }, [load])

  // Past midnight (Vietnam time) a new day starts: reload once.
  useEffect(() => {
    if (!today || dialog !== null) return
    if (vnDate(now) !== loadedDay.current) {
      loadedDay.current = vnDate(now)
      void load()
    }
  }, [now, today, dialog, load])

  useEffect(() => {
    const pending = rainTimers.current
    return () => {
      for (const t of pending) clearTimeout(t)
      pending.clear()
    }
  }, [])

  const rainLater = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      rainTimers.current.delete(t)
      fn()
    }, ms)
    rainTimers.current.add(t)
  }, [])

  /** Stops the coins now and cancels one that is still waiting to start. */
  const stopRain = useCallback(() => {
    for (const t of rainTimers.current) clearTimeout(t)
    rainTimers.current.clear()
    setRain(0)
  }, [])

  const startRain = useCallback(
    (delay = 0) => {
      if (reduced) return
      rainLater(() => {
        setRain((n) => n + 1)
        rainLater(() => setRain(0), THAN_TAI.rainMs + 2000)
      }, delay)
    },
    [rainLater, reduced]
  )

  const close = useCallback(() => {
    stopRain()
    setDialog(null)
  }, [stopRain])

  const expired = useCallback(() => {
    toast(MSG_HET_GIO, "warn")
    stopRain()
    setDialog(null)
    void load()
  }, [load, stopRain])

  const drawn = useCallback(
    (next: ThanTaiToday) => {
      if (next.la?.hang === "dai_cat") startRain(DAI_CAT_RAIN_DELAY)
    },
    [startRain]
  )

  const finished = useCallback(() => {
    startRain()
    const la = today?.la
    commands.emit("celebrate", {
      luck: la ? HANG_META[la.hang].luck : 3,
      name: ui.profile.get()?.name ?? "",
      self: true,
    })
  }, [startRain, today])

  if (!today) {
    return (
      <div className="tt">
        {loadError ? (
          <div className="tt-loading">
            <p className="tt-error">{loadError}</p>
            <button
              type="button"
              className="tt-btn-ghost"
              onClick={() => void load()}
            >
              Thử lại
            </button>
          </div>
        ) : (
          <p className="tt-loading">Đang thắp hương…</p>
        )}
      </div>
    )
  }

  const status = effectiveStatus(today, now)
  const shown = status === today.status ? today : { ...today, status }

  return (
    <div className="tt">
      <Altar
        today={shown}
        status={status}
        now={now}
        onOpen={() => setDialog(openingStep(status, today.step))}
      />
      {dialog !== null && (
        <RitualDialog
          today={shown}
          initialStep={dialog}
          reduced={reduced}
          onToday={apply}
          onExpired={expired}
          onDrawn={drawn}
          onFinished={finished}
          onClose={close}
          onStep={stopRain}
          rain={rain > 0 ? { key: rain, count: RAIN_COINS } : null}
        />
      )}
    </div>
  )
}
