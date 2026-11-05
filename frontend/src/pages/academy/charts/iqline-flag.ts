import { iqlineEnabled } from "@/pages/charts/chart/iqline-flag"

/** Biểu đồ `series_panels` dùng IQLine trừ khi bị tắt bằng `VITE_IQLINE_OFF` hoặc `?iqline=0`. */
export function iqlineStaticEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    return iqlineEnabled("static", new URLSearchParams(window.location.search))
  } catch {
    return true
  }
}
