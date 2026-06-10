import { format, formatDistanceToNow, isValid, parseISO } from "date-fns"
import { vi } from "date-fns/locale"

export function fmtVnd(n: number): string {
  return n.toLocaleString("vi-VN") + " ₫"
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) {
    return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B"
  }
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
  }
  return String(n)
}

function toDate(s: string | Date): Date {
  if (s instanceof Date) return s
  const d = parseISO(s)
  return isValid(d) ? d : new Date(s)
}

export function fmtDate(s: string | Date): string {
  return format(toDate(s), "dd/MM/yyyy", { locale: vi })
}

export function fmtDateTime(s: string | Date): string {
  return format(toDate(s), "dd/MM/yyyy HH:mm", { locale: vi })
}

export function fmtRelative(s: string | Date): string {
  return formatDistanceToNow(toDate(s), { addSuffix: true, locale: vi })
}
