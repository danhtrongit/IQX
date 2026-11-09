/**
 * Candle Dojo data layer (`/api/v2/candle-dojo/**`). The server decides stars, belts, rewards, card ownership and
 * xu: this file only sends what the learner did (taps, answers) and the price they confirmed, and shows what
 * comes back. Reward and balance numbers always come from the response, never from client arithmetic.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { requestOperation } from "@/lib/contract-client"
import type { ApiRequestFor, ApiResponseFor } from "@/lib/contract-types"
import { SHOP_QUERY_ROOT } from "../shop/shop-model"

export type CandleDojoState = ApiResponseFor<"GET /api/v2/candle-dojo/state">
export type CandleDojoCards = ApiResponseFor<"GET /api/v2/candle-dojo/cards">
export type CandleDojoCardItem = CandleDojoCards["items"][number]
export type CandleDojoIntroResult = ApiResponseFor<"POST /api/v2/candle-dojo/intro/complete">
export type CandleDojoLessonResult = ApiResponseFor<"POST /api/v2/candle-dojo/lessons/{lessonId}/complete">
export type CandleDojoLessonBody = ApiRequestFor<"POST /api/v2/candle-dojo/lessons/{lessonId}/complete">["body"]
export type CandleDojoDrillResult = ApiResponseFor<"POST /api/v2/candle-dojo/drill/complete">
export type CandleDojoDrillBody = ApiRequestFor<"POST /api/v2/candle-dojo/drill/complete">["body"]
export type CandleDojoExam = ApiResponseFor<"POST /api/v2/candle-dojo/exams">
export type CandleDojoExamAnswer = ApiResponseFor<"POST /api/v2/candle-dojo/exams/{attemptId}/answers">
export type CandleDojoExamAnswerBody = ApiRequestFor<"POST /api/v2/candle-dojo/exams/{attemptId}/answers">["body"]
export type CandleDojoPurchaseResult = ApiResponseFor<"POST /api/v2/candle-dojo/cards/{cardId}/purchase">
export type CandleDojoPurchaseBody = ApiRequestFor<"POST /api/v2/candle-dojo/cards/{cardId}/purchase">["body"]

export const CANDLE_DOJO_QUERY_ROOT = ["candle-dojo"] as const
export const candleDojoKeys = {
  state: (userId: string) => [...CANDLE_DOJO_QUERY_ROOT, "state", userId] as const,
  cards: (userId: string) => [...CANDLE_DOJO_QUERY_ROOT, "cards", userId] as const,
}

const NO_USER = ""

export const fetchCandleDojoState = (signal?: AbortSignal) =>
  requestOperation("GET /api/v2/candle-dojo/state", {}, { signal })
export const fetchCandleDojoCards = (signal?: AbortSignal) =>
  requestOperation("GET /api/v2/candle-dojo/cards", {}, { signal })

/** Tiến độ Candle Dojo của tài khoản đang đăng nhập (đai, bài, sao, chuỗi luyện công, ví xu). */
export function useCandleDojoState() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: candleDojoKeys.state(userId),
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: ({ signal }) => fetchCandleDojoState(signal),
  })
}

/** Bộ 47 thẻ kèm giá, trạng thái sở hữu và mở khoá (Shop, kho thẻ). */
export function useCandleDojoCards() {
  const { user } = useAuth()
  const userId = user?.id ?? NO_USER
  return useQuery({
    queryKey: candleDojoKeys.cards(userId),
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: ({ signal }) => fetchCandleDojoCards(signal),
  })
}

/** Xu và thẻ đổi cùng lúc: làm mới cả Candle Dojo lẫn Shop (ví, sổ cái) sau mọi lệnh có thưởng hoặc chi tiêu. */
function useRefresh() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: CANDLE_DOJO_QUERY_ROOT })
    void queryClient.invalidateQueries({ queryKey: SHOP_QUERY_ROOT })
  }
}

export function useCompleteDojoIntro() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: () => requestOperation("POST /api/v2/candle-dojo/intro/complete", {}),
    onSuccess: refresh,
  })
}

export function useCompleteDojoLesson() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ lessonId, ...body }: CandleDojoLessonBody & { lessonId: string }) =>
      requestOperation("POST /api/v2/candle-dojo/lessons/{lessonId}/complete", { path: { lessonId }, body }),
    onSuccess: refresh,
  })
}

export function useCompleteDojoDrill() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (body: CandleDojoDrillBody) => requestOperation("POST /api/v2/candle-dojo/drill/complete", { body }),
    onSuccess: refresh,
  })
}

export function useStartDojoExam() {
  return useMutation({
    mutationFn: (dojo: number) => requestOperation("POST /api/v2/candle-dojo/exams", { body: { dojo } }),
  })
}

export function useAnswerDojoExam() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ attemptId, ...body }: CandleDojoExamAnswerBody & { attemptId: string }) =>
      requestOperation("POST /api/v2/candle-dojo/exams/{attemptId}/answers", { path: { attemptId }, body }),
    // Câu cuối chốt điểm, lên đai và thưởng xu: chỉ cần làm mới khi đề đã xong.
    onSuccess: (result) => {
      if (result.finished) refresh()
    },
  })
}

export function usePurchaseCandleCard() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ cardId, ...body }: CandleDojoPurchaseBody & { cardId: string }) =>
      requestOperation("POST /api/v2/candle-dojo/cards/{cardId}/purchase", { path: { cardId }, body }),
    onSuccess: refresh,
  })
}

/** Lý do mua thẻ thất bại, đủ để màn hình nói đúng điều cần làm. */
export type CardPurchaseFailure =
  | { kind: "insufficient"; balance: number; price: number; shortfall: number }
  | { kind: "owned" }
  | { kind: "locked" }
  | { kind: "price_changed" }
  | { kind: "catalog_changed" }
  | { kind: "other"; message: string }

export function classifyCardPurchaseError(error: unknown): CardPurchaseFailure {
  if (error instanceof ApiError) {
    if (error.code === "CARD_OWNED") return { kind: "owned" }
    if (error.code === "CARD_LOCKED") return { kind: "locked" }
    if (error.code === "PRICE_CHANGED") return { kind: "price_changed" }
    if (error.code === "CATALOG_CHANGED") return { kind: "catalog_changed" }
    if (error.code === "INSUFFICIENT_XU") {
      const detail = Array.isArray(error.details) ? (error.details[0] as Record<string, unknown> | undefined) : undefined
      const balance = Number(detail?.balance_xu ?? 0)
      const price = Number(detail?.price_xu ?? 0)
      return { kind: "insufficient", balance, price, shortfall: Number(detail?.shortfall_xu ?? Math.max(0, price - balance)) }
    }
    return { kind: "other", message: error.message }
  }
  return { kind: "other", message: error instanceof Error ? error.message : "Chưa mua được thẻ." }
}
