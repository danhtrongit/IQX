import { useMemo, useState } from "react"
import { Plus, Search } from "lucide-react"
import { Link, useNavigate } from "react-router"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AdminDataTable, type AdminColumn } from "@/pages/admin/core/components/admin-data-table"
import { StatusBadge } from "@/pages/admin/core/components/status-badge"
import { errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"

import { LEVEL_LABEL, LEVEL_OPTIONS, PUBLISH_OPTIONS } from "./constants"
import { useAdminCourses } from "./hooks"
import type { CourseLevel, CourseListParams, CourseRow } from "./types"

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/** Danh sách khoá học `/admin/lessons` — gồm cả bản nháp. */
export function CoursesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [level, setLevel] = useState<CourseLevel | "all">("all")
  const [publish, setPublish] = useState<"all" | "published" | "draft">("all")

  const params = useMemo<CourseListParams>(
    () => ({
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(level !== "all" ? { level } : {}),
      ...(publish !== "all" ? { isPublished: publish === "published" } : {}),
    }),
    [page, pageSize, search, level, publish],
  )

  const { data, isPending, isError, error, refetch } = useAdminCourses(params)
  const rows = data?.items ?? []

  const applySearch = () => {
    setSearch(searchInput.trim())
    setPage(1)
  }

  const columns: AdminColumn<CourseRow>[] = [
    {
      id: "title",
      header: "Tiêu đề",
      className: "min-w-64",
      cell: (row) => (
        <Link
          to={`/admin/lessons/${row.id}`}
          className="font-medium text-primary hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.title}
        </Link>
      ),
    },
    {
      id: "slug",
      header: "Slug",
      cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>,
    },
    {
      id: "level",
      header: "Cấp độ",
      cell: (row) => LEVEL_LABEL[row.level] ?? row.level,
    },
    {
      id: "premium",
      header: "Học phí",
      cell: (row) => (
        <StatusBadge
          status={row.isPremium}
          label={row.isPremium ? "Premium" : "Miễn phí"}
          tone={row.isPremium ? "warning" : "neutral"}
        />
      ),
    },
    {
      id: "published",
      header: "Xuất bản",
      cell: (row) => (
        <StatusBadge
          status={row.isPublished}
          label={row.isPublished ? "Đã xuất bản" : "Bản nháp"}
        />
      ),
    },
    {
      id: "episodes",
      header: "Bài học",
      align: "right",
      className: "tabular-nums",
      cell: (row) => row.totalEpisodes,
    },
    {
      id: "updated",
      header: "Cập nhật",
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.updatedAt)}</span>,
    },
  ]

  return (
    <WorkspacePage
      title="Khoá học"
      description={data ? `${data.total} khoá học` : "Quản lý khoá học và bài học"}
      actions={
        <Button onClick={() => navigate("/admin/lessons/new")}>
          <Plus aria-hidden="true" />
          Tạo khoá học
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-card p-3">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applySearch()
            }}
            placeholder="Tìm khoá học…"
            aria-label="Tìm khoá học"
            className="w-64 pl-7"
          />
        </div>

        <Select
          value={level}
          onValueChange={(value) => {
            setLevel(value as CourseLevel | "all")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-38" aria-label="Cấp độ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả cấp độ</SelectItem>
            {LEVEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={publish}
          onValueChange={(value) => {
            setPublish(value as "all" | "published" | "draft")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40" aria-label="Trạng thái xuất bản">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi trạng thái</SelectItem>
            {PUBLISH_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={applySearch}>Lọc</Button>

        {(search || level !== "all" || publish !== "all") && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput("")
              setSearch("")
              setLevel("all")
              setPublish("all")
              setPage(1)
            }}
          >
            Xoá bộ lọc
          </Button>
        )}
      </div>

      <AdminDataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={isPending}
        error={isError ? errorMessage(error) : null}
        onRetry={() => void refetch()}
        emptyLabel="Không có khoá học nào"
        onRowClick={(row) => navigate(`/admin/lessons/${row.id}`)}
        pagination={
          data
            ? {
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                totalPages: data.totalPages,
                onPageChange: setPage,
                onPageSizeChange: (size) => {
                  setPageSize(size)
                  setPage(1)
                },
                pageSizeOptions: PAGE_SIZE_OPTIONS,
              }
            : undefined
        }
      />
    </WorkspacePage>
  )
}
