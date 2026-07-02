// MidDayTakeaway.test.tsx
import { render, screen, act } from "@testing-library/react"
import React from "react"
import { it, expect, afterEach, beforeEach } from "vitest"
import { vi } from "vitest"
import { MidDayTakeaway } from "./MidDayTakeaway"
import type { MidDayAnalysis } from "./types"

// Minimal fixture — no scenarios/watchlist needed for the countdown test.
const DATA: MidDayAnalysis = {
  id: "test-1",
  session_date: "2026-07-02",
  session_type: "midday",
  session_type_display: null,
  report_type: "midday",
  headline: "Test headline",
  tagline: { text: "THẬN TRỌNG", color: "neutral" },
  paragraphs: {
    session_structure: { status: "published", content: "<p>a</p>" },
    money_flow: { status: "published", content: "<p>b</p>" },
    market_health: { status: "pending", pending_message: "Cập nhật 16:30", pending_until: "" },
  },
  scenarios: [
    { type: "up", condition: "Vượt 1280", outcome: "Hướng lên 1300", scope: "afternoon_session" },
  ],
  watchlist: [
    { key: "VCB", alert_level: "alert", reason: "Dòng tiền khởi sắc" },
  ],
  unexplained: null,
}

beforeEach(() => {
  // Fix system time to 11:00 so 14:45 is still in the future → pill shows
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 6, 2, 11, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

it("renders the countdown pill with a non-empty value", () => {
  render(<MidDayTakeaway data={DATA} />)
  const pill = screen.getByLabelText(/Còn .* đến 14:45/)
  expect(pill).toBeInTheDocument()
  expect(pill.textContent).toMatch(/\d/)
})

it("stays mounted and does not throw after 60s tick", async () => {
  render(<MidDayTakeaway data={DATA} />)
  // Confirm pill is present before tick
  expect(screen.getByLabelText(/Còn .* đến 14:45/)).toBeInTheDocument()

  // Advance 60 s — triggers the setInterval callback
  await act(async () => {
    vi.advanceTimersByTime(60000)
  })

  // Component should still be mounted after the tick
  expect(screen.getByLabelText(/Còn .* đến 14:45/)).toBeInTheDocument()
})
