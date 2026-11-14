/** Giờ Việt Nam cho bảng SACO nhận định: "hôm nay" là 00:00 đến 23:59 theo giờ VN. */
const VN_ZONE = "Asia/Ho_Chi_Minh"

const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VN_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})
const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: VN_ZONE,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** `YYYY-MM-DD` của ngày VN chứa thời điểm `ms`, cùng dạng với `date` của `/posts/today`. */
export function vnDateKey(ms: number): string {
  return dateKeyFormat.format(new Date(ms))
}

/** `HH:MM` theo giờ VN. */
export function formatVnTime(ms: number): string {
  return timeFormat.format(new Date(ms))
}

/** `dd/MM HH:MM` theo giờ VN, dùng cho bảng quản trị. */
export function formatVnDateTime(ms: number): string {
  return dateTimeFormat.format(new Date(ms)).replace(",", "")
}

/** "vừa xong", "x phút trước", "x giờ trước", rồi "x ngày trước". */
export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return "vừa xong"
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.floor(hours / 24)} ngày trước`
}

/** Bề ngang ảnh trong bài (% bề ngang thân bài), 15 đến 100, mặc định 60. */
export function clampFigureWidth(raw: string | null | undefined): number {
  const value = Number(raw)
  if (raw == null || raw === "" || !Number.isFinite(value)) return 60
  return Math.min(100, Math.max(15, Math.round(value)))
}
