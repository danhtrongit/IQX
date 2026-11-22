import { Navigate, useLocation, useParams } from "react-router"

import { academyWorkspaceLocation } from "./workspace-url"

/**
 * `/hoc-vien[/:lessonId]` (and its alias `/academy`) now lives in LUYỆN TẬP → Học viện
 * (`/luyen-tap?tool=hoc-vien&lesson=…`); a lesson id in the path is kept, and so is a
 * `?metric=<key>[&nganh=<code>]` query (spec v4 §6, v5 §6: the Dashboard emits `/academy?metric=&nganh=`):
 * the tool resolves it to the lesson of that metric in that industry.
 */
export function AcademyRedirect() {
  const { lessonId } = useParams()
  const location = useLocation()
  return <Navigate replace to={academyWorkspaceLocation(lessonId, location.search, location.hash)} />
}

/**
 * `/hoc-vien/bai/:metric` (spec v4 §6, the "Học" button of the Dashboard phân tích): open the lesson of a
 * metric by its key or name, e.g. `/hoc-vien/bai/NIM` or `/hoc-vien/bai/T%E1%BB%B7%20l%E1%BB%87...`. The
 * name travels to the workspace as `metric=`, a `?nganh=<code>` query with it (spec v5 §6.1); the Học viện
 * tool asks the server which lesson it is.
 */
export function AcademyMetricRedirect() {
  const { metric } = useParams()
  const location = useLocation()
  return <Navigate replace to={academyWorkspaceLocation(undefined, location.search, location.hash, metric)} />
}
