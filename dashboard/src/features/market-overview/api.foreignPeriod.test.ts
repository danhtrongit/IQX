import { expect, it, vi } from "vitest"
import { marketOverviewApi } from "./api"
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/shared/http/client", () => ({ api: { get }, unwrap: (value: { data: unknown }) => value.data }))

it("requests daily foreign flow for the daily market summary instead of the API's yearly default", async () => {
  get.mockReturnValue({ json: async () => ({ data: { total_net_buy_vnd: 100 } }) })
  await marketOverviewApi.getForeignTop()
  expect(get).toHaveBeenCalledWith("market-data/overview/foreign/top", { searchParams: { time_frame: "ONE_DAY" } })
})
