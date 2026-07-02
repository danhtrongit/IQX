import { render, screen } from "@testing-library/react"
import React from "react"
import { describe, it, expect } from "vitest"
import { RotationChart } from "./RotationChart"
it("renders a frozen tag + note when frozen", () => {
  render(<RotationChart data={{ sectors_today: [{ name: "Ngân hàng", pct: 1.2 }] }} frozen dataTag="Cuối ngày 30/06" frozenNote="Số cuối ngày · chờ 16:30" />)
  expect(screen.getByText(/Cuối ngày 30\/06/)).toBeInTheDocument()
  expect(screen.getByText(/chờ 16:30/)).toBeInTheDocument()
})
