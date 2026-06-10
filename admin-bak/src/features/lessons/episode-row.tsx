import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, FileText, Video, Type, Pencil, Trash2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Episode } from "@/lib/api/lessons"

const CONTENT_TYPE_ICON: Record<string, React.ElementType> = {
  pdf: FileText,
  video: Video,
  text: Type,
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, "0")
  return `${m}:${s}`
}

interface EpisodeRowProps {
  episode: Episode
  onEdit: (episode: Episode) => void
  onDelete: (episode: Episode) => void
  onTogglePublish: (episode: Episode) => void
  toggleLoading?: boolean
  className?: string
}

export function EpisodeRow({
  episode,
  onEdit,
  onDelete,
  onTogglePublish,
  toggleLoading = false,
  className,
}: EpisodeRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: episode.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const Icon = CONTENT_TYPE_ICON[episode.contentType] ?? FileText

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-shadow",
        isDragging && "shadow-lg opacity-80",
        className,
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing shrink-0"
        aria-label="Kéo để sắp xếp"
      >
        <GripVertical className="size-4" />
      </button>

      {/* Sort order badge */}
      <Badge variant="outline" className="h-5 w-6 shrink-0 items-center justify-center text-xs font-mono">
        {episode.sortOrder}
      </Badge>

      {/* Icon */}
      <Icon className="size-4 shrink-0 text-muted-foreground" />

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{episode.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{episode.contentType}</span>
          {episode.fileSizeBytes && (
            <span>{formatBytes(episode.fileSizeBytes)}</span>
          )}
          {episode.durationSeconds && (
            <span>{formatDuration(episode.durationSeconds)}</span>
          )}
          {!episode.fileUrl && episode.contentType !== "text" && (
            <span className="text-amber-600 dark:text-amber-400">Chưa upload file</span>
          )}
        </div>
      </div>

      {/* Published toggle */}
      <Switch
        checked={episode.isPublished}
        onCheckedChange={() => onTogglePublish(episode)}
        disabled={toggleLoading}
        aria-label="Xuất bản"
      />

      {/* Actions */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onEdit(episode)}
        aria-label="Chỉnh sửa"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
        onClick={() => onDelete(episode)}
        aria-label="Xóa"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
