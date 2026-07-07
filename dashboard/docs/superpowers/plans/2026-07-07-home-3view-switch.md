# Home 3-View Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape trang chủ `/` thành bộ chuyển 3 view (Phân tích thị trường / cổ phiếu / BCTC) qua rail phải, bỏ side panel giao dịch.

**Architecture:** `HomeWorkspace` bỏ grid 3 cột + side panel + SymbolProvider; thay bằng `useState<HomeView>` + `HomeAnalysisRail` (3 tab) chọn nội dung content-area 980px. Tab thị trường = `HomeMarketView` giữ nguyên; tab cổ phiếu/BCTC = `AnalysisEntryView` (header + search + empty-state) điều hướng `/co-phieu/:symbol`.

**Tech Stack:** React 19, Arco Design, Tailwind v4 (no-preflight), react-router (import từ `"react-router"`), Vitest + RTL.

## Global Constraints

- Design doc: `dashboard/docs/specs/2026-07-07-home-3view-switch-design.md` — mọi giá trị ở đó là chuẩn.
- App font là Tahoma (`--font-sans`); Space Grotesk KHÔNG được load → dùng `font-bold`/`font-semibold`, KHÔNG set font-family Space Grotesk.
- Màu: token app `rgb(var(--primary-6))` / `var(--color-primary-light-1)` / `var(--color-text-1|2|3)` / `var(--color-border-2)` / `var(--color-bg-1|2)`. KHÔNG hardcode `#3b82f6`. Hoạt động cả dark+light.
- Icons: `IconDashboard`, `IconArrowRise`, `IconFile` từ `@arco-design/web-react/icon` (đã verify tồn tại).
- `HomeView = "market" | "stock" | "financial"`, default `"market"`, mount-once (KHÔNG persist, KHÔNG interval).
- Submit mã → `navigate('/co-phieu/{SYMBOL}')` (stock) / `navigate('/co-phieu/{SYMBOL}?tab=financials')` (financial); SYMBOL = input trim + uppercase; rỗng → không điều hướng.
- Copy verbatim: stock title "Phân tích cổ phiếu", subtitle "6 lớp dữ liệu · Cập nhật theo phiên giao dịch", empty-desc "Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."; BCTC title "Phân tích BCTC", subtitle "Báo cáo tài chính · Theo quý và cả năm", empty-desc "Hệ thống sẽ phân tích báo cáo tài chính của doanh nghiệp — kết quả kinh doanh, cân đối kế toán, lưu chuyển tiền tệ và các chỉ số tài chính quan trọng theo từng quý."; placeholder "Nhập mã cổ phiếu...", nút "Phân tích".
- Rail nhãn 2 dòng: "Phân tích / thị trường", "Phân tích / cổ phiếu", "Phân tích / BCTC". `role="tablist"` + mỗi nút `role="tab"` + `aria-selected`.
- Mock DIRECT children trong test (bài học time-of-day flake). KHÔNG đụng shell/Header/MarketBar, `/co-phieu`, `/bieu-do`, backend.

---

### Task 1: AnalysisEntryView (presentational + submit)

**Files:**
- Create: `dashboard/src/features/home-workspace/AnalysisEntryView.tsx`
- Test: `dashboard/src/features/home-workspace/AnalysisEntryView.test.tsx`

**Interfaces:**
- Produces: `interface AnalysisEntryProps { icon: ReactNode; title: string; subtitle: string; placeholder: string; emptyIcon: ReactNode; emptyTitle: string; emptyDesc: string; onSubmit: (symbol: string) => void }` và `function AnalysisEntryView(props: AnalysisEntryProps)`. Task 2 render nó.

- [ ] **Step 1: Failing tests**

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AnalysisEntryView } from "./AnalysisEntryView"

const base = {
  icon: <span>I</span>,
  title: "Phân tích cổ phiếu",
  subtitle: "6 lớp dữ liệu · Cập nhật theo phiên giao dịch",
  placeholder: "Nhập mã cổ phiếu...",
  emptyIcon: <span>E</span>,
  emptyTitle: "Nhập mã cổ phiếu để bắt đầu",
  emptyDesc: "Hệ thống sẽ phân tích...",
}

describe("AnalysisEntryView", () => {
  it("hiển thị header, subtitle, empty-state", () => {
    render(<AnalysisEntryView {...base} onSubmit={() => {}} />)
    expect(screen.getByText("Phân tích cổ phiếu")).toBeInTheDocument()
    expect(screen.getByText("6 lớp dữ liệu · Cập nhật theo phiên giao dịch")).toBeInTheDocument()
    expect(screen.getByText("Nhập mã cổ phiếu để bắt đầu")).toBeInTheDocument()
    expect(screen.getByText("Hệ thống sẽ phân tích...")).toBeInTheDocument()
  })
  it("Enter trong input → onSubmit(SYMBOL uppercase, trimmed)", () => {
    const onSubmit = vi.fn()
    render(<AnalysisEntryView {...base} onSubmit={onSubmit} />)
    const input = screen.getByPlaceholderText("Nhập mã cổ phiếu...")
    fireEvent.change(input, { target: { value: " fpt " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledWith("FPT")
  })
  it("click nút Phân tích → onSubmit", () => {
    const onSubmit = vi.fn()
    render(<AnalysisEntryView {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "hpg" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(onSubmit).toHaveBeenCalledWith("HPG")
  })
  it("input rỗng → KHÔNG onSubmit", () => {
    const onSubmit = vi.fn()
    render(<AnalysisEntryView {...base} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "   " } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: red** — `npx vitest run src/features/home-workspace/AnalysisEntryView` → FAIL.
- [ ] **Step 3: implement**

```tsx
import { useState, type ReactNode } from "react"

export interface AnalysisEntryProps {
  icon: ReactNode
  title: string
  subtitle: string
  placeholder: string
  emptyIcon: ReactNode
  emptyTitle: string
  emptyDesc: string
  onSubmit: (symbol: string) => void
}

export function AnalysisEntryView({
  icon, title, subtitle, placeholder, emptyIcon, emptyTitle, emptyDesc, onSubmit,
}: AnalysisEntryProps) {
  const [value, setValue] = useState("")

  const submit = () => {
    const sym = value.trim().toUpperCase()
    if (sym) onSubmit(sym)
  }

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-6 pb-20 lg:px-8">
      {/* View header */}
      <div className="mb-6 flex items-center gap-3.5 border-b border-[var(--color-border-2)] pb-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--color-primary-light-1)] text-[22px] text-[rgb(var(--primary-6))]">
          {icon}
        </div>
        <div>
          <div className="text-[22px] font-bold text-[var(--color-text-1)]">{title}</div>
          <div className="text-[12px] text-[var(--color-text-2)]">{subtitle}</div>
        </div>
      </div>

      {/* Search block */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-5 py-4">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit() }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-[10px] border border-[var(--color-border-2)] bg-[var(--color-bg-1)] px-4 py-3 text-[15px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-1)] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--color-text-3)] focus:border-[rgb(var(--primary-6))]"
        />
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded-[10px] bg-[rgb(var(--primary-6))] px-6 py-3 text-[14px] font-semibold text-white hover:opacity-90"
        >
          Phân tích
        </button>
      </div>

      {/* Empty state */}
      <div className="mx-auto max-w-[480px] px-6 pb-20 pt-[100px] text-center">
        <div className="mb-5 text-[56px] opacity-30">{emptyIcon}</div>
        <div className="mb-3 text-[20px] font-bold text-[var(--color-text-1)]">{emptyTitle}</div>
        <div className="text-[14px] leading-[1.65] text-[var(--color-text-2)]">{emptyDesc}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: green** — cùng lệnh; 4 passed.
- [ ] **Step 5: Commit** — `git add dashboard/src/features/home-workspace/AnalysisEntryView.* && git commit -m "feat(home-fe): AnalysisEntryView — header + search + empty-state (điều hướng)"`

---

### Task 2: StockAnalysisView + FinancialAnalysisView (điều hướng)

**Files:**
- Create: `dashboard/src/features/home-workspace/StockAnalysisView.tsx`
- Create: `dashboard/src/features/home-workspace/FinancialAnalysisView.tsx`
- Test: `dashboard/src/features/home-workspace/AnalysisViews.test.tsx`

**Interfaces:**
- Consumes: `AnalysisEntryView` (Task 1); `IconArrowRise`, `IconFile` từ `@arco-design/web-react/icon`; `useNavigate` từ `"react-router"`.
- Produces: `StockAnalysisView()`, `FinancialAnalysisView()`. Task 4 render.

- [ ] **Step 1: Failing tests**

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { StockAnalysisView } from "./StockAnalysisView"
import { FinancialAnalysisView } from "./FinancialAnalysisView"

const navigate = vi.fn()
vi.mock("react-router", () => ({ useNavigate: () => navigate }))

describe("Stock/Financial analysis views", () => {
  it("StockAnalysisView: submit → /co-phieu/FPT", () => {
    navigate.mockClear()
    render(<StockAnalysisView />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "fpt" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/FPT")
  })
  it("StockAnalysisView: hiển thị đúng tiêu đề + subtitle", () => {
    render(<StockAnalysisView />)
    expect(screen.getByText("Phân tích cổ phiếu")).toBeInTheDocument()
    expect(screen.getByText("6 lớp dữ liệu · Cập nhật theo phiên giao dịch")).toBeInTheDocument()
  })
  it("FinancialAnalysisView: submit → /co-phieu/HPG?tab=financials", () => {
    navigate.mockClear()
    render(<FinancialAnalysisView />)
    fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "hpg" } })
    fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
    expect(navigate).toHaveBeenCalledWith("/co-phieu/HPG?tab=financials")
  })
  it("FinancialAnalysisView: tiêu đề BCTC", () => {
    render(<FinancialAnalysisView />)
    expect(screen.getByText("Phân tích BCTC")).toBeInTheDocument()
    expect(screen.getByText("Báo cáo tài chính · Theo quý và cả năm")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement**

`StockAnalysisView.tsx`:

```tsx
import { useNavigate } from "react-router"
import { IconArrowRise } from "@arco-design/web-react/icon"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function StockAnalysisView() {
  const navigate = useNavigate()
  return (
    <AnalysisEntryView
      icon={<IconArrowRise />}
      title="Phân tích cổ phiếu"
      subtitle="6 lớp dữ liệu · Cập nhật theo phiên giao dịch"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconArrowRise />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."
      onSubmit={(sym) => navigate(`/co-phieu/${sym}`)}
    />
  )
}
```

`FinancialAnalysisView.tsx`:

```tsx
import { useNavigate } from "react-router"
import { IconFile } from "@arco-design/web-react/icon"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function FinancialAnalysisView() {
  const navigate = useNavigate()
  return (
    <AnalysisEntryView
      icon={<IconFile />}
      title="Phân tích BCTC"
      subtitle="Báo cáo tài chính · Theo quý và cả năm"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconFile />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích báo cáo tài chính của doanh nghiệp — kết quả kinh doanh, cân đối kế toán, lưu chuyển tiền tệ và các chỉ số tài chính quan trọng theo từng quý."
      onSubmit={(sym) => navigate(`/co-phieu/${sym}?tab=financials`)}
    />
  )
}
```

- [ ] **Step 4: green** — `npx vitest run src/features/home-workspace/AnalysisViews`.
- [ ] **Step 5: Commit** — `git commit -m "feat(home-fe): StockAnalysisView + FinancialAnalysisView (điều hướng /co-phieu)"`

---

### Task 3: HomeAnalysisRail (3 tab, side/bottom variant)

**Files:**
- Create: `dashboard/src/features/home-workspace/HomeAnalysisRail.tsx`
- Test: `dashboard/src/features/home-workspace/HomeAnalysisRail.test.tsx`

**Interfaces:**
- Consumes: `IconDashboard`, `IconArrowRise`, `IconFile`; `cn` từ `@/shared/lib/cn`.
- Produces: `type HomeView = "market" | "stock" | "financial"`; `function HomeAnalysisRail({ active, onSelect, variant }: { active: HomeView; onSelect: (v: HomeView) => void; variant: "side" | "bottom" })`. Task 4 import `HomeView` + render.

- [ ] **Step 1: Failing tests**

```tsx
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HomeAnalysisRail } from "./HomeAnalysisRail"

describe("HomeAnalysisRail", () => {
  it("3 tab với aria-selected đúng", () => {
    render(<HomeAnalysisRail active="market" onSelect={() => {}} variant="side" />)
    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(3)
    expect(screen.getByRole("tab", { name: /thị trường/i })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /cổ phiếu/i })).toHaveAttribute("aria-selected", "false")
  })
  it("click tab → onSelect(view)", () => {
    const onSelect = vi.fn()
    render(<HomeAnalysisRail active="market" onSelect={onSelect} variant="side" />)
    fireEvent.click(screen.getByRole("tab", { name: /BCTC/i }))
    expect(onSelect).toHaveBeenCalledWith("financial")
  })
  it("variant side → tablist dọc (flex-col); bottom → ngang fixed", () => {
    const { rerender } = render(<HomeAnalysisRail active="market" onSelect={() => {}} variant="side" />)
    expect(screen.getByRole("tablist").className).toContain("flex-col")
    rerender(<HomeAnalysisRail active="market" onSelect={() => {}} variant="bottom" />)
    expect(screen.getByRole("tablist").className).toContain("fixed")
  })
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement**

```tsx
import type { ComponentType } from "react"
import { IconDashboard, IconArrowRise, IconFile } from "@arco-design/web-react/icon"
import { cn } from "@/shared/lib/cn"

export type HomeView = "market" | "stock" | "financial"

const TABS: { id: HomeView; icon: ComponentType; label: [string, string] }[] = [
  { id: "market", icon: IconDashboard, label: ["Phân tích", "thị trường"] },
  { id: "stock", icon: IconArrowRise, label: ["Phân tích", "cổ phiếu"] },
  { id: "financial", icon: IconFile, label: ["Phân tích", "BCTC"] },
]

export function HomeAnalysisRail({
  active, onSelect, variant,
}: {
  active: HomeView
  onSelect: (v: HomeView) => void
  variant: "side" | "bottom"
}) {
  return (
    <nav
      role="tablist"
      aria-label="Loại phân tích"
      className={cn(
        variant === "side"
          ? "sticky top-0 flex h-full w-[88px] flex-col gap-1 border-l border-[var(--color-border-2)] bg-[var(--color-bg-2)] py-4"
          : "fixed inset-x-0 bottom-0 z-40 flex flex-row border-t border-[var(--color-border-2)] bg-[var(--color-bg-2)]",
      )}
    >
      {TABS.map((t) => {
        const Icon = t.icon
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex flex-col items-center gap-2 border-transparent transition-colors",
              variant === "side"
                ? "w-full border-l-[3px] px-1.5 py-[18px]"
                : "flex-1 border-b-[3px] py-2.5",
              isActive
                ? "border-[rgb(var(--primary-6))] bg-[var(--color-primary-light-1)] text-[rgb(var(--primary-6))]"
                : "text-[var(--color-text-3)] hover:bg-[var(--color-fill-2)] hover:text-[var(--color-text-1)]",
            )}
          >
            <span className="text-[22px]"><Icon /></span>
            <span className="text-center text-[10px] font-bold uppercase leading-[1.2] tracking-[0.3px]">
              {t.label[0]}<br />{t.label[1]}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: green** — `npx vitest run src/features/home-workspace/HomeAnalysisRail`.
- [ ] **Step 5: Commit** — `git commit -m "feat(home-fe): HomeAnalysisRail — 3 tab phân tích (side/bottom variant)"`

---

### Task 4: HomeWorkspace rewrite + dọn dead code

**Files:**
- Modify (rewrite): `dashboard/src/features/home-workspace/HomeWorkspace.tsx`
- Rewrite test: `dashboard/src/features/home-workspace/HomeWorkspace.test.tsx`
- Delete: `HomeSidePanel.tsx`, `HomeIconRail.tsx`, `PhanTichLauncher.tsx`, `types.ts`, và các test tương ứng (`HomeIconRail.test.tsx`, `BctcLauncher.test.tsx`, và mọi test import các file này)

**Interfaces:**
- Consumes: `HomeView`, `HomeAnalysisRail` (Task 3); `StockAnalysisView`, `FinancialAnalysisView` (Task 2); `HomeMarketView` (`@/features/market-overview/HomeMarketView`, giữ nguyên); `useMediaQuery` (`./useMediaQuery`).
- Produces: `HomeWorkspace()` — signature không đổi (router render như cũ).

- [ ] **Step 1: Failing test** (rewrite toàn bộ file test; mock DIRECT children)

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { HomeWorkspace } from "./HomeWorkspace"

vi.mock("@/features/market-overview/HomeMarketView", () => ({ HomeMarketView: () => <div data-testid="market-view" /> }))
vi.mock("./StockAnalysisView", () => ({ StockAnalysisView: () => <div data-testid="stock-view" /> }))
vi.mock("./FinancialAnalysisView", () => ({ FinancialAnalysisView: () => <div data-testid="financial-view" /> }))

const mq = vi.hoisted(() => ({ desktop: true }))
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => mq.desktop }))

beforeEach(() => { mq.desktop = true })

describe("HomeWorkspace (3-view switch)", () => {
  it("mặc định render market view + rail 3 tab", () => {
    render(<HomeWorkspace />)
    expect(screen.getByTestId("market-view")).toBeInTheDocument()
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.queryByTestId("stock-view")).not.toBeInTheDocument()
  })
  it("click tab Cổ phiếu → stock view; market ẩn", () => {
    render(<HomeWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: /cổ phiếu/i }))
    expect(screen.getByTestId("stock-view")).toBeInTheDocument()
    expect(screen.queryByTestId("market-view")).not.toBeInTheDocument()
  })
  it("click tab BCTC → financial view", () => {
    render(<HomeWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: /BCTC/i }))
    expect(screen.getByTestId("financial-view")).toBeInTheDocument()
  })
  it("mobile: vẫn render đủ 3 tab (bottom bar)", () => {
    mq.desktop = false
    render(<HomeWorkspace />)
    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.getByTestId("market-view")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement** — rewrite `HomeWorkspace.tsx`:

```tsx
import { useState } from "react"
import { HomeMarketView } from "@/features/market-overview/HomeMarketView"
import { HomeAnalysisRail, type HomeView } from "./HomeAnalysisRail"
import { StockAnalysisView } from "./StockAnalysisView"
import { FinancialAnalysisView } from "./FinancialAnalysisView"
import { useMediaQuery } from "./useMediaQuery"

export function HomeWorkspace() {
  const [active, setActive] = useState<HomeView>("market")
  const isDesktop = useMediaQuery("(min-width: 1024px)")

  const select = (v: HomeView) => {
    setActive(v)
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const content = (
    <div className="min-h-0 overflow-y-auto">
      {active === "market" && <HomeMarketView />}
      {active === "stock" && <StockAnalysisView />}
      {active === "financial" && <FinancialAnalysisView />}
    </div>
  )

  if (isDesktop) {
    return (
      <div className="grid h-full grid-cols-[1fr_88px]">
        {content}
        <HomeAnalysisRail active={active} onSelect={select} variant="side" />
      </div>
    )
  }

  return (
    <div className="h-full pb-16">
      {content}
      <HomeAnalysisRail active={active} onSelect={select} variant="bottom" />
    </div>
  )
}
```

- [ ] **Step 4: Xoá dead files + verify** — chạy grep ĐẢM BẢO 0 ref trước khi xoá, rồi xoá:

```bash
cd dashboard
# xác nhận không còn ref ngoài chính chúng
grep -rn "HomeSidePanel\|HomeIconRail\|PhanTichLauncher\|BctcLauncher\|from \"./types\"\|from \"@/features/home-workspace/types\"" src --include="*.ts" --include="*.tsx" | grep -v -E "HomeSidePanel\.tsx|HomeIconRail\.(tsx|test\.tsx)|PhanTichLauncher\.tsx|BctcLauncher\.test\.tsx|home-workspace/types\.ts"
# nếu output rỗng → xoá:
git rm src/features/home-workspace/HomeSidePanel.tsx \
       src/features/home-workspace/HomeIconRail.tsx \
       src/features/home-workspace/HomeIconRail.test.tsx \
       src/features/home-workspace/PhanTichLauncher.tsx \
       src/features/home-workspace/BctcLauncher.test.tsx \
       src/features/home-workspace/types.ts
```

(Nếu có file test khác import các file trên mà grep phát hiện, xoá kèm hoặc gỡ import — không để lại ref chết. `useInitialSymbol`/`persistLastViewedSymbol` + `SymbolProvider` GIỮ: test-setup.ts còn ref.)

- [ ] **Step 5: green** — `npx vitest run src/features/home-workspace` → all pass; rồi FULL `npx vitest run` + `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(home-fe): trang chủ thành 3-view switch, bỏ side panel + dọn dead code"`

---

### Task 5: Verify toàn cục + smoke

- [ ] **Full gates:** `npx vitest run` (kỳ vọng pass, 0 fail — số test giảm do xoá HomeSidePanel/launcher tests, tăng do 3 file mới) + `npx tsc --noEmit` + `npm run build`.
- [ ] **Grep gate:** `grep -rn "useSymbol" src/features/home-workspace src/features/market-overview/HomeMarketView.tsx` → 0 (home không còn phụ thuộc symbol context); `grep -rn "HomeSidePanel\|HomeIconRail" src` → 0.
- [ ] **Smoke thủ công (local be+fe, Playwright):** trang chủ hiện market view + rail 88px 3 tab; click Cổ phiếu → header "Phân tích cổ phiếu" + ô search + empty-state; nhập "FPT" + nút Phân tích → điều hướng `/co-phieu/FPT`; back → click BCTC → điều hướng `?tab=financials`; dark+light đọc được; thu hẹp <1024px → rail thành bottom bar 3 tab, content full-width không bị che.
- [ ] **Commit** test-only adjustments nếu có: `git commit -m "test(home-fe): full verification pass"`
