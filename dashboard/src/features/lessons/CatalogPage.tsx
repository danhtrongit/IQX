import { useEffect, useMemo, useRef, useState } from "react"
import {
  Button,
  Grid,
  Input,
  Pagination,
  Select,
  Skeleton,
  Typography,
} from "@arco-design/web-react"
import { IconSearch } from "@arco-design/web-react/icon"
import { LessonCard } from "./components/LessonCard"
import { useCourses } from "./hooks"
import {
  CATEGORY_OPTIONS,
  LEVEL_OPTIONS,
  PREMIUM_OPTIONS,
} from "./constants"
import type { CatalogParams, CourseLevel } from "./types"

const { Row, Col } = Grid
const PAGE_SIZE = 12

export default function CatalogPage() {
  const [page, setPage] = useState(1)
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

  const params = useMemo<CatalogParams>(
    () => ({
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
    }),
    [page, debouncedSearch, level, category, premiumFilter],
  )

  const { data, isFetching } = useCourses(params)
  const courses = data?.items ?? []
  const total = data?.total ?? 0

  const hasFilters =
    !!search || level !== "all" || category !== "all" || premiumFilter !== "all"

  const clearFilters = () => {
    setSearch("")
    setLevel("all")
    setCategory("all")
    setPremiumFilter("all")
    setPage(1)
  }

  return (
    <main className="flex-1 container mx-auto max-w-7xl px-4 py-8">
      {/* Page header */}
      <div className="mb-8">
        <Typography.Title heading={4} style={{ marginTop: 0, marginBottom: 4 }}>
          Kiến thức
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Khám phá các khoá học đầu tư chứng khoán từ cơ bản đến nâng cao
        </Typography.Text>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <Input.Search
          allowClear
          value={search}
          onChange={(v) => setSearch(v)}
          placeholder="Tìm khoá học..."
          prefix={<IconSearch />}
          style={{ width: 240 }}
        />

        <Select
          value={level}
          onChange={(v) => setLevel(v as CourseLevel | "all")}
          style={{ width: 150 }}
          options={LEVEL_OPTIONS}
        />

        <Select
          value={category}
          onChange={setCategory}
          style={{ width: 200 }}
          options={CATEGORY_OPTIONS}
        />

        <Select
          value={premiumFilter}
          onChange={setPremiumFilter}
          style={{ width: 140 }}
          options={PREMIUM_OPTIONS}
        />

        {hasFilters && (
          <Button size="small" type="text" onClick={clearFilters}>
            Xoá bộ lọc
          </Button>
        )}

        {!isFetching && total > 0 && (
          <Typography.Text type="secondary" style={{ marginLeft: "auto", fontSize: 12 }}>
            {total} khoá học
          </Typography.Text>
        )}
      </div>

      {/* Course grid */}
      {isFetching && courses.length === 0 ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} lg={8} xl={6}>
              <Skeleton animation text={{ rows: 4 }} image />
            </Col>
          ))}
        </Row>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <IconSearch style={{ fontSize: 28, color: "var(--color-text-3)" }} />
          <Typography.Text type="secondary">
            Không tìm thấy khoá học phù hợp
          </Typography.Text>
          <Button size="small" onClick={clearFilters}>
            Xoá bộ lọc
          </Button>
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {courses.map((course) => (
            <Col key={course.id} xs={24} sm={12} lg={8} xl={6}>
              <LessonCard course={course} />
            </Col>
          ))}
        </Row>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center mt-8">
          <Pagination
            current={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={(p) => setPage(p)}
            sizeCanChange={false}
          />
        </div>
      )}
    </main>
  )
}
