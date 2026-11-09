import { cn } from "@/lib/utils"

import type { AdminBulletinStatus } from "./bulletin-admin-api"
import { STATUS_LABEL } from "./bulletin-admin-format"

const STATUS_TONE: Record<AdminBulletinStatus, string> = {
  draft: "bg-status-warning/15 text-status-warning",
  public: "bg-status-success/15 text-status-success",
  unpublic: "bg-muted text-muted-foreground",
}

export function BulletinStatusBadge({ status }: { status: AdminBulletinStatus }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-sm px-2 text-xs font-medium whitespace-nowrap", STATUS_TONE[status])}>
      {STATUS_LABEL[status]}
    </span>
  )
}
