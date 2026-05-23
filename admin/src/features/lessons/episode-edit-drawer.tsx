import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
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
import { FileDropzone } from "@/components/upload/file-dropzone"
import { lessonsApi, type Episode, type EpisodeContentType } from "@/lib/api/lessons"
import { FileText, Video, Type } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Zod schema ─────────────────────────────────────────────────────────────

const schema = z
  .object({
    title: z.string().min(1, "Tiêu đề là bắt buộc").max(200, "Tối đa 200 ký tự"),
    description: z.string().optional(),
    contentType: z.enum(["pdf", "video", "text"]),
    markdownBody: z.string().optional(),
    isPublished: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.contentType === "text" && !data.markdownBody?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["markdownBody"],
        message: "Nội dung markdown là bắt buộc khi loại nội dung là Text",
      })
    }
    if (data.markdownBody && data.markdownBody.length > 200 * 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["markdownBody"],
        message: "Nội dung quá lớn (tối đa 200KB)",
      })
    }
  })

type FormValues = z.infer<typeof schema>

// ── Content type option ───────────────────────────────────────────────────

const CONTENT_TYPE_OPTIONS: {
  value: EpisodeContentType
  label: string
  icon: React.ElementType
  desc: string
}[] = [
  { value: "text", label: "Text (Markdown)", icon: Type, desc: "Nội dung văn bản" },
  { value: "pdf", label: "PDF", icon: FileText, desc: "Tài liệu PDF" },
  { value: "video", label: "Video", icon: Video, desc: "Video MP4/WebM" },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Props ──────────────────────────────────────────────────────────────────

interface EpisodeEditDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseId: string
  /** Episode to edit — null means create mode */
  episode: Episode | null
  /** Called after create/update so parent can refresh */
  onSaved: (episode: Episode) => void
}

// ── Component ──────────────────────────────────────────────────────────────

export function EpisodeEditDrawer({
  open,
  onOpenChange,
  courseId,
  episode,
  onSaved,
}: EpisodeEditDrawerProps) {
  const isEdit = !!episode
  const [saving, setSaving] = useState(false)
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(episode)

  // Sync when episode prop changes (e.g., opening different episode)
  useEffect(() => {
    setCurrentEpisode(episode)
  }, [episode])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      contentType: "text",
      markdownBody: "",
      isPublished: true,
    },
  })

  // Populate form when episode changes
  useEffect(() => {
    if (episode) {
      form.reset({
        title: episode.title,
        description: episode.description ?? "",
        contentType: episode.contentType,
        markdownBody: episode.markdownBody ?? "",
        isPublished: episode.isPublished,
      })
    } else {
      form.reset({
        title: "",
        description: "",
        contentType: "text",
        markdownBody: "",
        isPublished: true,
      })
    }
  }, [episode, form])

  const contentType = form.watch("contentType")

  const onSubmit = async (values: FormValues) => {
    setSaving(true)
    try {
      let saved: Episode
      if (isEdit && currentEpisode) {
        saved = await lessonsApi.updateEpisode(currentEpisode.id, {
          title: values.title,
          description: values.description || undefined,
          markdownBody: values.contentType === "text" ? values.markdownBody : undefined,
          isPublished: values.isPublished,
        })
        toast.success("Đã lưu episode")
      } else {
        saved = await lessonsApi.createEpisode(courseId, {
          title: values.title,
          description: values.description || undefined,
          contentType: values.contentType,
          markdownBody: values.contentType === "text" ? values.markdownBody : undefined,
        })
        toast.success("Đã tạo episode")
      }
      setCurrentEpisode(saved)
      onSaved(saved)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }

  const handleFileUploadSuccess = async (res: Response) => {
    try {
      const updated = (await res.clone().json()) as {
        id: string
        file_url: string | null
        file_size_bytes: number | null
        duration_seconds: number | null
        is_published: boolean
        sort_order: number
        course_id: string
        title: string
        description: string | null
        content_type: string
        markdown_body: string | null
        created_at: string
        updated_at: string
      }
      const mapped: Episode = {
        id: updated.id,
        courseId: updated.course_id,
        title: updated.title,
        description: updated.description,
        contentType: updated.content_type as EpisodeContentType,
        fileUrl: updated.file_url,
        markdownBody: updated.markdown_body,
        durationSeconds: updated.duration_seconds,
        fileSizeBytes: updated.file_size_bytes,
        sortOrder: updated.sort_order,
        isPublished: updated.is_published,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      }
      setCurrentEpisode(mapped)
      onSaved(mapped)
    } catch {
      // ignore — parent will refetch anyway
    }
  }

  const episodeForUpload = currentEpisode

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Chỉnh sửa episode" : "Thêm episode mới"}</SheetTitle>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => { void form.handleSubmit(onSubmit)(e) }}
            className="mt-6 space-y-5"
          >
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tiêu đề *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ví dụ: Giới thiệu phân tích kỹ thuật" {...field} />
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
                  <FormLabel>Mô tả ngắn</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tóm tắt nội dung episode..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Content type — locked in edit mode */}
            <FormField
              control={form.control}
              name="contentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Loại nội dung{" "}
                    {isEdit && (
                      <span className="text-xs text-muted-foreground font-normal">
                        (không thể thay đổi sau khi tạo)
                      </span>
                    )}
                  </FormLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTENT_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isEdit}
                        onClick={() => !isEdit && field.onChange(opt.value)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-xs transition-colors",
                          field.value === opt.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40",
                          isEdit && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <opt.icon className="size-4" />
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-muted-foreground">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Markdown editor (text type) */}
            {contentType === "text" && (
              <FormField
                control={form.control}
                name="markdownBody"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nội dung Markdown *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="# Tiêu đề&#10;&#10;Nội dung..."
                        className="font-mono resize-y text-sm"
                        rows={12}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* isPublished */}
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
                      />
                    </FormControl>
                    <Label className="cursor-pointer" onClick={() => field.onChange(!field.value)}>
                      Xuất bản episode
                    </Label>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo episode"}
              </Button>
            </SheetFooter>
          </form>
        </Form>

        {/* File upload section — only after episode is created and content_type is pdf/video */}
        {episodeForUpload && (episodeForUpload.contentType === "pdf" || episodeForUpload.contentType === "video") && (
          <div className="mt-8 space-y-3 border-t pt-6">
            <h3 className="text-sm font-semibold">File đính kèm</h3>

            {/* Show current file info */}
            {episodeForUpload.fileUrl && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <p className="font-medium text-green-700 dark:text-green-400">File đã upload</p>
                {episodeForUpload.fileSizeBytes && (
                  <p className="text-muted-foreground text-xs">
                    Dung lượng: {formatBytes(episodeForUpload.fileSizeBytes)}
                  </p>
                )}
                {episodeForUpload.durationSeconds && (
                  <p className="text-muted-foreground text-xs">
                    Thời lượng: {Math.floor(episodeForUpload.durationSeconds / 60)}:{String(episodeForUpload.durationSeconds % 60).padStart(2, "0")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground truncate">{episodeForUpload.fileUrl}</p>
              </div>
            )}

            {/* Upload / replace */}
            <FileDropzone
              accept={
                episodeForUpload.contentType === "pdf"
                  ? "application/pdf"
                  : "video/mp4,video/webm"
              }
              maxSizeMb={episodeForUpload.contentType === "pdf" ? 50 : 500}
              url={`admin/lessons/episodes/${episodeForUpload.id}/file`}
              onSuccess={(res) => { void handleFileUploadSuccess(res) }}
              label={episodeForUpload.fileUrl ? "Thay file mới" : "Upload file"}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
