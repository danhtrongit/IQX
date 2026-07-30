import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { QuanLyVonBlock } from "./QuanLyVonBlock"
import type { CachKhoiLuong, MucTuTin } from "./types"

/** Spec §6.3 worked example: vốn 100tr, VNM 62.400, khẩu vị Cân bằng (20%). */
const base = {
  khauVi: "can_bang" as const,
  vonBanDau: 100_000_000,
  giaVao: 62_400,
}

function setup(
  overrides: Partial<{
    mucTuTin: MucTuTin | null
    cachKhoiLuong: CachKhoiLuong | null
    onMucTuTin: (m: MucTuTin) => void
    onCachKhoiLuong: (c: CachKhoiLuong) => void
    onKhoiLuong: (n: number) => void
    onDoiKhauVi: () => void
  }> = {},
) {
  const props = {
    ...base,
    mucTuTin: null as MucTuTin | null,
    cachKhoiLuong: null as CachKhoiLuong | null,
    onMucTuTin: vi.fn(),
    onCachKhoiLuong: vi.fn(),
    onKhoiLuong: vi.fn(),
    onDoiKhauVi: vi.fn(),
    ...overrides,
  }
  render(<QuanLyVonBlock {...props} />)
  return props
}

describe("QuanLyVonBlock (spec §6)", () => {
  it("shows the current khẩu vị with its trần %, plus a way to change it", () => {
    const props = setup()
    const khauVi = screen.getByTestId("cap3-khauvi-current")
    expect(khauVi).toHaveTextContent("Cân bằng")
    expect(khauVi).toHaveTextContent("20%")
    fireEvent.click(screen.getByTestId("cap3-khauvi-doi"))
    expect(props.onDoiKhauVi).toHaveBeenCalledTimes(1)
  })

  it("renders the 3 mức tự tin and reports the user's own choice", () => {
    const props = setup()
    const group = screen.getByTestId("cap3-tutin-group")
    expect(within(group).getAllByRole("button")).toHaveLength(3)
    fireEvent.click(screen.getByTestId("cap3-tutin-2"))
    expect(props.onMucTuTin).toHaveBeenCalledWith(2)
  })

  // spec §6.2 is explicit: user tự chấm, KHÔNG có AI gợi ý.
  it("does NOT suggest a mức tự tin (no AI hint anywhere in the block)", () => {
    setup()
    const block = screen.getByTestId("cap3-quanlyvon")
    expect(block.textContent ?? "").not.toMatch(/AI|gợi ý mức tự tin|đề xuất mức tự tin/i)
  })

  it("renders the 2 cách khối lượng and reports the choice", () => {
    const props = setup({ mucTuTin: 2 })
    expect(screen.getByTestId("cap3-cach-linh_hoat")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-cach-ky_luat")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("cap3-cach-ky_luat"))
    expect(props.onCachKhoiLuong).toHaveBeenCalledWith("ky_luat")
  })

  it("computes khối lượng live for cách «linh hoạt» × ⭐ (spec: ~200 cp)", () => {
    setup({ mucTuTin: 1, cachKhoiLuong: "linh_hoat" })
    expect(screen.getByTestId("cap3-khoiluong-value")).toHaveTextContent("200")
  })

  it("cách «kỷ luật» ignores mức tự tin (⭐ still ~300 cp at trần 20%)", () => {
    setup({ mucTuTin: 1, cachKhoiLuong: "ky_luat" })
    expect(screen.getByTestId("cap3-khoiluong-value")).toHaveTextContent("300")
  })

  it("shows %vốn thực tế + where the number came from (§C12c)", () => {
    setup({ mucTuTin: 3, cachKhoiLuong: "linh_hoat" })
    const provenance = screen.getByTestId("cap3-khoiluong-provenance")
    expect(provenance).toHaveTextContent("20%")
    expect(provenance.textContent ?? "").toMatch(/100%/)
  })

  it("reports the computed khối lượng + %vốn upward so the panel can auto-fill it", () => {
    const props = setup({ mucTuTin: 3, cachKhoiLuong: "ky_luat" })
    // 300 cp × 62,400 / 100,000,000 = 18.72% vốn thực tế (sau khi làm tròn lô).
    expect(props.onKhoiLuong).toHaveBeenCalledWith(300, expect.closeTo(18.72, 2))
  })

  it("prompts (and computes nothing) until both tự tin + cách are chosen", () => {
    setup({ mucTuTin: null, cachKhoiLuong: null })
    expect(screen.queryByTestId("cap3-khoiluong-value")).not.toBeInTheDocument()
    expect(screen.getByTestId("cap3-khoiluong-prompt")).toBeInTheDocument()
  })
})
