import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, ChevronLeft, ChevronRight, Search } from "lucide-react"

import { WorkspacePage } from "@/components/layout/workspace-page"
import { PanelState } from "@/components/layout/panel-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage } from "@/lib/api"

import { LessonCard } from "./components/lesson-card"
import { CATALOG_PAGE_SIZE, CATEGORY_OPTIONS, LEVEL_OPTIONS, PREMIUM_OPTIONS } from "./constants"
import { useCourses } from "./hooks"
import type { CatalogParams, CourseLevel } from "./types"

/** Cửa sổ số trang quanh trang hiện tại, kèm dấu "…" cho khoảng bị bỏ. */
function pageWindow(current: number, totalPages: number): (number | "gap")[] {
  const first = Math.max(1, current - 1)
  const last = Math.min(totalPages, current + 1)
  const items: (number | "gap")[] = []
  if (first > 1) {
    items.push(1)
    if (first > 2) items.push("gap")
  }
  for (let page = first; page <= last; page += 1) items.push(page)
  if (last < totalPages) {
    if (last < totalPages - 1) items.push("gap")
    items.push(totalPages)
  }
  return items
}

/** Danh mục khoá học `/bai-hoc` — công khai, có tìm kiếm và bộ lọc. */
export function CatalogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [level, setLevel] = useState<CourseLevel | "all">("all")
  const [category, setCategory] = useState("all")
  const [premium, setPremium] = useState<"all" | "free" | "premium">("all")
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Gõ tới đâu lọc tới đó sẽ dội API; chờ 350ms rồi mới đổi từ khoá.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [search])


  const params = useMemo<CatalogParams>(
    () => ({
      page,
      pageSize: CATALOG_PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(level !== "all" ? { level } : {}),
      ...(category !== "all" ? { category } : {}),
      ...(premium === "free" ? { isPremium: false } : premium === "premium" ? { isPremium: true } : {}),
    }),
    [page, debouncedSearch, level, category, premium],
  )

  const { data, isPending, isFetching, isError, error, refetch } = useCourses(params)
  const courses = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0

  const hasFilters = !!search || level !== "all" || category !== "all" || premium !== "all"
  const clearFilters = () => {
    setSearch("")
    setLevel("all")
    setCategory("all")
    setPremium("all")
    setPage(1)
  }

  return (
    <WorkspacePage
      title="Kiến thức"
      description="Khám phá các khoá học đầu tư chứng khoán từ cơ bản đến nâng cao."
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm khoá học…"
            aria-label="Tìm khoá học"
            className="w-60 pl-7"
          />
        </div>

        <Select value={level} onValueChange={(value) => { setLevel(value as CourseLevel | "all"); setPage(1) }}>
          <SelectTrigger className="w-38" aria-label="Cấp độ">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1) }}>
          <SelectTrigger className="w-48" aria-label="Chủ đề">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={premium}
          onValueChange={(value) => { setPremium(value as "all" | "free" | "premium"); setPage(1) }}
        >
          <SelectTrigger className="w-32" aria-label="Học phí">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PREMIUM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Xoá bộ lọc
          </Button>
        )}

        {!isFetching && total > 0 && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{total} khoá học</span>
        )}
      </div>

      {isError ? (
        <PanelState
          title="Không tải được danh mục khoá học"
          description={errorMessage(error)}
          action={{ label: "Thử lại", onClick: () => void refetch() }}
        />
      ) : isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-60 w-full rounded-lg" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
          <BookOpen aria-hidden="true" className="size-6 text-muted-foreground/60" />
          <p className="text-xs font-medium">Không tìm thấy khoá học phù hợp</p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Xoá bộ lọc
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses.map((course) => (
            <LessonCard key={course.id} course={course} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination className="pt-2">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft aria-hidden="true" />
                Trước
              </Button>
            </PaginationItem>

            {pageWindow(page, totalPages).map((item, index) =>
              item === "gap" ? (
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <Button
                    variant={item === page ? "default" : "ghost"}
                    size="icon-sm"
                    aria-label={`Trang ${item}`}
                    aria-current={item === page ? "page" : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </Button>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Sau
                <ChevronRight aria-hidden="true" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </WorkspacePage>
  )
}
