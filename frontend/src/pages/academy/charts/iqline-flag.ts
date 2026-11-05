/**
 * Bật bản IQLine (Canvas) của biểu đồ `series_panels` khi URL có `?iqline=1`, trong lúc làm Giai đoạn 6. Mặc định
 * vẫn là bản SVG cũ nên người dùng thường không thấy khác biệt.
 */
export function iqlineStaticEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return new URLSearchParams(window.location.search).get("iqline") === "1"
  } catch {
    return false
  }
}
