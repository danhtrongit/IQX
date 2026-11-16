/** Short text of a chat message for inbox lines, toasts and the staff history. */
import { API_BASE } from "@/lib/api"

import type { ChatMessage } from "./types.ts"

export const RECALLED_TEXT = "Tin nhắn đã được thu hồi"
export const IMAGE_TEXT = "[Hình ảnh]"

/** One line for an inbox entry or a toast: recalled and image messages have no text of their own. */
export function messagePreview(m: Pick<ChatMessage, "text" | "image" | "recalled">): string {
  if (m.recalled) return RECALLED_TEXT
  if (m.image) return m.text ? `${IMAGE_TEXT} ${m.text}` : IMAGE_TEXT
  return m.text
}

/** The staff history keeps the original text of a recalled message, marked as such. */
export function staffPreview(m: Pick<ChatMessage, "text" | "image" | "recalled">): string {
  const body = m.text || (m.image || m.recalled ? IMAGE_TEXT : "")
  return m.recalled ? `${body} (đã thu hồi)` : body
}

/** Public URL of a chat image (unguessable id; gone once recalled). */
export function chatImageUrl(id: string): string {
  return `${API_BASE}/trading-floor/chat/images/${encodeURIComponent(id)}`
}

/** On-screen size of an image bubble: at most 240 px wide and 320 px tall, never upscaled. */
export function imageBox(w: number, h: number, maxW = 240, maxH = 320): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: maxW, height: maxW }
  const scale = Math.min(1, maxW / w, maxH / h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

/** Own messages can be recalled; system lines, recalled and not yet sent ones cannot. */
export function canRecall(m: Pick<ChatMessage, "id" | "from" | "recalled">, side: "user" | "saco"): boolean {
  return m.id > 0 && !m.recalled && m.from === (side === "user" ? "u" : "s")
}
