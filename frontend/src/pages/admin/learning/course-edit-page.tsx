import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageUp,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react"
import { useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, errorMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useConfirmDialog } from "@/pages/admin/core/components/use-confirm-dialog"
import { StatusBadge } from "@/pages/admin/core/components/status-badge"

import {
  CATEGORY_MAX_LENGTH,
  CONTENT_TYPE_LABEL,
  CONTENT_TYPE_OPTIONS,
  LEVEL_OPTIONS,
  MARKDOWN_MAX_BYTES,
  MARKDOWN_TOO_LARGE_MESSAGE,
  NON_TEXT_MARKDOWN_MESSAGE,
  PDF_MAX_MB,
  SLUG_MAX_LENGTH,
  SLUG_MESSAGE,
  SLUG_PATTERN,
  TEXT_REQUIRES_MARKDOWN_MESSAGE,
  THUMBNAIL_ACCEPT,
  THUMBNAIL_MAX_MB,
  TITLE_MAX_LENGTH,
  VIDEO_MAX_MB,
} from "./constants"
import { formatDuration, formatFileSize, slugify } from "./format"
import {
  useAdminCourse,
  useCreateCourse,
  useCreateEpisode,
  useDeleteEpisode,
  useReorderEpisodes,
  useUnpublishCourse,
  useUpdateCourse,
  useUpdateEpisode,
  useUploadCourseThumbnail,
  useUploadEpisodeFile,
} from "./hooks"
import type {
  CourseLevel,
  CourseUpdatePayload,
  Episode,
  EpisodeContentType,
  EpisodeUpdatePayload,
} from "./types"

type CourseFormValues = {
  title: string
  slug: string
  description: string
  level: CourseLevel
  category: string
  isPremium: boolean
  isPublished: boolean
}

type EpisodeFormValues = {
  title: string
  description: string
  contentType: EpisodeContentType
  markdownBody: string
  sortOrder: number
  isPublished: boolean
}

const EMPTY_COURSE: CourseFormValues = {
  title: "",
  slug: "",
  description: "",
  level: "beginner",
  category: "",
  isPremium: false,
  isPublished: false,
}

/** Kiểm tra biểu mẫu khoá học trước khi gọi API (máy chủ vẫn phán quyết cuối). */
function courseFormError(values: CourseFormValues): string | null {
  if (!values.title.trim()) return "Vui lòng nhập tiêu đề khoá học"
  if (values.title.length > TITLE_MAX_LENGTH) return `Tiêu đề tối đa ${TITLE_MAX_LENGTH} ký tự`
  if (values.slug.length > SLUG_MAX_LENGTH) return `Slug tối đa ${SLUG_MAX_LENGTH} ký tự`
  if (!SLUG_PATTERN.test(values.slug)) return SLUG_MESSAGE
  if (!values.category.trim()) return "Vui lòng nhập danh mục"
  if (values.category.length > CATEGORY_MAX_LENGTH) return `Danh mục tối đa ${CATEGORY_MAX_LENGTH} ký tự`
  return null
}

/** Kiểm tra biểu mẫu bài học; trả về thông báo lỗi hoặc `null`. */
function episodeFormError(values: EpisodeFormValues): string | null {
  if (!values.title.trim()) return "Vui lòng nhập tiêu đề bài học"
  if (values.title.length > TITLE_MAX_LENGTH) return `Tiêu đề tối đa ${TITLE_MAX_LENGTH} ký tự`
  if (!Number.isInteger(values.sortOrder) || values.sortOrder < 1)
    return "Thứ tự phải là số nguyên từ 1 trở lên"
  if (values.contentType === "text" && !values.markdownBody.trim())
    return TEXT_REQUIRES_MARKDOWN_MESSAGE
  if (values.contentType !== "text" && values.markdownBody.trim()) return NON_TEXT_MARKDOWN_MESSAGE
  if (new Blob([values.markdownBody]).size > MARKDOWN_MAX_BYTES) return MARKDOWN_TOO_LARGE_MESSAGE
  return null
}

/** Trường chung của biểu mẫu khoá học — dùng cho cả trang tạo và trang sửa. */
function CourseFields({
  values,
  update,
  disabled,
}: {
  values: CourseFormValues
  update: (patch: Partial<CourseFormValues>) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="course-title">Tiêu đề</Label>
        <Input
          id="course-title"
          value={values.title}
          disabled={disabled}
          maxLength={TITLE_MAX_LENGTH}
          onChange={(event) => update({ title: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="course-slug">Slug</Label>
        <Input
          id="course-slug"
          value={values.slug}
          disabled={disabled}
          maxLength={SLUG_MAX_LENGTH}
          className="font-mono"
          onChange={(event) => update({ slug: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Chữ thường, số và dấu gạch ngang — dùng cho đường dẫn /bai-hoc/&lt;slug&gt;.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="course-category">Danh mục</Label>
        <Input
          id="course-category"
          value={values.category}
          disabled={disabled}
          maxLength={CATEGORY_MAX_LENGTH}
          onChange={(event) => update({ category: event.target.value })}
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="course-description">Mô tả</Label>
        <Textarea
          id="course-description"
          value={values.description}
          disabled={disabled}
          rows={3}
          onChange={(event) => update({ description: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="course-level">Cấp độ</Label>
        <Select
          value={values.level}
          disabled={disabled}
          onValueChange={(value) => update({ level: value as CourseLevel })}
        >
          <SelectTrigger id="course-level" className="w-full" aria-label="Cấp độ">
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
      </div>

      <div className="flex flex-wrap items-center gap-6 pt-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={values.isPremium}
            disabled={disabled}
            onCheckedChange={(checked) => update({ isPremium: checked })}
          />
          Khoá Premium
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={values.isPublished}
            disabled={disabled}
            onCheckedChange={(checked) => update({ isPublished: checked })}
          />
          Đã xuất bản
        </label>
      </div>
    </div>
  )
}

/** Khối nội dung của trang quản trị. */
function EditorCard({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** Hộp thoại thêm/sửa bài học. */
function EpisodeDialog({
  open,
  episode,
  defaultSortOrder,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  episode: Episode | null
  defaultSortOrder: number
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: EpisodeFormValues, episode: Episode | null) => void
}) {
  const [values, setValues] = useState<EpisodeFormValues>(() =>
    episode
      ? {
          title: episode.title,
          description: episode.description ?? "",
          contentType: episode.contentType,
          markdownBody: episode.markdownBody ?? "",
          sortOrder: episode.sortOrder,
          isPublished: episode.isPublished,
        }
      : {
          title: "",
          description: "",
          contentType: "text",
          markdownBody: "",
          sortOrder: defaultSortOrder,
          isPublished: false,
        },
  )

  const update = (patch: Partial<EpisodeFormValues>) =>
    setValues((current) => ({ ...current, ...patch }))

  const submit = () => {
    const invalid = episodeFormError(values)
    if (invalid) {
      toast.error(invalid)
      return
    }
    onSubmit(values, episode)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{episode ? "Sửa bài học" : "Thêm bài học"}</DialogTitle>
          <DialogDescription>
            {episode
              ? "Loại nội dung đặt lúc tạo nên không đổi được về sau."
              : "Bài PDF/Video ở dạng nháp cho tới khi bạn tải tệp lên."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="episode-title">Tiêu đề</Label>
            <Input
              id="episode-title"
              value={values.title}
              maxLength={TITLE_MAX_LENGTH}
              onChange={(event) => update({ title: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="episode-description">Mô tả</Label>
            <Textarea
              id="episode-description"
              value={values.description}
              rows={2}
              onChange={(event) => update({ description: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="episode-type">Loại nội dung</Label>
              <Select
                value={values.contentType}
                disabled={!!episode}
                onValueChange={(value) => update({ contentType: value as EpisodeContentType })}
              >
                <SelectTrigger id="episode-type" className="w-40" aria-label="Loại nội dung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="episode-order">Thứ tự</Label>
              <Input
                id="episode-order"
                type="number"
                min={1}
                value={values.sortOrder}
                className="w-28"
                onChange={(event) => update({ sortOrder: Number(event.target.value) })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="episode-published">Xuất bản</Label>
              <div className="flex h-8 items-center">
                <Switch
                  id="episode-published"
                  checked={values.isPublished}
                  disabled={!episode}
                  onCheckedChange={(checked) => update({ isPublished: checked })}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {episode
              ? "Trạng thái xuất bản lưu ngay khi bấm Lưu."
              : "Bài văn bản xuất bản ngay khi tạo; bài PDF/Video chỉ xuất bản được sau khi có tệp."}
          </p>

          {values.contentType === "text" ? (
            <div className="space-y-1.5">
              <Label htmlFor="episode-markdown">Nội dung markdown</Label>
              <Textarea
                id="episode-markdown"
                value={values.markdownBody}
                rows={8}
                className="font-mono text-xs"
                onChange={(event) => update({ markdownBody: event.target.value })}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {new Blob([values.markdownBody]).size.toLocaleString("vi-VN")} /{" "}
                {MARKDOWN_MAX_BYTES.toLocaleString("vi-VN")} byte
              </p>
            </div>
          ) : (
            <p className="rounded-sm bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              {values.contentType === "pdf" ? "PDF" : "Video"} không dùng markdown. Sau khi lưu, tải
              tệp lên ở danh sách bài học bên dưới.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** `/admin/lessons/new` — tạo khoá học rồi chuyển sang trang sửa để thêm bài học. */
function CourseCreatePanel() {
  const navigate = useNavigate()
  const createCourse = useCreateCourse()
  const [values, setValues] = useState<CourseFormValues>(EMPTY_COURSE)

  // Gõ tiêu đề thì slug tự sinh, đúng như trang quản trị cũ.
  const update = (patch: Partial<CourseFormValues>) =>
    setValues((current) => ({
      ...current,
      ...patch,
      ...(patch.title !== undefined ? { slug: slugify(patch.title) } : {}),
    }))

  const save = () => {
    const invalid = courseFormError(values)
    if (invalid) {
      toast.error(invalid)
      return
    }
    createCourse.mutate(
      {
        slug: values.slug,
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        level: values.level,
        category: values.category.trim(),
        isPremium: values.isPremium,
        isPublished: values.isPublished,
      },
      {
        onSuccess: (created) => {
          toast.success("Đã tạo khoá học")
          navigate(`/admin/lessons/${created.id}`)
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <WorkspacePage
      title="Tạo khoá học"
      description="Khoá học mới chỉ hiện trong danh mục công khai sau khi được xuất bản."
      actions={
        <>
          <Button variant="outline" onClick={() => navigate("/admin/lessons")}>
            <ArrowLeft aria-hidden="true" />
            Quay lại
          </Button>
          <Button disabled={createCourse.isPending} onClick={save}>
            {createCourse.isPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Lưu
          </Button>
        </>
      }
    >
      <EditorCard title="Thông tin khoá học">
        <CourseFields values={values} update={update} disabled={createCourse.isPending} />
      </EditorCard>
    </WorkspacePage>
  )
}

/** `/admin/lessons/:id` — sửa khoá học, ảnh đại diện và toàn bộ bài học. */
function CourseEditor({ courseId }: { courseId: string }) {
  const navigate = useNavigate()
  const { data: course, isPending, isError, error, refetch } = useAdminCourse(courseId)

  const updateCourse = useUpdateCourse(courseId)
  const unpublishCourse = useUnpublishCourse(courseId)
  const uploadThumbnail = useUploadCourseThumbnail(courseId)
  const createEpisode = useCreateEpisode(courseId)
  const updateEpisode = useUpdateEpisode(courseId)
  const removeEpisode = useDeleteEpisode(courseId)
  const uploadEpisodeFile = useUploadEpisodeFile(courseId)
  const reorderEpisodes = useReorderEpisodes(courseId)
  const confirm = useConfirmDialog()

  const [values, setValues] = useState<CourseFormValues>(EMPTY_COURSE)
  const [loadedCourse, setLoadedCourse] = useState<typeof course>()
  const [courseDirty, setCourseDirty] = useState(false)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [thumbnailProgress, setThumbnailProgress] = useState<number | null>(null)
  const [fileUpload, setFileUpload] = useState<{ episodeId: string; percent: number } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null)

  const thumbnailInput = useRef<HTMLInputElement>(null)
  const episodeFileInput = useRef<HTMLInputElement>(null)
  const episodeFileTarget = useRef<string | null>(null)

  if (course && course !== loadedCourse) {
    setLoadedCourse(course)
    if (!courseDirty) setValues({
      title: course.title,
      slug: course.slug,
      description: course.description ?? "",
      level: course.level,
      category: course.category,
      isPremium: course.isPremium,
      isPublished: course.isPublished,
    })
    setEpisodes([...course.episodes].sort((a, b) => a.sortOrder - b.sortOrder))
  }

  const saveCourse = () => {
    const invalid = courseFormError(values)
    if (invalid) {
      toast.error(invalid)
      return
    }
    const payload: CourseUpdatePayload = {
      slug: values.slug,
      title: values.title.trim(),
      // Chuỗi rỗng được gửi thành `null` để xoá được mô tả đã có.
      description: values.description.trim() ? values.description.trim() : null,
      level: values.level,
      category: values.category.trim(),
      isPremium: values.isPremium,
      isPublished: values.isPublished,
    }
    updateCourse.mutate(payload, {
      onSuccess: () => { setCourseDirty(false); toast.success("Đã lưu khoá học") },
      onError: (mutationError) => toast.error(errorMessage(mutationError)),
    })
  }

  const askUnpublish = () =>
    confirm.ask({
      title: "Ngừng xuất bản khoá học?",
      description: course?.title,
      body: "Đây là xoá mềm: khoá học bị ẩn khỏi danh mục công khai nhưng dữ liệu và bài học vẫn được giữ lại.",
      confirmLabel: "Ngừng xuất bản",
      tone: "destructive",
      run: async () => {
        try {
          await unpublishCourse.mutateAsync()
          setValues(current => ({ ...current, isPublished: false }))
          toast.success("Đã ngừng xuất bản khoá học")
        } catch (mutationError) {
          toast.error(errorMessage(mutationError))
          throw mutationError
        }
      },
    })

  const onThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (!THUMBNAIL_ACCEPT.split(",").includes(file.type)) {
      toast.error("Chỉ nhận ảnh JPEG, PNG hoặc WebP")
      return
    }
    if (file.size > THUMBNAIL_MAX_MB * 1024 * 1024) {
      toast.error(`Ảnh tối đa ${THUMBNAIL_MAX_MB} MB`)
      return
    }
    setThumbnailProgress(0)
    uploadThumbnail.mutate(
      { file, onProgress: setThumbnailProgress },
      {
        onSuccess: () => toast.success("Đã tải ảnh đại diện"),
        onError: (mutationError) => toast.error(errorMessage(mutationError)),
        onSettled: () => setThumbnailProgress(null),
      },
    )
  }

  const pickEpisodeFile = (episode: Episode) => {
    episodeFileTarget.current = episode.id
    episodeFileInput.current?.click()
  }

  const onEpisodeFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    const episodeId = episodeFileTarget.current
    episodeFileTarget.current = null
    if (!file || !episodeId) return

    const episode = episodes.find((item) => item.id === episodeId)
    if (!episode) return

    if (episode.contentType === "pdf") {
      if (file.type !== "application/pdf") {
        toast.error("Bài PDF chỉ nhận tệp .pdf")
        return
      }
      if (file.size > PDF_MAX_MB * 1024 * 1024) {
        toast.error(`Tệp PDF tối đa ${PDF_MAX_MB} MB`)
        return
      }
    }
    if (episode.contentType === "video") {
      if (!["video/mp4", "video/webm"].includes(file.type)) {
        toast.error("Bài video chỉ nhận MP4 hoặc WebM")
        return
      }
      if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
        toast.error(`Video tối đa ${VIDEO_MAX_MB} MB`)
        return
      }
    }

    setFileUpload({ episodeId, percent: 0 })
    uploadEpisodeFile.mutate(
      { episodeId, file, onProgress: (percent) => setFileUpload({ episodeId, percent }) },
      {
        onSuccess: () => toast.success("Đã tải tệp bài học"),
        onError: (mutationError) => toast.error(errorMessage(mutationError)),
        onSettled: () => setFileUpload(null),
      },
    )
  }

  /** Ghi thứ tự mới xuống máy chủ; lỗi thì nạp lại thứ tự thật. */
  const persistOrder = (next: Episode[]) => {
    const renumbered = next.map((episode, index) => ({ ...episode, sortOrder: index + 1 }))
    setEpisodes(renumbered)
    reorderEpisodes.mutate(
      renumbered.map((episode) => ({ episodeId: episode.id, sortOrder: episode.sortOrder })),
      {
        onSuccess: () => toast.success("Đã sắp xếp bài học"),
        onError: (mutationError) => {
          toast.error(errorMessage(mutationError))
          void refetch()
        },
      },
    )
  }

  const moveEpisode = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= episodes.length) return
    const next = [...episodes]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    persistOrder(next)
  }

  const dropEpisode = (target: number) => {
    setDragOverIndex(null)
    if (dragIndex === null || dragIndex === target) {
      setDragIndex(null)
      return
    }
    const next = [...episodes]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(target, 0, moved)
    setDragIndex(null)
    persistOrder(next)
  }

  const toggleEpisodePublished = (episode: Episode) => {
    updateEpisode.mutate(
      { episodeId: episode.id, payload: { isPublished: !episode.isPublished } },
      {
        onSuccess: (updated) =>
          toast.success(updated.isPublished ? "Đã xuất bản bài học" : "Đã gỡ xuất bản bài học"),
        onError: (mutationError) => toast.error(errorMessage(mutationError)),
      },
    )
  }

  const askRemoveEpisode = (episode: Episode) =>
    confirm.ask({
      title: "Xoá bài học?",
      description: episode.title,
      body: "Bài học cùng tệp đã tải lên sẽ bị xoá vĩnh viễn và không thể hoàn tác.",
      confirmLabel: "Xoá",
      tone: "destructive",
      run: async () => {
        try {
          await removeEpisode.mutateAsync(episode.id)
          toast.success("Đã xoá bài học")
        } catch (mutationError) {
          toast.error(errorMessage(mutationError))
          throw mutationError
        }
      },
    })

  const saveEpisode = (formValues: EpisodeFormValues, episode: Episode | null) => {
    const markdown = formValues.markdownBody
    if (episode) {
      const payload: EpisodeUpdatePayload = {
        title: formValues.title.trim(),
        description: formValues.description.trim() ? formValues.description.trim() : null,
        sortOrder: formValues.sortOrder,
        isPublished: formValues.isPublished,
      }
      if (episode.contentType === "text") payload.markdownBody = markdown
      else if (episode.markdownBody) payload.markdownBody = null

      updateEpisode.mutate(
        { episodeId: episode.id, payload },
        {
          onSuccess: () => {
            toast.success("Đã lưu bài học")
            setDialogOpen(false)
          },
          onError: (mutationError) => toast.error(errorMessage(mutationError)),
        },
      )
      return
    }

    createEpisode.mutate(
      {
        title: formValues.title.trim(),
        description: formValues.description.trim() || undefined,
        contentType: formValues.contentType,
        markdownBody: formValues.contentType === "text" ? markdown : undefined,
        sortOrder: formValues.sortOrder,
      },
      {
        onSuccess: () => {
          toast.success("Đã thêm bài học")
          setDialogOpen(false)
        },
        onError: (mutationError) => toast.error(errorMessage(mutationError)),
      },
    )
  }

  if (isError) {
    return (
      <WorkspacePage title="Sửa khoá học">
        <PanelState
          title="Không tải được khoá học"
          description={errorMessage(error)}
          action={
            error instanceof ApiError && error.status === 404
              ? { label: "Về danh sách", onClick: () => navigate("/admin/lessons") }
              : { label: "Thử lại", onClick: () => void refetch() }
          }
        />
      </WorkspacePage>
    )
  }

  if (isPending || !course) {
    return (
      <WorkspacePage title="Sửa khoá học">
        <div className="space-y-3">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </WorkspacePage>
    )
  }

  return (
    <WorkspacePage
      title="Sửa khoá học"
      description={`Cập nhật ${formatDateTime(course.updatedAt)} · ${course.totalEpisodes} bài học`}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate("/admin/lessons")}>
            <ArrowLeft aria-hidden="true" />
            Quay lại
          </Button>
          <Button
            variant="destructive"
            disabled={!course.isPublished || unpublishCourse.isPending}
            onClick={askUnpublish}
          >
            <Trash2 aria-hidden="true" />
            Ngừng xuất bản
          </Button>
          <Button disabled={updateCourse.isPending} onClick={saveCourse}>
            {updateCourse.isPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Save aria-hidden="true" />
            )}
            Lưu
          </Button>
        </>
      }
    >
      <EditorCard title="Thông tin khoá học">
        <CourseFields values={values} disabled={updateCourse.isPending} update={(patch) => { setCourseDirty(true); setValues(current => ({ ...current, ...patch })) }} />
      </EditorCard>

      <EditorCard
        title="Ảnh đại diện"
        description={`JPEG, PNG hoặc WebP tối đa ${THUMBNAIL_MAX_MB} MB — máy chủ lưu thành ảnh 1280×720.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              alt="Ảnh đại diện hiện tại"
              className="h-20 w-36 rounded-sm object-cover"
            />
          ) : (
            <div className="flex h-20 w-36 items-center justify-center rounded-sm bg-muted text-xs text-muted-foreground">
              Chưa có ảnh
            </div>
          )}

          <input
            ref={thumbnailInput}
            type="file"
            accept={THUMBNAIL_ACCEPT}
            className="hidden"
            onChange={onThumbnailChange}
          />
          <Button
            variant="outline"
            disabled={uploadThumbnail.isPending}
            onClick={() => thumbnailInput.current?.click()}
          >
            {uploadThumbnail.isPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <ImageUp aria-hidden="true" />
            )}
            Tải ảnh đại diện
          </Button>

          {thumbnailProgress !== null && (
            <Progress value={thumbnailProgress} className="w-40" aria-label="Tiến trình tải ảnh" />
          )}
        </div>
      </EditorCard>

      <EditorCard
        title="Bài học"
        description="Kéo thả hoặc dùng ↑ ↓ để đổi thứ tự — thứ tự được lưu ngay xuống máy chủ."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingEpisode(null)
              setDialogOpen(true)
            }}
          >
            <Plus aria-hidden="true" />
            Thêm bài học
          </Button>
        }
      >
        <input
          ref={episodeFileInput}
          type="file"
          accept="application/pdf,video/mp4,video/webm"
          className="hidden"
          onChange={onEpisodeFileChange}
        />

        {episodes.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Khoá học chưa có bài học nào.
          </p>
        ) : (
          <ul>
            {episodes.map((episode, index) => (
              <li
                key={episode.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOverIndex(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  dropEpisode(index)
                }}
                className={cn(
                  "flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-b-0",
                  dragIndex === index && "opacity-50",
                  dragOverIndex === index && dragIndex !== index && "bg-muted/60",
                )}
              >
                <GripVertical
                  aria-hidden="true"
                  className="size-4 shrink-0 cursor-grab text-muted-foreground"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {episode.sortOrder}. {episode.title}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{CONTENT_TYPE_LABEL[episode.contentType] ?? episode.contentType}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {episode.fileUrl
                        ? `Có tệp ${formatFileSize(episode.fileSizeBytes)}`
                        : "Chưa có tệp"}
                    </span>
                    {episode.durationSeconds != null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatDuration(episode.durationSeconds)}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      {episode.markdownBody
                        ? `${episode.markdownBody.length.toLocaleString("vi-VN")} ký tự markdown`
                        : "Không có markdown"}
                    </span>
                  </p>
                </div>

                <StatusBadge
                  status={episode.isPublished}
                  label={episode.isPublished ? "Đã xuất bản" : "Bản nháp"}
                />

                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      setEditingEpisode(episode)
                      setDialogOpen(true)
                    }}
                  >
                    Sửa
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={updateEpisode.isPending}
                    onClick={() => toggleEpisodePublished(episode)}
                  >
                    {episode.isPublished ? "Gỡ xuất bản" : "Xuất bản"}
                  </Button>
                  {episode.contentType !== "text" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={fileUpload?.episodeId === episode.id}
                      onClick={() => pickEpisodeFile(episode)}
                    >
                      <Upload aria-hidden="true" />
                      Tải tệp
                    </Button>
                  )}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Đưa bài ${episode.title} lên`}
                    disabled={index === 0}
                    onClick={() => moveEpisode(index, -1)}
                  >
                    <ChevronUp aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Đưa bài ${episode.title} xuống`}
                    disabled={index === episodes.length - 1}
                    onClick={() => moveEpisode(index, 1)}
                  >
                    <ChevronDown aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Xoá bài ${episode.title}`}
                    onClick={() => askRemoveEpisode(episode)}
                  >
                    <Trash2 aria-hidden="true" className="text-destructive" />
                  </Button>
                </div>

                {fileUpload?.episodeId === episode.id && (
                  <Progress
                    value={fileUpload.percent}
                    className="w-full"
                    aria-label="Tiến trình tải tệp"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </EditorCard>

      {dialogOpen && (
        <EpisodeDialog
          open
          episode={editingEpisode}
          defaultSortOrder={episodes.length + 1}
          pending={createEpisode.isPending || updateEpisode.isPending}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditingEpisode(null)
          }}
          onSubmit={saveEpisode}
        />
      )}

      {confirm.element}
    </WorkspacePage>
  )
}

/**
 * `/admin/lessons/new` và `/admin/lessons/:id`.
 *
 * Trang tạo không có khoá học nên chỉ gửi một mutation; trang sửa mở đầy đủ
 * phần bài học, ảnh đại diện và sắp xếp.
 */
export function CourseEditPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <CourseCreatePanel />
  return <CourseEditor key={id} courseId={id} />
}
