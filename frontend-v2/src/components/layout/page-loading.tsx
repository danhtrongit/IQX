import { Skeleton } from "@/components/ui/skeleton"

/** Route-level loading preserves page geometry while lazy chunks are fetched. */
export function PageLoading() {
  return (
    <main className="min-h-0 flex-1 overflow-auto" role="status" aria-label="Đang mở trang">
      <div className="h-0.5 w-full overflow-hidden bg-muted" aria-hidden="true">
        <div className="page-loading-bar h-full w-1/3 bg-primary" />
      </div>
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-64 w-full rounded-lg" />
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </main>
  )
}
