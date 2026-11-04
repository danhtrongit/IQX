import { Navigate, useLocation, useParams } from "react-router"

import { academyWorkspaceLocation } from "./workspace-url"

/**
 * `/hoc-vien[/:lessonId]` (and its alias `/academy`) now lives in the workspace's Học viện tool
 * (`/demo-trading?view=academy&lesson=…`); a lesson id in the path is kept, and so is a
 * `?metric=<key>` query (spec v4 §6): the tool resolves it to the lesson of that metric.
 */
export function AcademyRedirect() {
  const { lessonId } = useParams()
  const location = useLocation()
  return <Navigate replace to={academyWorkspaceLocation(lessonId, location.search, location.hash)} />
}

/**
 * `/hoc-vien/bai/:metric` (spec v4 §6, the "Học" button of the Dashboard phân tích): open the lesson of a
 * metric by its key or name, e.g. `/hoc-vien/bai/NIM` or `/hoc-vien/bai/T%E1%BB%B7%20l%E1%BB%87...`. The
 * name travels to the workspace as `metric=`; the Học viện tool asks the server which lesson it is.
 */
export function AcademyMetricRedirect() {
  const { metric } = useParams()
  const location = useLocation()
  return <Navigate replace to={academyWorkspaceLocation(undefined, location.search, location.hash, metric)} />
}
