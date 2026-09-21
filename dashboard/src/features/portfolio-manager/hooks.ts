import { useMutation } from "@tanstack/react-query"
import { useAuth } from "@/features/auth"
import { portfolioManagerApi } from "./api"
import { portfolioManagerKeys } from "./keys"
import type { AnalyzeResponse } from "./types"

export function useAnalyzePortfolio() {
  const { user } = useAuth()
  const mutation = useMutation<AnalyzeResponse, Error>({
    mutationKey: [...portfolioManagerKeys.analyze, user?.id ?? "anonymous"],
    mutationFn: () => portfolioManagerApi.analyze(),
  })
  return {
    report: mutation.data ?? null,
    analyze: mutation.mutate,
    analyzeAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  }
}
