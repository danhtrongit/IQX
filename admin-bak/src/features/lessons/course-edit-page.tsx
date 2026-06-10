import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { ThumbnailUploader } from "./thumbnail-uploader"
import { EpisodeRow } from "./episode-row"
import { EpisodeEditDrawer } from "./episode-edit-drawer"
import {
  lessonsApi,
  type CourseDetail,
  type CourseLevel,
  type Episode,
} from "@/lib/api/lessons"
import { PlusCircle } from "lucide-react"

// ── Slug helper ───────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

// ── Zod schema ─────────────────────────────────────────────────────────────

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const schema = z.object({
  title: z.string().min(1, "Tiêu đề là bắt buộc").max(200, "Tối đa 200 ký tự"),
  slug: z
    .string()
    .min(1, "Slug là bắt buộc")
    .max(120, "Tối đa 120 ký tự")
    .regex(slugRegex, "Slug chỉ gồm chữ thường, số và dấu gạch ngang"),
  description: z.string().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  category: z.string().min(1, "Category là bắt buộc"),
  isPremium: z.boolean(),
  isPublished: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const LEVEL_OPTIONS: { value: CourseLevel; label: string }[] = [
  { value: "beginner", label: "Cơ bản" },
  { value: "intermediate", label: "Trung cấp" },
  { value: "advanced", label: "Nâng cao" },
]

const CATEGORY_SUGGESTIONS = [
  "phan-tich-ky-thuat",
  "tai-chinh-doanh-nghiep",
  "vi-mo",
  "co-phieu",
  "trai-phieu",
  "chung-khoan-phai-sinh",
  "quan-ly-danh-muc",
]

// ── Component ──────────────────────────────────────────────────────────────

export default function CourseEditPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const navigate = useNavigate()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  // Episode drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null)

  // Delete episode confirm
  const [deleteEpisodeTarget, setDeleteEpisodeTarget] = useState<Episode | null>(null)
  const [deletingEpisode, setDeletingEpisode] = useState(false)

  // Toggle publish loading
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null)

  // Reorder loading
  const [reordering, setReordering] = useState(false)

  const slugAutoRef = useRef(true) // whether slug should auto-follow title

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      level: "beginner",
      category: "",
      isPremium: false,
      isPublished: false,
    },
  })

  // ── Load course ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    lessonsApi
      .get(id!)
      .then((c) => {
        setCourse(c)
        setEpisodes([...c.episodes].sort((a, b) => a.sortOrder - b.sortOrder))
        setThumbnailUrl(c.thumbnailUrl)
        slugAutoRef.current = false // do NOT auto-regenerate slug for existing
        form.reset({
          title: c.title,
          slug: c.slug,
          description: c.description ?? "",
          level: c.level,
          category: c.category,
          isPremium: c.isPremium,
          isPublished: c.isPublished,
        })
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Không thể tải khóa học")
      })
      .finally(() => setLoading(false))
  }, [id, isNew, form])

  // ── Auto-slug from title ─────────────────────────────────────────────────

  const handleTitleChange = useCallback(
    (title: string) => {
      form.setValue("title", title)
      if (slugAutoRef.current) {
        form.setValue("slug", slugify(title), { shouldValidate: true })
      }
    },
    [form],
  )

  // ── Submit ───────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    setSaving(true)
    try {
      if (isNew) {
        const created = await lessonsApi.create({
          slug: values.slug,
          title: values.title,
          description: values.description || undefined,
          level: values.level,
          category: values.category,
          isPremium: values.isPremium,
        })
        toast.success("Đã tạo khóa học")
        navigate(`/lessons/${created.id}`, { replace: true })
      } else {
        const updated = await lessonsApi.update(id!, {
          slug: values.slug,
          title: values.title,
          description: values.description || undefined,
          level: values.level,
          category: values.category,
          isPremium: values.isPremium,
          isPublished: values.isPublished,
        })
        setCourse(updated)
        setThumbnailUrl(updated.thumbnailUrl)
        toast.success("Đã lưu khóa học")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lưu thất bại"
      if (msg.toLowerCase().includes("409") || msg.toLowerCase().includes("conflict") || msg.toLowerCase().includes("slug")) {
        form.setError("slug", { message: "Slug đã tồn tại, vui lòng chọn slug khác" })
      } else {
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Episode operations ───────────────────────────────────────────────────

  const handleEpisodeSaved = (ep: Episode) => {
    setEpisodes((prev) => {
      const idx = prev.findIndex((e) => e.id === ep.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = ep
        return next
      }
      return [...prev, ep].sort((a, b) => a.sortOrder - b.sortOrder)
    })
    // Update course episode count hint
    setCourse((c) => c ? { ...c, totalEpisodes: c.totalEpisodes + (episodes.find((e) => e.id === ep.id) ? 0 : 1) } : c)
  }

  const handleTogglePublish = async (ep: Episode) => {
    setToggleLoadingId(ep.id)
    try {
      const updated = await lessonsApi.updateEpisode(ep.id, {
        isPublished: !ep.isPublished,
      })
      handleEpisodeSaved(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại")
    } finally {
      setToggleLoadingId(null)
    }
  }

  const handleDeleteEpisode = async () => {
    if (!deleteEpisodeTarget) return
    setDeletingEpisode(true)
    try {
      await lessonsApi.deleteEpisode(deleteEpisodeTarget.id)
      setEpisodes((prev) => prev.filter((e) => e.id !== deleteEpisodeTarget.id))
      toast.success("Đã xóa episode")
      setDeleteEpisodeTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại")
    } finally {
      setDeletingEpisode(false)
    }
  }

  // ── Drag-and-drop reorder ────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !course) return

    const oldIndex = episodes.findIndex((e) => e.id === active.id)
    const newIndex = episodes.findIndex((e) => e.id === over.id)
    const reordered = arrayMove(episodes, oldIndex, newIndex).map((ep, i) => ({
      ...ep,
      sortOrder: i + 1,
    }))
    setEpisodes(reordered)

    setReordering(true)
    try {
      await lessonsApi.reorder(
        course.id,
        reordered.map((ep) => ({ episodeId: ep.id, sortOrder: ep.sortOrder })),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sắp xếp thất bại")
      // Revert
      setEpisodes(episodes)
    } finally {
      setReordering(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const courseIsNew = isNew || !course
  const canPublish = !courseIsNew && episodes.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {isNew ? "Tạo khóa học mới" : (course?.title ?? "Chỉnh sửa khóa học")}
        </h1>
        {course && (
          <p className="text-sm text-muted-foreground">
            {course.totalEpisodes} episode · Cập nhật {new Date(course.updatedAt).toLocaleDateString("vi-VN")}
          </p>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={(e) => { void form.handleSubmit(onSubmit)(e) }}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
            {/* ── Left: Course form ────────────────────────────────────────── */}
            <div className="space-y-5">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tiêu đề *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ví dụ: Phân tích kỹ thuật cơ bản"
                        {...field}
                        onChange={(e) => handleTitleChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Slug */}
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="phan-tich-ky-thuat-co-ban"
                        {...field}
                        onChange={(e) => {
                          slugAutoRef.current = false
                          field.onChange(e)
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mô tả</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Mô tả ngắn về khóa học (markdown)..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Level */}
              <FormField
                control={form.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cấp độ *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn cấp độ" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Category */}
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Danh mục *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="phan-tich-ky-thuat"
                        list="category-suggestions"
                        {...field}
                      />
                    </FormControl>
                    <datalist id="category-suggestions">
                      {CATEGORY_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* isPremium */}
              <FormField
                control={form.control}
                name="isPremium"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <Label
                        className="cursor-pointer"
                        onClick={() => field.onChange(!field.value)}
                      >
                        Khóa học Premium
                      </Label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* isPublished — disabled until course has episodes */}
              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!canPublish}
                        />
                      </FormControl>
                      <div>
                        <Label
                          className={canPublish ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                          onClick={() => canPublish && field.onChange(!field.value)}
                        >
                          Xuất bản khóa học
                        </Label>
                        {!canPublish && !isNew && (
                          <p className="text-xs text-muted-foreground">
                            Cần có ít nhất 1 episode trước khi xuất bản
                          </p>
                        )}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Thumbnail */}
              {!isNew && course && (
                <div className="space-y-2">
                  <Label>Thumbnail</Label>
                  <ThumbnailUploader
                    courseId={course.id}
                    currentUrl={thumbnailUrl}
                    onSuccess={(url) => setThumbnailUrl(url)}
                  />
                </div>
              )}

              {/* Save button */}
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Đang lưu..." : isNew ? "Tạo khóa học" : "Lưu thay đổi"}
              </Button>
            </div>

            {/* ── Right: Episode list ──────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Danh sách episode{" "}
                  {episodes.length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      ({episodes.length})
                    </span>
                  )}
                </h2>
                <Button
                  type="button"
                  size="sm"
                  disabled={courseIsNew}
                  onClick={() => {
                    setEditingEpisode(null)
                    setDrawerOpen(true)
                  }}
                >
                  <PlusCircle className="size-4 mr-1.5" />
                  Thêm episode
                </Button>
              </div>

              {courseIsNew ? (
                <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                  <p className="text-sm text-muted-foreground text-center px-4">
                    Lưu khóa học trước rồi mới thêm episode
                  </p>
                </div>
              ) : episodes.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                  <p className="text-sm text-muted-foreground">Chưa có episode nào</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => { void handleDragEnd(e) }}
                >
                  <SortableContext
                    items={episodes.map((e) => e.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {episodes.map((ep) => (
                        <EpisodeRow
                          key={ep.id}
                          episode={ep}
                          onEdit={(e) => {
                            setEditingEpisode(e)
                            setDrawerOpen(true)
                          }}
                          onDelete={(e) => setDeleteEpisodeTarget(e)}
                          onTogglePublish={(e) => { void handleTogglePublish(e) }}
                          toggleLoading={toggleLoadingId === ep.id}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {reordering && (
                <p className="text-xs text-muted-foreground text-center">Đang lưu thứ tự...</p>
              )}
            </div>
          </div>
        </form>
      </Form>

      {/* Episode drawer */}
      {course && (
        <EpisodeEditDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          courseId={course.id}
          episode={editingEpisode}
          onSaved={handleEpisodeSaved}
        />
      )}

      {/* Delete episode confirm */}
      <ConfirmDialog
        open={!!deleteEpisodeTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteEpisodeTarget(null)
        }}
        title="Xóa episode"
        description={`Bạn có chắc muốn xóa "${deleteEpisodeTarget?.title}"? Thao tác này không thể hoàn tác.`}
        confirmLabel={deletingEpisode ? "Đang xóa..." : "Xóa"}
        destructive
        onConfirm={handleDeleteEpisode}
      />
    </div>
  )
}
