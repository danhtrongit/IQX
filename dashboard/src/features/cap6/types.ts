/** Server-owned Cấp 6 progress under the single 3-event journey gate. */
export interface Cap6Progress {
  id: string
  user_id: string
  entered_at: string
  so_lan_xu_ly_nhat_quan: number
  /** Descriptive subset only; it never gates graduation. */
  so_lan_xu_ly_veto_nhat_quan: number
  /** The sole server-published journey target: 3. */
  muc_tieu_nhat_quan: number
  tong_lai_lenh_cap6_pct: number | null
  da_xem_tour_mauthuan: boolean
  /** Server-derived from `so_lan_xu_ly_nhat_quan`, never from veto or P&L. */
  dat_nhiem_vu: boolean
  graduated_at: string | null
  time_to_graduate_hours: number | null
}

/** Completed journey-task count; Cấp 6 has exactly one task. */
export function countCap6TasksDone(progress: Cap6Progress | null | undefined): number {
  if (!progress) return 0
  return progress.so_lan_xu_ly_nhat_quan >= progress.muc_tieu_nhat_quan ? 1 : 0
}
