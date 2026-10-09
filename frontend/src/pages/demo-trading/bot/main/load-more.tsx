import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

/** «Tải thêm» of a cursor-paged list; hidden once the server has no next cursor. */
export function LoadMore({ hasMore, loading, onClick, label }: { hasMore: boolean; loading: boolean; onClick: () => void; label: string }) {
  if (!hasMore) return null
  return (
    <div className="border-t border-border p-2 text-center">
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onClick}>
        {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
        {label}
      </Button>
    </div>
  )
}
