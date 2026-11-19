import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, History, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Link, useSearchParams } from "react-router"
import { toast } from "sonner"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateTime } from "@/lib/format"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import { ConfirmDialog } from "@/pages/admin/core/components/confirm-dialog"
import { ReasonDialog } from "@/pages/admin/core/components/reason-dialog"
import { errorMessage } from "@/pages/strategy/shared/errors"
import { iqxTitle, type IqxKind } from "@/pages/strategy/shared/iqx"

import {
  useDeleteIqxTemplate,
  useIqxAdminList,
  useReorderIqxTemplates,
  useSetIqxVisibility,
  type IqxAdminItem,
} from "./api"
import { HIDE_BODY, IQX_KIND_LABEL, SHOW_BODY } from "./copy"
import { HistoryDialog } from "./history-dialog"
import { IqxBadge } from "./iqx-badge"

const ADD_LABEL: Record<IqxKind, string> = { filter: "Thêm bộ lọc IQX", strategy: "Thêm chiến lược IQX" }
const STATUS_LABEL: Record<IqxAdminItem["status"], string> = {
  shown: "Đang hiện",
  hidden: "Đã ẩn",
  unpublished: "Chưa xuất bản",
}

type Pending = { type: "visibility"; item: IqxAdminItem } | { type: "delete"; item: IqxAdminItem } | { type: "history"; item: IqxAdminItem }

/** Quản trị › Mẫu IQX (spec Tab IQX §5.2): Bộ lọc IQX and Chiến lược IQX in the order users see them. */
export function IqxTemplatesPage() {
  const [params, setParams] = useSearchParams()
  const kind: IqxKind = params.get("tab") === "strategy" ? "strategy" : "filter"
  const list = useIqxAdminList(kind)
  const reorder = useReorderIqxTemplates()
  const visibility = useSetIqxVisibility()
  const remove = useDeleteIqxTemplate()
  const [pending, setPending] = useState<Pending | null>(null)

  const rows = useMemo(() => [...(list.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order), [list.data])

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const ids = rows.map((row) => row.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate({ kind, ids }, { onError: (error) => toast.error(errorMessage(error)) })
  }

  function close() {
    if (visibility.isPending || remove.isPending) return
    visibility.reset()
    remove.reset()
    setPending(null)
  }

  const columns: AdminColumn<IqxAdminItem>[] = [
    {
      id: "order",
      header: "Thứ tự",
      cell: (row) => {
        const index = rows.indexOf(row)
        return (
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Đưa ${row.name} lên`}
              disabled={index <= 0 || reorder.isPending}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Đưa ${row.name} xuống`}
              disabled={index >= rows.length - 1 || reorder.isPending}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
          </span>
        )
      },
    },
    {
      id: "name",
      header: "Tên",
      className: "min-w-[14rem] max-w-[24rem] whitespace-normal",
      cell: (row) => (
        <span className="block space-y-1">
          <span className="flex items-center gap-1.5">
            <IqxBadge />
            <span className="font-medium break-words">{row.name}</span>
          </span>
          {row.idea && <span className="block text-xs leading-5 text-muted-foreground">{row.idea}</span>}
        </span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={row.status === "shown" ? "font-medium text-foreground" : "text-muted-foreground"}>{STATUS_LABEL[row.status]}</span>
          {row.has_draft && <Badge variant="outline">Có bản nháp</Badge>}
        </span>
      ),
    },
    {
      id: "version",
      header: "Phiên bản",
      cell: (row) => <span className="tabular-nums">{row.current_version === null ? "—" : `v${row.current_version}`}</span>,
    },
    {
      id: "updated",
      header: "Cập nhật",
      cell: (row) => (
        <span className="block space-y-0.5">
          <span className="block tabular-nums">{formatDateTime(row.updated_at)}</span>
          {row.updated_by && <span className="block text-muted-foreground">{row.updated_by.name}</span>}
        </span>
      ),
    },
    {
      id: "used",
      header: "Người dùng bấm Dùng · 30 ngày",
      align: "right",
      cell: (row) => row.used_30d.toLocaleString("vi-VN"),
    },
    {
      id: "actions",
      header: "Thao tác",
      align: "right",
      cell: (row) => (
        <span className="flex flex-wrap justify-end gap-1">
          <Button asChild size="sm" variant="outline">
            <Link to={`/admin/iqx-templates/${kind}/${row.id}`}>
              <Pencil aria-hidden="true" />
              Sửa
            </Link>
          </Button>
          {row.current_version !== null && (
            <Button type="button" size="sm" variant="outline" onClick={() => setPending({ type: "visibility", item: row })}>
              {row.status === "hidden" ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              {row.status === "hidden" ? "Hiện" : "Ẩn"}
            </Button>
          )}
          {row.current_version === null && (
            <Button type="button" size="sm" variant="outline" onClick={() => setPending({ type: "delete", item: row })}>
              <Trash2 aria-hidden="true" />
              Xóa nháp
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setPending({ type: "history", item: row })}>
            <History aria-hidden="true" />
            Lịch sử
          </Button>
        </span>
      ),
    },
  ]

  const hiding = pending?.type === "visibility" && pending.item.status !== "hidden"

  return (
    <WorkspacePage
      title="Mẫu IQX"
      description="Bộ lọc IQX và Chiến lược IQX người dùng thấy trong tab IQX của Bộ lọc và Backtest."
      actions={
        <Button type="button" variant="outline" size="sm" disabled={list.isFetching} onClick={() => void list.refetch()}>
          <RefreshCw className={list.isFetching ? "animate-spin" : undefined} />
          Làm mới
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
          <TabsList variant="line">
            <TabsTrigger value="filter">Bộ lọc IQX</TabsTrigger>
            <TabsTrigger value="strategy">Chiến lược IQX</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button asChild size="sm">
          <Link to={`/admin/iqx-templates/${kind}/new`}>
            <Plus aria-hidden="true" />
            {ADD_LABEL[kind]}
          </Link>
        </Button>
      </div>

      <AdminDataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={list.isLoading}
        error={list.error ? errorMessage(list.error) : null}
        onRetry={() => void list.refetch()}
        emptyLabel={`Chưa có ${IQX_KIND_LABEL[kind]} nào.`}
      />

      {pending?.type === "visibility" && (
        <ReasonDialog
          title={`${hiding ? "Ẩn" : "Hiện"} ${iqxTitle(kind, pending.item.name)}?`}
          description={hiding ? HIDE_BODY : SHOW_BODY}
          confirmLabel={hiding ? "Ẩn" : "Hiện"}
          reasonLabel="Lý do thay đổi"
          pending={visibility.isPending}
          error={visibility.error ? errorMessage(visibility.error) : null}
          onClose={close}
          onSubmit={(reason) =>
            visibility.mutate(
              { id: pending.item.id, visible: !hiding, reason },
              {
                onSuccess: () => {
                  toast.success(hiding ? `Đã ẩn ${iqxTitle(kind, pending.item.name)}.` : `Đã hiện ${iqxTitle(kind, pending.item.name)}.`)
                  visibility.reset()
                  setPending(null)
                },
              },
            )
          }
        />
      )}

      <ConfirmDialog
        request={
          pending?.type === "delete"
            ? {
                title: `Xóa nháp ${iqxTitle(kind, pending.item.name)}?`,
                description: "Mục chưa xuất bản lần nào này bị xóa hẳn.",
                body: remove.error ? <p role="alert" className="text-destructive">{errorMessage(remove.error)}</p> : undefined,
                confirmLabel: "Xóa nháp",
                tone: "destructive",
                run: () => undefined,
              }
            : null
        }
        pending={remove.isPending}
        onOpenChange={(open) => !open && close()}
        onConfirm={() => {
          if (pending?.type !== "delete") return
          const name = pending.item.name
          remove.mutate(pending.item.id, {
            onSuccess: () => {
              toast.success(`Đã xóa nháp ${iqxTitle(kind, name)}.`)
              remove.reset()
              setPending(null)
            },
          })
        }}
      />

      {pending?.type === "history" && (
        <HistoryDialog id={pending.item.id} kind={kind} name={pending.item.name} onClose={() => setPending(null)} />
      )}
    </WorkspacePage>
  )
}
