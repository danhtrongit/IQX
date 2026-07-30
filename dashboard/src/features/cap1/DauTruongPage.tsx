import { useEffect, useRef } from "react"
import { Spin } from "@arco-design/web-react"
import { useAuth } from "@/features/auth"
import { Cap0TradingPage, useCap0Progress } from "@/features/cap0"
import { useCap1Progress, useEnterCap1 } from "./hooks"
import { Cap1TradingPage } from "./Cap1TradingPage"
// Cấp 2 is live (Task FE4) — concrete-file imports (NOT the `@/features/cap2`
// barrel), same anti-cycle rationale `GraduationModalCap1.tsx`/
// `RightSidebar.tsx` already document (that barrel re-exports
// `Cap2TradingPage`, which imports `CenterPanel`/`RightSidebar`/
// `RightToolbar` from `@/features/dashboard`).
import { useCap2Progress, useEnterCap2 } from "@/features/cap2/hooks"
import { Cap2TradingPage } from "@/features/cap2/Cap2TradingPage"
// Cấp 3 is live (Cấp 3 Task FE3) — concrete-file imports, same anti-cycle
// rationale as the Cấp 2 imports above.
import { useCap3Progress, useEnterCap3 } from "@/features/cap3/hooks"
import { Cap3TradingPage } from "@/features/cap3/Cap3TradingPage"
// Cấp 4 is live (Cấp 4 Task FE3) — concrete-file imports, same anti-cycle
// rationale as the Cấp 2/Cấp 3 imports above.
import { useCap4Progress, useEnterCap4 } from "@/features/cap4/hooks"
import { Cap4TradingPage } from "@/features/cap4/Cap4TradingPage"

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
 *  - Cấp 1 graduated, Cấp 2 not entered/not graduated → `Cap2TradingPage`
 *    (Task FE4), firing the idempotent `POST /cap2/enter` on first arrival —
 *    same pattern one level up.
 *  - Cấp 2 graduated, Cấp 3 not entered/not graduated → `Cap3TradingPage`
 *    (Cấp 3 Task FE3), firing the idempotent `POST /cap3/enter` on first
 *    arrival — same pattern, one more level up.
 *  - Cấp 3 graduated, Cấp 4 not entered/not graduated → `Cap4TradingPage`
 *    (Cấp 4 Task FE3), firing the idempotent `POST /cap4/enter` on first
 *    arrival — same pattern, one more level up.
 *  - Cấp 3 graduated AND Cấp 4 already graduated → still `Cap4TradingPage`
 *    (Cấp 5 doesn't exist yet — same honest "next level not built" pattern
 *    `GraduationModalCap1`/`GraduationModalCap2`/`GraduationModalCap3` used
 *    before their own next level shipped, now used by `GraduationModalCap4`
 *    for Cấp 5).
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
  const enterCap1AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap1 || !cap1Fetched) return
    if (cap1Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap1AttemptedRef.current) return
    enterCap1AttemptedRef.current = true
    enterCap1.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap1, cap1Fetched, cap1Progress])

  const cap1Graduated = !!cap1Progress?.graduated_at

  // Only query Cấp 2 progress once Cấp 1 is confirmed graduated — mirrors
  // the Cấp 0 → Cấp 1 gating above, one level up.
  const shouldQueryCap2 = shouldQueryCap1 && cap1Graduated
  const { data: cap2Progress, isFetched: cap2Fetched } = useCap2Progress(shouldQueryCap2)
  const enterCap2 = useEnterCap2()
  const enterCap2AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap2 || !cap2Fetched) return
    if (cap2Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap2AttemptedRef.current) return
    enterCap2AttemptedRef.current = true
    enterCap2.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap2, cap2Fetched, cap2Progress])

  const cap2Graduated = !!cap2Progress?.graduated_at

  // Only query Cấp 3 progress once Cấp 2 is confirmed graduated — mirrors the
  // Cấp 1 → Cấp 2 gating above, one level up.
  const shouldQueryCap3 = shouldQueryCap2 && cap2Graduated
  const { data: cap3Progress, isFetched: cap3Fetched } = useCap3Progress(shouldQueryCap3)
  const enterCap3 = useEnterCap3()
  const enterCap3AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap3 || !cap3Fetched) return
    if (cap3Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap3AttemptedRef.current) return
    enterCap3AttemptedRef.current = true
    enterCap3.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap3, cap3Fetched, cap3Progress])

  const cap3Graduated = !!cap3Progress?.graduated_at

  // Only query Cấp 4 progress once Cấp 3 is confirmed graduated — mirrors the
  // Cấp 2 → Cấp 3 gating above, one level up.
  const shouldQueryCap4 = shouldQueryCap3 && cap3Graduated
  const { data: cap4Progress, isFetched: cap4Fetched } = useCap4Progress(shouldQueryCap4)
  const enterCap4 = useEnterCap4()
  const enterCap4AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap4 || !cap4Fetched) return
    if (cap4Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap4AttemptedRef.current) return
    enterCap4AttemptedRef.current = true
    enterCap4.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap4, cap4Fetched, cap4Progress])

  if (authLoading) return <FullPageSpinner />
  if (!isAuthenticated) return <Cap0TradingPage />
  if (!cap0Fetched) return <FullPageSpinner />
  if (!cap0Graduated) return <Cap0TradingPage />
  if (!cap1Fetched) return <FullPageSpinner />
  if (!cap1Graduated) return <Cap1TradingPage />
  if (!cap2Fetched) return <FullPageSpinner />
  if (!cap2Graduated) return <Cap2TradingPage />
  if (!cap3Fetched) return <FullPageSpinner />
  if (!cap3Graduated) return <Cap3TradingPage />
  if (!cap4Fetched) return <FullPageSpinner />
  return <Cap4TradingPage />
}
