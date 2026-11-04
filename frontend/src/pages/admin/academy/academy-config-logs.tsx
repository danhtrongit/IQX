import { RotateCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

import type { AcademyCatalogChapter, AcademyConfigData, AcademyConfigLog } from "./academy-config-api"
import {
  ACADEMY_LOG_ACTION_LABELS,
  chapterTitleById,
  configDataSummary,
} from "./academy-config-format"
import { useAcademyConfigLogs } from "./academy-config-hooks"

function actorLabel(actor: AcademyConfigLog["changed_by"]): string {
  if (!actor) return "Hệ thống"
  return actor.full_name ? `${actor.full_name} (${actor.username})` : actor.username
}

/** Một phía của nhật ký: "Tự do · 11 chương" và tên các chương; trạng thái chưa có thì ghi "Chưa có". */
function LogSide({
  label,
  data,
  catalog,
}: {
  label: string
  data: AcademyConfigData | null
  catalog: AcademyCatalogChapter[]
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {data ? (
        <>
          <p className="text-sm font-medium">{configDataSummary(data)}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {data.chapter_ids.map((chapterId) => chapterTitleById(catalog, chapterId)).join(", ")}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Chưa có</p>
      )}
    </div>
  )
}

/** Nhật ký thay đổi của một cấu hình (spec §1.3): ai sửa, lúc nào, trước và sau. */
export function AcademyConfigLogs({ configId, catalog }: { configId: string; catalog: AcademyCatalogChapter[] }) {
  const logs = useAcademyConfigLogs(configId)

  if (logs.isPending) {
    return (
      <div role="status" aria-label="Đang tải nhật ký" className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
    )
  }
  if (logs.isError) {
    return (
      <div className="space-y-2 py-4 text-center">
        <p className="text-sm text-destructive">{errorMessage(logs.error)}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void logs.refetch()}>
          <RotateCw />
          Thử lại
        </Button>
      </div>
    )
  }
  if (logs.data.items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Chưa có thay đổi nào được ghi lại.</p>
  }

  return (
    <ol aria-label="Nhật ký thay đổi" className="space-y-3">
      {logs.data.items.map((log) => (
        <li key={log.id} className="space-y-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge variant="outline">{ACADEMY_LOG_ACTION_LABELS[log.action]}</Badge>
            <span className="font-medium">{actorLabel(log.changed_by)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(log.changed_at)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <LogSide label="Trước" data={log.before} catalog={catalog} />
            <LogSide label="Sau" data={log.after} catalog={catalog} />
          </div>
        </li>
      ))}
    </ol>
  )
}
