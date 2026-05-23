import { useState } from "react"
import { useNavigate } from "react-router"
import type { ColumnDef, PaginationState } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  PlusCircle,
} from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { StatusBadge } from "@/components/common/status-badge"
type StatusVariant = "green" | "amber" | "red" | "blue" | "gray"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePaginatedQuery, type PaginatedParams } from "@/hooks/use-paginated-query"
import { lessonsApi, type CourseRow, type CourseLevel } from "@/lib/api/lessons"
import { fmtRelative } from "@/lib/format"

// ── Constants ──────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

const LEVEL_VARIANT: Record<string, StatusVariant> = {
  beginner: "green",
  intermediate: "amber",
  advanced: "red",
}

// ── Columns ────────────────────────────────────────────────────────────────

function buildColumns(actions: {
  onEdit: (c: CourseRow) => void
  onTogglePublish: (c: CourseRow) => void
  onDelete: (c: CourseRow) => void
}): ColumnDef<CourseRow>[] {
  return [
    {
      id: "thumbnail",
      header: "",
      cell: ({ row }) => (
        <Avatar className="size-10 rounded-md">
          {row.original.thumbnailUrl && (
            <AvatarImage
              src={row.original.thumbnailUrl}
              alt={row.original.title}
              className="object-cover"
            />
          )}
          <AvatarFallback className="rounded-md text-xs bg-muted">
            {row.original.title.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ),
      size: 56,
    },
    {
      id: "course",
      header: "Khóa học",
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{c.title}</p>
            <p className="truncate text-xs text-muted-foreground font-mono">{c.slug}</p>
          </div>
        )
      },
    },
    {
      accessorKey: "level",
      header: "Cấp độ",
      cell: ({ row }) => {
        const level = row.original.level
        return (
          <StatusBadge
            status={level}
            label={LEVEL_LABELS[level]}
            variantMap={LEVEL_VARIANT}
          />
        )
      },
    },
    {
      accessorKey: "category",
      header: "Danh mục",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.category}</span>
      ),
    },
    {
      id: "premium",
      header: "Premium",
      cell: ({ row }) =>
        row.original.isPremium ? (
          <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            Premium
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Free</span>
        ),
    },
    {
      id: "published",
      header: "Trạng thái",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.isPublished ? "published" : "draft"}
          label={row.original.isPublished ? "Đã xuất bản" : "Bản nháp"}
          variantMap={{ published: "green", draft: "gray" }}
        />
      ),
    },
    {
      accessorKey: "totalEpisodes",
      header: "Episode",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.totalEpisodes}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Cập nhật",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {fmtRelative(row.original.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const c = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Hành động"
              className="inline-flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  actions.onEdit(c)
                }}
                className="flex items-center gap-2"
              >
                <Pencil className="size-3.5" />
                Chỉnh sửa
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  actions.onTogglePublish(c)
                }}
                className="flex items-center gap-2"
              >
                {c.isPublished ? (
                  <>
                    <EyeOff className="size-3.5" />
                    Hủy xuất bản
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    Xuất bản
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  actions.onDelete(c)
                }}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Xóa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
      size: 48,
    },
  ]
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CoursesListPage() {
  const navigate = useNavigate()

  // ── Filters (local state, pushed to query) ──────────────────────────────
  const [search, setSearch] = useState("")
  const [levelFilter, setLevelFilter] = useState<CourseLevel | "">("")
  const [premiumFilter, setPremiumFilter] = useState<"" | "true" | "false">("")
  const [publishedFilter, setPublishedFilter] = useState<"" | "true" | "false">("")

  // ── Delete confirm ──────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<CourseRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Paginated query ─────────────────────────────────────────────────────
  const { data, isLoading, params, setParams, refetch } = usePaginatedQuery<CourseRow>({
    queryFn: (p: PaginatedParams) =>
      lessonsApi.list({
        page: p.page,
        pageSize: p.pageSize,
        search: search || undefined,
        level: levelFilter ? levelFilter : undefined,
        isPremium: premiumFilter !== "" ? premiumFilter === "true" : undefined,
        isPublished: publishedFilter !== "" ? publishedFilter === "true" : undefined,
      }),
    defaults: { page: 1, pageSize: 20 },
  })

  const pagination: PaginationState = {
    pageIndex: (params.page ?? 1) - 1,
    pageSize: params.pageSize ?? 20,
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setParams({ search: v, page: 1 })
  }

  const handleLevelChange = (v: string | null) => {
    const val = v ?? ""
    setLevelFilter(val as CourseLevel | "")
    setParams({ level: val || undefined, page: 1 })
  }

  const handlePremiumChange = (v: string | null) => {
    const val = v ?? ""
    setPremiumFilter(val as "" | "true" | "false")
    setParams({ isPremium: val || undefined, page: 1 })
  }

  const handlePublishedChange = (v: string | null) => {
    const val = v ?? ""
    setPublishedFilter(val as "" | "true" | "false")
    setParams({ isPublished: val || undefined, page: 1 })
  }

  const handleTogglePublish = async (course: CourseRow) => {
    try {
      await lessonsApi.update(course.id, { isPublished: !course.isPublished })
      toast.success(course.isPublished ? "Đã hủy xuất bản" : "Đã xuất bản khóa học")
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại")
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await lessonsApi.delete(deleteTarget.id)
      toast.success("Đã xóa khóa học")
      setDeleteTarget(null)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại")
    } finally {
      setDeleting(false)
    }
  }

  const columns = buildColumns({
    onEdit: (c) => navigate(`/lessons/${c.id}`),
    onTogglePublish: (c) => { void handleTogglePublish(c) },
    onDelete: (c) => setDeleteTarget(c),
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Khóa học</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} khóa học` : ""}
          </p>
        </div>
        <Button onClick={() => navigate("/lessons/new")}>
          <PlusCircle className="size-4 mr-1.5" />
          Tạo khóa mới
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Tìm theo tiêu đề hoặc slug..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-9 w-64"
        />

        <Select value={levelFilter} onValueChange={handleLevelChange}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Cấp độ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả cấp độ</SelectItem>
            <SelectItem value="beginner">Cơ bản</SelectItem>
            <SelectItem value="intermediate">Trung cấp</SelectItem>
            <SelectItem value="advanced">Nâng cao</SelectItem>
          </SelectContent>
        </Select>

        <Select value={premiumFilter} onValueChange={handlePremiumChange}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            <SelectItem value="true">Premium</SelectItem>
            <SelectItem value="false">Free</SelectItem>
          </SelectContent>
        </Select>

        <Select value={publishedFilter} onValueChange={handlePublishedChange}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả trạng thái</SelectItem>
            <SelectItem value="true">Đã xuất bản</SelectItem>
            <SelectItem value="false">Bản nháp</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        pageCount={data?.totalPages ?? 1}
        pagination={pagination}
        onPaginationChange={(updater) => {
          const next =
            typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        onRowClick={(c) => navigate(`/lessons/${c.id}`)}
        loading={isLoading}
        emptyMessage="Không tìm thấy khóa học"
      />

      {/* Pagination */}
      <DataTablePagination
        pagination={pagination}
        pageCount={data?.totalPages ?? 1}
        onPaginationChange={(updater) => {
          const next =
            typeof updater === "function" ? updater(pagination) : updater
          setParams({ page: next.pageIndex + 1, pageSize: next.pageSize })
        }}
        total={data?.total}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Xóa khóa học"
        description={`Bạn có chắc muốn xóa "${deleteTarget?.title}"? Thao tác này sẽ ẩn khóa học khỏi catalog (soft delete).`}
        confirmLabel={deleting ? "Đang xóa..." : "Xóa"}
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
