# Home Analysis Layout (Session Tabs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cột trái trang chủ `/` bỏ auto-switch theo giờ, thay bằng 3 session tab (Trước/Giữa/Cuối phiên) luôn hiển thị với tab active mặc định theo giờ; icon rail thêm tab BCTC launcher.

**Architecture:** Feature mới `market-overview/home-analysis/` chứa pure fn `getDefaultActivePeriod` + `SessionMeta`/`SessionTabs`; `HomeMarketView` được viết lại thành container tabs bọc 3 view brief sẵn có (không đụng nội bộ view). `getDisplayMode` bị xoá (chỉ HomeMarketView dùng). BCTC launcher mirror `PhanTichLauncher`, deep-link `?tab=financials` vào StockPage.

**Tech Stack:** React 19, Arco Design, Tailwind v4 (no-preflight), TanStack Query, Vitest + RTL, react-router (import từ `"react-router"`).

## Global Constraints

- Design doc: `dashboard/docs/specs/2026-07-04-home-analysis-layout-design.md` — mọi giá trị ở đó là chuẩn.
- Biên giờ active mặc định (ICT local): `< 555` phút (09:15) → `"premarket"`; `< 930` (15:30) → `"midday"`; còn lại → `"eod"`. Thứ 7/CN (getDay 0|6) → `"eod"`.
- 3 tab LUÔN hiển thị + clickable, không disable, lựa chọn không persist (mount-time default, KHÔNG interval tự đổi tab).
- Nhãn tab (verbatim): `☀️ Trước phiên` + `· 07:15`, `☕ Giữa phiên` + `· 11:30`, `🌙 Cuối phiên` + `· 16:30`. Giờ dùng font mono hiện có (`.num` convention → dùng class `font-mono` sẵn của app hoặc inline monospace giống MarketBar).
- Pill MỚI: nền `rgba(251,191,36,0.15)`, chữ `#fbbf24`, padding 1px 6px, radius 4px, 10px/600 — hiển thị trên tab có brief `session_date` === hôm nay VÀ `generated_at` lớn nhất trong 3 brief.
- Màu brand: dùng token app (`rgb(var(--primary-6))`, `var(--color-primary-light-1)`) — KHÔNG hardcode #3b82f6 (map spec→app-token, hoạt động cả dark+light).
- Badge: `PHÂN TÍCH THỊ TRƯỜNG` uppercase 11px/600 letter-spacing .5px, nền `var(--color-primary-light-1)`, chữ `rgb(var(--primary-6))`. Ngày: uppercase 12px/500 `var(--color-text-2)`, format `Thứ Hai, 30/06/2026`.
- Container cột trái: `mx-auto w-full max-w-[980px] px-4 py-6 lg:px-8 pb-20`.
- Mock DIRECT children trong test (bài học time-of-day flake a0ec4fd). Test không phụ thuộc wall-clock (truyền `Date` cụ thể).
- KHÔNG sửa nội bộ PreMarketView / MidDayView / MarketDailyPage. KHÔNG sửa shell/Header/MarketBar.

---

### Task 1: `getDefaultActivePeriod` (pure fn)

**Files:**
- Create: `dashboard/src/features/market-overview/home-analysis/getDefaultActivePeriod.ts`
- Test: `dashboard/src/features/market-overview/home-analysis/getDefaultActivePeriod.test.ts`

**Interfaces:**
- Produces: `type SessionPeriod = "premarket" | "midday" | "eod"`; `getDefaultActivePeriod(now: Date, opts?: { isTradingDay?: boolean }): SessionPeriod`. Task 2/3 import cả hai từ file này.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest"
import { getDefaultActivePeriod } from "./getDefaultActivePeriod"

// helper: Thứ Hai 2026-07-06 + giờ/phút tuỳ ý
const at = (h: number, m: number, day = 6) => new Date(2026, 6, day, h, m) // 2026-07-06 là Thứ Hai

describe("getDefaultActivePeriod", () => {
  it("08:30 T2 → premarket", () => expect(getDefaultActivePeriod(at(8, 30))).toBe("premarket"))
  it("00:00 T2 → premarket", () => expect(getDefaultActivePeriod(at(0, 0))).toBe("premarket"))
  it("09:14 T2 → premarket (biên trên)", () => expect(getDefaultActivePeriod(at(9, 14))).toBe("premarket"))
  it("09:15 T2 → midday (biên dưới)", () => expect(getDefaultActivePeriod(at(9, 15))).toBe("midday"))
  it("14:00 T2 → midday", () => expect(getDefaultActivePeriod(at(14, 0))).toBe("midday"))
  it("15:29 T2 → midday (biên trên)", () => expect(getDefaultActivePeriod(at(15, 29))).toBe("midday"))
  it("15:30 T2 → eod (biên dưới)", () => expect(getDefaultActivePeriod(at(15, 30))).toBe("eod"))
  it("20:00 T2 → eod", () => expect(getDefaultActivePeriod(at(20, 0))).toBe("eod"))
  it("10:00 T7 → eod (cuối tuần)", () => expect(getDefaultActivePeriod(new Date(2026, 6, 4, 10, 0))).toBe("eod")) // 2026-07-04 là T7
  it("10:00 CN → eod", () => expect(getDefaultActivePeriod(new Date(2026, 6, 5, 10, 0))).toBe("eod"))
  it("isTradingDay=false override → eod kể cả T2 sáng", () =>
    expect(getDefaultActivePeriod(at(8, 30), { isTradingDay: false })).toBe("eod"))
})
```

- [ ] **Step 2: red** — `npx vitest run src/features/market-overview/home-analysis` → FAIL (module not found).
- [ ] **Step 3: implement**

```ts
export type SessionPeriod = "premarket" | "midday" | "eod"

export interface GetDefaultActivePeriodOptions {
  /** Override khi có nguồn lịch giao dịch; mặc định suy từ thứ trong tuần. */
  isTradingDay?: boolean
}

const PRE_MARKET_END = 9 * 60 + 15 // 09:15
const POST_MARKET_START = 15 * 60 + 30 // 15:30

export function getDefaultActivePeriod(
  now: Date,
  opts?: GetDefaultActivePeriodOptions,
): SessionPeriod {
  const day = now.getDay()
  const weekend = day === 0 || day === 6
  const isTradingDay = opts?.isTradingDay ?? !weekend
  if (!isTradingDay) return "eod"

  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes < PRE_MARKET_END) return "premarket"
  if (minutes < POST_MARKET_START) return "midday"
  return "eod"
}
```

- [ ] **Step 4: green** — cùng lệnh, 11 passed.
- [ ] **Step 5: Commit** — `git add dashboard/src/features/market-overview/home-analysis && git commit -m "feat(home-fe): getDefaultActivePeriod — session-tab default by time (09:15/15:30, weekend→eod)"`

---

### Task 2: SessionMeta + SessionTabs + formatSessionDate

**Files:**
- Create: `dashboard/src/features/market-overview/home-analysis/formatSessionDate.ts`
- Create: `dashboard/src/features/market-overview/home-analysis/SessionMeta.tsx`
- Create: `dashboard/src/features/market-overview/home-analysis/SessionTabs.tsx`
- Test: `dashboard/src/features/market-overview/home-analysis/SessionTabs.test.tsx` (gồm cả formatSessionDate tests)

**Interfaces:**
- Consumes: `SessionPeriod` từ Task 1.
- Produces: `formatSessionDate(iso: string): string` ("2026-06-30" → "Thứ Hai, 30/06/2026"); `<SessionMeta dateLabel={string | null} />`; `<SessionTabs active={SessionPeriod} onSelect={(p: SessionPeriod) => void} newPeriod={SessionPeriod | null} />`. Task 3 dùng cả ba.

- [ ] **Step 1: Failing tests**

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { formatSessionDate } from "./formatSessionDate"
import { SessionTabs } from "./SessionTabs"
import { SessionMeta } from "./SessionMeta"

describe("formatSessionDate", () => {
  it("thứ trong tuần tiếng Việt + DD/MM/YYYY", () => {
    expect(formatSessionDate("2026-06-30")).toBe("Thứ Ba, 30/06/2026")
    expect(formatSessionDate("2026-07-05")).toBe("Chủ Nhật, 05/07/2026")
  })
  it("input hỏng → chuỗi rỗng", () => expect(formatSessionDate("garbage")).toBe(""))
})

describe("SessionMeta", () => {
  it("badge + ngày", () => {
    render(<SessionMeta dateLabel="Thứ Ba, 30/06/2026" />)
    expect(screen.getByText("Phân tích thị trường")).toBeInTheDocument()
    expect(screen.getByText("Thứ Ba, 30/06/2026")).toBeInTheDocument()
  })
  it("dateLabel null → chỉ badge, không crash", () => {
    render(<SessionMeta dateLabel={null} />)
    expect(screen.getByText("Phân tích thị trường")).toBeInTheDocument()
  })
})

describe("SessionTabs", () => {
  it("3 tab luôn hiển thị với giờ publish thật", () => {
    render(<SessionTabs active="midday" onSelect={() => {}} newPeriod={null} />)
    expect(screen.getByRole("tab", { name: /Trước phiên/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Giữa phiên/ })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toBeInTheDocument()
    expect(screen.getByText("· 07:15")).toBeInTheDocument()
    expect(screen.getByText("· 11:30")).toBeInTheDocument()
    expect(screen.getByText("· 16:30")).toBeInTheDocument()
  })
  it("tab active có aria-selected", () => {
    render(<SessionTabs active="eod" onSelect={() => {}} newPeriod={null} />)
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /Trước phiên/ })).toHaveAttribute("aria-selected", "false")
  })
  it("click gọi onSelect với period đúng", () => {
    const onSelect = vi.fn()
    render(<SessionTabs active="eod" onSelect={onSelect} newPeriod={null} />)
    fireEvent.click(screen.getByRole("tab", { name: /Trước phiên/ }))
    expect(onSelect).toHaveBeenCalledWith("premarket")
  })
  it("pill MỚI trên đúng tab", () => {
    render(<SessionTabs active="eod" onSelect={() => {}} newPeriod="midday" />)
    const midday = screen.getByRole("tab", { name: /Giữa phiên/ })
    expect(midday).toHaveTextContent("MỚI")
  })
  it("newPeriod null → không có MỚI", () => {
    render(<SessionTabs active="eod" onSelect={() => {}} newPeriod={null} />)
    expect(screen.queryByText("MỚI")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement**

`formatSessionDate.ts`:

```ts
const WEEKDAYS_VI = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]

/** "2026-06-30" → "Thứ Ba, 30/06/2026". Input hỏng → "". */
export function formatSessionDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ""
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ""
  return `${WEEKDAYS_VI[d.getDay()]}, ${m[3]}/${m[2]}/${m[1]}`
}
```

`SessionMeta.tsx`:

```tsx
export function SessionMeta({ dateLabel }: { dateLabel: string | null }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="rounded bg-[var(--color-primary-light-1)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-[rgb(var(--primary-6))]">
        Phân tích thị trường
      </span>
      {dateLabel ? (
        <span className="text-[12px] font-medium uppercase tracking-[0.3px] text-[var(--color-text-2)]">
          {dateLabel}
        </span>
      ) : null}
    </div>
  )
}
```

`SessionTabs.tsx`:

```tsx
import { cn } from "@/shared/lib/cn"
import type { SessionPeriod } from "./getDefaultActivePeriod"

const TABS: { id: SessionPeriod; icon: string; label: string; time: string }[] = [
  { id: "premarket", icon: "☀️", label: "Trước phiên", time: "· 07:15" },
  { id: "midday", icon: "☕", label: "Giữa phiên", time: "· 11:30" },
  { id: "eod", icon: "🌙", label: "Cuối phiên", time: "· 16:30" },
]

export function SessionTabs({
  active,
  onSelect,
  newPeriod,
}: {
  active: SessionPeriod
  onSelect: (p: SessionPeriod) => void
  newPeriod: SessionPeriod | null
}) {
  return (
    <div role="tablist" aria-label="Phiên nhận định" className="mb-6 flex gap-1 border-b border-[var(--color-border-2)]">
      {TABS.map((t) => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors",
              isActive
                ? "border-[rgb(var(--primary-6))] text-[var(--color-text-1)]"
                : "border-transparent text-[var(--color-text-3)] hover:text-[var(--color-text-1)]",
            )}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
            <span className="font-mono text-[11px] text-[var(--color-text-3)]">{t.time}</span>
            {newPeriod === t.id ? (
              <span className="rounded bg-[rgba(251,191,36,0.15)] px-1.5 py-px text-[10px] font-semibold text-[#fbbf24]">
                MỚI
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: green** — `npx vitest run src/features/market-overview/home-analysis`.
- [ ] **Step 5: Commit** — `git commit -m "feat(home-fe): SessionMeta + SessionTabs (3 phiên trên H1, pill MỚI, app-token theming)"`

---

### Task 3: HomeMarketView restructure (tabs điều khiển 3 view)

**Files:**
- Modify: `dashboard/src/features/market-overview/HomeMarketView.tsx` (viết lại toàn bộ)
- Modify: `dashboard/src/features/market-overview/daily/types.ts`, `midday/types.ts`, `premarket/types.ts` — mỗi file thêm `generated_at: string` cạnh `session_date` (backend AnalysisOut đã trả field này)
- Delete: `dashboard/src/features/market-overview/midday/getDisplayMode.ts` + `getDisplayMode.test.ts` (chỉ HomeMarketView dùng; boundary coverage đã chuyển sang Task 1)
- Test: `dashboard/src/features/market-overview/HomeMarketView.test.tsx` (viết lại)

**Interfaces:**
- Consumes: `getDefaultActivePeriod`, `SessionPeriod` (Task 1); `SessionMeta`, `SessionTabs`, `formatSessionDate` (Task 2); hooks `useDailyMarketAnalysis()` (daily/useDailyMarketAnalysis.ts), `useMidDayAnalysis()` (midday), `usePreMarketAnalysis()` (premarket) — cả 3 nhận `enabled?: boolean`, trả `{ data }` với `data.session_date: string`, `data.generated_at: string`.
- Produces: `HomeMarketView()` — signature không đổi (HomeWorkspace không cần sửa).

- [ ] **Step 1: Failing tests** (viết lại file test; mock DIRECT children + 3 hooks)

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HomeMarketView } from "./HomeMarketView"

vi.mock("./daily/MarketDailyPage", () => ({ MarketDailyPage: () => <div data-testid="eod-view" /> }))
vi.mock("./midday/MidDayView", () => ({ MidDayView: () => <div data-testid="midday-view" /> }))
vi.mock("./premarket/PreMarketView", () => ({ PreMarketView: () => <div data-testid="premarket-view" /> }))

const daily = vi.hoisted(() => ({ data: undefined as unknown }))
const midday = vi.hoisted(() => ({ data: undefined as unknown }))
const premarket = vi.hoisted(() => ({ data: undefined as unknown }))
vi.mock("./daily/useDailyMarketAnalysis", () => ({ useDailyMarketAnalysis: () => daily }))
vi.mock("./midday/useMidDayAnalysis", () => ({ useMidDayAnalysis: () => midday }))
vi.mock("./premarket/usePreMarketAnalysis", () => ({ usePreMarketAnalysis: () => premarket }))

beforeEach(() => {
  daily.data = undefined
  midday.data = undefined
  premarket.data = undefined
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => vi.useRealTimers())

describe("HomeMarketView (session tabs)", () => {
  it("20:00 T2 → tab Cuối phiên active, render EOD view", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 20, 0))
    render(<HomeMarketView />)
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("eod-view")).toBeInTheDocument()
  })
  it("08:30 T2 → tab Trước phiên active, render premarket view", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 8, 30))
    render(<HomeMarketView />)
    expect(screen.getByTestId("premarket-view")).toBeInTheDocument()
  })
  it("10:00 T7 → Cuối phiên active (cuối tuần)", () => {
    vi.setSystemTime(new Date(2026, 6, 4, 10, 0))
    render(<HomeMarketView />)
    expect(screen.getByRole("tab", { name: /Cuối phiên/ })).toHaveAttribute("aria-selected", "true")
  })
  it("click tab khác đổi view, không auto-revert", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 20, 0))
    render(<HomeMarketView />)
    fireEvent.click(screen.getByRole("tab", { name: /Giữa phiên/ }))
    expect(screen.getByTestId("midday-view")).toBeInTheDocument()
    expect(screen.queryByTestId("eod-view")).not.toBeInTheDocument()
  })
  it("meta hiển thị ngày của brief đang xem", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 20, 0))
    daily.data = { session_date: "2026-07-06", generated_at: "2026-07-06T16:30:00" }
    render(<HomeMarketView />)
    expect(screen.getByText("Thứ Hai, 06/07/2026")).toBeInTheDocument()
  })
  it("pill MỚI trên tab có generated_at mới nhất hôm nay", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0))
    premarket.data = { session_date: "2026-07-06", generated_at: "2026-07-06T07:15:00" }
    midday.data = { session_date: "2026-07-06", generated_at: "2026-07-06T11:30:00" }
    render(<HomeMarketView />)
    expect(screen.getByRole("tab", { name: /Giữa phiên/ })).toHaveTextContent("MỚI")
    expect(screen.getByRole("tab", { name: /Trước phiên/ })).not.toHaveTextContent("MỚI")
  })
  it("brief cũ (không phải hôm nay) → không MỚI", () => {
    vi.setSystemTime(new Date(2026, 6, 6, 12, 0))
    midday.data = { session_date: "2026-07-03", generated_at: "2026-07-03T11:30:00" }
    render(<HomeMarketView />)
    expect(screen.queryByText("MỚI")).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement** — viết lại `HomeMarketView.tsx`:

```tsx
// ─── HomeMarketView ───────────────────────────────────────────────────────────
// 3 session tab (Trước/Giữa/Cuối phiên) luôn hiển thị; tab active mặc định theo
// giờ truy cập (getDefaultActivePeriod, tính 1 lần khi mount — không auto đổi
// tab trong phiên xem). Nội dung mỗi tab là view brief đầy đủ sẵn có.

import { useMemo, useState } from "react"
import { getDefaultActivePeriod, type SessionPeriod } from "./home-analysis/getDefaultActivePeriod"
import { SessionMeta } from "./home-analysis/SessionMeta"
import { SessionTabs } from "./home-analysis/SessionTabs"
import { formatSessionDate } from "./home-analysis/formatSessionDate"
import { useDailyMarketAnalysis } from "./daily/useDailyMarketAnalysis"
import { useMidDayAnalysis } from "./midday/useMidDayAnalysis"
import { usePreMarketAnalysis } from "./premarket/usePreMarketAnalysis"
import { MidDayView } from "./midday/MidDayView"
import { MarketDailyPage } from "./daily/MarketDailyPage"
import { PreMarketView } from "./premarket/PreMarketView"

function localTodayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function HomeMarketView() {
  const [active, setActive] = useState<SessionPeriod>(() => getDefaultActivePeriod(new Date()))

  const { data: dailyData } = useDailyMarketAnalysis()
  const { data: middayData } = useMidDayAnalysis()
  const { data: premarketData } = usePreMarketAnalysis()

  const briefs: Record<SessionPeriod, { session_date?: string; generated_at?: string } | undefined> = {
    premarket: premarketData,
    midday: middayData,
    eod: dailyData,
  }

  // Pill MỚI: brief của HÔM NAY có generated_at lớn nhất
  const newPeriod = useMemo<SessionPeriod | null>(() => {
    const today = localTodayIso()
    let best: SessionPeriod | null = null
    let bestTs = ""
    for (const p of ["premarket", "midday", "eod"] as const) {
      const b = briefs[p]
      if (b?.session_date === today && b.generated_at && b.generated_at > bestTs) {
        best = p
        bestTs = b.generated_at
      }
    }
    return best
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premarketData, middayData, dailyData])

  const dateLabel = briefs[active]?.session_date
    ? formatSessionDate(briefs[active]!.session_date!)
    : null

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 pb-20 lg:px-8">
      <SessionMeta dateLabel={dateLabel} />
      <SessionTabs active={active} onSelect={setActive} newPeriod={newPeriod} />
      {active === "premarket" && <PreMarketView />}
      {active === "midday" && <MidDayView />}
      {active === "eod" && <MarketDailyPage />}
    </div>
  )
}
```

Thêm `generated_at: string` vào 3 file types (cạnh `session_date`). Xoá `midday/getDisplayMode.ts` + test của nó; grep `getDisplayMode` toàn dashboard/src để chắc 0 usage còn lại.

- [ ] **Step 4: green** — `npx vitest run src/features/market-overview` rồi FULL `npx vitest run` + `npx tsc --noEmit` (HomeWorkspace.test mock trực tiếp HomeMarketView nên vẫn xanh — xác nhận).
- [ ] **Step 5: Commit** — `git commit -m "feat(home-fe): session tabs thay auto-switch — 3 brief luôn truy cập được, active theo giờ"`

---

### Task 4: BCTC launcher tab (icon rail + side panel + StockPage deep-link)

**Files:**
- Modify: `dashboard/src/features/home-workspace/types.ts` (thêm tab `bctc`)
- Modify: `dashboard/src/features/home-workspace/HomeIconRail.tsx` (icon map)
- Modify: `dashboard/src/features/home-workspace/PhanTichLauncher.tsx` (thêm `BctcLauncher` export)
- Modify: `dashboard/src/features/home-workspace/HomeSidePanel.tsx` (case `bctc`)
- Modify: `dashboard/src/features/stock/StockPage.tsx` (init tab từ `?tab=`)
- Test: `dashboard/src/features/home-workspace/BctcLauncher.test.tsx` (mới) + cập nhật test rail nếu có snapshot số tab

**Interfaces:**
- Consumes: pattern `PhanTichLauncher` (useSymbol/isIndexSymbol/navigate), `HOME_TABS`/`HomeTab`.
- Produces: `HomeTab` union += `"bctc"`; `BctcLauncher()`; StockPage đọc `?tab=financials|chart|overview|orderbook` khi mount.

- [ ] **Step 1: Failing tests** (`BctcLauncher.test.tsx` — mirror cách test PhanTichLauncher hiện có nếu tồn tại; nếu không, dùng khung dưới)

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BctcLauncher } from "./PhanTichLauncher"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))
vi.mock("@/shared/contexts/symbol-context", () => ({ useSymbol: () => ({ symbol: "FPT" }) }))
vi.mock("@/features/stock", () => ({ isIndexSymbol: () => false }))

describe("BctcLauncher", () => {
  it("điều hướng /co-phieu/FPT?tab=financials", () => {
    render(<BctcLauncher />)
    fireEvent.click(screen.getByRole("button", { name: /Mở phân tích BCTC/ }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/FPT?tab=financials")
  })
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement**

`types.ts`: `export type HomeTab = "order" | "watchlist" | "news" | "phan-tich" | "bctc" | "patterns"` và chèn vào `HOME_TABS` sau `phan-tich`: `{ id: "bctc", label: "BCTC" }`.

`HomeIconRail.tsx`: import `IconFile` từ `@arco-design/web-react/icon`, thêm `bctc: IconFile` vào `ICONS`.

`PhanTichLauncher.tsx` — thêm cuối file:

```tsx
export function BctcLauncher() {
  const { symbol } = useSymbol()
  const navigate = useNavigate()

  if (isIndexSymbol(symbol)) {
    return <SelectStockEmptyState what="phân tích BCTC" />
  }

  return (
    <div className="px-3 py-4">
      <div className="rounded-lg border border-[var(--color-border-2)] bg-[var(--color-bg-1)] p-4">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded bg-[var(--color-primary-light-1)] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--primary-6))]">
          📋 Phân tích BCTC bởi IQX AI
        </div>
        <h4 className="mt-1 text-sm font-bold text-[var(--color-text-1)]">Báo cáo tài chính {symbol}</h4>
        <p className="mt-1 text-xs text-[var(--color-text-3)]">
          Common-size, DuPont, chất lượng dòng tiền, Z-Score/F-Score và định giá — trên tab Tài chính của trang mã.
        </p>
        <Button type="primary" long className="mt-3" onClick={() => navigate(`/co-phieu/${symbol.toUpperCase()}?tab=financials`)}>
          Mở phân tích BCTC
        </Button>
      </div>
    </div>
  )
}
```

`HomeSidePanel.tsx`: import `BctcLauncher`, thêm `case "bctc": return <BctcLauncher />`.

`StockPage.tsx` (trong `StockTerminal`): thay init state —

```tsx
import { useSearchParams } from "react-router"
// ...
const [searchParams] = useSearchParams()
const [activeTab, setActiveTab] = useState<StockTab>(() => {
  const t = searchParams.get("tab")
  return t === "financials" || t === "overview" || t === "orderbook" ? t : "chart"
})
```

(giữ nguyên mọi logic khác; chỉ init một lần khi mount.)

- [ ] **Step 4: green** — `npx vitest run src/features/home-workspace src/features/stock` rồi FULL `npx vitest run` + `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(home-fe): tab BCTC trên icon rail — launcher điều hướng ?tab=financials"`

---

### Task 5: Verify toàn cục

- [ ] Full gates: `npx vitest run` (kỳ vọng ~310+ passed, 0 fail) + `npx tsc --noEmit` + `npm run build`. Backend không đổi — không cần chạy.
- [ ] Grep xác nhận: `grep -rn "getDisplayMode" dashboard/src` → 0 kết quả; `grep -rn "DisplayMode" dashboard/src` → 0 kết quả ngoài home-analysis types.
- [ ] Smoke thủ công (npm run dev): trang chủ hiện 3 tab, click qua lại 3 brief, pill MỚI đúng, dark+light đều đọc được, icon rail có tab BCTC, click launcher mở đúng tab Tài chính trang mã.
- [ ] Commit test-only adjustments nếu có: `git commit -m "test(home-fe): full verification pass"`
