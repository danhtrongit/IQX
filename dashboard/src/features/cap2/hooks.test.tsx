import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Same pattern as `cap1/hooks.test.tsx` — mock the ky client only, so every
// hook under test is the REAL hook (proves the endpoint + payload shape).
const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
vi.mock("@/shared/http/client", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
  },
  unwrap: <T,>(r: T) => r,
}))
vi.mock("@/features/auth", () => ({ useAuth: () => ({ isAuthenticated: true }) }))

import {
  useCap2Progress,
  useEnterCap2,
  useCompleteCap2Task,
  useRecordKehoachCap2,
  useRecordKetsoCap2,
  useDiemKyLuat,
  useGraduateCap2,
} from "./hooks"

function jsonRes(data: unknown) {
  return { json: () => Promise.resolve(data) }
}

function withClient(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
})

describe("useCap2Progress", () => {
  it("GETs cap2/progress", async () => {
    get.mockReturnValue(jsonRes(null))
    function Harness() {
      const { data, isSuccess } = useCap2Progress()
      return <div data-testid="out">{isSuccess ? String(data) : "loading"}</div>
    }
    withClient(<Harness />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("cap2/progress"))
  })
})

describe("useEnterCap2", () => {
  it("POSTs cap2/enter", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const enter = useEnterCap2()
      return <button onClick={() => enter.mutate()}>enter</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("enter"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap2/enter"))
  })
})

describe("useCompleteCap2Task", () => {
  it("PATCHes cap2/task with task_no", async () => {
    patch.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const task = useCompleteCap2Task()
      return <button onClick={() => task.mutate(3)}>task</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("task"))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap2/task", { json: { task_no: 3 } }),
    )
  })
})

describe("useRecordKehoachCap2", () => {
  it("POSTs cap2/kehoach with the SL/TP commitment payload", async () => {
    post.mockReturnValue(jsonRes({ id: "kh1" }))
    const input = {
      order_id: "order-1",
      phuong_phap_sl_tp: "ho_tro_khang_cu" as const,
      cat_lo: 60_400,
      chot_loi: 65_800,
    }
    function Harness() {
      const kehoach = useRecordKehoachCap2()
      return <button onClick={() => kehoach.mutate(input)}>kehoach</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("kehoach"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap2/kehoach", { json: input }))
  })
})

describe("useRecordKetsoCap2", () => {
  it("POSTs cap2/ketso with order_id + discipline flags", async () => {
    post.mockReturnValue(jsonRes({ id: "ks1" }))
    const input = { order_id: "order-1", cham_SL_khong_cat: true, nhoi_lenh_khi_lo: false }
    function Harness() {
      const ketso = useRecordKetsoCap2()
      return <button onClick={() => ketso.mutate(input)}>ketso</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("ketso"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap2/ketso", { json: input }))
  })
})

describe("useDiemKyLuat", () => {
  it("GETs cap2/diem-ky-luat (no ngay param by default)", async () => {
    get.mockReturnValue(jsonRes({ ngay: "2026-07-29", diem: 90 }))
    function Harness() {
      const { data, isSuccess } = useDiemKyLuat()
      return <div>{isSuccess ? String(data?.diem) : "loading"}</div>
    }
    withClient(<Harness />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("cap2/diem-ky-luat"))
  })

  it("GETs cap2/diem-ky-luat with a ngay searchParam when given", async () => {
    get.mockReturnValue(jsonRes({ ngay: "2026-07-01", diem: 70 }))
    function Harness() {
      useDiemKyLuat("2026-07-01")
      return null
    }
    withClient(<Harness />)
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("cap2/diem-ky-luat", {
        searchParams: { ngay: "2026-07-01" },
      }),
    )
  })
})

describe("useGraduateCap2", () => {
  it("POSTs cap2/graduate", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const graduate = useGraduateCap2()
      return <button onClick={() => graduate.mutate()}>graduate</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("graduate"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap2/graduate"))
  })
})
