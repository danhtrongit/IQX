import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { Message, Modal, Input, Button } from "@arco-design/web-react"
import { SymbolProvider } from "@/shared/contexts/symbol-context"
import { useSidebar } from "@/shared/contexts/sidebar-context"
import { Header, MarketBar, Footer, TrialBanner } from "@/features/navigation"
import { CenterPanel, RightSidebar, RightToolbar } from "@/features/dashboard"
import { IconBrainCircuit } from "@/shared/icons"
import { Cap0Provider } from "./Cap0Context"
import { ModeBadge } from "./ModeBadge"
import { JourneyBar } from "./JourneyBar"
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

// Indices (whole-market gauges) — AI Insight needs a specific listed stock.
// Duplicated from `DashboardPage` (not imported across features) — same
// rationale as that file: a tiny, self-contained guard, not worth a
// cross-feature coupling into `@/features/stock` just for this.
const INDEX_CODES = new Set([
  "VNINDEX",
  "VN30",
  "HNX",
  "HNXINDEX",
  "UPCOM",
  "UPCOMINDEX",
  "HNX30",
])

function isIndexSymbol(s: string): boolean {
  return INDEX_CODES.has(s.toUpperCase())
}

/**
 * `/dau-truong` — Cấp 0 «Nhập môn» demo-trading shell (spec §0 "giữ header" +
 * §2 mode badge + §3 placement question). Renders the SAME surrounding chrome
 * as `DashboardPage` — `TrialBanner` + `Header` + `MarketBar` + ... + `Footer`
 * — around the SAME, untouched `CenterPanel`/`RightSidebar`/`RightToolbar`
 * terminal (with VNM preselected per spec §4 instead of VNINDEX), plus the
 * same "AI Phân tích" symbol-picker modal wired to `RightToolbar`'s
 * `onActionClick`. Adds the Cấp 0-specific `.cap0` dark chrome +
 * `Cap0Provider` event bus + sticky `.cap0-topbar` (JourneyBar + mode badge)
 * between `MarketBar` and the terminal body.
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
  const navigate = useNavigate()
  const { data: progress, isFetched } = useCap0Progress()
  const enterCap0 = useEnterCap0()
  const placement = usePlacement()
  const [placementSeen, setPlacementSeen] = useState(() => hasSeenPlacement())
  const { setActivePanel } = useSidebar()

  // Spec §7: "Là view mặc định khi user vào app lần đầu và mỗi lần vào lại
  // giữa chừng" — the sidebar's `SidebarProvider` is a SINGLE app-root
  // instance shared by every route (defaultPanel="news", see
  // `app/providers.tsx`), so Cấp 0 can't set its own default — it overrides
  // on mount instead. Mount-only (empty deps): `setActivePanel`'s identity
  // changes every `SidebarProvider` render, so depending on it would re-fire
  // this on every re-render and fight the user's own panel switches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActivePanel("journey")
  }, [])

  // Guard (§3): show only once — needs BOTH the server truth (no progress row
  // yet, i.e. never entered Cấp 0) AND the local "already answered" flag
  // (covers the "Đã từng" branch, which never creates a progress row). Wait
  // for the query to settle first so a loading flicker doesn't briefly show
  // the modal to a returning user.
  const showPlacement = isFetched && !progress && !placementSeen

  // Cấp 0 tracks a single preselected stock (VNM); AI Insight still needs
  // whichever specific listed stock the user cares about, so tapping
  // "AI Phân tích" opens the same symbol picker as `DashboardPage` —
  // mirrors that page's `handleActionClick`/modal exactly.
  const [aiInsightOpen, setAiInsightOpen] = useState(false)
  const [aiInsightSymbol, setAiInsightSymbol] = useState("")

  const handleActionClick = (id: string) => {
    if (id === "ai-insight") {
      setAiInsightSymbol("")
      setAiInsightOpen(true)
    }
  }

  const trimmedAiInsight = aiInsightSymbol.trim().toUpperCase()
  const aiInsightValid =
    /^[A-Z0-9]{2,10}$/.test(trimmedAiInsight) && !isIndexSymbol(trimmedAiInsight)

  const submitAiInsightSymbol = () => {
    if (!aiInsightValid) return
    setAiInsightOpen(false)
    navigate(`/co-phieu/${trimmedAiInsight}`)
  }

  const handleNeverTraded = () => {
    placement.mutate(false)
    // Mark "seen" only once `enterCap0` actually SUCCEEDS. If it fails
    // (network error), `progress` stays falsy AND `placementSeen` stays
    // false, so `showPlacement` is still true and the modal remains
    // available for the user to retry — a fire-and-forget local flag here
    // would otherwise permanently hide the modal on a failed attempt.
    enterCap0.mutate(undefined, {
      onSuccess: () => {
        markPlacementSeen()
        setPlacementSeen(true)
      },
    })
  }

  const handleTradedBefore = () => {
    // Same success-gated pattern as `handleNeverTraded` — only mark "seen"
    // (and only then toast) once the placement answer is actually recorded
    // server-side, so a failed request leaves the modal retryable.
    placement.mutate(true, {
      onSuccess: () => {
        markPlacementSeen()
        setPlacementSeen(true)
        // This delivery only records placed_level=2 — no placement quiz / Cấp 1
        // routing yet (spec §3 "bài xếp lớp" ships separately).
        Message.info("Bài xếp lớp sẽ sớm ra mắt")
      },
    })
  }

  return (
    <div className="cap0 flex h-svh flex-col overflow-hidden bg-[var(--bg1)]">
      <TrialBanner />
      <Header />
      <MarketBar />

      {/* Top bar (spec §7 journey bar sticky trên đầu): `<JourneyBar/>`
          (progress "x/6" + next task + dots, click → tab Hành trình) + the
          mode badge at its right edge. */}
      <div className="cap0-topbar">
        <JourneyBar />
        <ModeBadge mode="san_tap" />
      </div>

      {/* No custom LeftSidebar — TradingView provides its own drawing toolbar on the left. */}
      <div className="flex flex-1 min-h-0 pb-[52px] md:pb-0">
        <CenterPanel />
        <RightSidebar />
        <RightToolbar onActionClick={handleActionClick} />
      </div>

      <Footer />

      <PlacementModal
        visible={showPlacement}
        onNeverTraded={handleNeverTraded}
        onTradedBefore={handleTradedBefore}
      />

      {/* AI Insight symbol picker — identical to DashboardPage's */}
      <Modal
        visible={aiInsightOpen}
        onCancel={() => setAiInsightOpen(false)}
        footer={null}
        title={null}
        style={{ width: 420 }}
        autoFocus={false}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="size-9 rounded-xl bg-[var(--color-primary-light-1)] flex items-center justify-center">
            <IconBrainCircuit className="text-[rgb(var(--primary-6))] text-lg" />
          </div>
          <div>
            <div className="text-base font-semibold text-[var(--color-text-1)]">
              Phân tích AI cho 1 mã cổ phiếu
            </div>
            <div className="text-xs text-[var(--color-text-3)]">
              AI Insight cần 1 mã cụ thể. Nhập mã (vd. VCB, HPG, FPT) để chạy phân
              tích 6 lớp.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={aiInsightSymbol}
            onChange={(v) => setAiInsightSymbol(v.toUpperCase())}
            onPressEnter={submitAiInsightSymbol}
            placeholder="VD: VCB"
            maxLength={10}
            autoFocus
            className="flex-1 font-mono uppercase tracking-wide"
          />
          <Button
            type="primary"
            onClick={submitAiInsightSymbol}
            disabled={!aiInsightValid}
          >
            Phân tích
          </Button>
        </div>
      </Modal>
    </div>
  )
}
