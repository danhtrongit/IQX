import { useNavigate } from "react-router"
import { Card, Tag, Typography } from "@arco-design/web-react"
import { IconBook, IconClockCircle, IconTrophy } from "@arco-design/web-react/icon"
import { fmtDuration } from "@/shared/lib/format"
import { cn } from "@/shared/lib/cn"
import { LEVEL_LABEL, LEVEL_TAG_COLOR, getGradient } from "../constants"
import type { CourseCard } from "../types"

interface LessonCardProps {
  course: CourseCard
  className?: string
}

export function LessonCard({ course, className }: LessonCardProps) {
  const navigate = useNavigate()

  return (
    <Card
      hoverable
      bordered
      onClick={() => navigate(`/bai-hoc/${course.slug}`)}
      className={cn("cursor-pointer overflow-hidden h-full", className)}
      bodyStyle={{ padding: 12 }}
      cover={
        <div className="relative aspect-video overflow-hidden">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            />
          ) : (
            <div
              className={cn(
                "w-full h-full bg-gradient-to-br flex items-center justify-center",
                getGradient(course.slug),
              )}
            >
              <IconBook style={{ fontSize: 36, color: "rgba(255,255,255,0.5)" }} />
            </div>
          )}

          {course.isPremium && (
            <span
              className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md text-white text-[10px] font-bold px-1.5 py-0.5 backdrop-blur-sm"
              style={{ background: "rgba(245, 158, 11, 0.92)" }}
            >
              <IconTrophy style={{ fontSize: 10 }} />
              Premium
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <Typography.Title
          heading={6}
          ellipsis={{ rows: 2 }}
          style={{ margin: 0, fontSize: 14, lineHeight: 1.3 }}
        >
          {course.title}
        </Typography.Title>

        {course.description && (
          <Typography.Paragraph
            ellipsis={{ rows: 2 }}
            style={{ margin: 0, fontSize: 12, color: "var(--color-text-3)" }}
          >
            {course.description}
          </Typography.Paragraph>
        )}

        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
          <Tag size="small" color={LEVEL_TAG_COLOR[course.level]}>
            {LEVEL_LABEL[course.level]}
          </Tag>
          {!course.isPremium && (
            <Tag size="small" color="green" bordered>
              Miễn phí
            </Tag>
          )}

          <div
            className="ml-auto flex items-center gap-2 text-[10px]"
            style={{ color: "var(--color-text-3)" }}
          >
            <span className="flex items-center gap-0.5">
              <IconBook style={{ fontSize: 12 }} />
              {course.totalEpisodes} bài
            </span>
            {course.totalDurationSeconds > 0 && (
              <span className="flex items-center gap-0.5">
                <IconClockCircle style={{ fontSize: 12 }} />
                {fmtDuration(course.totalDurationSeconds)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
