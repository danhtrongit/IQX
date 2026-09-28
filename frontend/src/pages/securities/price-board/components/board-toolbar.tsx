import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TourLaunchButton } from "@/pages/market-workspace/tour"
import { cn } from "@/lib/utils"

import { fmtTimeOfDay } from "../../market/format"
import { useBoardStatus } from "../../market/hooks"

/** Board tabs: "WATCHLIST" = danh mục của user, còn lại là nhóm chỉ số/sàn. */
export type BoardTab = "WATCHLIST" | "VN30" | "VN100" | "HOSE" | "HNX30" | "HNX" | "UPCOM"

const TABS: { key: BoardTab; label: string }[] = [
  { key: "WATCHLIST", label: "Danh mục" },
  { key: "VN30", label: "VN30" },
  { key: "VN100", label: "VN100" },
  { key: "HOSE", label: "HOSE" },
  { key: "HNX30", label: "HNX30" },
  { key: "HNX", label: "HNX" },
  { key: "UPCOM", label: "UPCOM" },
]

export interface BoardToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  tab: BoardTab
  onTabChange: (tab: BoardTab) => void
  rowCount: number
  /** Launches the bảng giá tour. */
  onLaunchTour: () => void
}

/**
 * Search + group tabs on the left; tour, live status, row count and the source
 * timestamp of the newest board data on the right.
 */
export function BoardToolbar({
  search,
  onSearchChange,
  tab,
  onTabChange,
  rowCount,
  onLaunchTour,
}: BoardToolbarProps) {
  const { isRealtime, updatedAt, source } = useBoardStatus()

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2" data-tour-id="tour-banggia-search-tabs">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value.toUpperCase())}
            placeholder="Tìm mã…"
            aria-label="Tìm mã trên bảng giá"
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-36 pl-7 text-xs font-semibold uppercase placeholder:font-normal placeholder:normal-case"
          />
        </div>
        <ScrollArea orientation="horizontal" className="min-w-0 max-w-full" viewportClassName="pb-1">
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as BoardTab)}>
          <TabsList aria-label="Chọn nhóm mã">
            {TABS.map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="px-2.5 text-xs">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
        <TourLaunchButton onClick={onLaunchTour} />
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
          data-tour-id="tour-banggia-realtime"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isRealtime ? "bg-price-up" : "bg-muted-foreground/40",
            )}
            aria-hidden
          />
          <span>{isRealtime ? "Realtime" : "Cập nhật định kỳ"}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{rowCount} mã</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">Cập nhật {fmtTimeOfDay(updatedAt)}</span>
          {source && (
            <>
              <span aria-hidden>·</span>
              <span>Nguồn {source}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
