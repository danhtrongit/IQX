export interface Cap8Progress {
  id: string
  user_id: string
  entered_at: string
  so_lenh_thoat_dung_ke_hoach: number
  muc_tieu_thoat_dung_ke_hoach: number
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

export interface Cap8Exit {
  id: string
  symbol: string
  matched_buy_order_id: string | null
  sell_order_id: string
  exited_at: string
  quantity: number
  filled_price_vnd: number
  remaining_position_pct: number
  exit_method: "full" | "partial" | "trailing_hit"
  original_stop_vnd: number | null
  original_take_profit_vnd: number | null
  effective_stop_vnd: number | null
  dung_ke_hoach: boolean
  ban_cam_xuc: boolean
  classification_reason: string
}

export interface Cap8ExitContext {
  symbol: string
  quantity_total: number
  quantity_sellable: number
  avg_cost_vnd: number
  current_price_vnd: number | null
  source_buy_order_id: string | null
  original_stop_vnd: number | null
  original_take_profit_vnd: number | null
  dynamic_stop_vnd: number | null
  dynamic_stop_set_at: string | null
  can_update_dynamic_stop: boolean
  board_lot_size: number
  proposed_sale_quantity: number
  sector_impact: Record<string, unknown>
}

export const countCap8TasksDone = (progress: Cap8Progress | null | undefined): number =>
  progress && progress.so_lenh_thoat_dung_ke_hoach >= progress.muc_tieu_thoat_dung_ke_hoach ? 1 : 0
