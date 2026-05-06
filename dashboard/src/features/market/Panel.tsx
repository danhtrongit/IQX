import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Panel Shell ─────────────────────────────────────────

interface PanelProps {
  title: string;
  subtitle?: string;
  source?: "live" | "mock";
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
  icon?: ReactNode;
}

export function Panel({
  title,
  subtitle,
  source,
  children,
  className = "",
  headerRight,
  icon,
}: PanelProps) {
  return (
    <Card
      size="sm"
      className={cn(
        "col-span-4 gap-0 rounded-md py-0 bg-slate-900 border border-slate-800 shadow-[0_8px_24px_rgba(0,0,0,0.32)]",
        className,
      )}
    >
      <CardHeader
        className={cn(
          "grid-cols-[1fr_auto] items-center px-3 py-2 min-h-9 bg-slate-900/80 border-b border-slate-800",
        )}
      >
        <div className="flex items-baseline gap-1.5 min-w-0">
          {icon && <span className="self-center mr-0.5 shrink-0">{icon}</span>}
          <CardTitle className="text-[11px] font-bold tracking-wide uppercase text-slate-100 truncate">
            {title}
          </CardTitle>
          {subtitle && (
            <CardDescription className="text-[9px] text-slate-400 tracking-wide">
              {subtitle}
            </CardDescription>
          )}
        </div>
        <CardAction className="flex items-center gap-1.5 self-center">
          {headerRight}
          {source && <SourceBadge source={source} />}
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 p-2 overflow-auto min-h-0">
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Source Badge ─────────────────────────────────────────

function SourceBadge({ source }: { source: "live" | "mock" }) {
  const isLive = source === "live";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "h-auto px-1.5 py-px text-[8px] leading-tight font-semibold tracking-wider rounded cursor-default border",
              isLive
                ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/20"
                : "bg-slate-800 text-slate-400 border-slate-700",
            )}
          >
            {isLive ? "● LIVE" : "○ MOCK"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          {isLive
            ? "Dữ liệu thời gian thực từ API"
            : "Dữ liệu mẫu — API chưa sẵn sàng"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Utility: Mini SVG Sparkline ─────────────────────────

export function MiniSparkline({
  data,
  color = "#5b8def",
}: {
  data: number[];
  color?: string;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 60;
  const h = 20;
  const points = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`,
    )
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block align-middle"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
