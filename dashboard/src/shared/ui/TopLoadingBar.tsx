import { useIsFetching, useIsMutating } from "@tanstack/react-query"

/**
 * Thin top progress bar that replaces spinner loaders. With no props it tracks
 * global TanStack Query activity (any in-flight query/mutation). Pass
 * `loading` to force it on (used as the route <Suspense> fallback).
 */
export function TopLoadingBar({ loading }: { loading?: boolean }) {
  const fetching = useIsFetching()
  const mutating = useIsMutating()
  const active = loading ?? fetching + mutating > 0
  if (!active) return null
  return (
    <div className="loading-bar-track" role="progressbar" aria-label="Đang tải">
      <div className="loading-bar-fill" />
    </div>
  )
}
