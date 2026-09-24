/** Định dạng riêng của quản trị bài học. */

/** Tiêu đề tiếng Việt → slug ASCII (bỏ dấu, gộp ký tự lạ thành `-`). */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

/** Dung lượng tệp → "4,2 MB" / "812 KB". */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—"
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/** Giây → "12m 30s" (thời lượng bài học do máy chủ dò từ tệp). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—"
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return minutes > 0 ? `${minutes}m ${String(total % 60).padStart(2, "0")}s` : `${total}s`
}
