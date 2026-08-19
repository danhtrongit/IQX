import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Same pattern as `cap3/hooks.test.tsx` — mock the ky client only, so every
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
  useCap4Progress,
  useEnterCap4,
  useCompleteCap4Task,
  useRecordKehoachCap4,
  useVuKhiDiemMu,
  useGraduateCap4,
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

describe("useCap4Progress", () => {
  it("GETs cap4/progress", async () => {
    get.mockReturnValue(jsonRes(null))
    function Harness() {
      const { data, isSuccess } = useCap4Progress()
      return <div data-testid="out">{isSuccess ? String(data) : "loading"}</div>
    }
    withClient(<Harness />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("cap4/progress"))
  })

  it("does NOT query when disabled (outside Cấp 4)", async () => {
    get.mockReturnValue(jsonRes(null))
    function Harness() {
      useCap4Progress(false)
      return <div>x</div>
    }
    withClient(<Harness />)
    await new Promise((r) => setTimeout(r, 20))
    expect(get).not.toHaveBeenCalled()
  })
})

describe("useEnterCap4", () => {
  it("POSTs cap4/enter", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const enter = useEnterCap4()
      return <button onClick={() => enter.mutate()}>enter</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("enter"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap4/enter"))
  })
})

describe("useCompleteCap4Task", () => {
  it("PATCHes cap4/task with task_no", async () => {
    patch.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const task = useCompleteCap4Task()
      return <button onClick={() => task.mutate(3)}>task</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("task"))
    await waitFor(() => expect(patch).toHaveBeenCalledWith("cap4/task", { json: { task_no: 3 } }))
  })
})

describe("useRecordKehoachCap4", () => {
  it("POSTs cap4/kehoach with the đọc-5-lớp payload (both JSON blobs)", async () => {
    post.mockReturnValue(jsonRes({ id: "kh1" }))
    const input = {
      order_id: "order-1",
      doc_5_lop: {
        ky_thuat: "ok",
        dong_tien: "ok",
        noi_bo: "neu",
        tin_tuc: "bad",
        dinh_gia: "ok",
      },
      ai_5_lop: {
        ky_thuat: "ok",
        dong_tien: "neu",
        noi_bo: "neu",
        tin_tuc: "bad",
        dinh_gia: "bad",
      },
      so_lop_dong_thuan: 1,
      so_lop_khac_ai: 2,
    } as const
    function Harness() {
      const kehoach = useRecordKehoachCap4()
      return <button onClick={() => kehoach.mutate(input)}>kehoach</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("kehoach"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap4/kehoach", { json: input }))
  })
})

describe("useVuKhiDiemMu", () => {
  it("GETs cap4/vu-khi-diem-mu", async () => {
    get.mockReturnValue(jsonRes({ lop: [] }))
    function Harness() {
      const { data, isSuccess } = useVuKhiDiemMu()
      return <div>{isSuccess ? String(data?.lop.length) : "loading"}</div>
    }
    withClient(<Harness />)
    await waitFor(() => expect(get).toHaveBeenCalledWith("cap4/vu-khi-diem-mu"))
  })
})

// `useThachThucCap4` / `GET /cap4/thach-thuc` đã bị GỠ cùng khối "Thách thức
// Thuần thục" (Cấp 4 chỉ còn 1 nhiệm vụ) — không còn hook nào để canh ở đây.

describe("useGraduateCap4", () => {
  it("POSTs cap4/graduate", async () => {
    post.mockReturnValue(jsonRes({ id: "1" }))
    function Harness() {
      const graduate = useGraduateCap4()
      return <button onClick={() => graduate.mutate()}>graduate</button>
    }
    withClient(<Harness />)
    fireEvent.click(screen.getByText("graduate"))
    await waitFor(() => expect(post).toHaveBeenCalledWith("cap4/graduate"))
  })
})
