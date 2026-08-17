import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { useSidebar } from "@/shared/contexts/sidebar-context"
// ★ Vòng import hai chiều CÓ CHỦ ĐÍCH: `Cap0Context` import `useCap0Progress`
// từ chính file này. Cả hai phía chỉ dùng binding của nhau BÊN TRONG thân hàm
// (không có gì chạy lúc module được evaluate), nên ESM giải quyết được. Đổi lại
// là `useCompleteTask` hỏi đúng nguồn sự thật "có đang ở trong Cấp 0 không"
// thay vì đoán qua `window.location`.
import { useCap0Events } from "./Cap0Context"
import { cap0Api } from "./api"
import { cap0Keys } from "./keys"
import type { Cap0Gate, Cap0Kehoach, Cap0Progress, PlacementResult } from "./types"

/**
 * Current user's Cấp 0 progress. `staleTime: 0` so it always refetches after a
 * mutation invalidates it (the journey bar / checklist reflect live progress).
 * `data` is `null` when the user hasn't entered Cấp 0 yet.
 *
 * `enabled` (default `true`) lets callers OUTSIDE `Cap0TradingPage` (e.g.
 * `TradingPanel`/`RightSidebar`/`RightToolbar`, shared with /bieu-do &
 * /co-phieu) pass their own `isCap0Active` so this query — and the hide-by-
 * level decision it feeds (spec §8) — never fires outside Cấp 0.
 */
export function useCap0Progress(enabled = true) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap0Progress | null>({
    queryKey: cap0Keys.progress(),
    queryFn: cap0Api.getProgress,
    enabled: isAuthenticated && enabled,
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate every Cấp 0 query (progress) — used by every mutation. */
function useInvalidateCap0() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cap0Keys.all })
}

/** POST /cap0/enter — enter Cấp 0 + seed the practice account. */
export function useEnterCap0() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, void>({
    mutationFn: cap0Api.enter,
    onSuccess: invalidate,
  })
}

/** POST /cap0/placement — records the "have you traded before?" answer. */
export function usePlacement() {
  const invalidate = useInvalidateCap0()
  return useMutation<PlacementResult, unknown, boolean>({
    mutationFn: (hasTradedBefore) => cap0Api.placement(hasTradedBefore),
    onSuccess: invalidate,
  })
}

/**
 * PATCH /cap0/task — mark a task done (with an optional behaviour gate).
 *
 * Centralizes spec §7's "auto-chuyển tab Hành trình khi hoàn thành nhiệm vụ"
 * (moment thưởng, KHÔNG confetti) here in the hook's `onSuccess` — rather than
 * in each call site (`Gbar`/nhiệm vụ ①②③, `DebriefModal`/nhiệm vụ ④) — so
 * every current AND future caller gets the auto-tab for free without having to
 * remember to wire it. `useSidebar()` outside a `SidebarProvider` returns the
 * app's no-op default context, so this is safe to call from anywhere
 * `useCompleteTask` is used.
 *
 * A config-level `onSuccess` on `useMutation` fires even after the calling
 * component has unmounted (TanStack Query keeps the mutation observer alive
 * until the promise settles). `Cap0TradingPage` restores the sidebar's
 * pre-Cấp-0 panel on unmount (see its own comment) — but if a task PATCH is
 * still in flight at that moment (e.g. user closes the Kết sổ for nhiệm vụ ④, then
 * immediately clicks the ticker to navigate to `/co-phieu/:symbol`), this
 * `onSuccess` resolves AFTER that restore and would otherwise clobber the
 * panel back to "journey", leaking the Cấp 0 sidebar into the shared
 * `/bieu-do` & `/co-phieu` terminals.
 *
 * ★★ HAI ĐIỀU KIỆN THẬT — VÀ KHÔNG CÁI NÀO ĐỌC URL. Chỗ này từng hỏi
 * `window.location.pathname === "/dau-truong"`. Đó là một lời nói dối tiện tay:
 * đổi route của trang cấp (hoặc thêm một sub-path) là điều kiện lặng lẽ thành
 * false — phần thưởng hoàn thành nhiệm vụ thôi kéo tab Hành trình lên, hành
 * trình "biến mất" khỏi tầm mắt user dù họ vẫn đứng nguyên trong cấp; và
 * ngược lại, một trang khác dùng đúng path đó là panel Cấp 0 rò ra ngoài.
 *
 *  · `isCap0Active` — chỉ true bên trong `Cap0Provider`, đúng cơ chế
 *    `RightSidebar`/`RightToolbar` đã dùng. Trả lời "có phải Cấp 0 không".
 *  · `stillMounted` — trả lời "shell còn sống lúc PATCH về không". Cần RIÊNG,
 *    vì `isCap0Active` đóng băng trong closure ở lần render cuối: sau khi shell
 *    tháo nó vẫn là `true`, nên một mình nó không chặn được cuộc đua ở trên.
 *
 * ★ `keepPanel` opts a call OUT of the auto-tab, and nhiệm vụ ②③ need it. Those
 * two complete the instant the user opens the Nắm giữ / Theo dõi tab — so the
 * "moment thưởng" would fire while the user is standing exactly where the
 * nhiệm vụ told them to stand ("Mở tab Nắm giữ, xem mã vừa mua trong danh
 * mục") and yank the panel away before they can look at anything. A reward
 * that cancels the lesson is worth nothing.
 */
export function useCompleteTask() {
  const invalidate = useInvalidateCap0()
  const { setActivePanel } = useSidebar()
  const { isCap0Active } = useCap0Events()
  const stillMounted = useRef(true)
  useEffect(() => {
    stillMounted.current = true
    return () => {
      stillMounted.current = false
    }
  }, [])
  return useMutation<
    Cap0Progress,
    unknown,
    { taskNo: number; gate?: Cap0Gate; keepPanel?: boolean }
  >({
    mutationFn: ({ taskNo, gate }) => cap0Api.completeTask(taskNo, gate),
    onSuccess: (_data, { keepPanel }) => {
      invalidate()
      if (keepPanel) return
      if (!isCap0Active || !stillMounted.current) return
      setActivePanel("journey")
    },
  })
}

/**
 * POST /cap0/kehoach — persist the Kế hoạch chip for a just-filled Cấp 0 BUY
 * (of ANY `mode`: Cấp 0 is free and open to premium subscribers too, whose
 * orders are tagged `thuc_chien` — see `TradingMode`).
 *
 * ★★ The ONLY caller (`TradingPanel`'s BUY flow) must go through
 * `ghiKehoachKhongChiMang`: this POST runs AFTER the order already filled, and
 * an exception escaping into `handleSubmit`'s `catch` would swallow the whole
 * `onOrderFilled` bus chain below it — i.e. no cấp's Kết sổ opens on the later
 * sell, and Cấp 0 becomes ungraduatable again (the bug fixed in `7a057a3`).
 *
 * Deliberately does NOT invalidate `cap0Keys.all`: this writes no progress and
 * the Kết sổ's own `useCap0Kehoach` is keyed per order and mounts later.
 */
export function useRecordCap0Kehoach() {
  return useMutation<Cap0Kehoach, unknown, { orderId: string; lyDoDoiThuong: string }>({
    mutationFn: ({ orderId, lyDoDoiThuong }) => cap0Api.recordKehoach(orderId, lyDoDoiThuong),
  })
}

/**
 * GET /cap0/kehoach?order_id= — the `Lý do mua` + `Thời gian giữ` rows of the
 * Kết sổ (spec §5), read for the BUY order that opened the round trip being
 * shown. `null` order id (modal closed, or a live sell whose buy this session
 * never saw) disables the query, so a mounted-but-idle `DebriefModal` never
 * issues a request. That guard is pinned in `hooks.test.tsx`, where the hook is
 * REAL — `debrief.test.tsx` mocks this module out entirely and structurally
 * cannot test it.
 *
 * `data` is `null` (not `undefined`) when the server has no row — the Kết sổ
 * renders "—" for that, never an invented chip.
 */
export function useCap0Kehoach(orderId: string | null | undefined) {
  const { isAuthenticated } = useAuth()
  return useQuery<Cap0Kehoach | null>({
    queryKey: cap0Keys.kehoach(orderId ?? ""),
    queryFn: () => cap0Api.kehoachByOrder(orderId as string),
    enabled: isAuthenticated && !!orderId,
    staleTime: 0,
    retry: false,
  })
}

/** POST /cap0/graduate — graduate to Cấp 1 (switches mode to Thực chiến). */
export function useGraduate() {
  const invalidate = useInvalidateCap0()
  return useMutation<Cap0Progress, unknown, void>({
    mutationFn: cap0Api.graduate,
    onSuccess: invalidate,
  })
}
