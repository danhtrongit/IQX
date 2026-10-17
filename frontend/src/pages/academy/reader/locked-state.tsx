import { Lock } from "lucide-react"

import { Button } from "@/components/ui/button"

/** A locked item (403 ACADEMY_ITEM_LOCKED, or a deep link past the learner's progress). */
export function LockedState({ currentItemId, onOpen }: { currentItemId: string | null; onOpen: (itemId: string) => void }) {
  return (
    <section
      aria-labelledby="academy-locked-title"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center"
    >
      <Lock className="size-6 text-academy-label" aria-hidden="true" />
      <h2 id="academy-locked-title" className="font-heading text-lg font-semibold text-foreground">
        Bài này chưa mở
      </h2>
      <p className="max-w-md text-sm leading-6 text-academy-subtle">
        Học viện mở từng bài theo thứ tự. Hoàn thành bài đang học để mở bài tiếp theo.
      </p>
      {currentItemId && (
        <Button type="button" onClick={() => onOpen(currentItemId)}>
          Đến bài đang học
        </Button>
      )}
    </section>
  )
}
