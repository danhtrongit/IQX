import { useInfiniteQuery, useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useAuth } from "@/hooks/use-auth"
import {
  classifyActivateError,
  fetchAcademyProgress,
  fetchLedgerPage,
  fetchLessonNames,
  fetchShopState,
  putActiveMascot,
  type ShopState,
} from "./shop-api"
import { SHOP_QUERY_ROOT, WORKSPACE_STATE_KEY, shopKeys } from "./shop-model"

const NO_USER = ""

/**
 * The signed-in account's Shop state (catalog, wallet, ownership, active mascot).
 * One query serves the header chip, the main view, the panel and the purchase
 * modal, so a number can never differ between them. It is keyed by account, and
 * the whole cache is dropped on sign-out.
 */
export function useShopState() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: shopKeys.state(userId),
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: ({ signal }) => fetchShopState(signal),
  })
}

/** Full coin history, newest first, loaded page by page with the server's cursor. */
export function useShopLedger(enabled: boolean) {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useInfiniteQuery({
    queryKey: shopKeys.ledger(userId),
    enabled: enabled && !!userId,
    // The history is only read while its dialog is open; reopening starts from the newest page.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => fetchLedgerPage(pageParam, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

/** "Số bài đã hoàn thành" comes from the Học viện progress, never from the coin balance. */
export function useAcademyProgress() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: shopKeys.progress(userId),
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: ({ signal }) => fetchAcademyProgress(signal),
  })
}

/** Lesson names for ledger rows; the history stays readable without them. */
export function useLessonNames(enabled: boolean) {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: shopKeys.lessonNames(userId),
    enabled: enabled && !!userId,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: ({ signal }) => fetchLessonNames(signal),
  })
}

const ACTIVATE_KEY = ["shop", "activate"] as const

export type ActivateOutcome = { ok: true; changed: boolean } | { ok: false; message: string }

/**
 * "Sử dụng": switches the active mascot. It always sends the revision the screen
 * was built from; on success the Shop state and the workspace state are
 * invalidated so the mascot stage everywhere redraws from what the server
 * confirmed. A conflict or a refusal is never reported as success: the state is
 * refetched and the user is told what happened.
 */
export function useActivateMascot() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  const pending = useIsMutating({ mutationKey: ACTIVATE_KEY })
  const mutation = useMutation({
    mutationKey: ACTIVATE_KEY,
    mutationFn: ({ mascotId, revision }: { mascotId: string; revision: number }) => putActiveMascot(mascotId, revision),
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT })
    void queryClient.invalidateQueries({ queryKey: WORKSPACE_STATE_KEY })
  }

  async function activate(target: { mascot_id: string; name: string }): Promise<ActivateOutcome> {
    const known = queryClient.getQueryData<ShopState>(shopKeys.state(userId))
    if (!known) {
      const message = "Chưa tải được trạng thái Shop nên chưa đổi được linh thú. Hãy thử lại."
      toast.error(message)
      return { ok: false, message }
    }
    try {
      const result = await mutation.mutateAsync({ mascotId: target.mascot_id, revision: known.active.revision })
      refresh()
      toast.success(`Đang sử dụng ${target.name}`, { description: "Tài khoản và cấu hình Bot giữ nguyên." })
      return { ok: true, changed: result.changed }
    } catch (error) {
      const failure = classifyActivateError(error)
      refresh()
      const message = failure.kind === "revision_conflict"
        ? "Linh thú đang sử dụng đã được thay đổi ở nơi khác. Đã tải lại trạng thái mới; hãy chọn lại nếu cần."
        : failure.kind === "not_owned"
          ? `Bạn chưa sở hữu ${target.name}. Đã tải lại danh sách linh thú.`
          : failure.message
      toast.error(message)
      return { ok: false, message }
    }
  }

  return {
    activate,
    busy: pending > 0,
    pendingMascotId: mutation.isPending ? mutation.variables?.mascotId ?? null : null,
  }
}
