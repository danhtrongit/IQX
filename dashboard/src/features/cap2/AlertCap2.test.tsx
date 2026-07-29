import { act, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChamCatLoBanner, NhoiLenhWarning } from "./AlertCap2"

describe("ChamCatLoBanner (spec §8)", () => {
  const base = { symbol: "VNM", catLo: 58_000, giaHienTai: 57_200 }

  it("cuối phiên: nêu mã + ngưỡng cắt lỗ đã chạm, và mời hành động", () => {
    render(<ChamCatLoBanner {...base} phienGiuQuaNguong={0} variant="cuoi_phien" />)
    expect(screen.getByTestId("cap2-alert-chamsl")).toBeInTheDocument()
    // Mã + ngưỡng nằm ở dòng số liệu (tên mã cũng xuất hiện trong câu nhắc bên dưới).
    const figures = screen.getByTestId("cap2-chamsl-figures")
    expect(figures).toHaveTextContent("VNM")
    expect(figures).toHaveTextContent("58,000")
  })

  it("phiên kế: copy khác bản cuối phiên (nhắc lại vì chưa bán)", () => {
    const { container: cuoiPhien } = render(
      <ChamCatLoBanner {...base} phienGiuQuaNguong={0} variant="cuoi_phien" />,
    )
    const { container: phienKe } = render(
      <ChamCatLoBanner {...base} phienGiuQuaNguong={1} variant="phien_ke" />,
    )
    expect(phienKe.textContent).not.toEqual(cuoiPhien.textContent)
  })

  it("câu chữ LEO THANG theo số phiên giữ quá ngưỡng", () => {
    const { container: p1 } = render(
      <ChamCatLoBanner {...base} phienGiuQuaNguong={1} variant="phien_ke" />,
    )
    const { container: p4 } = render(
      <ChamCatLoBanner {...base} phienGiuQuaNguong={4} variant="phien_ke" />,
    )
    expect(p4.textContent).not.toEqual(p1.textContent)
    // Mức nặng nhất phải nêu rõ số phiên đã giữ.
    expect(p4.textContent).toMatch(/4 phiên/)
  })

  it("gọi onBan / onGiuTiep khi user chọn", () => {
    const onBan = vi.fn()
    const onGiuTiep = vi.fn()
    render(
      <ChamCatLoBanner
        {...base}
        phienGiuQuaNguong={2}
        variant="phien_ke"
        onBan={onBan}
        onGiuTiep={onGiuTiep}
      />,
    )
    fireEvent.click(screen.getByText(/Bán ngay/))
    fireEvent.click(screen.getByText(/Giữ tiếp/))
    expect(onBan).toHaveBeenCalledTimes(1)
    expect(onGiuTiep).toHaveBeenCalledTimes(1)
  })
})

describe("NhoiLenhWarning (spec §9 + §10 escalation)", () => {
  const base = { symbol: "HPG", pnlPct: -4.2 }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('level "thuong": xác nhận bấm được ngay', () => {
    const onConfirm = vi.fn()
    render(
      <NhoiLenhWarning {...base} level="thuong" onConfirm={onConfirm} onCancel={vi.fn()} />,
    )
    expect(screen.getByTestId("cap2-nhoilenh-figures")).toHaveTextContent("đang lỗ")
    const btn = screen.getByTestId("cap2-nhoilenh-confirm")
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('level "greyed5s": xác nhận bị khoá 5 giây rồi mở', () => {
    render(
      <NhoiLenhWarning {...base} level="greyed5s" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    const btn = screen.getByTestId("cap2-nhoilenh-confirm")
    expect(btn).toBeDisabled()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByTestId("cap2-nhoilenh-confirm")).not.toBeDisabled()
  })

  it('level "typeToConfirm": chỉ mở khi gõ đúng "Tôi hiểu"', () => {
    render(
      <NhoiLenhWarning {...base} level="typeToConfirm" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    const btn = screen.getByTestId("cap2-nhoilenh-confirm")
    const input = screen.getByTestId("cap2-nhoilenh-input")
    expect(btn).toBeDisabled()
    fireEvent.change(input, { target: { value: "toi hieu" } })
    expect(screen.getByTestId("cap2-nhoilenh-confirm")).toBeDisabled()
    fireEvent.change(input, { target: { value: "Tôi hiểu" } })
    expect(screen.getByTestId("cap2-nhoilenh-confirm")).not.toBeDisabled()
  })

  it("luôn cho phép huỷ (không bao giờ chặn cứng)", () => {
    const onCancel = vi.fn()
    render(
      <NhoiLenhWarning {...base} level="typeToConfirm" onConfirm={vi.fn()} onCancel={onCancel} />,
    )
    fireEvent.click(screen.getByTestId("cap2-nhoilenh-cancel"))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
