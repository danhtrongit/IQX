import { useState, type CSSProperties } from "react"
import { Skeleton } from "@arco-design/web-react"
import { NewsDetailModal } from "@/features/news"
import { IconNewspaper } from "@/shared/icons"
import { Panel } from "./Panel"
import { usePaginatedNews } from "../hooks"

// 16 visually distinct hues, assigned round-robin per label.
const PALETTE_HUES = [210, 340, 120, 45, 280, 170, 25, 300, 190, 60, 0, 145, 240, 90, 320, 75]
const labelColorIndex = new Map<string, number>()
let nextColorIdx = 0

function getHue(label: string): number {
  if (labelColorIndex.has(label)) return PALETTE_HUES[labelColorIndex.get(label)!]
  const idx = nextColorIdx % PALETTE_HUES.length
  labelColorIndex.set(label, idx)
  nextColorIdx++
  return PALETTE_HUES[idx]
}

function badgeStyle(label: string): CSSProperties {
  const h = getHue(label)
  return { backgroundColor: `hsl(${h} 45% 18%)`, color: `hsl(${h} 70% 65%)` }
}

const sentimentColor: Record<string, string> = {
  Positive: "bg-up",
  Negative: "bg-down",
  Neutral: "bg-yellow-300",
}

function NewsSkeletons() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <Skeleton animation image={false} text={{ rows: 1 }} style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  )
}

export function NewsPanel() {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const { data, loading } = usePaginatedNews({ pageSize: 8, kind: "topic" })
  const source = loading ? "mock" : "live"

  return (
    <Panel
      title="Tin tức thị trường"
      source={source}
      icon={<IconNewspaper className="text-[rgb(var(--primary-6))]" />}
    >
      <div className="h-[300px] w-full overflow-y-auto">
        {loading ? (
          <NewsSkeletons />
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--color-text-3)]">
            Không có dữ liệu tin tức
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-border-2)]">
            {data.map((item) => (
              <article
                key={item.id}
                className="flex items-center gap-2 px-2 py-[7px] cursor-pointer transition-colors hover:bg-[var(--color-fill-1)] overflow-hidden"
                onClick={() => {
                  if (item.slug) setSelectedSlug(item.slug)
                }}
              >
                <span
                  className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                    sentimentColor[item.sentiment ?? ""] || "bg-[var(--color-text-4)]"
                  }`}
                />
                <span className="text-[11.5px] font-medium text-[var(--color-text-1)] flex-1 min-w-0 truncate leading-tight">
                  {item.title}
                </span>
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
      </div>
      <NewsDetailModal
        slug={selectedSlug}
        open={Boolean(selectedSlug)}
        onClose={() => setSelectedSlug(null)}
      />
    </Panel>
  )
}
