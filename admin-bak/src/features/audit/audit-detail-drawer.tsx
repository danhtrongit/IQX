import { Link } from "react-router"
import { ExternalLink } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { JsonViewer } from "@/components/common/json-viewer"
import { CopyButton } from "@/components/common/copy-button"
import { fmtDateTime } from "@/lib/format"
import type { AuditLogRow } from "@/lib/api/audit"

// Entity → route mapping for "View target" link
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  user: (id) => `/users/${id}`,
  subscription: (id) => `/subscriptions/${id}`,
  payment_order: (id) => `/payments/${id}`,
  vt_account: (id) => `/vt/accounts/${id}`,
}

interface AuditDetailDrawerProps {
  log: AuditLogRow | null
  onClose: () => void
}

export function AuditDetailDrawer({ log, onClose }: AuditDetailDrawerProps) {
  if (!log) return null

  const targetRoute =
    log.targetEntity && log.targetId && ENTITY_ROUTES[log.targetEntity]
      ? ENTITY_ROUTES[log.targetEntity](log.targetId)
      : null

  return (
    <Sheet open={!!log} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Chi tiết Audit Log</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 text-sm">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">ID</p>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs">{log.id}</span>
                <CopyButton text={log.id} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Thời gian</p>
              <p>{fmtDateTime(log.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Admin</p>
              {log.adminEmail ? (
                <p>{log.adminEmail}</p>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-200 text-xs">
                  SYSTEM
                </Badge>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Hành động</p>
              <Badge variant="outline" className="font-mono text-xs">
                {log.action}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Đối tượng</p>
              <p>{log.targetEntity ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Target ID</p>
              {log.targetId ? (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs">{log.targetId}</span>
                  <CopyButton text={log.targetId} />
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            {log.requestId && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Request ID</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs">{log.requestId}</span>
                  <CopyButton text={log.requestId} />
                </div>
              </div>
            )}
            {log.ip && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">IP</p>
                <p className="font-mono text-xs">{log.ip}</p>
              </div>
            )}
            {log.note && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Ghi chú</p>
                <p>{log.note}</p>
              </div>
            )}
          </div>

          {/* View target link */}
          {targetRoute && (
            <div>
              <Link
                to={targetRoute}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
                Xem {log.targetEntity}
              </Link>
            </div>
          )}

          <Separator />

          {/* Before/After diff side by side */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Trước
              </p>
              <JsonViewer
                data={log.payloadBefore ?? null}
                maxHeight="320px"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
                Sau
              </p>
              <JsonViewer
                data={log.payloadAfter ?? null}
                maxHeight="320px"
              />
            </div>
          </div>

          {/* User agent */}
          {log.userAgent && (
            <>
              <Separator />
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">User Agent</p>
                <p className="break-all text-xs text-muted-foreground">{log.userAgent}</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
