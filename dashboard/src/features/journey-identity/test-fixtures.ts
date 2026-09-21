import type { IdentityState } from "./types"
export function identityFixture(): IdentityState {
  return { lifecycle: "mascot", current_level: 6, cap6_graduated_at: "2026-09-11T08:00:00Z",
    mascot_rules_version: 1, today_local: "2026-09-13", timezone: "Asia/Ho_Chi_Minh",
    mascot: { id: "bach_ho", name: "Bạch Hổ", dominant_layer: "ky_thuat", assignment_basis: "ai_match_count", valid_pair_count: 2,
      match_counts: { ky_thuat: 2, dong_tien: 1, noi_bo: 1, tin_tuc: 0, dinh_gia: 1 }, tied_layers: ["ky_thuat"],
      window_start: "2026-09-01T00:00:00Z", window_end: "2026-09-11T08:00:00Z", assigned_at: "2026-09-11T08:00:01Z" },
    ui_state: { last_seen_egg_level: 6, egg_hatch_seen_at: "seen", reveal_seen_at: "seen", greeted_local_date: "2026-09-13", last_animated_bot_run_id: null },
    bot_run: { status: "idle", latest_run_id: null, last_updated_at: null, processed_unseen_sessions: 0, issues: [], connected: false } }
}
