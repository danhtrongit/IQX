import { Navigate, useLocation, useParams } from "react-router"

import { academyWorkspaceLocation } from "./workspace-url"

/**
 * `/hoc-vien[/:lessonId]` now lives in the workspace's Học viện tool
 * (`/demo-trading?view=academy&lesson=…`); a lesson id in the path is kept.
 */
export function AcademyRedirect() {
  const { lessonId } = useParams()
  const location = useLocation()
  return <Navigate replace to={academyWorkspaceLocation(lessonId, location.search, location.hash)} />
}
