import { Button, Spin } from "@arco-design/web-react"

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
      className="fixed bottom-5 left-1/2 z-[2002] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--color-border-3)] bg-[var(--color-bg-2)] px-4 py-3 text-[13px] text-[var(--color-text-1)] shadow-xl"
      role={error ? "alert" : "status"}
    >
      {pending ? (
        <><Spin size={14} /><span>Đang lưu tiến trình tour…</span></>
      ) : (
        <>
          <span>Chưa lưu được tiến trình tour. Bạn không cần xem lại từ đầu.</span>
          <Button type="primary" size="small" onClick={onRetry}>Thử lưu lại</Button>
        </>
      )}
    </div>
  )
}
