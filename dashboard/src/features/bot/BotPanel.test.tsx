import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { BotPanelView } from "./BotPanel"
import type { BotOverview } from "./types"

const disclosure = "Bot demo IQX mô phỏng mua và bán theo giá đóng cửa của chính phiên tạo tín hiệu. Kết quả không tái hiện đầy đủ khả năng khớp lệnh, thanh khoản và thời gian thanh toán của giao dịch thực tế. Đây không phải cam kết lợi nhuận hoặc khuyến nghị giao dịch tiền thật."

function overview(overrides: Partial<BotOverview> = {}): BotOverview {
  return {
    eligible: true,
    currentLevel: 6,
    cap6GraduatedAt: "2026-09-08T08:00:00Z",
    disclosure,
    bot: {
      strategyId: "iqx_standard",
      strategyVersion: 1,
      executionModel: "same_session_close",
      initialCashVnd: "100000000",
      activatedAt: "2026-09-08T08:01:00Z",
    },
    account: {
      cashVnd: "88000000",
      marketValueVnd: "12000000",
      navVnd: "100000000",
      pnlTotalNetVnd: "0",
      returnTotal: "0",
      valuationComplete: true,
      asOf: "2026-09-14",
    },
    botRun: {
      status: "succeeded",
      latestRunId: "run-1",
      lastUpdatedAt: "2026-09-14T10:00:00Z",
      processedUnseenSessions: 1,
      issues: [],
    },
    ...overrides,
  }
}

describe("BotPanelView", () => {
  it("dùng avatar tĩnh của linh thú trong tiêu đề Bot, không mount animation player thứ hai", () => {
    const view = render(
      <MemoryRouter>
        <BotPanelView
          mascotId="bach_ho"
          overview={overview()}
          positions={[]}
          journal={[]}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    )

    const avatar = view.container.querySelector<HTMLImageElement>("img.mascot-avatar")
    expect(avatar).toHaveAttribute(
      "src",
      "/assets/mascots-2d/v2/bach-ho/avatar-head.webp?v=2.0.1",
    )
    expect(view.container.querySelector(".mascot-2d-stage")).not.toBeInTheDocument()
    expect(view.container.querySelector(".sprite-strip-player")).not.toBeInTheDocument()
  })

  it("render đủ sáu khối read-only và disclosure bắt buộc", () => {
    render(
      <MemoryRouter>
        <BotPanelView overview={overview()} positions={[]} journal={[]} onRefresh={() => undefined} />
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: "Bot của tôi" })).toBeInTheDocument()
    for (const heading of ["Hiệu suất", "Danh mục", "Nhật ký", "Bot hoạt động như thế nào", "Hướng dẫn"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByText("Mô phỏng theo giá đóng cửa")).toBeInTheDocument()
    expect(screen.getByText(disclosure)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mua|bán|nạp|cấp vốn|sửa chiến lược/i })).not.toBeInTheDocument()
  })

  it("nút Làm mới chỉ gọi callback đọc dữ liệu", () => {
    const refresh = vi.fn()
    render(
      <MemoryRouter>
        <BotPanelView overview={overview()} positions={[]} journal={[]} onRefresh={refresh} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Làm mới dữ liệu Bot" }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("không hiển thị NAV hoặc lợi nhuận một phần khi định giá chưa hoàn tất", () => {
    render(
      <MemoryRouter>
        <BotPanelView
          overview={overview({
            account: {
              cashVnd: "88000000",
              marketValueVnd: null,
              navVnd: null,
              pnlTotalNetVnd: null,
              returnTotal: null,
              valuationComplete: false,
              asOf: "2026-09-14",
            },
          })}
          positions={[]}
          journal={[]}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    )

    expect(screen.getAllByText("Chưa định giá")).toHaveLength(3)
    expect(screen.getByText(/NAV chưa định giá đầy đủ/)).toBeInTheDocument()
    expect(screen.getByText("88.000.000 ₫")).toBeInTheDocument()
  })

  it("chưa tốt nghiệp chỉ giải thích eligibility và không tạo Bot từ UI", () => {
    render(
      <MemoryRouter>
        <BotPanelView
          overview={overview({
            eligible: false,
            currentLevel: 5,
            cap6GraduatedAt: null,
            bot: null,
            account: null,
            botRun: { status: "idle", latestRunId: null, lastUpdatedAt: null, processedUnseenSessions: 0, issues: [] },
          })}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: "Mở sau khi tốt nghiệp Cấp 6" })).toBeInTheDocument()
    expect(screen.getByText(/không tạo Bot hoặc cấp vốn/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Hiệu suất" })).not.toBeInTheDocument()
  })

  it("tách giao dịch đã ghi khỏi quyết định bỏ qua và hiển thị issue", () => {
    const view = render(
      <MemoryRouter>
        <BotPanelView
          overview={overview({
            botRun: {
              status: "failed",
              latestRunId: "run-2",
              lastUpdatedAt: "2026-09-14T10:00:00Z",
              processedUnseenSessions: 0,
              issues: [{ code: "missing_official_close", symbol: "VNM", detail: null }],
            },
          })}
          positions={[]}
          journal={[
            {
              id: "buy-1", runId: "run-2", kind: "execution", action: "buy", symbol: "FPT",
              tradingDate: "2026-09-14", executedAt: "2026-09-14T10:00:00Z", qty: 500,
              priceVnd: "20000", thresholdVnd: null, grossValueVnd: "10000000", feeVnd: "10000",
              taxVnd: "0", supportingCount: 4, filterIds: ["ngoai"], reasonCode: "bought",
              reason: "Đã ghi giao dịch mua mô phỏng", issue: null,
            },
            {
              id: "skip-1", runId: "run-2", kind: "decision", action: "skip", symbol: "VNM",
              tradingDate: "2026-09-14", executedAt: null, qty: null, priceVnd: null,
              thresholdVnd: null, grossValueVnd: null, feeVnd: null, taxVnd: null,
              supportingCount: 2, filterIds: [], reasonCode: "missing_layers", reason: null, issue: null,
            },
          ]}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    )
    const journal = within(view.container.querySelector("#bot-journal")!.closest("section")!)
    expect(journal.getByText("Mua")).toBeInTheDocument()
    expect(journal.getByText("Bỏ qua")).toBeInTheDocument()
    expect(journal.getByText("Thiếu dữ liệu năm lớp")).toBeInTheDocument()
    expect(screen.getByText(/VNM: Thiếu giá đóng cửa chính thức/)).toBeInTheDocument()
  })
})
