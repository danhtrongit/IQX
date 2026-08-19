import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HuntResult } from "./sanMaTypes"

/**
 * Popup kết quả bộ lọc (spec §5.4).
 *
 * ★★ Bốn trạng thái phải TÁCH BẠCH — ba trong số đó KHÔNG được nhìn giống
 * "đã lọc xong, không có mã nào" (luật số 1).
 */
const { resultQuery, addAsync, watchlistData } = vi.hoisted(() => ({
  resultQuery: { current: {} as Record<string, unknown> },
  addAsync: vi.fn(),
  watchlistData: { current: [] as { symbol: string }[] },
}))

vi.mock("./sanMaHooks", () => ({
  useHuntResult: () => resultQuery.current,
  useCap5Watchlist: () => ({ data: watchlistData.current }),
  useAddToCap5Watchlist: () => ({ mutateAsync: addAsync, isPending: false }),
}))
vi.mock("@/shared/http/client", () => ({
  getErrorMessage: (_e: unknown, fallback: string) => Promise.resolve(fallback),
}))

import { HuntResultModal } from "./HuntResultModal"

const OK: HuntResult = {
  ma: "ngoai",
  kha_dung: true,
  ly_do_chua_kha_dung: null,
  tong_so_ma: 23,
  hien_thi_toi_da: 10,
  loc_san: [
    { ma: "hose", ten: "HOSE", ap_dung: true },
    { ma: "thanh_khoan", ten: "thanh khoản ≥1 tỷ/phiên", ap_dung: true },
  ],
  items: [
    { hang: 1, symbol: "HPG", tin_hieu: "+45,2 tỷ ròng · 4/5 phiên" },
    { hang: 2, symbol: "VNM", tin_hieu: "+38,1 tỷ ròng · 5/5 phiên" },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  watchlistData.current = []
  addAsync.mockResolvedValue({})
  resultQuery.current = { data: OK, isLoading: false, isError: false }
})

describe("HuntResultModal — kết quả bình thường", () => {
  it("có khối định nghĩa + dòng minh bạch + top 10 kèm tín hiệu thô", () => {
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    expect(screen.getByText(/khối ngoại mua ròng ≥3\/5 phiên/i)).toBeInTheDocument()
    expect(screen.getByTestId("cap5-hunt-total")).toHaveTextContent(
      "23 mã HOSE thỏa điều kiện · hiện 2 mã NN mua ròng mạnh nhất",
    )
    expect(screen.getByTestId("cap5-hunt-locsan")).toHaveTextContent(
      "Đã lọc: HOSE · thanh khoản ≥1 tỷ/phiên",
    )
    expect(screen.getByText("HPG")).toBeInTheDocument()
    expect(screen.getByText("+45,2 tỷ ròng · 4/5 phiên")).toBeInTheDocument()
  })

  it('bấm "+ Watchlist" gửi kèm nguồn săn rồi đổi thành "✓ Đã thêm"', async () => {
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    fireEvent.click(screen.getAllByText("+ Watchlist")[0])
    await waitFor(() =>
      expect(addAsync).toHaveBeenCalledWith({
        symbol: "HPG",
        hunt_filter: "ngoai",
        hunt_signal: "+45,2 tỷ ròng · 4/5 phiên",
      }),
    )
    expect(await screen.findByText("✓ Đã thêm")).toBeInTheDocument()
  })

  it("mã đã có trong watchlist hiện sẵn «✓ Đã thêm» và không bấm lại được", () => {
    watchlistData.current = [{ symbol: "hpg" }]
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    const added = screen.getByText("✓ Đã thêm")
    expect(added).toBeDisabled()
  })

  it("★ điều kiện lọc sàn máy chủ chưa áp dụng được thì nói thẳng trong popup", () => {
    resultQuery.current = {
      data: {
        ...OK,
        loc_san: [...OK.loc_san, { ma: "canh_bao", ten: "diện cảnh báo", ap_dung: false }],
      },
      isLoading: false,
      isError: false,
    }
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    expect(screen.getByTestId("cap5-hunt-locsan-thieu")).toHaveTextContent(
      "Chưa lọc được: diện cảnh báo",
    )
  })
})

describe("HuntResultModal — LUẬT SỐ 1: bốn trạng thái tách bạch", () => {
  it("★ kha_dung=false → «Chưa đủ dữ liệu» + lý do, KHÔNG có danh sách rỗng và KHÔNG có «0 mã»", () => {
    resultQuery.current = {
      data: {
        ...OK,
        kha_dung: false,
        ly_do_chua_kha_dung: "chưa có endpoint đếm mua ròng theo phiên cho cả sàn",
        tong_so_ma: null,
        items: [],
      },
      isLoading: false,
      isError: false,
    }
    const { container } = render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    const box = screen.getByTestId("cap5-hunt-nodata")
    expect(box).toHaveTextContent("Chưa đủ dữ liệu để chạy bộ lọc này")
    expect(box).toHaveTextContent("chưa có endpoint đếm mua ròng")
    expect(screen.queryByTestId("cap5-hunt-empty")).not.toBeInTheDocument()
    expect(screen.queryByTestId("cap5-hunt-total")).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0 mã\b/)
  })

  it("★ kha_dung=true + rỗng → «Hôm nay không mã nào thỏa điều kiện» (số 0 THẬT)", () => {
    resultQuery.current = {
      data: { ...OK, tong_so_ma: 0, items: [] },
      isLoading: false,
      isError: false,
    }
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    expect(screen.getByTestId("cap5-hunt-empty")).toHaveTextContent(
      "Hôm nay không mã nào thỏa điều kiện",
    )
    expect(screen.queryByTestId("cap5-hunt-nodata")).not.toBeInTheDocument()
  })

  it("★ tong_so_ma=null → «Chưa đếm được tổng», KHÔNG in một con số bịa", () => {
    resultQuery.current = {
      data: { ...OK, tong_so_ma: null },
      isLoading: false,
      isError: false,
    }
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    const total = screen.getByTestId("cap5-hunt-total")
    expect(total).toHaveTextContent("Chưa đếm được tổng số mã")
    expect(total).not.toHaveTextContent("mã HOSE thỏa điều kiện")
  })

  it("★ lỗi máy chủ → câu lỗi, không con số nào", () => {
    resultQuery.current = { data: undefined, isLoading: false, isError: true }
    const { container } = render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    expect(screen.getByTestId("cap5-hunt-error")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\b0 mã\b/)
  })

  it("đang tải → «Đang lọc…», chưa kết luận gì", () => {
    resultQuery.current = { data: undefined, isLoading: true, isError: false }
    render(<HuntResultModal filter="ngoai" onClose={() => {}} />)
    expect(screen.getByText("Đang lọc…")).toBeInTheDocument()
  })

  it("filter=null thì không render popup", () => {
    render(<HuntResultModal filter={null} onClose={() => {}} />)
    expect(screen.queryByTestId("cap5-hunt-total")).not.toBeInTheDocument()
  })
})
