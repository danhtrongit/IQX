import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { useLessonInteractive } from "./use-lesson-notes"

/**
 * Save status of the account notes, shown under the block edited last: "Đang lưu", "Đã lưu vào
 * tài khoản" or "Chưa lưu được. Thử lại". A failed first read offers its own retry.
 */
export function NotesStatusLine({ blockId }: { blockId: string }) {
  const { notes } = useLessonInteractive()
  if (notes.loadError) {
    return (
      <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-destructive">
        <span>Chưa tải được phần bạn đã lưu. {errorMessage(notes.loadError)}</span>
        <Button type="button" variant="ghost" size="xs" onClick={notes.reload}>
          Thử lại
        </Button>
      </div>
    )
  }
  const mine = notes.lastKey === blockId
  return (
    <div role="status" className="mt-2 flex min-h-5 flex-wrap items-center gap-2 text-xs text-academy-subtle">
      {mine && notes.status === "saving" && <span>Đang lưu</span>}
      {mine && notes.status === "saved" && <span>Đã lưu vào tài khoản</span>}
      {mine && notes.status === "error" && (
        <>
          <span className="text-destructive">Chưa lưu được.</span>
          <Button type="button" variant="ghost" size="xs" onClick={notes.retry}>
            Thử lại
          </Button>
        </>
      )}
    </div>
  )
}
