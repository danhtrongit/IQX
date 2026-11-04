import { useState } from "react"
import { Info, Pencil, Plus, RefreshCw } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/api"
import { formatDateTime, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"

import type { AcademyConfigItem } from "./academy-config-api"
import { AcademyConfigEditor } from "./academy-config-editor"
import {
  ACADEMY_MODE_SHORT_LABELS,
  chapterCountLabel,
  lessonTotalLabel,
} from "./academy-config-format"
import { useAcademyConfigs } from "./academy-config-hooks"

/** Khoá dòng ổn định: một dòng mặc định và một dòng cho mỗi trưởng nhóm. */
function configKey(item: AcademyConfigItem): string {
  if (item.owner_type === "default") return "default"
  return item.leader?.user_id ?? item.id ?? item.name
}

function updatedByLabel(actor: NonNullable<AcademyConfigItem["updated_by"]>): string {
  return actor.full_name || actor.username
}

function NameCell({ item }: { item: AcademyConfigItem }) {
  return (
    <span className="block min-w-0 space-y-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.name}</span>
        {item.leader?.status === "revoked" && <Badge variant="outline">Đã thôi bổ nhiệm</Badge>}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {item.owner_type === "default" ? (
          <span>Người dùng không thuộc nhóm nào và nhóm chưa có cấu hình riêng</span>
        ) : (
          <>
            {item.leader && <span className="font-mono">{item.leader.username}</span>}
            {item.inherits_default && <span>Theo mặc định</span>}
          </>
        )}
      </span>
    </span>
  )
}

function UpdatedCell({ item }: { item: AcademyConfigItem }) {
  if (!item.updated_at) return <span className="text-muted-foreground">Chưa có</span>
  return (
    <span className="block space-y-0.5">
      <span className="block tabular-nums">{formatDateTime(item.updated_at)}</span>
      {item.updated_by && (
        <span className="block text-xs text-muted-foreground">{updatedByLabel(item.updated_by)}</span>
      )}
    </span>
  )
}

/**
 * Mục "Học viện" của trang quản trị (spec v4.1 §1.4): bảng cấu hình, dòng Mặc định đầu tiên rồi
 * tới từng trưởng nhóm. Chỉ quản trị viên vào được; trưởng nhóm chỉ xem cấu hình nhóm mình ở
 * Tổng quan. Số chương trong các cột là số lượng chương, không phải số hiển thị của người học.
 */
export function AcademyConfigsPage() {
  const configs = useAcademyConfigs()
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const items = configs.data?.items ?? []
  const catalog = configs.data?.catalog_chapters ?? []
  const editing = editingKey === null ? undefined : items.find((item) => configKey(item) === editingKey)

  const columns: AdminColumn<AcademyConfigItem>[] = [
    { id: "name", header: "Tên", cell: (item) => <NameCell item={item} /> },
    {
      id: "mode",
      header: "Cách học",
      cell: (item) => (
        <span className={cn(item.inherits_default && "text-muted-foreground")}>
          {ACADEMY_MODE_SHORT_LABELS[item.mode]}
        </span>
      ),
    },
    {
      id: "chapters",
      header: "Số chương",
      cell: (item) => (
        <span className={cn("block space-y-0.5", item.inherits_default && "text-muted-foreground")}>
          <span className="block tabular-nums">{chapterCountLabel(item.chapter_count, item.chapter_total)}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">{lessonTotalLabel(item.required_total)}</span>
        </span>
      ),
    },
    {
      id: "users",
      header: "Số người dùng áp dụng",
      align: "right",
      cell: (item) => <span className="tabular-nums">{formatNumber(item.user_count)}</span>,
    },
    { id: "updated", header: "Cập nhật lần cuối", cell: (item) => <UpdatedCell item={item} /> },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      align: "right",
      cell: (item) =>
        item.owner_type === "leader" && item.id === null ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditingKey(configKey(item))}>
            <Plus />
            Tạo cấu hình riêng
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditingKey(configKey(item))}>
            <Pencil />
            Sửa
          </Button>
        ),
    },
  ]

  return (
    <WorkspacePage
      title="Học viện"
      description="Chọn cách học và các chương mà từng nhóm được học. Cấu hình mặc định áp dụng cho người dùng không thuộc nhóm nào và cho nhóm chưa có cấu hình riêng."
      actions={
        <Button type="button" variant="outline" size="sm" disabled={configs.isFetching} onClick={() => void configs.refetch()}>
          <RefreshCw className={configs.isFetching ? "animate-spin" : undefined} />
          Làm mới
        </Button>
      }
    >
      <AdminDataTable
        columns={columns}
        rows={items}
        rowKey={configKey}
        loading={configs.isLoading}
        error={configs.error ? errorMessage(configs.error) : null}
        onRetry={() => void configs.refetch()}
        emptyLabel="Chưa có cấu hình nào."
      />

      <p className="flex gap-2 text-xs text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Quản trị viên luôn thấy đủ 12 chương và học tự do để kiểm tra nội dung. Mọi thay đổi áp dụng ngay và được ghi vào
        nhật ký.
      </p>

      {editing && <AcademyConfigEditor key={configKey(editing)} item={editing} catalog={catalog} onClose={() => setEditingKey(null)} />}
    </WorkspacePage>
  )
}
