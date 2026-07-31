import { fireEvent, render, screen, within } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Trạng thái hook `useVerdictGoiY` do test điều khiển (3 trạng thái query:
 * đang tải / lỗi / có dữ liệu) — cùng cách `Cap4PortfolioAnalysis.test.tsx` làm.
 */
const { verdictQuery } = vi.hoisted(() => ({
  verdictQuery: { current: {} as Record<string, unknown> },
}))

vi.mock("./hooks", () => ({
  useVerdictGoiY: () => verdictQuery.current,
}))

import { PhanLoai4O } from "./PhanLoai4O"
import { VERDICT_LABEL, type Verdict, type VerdictGoiY } from "./types"

const AGREE_LABEL = "✔ Đồng ý"
const DIFFER_LABEL = "✎ Tôi thấy khác →"
const QUESTION = "🔍 QUYẾT ĐỊNH NÀY ĐÚNG HAY SAI — ĐỘC LẬP VỚI LÃI/LỖ?"

/** 3 tín hiệu: 1 đạt · 1 trượt · 1 CHƯA RÕ (`dat === null`). */
function goiY(overrides: Partial<VerdictGoiY> = {}): VerdictGoiY {
  return {
    order_id: "o1",
    verdict: "dung",
    giai_thich: "Có cơ sở lúc đặt, tôn trọng cắt lỗ, khối lượng khớp mức tự tin.",
    signals: [
      {
        ma: "co_so",
        ten: "Cơ sở khi đặt lệnh",
        dat: true,
        giai_thich: "4/5 lớp bạn đọc là Ủng hộ lúc đặt",
      },
      {
        ma: "ton_trong_sl",
        ten: "Tôn trọng cắt lỗ",
        dat: false,
        giai_thich: "Giá chạm ngưỡng cắt lỗ mà lệnh vẫn giữ thêm 3 phiên",
      },
      {
        ma: "khoi_luong",
        ten: "Khối lượng khớp mức tự tin",
        dat: null,
        giai_thich: "Lệnh này không ghi mức tự tin nên chưa chấm được",
      },
    ],
    pnl_pct: 5.4,
    thang: true,
    o_4_du_kien: "dung_thang",
    ...overrides,
  }
}

function renderBlock(onSettled: ReturnType<typeof vi.fn> = vi.fn()) {
  render(<PhanLoai4O orderId="o1" onSettled={onSettled} />)
  return onSettled
}

/** Lần báo lên cha gần nhất — `[verdictUser, lyDoSua]`. */
function lastSettled(onSettled: ReturnType<typeof vi.fn>) {
  const { calls } = onSettled.mock
  return calls[calls.length - 1] as [Verdict | null, string | null]
}

function typeReason(text: string) {
  fireEvent.change(screen.getByTestId("cap5-phanloai-reason-input"), { target: { value: text } })
}

beforeEach(() => {
  verdictQuery.current = { data: goiY(), isPending: false, isError: false }
})

describe("PhanLoai4O — câu hỏi + verdict hệ + provenance (spec §4, §C12c)", () => {
  it("hiện đúng câu hỏi «đúng hay sai — độc lập lãi/lỗ»", () => {
    renderBlock()
    expect(screen.getByTestId("cap5-phanloai-q").textContent).toBe(QUESTION)
  })

  it("hiện verdict hệ GỢI Ý bằng nhãn của spec + câu giải thích", () => {
    renderBlock()
    const verdict = screen.getByTestId("cap5-phanloai-verdict-he")
    expect(verdict.textContent).toContain(VERDICT_LABEL.dung)
    expect(verdict.textContent).toMatch(/gợi ý/i)
    expect(screen.getByTestId("cap5-phanloai-giai-thich").textContent).toBe(
      "Có cơ sở lúc đặt, tôn trọng cắt lỗ, khối lượng khớp mức tự tin.",
    )
  })

  it("verdict SAI hiện nhãn SAI, không phải nhãn ĐÚNG", () => {
    verdictQuery.current = { data: goiY({ verdict: "sai" }), isPending: false, isError: false }
    renderBlock()
    const verdict = screen.getByTestId("cap5-phanloai-verdict-he")
    expect(verdict.textContent).toContain(VERDICT_LABEL.sai)
    expect(verdict.textContent).not.toContain(VERDICT_LABEL.dung)
  })

  it("liệt kê NGUYÊN VĂN mọi tín hiệu (tên + giải thích), không rút gọn", () => {
    renderBlock()
    const list = within(screen.getByTestId("cap5-phanloai-why"))
    expect(list.getAllByRole("listitem")).toHaveLength(3)

    for (const s of goiY().signals) {
      const row = within(screen.getByTestId(`cap5-phanloai-signal-${s.ma}`))
      expect(row.getByText(s.ten)).toBeInTheDocument()
      expect(screen.getByTestId(`cap5-phanloai-signal-${s.ma}`).textContent).toContain(
        s.giai_thich,
      )
    }
  })

  it("tín hiệu đạt / trượt có dấu khác nhau", () => {
    renderBlock()
    const dat = screen.getByTestId("cap5-phanloai-mark-co_so").textContent ?? ""
    const truot = screen.getByTestId("cap5-phanloai-mark-ton_trong_sl").textContent ?? ""
    expect(dat).not.toBe(truot)
    expect(dat.trim().length).toBeGreaterThan(0)
    expect(truot.trim().length).toBeGreaterThan(0)
  })

  it("tín hiệu `dat: null` hiện «chưa rõ» — KHÔNG hiện như đã đạt", () => {
    renderBlock()
    const row = screen.getByTestId("cap5-phanloai-signal-khoi_luong")
    const mark = screen.getByTestId("cap5-phanloai-mark-khoi_luong").textContent ?? ""
    const markDat = screen.getByTestId("cap5-phanloai-mark-co_so").textContent ?? ""

    expect(mark).not.toBe(markDat)
    expect(row.textContent).toMatch(/chưa rõ/i)
    // giải thích vẫn hiện dù chưa chấm được
    expect(row.textContent).toContain("Lệnh này không ghi mức tự tin nên chưa chấm được")
  })

  it("danh sách tín hiệu KHÔNG bị ẩn sau khi user đã chốt (§C12c)", () => {
    renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(screen.getByTestId("cap5-phanloai-why")).toBeInTheDocument()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(screen.getByTestId("cap5-phanloai-why")).toBeInTheDocument()
  })

  it("hiện 2 nút của spec: Đồng ý / Tôi thấy khác", () => {
    renderBlock()
    expect(screen.getByTestId("cap5-phanloai-dong-y").textContent).toContain(AGREE_LABEL)
    expect(screen.getByTestId("cap5-phanloai-khac").textContent).toContain(DIFFER_LABEL)
  })
})

describe("PhanLoai4O — chốt verdict báo lên cha (cổng nút đóng)", () => {
  it("mới mở: chưa chốt gì → báo (null, null) để cha khoá nút đóng", () => {
    const onSettled = renderBlock()
    expect(lastSettled(onSettled)).toEqual([null, null])
    expect(screen.queryByTestId("cap5-phanloai-reason-input")).not.toBeInTheDocument()
  })

  it("Đồng ý → chốt verdict hệ, KHÔNG cần lý do", () => {
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(lastSettled(onSettled)).toEqual(["dung", null])
    expect(screen.queryByTestId("cap5-phanloai-reason-input")).not.toBeInTheDocument()
  })

  it("Đồng ý với verdict hệ SAI → chốt «sai» (không đảo chiều)", () => {
    verdictQuery.current = { data: goiY({ verdict: "sai" }), isPending: false, isError: false }
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(lastSettled(onSettled)).toEqual(["sai", null])
  })

  it("Tôi thấy khác → ĐẢO verdict + hiện ô lý do bắt buộc", () => {
    renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(screen.getByTestId("cap5-phanloai-verdict-user").textContent).toContain(
      VERDICT_LABEL.sai,
    )
    expect(screen.getByTestId("cap5-phanloai-reason-input")).toBeInTheDocument()
  })

  it("đảo verdict mà CHƯA ghi lý do → chưa báo verdict nào lên cha (mirror 422 của server)", () => {
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(lastSettled(onSettled)).toEqual([null, null])
    expect(onSettled.mock.calls.every((c) => c[0] === null)).toBe(true)
  })

  it("lý do chỉ có khoảng trắng vẫn coi là chưa chốt", () => {
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    typeReason("    ")
    expect(lastSettled(onSettled)).toEqual([null, null])
    expect(onSettled.mock.calls.every((c) => c[0] === null)).toBe(true)
  })

  it("ghi lý do → báo verdict ĐẢO + lý do lên cha", () => {
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    typeReason("tôi vào theo tin đồn, dù lớp ủng hộ")
    expect(lastSettled(onSettled)).toEqual(["sai", "tôi vào theo tin đồn, dù lớp ủng hộ"])
  })

  it("xoá lý do sau khi đã ghi → khoá cổng lại", () => {
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    typeReason("vào theo tin đồn")
    expect(lastSettled(onSettled)).toEqual(["sai", "vào theo tin đồn"])
    typeReason("")
    expect(lastSettled(onSettled)).toEqual([null, null])
  })

  it("verdict hệ SAI + Tôi thấy khác → đảo thành «dung» kèm lý do", () => {
    verdictQuery.current = { data: goiY({ verdict: "sai" }), isPending: false, isError: false }
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    typeReason("tôi vẫn giữ đúng kế hoạch")
    expect(lastSettled(onSettled)).toEqual(["dung", "tôi vẫn giữ đúng kế hoạch"])
  })

  it("quay lại Đồng ý → ô lý do mất, chốt lại verdict hệ không cần lý do", () => {
    const onSettled = renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    typeReason("vào theo tin đồn")
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))

    expect(screen.queryByTestId("cap5-phanloai-reason-input")).not.toBeInTheDocument()
    expect(lastSettled(onSettled)).toEqual(["dung", null])
  })

  it("nút đang chọn có aria-pressed đúng", () => {
    renderBlock()
    fireEvent.click(screen.getByTestId("cap5-phanloai-khac"))
    expect(screen.getByTestId("cap5-phanloai-khac")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("cap5-phanloai-dong-y")).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(screen.getByTestId("cap5-phanloai-dong-y"))
    expect(screen.getByTestId("cap5-phanloai-dong-y")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("cap5-phanloai-khac")).toHaveAttribute("aria-pressed", "false")
  })
})

describe("PhanLoai4O — đang tải / lỗi (fail-closed)", () => {
  it("đang tải → placeholder, không nút chốt, báo (null, null)", () => {
    verdictQuery.current = { data: undefined, isPending: true, isError: false }
    const onSettled = renderBlock()
    expect(screen.getByTestId("cap5-phanloai-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("cap5-phanloai-verdict-he")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-phanloai-dong-y")).not.toBeInTheDocument()
    expect(lastSettled(onSettled)).toEqual([null, null])
  })

  it("lỗi tải → nói thẳng chưa lấy được verdict, báo (null, null) để cha vẫn khoá nút đóng", () => {
    verdictQuery.current = { data: undefined, isPending: false, isError: true }
    const onSettled = renderBlock()
    expect(screen.getByTestId("cap5-phanloai-error").textContent).toMatch(/chưa lấy được/i)
    expect(screen.queryByTestId("cap5-phanloai-dong-y")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-phanloai-why")).not.toBeInTheDocument()
    expect(lastSettled(onSettled)).toEqual([null, null])
  })
})
