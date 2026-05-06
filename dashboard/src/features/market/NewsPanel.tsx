import React from "react";
import { Panel } from "./Panel";
import { usePaginatedNews } from "./hooks";
import { Newspaper } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

/* ── 16 visually distinct hues, assigned round-robin per label ── */
const PALETTE_HUES = [
  210, 340, 120, 45, 280, 170, 25, 300,
  190, 60, 0, 145, 240, 90, 320, 75,
];
const labelColorIndex = new Map<string, number>();
let nextColorIdx = 0;

function getHue(label: string): number {
  if (labelColorIndex.has(label)) return PALETTE_HUES[labelColorIndex.get(label)!];
  const idx = nextColorIdx % PALETTE_HUES.length;
  labelColorIndex.set(label, idx);
  nextColorIdx++;
  return PALETTE_HUES[idx];
}

/** Returns inline style for badge bg + text based on label string */
function badgeStyle(label: string): React.CSSProperties {
  const h = getHue(label);
  return {
    backgroundColor: `hsl(${h} 45% 18%)`,
    color: `hsl(${h} 70% 65%)`,
  };
}

/* ── sentiment dot color ── */
const sentimentColor: Record<string, string> = {
  Positive: "bg-emerald-400",
  Negative: "bg-red-500",
  Neutral:  "bg-yellow-300",
};

function NewsSkeletons() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <Skeleton className="h-2 w-2 rounded-full shrink-0 bg-slate-800" />
          <Skeleton className="h-3.5 flex-1 bg-slate-800" />
          <Skeleton className="h-4 w-16 shrink-0 rounded bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export function NewsPanel() {
  const { data, source, loading } =
    usePaginatedNews({ pageSize: 8, kind: "topic" });

  return (
    <Panel
      title="Tin tức thị trường"
      source={source}
      icon={
        <Newspaper size={14} className="text-cyan-300" />
      }
    >
      <ScrollArea className="h-[300px] w-full [&>[data-slot=scroll-area-viewport]>div]:!block">
        {loading ? (
          <NewsSkeletons />
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-slate-400">
            Không có dữ liệu tin tức
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-cyan-900/30">
            {data.map((item) => (
              <article
                key={item.id}
                className="flex items-center gap-2 px-2 py-[7px] cursor-pointer transition-colors hover:bg-cyan-950/30 overflow-hidden"
                onClick={() => {
                  if (item.link) window.open(item.link, "_blank");
                }}
              >
                {/* Sentiment dot */}
                <span
                  className={`w-[7px] h-[7px] rounded-full shrink-0 ${sentimentColor[item.sentiment ?? ""] || "bg-slate-400"}`}
                />

                {/* Title */}
                <span className="text-[11.5px] font-medium text-slate-100 flex-1 min-w-0 truncate leading-tight">
                  {item.title}
                </span>

                {/* Badge — right-aligned */}
                <span
                  className="text-[9px] px-2 py-[3px] font-bold rounded shrink-0 whitespace-nowrap text-left truncate w-[90px]"
                  style={badgeStyle(item.badgeLabel || item.category)}
                >
                  {item.badgeLabel || item.category}
                </span>
              </article>
            ))}
          </div>
        )}
      </ScrollArea>
    </Panel>
  );
}
