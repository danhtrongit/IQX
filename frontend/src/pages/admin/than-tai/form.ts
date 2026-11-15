/** Quy tắc thuần của màn sửa thư viện Thần Tài: đếm chữ, tách danh sách ngành, kiểm tra màu. */
import type { AdminLa, Hang } from "@/pages/trading-floor/net/types"

/** Số chữ (từ) của một đoạn tiếng Việt, tách theo khoảng trắng. */
export function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

/** Spec: thầy luận 50–80 chữ, lời chốt tối đa 12 chữ. */
export const LUAN_WORDS = { min: 50, max: 80 } as const
export const CHOT_MAX_WORDS = 12

/** Một ngành mỗi dòng (hoặc cách nhau bằng dấu phẩy), bỏ dòng trống và trùng. */
export function parseNganh(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n,]/)) {
    const item = raw.trim().replace(/\s+/g, " ")
    const key = item.toLowerCase()
    if (!item || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim())
}

export interface LaFilter {
  query: string
  hang: Hang | "all"
  active: "all" | "on" | "off"
}

/** Lọc danh sách lá theo tên quẻ/chữ Hán/số quẻ, hạng và trạng thái bật. */
export function filterLa(items: readonly AdminLa[], filter: LaFilter): AdminLa[] {
  const q = fold(filter.query.trim())
  return items.filter((item) => {
    if (filter.hang !== "all" && item.hang !== filter.hang) return false
    if (filter.active === "on" && !item.active) return false
    if (filter.active === "off" && item.active) return false
    if (!q) return true
    return (
      String(item.queId) === q ||
      fold(item.queTen).includes(q) ||
      item.chuHan.includes(filter.query.trim()) ||
      fold(item.tenHao).includes(q) ||
      fold(item.chot).includes(q)
    )
  })
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

/** Khoá quẻ đơn → ký hiệu và tên (giống máy chủ). */
export const TRIGRAM_LABEL: Readonly<Record<string, string>> = {
  can: "☰ Càn",
  khon: "☷ Khôn",
  chan: "☳ Chấn",
  kham: "☵ Khảm",
  can_son: "☶ Cấn",
  ton: "☴ Tốn",
  ly: "☲ Ly",
  doai: "☱ Đoài",
}
