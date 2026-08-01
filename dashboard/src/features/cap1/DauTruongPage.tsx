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
// Cấp 5 is live (Cấp 5 Task FE3) — concrete-file imports, same anti-cycle
// rationale as the Cấp 2/Cấp 3/Cấp 4 imports above.
import { useCap5Progress, useEnterCap5 } from "@/features/cap5/hooks"
import { Cap5TradingPage } from "@/features/cap5/Cap5TradingPage"
// Cấp 6 is live (Cấp 6 Task FE3) — concrete-file imports, same anti-cycle
// rationale as the Cấp 2/Cấp 3/Cấp 4/Cấp 5 imports above.
import { useCap6Progress, useEnterCap6 } from "@/features/cap6/hooks"
import { Cap6TradingPage } from "@/features/cap6/Cap6TradingPage"
// Cấp 7 is live (Cấp 7 Task FE3) — concrete-file imports, same anti-cycle
// rationale as the Cấp 2/Cấp 3/Cấp 4/Cấp 5/Cấp 6 imports above.
import { useCap7Progress, useEnterCap7 } from "@/features/cap7/hooks"
import { Cap7TradingPage } from "@/features/cap7/Cap7TradingPage"
// Cấp 8 is live (Cấp 8 Task FE3) — concrete-file imports, same anti-cycle
// rationale as the Cấp 2/Cấp 3/Cấp 4/Cấp 5/Cấp 6/Cấp 7 imports above. ★ Cấp 8 is
// the LAST level of the program: nothing routes past it.
import { useCap8Progress, useEnterCap8 } from "@/features/cap8/hooks"
import { Cap8TradingPage } from "@/features/cap8/Cap8TradingPage"

function FullPageSpinner() {
  return (
    <div className="flex h-svh items-center justify-center bg-[var(--color-bg-1)]">
      <Spin size={32} />
    </div>
  )
}

/**
 * `/dau-truong` progression router (Task FE3) — the ONE route that serves the
 * whole level program (Cấp 0 … Cấp 8, the FULL 0-8 arc). Picks the flow by the
 * user's ACTUAL progress rather than anything URL/param-based, so each new cấp
 * reuses the exact same pattern (just add another `if`).
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
 *  - Cấp 4 graduated, Cấp 5 not entered/not graduated → `Cap5TradingPage`
 *    (Cấp 5 Task FE3), firing the idempotent `POST /cap5/enter` on first
 *    arrival — same pattern, one more level up.
 *  - Cấp 5 graduated, Cấp 6 not entered/not graduated → `Cap6TradingPage`
 *    (Cấp 6 Task FE3), firing the idempotent `POST /cap6/enter` on first
 *    arrival — same pattern, one more level up.
 *  - Cấp 6 graduated, Cấp 7 not entered/not graduated → `Cap7TradingPage`
 *    (Cấp 7 Task FE3), firing the idempotent `POST /cap7/enter` on first
 *    arrival — same pattern, one more level up.
 *  - Cấp 7 graduated, Cấp 8 not entered/not graduated → `Cap8TradingPage`
 *    (Cấp 8 Task FE3), firing the idempotent `POST /cap8/enter` on first
 *    arrival — same pattern, one more level up.
 *  - **Cấp 7 graduated AND Cấp 8 already graduated → still `Cap8TradingPage`.**
 *    This is the TERMINAL branch of the whole program: Cấp 8 «Quản trị rủi ro
 *    danh mục» is the last level (Cấp 9+ is "sắp ra mắt" text only — Cấp 8 spec
 *    §3), so there is no next page to route on to, and a graduate of the full
 *    0-8 arc keeps their own level's shell rather than being demoted to a lower
 *    one. When a Cấp 9 ships, this branch becomes another `if` exactly like the
 *    seven above it.
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

  const cap4Graduated = !!cap4Progress?.graduated_at

  // Only query Cấp 5 progress once Cấp 4 is confirmed graduated — mirrors the
  // Cấp 3 → Cấp 4 gating above, one level up.
  const shouldQueryCap5 = shouldQueryCap4 && cap4Graduated
  const { data: cap5Progress, isFetched: cap5Fetched } = useCap5Progress(shouldQueryCap5)
  const enterCap5 = useEnterCap5()
  const enterCap5AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap5 || !cap5Fetched) return
    if (cap5Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap5AttemptedRef.current) return
    enterCap5AttemptedRef.current = true
    enterCap5.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap5, cap5Fetched, cap5Progress])

  const cap5Graduated = !!cap5Progress?.graduated_at

  // Only query Cấp 6 progress once Cấp 5 is confirmed graduated — mirrors the
  // Cấp 4 → Cấp 5 gating above, one level up.
  const shouldQueryCap6 = shouldQueryCap5 && cap5Graduated
  const { data: cap6Progress, isFetched: cap6Fetched } = useCap6Progress(shouldQueryCap6)
  const enterCap6 = useEnterCap6()
  const enterCap6AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap6 || !cap6Fetched) return
    if (cap6Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap6AttemptedRef.current) return
    enterCap6AttemptedRef.current = true
    enterCap6.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap6, cap6Fetched, cap6Progress])

  const cap6Graduated = !!cap6Progress?.graduated_at

  // Only query Cấp 7 progress once Cấp 6 is confirmed graduated — mirrors the
  // Cấp 5 → Cấp 6 gating above, one level up.
  const shouldQueryCap7 = shouldQueryCap6 && cap6Graduated
  const { data: cap7Progress, isFetched: cap7Fetched } = useCap7Progress(shouldQueryCap7)
  const enterCap7 = useEnterCap7()
  const enterCap7AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap7 || !cap7Fetched) return
    if (cap7Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap7AttemptedRef.current) return
    enterCap7AttemptedRef.current = true
    enterCap7.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap7, cap7Fetched, cap7Progress])

  const cap7Graduated = !!cap7Progress?.graduated_at

  // Only query Cấp 8 progress once Cấp 7 is confirmed graduated — mirrors the
  // Cấp 6 → Cấp 7 gating above, one level up (and the last time).
  const shouldQueryCap8 = shouldQueryCap7 && cap7Graduated
  const { data: cap8Progress, isFetched: cap8Fetched } = useCap8Progress(shouldQueryCap8)
  const enterCap8 = useEnterCap8()
  const enterCap8AttemptedRef = useRef(false)

  useEffect(() => {
    if (!shouldQueryCap8 || !cap8Fetched) return
    if (cap8Progress != null) return // already entered (idempotent no-op otherwise)
    if (enterCap8AttemptedRef.current) return
    enterCap8AttemptedRef.current = true
    enterCap8.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldQueryCap8, cap8Fetched, cap8Progress])

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
  if (!cap4Graduated) return <Cap4TradingPage />
  if (!cap5Fetched) return <FullPageSpinner />
  if (!cap5Graduated) return <Cap5TradingPage />
  if (!cap6Fetched) return <FullPageSpinner />
  if (!cap6Graduated) return <Cap6TradingPage />
  if (!cap7Fetched) return <FullPageSpinner />
  if (!cap7Graduated) return <Cap7TradingPage />
  if (!cap8Fetched) return <FullPageSpinner />
  // ★ TERMINAL: no `if (!cap8Graduated)` — Cấp 8 is the last level, so a
  // cap8-graduated user lands here too (see the doc-comment above).
  return <Cap8TradingPage />
}
