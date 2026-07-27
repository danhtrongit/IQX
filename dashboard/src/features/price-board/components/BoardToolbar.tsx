import { useRealtimeStatus } from "@/features/market-data"
import { TourLaunchButton } from "@/features/tour"
import { cn } from "@/shared/lib/cn"

/** Board tabs: "WATCHLIST" = danh mục của user, còn lại là nhóm chỉ số/sàn. */
export type BoardTab =
  | "WATCHLIST"
  | "VN30"
  | "VN100"
  | "HOSE"
  | "HNX30"
  | "HNX"
  | "UPCOM"

const TABS: { key: BoardTab; label: string }[] = [
  { key: "WATCHLIST", label: "Danh mục" },
  { key: "VN30", label: "VN30" },
  { key: "VN100", label: "VN100" },
  { key: "HOSE", label: "HOSE" },
  { key: "HNX30", label: "HNX30" },
  { key: "HNX", label: "HNX" },
  { key: "UPCOM", label: "UPCOM" },
]

interface BoardToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  tab: BoardTab
  onTabChange: (tab: BoardTab) => void
  rowCount: number
  /** Launches the Bảng giá tour (T1). Omit to hide the "Xem hướng dẫn" button. */
  onLaunchTour?: () => void
}

/** Search + group tabs on the left, tour button + live status + row count on the right. */
export function BoardToolbar({
  search,
  onSearchChange,
  tab,
  onTabChange,
  rowCount,
  onLaunchTour,
}: BoardToolbarProps) {
  const isRealtime = useRealtimeStatus()

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2" data-tour-id="tour-banggia-search-tabs">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value.toUpperCase())}
          placeholder="Tìm mã…"
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-36 rounded-md border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-2 text-xs font-semibold uppercase text-[var(--color-text-1)] outline-none transition-colors placeholder:font-normal placeholder:normal-case placeholder:text-[var(--color-text-3)] focus:border-[rgb(var(--primary-6))]"
        />
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === t.key
                  ? "bg-[rgb(var(--primary-6))] text-white"
                  : "bg-[var(--color-fill-2)] text-[var(--color-text-2)] hover:bg-[var(--color-fill-3)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onLaunchTour && <TourLaunchButton onClick={onLaunchTour} />}
        <div
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-3)]"
          data-tour-id="tour-banggia-realtime"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isRealtime ? "bg-up" : "bg-[var(--color-fill-4)]",
            )}
          />
          <span>{isRealtime ? "Realtime" : "Cập nhật định kỳ"}</span>
          <span>·</span>
          <span className="tabular-nums">{rowCount} mã</span>
        </div>
      </div>
    </div>
  )
}
