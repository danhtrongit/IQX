import { useRef, useState, useCallback } from "react"
import { UploadCloud, X, FileIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { uploadFile } from "@/lib/api/lessons"
import { toast } from "sonner"

interface FileDropzoneProps {
  /** Accepted MIME types, e.g. "application/pdf" or "video/mp4,video/webm" */
  accept: string
  /** Max size in MB */
  maxSizeMb: number
  /** Upload destination path relative to API_BASE, e.g. "admin/lessons/episodes/{id}/file" */
  url: string
  /** Called with the raw Response on success */
  onSuccess: (response: Response) => void | Promise<void>
  /** Called on error */
  onError?: (err: Error) => void
  /** Custom label */
  label?: string
  disabled?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileDropzone({
  accept,
  maxSizeMb,
  url,
  onSuccess,
  onError,
  label,
  disabled = false,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)

  const acceptedMimes = accept.split(",").map((s) => s.trim())

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!acceptedMimes.includes(file.type) && !acceptedMimes.includes("*")) {
        return `Loại file không hợp lệ (chấp nhận: ${accept})`
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        return `File quá lớn (max ${maxSizeMb} MB)`
      }
      return null
    },
    [accept, acceptedMimes, maxSizeMb],
  )

  const handleFile = useCallback(
    (file: File) => {
      const err = validateFile(file)
      if (err) {
        toast.error(err)
        return
      }
      setSelectedFile(file)
      setProgress(null)
    },
    [validateFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled, handleFile],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // reset input so the same file can be re-selected
      e.target.value = ""
    },
    [handleFile],
  )

  const handleUpload = useCallback(async () => {
    if (!selectedFile || uploading) return
    const controller = new AbortController()
    abortRef.current = controller
    setUploading(true)
    setProgress(0)
    try {
      const res = await uploadFile(url, selectedFile, setProgress, controller.signal)
      setProgress(100)
      toast.success("Upload thành công")
      setSelectedFile(null)
      await onSuccess(res)
    } catch (err) {
      const e = err instanceof Error ? err : new Error("Upload thất bại")
      if (e.message !== "Upload cancelled") {
        toast.error(e.message)
        onError?.(e)
      }
    } finally {
      setUploading(false)
      setProgress(null)
      abortRef.current = null
    }
  }, [selectedFile, uploading, url, onSuccess, onError])

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const handleRemove = () => {
    setSelectedFile(null)
    setProgress(null)
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {!selectedFile && (
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors",
            dragging
              ? "border-primary bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50",
          )}
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <UploadCloud className="size-8 text-muted-foreground" />
          <span>{label ?? "Kéo thả file vào đây hoặc nhấn để chọn"}</span>
          <span className="text-xs text-muted-foreground">
            {accept} · Tối đa {maxSizeMb} MB
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Selected file row */}
      {selectedFile && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center gap-3">
            <FileIcon className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={handleRemove}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          {progress !== null && (
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {uploading ? (
              <>
                <span className="text-xs text-muted-foreground self-center">
                  {progress !== null ? `${Math.round(progress)}%` : "Đang upload..."}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={handleCancel} className="ml-auto">
                  Hủy
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => { void handleUpload() }} className="ml-auto">
                Upload
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
