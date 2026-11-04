import { Lock } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * The lock frame (spec v4.1 §4): an item that is not its turn yet for an account that learns in order
 * (403 ACADEMY_ITEM_LOCKED, reached from a row, the pager or a tool's "Học" button). The server sent no
 * content, so the frame shows only the lock, the item's name and "Học lần lượt để mở bài này", plus
 * "Học tiếp" to the nearest item the learner can open.
 */
export function LockedState({
  name,
  resumeItemId,
  onOpen,
}: {
  /** Name of the locked item from the catalog (an exam reads "Bài thi Chương c"); null while the catalog is unknown. */
  name: string | null
  /** "Học tiếp": the first required item that is open and not passed (`next_item_id`), null when there is none. */
  resumeItemId: string | null
  onOpen: (itemId: string) => void
}) {
  return (
    <section
      aria-labelledby="academy-locked-title"
      data-academy-locked
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center"
    >
      <Lock className="size-6 text-academy-label" aria-hidden="true" />
      <h2 id="academy-locked-title" className="font-heading text-lg font-semibold text-foreground">
        {name ?? "Bài này chưa mở"}
      </h2>
      <p className="max-w-md text-sm leading-6 text-academy-subtle">Học lần lượt để mở bài này.</p>
      {resumeItemId && (
        <Button type="button" onClick={() => onOpen(resumeItemId)}>
          Học tiếp
        </Button>
      )}
    </section>
  )
}
