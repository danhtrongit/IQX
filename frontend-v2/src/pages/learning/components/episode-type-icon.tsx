import { BookOpen, FileText, Video, type LucideIcon } from "lucide-react"

import type { EpisodeContentType } from "../types"

/** Biểu tượng theo loại nội dung; giá trị lạ của server rơi về bài đọc. */
const ICON_BY_CONTENT_TYPE: Record<string, LucideIcon> = {
  pdf: FileText,
  video: Video,
  text: BookOpen,
}

export function EpisodeTypeIcon({
  contentType,
  className,
}: {
  contentType: EpisodeContentType | string
  className?: string
}) {
  const Icon = ICON_BY_CONTENT_TYPE[contentType] ?? BookOpen
  return <Icon aria-hidden="true" className={className} />
}
