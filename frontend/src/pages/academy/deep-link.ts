import { useCallback, useEffect } from "react"
import { useSearchParams } from "react-router"

import { useAuth } from "@/hooks/use-auth"
import { ACADEMY_VIEW, LESSON_PARAM, METRIC_PARAM, parseMetricParam, VIEW_PARAM } from "@/pages/demo-trading/workspace-url"
import { fetchLink } from "./api"
import { parseLessonParam } from "./navigation"

/**
 * Link into one lesson by metric name (spec v4 §6): `?view=academy&metric=<key or name>`, reached from
 * `/hoc-vien/bai/<metric>`, `/hoc-vien?metric=<metric>` or the Dashboard's "Học" button.
 *
 * Once the account is known the server resolves the name (`GET /academy/link`: `metric_key`, else the exact
 * lesson title, else a title starting with `name + " ·"`, among the lessons of the account's chapters) and the
 * lesson replaces the parameter in the URL (a replace, so Back never returns to the link). A lesson that is
 * not its turn yet (`locked`, an account that learns in order, spec v4.1 §4) opens the same way: the reader
 * asks the server for it, gets the 403 and shows the lock frame with "Học tiếp", never the lesson. It is never
 * an error:
 * - a name no lesson teaches opens the lesson the learner was last on (the server's answer), or nothing;
 * - a failed request just drops the parameter, so the tool shows its list as usual;
 * - a guest keeps the parameter, which resolves after sign-in;
 * - a new `metric` while the tool is open switches to its lesson at once.
 *
 * `pending` is true while an account's link is being resolved, so the reader area shows a placeholder
 * instead of the mascot (or the previous lesson) for a moment.
 */
export function useAcademyDeepLink(): { pending: boolean } {
  const [params, setParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const hasParam = params.has(METRIC_PARAM)
  const metric = parseMetricParam(params.get(METRIC_PARAM))

  /** Drops `metric` and, when the server named a lesson, opens it (the same keys `openLesson` writes). */
  const settle = useCallback(
    (itemId: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete(METRIC_PARAM)
          if (itemId) {
            next.delete("content")
            next.set(VIEW_PARAM, ACADEMY_VIEW)
            next.set(LESSON_PARAM, itemId)
          }
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  useEffect(() => {
    if (!hasParam) return
    // Empty or oversized value: nothing to ask the server, drop it.
    if (metric === null) {
      settle(null)
      return
    }
    // A guest cannot read lessons; the parameter stays and resolves once the account is known.
    if (!isAuthenticated) return
    const controller = new AbortController()
    const finish = (itemId: string | null) => {
      if (!controller.signal.aborted) settle(itemId)
    }
    fetchLink(metric, controller.signal).then(
      (link) => finish(parseLessonParam(link.lesson_id)),
      () => finish(null),
    )
    return () => controller.abort()
  }, [hasParam, metric, isAuthenticated, settle])

  return { pending: metric !== null && isAuthenticated }
}
