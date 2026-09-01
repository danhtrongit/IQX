import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Children, cloneElement, isValidElement, type ChangeEvent, type MouseEventHandler, type ReactElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Cap8ExitContext } from "./types"

type ButtonProps = {
  children?: ReactNode
  disabled?: boolean
  loading?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
}
type ModalProps = { children?: ReactNode; visible: boolean }
type RadioProps = { children?: ReactNode; disabled?: boolean; onSelect?: (value: string) => void; value?: string }
type RadioGroupProps = { children?: ReactNode; onChange: (value: string) => void; value: string }
type SliderProps = { max: number; min: number; onChange: (value: number) => void; step: number; value: number }
type InputNumberProps = { onChange: (value: number) => void; value?: number }
type SellInput = { method: "market"; quantity: number; side: "sell"; symbol: string }
type AfterFilled = (order: { id: string }) => Promise<void>

const mocks = vi.hoisted(() => ({
  recordExit: vi.fn(),
  sellMutate: vi.fn(),
  useCap8ExitContext: vi.fn(),
  useCap8ExitImpact: vi.fn(),
  usePlaceOrder: vi.fn(),
  dynamicMutate: vi.fn(),
}))

vi.mock("@arco-design/web-react", () => {
  const Radio = Object.assign(
    ({ children, disabled, onSelect, value }: RadioProps) => (
      <button
        aria-checked={false}
        disabled={disabled}
        onClick={() => value != null && onSelect?.(value)}
        role="radio"
        type="button"
      >
        {children}
      </button>
    ),
    {
      Group: ({ children, onChange }: RadioGroupProps) => (
        <div>
          {Children.map(children, (child) =>
            isValidElement(child)
              ? cloneElement(child as ReactElement<RadioProps>, { onSelect: onChange })
              : child,
          )}
        </div>
      ),
    },
  )
  return {
    Modal: ({ children, visible }: ModalProps) => visible ? <div role="dialog">{children}</div> : null,
    Button: ({ children, disabled, onClick }: ButtonProps) => (
      <button disabled={disabled} onClick={onClick} type="button">{children}</button>
    ),
    Radio,
    Slider: ({ max, min, onChange, step, value }: SliderProps) => (
      <input
        max={max}
        min={min}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value))}
        step={step}
        type="range"
        value={value}
      />
    ),
    InputNumber: ({ onChange, value }: InputNumberProps) => (
      <input
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.currentTarget.value))}
        type="number"
        value={value ?? ""}
      />
    ),
  }
})
vi.mock("@/features/trading", () => ({ usePlaceOrder: mocks.usePlaceOrder }))
vi.mock("./api", () => ({ cap8Api: { recordExit: mocks.recordExit } }))
vi.mock("./hooks", () => ({
  useCap8ExitContext: mocks.useCap8ExitContext,
  useCap8ExitImpact: mocks.useCap8ExitImpact,
  useSetCap8DynamicStop: () => ({
    error: null,
    isError: false,
    isPending: false,
    mutate: mocks.dynamicMutate,
  }),
}))

import { ExitModalCap8 } from "./ExitModalCap8"

const exitContext: Cap8ExitContext = {
  symbol: "HPG",
  quantity_total: 500,
  quantity_sellable: 500,
  avg_cost_vnd: 100,
  current_price_vnd: 105,
  source_buy_order_id: "buy-order",
  original_stop_vnd: 90,
  original_take_profit_vnd: 110,
  dynamic_stop_vnd: null,
  dynamic_stop_set_at: null,
  can_update_dynamic_stop: true,
  board_lot_size: 100,
  proposed_sale_quantity: 500,
  sector_impact: { can_doi_ok: true },
}

function installSellMutation(events?: string[]) {
  mocks.usePlaceOrder.mockImplementation((afterFilled?: AfterFilled) => ({
    error: null,
    isError: false,
    mutate: mocks.sellMutate.mockImplementation((_input: SellInput) => {
      void (async () => {
        try {
          await afterFilled?.({ id: "filled-sell-order" })
        } finally {
          events?.push("trading-cache")
        }
      })()
    }),
  }))
}

function renderModal(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }), onClose = vi.fn()) {
  return {
    onClose,
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ExitModalCap8 onClose={onClose} symbol="HPG" visible />
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  mocks.recordExit.mockReset()
  mocks.sellMutate.mockReset()
  mocks.usePlaceOrder.mockReset()
  mocks.dynamicMutate.mockReset()
  mocks.useCap8ExitContext.mockReset()
  mocks.useCap8ExitContext.mockReturnValue({ data: exitContext, error: null, isLoading: false })
  mocks.useCap8ExitImpact.mockReturnValue({ data: exitContext })
  installSellMutation()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("ExitModalCap8", () => {
  it("shows a nonblocking emotional warning for a profitable full sale below target", () => {
    renderModal()
    expect(screen.getByText(/chưa chạm chốt lời/)).toBeInTheDocument()
  })

  it("submits the entire sellable holding through the existing trading mutation", () => {
    renderModal()
    fireEvent.click(screen.getByRole("button", { name: "Bán toàn bộ" }))
    expect(mocks.sellMutate).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 500, side: "sell", symbol: "HPG" }),
    )
  })

  it("submits a selected board-lot partial sell", () => {
    renderModal()
    fireEvent.click(screen.getByRole("radio", { name: "Bán một phần" }))
    fireEvent.change(screen.getByRole("slider"), { target: { value: "300" } })
    fireEvent.click(screen.getByRole("button", { name: "Bán 300" }))
    expect(mocks.sellMutate).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 300, side: "sell", symbol: "HPG" }),
    )
  })

  it("requests sector impact for the selected full or partial sale quantity", () => {
    renderModal()
    expect(mocks.useCap8ExitImpact).toHaveBeenLastCalledWith("HPG", 500, true)

    fireEvent.click(screen.getByRole("radio", { name: "Bán một phần" }))
    fireEvent.change(screen.getByRole("slider"), { target: { value: "300" } })

    expect(mocks.useCap8ExitImpact).toHaveBeenLastCalledWith("HPG", 300, true)
    expect(screen.getByText(/Dự kiến bán 300 cổ phiếu/)).toBeInTheDocument()
  })

  it("updates a dynamic stop without creating exit evidence", () => {
    renderModal()
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "103" } })
    fireEvent.click(screen.getByRole("button", { name: "Lưu cắt lỗ động" }))
    expect(mocks.dynamicMutate).toHaveBeenCalledWith(103)
    expect(mocks.recordExit).not.toHaveBeenCalled()
  })

  it("renders the exit-context API error", async () => {
    mocks.useCap8ExitContext.mockReturnValue({
      data: undefined,
      error: new Error("Không thể tải kế hoạch"),
      isLoading: false,
    })
    renderModal()
    expect(await screen.findByText("Không thể tải kế hoạch")).toBeInTheDocument()
  })

  it("records evidence and invalidates Level 8 caches before the trading cache refetch", async () => {
    const events: string[] = []
    installSellMutation(events)
    const { onClose, queryClient } = renderModal()
    mocks.recordExit.mockImplementation(async (sellOrderId: string) => {
      events.push(`record:${sellOrderId}`)
      return {}
    })
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async () => {
      events.push("cap8-cache")
    })

    fireEvent.click(screen.getByRole("button", { name: "Bán toàn bộ" }))

    await waitFor(() => expect(events).toEqual([
      "record:filled-sell-order",
      "cap8-cache",
      "cap8-cache",
      "trading-cache",
    ]))
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ["cap8", "progress"] })
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ["cap8", "exit-context", "HPG"] })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("clears completed evidence-retry state before closing so a reopened modal can sell again", async () => {
    mocks.recordExit.mockRejectedValueOnce(new Error("Bằng chứng tạm thời lỗi"))
    const { onClose } = renderModal()

    fireEvent.click(screen.getByRole("button", { name: "Bán toàn bộ" }))

    expect(await screen.findByText("Bằng chứng tạm thời lỗi")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bán toàn bộ" })).toBeDisabled()
    expect(mocks.sellMutate).toHaveBeenCalledTimes(1)

    mocks.recordExit.mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole("button", { name: "Thử ghi nhận lại" }))

    await waitFor(() => expect(mocks.recordExit).toHaveBeenCalledTimes(2))
    expect(mocks.recordExit).toHaveBeenNthCalledWith(1, "filled-sell-order")
    expect(mocks.recordExit).toHaveBeenNthCalledWith(2, "filled-sell-order")
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "Bán toàn bộ" })).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Bán toàn bộ" }))
    expect(mocks.sellMutate).toHaveBeenCalledTimes(2)
  })
})
