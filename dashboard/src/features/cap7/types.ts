export interface Cap7Progress {
  id: string
  user_id: string
  entered_at: string
  can_doi_ok: boolean
  so_ma_dang_giu: number
  so_nganh_dang_giu: number
  ma_ty_trong_cao_nhat: string | null
  ty_trong_ma_cao_nhat_pct: number | null
  nganh_ty_trong_cao_nhat: string | null
  ty_trong_nganh_cao_nhat_pct: number | null
  ma_chua_co_gia: string[]
  ma_chua_ro_nganh: string[]
  du_lieu_day_du: boolean
  nguong_ty_trong_ma_pct: number
  nguong_ty_trong_nganh_pct: number
  toi_thieu_ma: number
  toi_thieu_nganh: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export interface SymbolAllocationCap7 {
  symbol: string
  market_value_vnd: number | null
  weight_pct: number | null
  sector: string | null
}

export interface SectorAllocationCap7 {
  sector: string
  market_value_vnd: number
  weight_pct: number | null
}

export interface PortfolioBalanceCap7 {
  nav_vnd: number
  cash_vnd: number | null
  cash_weight_pct: number | null
  positions: SymbolAllocationCap7[]
  sectors: SectorAllocationCap7[]
  held_symbol_count: number
  known_sector_count: number
  max_symbol: string | null
  max_symbol_weight_pct: number | null
  max_sector: string | null
  max_sector_weight_pct: number | null
  unpriced_symbols: string[]
  unknown_sector_symbols: string[]
  data_complete: boolean
  can_doi_ok: boolean
}

export function countCap7TasksDone(progress: Cap7Progress | null | undefined): number {
  return progress?.can_doi_ok ? 1 : 0
}
