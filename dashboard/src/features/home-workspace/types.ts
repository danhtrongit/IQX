export type HomeTab = "order" | "watchlist" | "news" | "phan-tich" | "patterns"

export interface HomeTabMeta {
  id: HomeTab
  label: string
  /** When the context symbol is an index, this tab is disabled in the rail. */
  indexDisabled?: boolean
}

export const HOME_TABS: HomeTabMeta[] = [
  { id: "order", label: "Đặt lệnh", indexDisabled: true },
  { id: "watchlist", label: "Danh mục" },
  { id: "news", label: "Tin tức" },
  { id: "phan-tich", label: "Phân tích" },
  { id: "patterns", label: "Mẫu nến" },
]
