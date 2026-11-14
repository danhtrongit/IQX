/**
 * /admin/saco/posts/new và /admin/saco/posts/:id: trình soạn bài nhận định (spec "Trình soạn
 * bài trong quản trị"). Cột trái soạn, cột phải xem trước khung (điện thoại: xem trước ở dưới).
 * Tự lưu nháp sau khoảng 1 giây ngừng gõ với `baseRevision`; mất mạng thì giữ bản nháp trên máy
 * và lưu lại khi có mạng; 409 `DRAFT_STALE` thì dừng tự lưu và mời tải bản mới nhất. Bài đã đăng
 * không sửa được: mở ở đây sẽ chuyển sang trang xem.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { Eye, Save, Send } from "lucide-react"
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"
import TextAlign from "@tiptap/extension-text-align"
import { Color, TextStyle } from "@tiptap/extension-text-style"
import { toast } from "sonner"

import { useSacoSelf } from "@/components/layout/admin-saco"
import { PanelState } from "@/components/layout/panel-state"
import { WorkspacePage } from "@/components/layout/workspace-page"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { ApiError, errorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { MyPostDetail } from "@/pages/trading-floor/net/types"
import { formatVnTime } from "@/pages/trading-floor/posts/format"
import { PostCardView, PostTheme } from "@/pages/trading-floor/posts/post-view"

import { isApiError, myPostsApi, type DraftInput } from "./api"
import { EditorToolbar } from "./editor-toolbar"
import { Figure } from "./figure-node"
import { FigureView } from "./figure-view"
import { useCreateDraft, useInvalidateMyPosts, useMyPost } from "./hooks"
import { cleanPastedHtml } from "./paste-cleaner"
import { PostPreviewBody, PostPreviewDialog } from "./post-preview"
import { headlineCounter, HEADLINE_PLACEHOLDER, validateImageFile, validatePost } from "./post-validation"
import "./post-editor.css"

const AUTOSAVE_MS = 1000
const backupKey = (postId: string) => `iqx.saco.post-draft.${postId}`

type Backup = DraftInput & { at: number }

function readBackup(postId: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(postId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Backup>
    if (typeof value.headline !== "string" || typeof value.bodyHtml !== "string" || typeof value.baseRevision !== "number") return null
    return { headline: value.headline, bodyHtml: value.bodyHtml, baseRevision: value.baseRevision, at: Number(value.at) || 0 }
  } catch {
    return null
  }
}

function writeBackup(postId: string, draft: DraftInput) {
  try {
    localStorage.setItem(backupKey(postId), JSON.stringify({ ...draft, at: Date.now() }))
  } catch {
    // Bộ nhớ trình duyệt đầy hoặc bị chặn: bản nháp vẫn còn trong trình soạn.
  }
}

function clearBackup(postId: string) {
  try {
    localStorage.removeItem(backupKey(postId))
  } catch {
    // Không có bộ nhớ trình duyệt.
  }
}

export function PostEditorPage() {
  const { id } = useParams()
  if (!id) return <NewPostRedirect />
  return <PostEditorLoader key={id} postId={id} />
}

/** Viết bài mới: tạo một nháp trống trên máy chủ rồi mở trình soạn của nháp đó. */
function NewPostRedirect() {
  const create = useCreateDraft()
  const navigate = useNavigate()
  const started = useRef(false)
  const { mutate } = create

  const start = useCallback(() => {
    mutate(undefined, { onSuccess: (post) => navigate(`/admin/saco/posts/${post.id}`, { replace: true }) })
  }, [mutate, navigate])

  useEffect(() => {
    if (started.current) return
    started.current = true
    start()
  }, [start])

  return <WorkspacePage title="Viết bài mới">
    {create.isError
      ? <PanelState title="Không tạo được nháp mới" description={errorMessage(create.error)} action={{ label: "Thử lại", onClick: start }} />
      : <div role="status" aria-label="Đang tạo nháp" className="space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-80 w-full" /></div>}
  </WorkspacePage>
}

function PostEditorLoader({ postId }: { postId: string }) {
  const post = useMyPost(postId)
  const [generation, setGeneration] = useState(0)

  const reload = useCallback(async () => {
    clearBackup(postId)
    const result = await post.refetch()
    if (result.isError) {
      toast.error(errorMessage(result.error))
      return
    }
    setGeneration((value) => value + 1)
  }, [post, postId])

  if (post.isError) {
    const missing = post.error instanceof ApiError && post.error.status === 404
    return <WorkspacePage title="Soạn bài nhận định">
      <PanelState
        title={missing ? "Không tìm thấy bài" : "Không tải được bài"}
        description={missing ? "Bài không tồn tại hoặc không phải của bạn." : errorMessage(post.error)}
        action={missing ? undefined : { label: "Thử lại", onClick: () => void post.refetch() }}
      />
    </WorkspacePage>
  }
  if (!post.data) {
    return <WorkspacePage title="Soạn bài nhận định">
      <div role="status" aria-label="Đang tải bài" className="space-y-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-80 w-full" /></div>
    </WorkspacePage>
  }
  // Không sửa bài sau khi đăng: chuyển sang trang xem của bài.
  if (post.data.status !== "draft") return <Navigate replace to={`/admin/saco/posts?view=${encodeURIComponent(postId)}`} />
  return <PostEditor key={generation} post={post.data} onReload={reload} />
}

type SaveStatus =
  | { kind: "saved"; at: number }
  | { kind: "saving" }
  | { kind: "offline" }
  | { kind: "error"; message: string }

function PostEditor({ post, onReload }: { post: MyPostDetail; onReload: () => Promise<void> }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const me = useSacoSelf(true)
  const invalidate = useInvalidateMyPosts()

  // Bản nháp chưa lưu trên máy này (cùng revision với máy chủ) được khôi phục.
  const initial = useMemo(() => {
    const backup = readBackup(post.id)
    if (backup && backup.baseRevision === post.revision && (backup.headline !== post.headline || backup.bodyHtml !== post.bodyHtml)) {
      return { headline: backup.headline, bodyHtml: backup.bodyHtml, restored: true }
    }
    if (backup) clearBackup(post.id)
    return { headline: post.headline, bodyHtml: post.bodyHtml, restored: false }
  }, [post])

  const [headline, setHeadline] = useState(initial.headline)
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved", at: post.savedAt })
  const [stale, setStale] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [preview, setPreview] = useState<{ html: string; at: number } | null>(null)

  const headlineRef = useRef(initial.headline)
  const revision = useRef(post.revision)
  const dirty = useRef(initial.restored)
  const version = useRef(0)
  const staleRef = useRef(false)
  const done = useRef(false)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const uploadRef = useRef<(files: File[]) => void>(() => undefined)

  const currentDraft = useCallback((): DraftInput | null => {
    const editor = editorRef.current
    if (!editor || editor.isDestroyed) return null
    return { headline: headlineRef.current, bodyHtml: editor.getHTML(), baseRevision: revision.current }
  }, [])

  const markStale = useCallback(() => {
    staleRef.current = true
    setStale(true)
    if (timer.current) clearTimeout(timer.current)
    editorRef.current?.setEditable(false)
  }, [])

  /** Một lần lưu; các lần lưu chạy nối tiếp nhau để luôn gửi đúng `baseRevision` mới nhất. */
  const saveNow = useCallback((): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      if (staleRef.current || done.current) return false
      if (!dirty.current) return true
      const draft = currentDraft()
      if (!draft) return false
      const startVersion = version.current
      writeBackup(post.id, draft)
      setStatus({ kind: "saving" })
      try {
        const result = await myPostsApi.save(post.id, draft)
        revision.current = result.revision
        if (version.current === startVersion) {
          dirty.current = false
          clearBackup(post.id)
        } else {
          // Có chữ mới trong lúc lưu: bản trên máy mang revision mới để còn khôi phục được.
          const latest = currentDraft()
          if (latest) writeBackup(post.id, latest)
        }
        setStatus({ kind: "saved", at: result.savedAt })
        return true
      } catch (error) {
        if (isApiError(error, "DRAFT_STALE")) {
          markStale()
          return false
        }
        const offline = !(error instanceof ApiError) || (typeof navigator !== "undefined" && !navigator.onLine)
        setStatus(offline ? { kind: "offline" } : { kind: "error", message: errorMessage(error) })
        return false
      }
    }
    const next = queue.current.then(run, run)
    queue.current = next
    return next
  }, [currentDraft, markStale, post.id])

  const scheduleSave = useCallback(() => {
    if (staleRef.current || done.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void saveNow()
    }, AUTOSAVE_MS)
  }, [saveNow])

  const markChanged = useCallback(() => {
    version.current += 1
    dirty.current = true
    scheduleSave()
  }, [scheduleSave])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        code: false,
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: false,
          linkOnPaste: false,
          protocols: ["https"],
          defaultProtocol: "https",
          isAllowedUri: (url) => /^https:\/\//i.test(url),
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
        },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
      TableKit.configure({ table: { resizable: false } }),
      Figure.extend({ addNodeView: () => ReactNodeViewRenderer(FigureView) }),
    ],
    content: initial.bodyHtml,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { "aria-label": "Nội dung bài", "aria-multiline": "true", role: "textbox" },
      transformPastedHTML: cleanPastedHtml,
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"))
        if (files.length === 0) return false
        event.preventDefault()
        uploadRef.current(files)
        return true
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"))
        if (files.length === 0) return false
        event.preventDefault()
        uploadRef.current(files)
        return true
      },
    },
    onUpdate: () => markChanged(),
  })
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  /** Chọn file hoặc dán ảnh: kiểm tra định dạng và 5 MB, tải lên, chèn các ảnh thành công dưới khối đang đứng. */
  const uploadFiles = useCallback(async (files: File[]) => {
    const valid: File[] = []
    for (const file of files) {
      const problem = validateImageFile(file)
      if (problem) toast.error(files.length > 1 ? `${file.name}: ${problem}` : problem)
      else valid.push(file)
    }
    if (valid.length === 0) return
    setUploading((count) => count + valid.length)
    const results = await Promise.allSettled(valid.map((file) => myPostsApi.uploadImage(post.id, file)))
    setUploading((count) => count - valid.length)
    const urls: string[] = []
    results.forEach((result, index) => {
      if (result.status === "fulfilled") urls.push(result.value.url)
      else toast.error(`Không tải được ảnh ${valid[index].name}: ${errorMessage(result.reason)}`)
    })
    const current = editorRef.current
    if (urls.length && current && !current.isDestroyed && current.isEditable) current.chain().focus().insertFiguresBelow(urls).run()
  }, [post.id])
  useEffect(() => {
    uploadRef.current = (files) => void uploadFiles(files)
  }, [uploadFiles])

  // Nháp khôi phục từ máy: báo và lưu lên máy chủ.
  useEffect(() => {
    if (!initial.restored) return
    toast.info("Đã khôi phục bản nháp chưa lưu trên máy này")
    scheduleSave()
  }, [initial.restored, scheduleSave])

  // Có mạng lại: lưu phần còn dang dở.
  useEffect(() => {
    const onOnline = () => {
      if (dirty.current) void saveNow()
    }
    const onBeforeUnload = () => {
      const draft = dirty.current && !done.current ? currentDraft() : null
      if (draft) writeBackup(post.id, draft)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [currentDraft, post.id, saveNow])

  // Rời trình soạn khi còn chữ chưa lưu: giữ trên máy và gửi một lần lưu cuối.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (!dirty.current || done.current || staleRef.current) return
    const draft = currentDraft()
    if (!draft) return
    writeBackup(post.id, draft)
    void myPostsApi.save(post.id, draft, true).then(() => clearBackup(post.id), () => undefined)
  }, [currentDraft, post.id])

  const onHeadline = (value: string) => {
    setHeadline(value)
    headlineRef.current = value
    markChanged()
  }

  const saveDraft = async () => {
    if (timer.current) clearTimeout(timer.current)
    dirty.current = true
    if (await saveNow()) toast.success("Đã lưu nháp")
  }

  const publish = async () => {
    const current = editorRef.current
    if (!current || publishing) return
    const bodyHtml = current.getHTML()
    const problem = validatePost({ headline, bodyHtml })
    if (problem) {
      toast.error(problem)
      return
    }
    setPublishing(true)
    if (timer.current) clearTimeout(timer.current)
    try {
      // Đợi lần tự lưu đang chạy để gửi đúng revision; máy chủ lưu rồi đăng trong một bước.
      await queue.current.catch(() => undefined)
      if (staleRef.current) return
      await myPostsApi.publish(post.id, { headline: headline.trim(), bodyHtml: current.getHTML(), baseRevision: revision.current })
      done.current = true
      dirty.current = false
      clearBackup(post.id)
      toast.success("Đã đăng. Bài lên đầu bảng SACO nhận định.")
      void invalidate()
      navigate("/admin/saco/posts")
    } catch (error) {
      if (isApiError(error, "DRAFT_STALE")) markStale()
      else toast.error(errorMessage(error))
    } finally {
      setPublishing(false)
    }
  }

  const counter = headlineCounter(headline)
  const sacoName = me.data?.saco?.name ?? user?.full_name ?? "SACO"
  const busy = stale || publishing

  return <WorkspacePage
    title="Soạn bài nhận định"
    actions={<>
      <Button type="button" variant="outline" disabled={!editor} onClick={() => setPreview({ html: editor.getHTML(), at: Date.now() })}><Eye data-icon="inline-start" />Xem trước bài dài</Button>
      <Button type="button" variant="outline" disabled={busy || status.kind === "saving"} onClick={() => void saveDraft()}><Save data-icon="inline-start" />Lưu nháp</Button>
      <Button type="button" disabled={busy || uploading > 0} onClick={() => void publish()}><Send data-icon="inline-start" />{publishing ? "Đang đăng…" : "Đăng bài"}</Button>
    </>}
  >
    {stale && <Alert variant="destructive">
      <AlertTitle>Nháp đã được sửa ở nơi khác</AlertTitle>
      <AlertDescription>
        <p>Bản này đã cũ nên tự lưu đã dừng. Tải bản mới nhất để soạn tiếp.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void onReload()}>Tải bản mới nhất</Button>
      </AlertDescription>
    </Alert>}

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="saco-headline" className="text-sm font-medium">Câu tiêu điểm</label>
            <span className={cn("text-xs tabular-nums", counter.over ? "font-semibold text-destructive" : "text-muted-foreground")} aria-live="polite">{counter.label}</span>
          </div>
          <Input
            id="saco-headline"
            value={headline}
            onChange={(event) => onHeadline(event.target.value)}
            placeholder={HEADLINE_PLACEHOLDER}
            aria-invalid={counter.over}
            disabled={stale}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium" id="saco-body-label">Nội dung bài</span>
            <SaveLine status={status} uploading={uploading} onRetry={() => void saveNow()} />
          </div>
          <Card className="saco-editor gap-0 py-0" aria-labelledby="saco-body-label">
            <EditorToolbar editor={editor} disabled={stale} onPickImages={(files) => void uploadFiles(files)} />
            <EditorContent editor={editor} />
          </Card>
          <p className="text-xs text-muted-foreground">Ảnh JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh; dán thẳng ảnh từ clipboard cũng được. Dòng miễn trừ cuối bài do hệ thống tự thêm.</p>
        </div>
      </div>

      <aside className="space-y-2 lg:sticky lg:top-0 lg:self-start" aria-label="Xem trước khung nhận định">
        <p className="text-sm font-medium">Xem trước khung</p>
        <PostTheme className="rounded-lg bg-[var(--tfp-panel)] p-4">
          <PostCardView sacoName={sacoName} headline={headline.trim() || HEADLINE_PLACEHOLDER} hearts={0} hearted={false} />
        </PostTheme>
        <p className="text-xs text-muted-foreground">Khung hiện trên bảng SACO nhận định ở khu giao dịch: tên SACO, câu tiêu điểm, tim, Nhắn SACO, Đọc tiếp.</p>
      </aside>
    </div>

    <PostPreviewDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)} title="Xem trước bài dài">
      {preview !== null && <PostPreviewBody sacoName={sacoName} publishedAt={preview.at} headline={headline.trim()} bodyHtml={preview.html} />}
    </PostPreviewDialog>
  </WorkspacePage>
}

function SaveLine({ status, uploading, onRetry }: { status: SaveStatus; uploading: number; onRetry: () => void }) {
  return <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
    {uploading > 0 && <span>Đang tải {uploading} ảnh…</span>}
    {status.kind === "saving" && <span>Đang lưu…</span>}
    {status.kind === "saved" && <span className="tabular-nums">Đã lưu nháp lúc {formatVnTime(status.at)}</span>}
    {status.kind === "offline" && <span className="text-status-warning">Mất kết nối. Nháp được giữ trên máy này và tự lưu khi có mạng lại.</span>}
    {status.kind === "error" && <>
      <span className="text-destructive">Chưa lưu được: {status.message}</span>
      <Button type="button" variant="outline" size="xs" onClick={onRetry}>Thử lại</Button>
    </>}
  </p>
}
