import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { QuanLyVonBlock } from "./QuanLyVonBlock"
import type { CachKhoiLuong, KhauViLoai, MucTuTin } from "./types"

/** Spec §6.3 worked example: vốn 100tr, VNM 62.400, khẩu vị Cân bằng (20%). */
const base = {
  khauVi: "can_bang" as const,
  vonBanDau: 100_000_000,
  giaVao: 62_400,
}

function setup(
  overrides: Partial<{
    khauVi: KhauViLoai
    mucTuTin: MucTuTin | null
    cachKhoiLuong: CachKhoiLuong | null
    onMucTuTin: (m: MucTuTin) => void
    onCachKhoiLuong: (c: CachKhoiLuong) => void
    onKhoiLuong: (n: number) => void
    onChonKhauVi: (k: KhauViLoai) => void
    dangDoiKhauVi: boolean
  }> = {},
) {
  const props = {
    ...base,
    mucTuTin: null as MucTuTin | null,
    cachKhoiLuong: null as CachKhoiLuong | null,
    onMucTuTin: vi.fn(),
    onCachKhoiLuong: vi.fn(),
    onKhoiLuong: vi.fn(),
    onChonKhauVi: vi.fn(),
    ...overrides,
  }
  render(<QuanLyVonBlock {...props} />)
  return props
}

describe("QuanLyVonBlock (spec §6)", () => {
  /**
   * Mockup `demo-trading/LEVEL 3/iqx-cap3-datlenh.html` vẽ khẩu vị là BA MỨC
   * chọn tại chỗ (`.conf-row` với `trần 10/20/30%`), không phải một dòng
   * read-only kèm link «đổi» mở modal. Bản trước là dòng read-only đó.
   */
  it("hiện 3 mức khẩu vị kèm trần %, đánh dấu mức đang áp, và báo lên khi user đổi", () => {
    const props = setup()
    const group = screen.getByTestId("cap3-khauvi-group")
    expect(within(group).getAllByRole("button")).toHaveLength(3)
    expect(screen.getByTestId("cap3-khauvi-than_trong")).toHaveTextContent("trần 10%")
    expect(screen.getByTestId("cap3-khauvi-can_bang")).toHaveTextContent("trần 20%")
    expect(screen.getByTestId("cap3-khauvi-tan_cong")).toHaveTextContent("trần 30%")
    // Mức đang áp là mức đang bật.
    expect(screen.getByTestId("cap3-khauvi-can_bang")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("cap3-khauvi-tan_cong")).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(screen.getByTestId("cap3-khauvi-tan_cong"))
    expect(props.onChonKhauVi).toHaveBeenCalledWith("tan_cong")
  })

  it("bấm lại ĐÚNG mức đang áp thì không bắn cú ghi nào (khỏi một request vô nghĩa)", () => {
    const props = setup()
    fireEvent.click(screen.getByTestId("cap3-khauvi-can_bang"))
    expect(props.onChonKhauVi).not.toHaveBeenCalled()
  })

  it("khoá 3 nút khẩu vị khi cú ghi đang bay", () => {
    setup({ dangDoiKhauVi: true })
    expect(screen.getByTestId("cap3-khauvi-tan_cong")).toBeDisabled()
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

  /** Nhãn ba cụm — lấy nguyên văn từ mockup, không diễn đạt lại. */
  it("dùng đúng câu chữ mockup cho 3 nhãn cụm", () => {
    setup()
    const block = screen.getByTestId("cap3-quanlyvon")
    expect(block).toHaveTextContent("Khẩu vị rủi ro")
    expect(block).toHaveTextContent("· áp cho mọi lệnh")
    expect(block).toHaveTextContent("Mức độ tự tin của lệnh")
    expect(block).toHaveTextContent("Khối lượng mua — chọn 1 trong 2 cách")
  })

  it("renders the 2 cách khối lượng and reports the choice", () => {
    const props = setup({ mucTuTin: 2 })
    expect(screen.getByTestId("cap3-cach-linh_hoat")).toBeInTheDocument()
    expect(screen.getByTestId("cap3-cach-ky_luat")).toBeInTheDocument()
    // Nút trong thẻ là nút «Chọn cách này» của mockup (`.way .pick`).
    expect(screen.getByTestId("cap3-cach-ky_luat")).toHaveTextContent("Chọn cách này")
    fireEvent.click(screen.getByTestId("cap3-cach-ky_luat"))
    expect(props.onCachKhoiLuong).toHaveBeenCalledWith("ky_luat")
  })

  /**
   * Mockup vẽ `≈ 200` và `≈ 300` CẠNH NHAU — cả hai thẻ đều in con số của
   * mình, vì cái phải so sánh chính là hai con số đó. Bản trước chỉ in một con
   * số duy nhất, sau khi đã chọn.
   */
  it("mỗi thẻ tự in con số của cách đó — so sánh được TRƯỚC khi chọn", () => {
    setup({ mucTuTin: 2 })
    expect(screen.getByTestId("cap3-cach-big-linh_hoat")).toHaveTextContent("≈ 200")
    expect(screen.getByTestId("cap3-cach-big-ky_luat")).toHaveTextContent("≈ 300")
  })

  it("thẻ «theo khẩu vị × tự tin» chưa có số khi chưa chấm tự tin; thẻ «chia đều» thì có ngay", () => {
    setup({ mucTuTin: null })
    expect(screen.getByTestId("cap3-cach-big-linh_hoat")).toHaveTextContent("—")
    expect(screen.getByTestId("cap3-cach-big-ky_luat")).toHaveTextContent("≈ 300")
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
