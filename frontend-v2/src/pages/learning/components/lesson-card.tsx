import { BookOpen, Clock, Trophy } from "lucide-react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { LEVEL_LABEL } from "../constants"
import { formatDuration } from "../format"
import type { CourseCard as CourseCardModel } from "../types"

/**
 * Thẻ khoá học trong danh mục — toàn bộ thẻ là một liên kết nên bàn phím và
 * trình đọc màn hình dùng được ngay, không cần lớp `onClick` giả.
 */
export function LessonCard({ course, className }: { course: CourseCardModel; className?: string }) {
  return (
    <Link
      to={`/bai-hoc/${course.slug}`}
      className={`group flex h-full flex-col overflow-hidden rounded-lg bg-card text-card-foreground outline-none transition-colors duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 ${className ?? ""}`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            alt={course.title}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center" aria-hidden="true">
            <BookOpen className="size-8 text-muted-foreground/50" />
          </div>
        )}
        {course.isPremium && (
          <Badge variant="gold" className="absolute top-2 right-2">
            <Trophy aria-hidden="true" />
            Premium
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 font-heading text-sm leading-snug font-semibold">
          {course.title}
        </h3>
        {course.description && (
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{course.description}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Badge variant="outline">{LEVEL_LABEL[course.level] ?? course.level}</Badge>
          {!course.isPremium && <Badge variant="secondary">Miễn phí</Badge>}

          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen aria-hidden="true" className="size-3" />
              {course.totalEpisodes} bài
            </span>
            {course.totalDurationSeconds > 0 && (
              <span className="flex items-center gap-1">
                <Clock aria-hidden="true" className="size-3" />
                {formatDuration(course.totalDurationSeconds)}
              </span>
            )}
          </span>
        </div>
      </div>
    </Link>
  )
}
