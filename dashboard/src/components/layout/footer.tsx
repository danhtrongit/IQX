import { Circle, Wifi, Clock } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

export function Footer() {
  const now = new Date()
  const timeStr = now.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  return (
    <footer
      id="app-footer"
      className="flex h-6 shrink-0 items-center border-t border-border bg-card px-2 gap-2 text-[10px]"
    >
      {/* Connection Status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            id="connection-status"
            className="flex items-center gap-1.5 cursor-default"
          >
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
            </span>
            <Wifi className="size-3 text-emerald-500" />
            <span className="text-emerald-500 font-medium">Kết nối</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>REST polling: đang hoạt động | Giá 5s, chỉ số 10s</p>
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-3" />

      {/* Data Source */}
      <span className="text-muted-foreground">
        Dữ liệu:{" "}
        <span className="text-foreground font-medium">VPS</span>
      </span>

      <Separator orientation="vertical" className="h-3" />

      {/* Market Session */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-default">
            <Circle className="size-2 fill-amber-500 text-amber-500" />
            <span className="text-amber-500 font-medium">
              Phiên chiều
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>13:00 - 14:30 | Khớp lệnh liên tục</p>
        </TooltipContent>
      </Tooltip>

      {/* Spacer */}
      <div className="flex-1" />

      {/* API Version */}
      <span className="text-muted-foreground">
        v2.1.0
      </span>

      <Separator orientation="vertical" className="h-3" />

      {/* Timezone + Time */}
      <div
        id="footer-time"
        className="flex items-center gap-1 text-muted-foreground"
      >
        <Clock className="size-3" />
        <span className="tabular-nums font-medium text-foreground">
          {timeStr}
        </span>
        <span>GMT+7</span>
      </div>
    </footer>
  )
}
