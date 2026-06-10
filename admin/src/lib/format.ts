import { format, formatDistanceToNowStrict, isValid } from "date-fns"
import { vi } from "date-fns/locale"

export function fmtVnd(value: number | null | undefined): string {
  return `${Math.round(value ?? 0).toLocaleString("vi-VN")} ₫`
}

export function fmtCompact(value: number | null | undefined): string {
  const n = value ?? 0
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${trimNumber(n / 1_000_000_000)} T`
  if (abs >= 1_000_000) return `${trimNumber(n / 1_000_000)} Tr`
  if (abs >= 1_000) return `${trimNumber(n / 1_000)} N`
  return String(n)
}

export function fmtDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, "dd/MM/yyyy", { locale: vi }) : "-"
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? format(date, "dd/MM/yyyy HH:mm", { locale: vi }) : "-"
}

export function fmtRelative(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return "-"
  const seconds = Math.abs(Date.now() - date.getTime()) / 1000
  if (seconds < 45) return "vừa xong"
  return `${formatDistanceToNowStrict(date, { locale: vi })} trước`
}

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

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return isValid(date) ? date : null
}

function trimNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  }).format(value)
}
