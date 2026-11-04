import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import type { MascotId } from "@/pages/demo-trading/journey/types"
import { MascotStage } from "@/pages/demo-trading/workspace/mascot-stage"
import { useAcademyDeepLink } from "./deep-link"
import { LessonReader } from "./lesson-reader"
import { useAcademyNavigation } from "./navigation"

/**
 * Main (left) area of the Học viện tool: the mascot stage while no lesson is open, the lesson
 * reader otherwise. The open lesson comes from the URL, so the panel and this area never disagree.
 * A `metric` in the URL (spec v4 §6 deep link) is resolved here to a lesson; until then a placeholder
 * stands in for the stage or the previous lesson.
 */
export function AcademyMain({ mascotId }: { mascotId: MascotId }) {
  const { lessonId } = useAcademyNavigation()
  const { isAuthenticated, isLoading } = useAuth()
  const link = useAcademyDeepLink()
  // A guest has no lessons to read: the mascot stage stays and the panel offers the sign-in.
  if (!isAuthenticated && !isLoading) return <MascotStage mascotId={mascotId} />
  if (link.pending) {
    return (
      <div className="mx-auto w-full max-w-[1000px] space-y-3" role="status" aria-busy="true" aria-label="Đang mở bài học">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }
  if (!lessonId) return <MascotStage mascotId={mascotId} />
  return <LessonReader key={lessonId} lessonId={lessonId} />
}
