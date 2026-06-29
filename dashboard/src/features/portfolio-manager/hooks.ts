import { useMutation } from "@tanstack/react-query"
import { portfolioManagerApi } from "./api"
import { portfolioManagerKeys } from "./keys"
import type { AnalyzeResponse } from "./types"

export function useAnalyzePortfolio() {
  const mutation = useMutation<AnalyzeResponse, Error>({
    mutationKey: portfolioManagerKeys.analyze,
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
