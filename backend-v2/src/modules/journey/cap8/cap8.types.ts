import type { Cap7PortfolioSnapshot } from '../cap7/cap7.types.js';

export const CAP8_EXIT_TARGET = 5;

export interface Cap8Progress {
  id: string;
  user_id: string;
  entered_at: Date | string;
  so_lenh_thoat_dung_ke_hoach: number;
  muc_tieu_thoat_dung_ke_hoach: number;
  graduated_at: Date | string | null;
  time_to_graduate_hours: number | null;
}

export interface Cap8Exit {
  id: string;
  symbol: string;
  matched_buy_order_id: string | null;
  sell_order_id: string;
  exited_at: Date | string;
  quantity: number;
  filled_price_vnd: number;
  remaining_position_pct: number;
  exit_method: string;
  original_stop_vnd: number | null;
  original_take_profit_vnd: number | null;
  effective_stop_vnd: number | null;
  dung_ke_hoach: boolean;
  ban_cam_xuc: boolean;
  classification_reason: string;
}

export interface Cap8ExitContext {
  symbol: string;
  quantity_total: number;
  quantity_sellable: number;
  avg_cost_vnd: number;
  current_price_vnd: number | null;
  source_buy_order_id: string | null;
  original_stop_vnd: number | null;
  original_take_profit_vnd: number | null;
  dynamic_stop_vnd: number | null;
  dynamic_stop_set_at: Date | string | null;
  can_update_dynamic_stop: boolean;
  board_lot_size: number;
  proposed_sale_quantity: number;
  sector_impact: Cap7PortfolioSnapshot;
}

export interface Cap8SyncedPlan {
  symbol: string;
  source_buy_order_id: string;
  original_stop_vnd: number;
  original_take_profit_vnd: number;
  dynamic_stop_vnd: null;
  dynamic_stop_set_at: null;
}

export interface Cap8DynamicStop {
  symbol: string;
  dynamic_stop_vnd: number;
  dynamic_stop_set_at: Date | string;
}

export interface DailyClose {
  day: string;
  close: number;
}

export type Cap8ExitSnapshot = {
  matchedBuyOrderId: string | null;
  sellOrderId: string;
  symbol: string;
  snapshotAt: Date | string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  quantity: number;
  filledPriceVnd: number;
  beforeQuantity: number | null;
  afterQuantity: number | null;
  originalStopVnd: number | null;
  takeProfitVnd: number | null;
  dynamicStopVnd: number | null;
  dynamicStopSetAt: Date | string | null;
  planActivatedAt: Date | string | null;
  avgCostVnd: number | null;
};
