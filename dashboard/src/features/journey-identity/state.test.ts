import { describe, expect, it } from "vitest"
import { deriveMascotState, revealPhase } from "./state"
import { EGG_CONFIG, MASCOT_MANIFEST, clampLevel } from "./config"
import { identityFixture } from "./test-fixtures"
describe("identity lifecycle", () => {
  it("keeps an ungraduated level six egg closed", () => {
    const state = identityFixture(); state.cap6_graduated_at = null
    expect(revealPhase(state)).toBe("egg")
  })
  it("keeps pending profiles closed even after graduation", () => {
    const state = identityFixture(); state.lifecycle = "pending_data_repair"; state.mascot = null
    expect(revealPhase(state)).toBe("egg")
  })
  it("resumes welcome without replaying a persisted hatch", () => {
    const state = identityFixture(); state.ui_state.reveal_seen_at = null
    expect(revealPhase(state)).toBe("welcome")
    state.ui_state.egg_hatch_seen_at = null
    expect(revealPhase(state)).toBe("hatch")
  })
  it("gives real running priority over all presentation events", () => {
    const state = identityFixture(); state.bot_run.status = "running"; state.ui_state.greeted_local_date = null
    expect(deriveMascotState(state)).toBe("analyzing")
  })
  it("failed runs stay idle even with unseen IDs and no greeting", () => {
    const state = identityFixture(); state.bot_run.status = "failed"; state.bot_run.latest_run_id = "new"; state.ui_state.greeted_local_date = null
    expect(deriveMascotState(state)).toBe("idle")
  })
  it("one unseen success replaces a daily greeting", () => {
    const state = identityFixture(); state.bot_run.status = "succeeded"; state.bot_run.latest_run_id = "new"; state.ui_state.greeted_local_date = null
    expect(deriveMascotState(state)).toBe("updated")
    state.ui_state.last_animated_bot_run_id = "new"; state.ui_state.greeted_local_date = state.today_local
    expect(deriveMascotState(state)).toBe("idle")
  })
  it("greetings are calendar-day based, not tab based", () => {
    const state = identityFixture()
    expect(deriveMascotState(state)).toBe("idle")
    state.today_local = "2026-09-14"
    expect(deriveMascotState(state)).toBe("greet")
  })
  it("all seven egg effects and all five species have one mapping", () => {
    expect(EGG_CONFIG.map(c => c.effect)).toEqual(["orbit_ring", "evolved_core", "node_ring", "analysis_ring", "conflict_cross", "balanced_orbit", "pre_hatch"])
    expect(EGG_CONFIG[5].floatAmplitude).toBe(2)
    expect(Object.keys(MASCOT_MANIFEST)).toHaveLength(5)
    expect(clampLevel(8)).toBe(6); expect(clampLevel(-1)).toBe(0); expect(clampLevel(NaN)).toBe(0)
  })
})
