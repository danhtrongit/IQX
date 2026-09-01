import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Same pattern as `cap2/hooks.test.tsx` — mock the ky client only, so every
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
  useCap3Progress,
  useEnterCap3,
  useSetKhauVi,
  useCompleteCap3Task,
  useRecordKehoachCap3,
  useGraduateCap3,
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

describe("useCap3Progress", () => {
  it("GETs cap3/progress", async () => {
    get.mockReturnValue(jsonRes(null))
    function Harness() {
      const { data, isSuccess } = useCap3Progress()
      return <div data-testid="out">{isSuccess ? String(data) : "loading"}</div>
    }
    withClient(<Harness />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("cap3/progress"))
  })
})

describe("useEnterCap3", () => {
  it("POSTs cap3/enter", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const enter = useEnterCap3()
      return <button onClick={() => enter.mutate()}>enter</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("enter"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap3/enter"))
  })
})

describe("useSetKhauVi", () => {
  it("POSTs cap3/khau-vi with { khau_vi }", async () => {
    post.mockReturnValue(jsonRes({ id: "1", khau_vi: "can_bang" }))
    function Harness() {
      const setKhauVi = useSetKhauVi()
      return <button onClick={() => setKhauVi.mutate("can_bang")}>set</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("set"))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("cap3/khau-vi", { json: { khau_vi: "can_bang" } }),
    )
  })
})

describe("useCompleteCap3Task", () => {
  it("PATCHes cap3/task with task_no", async () => {
    patch.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const task = useCompleteCap3Task()
      return <button onClick={() => task.mutate(2)}>task</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("task"))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap3/task", { json: { task_no: 2 } }),
    )
  })
})

describe("useRecordKehoachCap3", () => {
  it("POSTs cap3/kehoach with the quản lý vốn payload", async () => {
    post.mockReturnValue(jsonRes({ id: "kh1" }))
    const input = {
      order_id: "order-1",
      khau_vi: "can_bang" as const,
      muc_tu_tin: 2 as const,
      cach_khoi_luong: "linh_hoat" as const,
      khoi_luong: 200,
      pct_von: 12.48,
    }
    function Harness() {
      const kehoach = useRecordKehoachCap3()
      return <button onClick={() => kehoach.mutate(input)}>kehoach</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("kehoach"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap3/kehoach", { json: input }))
  })
})


describe("useGraduateCap3", () => {
  it("POSTs cap3/graduate", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const graduate = useGraduateCap3()
      return <button onClick={() => graduate.mutate()}>graduate</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("graduate"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap3/graduate"))
  })
})
