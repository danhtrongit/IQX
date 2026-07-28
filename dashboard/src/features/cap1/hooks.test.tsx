import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Same pattern as `cap0/hooks.test.tsx` — mock the ky client only, so every
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
  useCap1Progress,
  useEnterCap1,
  useCompleteCap1Task,
  useRecordKehoach,
  useRecordKetso,
  useGraduateCap1,
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

describe("useCap1Progress", () => {
  it("GETs cap1/progress", async () => {
    get.mockReturnValue(jsonRes(null))
    function Harness() {
      const { data, isSuccess } = useCap1Progress()
      return <div data-testid="out">{isSuccess ? String(data) : "loading"}</div>
    }
    withClient(<Harness />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("cap1/progress"))
  })
})

describe("useEnterCap1", () => {
  it("POSTs cap1/enter", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const enter = useEnterCap1()
      return <button onClick={() => enter.mutate()}>enter</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("enter"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap1/enter"))
  })
})

describe("useCompleteCap1Task", () => {
  it("PATCHes cap1/task with task_no", async () => {
    patch.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const task = useCompleteCap1Task()
      return <button onClick={() => task.mutate(5)}>task</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("task"))
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("cap1/task", { json: { task_no: 5 } }),
    )
  })
})

describe("useRecordKehoach", () => {
  it("POSTs cap1/kehoach with the full Form Kế hoạch payload", async () => {
    post.mockReturnValue(jsonRes({ id: "kh1" }))
    const input = {
      order_id: "order-1",
      lyDo: "dong_tien" as const,
      trangThai_luc_dat: "ung_ho" as const,
      vung_mua: 62_400,
      co_bam_doc_chi_tiet: true,
      snapshot: { foo: "bar" },
    }
    function Harness() {
      const kehoach = useRecordKehoach()
      return <button onClick={() => kehoach.mutate(input)}>kehoach</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("kehoach"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap1/kehoach", { json: input }))
  })
})

describe("useRecordKetso", () => {
  it("POSTs cap1/ketso with order_id + cam_xuc", async () => {
    post.mockReturnValue(jsonRes({ id: "ks1" }))
    function Harness() {
      const ketso = useRecordKetso()
      return (
        <button onClick={() => ketso.mutate({ order_id: "order-1", cam_xuc: "binh_tinh" })}>
          ketso
        </button>
      )
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("ketso"))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("cap1/ketso", {
        json: { order_id: "order-1", cam_xuc: "binh_tinh" },
      }),
    )
  })
})

describe("useGraduateCap1", () => {
  it("POSTs cap1/graduate", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const graduate = useGraduateCap1()
      return <button onClick={() => graduate.mutate()}>graduate</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("graduate"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap1/graduate"))
  })
})
