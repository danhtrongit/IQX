import { useSyncExternalStore } from "react"

import { BULLETIN_WIDE_BREAKPOINT } from "./bulletin-format"

const QUERY = `(min-width: ${BULLETIN_WIDE_BREAKPOINT}px)`

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY)
  list.addEventListener("change", onChange)
  return () => list.removeEventListener("change", onChange)
}

function snapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

/**
 * Cửa sổ từ 900 px trở lên: dùng bản máy tính của bản tin và bảng theo dõi dạng bảng.
 * Đọc trực tiếp từ `matchMedia` nên đổi khi cửa sổ vượt ngưỡng, không cần tải lại trang.
 */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}
