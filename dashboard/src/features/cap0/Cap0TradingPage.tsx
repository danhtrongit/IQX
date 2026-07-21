import { useEffect, useState } from "react"
import { Message } from "@arco-design/web-react"
import { SymbolProvider } from "@/shared/contexts/symbol-context"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { Cap0Provider } from "./Cap0Context"
import { ModeBadge } from "./ModeBadge"
import { useCap0Progress, useEnterCap0, usePlacement } from "./hooks"
import { PlacementModal } from "./PlacementModal"
import "./cap0.css"

const SEO_TITLE = "IQX Demo Trading · Cấp 0 «Nhập môn»"

// No backend GET exists for `user_placement` (BE1 only exposes POST
// /cap0/placement) — so once a user answers "Đã từng" no `cap0_progress` row
// is ever created and the server-side guard (`!progress`) alone can't tell
// "already answered" apart from "brand new". This local flag is the
// best-effort second guard for that branch (mirrors the pattern in
// `features/navigation/TrialBanner.tsx`). Known gap: a different browser/
// device, or clearing site data, will show the modal again for that user —
// acceptable for this delivery per the brief; a durable fix needs a
// `GET /cap0/placement` endpoint (follow-up).
const PLACEMENT_SEEN_KEY = "iqx_cap0_placement_seen"

function hasSeenPlacement(): boolean {
  try {
    return window.localStorage.getItem(PLACEMENT_SEEN_KEY) === "1"
  } catch {
    return false
  }
}

function markPlacementSeen(): void {
  try {
    window.localStorage.setItem(PLACEMENT_SEEN_KEY, "1")
  } catch {
    // Storage unavailable (private mode / disabled) — the modal may resurface;
    // acceptable degradation, not a functional break.
  }
}

/**
 * `/dau-truong` — Cấp 0 «Nhập môn» demo-trading shell (spec §2 mode badge +
 * §3 placement question). Mirrors `DashboardPage`'s terminal body — the SAME,
 * untouched `CenterPanel`/`RightSidebar`/`RightToolbar` — with VNM preselected
 * (spec §4: "cần preselect mã VNM ... khi user vào Cấp 0 lần đầu") instead of
 * VNINDEX, wrapped in the `.cap0` dark chrome + `Cap0Provider` event bus.
 *
 * Deliberately does NOT reuse `DashboardPage`'s Header/MarketBar/Footer/
 * TrialBanner chrome this task — see the FE2 task report for why.
 */
export function Cap0TradingPage() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = SEO_TITLE
    return () => {
      document.title = prevTitle
    }
  }, [])

  return (
    <SymbolProvider symbol="VNM">
      <Cap0Provider>
        <Cap0Terminal />
      </Cap0Provider>
    </SymbolProvider>
  )
}

function Cap0Terminal() {
  const { data: progress, isFetched } = useCap0Progress()
  const enterCap0 = useEnterCap0()
  const placement = usePlacement()
  const [placementSeen, setPlacementSeen] = useState(() => hasSeenPlacement())

  // Guard (§3): show only once — needs BOTH the server truth (no progress row
  // yet, i.e. never entered Cấp 0) AND the local "already answered" flag
  // (covers the "Đã từng" branch, which never creates a progress row). Wait
  // for the query to settle first so a loading flicker doesn't briefly show
  // the modal to a returning user.
  const showPlacement = isFetched && !progress && !placementSeen

  const handleNeverTraded = () => {
    placement.mutate(false)
    enterCap0.mutate()
    markPlacementSeen()
    setPlacementSeen(true)
  }

  const handleTradedBefore = () => {
    placement.mutate(true)
    markPlacementSeen()
    setPlacementSeen(true)
    // This delivery only records placed_level=2 — no placement quiz / Cấp 1
    // routing yet (spec §3 "bài xếp lớp" ships separately).
    Message.info("Bài xếp lớp sẽ sớm ra mắt")
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      {/* Top bar (spec §7 journey bar sticky trên đầu). FE3 mounts the real
          `<JourneyBar/>` (progress "x/6" + next task + dots) into this slot —
          this task only wires the mode badge that sits at its right edge. */}
      <div className="cap0-topbar">
        <div className="flex-1 min-w-0" data-testid="cap0-journey-slot" />
        <ModeBadge mode="san_tap" />
      </div>

      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel />
        <RightSidebar />
        <RightToolbar />
      </div>

      <PlacementModal
        visible={showPlacement}
        onNeverTraded={handleNeverTraded}
        onTradedBefore={handleTradedBefore}
      />
    </div>
  )
}
