import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `useKiemTraCap8`'s DEBOUNCE (BE report concern 3).
 *
 * `GET /cap8/kiem-tra` costs O(vị thế) price lookups plus a bounded O(n²) set of
 * correlation history fetches. The volume field it hangs off fires `onChange`
 * per keystroke, so an undebounced hook would fan a handful of the most
 * expensive read in the level out of a single edit.
 */

const getKiemTraMock = vi.fn()
vi.mock("./api", () => ({
  cap8Api: {
    getKiemTra: (...a: unknown[]) => getKiemTraMock(...a),
  },
}))
vi.mock("@/features/auth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}))

import { Cap8Provider } from "./Cap8Context"
import { KIEM_TRA_DEBOUNCE_MS, useKiemTraCap8 } from "./hooks"
import { KiemTraDanhMucBlock } from "./KiemTraDanhMucBlock"
import type { KiemTraInputCap8 } from "./types"

const RESPONSE = { symbol: "VCB", canh_bao: [] }

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const INPUT: KiemTraInputCap8 = { symbol: "VCB", khoiLuong: 100, gia: 62_400, catLo: null }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  getKiemTraMock.mockReset()
  getKiemTraMock.mockResolvedValue(RESPONSE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("useKiemTraCap8 — debounce (bước kiểm tra RẤT đắt)", () => {
  it("có một hằng số debounce dương", () => {
    expect(KIEM_TRA_DEBOUNCE_MS).toBeGreaterThan(0)
  })

  it("★ gõ 4 lần liên tiếp vào ô khối lượng → CHỈ 1 request sau khi ngừng gõ", async () => {
    const { rerender } = renderHook((input: KiemTraInputCap8) => useKiemTraCap8(input), {
      wrapper,
      initialProps: INPUT,
    })
    // Lần fetch đầu (lúc mount) là hợp lệ — panel vừa mở thì phải có kết quả.
    await waitFor(() => expect(getKiemTraMock).toHaveBeenCalledTimes(1))
    getKiemTraMock.mockClear()

    // Gõ "1000": 100 → 1 → 10 → 100 → 1000, mỗi lần cách nhau vài chục ms.
    for (const khoiLuong of [1, 10, 100, 1000]) {
      rerender({ ...INPUT, khoiLuong })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30)
      })
    }
    // Vẫn trong cửa sổ debounce → CHƯA gọi lần nào.
    expect(getKiemTraMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 20)
    })
    await waitFor(() => expect(getKiemTraMock).toHaveBeenCalledTimes(1))
    // …và là giá trị CUỐI CÙNG người dùng gõ, không phải một giá trị giữa chừng.
    expect(getKiemTraMock).toHaveBeenCalledWith(
      expect.objectContaining({ khoiLuong: 1000 }),
    )
  })

  it("đổi mã cũng đi qua debounce (mỗi mã là một lần tính lại đầy đủ)", async () => {
    const { rerender } = renderHook((input: KiemTraInputCap8) => useKiemTraCap8(input), {
      wrapper,
      initialProps: INPUT,
    })
    await waitFor(() => expect(getKiemTraMock).toHaveBeenCalledTimes(1))
    getKiemTraMock.mockClear()

    rerender({ ...INPUT, symbol: "HPG" })
    expect(getKiemTraMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 20)
    })
    await waitFor(() =>
      expect(getKiemTraMock).toHaveBeenCalledWith(expect.objectContaining({ symbol: "HPG" })),
    )
    expect(getKiemTraMock).toHaveBeenCalledTimes(1)
  })

  it("không gọi khi khối lượng/giá chưa hợp lệ (server sẽ 400)", async () => {
    renderHook(() => useKiemTraCap8({ ...INPUT, khoiLuong: 0 }), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 50)
    })
    expect(getKiemTraMock).not.toHaveBeenCalled()

    renderHook(() => useKiemTraCap8({ ...INPUT, gia: 0 }), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 50)
    })
    expect(getKiemTraMock).not.toHaveBeenCalled()
  })

  /**
   * ★ REGRESSION (fix wave FE-2). Test "không gọi khi… chưa hợp lệ" ở trên chỉ
   * kiểm là KHÔNG có request — nó không hề kiểm hook ĐANG NÓI GÌ với caller. Và
   * ở TanStack Query v5, một query bị `enabled: false` là `isPending` nhưng KHÔNG
   * `isFetching`, nên `isLoading = isPending && isFetching` là `false`, `isError`
   * cũng `false`, `data` là `undefined` — tức là caller rơi thẳng vào nhánh LỖI
   * và nói "không hỏi được máy chủ" trong khi chưa hề hỏi ai.
   *
   * Hook phải phát ra một tín hiệu RIÊNG cho trạng thái đó.
   */
  it("★ chưa đủ dữ kiện → hook nói `duDuKien: false`, KHÔNG phải lỗi/đang tải", async () => {
    const { result } = renderHook(() => useKiemTraCap8({ ...INPUT, gia: 0 }), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 50)
    })
    expect(result.current.duDuKien).toBe(false)
    // …và KHÔNG được trông giống một lần gọi máy chủ thất bại:
    expect(result.current.isError).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
  })

  it("khối lượng 0 cũng là 'chưa đủ dữ kiện', không phải lỗi", async () => {
    const { result } = renderHook(() => useKiemTraCap8({ ...INPUT, khoiLuong: 0 }), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 50)
    })
    expect(result.current.duDuKien).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it("đủ dữ kiện → `duDuKien: true` (cờ không kẹt ở false)", async () => {
    const { result } = renderHook(() => useKiemTraCap8(INPUT), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(RESPONSE))
    expect(result.current.duDuKien).toBe(true)
  })

  /**
   * ★ END-TO-END của chính lỗi trên: KHÔNG mock `./hooks` (file này mock `./api`),
   * nên block nhận ĐÚNG hình dạng mà query bị disable trả về — hình dạng mà
   * `KiemTraDanhMucBlock.test.tsx` không bao giờ dựng được vì nó mock cả hook.
   *
   * Kịch bản thật: user vào `/dau-truong`, `usePrice` chưa trả giá nên `gia = 0`.
   */
  it("★ block với giá 0 → nói 'chưa đủ dữ kiện', KHÔNG nói 'không hỏi được máy chủ'", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <Cap8Provider>
          <KiemTraDanhMucBlock
            symbol="VCB"
            khoiLuong={200}
            gia={0}
            catLo={null}
            hanhVi={null}
            onHanhVi={() => {}}
            onGiamKhoiLuong={() => {}}
            onChonMaKhac={() => {}}
          />
        </Cap8Provider>
      </QueryClientProvider>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 50)
    })
    expect(getKiemTraMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId("cap8-loi")).not.toBeInTheDocument()
    const chuaDu = screen.getByTestId("cap8-chua-du-du-kien")
    expect(chuaDu.textContent).not.toMatch(/máy chủ/i)
    expect(chuaDu.textContent).toMatch(/chưa đủ dữ kiện/i)
  })

  it("`enabled=false` (ngoài Cấp 8) → không request nào cả", async () => {
    renderHook(() => useKiemTraCap8(INPUT, false), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(KIEM_TRA_DEBOUNCE_MS + 50)
    })
    expect(getKiemTraMock).not.toHaveBeenCalled()
  })

  it("★ lỗi từ server KHÔNG được retry mãi — block phải biết mà xuống nước tử tế", async () => {
    getKiemTraMock.mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() => useKiemTraCap8(INPUT), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(getKiemTraMock).toHaveBeenCalledTimes(1)
  })
})
