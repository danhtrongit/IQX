/**
 * Data hooks for the insights panels.
 *
 * Rules kept from the legacy screens:
 *  - every level-scoped query is gated on the user being at (or past) that level,
 *    so nothing fires outside its own Cấp;
 *  - `retry: false` on progress/analysis reads - a failure is reported, not retried
 *    into a fake empty state;
 *  - the reading flow is commit-then-reveal: the assessment is submitted exactly
 *    once all five layers are rated, and the reveal is requested only after the
 *    submit receipt resolves.
 */
import { useContext } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { JourneyContext } from "@/pages/demo-trading/journey/journey-state"
import { insightsApi, type ReadingDataset, type TradeRow } from "./api"
import { LOP_KEYS, isDoc5LopComplete, levelName, type Lop5Partial, type NhanDinhLop } from "./copy"

/** Current Cấp + name. Falls back to Cấp 0 when the journey provider is absent. */
export function useInsightsLevel() {
  const journey = useContext(JourneyContext)
  const level = journey?.level ?? 0
  return { level, levelName: journey?.levelName ?? levelName(level), journeyReady: journey != null }
}

function useLevelGate(minLevel: number) {
  const { user } = useAuth()
  const { level } = useInsightsLevel()
  return { enabled: !!user && level >= minLevel, userId: user?.id, level }
}

/* ── Trades: the closeout log behind khối ①②③ ──────────────────────────── */

export type TradeBase = { rows: TradeRow[]; source: string; isPending: boolean; isError: boolean }

/**
 * The closed-trade log for the CURRENT level.
 *
 * The backend exposes level-scoped trade lists for Cấp 1-3 only
 * (`/capN/trades`); from Cấp 4 up there is no such endpoint, so the last
 * server-authoritative set (Cấp 3's) is used and `source` says so out loud -
 * the level's own blocks read their own server endpoints regardless.
 */
export function useTradeBase(): TradeBase {
  const { user } = useAuth()
  const { level } = useInsightsLevel()
  const enabled = !!user && level >= 1
  const cap1 = useQuery({
    queryKey: ["insights", "trades", "cap1", user?.id],
    enabled: enabled && level === 1,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap1Trades(signal),
  })
  const cap2 = useQuery({
    queryKey: ["insights", "trades", "cap2", user?.id],
    enabled: enabled && level === 2,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap2Trades(signal),
  })
  const cap3 = useQuery({
    queryKey: ["insights", "trades", "cap3", user?.id],
    enabled: enabled && level >= 3,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap3Analysis(signal),
  })

  if (level === 1) {
    return { rows: cap1.data?.trades ?? [], source: "Sổ lệnh Cấp 1", isPending: cap1.isPending, isError: cap1.isError }
  }
  if (level === 2) {
    return { rows: cap2.data?.trades ?? [], source: "Sổ lệnh Cấp 2", isPending: cap2.isPending, isError: cap2.isError }
  }
  return {
    rows: cap3.data?.trades ?? [],
    source: "Sổ lệnh Cấp 3 - Cấp 4-6 không có endpoint lệnh riêng",
    isPending: cap3.isPending,
    isError: cap3.isError,
  }
}

/* ── Per-level progress + server analysis ──────────────────────────────── */

export function useCap1Progress() {
  const { enabled, userId } = useLevelGate(1)
  return useQuery({
    queryKey: ["insights", "cap1", "progress", userId],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap1Progress(signal),
  })
}

export function useCap2Progress() {
  const { enabled, userId } = useLevelGate(2)
  return useQuery({
    queryKey: ["insights", "cap2", "progress", userId],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap2Progress(signal),
  })
}

export function useCap2Analysis() {
  const { enabled, userId } = useLevelGate(2)
  return useQuery({
    queryKey: ["insights", "cap2", "analysis", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap2Analysis(signal),
  })
}

export function useCap3Progress() {
  const { enabled, userId } = useLevelGate(3)
  return useQuery({
    queryKey: ["insights", "cap3", "progress", userId],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap3Progress(signal),
  })
}

export function useCap3Analysis() {
  const { enabled, userId } = useLevelGate(3)
  return useQuery({
    queryKey: ["insights", "cap3", "analysis", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap3Analysis(signal),
  })
}

export function useCap4Progress() {
  const { enabled, userId } = useLevelGate(4)
  return useQuery({
    queryKey: ["insights", "cap4", "progress", userId],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap4Progress(signal),
  })
}

export function useCap4VuKhiDiemMu() {
  const { enabled, userId } = useLevelGate(4)
  return useQuery({
    queryKey: ["insights", "cap4", "vu-khi-diem-mu", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap4VuKhiDiemMu(signal),
  })
}

export function useCap4PhanTich() {
  const { enabled, userId } = useLevelGate(4)
  return useQuery({
    queryKey: ["insights", "cap4", "phan-tich", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap4PhanTich(signal),
  })
}

export function useCap5Progress() {
  const { enabled, userId } = useLevelGate(5)
  return useQuery({
    queryKey: ["insights", "cap5", "progress", userId],
    enabled,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap5Progress(signal),
  })
}

export function useCap5PhanTich() {
  const { enabled, userId } = useLevelGate(5)
  return useQuery({
    queryKey: ["insights", "cap5", "phan-tich", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap5PhanTich(signal),
  })
}

export function useCap5NguonSan(symbol: string) {
  const { enabled, userId } = useLevelGate(5)
  return useQuery({
    queryKey: ["insights", "cap5", "nguon-san", userId, symbol],
    enabled: enabled && symbol.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap5NguonSan(symbol, signal),
  })
}

export function useCap6PhanTich() {
  const { enabled, userId } = useLevelGate(6)
  return useQuery({
    queryKey: ["insights", "cap6", "phan-tich", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap6PhanTich(signal),
  })
}

/* ── Cấp 5 săn mã / watchlist ──────────────────────────────────────────── */

export function useSanMaIndex() {
  const { enabled, userId } = useLevelGate(5)
  return useQuery({
    queryKey: ["insights", "cap5", "san-ma", userId],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap5SanMaIndex(signal),
  })
}

export function useHuntResult(filter: string | null) {
  const { enabled, userId } = useLevelGate(5)
  return useQuery({
    queryKey: ["insights", "cap5", "hunt", userId, filter],
    enabled: enabled && filter != null,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap5Hunt(filter as string, signal),
  })
}

export function useCap5Watchlist() {
  const { enabled, userId } = useLevelGate(5)
  return useQuery({
    queryKey: ["insights", "cap5", "watchlist", userId],
    enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.cap5Watchlist(signal),
  })
}

export function useAddToWatchlist() {
  const { userId } = useLevelGate(5)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { symbol: string; hunt_filter: string | null; hunt_signal: string | null }) =>
      insightsApi.cap5AddWatchlist(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["insights", "cap5", "watchlist", userId] })
      void queryClient.invalidateQueries({ queryKey: ["insights", "cap5", "progress", userId] })
      void queryClient.invalidateQueries({ queryKey: ["journey"] })
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] })
    },
  })
}

export function useRemoveFromWatchlist() {
  const { userId } = useLevelGate(5)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (symbol: string) => insightsApi.cap5RemoveWatchlist(symbol),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["insights", "cap5", "watchlist", userId] })
      void queryClient.invalidateQueries({ queryKey: ["journey"] })
      void queryClient.invalidateQueries({ queryKey: ["watchlist"] })
    },
  })
}

/* ── Bot ───────────────────────────────────────────────────────────────── */

export function useBotOverview() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "bot", "overview", user?.id],
    enabled: !!user,
    staleTime: 15_000,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => insightsApi.botOverview(signal),
  })
}

export function useBotPositions(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "bot", "positions", user?.id],
    enabled: !!user && enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.botPositions(signal),
  })
}

export function useBotJournal(enabled: boolean) {
  const { user } = useAuth()
  return useInfiniteQuery({
    queryKey: ["insights", "bot", "journal", user?.id],
    enabled: !!user && enabled,
    staleTime: 15_000,
    retry: false,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => insightsApi.botJournal(pageParam, signal),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })
}

export function useBotPerformance(enabled: boolean) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["insights", "bot", "performance", user?.id],
    enabled: !!user && enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: ({ signal }) => insightsApi.botPerformance(signal),
  })
}

export function useRefreshBot() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["insights", "bot"] })
}

/* ── Reading dataset → self-assessment → reveal ────────────────────────── */

export type ReadingDatasetState = {
  data: ReadingDataset | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export type ReadingState = {
  dataset: ReadingDatasetState
  /** Dataset request failure (the server's own message wins when rendering). */
  error: unknown
  aiAnswers: Record<string, string> | null
  readings: Record<string, { lines: string[]; degraded: boolean } | undefined> | null
  settledFailure: boolean
  isLoading: boolean
}

/**
 * The frozen server reading dataset for `symbol` plus the commit-then-reveal
 * protocol. The AI comparison is exposed ONLY from the reveal response - a
 * failed request is reported as unavailable, never as a neutral verdict.
 */
export function useReadingAssessment(symbol: string, answers: Lop5Partial): ReadingState {
  const { user } = useAuth()
  const { level } = useInsightsLevel()
  const complete = isDoc5LopComplete(answers)
  const enabled = !!user && level >= 4 && symbol.length > 0

  const dataset = useQuery({
    queryKey: ["insights", "reading-dataset", user?.id, symbol],
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () => insightsApi.readingDataset(symbol),
  })

  const payload = complete
    ? (Object.fromEntries(LOP_KEYS.map((lop) => [lop, answers?.[lop] as NhanDinhLop])) as Record<string, string>)
    : null

  const reveal = useQuery({
    queryKey: ["insights", "reading-reveal", user?.id, dataset.data?.id],
    enabled: complete && !!dataset.data,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    queryFn: async () => {
      const receipt = await insightsApi.submitAssessment(dataset.data!.id, payload as Record<string, string>)
      return insightsApi.revealAssessment(receipt.id)
    },
  })

  return {
    dataset,
    error: dataset.error,
    aiAnswers: complete && reveal.data ? reveal.data.ai_answers : null,
    readings: reveal.data?.readings ?? dataset.data?.readings ?? null,
    settledFailure: dataset.isError || (complete && reveal.isError),
    isLoading: dataset.isPending || (complete && reveal.isPending),
  }
}
