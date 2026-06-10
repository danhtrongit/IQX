import { useState } from "react"
import { ImageIcon } from "lucide-react"
import { FileDropzone } from "@/components/upload/file-dropzone"

interface ThumbnailUploaderProps {
  courseId: string
  currentUrl: string | null
  onSuccess: (newUrl: string) => void
  disabled?: boolean
}

interface ThumbnailUploadResponse {
  thumbnail_url?: string
}

export function ThumbnailUploader({
  courseId,
  currentUrl,
  onSuccess,
  disabled = false,
}: ThumbnailUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl)

  const handleSuccess = async (res: Response) => {
    try {
      const data = (await res.clone().json()) as ThumbnailUploadResponse
      const url = data.thumbnail_url ?? null
      if (url) {
        setPreviewUrl(url)
        onSuccess(url)
      }
    } catch {
      // ignore parse error — parent can refetch
    }
  }

  return (
    <div className="space-y-3">
      {/* Preview */}
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-border aspect-video bg-muted">
          <img
            src={previewUrl}
            alt="Thumbnail preview"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
          <ImageIcon className="size-10 text-muted-foreground" />
        </div>
      )}

      {/* Dropzone */}
      <FileDropzone
        accept="image/jpeg,image/png,image/webp"
        maxSizeMb={5}
        url={`admin/lessons/courses/${courseId}/thumbnail`}
        onSuccess={(res) => { void handleSuccess(res) }}
        label={previewUrl ? "Thay thumbnail mới" : "Upload thumbnail (1280×720)"}
        disabled={disabled}
      />
    </div>
  )
}
