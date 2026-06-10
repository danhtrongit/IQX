import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CopyButton } from "@/components/common/copy-button"
import { fmtDateTime, fmtRelative } from "@/lib/format"
import type { AuditLogRow } from "@/lib/api/audit"

// ── Action color helpers ──────────────────────────────────────────────────

function getActionVariant(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes(".create") || lower.includes(".activate")) {
    return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
  }
  if (
    lower.includes(".delete") ||
    lower.includes(".cancel") ||
    lower.includes(".refund") ||
    lower.includes(".freeze")
  ) {
    return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
  }
  if (
    lower.includes(".update") ||
    lower.includes(".extend") ||
    lower.includes(".adjust") ||
    lower.includes(".unfreeze")
  ) {
    return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
  }
  return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700"
}

// ── Column definitions ────────────────────────────────────────────────────

export const auditColumns: ColumnDef<AuditLogRow>[] = [
  {
    accessorKey: "createdAt",
    header: "Thời gian",
    cell: ({ getValue }) => {
      const v = getValue() as string
      return (
        <div>
          <p className="text-sm">{fmtDateTime(v)}</p>
          <p className="text-xs text-muted-foreground">{fmtRelative(v)}</p>
        </div>
      )
    },
  },
  {
    id: "admin",
    header: "Admin",
    cell: ({ row }) => {
      const log = row.original
      if (!log.adminUserId) {
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-200 font-medium">
            SYSTEM
          </Badge>
        )
      }
      return (
        <div>
          <p className="text-sm font-medium">{log.adminEmail ?? "—"}</p>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs text-muted-foreground">
              {log.adminUserId.slice(0, 8)}…
            </span>
            <CopyButton text={log.adminUserId} />
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "action",
    header: "Hành động",
    cell: ({ getValue }) => {
      const action = getValue() as string
      return (
        <Badge variant="outline" className={`border font-medium ${getActionVariant(action)}`}>
          {action}
        </Badge>
      )
    },
  },
  {
    id: "target",
    header: "Đối tượng",
    cell: ({ row }) => {
      const log = row.original
      return (
        <div>
          {log.targetEntity && (
            <span className="text-sm font-medium">{log.targetEntity}</span>
          )}
          {log.targetId && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs text-muted-foreground">
                {log.targetId.length > 12 ? `${log.targetId.slice(0, 12)}…` : log.targetId}
              </span>
              <CopyButton text={log.targetId} />
            </div>
          )}
          {!log.targetEntity && !log.targetId && (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "note",
    header: "Ghi chú",
    cell: ({ getValue }) => {
      const note = getValue() as string | null
      if (!note) return <span className="text-muted-foreground">—</span>
      return (
        <Tooltip>
          <TooltipTrigger className="block max-w-[200px] cursor-help truncate text-sm text-left">
            {note}
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{note}</TooltipContent>
        </Tooltip>
      )
    },
  },
  {
    accessorKey: "ip",
    header: "IP",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{(getValue() as string | null) ?? "—"}</span>
    ),
  },
]
