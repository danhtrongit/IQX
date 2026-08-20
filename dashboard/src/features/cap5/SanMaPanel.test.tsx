import { act, fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SanMaIndex } from "./sanMaTypes"

/**
 * Màn Săn mã (spec §5) — bài canh chính là LUẬT SỐ 1: một bộ lọc thiếu dữ liệu
 * phải NÓI THẲNG "chưa đủ dữ liệu", tuyệt đối không được mở ra một popup rỗng
 * trông như "đã lọc xong, 0 mã".
 */
const { indexQuery, setActivePanelMock, cap5Active, progressRef, markTourMutate } = vi.hoisted(
  () => ({
    indexQuery: { current: {} as Record<string, unknown> },
    setActivePanelMock: vi.fn(),
    cap5Active: { current: true },
    progressRef: { current: null as Record<string, unknown> | null },
    markTourMutate: vi.fn(),
  }),
)

vi.mock("./sanMaHooks", () => ({
  useSanMaIndex: () => indexQuery.current,
  useHuntResult: () => ({ data: undefined, isLoading: true, isError: false }),
  useCap5Watchlist: () => ({ data: [] }),
  useAddToCap5Watchlist: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock("./Cap5Context", () => ({
  useCap5Events: () => ({ isCap5Active: cap5Active.current }),
}))
vi.mock("@/shared/contexts/sidebar-context", () => ({
  useSidebar: () => ({ setActivePanel: setActivePanelMock }),
}))
vi.mock("./hooks", () => ({
  useCap5Progress: () => ({ data: progressRef.current }),
  useMarkTourSanMa: () => ({ mutate: markTourMutate, isPending: false }),
}))

import { SanMaPanel } from "./SanMaPanel"

const FULL_INDEX: SanMaIndex = {
  loc_san: [
    { ma: "hose", ten: "mã HOSE", ap_dung: true },
    { ma: "thanh_khoan", ten: "thanh khoản ≥1 tỷ/phiên", ap_dung: true },
    { ma: "gia", ten: "giá ≥3.000đ", ap_dung: true },
  ],
  bo_loc: [
    { ma: "ngoai", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "tudoanh", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "kl", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "dinh", kha_dung: true, ly_do_chua_kha_dung: null },
    { ma: "tang", kha_dung: true, ly_do_chua_kha_dung: null },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  cap5Active.current = true
  // Mặc định: server nói đã xem tour ⇒ tour KHÔNG tự bật, các bài khác không bị
  // overlay che.
  progressRef.current = { da_xem_tour_sanma: true }
  indexQuery.current = { data: FULL_INDEX, isLoading: false, isError: false }
})

describe("SanMaPanel — 5 bộ lọc + lọc sàn (spec §5, mockup iqx-cap5-sanma.html)", () => {
  it("hiện đủ 5 bộ lọc, đúng tên mockup", () => {
    render(<SanMaPanel />)
    for (const ten of [
      "Khối ngoại gom",
      "Tự doanh gom",
      "Khối lượng đột biến",
      "Vượt đỉnh 20 phiên",
      "Tăng mạnh + KL cao",
    ]) {
      expect(screen.getByText(ten)).toBeInTheDocument()
    }
  })

  it("mỗi bộ lọc ghi rõ điều kiện ngay bên dưới (spec §5.3)", () => {
    render(<SanMaPanel />)
    expect(screen.getAllByText("Mua ròng ≥3/5 phiên · tổng 5 phiên > 0")).toHaveLength(2)
    expect(screen.getByText("KL phiên ≥2× trung bình 20 phiên")).toBeInTheDocument()
    expect(screen.getByText("Giá đóng cửa > đỉnh 20 phiên trước")).toBeInTheDocument()
    expect(screen.getByText("Tăng ≥3% · KL ≥1,5× trung bình 20 phiên")).toBeInTheDocument()
  })

  it("dòng lọc sàn đọc từ máy chủ, không hard-code", () => {
    render(<SanMaPanel />)
    const note = screen.getByTestId("cap5-sanma-locsan")
    expect(note).toHaveTextContent("mã HOSE · thanh khoản ≥1 tỷ/phiên · giá ≥3.000đ")
    expect(note).toHaveTextContent("top 10")
    expect(screen.queryByTestId("cap5-sanma-locsan-thieu")).not.toBeInTheDocument()
  })

  it("★ điều kiện lọc sàn máy chủ CHƯA áp dụng được thì nói thẳng", () => {
    indexQuery.current = {
      data: {
        ...FULL_INDEX,
        loc_san: [
          ...FULL_INDEX.loc_san,
          { ma: "canh_bao", ten: "loại mã diện cảnh báo/kiểm soát", ap_dung: false },
        ],
      },
      isLoading: false,
      isError: false,
    }
    render(<SanMaPanel />)
    expect(screen.getByTestId("cap5-sanma-locsan-thieu")).toHaveTextContent(
      "Chưa lọc được: loại mã diện cảnh báo/kiểm soát",
    )
  })

  it("★ lúc chưa tải xong KHÔNG khẳng định đã lọc gì", () => {
    indexQuery.current = { data: undefined, isLoading: true, isError: false }
    render(<SanMaPanel />)
    expect(screen.getByTestId("cap5-sanma-locsan")).toHaveTextContent("Đang kiểm tra")
  })

  it("★ lỗi tải KHÔNG biến thành «đã lọc HOSE …»", () => {
    indexQuery.current = { data: undefined, isLoading: false, isError: true }
    render(<SanMaPanel />)
    const note = screen.getByTestId("cap5-sanma-locsan")
    expect(note).toHaveTextContent("Chưa lấy được điều kiện lọc sàn")
    expect(note).not.toHaveTextContent("≥1 tỷ/phiên")
  })
})

describe("SanMaPanel — LUẬT SỐ 1: bộ lọc thiếu dữ liệu", () => {
  beforeEach(() => {
    indexQuery.current = {
      data: {
        ...FULL_INDEX,
        bo_loc: [
          ...FULL_INDEX.bo_loc.filter((b) => b.ma !== "tudoanh"),
          {
            ma: "tudoanh",
            kha_dung: false,
            ly_do_chua_kha_dung: "chưa có dữ liệu tự doanh theo phiên",
          },
        ],
      },
      isLoading: false,
      isError: false,
    }
  })

  it("★ hiện «Chưa đủ dữ liệu» + lý do NGUYÊN VĂN của máy chủ", () => {
    render(<SanMaPanel />)
    const box = screen.getByTestId("cap5-sanma-nodata-tudoanh")
    expect(box).toHaveTextContent("Chưa đủ dữ liệu để chạy bộ lọc này")
    expect(box).toHaveTextContent("chưa có dữ liệu tự doanh theo phiên")
  })

  it("★ KHÔNG hiện «0 mã» ở bất kỳ đâu trên màn", () => {
    const { container } = render(<SanMaPanel />)
    expect(container.textContent).not.toMatch(/\b0 mã\b/)
  })

  it("★ bộ lọc thiếu dữ liệu KHÔNG bấm được → không mở popup rỗng", () => {
    render(<SanMaPanel />)
    const btn = screen.getByTestId("cap5-sanma-filter-tudoanh")
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(screen.queryByText("🏦 Tự doanh gom")).not.toBeInTheDocument()
  })

  it("bộ lọc còn lại vẫn bấm được và mở popup", () => {
    render(<SanMaPanel />)
    const btn = screen.getByTestId("cap5-sanma-filter-ngoai")
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(screen.getByText("💰 Khối ngoại gom")).toBeInTheDocument()
  })
})

describe("SanMaPanel — bộ lọc nâng cao KHÓA (spec §5.5, hệ mở)", () => {
  it("nói thẳng «mở khóa ở các cấp sau», không phải nút bấm được", () => {
    render(<SanMaPanel />)
    const row = screen.getByTestId("cap5-sanma-locked")
    expect(row).toHaveTextContent("Bộ lọc nâng cao")
    expect(row).toHaveTextContent("mở khóa ở các cấp sau")
    expect(row.tagName).not.toBe("BUTTON")
  })
})

describe("SanMaPanel — ở TRONG shell cấp (luật số 5)", () => {
  it("«Xem Watchlist →» chỉ đổi panel, KHÔNG điều hướng", () => {
    render(<SanMaPanel />)
    fireEvent.click(screen.getByText("Xem Watchlist →"))
    expect(setActivePanelMock).toHaveBeenCalledWith("cap5-watchlist")
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   TOUR SĂN MÃ (spec §7 · `tour/configs/sanMaTour.ts`)
   ══════════════════════════════════════════════════════════════════════════ */
describe("SanMaPanel — tour Săn mã", () => {
  it("có nút mở lại tour bất cứ lúc nào", () => {
    render(<SanMaPanel />)
    expect(screen.getByRole("button", { name: /Hướng dẫn/ })).toBeInTheDocument()
  })

  it("bấm nút → tour chạy từ bước 1", () => {
    render(<SanMaPanel />)
    fireEvent.click(screen.getByRole("button", { name: /Hướng dẫn/ }))
    expect(screen.getByText("Săn mã — chủ động đi tìm cơ hội")).toBeInTheDocument()
  })

  it("★ server nói CHƯA xem → tour tự bật lần đầu vào màn", () => {
    progressRef.current = { da_xem_tour_sanma: false }
    render(<SanMaPanel />)
    expect(screen.getByText("Săn mã — chủ động đi tìm cơ hội")).toBeInTheDocument()
  })

  it("★ server nói ĐÃ xem → KHÔNG tự bật", () => {
    progressRef.current = { da_xem_tour_sanma: true }
    render(<SanMaPanel />)
    expect(screen.queryByText("Săn mã — chủ động đi tìm cơ hội")).not.toBeInTheDocument()
  })

  it("★ chưa biết cờ (chưa tải / wire cũ) → KHÔNG tự bật", () => {
    progressRef.current = null
    render(<SanMaPanel />)
    expect(screen.queryByText("Săn mã — chủ động đi tìm cơ hội")).not.toBeInTheDocument()
  })

  it("★ «Bỏ qua» giữa chừng KHÔNG ghi cờ đã xem (spec §7)", () => {
    render(<SanMaPanel />)
    fireEvent.click(screen.getByRole("button", { name: /Hướng dẫn/ }))
    fireEvent.click(screen.getByRole("button", { name: /Bỏ qua/ }))
    expect(markTourMutate).not.toHaveBeenCalled()
  })

  // ★ `TourOverlay` chặn double-click bằng cờ `busy`, chỉ được xoá sau một
  // `setTimeout` thật (`TRANSITION_MS`/`SCROLL_SETTLE_MS`) — nên phải chạy đồng
  // hồ giả giữa hai lần bấm, nếu không tour đứng mãi ở bước 2 (đã kiểm chứng).
  it("★ đi HẾT 7 bước → mới ghi cờ đã xem", () => {
    vi.useFakeTimers()
    try {
      render(<SanMaPanel />)
      fireEvent.click(screen.getByRole("button", { name: /Hướng dẫn/ }))
      for (let i = 0; i < 6; i++) {
        fireEvent.click(screen.getByRole("button", { name: /Tiếp theo/ }))
        act(() => {
          vi.advanceTimersByTime(2000)
        })
      }
      expect(screen.getByText("Bạn đã sẵn sàng đi săn")).toBeInTheDocument()
      expect(markTourMutate).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: /Hoàn thành/ }))
      expect(markTourMutate).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
