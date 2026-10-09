/**
 * Wire layer for the hunt ("Săn mã") panels - every endpoint is called through
 * the shared `api()` client, so auth/refresh/proxy behaviour is identical to the
 * trading hooks. (The Bot tool has its own wire layer in `../bot`.)
 *
 * Shapes are snake_case exactly as the backend serializes them. Nothing here
 * invents a value: unknown stays `null` on the wire, and the panels render it
 * as "-".
 */
import { ApiError, api } from "@/lib/api"

/* ── Hunt ───────────────────────────────────────────────────────────────── */

export type LocSanTieuChi = {
  ma: string
  ten: string
  ap_dung: boolean
  giai_thich: string | null
}

export type HuntFilterStatus = {
  ma: string
  icon: string
  ten: string
  mo_ta: string
  dieu_kien: string
  xep_hang_theo: string
  nguon_du_lieu: string | null
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
}

export type SanMaIndex = {
  loc_san: LocSanTieuChi[]
  so_ma_trong_ro: number | null
  bo_loc: HuntFilterStatus[]
  hien_thi_toi_da: number
}

export type HuntItem = {
  hang: number
  symbol: string
  gia_vnd: number | null
  pct_thay_doi: number | null
  tin_hieu: string
  gia_tri_xep_hang: number | null
}

export type HuntResult = {
  ma: string
  icon: string | null
  ten: string
  mo_ta: string
  dieu_kien: string
  xep_hang_theo: string
  nguon_du_lieu: string | null
  kha_dung: boolean
  ly_do_chua_kha_dung: string | null
  tong_so_ma: number | null
  so_ma_trong_ro: number | null
  so_ma_xet: number | null
  so_ma_truot_loc_san: number | null
  so_ma_bo_qua_thieu_du_lieu: number | null
  ket_qua_day_du: boolean | null
  canh_bao_thieu_du_lieu: string | null
  hien_thi_toi_da: number
  loc_san: LocSanTieuChi[]
  items: HuntItem[]
}

/* ── Fetchers ───────────────────────────────────────────────────────────── */

function unwrap<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in payload
  ) {
    return (payload as { data: T }).data
  }
  return payload as T
}

/**
 * A 404 from a read that may not be deployed or populated yet is "no data", not
 * a failure - it maps to `null` so the panels can say so instead of reporting an
 * error. Every other status still throws.
 */
async function getOrNull<T>(
  path: string,
  signal?: AbortSignal
): Promise<T | null> {
  try {
    return unwrap<T>(await api<unknown>(path, { signal }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export const insightsApi = {
  huntIndex: (signal?: AbortSignal) =>
    getOrNull<SanMaIndex>("/cap5/san-ma", signal),
  hunt: (filter: string, signal?: AbortSignal) =>
    getOrNull<HuntResult>(`/cap5/san-ma/${filter}`, signal),
}
