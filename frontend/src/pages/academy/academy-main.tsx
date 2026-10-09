import { useAuth } from "@/hooks/use-auth"
import type { MascotId } from "@/pages/demo-trading/journey/types"
import { MascotStage } from "@/pages/demo-trading/workspace/mascot-stage"
import { LessonReader } from "./lesson-reader"
import { useAcademyNavigation } from "./navigation"

/**
 * Main (left) area of the Học viện tool: the mascot stage while no lesson is open, the lesson
 * reader otherwise. The open lesson comes from the URL, so the panel and this area never disagree.
 */
export function AcademyMain({ mascotId }: { mascotId: MascotId }) {
  const { lessonId } = useAcademyNavigation()
  const { isAuthenticated, isLoading } = useAuth()
  // A guest has no lessons to read: the mascot stage stays and the panel offers the sign-in.
  if (!lessonId || (!isAuthenticated && !isLoading)) return <MascotStage mascotId={mascotId} />
  return <LessonReader key={lessonId} lessonId={lessonId} />
}
