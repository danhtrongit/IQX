/** Định dạng hiển thị riêng của khu "Bài học". */

/**
 * Giây → "2h 05m" / "45m" / "30s".
 * Trả về "—" khi server không có thời lượng (bài PDF/text thường là `null`).
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—"
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`
  if (minutes > 0) return `${minutes}m`
  return `${total}s`
}
