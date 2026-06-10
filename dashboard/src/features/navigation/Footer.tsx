import { useEffect, useState } from "react"
import { Divider, Tooltip } from "@arco-design/web-react"
import { IconClockCircle, IconWifi } from "@arco-design/web-react/icon"

const APP_VERSION = "v2.1.0"

function formatClock(d: Date): string {
  return d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/** Live GMT+7 wall clock, ticking once per second. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-1 text-[var(--color-text-3)]">
      <IconClockCircle />
      <span className="font-medium tabular-nums text-[var(--color-text-1)]">{formatClock(now)}</span>
      <span>GMT+7</span>
    </div>
  )
}

export function Footer() {
  return (
    <div className="flex h-6 items-center gap-2 px-2 text-[10px]">
      {/* Connection status */}
      <Tooltip content="REST polling: đang hoạt động | Giá 5s, chỉ số 10s">
        <div className="flex cursor-default items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-up" />
          </span>
          <IconWifi className="text-up" />
          <span className="font-medium text-up">Kết nối</span>
        </div>
      </Tooltip>

      <Divider type="vertical" className="!mx-0 !h-3" />

      {/* Data source */}
      <span className="text-[var(--color-text-3)]">
        Dữ liệu: <span className="font-medium text-[var(--color-text-1)]">VPS</span>
      </span>

      <Divider type="vertical" className="!mx-0 !h-3" />

      {/* Session indicator */}
      <Tooltip content="13:00 - 14:30 | Khớp lệnh liên tục">
        <div className="flex cursor-default items-center gap-1">
          <span className="size-2 rounded-full bg-reference" />
          <span className="font-medium text-reference">Phiên chiều</span>
        </div>
      </Tooltip>

      <div className="flex-1" />

      <span className="text-[var(--color-text-3)]">{APP_VERSION}</span>

      <Divider type="vertical" className="!mx-0 !h-3" />

      <LiveClock />
    </div>
  )
}
