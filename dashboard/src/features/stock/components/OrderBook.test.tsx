import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { OrderBook } from "./OrderBook"
const { state } = vi.hoisted(() => ({ state: { realtime: false, live: null as unknown, quote: null as unknown } }))
vi.mock("@/features/market-data", () => ({
  useOrderBook: () => state.live,
  useRealtimeStatus: () => state.realtime,
  usePrice: () => ({ data: state.quote, isLoading: false }),
}))
beforeEach(() => {
  state.realtime = false
  state.live = null
  state.quote = { symbol: "FPT", bid: [{ price: 72.4, volume: 231600 }], ask: [{ price: 72.5, volume: 120600 }] }
})
it("renders the price-board depth without waiting forever for a websocket event", () => {
  render(<OrderBook symbol="FPT" />)
  expect(screen.getByText("72,400")).toBeInTheDocument()
  expect(screen.getByText("72,500")).toBeInTheDocument()
  expect(screen.getByText("231.6K")).toBeInTheDocument()
  expect(screen.getByText("Cập nhật định kỳ")).toBeInTheDocument()
})
it("uses live VND prices without multiplying them again", () => {
  state.realtime = true
  state.live = { symbol: "FPT", bids: [{ price: 72600, volume: 100 }], asks: [], time: null }
  render(<OrderBook symbol="FPT" />)
  expect(screen.getByText("72,600")).toBeInTheDocument()
  expect(screen.getByText("Realtime")).toBeInTheDocument()
})
it("does not show the previous stock's depth after navigation", () => {
  render(<OrderBook symbol="VNM" />)
  expect(screen.queryByText("72,400")).not.toBeInTheDocument()
  expect(screen.getByText("Chưa có dữ liệu sổ lệnh cho mã này")).toBeInTheDocument()
})
