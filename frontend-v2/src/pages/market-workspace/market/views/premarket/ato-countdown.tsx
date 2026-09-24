// ─── ATO countdown ────────────────────────────────────────────────────────────
// Ticks every 1 000 ms and renders HH:MM:SS to 09:00 local. The parent mounts it
// only for today's brief: an old brief must never look live.

import { useEffect, useState } from "react"

export function useAtoCountdown(): string {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  const now = new Date()
  const target = new Date(now)
  target.setHours(9, 0, 0, 0)

  if (now >= target) return "00:00:00"

  const totalSec = Math.floor((target.getTime() - now.getTime()) / 1000)
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0")
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0")
  const ss = String(totalSec % 60).padStart(2, "0")

  return `${hh}:${mm}:${ss}`
}

export function AtoCountdown() {
  const clock = useAtoCountdown()

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/60 bg-primary/12 p-3">
      <span className="min-w-[180px] flex-1 text-xs text-muted-foreground">
        Phiên giao dịch sắp mở lúc 9:00 — khớp lệnh ATO bắt đầu
      </span>
      <span
        data-testid="ato-countdown"
        aria-label={`Còn ${clock} đến phiên ATO`}
        className="tabular-nums text-xl font-bold tracking-[0.03em] text-primary"
      >
        {clock}
      </span>
    </div>
  )
}
