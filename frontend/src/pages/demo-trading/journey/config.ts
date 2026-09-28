import type { MascotId } from "./types"

export const MASCOT_MANIFEST: Record<MascotId, { name: string; accent: string }> = {
  bach_ho: { name: "Bạch Hổ", accent: "var(--primary)" },
  thanh_long: { name: "Thanh Long", accent: "var(--primary)" },
  loc_huou: { name: "Lộc Hươu", accent: "var(--accent)" },
  phung_hoang: { name: "Phụng Hoàng", accent: "var(--accent)" },
  kim_quy: { name: "Kim Quy", accent: "var(--price-up)" },
}

export function clampLevel(level: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return Math.max(0, Math.min(6, Number.isFinite(level) ? Math.trunc(level) : 0)) as 0 | 1 | 2 | 3 | 4 | 5 | 6
}
