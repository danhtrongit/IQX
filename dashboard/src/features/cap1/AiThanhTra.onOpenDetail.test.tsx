import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ★★ «Đọc chi tiết lớp này →» là cú ném-ra 100%.
 *
 * `AiThanhTra` CHỈ render khi một lý do đã được chọn trong Form Kế hoạch —
 * tức chỉ tồn tại bên trong shell cấp (Cấp 1,2,3,5,6,7,8). Nên mọi lần bấm nút
 * này đều là một cú rời `/dau-truong`, ngay giữa lúc user đang điền kế hoạch:
 * lý do / vùng mua / SL-TP đang gõ dở nằm trong state của `TradingPanel` và
 * mất trắng. Tệ hơn, ở Cấp 1 cú bấm đó còn bắn `onDocChiTietClicked` — user
 * vừa hoàn thành một phần nhiệm vụ vừa bị đá ra.
 *
 * Quyết định "mở ở đâu" chuyển lên host qua `onOpenDetail`. Không truyền thì
 * giữ nguyên `navigate` (bài cũ trong `AiThanhTra.test.tsx` canh chiều đó).
 */

const navigateMock = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigateMock }))

const stockAiInsightMock = vi.fn()
vi.mock("@/features/stock", () => ({
  useStockAiInsight: (...args: unknown[]) => stockAiInsightMock(...args),
}))
vi.mock("@/features/stock/bctc-dashboard", () => ({
  useBctcDashboard: () => ({ data: undefined, isLoading: false, isError: false }),
}))

import { AiThanhTra } from "./AiThanhTra"

/** Lớp L1 ở mức "ủng hộ" — đủ để `degraded=false`, tức nút chi tiết hiện ra. */
function mockInsightOk() {
  stockAiInsightMock.mockReturnValue({
    insight: {
      layers: {
        L1: {
          layerNum: "L1",
          layerName: "Xu hướng",
          statusLabel: "Mạnh",
          statusLevel: 4,
          fields: [{ label: "Xu hướng", value: [{ type: "text", content: "Tăng" }] }],
          diff: { text: [], hasChange: false },
        },
      },
    },
    analyze: vi.fn(),
    isPending: false,
    isError: false,
  })
}

describe("AiThanhTra — onOpenDetail", () => {
  beforeEach(() => {
    navigateMock.mockReset()
    stockAiInsightMock.mockReset()
  })

  it("★★ có onOpenDetail (trong shell cấp): mở chi tiết TẠI CHỖ, KHÔNG navigate", () => {
    mockInsightOk()
    const onOpenDetail = vi.fn()
    const onDocChiTiet = vi.fn()
    render(
      <AiThanhTra
        symbol="VNM"
        lyDo="ky_thuat"
        currentPrice={62_400}
        onDocChiTiet={onDocChiTiet}
        onOpenDetail={onOpenDetail}
      />,
    )

    fireEvent.click(screen.getByText("Đọc chi tiết lớp này →"))

    expect(onOpenDetail).toHaveBeenCalledWith("VNM")
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it("★★ sự kiện nhiệm vụ Cấp 1 vẫn bắn — bản vá không được nuốt onDocChiTiet", () => {
    mockInsightOk()
    const onDocChiTiet = vi.fn()
    render(
      <AiThanhTra
        symbol="VNM"
        lyDo="ky_thuat"
        currentPrice={62_400}
        onDocChiTiet={onDocChiTiet}
        onOpenDetail={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText("Đọc chi tiết lớp này →"))

    expect(onDocChiTiet).toHaveBeenCalledTimes(1)
  })

  it("★★ KHÔNG có onOpenDetail: giữ nguyên navigate('/co-phieu/:sym') cho mọi callsite khác", () => {
    mockInsightOk()
    render(<AiThanhTra symbol="VNM" lyDo="ky_thuat" currentPrice={62_400} />)

    fireEvent.click(screen.getByText("Đọc chi tiết lớp này →"))

    expect(navigateMock).toHaveBeenCalledWith("/co-phieu/VNM")
  })
})
