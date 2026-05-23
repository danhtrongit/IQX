import { useNavigate } from "react-router"
import { BookOpen, Clock, Crown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { fmtDuration } from "@/lib/format"
import type { CourseCard, CourseLevel } from "@/lib/api/lessons"

const LEVEL_LABEL: Record<CourseLevel, string> = {
  beginner: "Cơ bản",
  intermediate: "Trung cấp",
  advanced: "Nâng cao",
}

const LEVEL_COLOR: Record<CourseLevel, string> = {
  beginner: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  intermediate: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  advanced: "bg-purple-500/15 text-purple-400 border-purple-500/20",
}

/** Gradient placeholders when no thumbnail */
const GRADIENTS = [
  "from-blue-600 to-indigo-700",
  "from-emerald-600 to-teal-700",
  "from-violet-600 to-purple-700",
  "from-rose-600 to-pink-700",
  "from-amber-600 to-orange-700",
]

function getGradient(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  return GRADIENTS[hash % GRADIENTS.length]
}

interface LessonCardProps {
  course: CourseCard
  className?: string
}

export function LessonCard({ course, className }: LessonCardProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(`/bai-hoc/${course.slug}`)}
      className={cn(
        "group w-full text-left rounded-xl border border-border bg-card overflow-hidden",
        "transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 hover:border-border/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className
      )}
    >
      {/* Thumbnail — 16:9 aspect ratio */}
      <div className="relative aspect-video overflow-hidden">
        {course.thumbnailUrl ? (
          <img
            src={course.thumbnailUrl}
            alt={course.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className={cn(
              "w-full h-full bg-gradient-to-br flex items-center justify-center",
              getGradient(course.slug)
            )}
          >
            <BookOpen className="size-10 text-white/50" />
          </div>
        )}

        {/* Premium badge overlay */}
        {course.isPremium && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 backdrop-blur-sm">
              <Crown className="size-2.5" />
              Premium
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {course.title}
        </h3>

        {course.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {course.description}
          </p>
        )}

        {/* Bottom row */}
        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
          {/* Level badge */}
          <span
            className={cn(
              "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border",
              LEVEL_COLOR[course.level]
            )}
          >
            {LEVEL_LABEL[course.level]}
          </span>

          {/* Free / Premium */}
          {!course.isPremium && (
            <Badge
              variant="outline"
              className="text-[10px] h-auto px-1.5 py-0.5 font-medium text-emerald-400 border-emerald-500/30"
            >
              Miễn phí
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <BookOpen className="size-3" />
              {course.totalEpisodes} bài
            </span>
            {course.totalDurationSeconds > 0 && (
              <span className="flex items-center gap-0.5">
                <Clock className="size-3" />
                {fmtDuration(course.totalDurationSeconds)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
