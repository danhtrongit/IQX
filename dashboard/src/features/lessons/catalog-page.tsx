import { useEffect, useRef, useState } from "react"
import { Search, SlidersHorizontal } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { LessonCard } from "@/components/lessons/lesson-card"
import { lessonsApi, type CourseCard, type CourseLevel } from "@/lib/api/lessons"

const LEVEL_OPTIONS: { value: CourseLevel | "all"; label: string }[] = [
  { value: "all", label: "Tất cả cấp độ" },
  { value: "beginner", label: "Cơ bản" },
  { value: "intermediate", label: "Trung cấp" },
  { value: "advanced", label: "Nâng cao" },
]

const CATEGORY_OPTIONS = [
  { value: "all", label: "Tất cả chủ đề" },
  { value: "phan-tich-ky-thuat", label: "Phân tích kỹ thuật" },
  { value: "phan-tich-co-ban", label: "Phân tích cơ bản" },
  { value: "tai-chinh-doanh-nghiep", label: "Tài chính doanh nghiệp" },
  { value: "quan-ly-rui-ro", label: "Quản lý rủi ro" },
  { value: "tam-ly-dau-tu", label: "Tâm lý đầu tư" },
  { value: "chung-khoan-co-ban", label: "Chứng khoán cơ bản" },
]

const PREMIUM_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "free", label: "Miễn phí" },
  { value: "premium", label: "Premium" },
]

const PAGE_SIZE = 12

export default function LessonsCatalogPage() {
  const [courses, setCourses] = useState<CourseCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [level, setLevel] = useState<CourseLevel | "all">("all")
  const [category, setCategory] = useState("all")
  const [premiumFilter, setPremiumFilter] = useState("all")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Reset page on filter change
  useEffect(() => {
    setPage(1)
  }, [level, category, premiumFilter])

  // Fetch courses
  useEffect(() => {
    setIsLoading(true)
    const params = {
      page,
      pageSize: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(level !== "all" ? { level } : {}),
      ...(category !== "all" ? { category } : {}),
      ...(premiumFilter === "free"
        ? { isPremium: false }
        : premiumFilter === "premium"
        ? { isPremium: true }
        : {}),
    }
    lessonsApi
      .listCourses(params)
      .then((data) => {
        setCourses(data.items)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(() => {
        setCourses([])
        setTotal(0)
        setTotalPages(1)
      })
      .finally(() => setIsLoading(false))
  }, [page, debouncedSearch, level, category, premiumFilter])

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />

      <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-1">Bài học</h1>
          <p className="text-sm text-muted-foreground">
            Khám phá các khoá học đầu tư chứng khoán từ cơ bản đến nâng cao
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm khoá học..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select value={level} onValueChange={(v) => setLevel(v as CourseLevel | "all")}>
            <SelectTrigger className="h-8 text-xs w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={premiumFilter} onValueChange={setPremiumFilter}>
            <SelectTrigger className="h-8 text-xs w-[130px]">
              <SlidersHorizontal className="size-3 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PREMIUM_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(search || level !== "all" || category !== "all" || premiumFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setSearch("")
                setLevel("all")
                setCategory("all")
                setPremiumFilter("all")
                setPage(1)
              }}
            >
              Xoá bộ lọc
            </Button>
          )}

          {!isLoading && total > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {total} khoá học
            </span>
          )}
        </div>

        {/* Course grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-muted" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center">
              <Search className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Không tìm thấy khoá học phù hợp</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setLevel("all")
                setCategory("all")
                setPremiumFilter("all")
              }}
            >
              Xoá bộ lọc
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {courses.map((course) => (
              <LessonCard key={course.id} course={course} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-8">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Trước
            </Button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1
              // Show first, last, current, and adjacent pages
              if (
                p === 1 ||
                p === totalPages ||
                Math.abs(p - page) <= 1
              ) {
                return (
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="min-w-[32px]"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                )
              }
              if (Math.abs(p - page) === 2) {
                return (
                  <span key={p} className="px-1 text-muted-foreground text-xs">
                    …
                  </span>
                )
              }
              return null
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
