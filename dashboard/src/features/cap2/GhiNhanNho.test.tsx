import { act, render, screen } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GhiNhanNho, ghiNhanNhoText, GHI_NHAN_NHO_MS } from "./GhiNhanNho"

describe("ghiNhanNhoText (spec §11)", () => {
  it("returns copy for the chuỗi milestones 10/20/30/50 only", () => {
    expect(ghiNhanNhoText({ kind: "chuoi", chuoi: 10 })).toMatch(/10/)
    expect(ghiNhanNhoText({ kind: "chuoi", chuoi: 20 })).toMatch(/20/)
    expect(ghiNhanNhoText({ kind: "chuoi", chuoi: 30 })).toMatch(/30/)
    expect(ghiNhanNhoText({ kind: "chuoi", chuoi: 50 })).toMatch(/50/)
  })

  it("returns null for a non-milestone chuỗi (no toast spam)", () => {
    expect(ghiNhanNhoText({ kind: "chuoi", chuoi: 7 })).toBeNull()
    expect(ghiNhanNhoText({ kind: "chuoi", chuoi: 11 })).toBeNull()
  })

  it("returns copy for tuần xanh and for a finished nhiệm vụ", () => {
    expect(ghiNhanNhoText({ kind: "tuan_xanh" })).toBeTruthy()
    expect(ghiNhanNhoText({ kind: "nhiem_vu", taskNo: 3 })).toMatch(/3/)
  })
})

describe("GhiNhanNho toast", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("renders the recognition text then auto-dismisses after ~2s", () => {
    const onDone = vi.fn()
    render(<GhiNhanNho event={{ kind: "chuoi", chuoi: 10 }} onDone={onDone} />)
    expect(screen.getByTestId("cap2-ghinhan")).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(GHI_NHAN_NHO_MS)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("renders nothing for a non-milestone event (and finishes immediately)", () => {
    const onDone = vi.fn()
    render(<GhiNhanNho event={{ kind: "chuoi", chuoi: 7 }} onDone={onDone} />)
    expect(screen.queryByTestId("cap2-ghinhan")).not.toBeInTheDocument()
  })

  it("is a light toast — NOT a medal/cabinet (no huy chương wording)", () => {
    render(<GhiNhanNho event={{ kind: "chuoi", chuoi: 20 }} onDone={vi.fn()} />)
    const el = screen.getByTestId("cap2-ghinhan")
    expect(el.textContent).not.toMatch(/huy chương|huân chương/i)
  })
})
