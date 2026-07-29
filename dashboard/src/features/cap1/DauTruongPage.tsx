import { useEffect, useRef } from "react"
import { Spin } from "@arco-design/web-react"
import { useAuth } from "@/features/auth"
import { Cap0TradingPage, useCap0Progress } from "@/features/cap0"
import { useCap1Progress, useEnterCap1 } from "./hooks"
import { Cap1TradingPage } from "./Cap1TradingPage"

function FullPageSpinner() {
  return (
    <div className="flex h-svh items-center justify-center bg-[var(--color-bg-1)]">
      <Spin size={32} />
    </div>
  )
}

/**
 * `/dau-truong` progression router (Task FE3) — the ONE route that serves the
 * whole level program. Picks the flow by the user's ACTUAL progress rather
 * than anything URL/param-based, so Cấp 2+ can reuse the exact same pattern
 * later (just add another `if`).
 *
 * Rules (plan §"Progression routing"):
 *  - not authenticated, or still resolving auth/progress → same as before
 *    this delivery: fall back to `Cap0TradingPage` (guests) or a spinner
 *    (loading) — ZERO behaviour change for anyone not yet Cấp-1-eligible.
 *  - Cấp 0 not graduated → `Cap0TradingPage` (unchanged).
 *  - Cấp 0 graduated, Cấp 1 not entered/not graduated → `Cap1TradingPage`,
 *    firing the idempotent `POST /cap1/enter` on first arrival.
 *  - Cấp 0 graduated AND Cấp 1 already graduated → still `Cap1TradingPage`
 *    (Cấp 2 doesn't exist yet — same honest "next level not built" pattern
 *    used inside `GraduationModalCap1`).
 */
export function DauTruongPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: cap0Progress, isFetched: cap0Fetched } = useCap0Progress(isAuthenticated)
  const cap0Graduated = !!cap0Progress?.graduated_at

  // Only query Cấp 1 progress once Cấp 0 is confirmed graduated — no wasted
  // request for users who haven't gotten there yet.
  const shouldQueryCap1 = isAuthenticated && cap0Graduated
  const { data: cap1Progress, isFetched: cap1Fetched } = useCap1Progress(shouldQueryCap1)
  const enterCap1 = useEnterCap1()
  const enterAttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap1 || !cap1Fetched) return
    if (cap1Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterAttemptedRef.current) return
    enterAttemptedRef.current = true
    enterCap1.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap1, cap1Fetched, cap1Progress])

  if (authLoading) return <FullPageSpinner />
  if (!isAuthenticated) return <Cap0TradingPage />
  if (!cap0Fetched) return <FullPageSpinner />
  if (!cap0Graduated) return <Cap0TradingPage />
  if (!cap1Fetched) return <FullPageSpinner />
  return <Cap1TradingPage />
}
