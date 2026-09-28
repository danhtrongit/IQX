import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

interface Props {
  pending: boolean
  error: unknown | null
  onRetry: () => void
}

/** Persistent completion status shown after the overlay closes. */
export function TourCompletionNotice({ pending, error, onRetry }: Props) {
  if (!pending && !error) return null
  return (
    <div
      role={error ? "alert" : "status"}
      className="fixed bottom-5 left-1/2 z-[2002] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-lg bg-card px-4 py-3 text-[13px] text-card-foreground shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          <span>Đang lưu tiến trình tour…</span>
        </>
      ) : (
        <>
          <span>Chưa lưu được tiến trình tour. Bạn không cần xem lại từ đầu.</span>
          <Button size="sm" onClick={onRetry}>
            Thử lưu lại
          </Button>
        </>
      )}
    </div>
  )
}
