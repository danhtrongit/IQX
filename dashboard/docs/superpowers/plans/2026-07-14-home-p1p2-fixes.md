# Home P1+P2 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** (P1) Pre-market world boxes hiển thị giá dù stale thay vì "—"; (P2) tab "Phân tích cổ phiếu" trang chủ render AI insight INLINE thay vì điều hướng.

**Architecture:** P1 = sửa `WorldCellCard` (chỉ blank khi value thật sự null; stale vẫn hiện số + dim + tag "cũ"). P2 = `AnalysisEntryView` thêm slot `result` (giữ ô search cố định như mockup); `StockAnalysisView` giữ state symbol, render `<AiInsightBriefing>` (bọc `PremiumGate`) trong slot đó.

**Tech Stack:** React 19, Arco, Tailwind v4, Vitest/RTL.

## Global Constraints

- App tokens/classes hiện có; không hardcode hex mới. Không đụng backend, không đụng shell/`/co-phieu`.
- Prod đã xác nhận: cells có value thật (^GSPC 7483.24…) nhưng `stale:true` → FE ẩn "—". Với brief TRƯỚC PHIÊN, số đêm qua là số cần xem → PHẢI hiện.
- `AiInsightBriefing` (`@/features/stock` → `./ai-insight`) là component độc lập, prop `{symbol}`, tự fetch khi mount; KHÔNG phụ thuộc route/SymbolProvider. Bọc `PremiumGate` (`@/features/premium`) đúng như StockPage: `featureName="AI Insight"`, `description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."`.
- Mock DIRECT children trong test. Full vitest + tsc + build phải xanh.

---

### Task 1: P1 — WorldCellCard hiện giá stale (không blank)

**Files:**
- Modify: `dashboard/src/features/market-overview/premarket/PreMarketView.tsx` (`WorldCellCard`, ~line 72-116)
- Modify: `dashboard/src/features/market-overview/premarket/premarket.css` (thêm tag "cũ")
- Test: có thể thêm `dashboard/src/features/market-overview/premarket/WorldCellCard.test.tsx` (nếu chưa test riêng — export WorldCellCard hoặc test qua PreMarketView fixture)

**Interfaces:**
- `WorldCell = {id,label,value:number|null,change_pct:number|null,sentiment:"up"|"down"|"flat",stale:boolean,source?:"vcb"}`.

- [ ] **Step 1: Failing test** — render `WorldCellCard` (export nó) với cell stale-nhưng-có-value → phải thấy số + tag "cũ", KHÔNG thấy "—":

```tsx
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { WorldCellCard } from "./PreMarketView"

describe("WorldCellCard", () => {
  it("stale nhưng có value → hiện số + tag 'cũ', không '—'", () => {
    render(<WorldCellCard cell={{ id: "^GSPC", label: "S&P 500", value: 7483.24, change_pct: 1.71, sentiment: "up", stale: true }} />)
    expect(screen.getByText("7.483,24")).toBeInTheDocument()
    expect(screen.getByText(/cũ/i)).toBeInTheDocument()
    expect(screen.queryByText("—")).not.toBeInTheDocument()
  })
  it("value null → hiện '—'", () => {
    render(<WorldCellCard cell={{ id: "^N225", label: "NIKKEI", value: null, change_pct: null, sentiment: "flat", stale: true }} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })
  it("tươi (không stale) → số + không tag 'cũ'", () => {
    render(<WorldCellCard cell={{ id: "VND=X", label: "USD/VND", value: 26470, change_pct: null, sentiment: "flat", stale: false }} />)
    expect(screen.getByText("26.470")).toBeInTheDocument()
    expect(screen.queryByText(/cũ/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: red** — `npx vitest run src/features/market-overview/premarket/WorldCellCard` (WorldCellCard chưa export → fail).
- [ ] **Step 3: implement** — export `WorldCellCard` và đổi logic: chỉ blank khi value null; stale vẫn hiện số.

```tsx
export function WorldCellCard({ cell }: { cell: WorldCell }) {
  const hasValue = cell.value != null
  const sentimentClass = !hasValue
    ? ""
    : cell.sentiment === "up"
      ? "pm-world-cell--up"
      : cell.sentiment === "down"
        ? "pm-world-cell--down"
        : ""
  const staleClass = cell.stale ? " pm-world-cell--stale" : ""
  const changeClass =
    cell.sentiment === "up"
      ? "pm-world-cell-change--up"
      : cell.sentiment === "down"
        ? "pm-world-cell-change--down"
        : "pm-world-cell-change--flat"

  return (
    <div
      className={`pm-world-cell ${sentimentClass}${staleClass}`}
      title={
        !hasValue
          ? `${cell.label}: dữ liệu chưa có`
          : cell.stale
            ? `${cell.label}: số phiên gần nhất (chưa cập nhật hôm nay)`
            : undefined
      }
    >
      <div className="pm-world-cell-label">
        {cell.label}
        {hasValue && cell.stale && <span className="pm-world-cell-stale-tag"> · cũ</span>}
      </div>
      {!hasValue ? (
        <div className="pm-world-cell-value">—</div>
      ) : (
        <>
          <div className="pm-world-cell-value">{cell.value!.toLocaleString("vi-VN")}</div>
          {cell.change_pct != null && (
            <div className={`pm-world-cell-change ${changeClass}`}>
              {cell.change_pct > 0 ? "+" : ""}
              {cell.change_pct.toFixed(2)}%
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

CSS thêm vào `premarket.css` cạnh `.pm-world-cell--stale`:

```css
.pm-world-cell-stale-tag { color: var(--color-text-3); font-weight: 400; font-size: 0.85em; }
```

(`.pm-world-cell--stale { opacity: 0.5 }` giữ nguyên — cell mờ nhẹ báo cũ; số vẫn đọc được.)

- [ ] **Step 4: green** — `npx vitest run src/features/market-overview/premarket`.
- [ ] **Step 5: Commit** — `git commit -m "fix(premarket-fe): hiện giá thế giới dù stale (dim + tag 'cũ') thay vì blank '—'"`

---

### Task 2: P2 — AnalysisEntryView slot + StockAnalysisView inline AI insight

**Files:**
- Modify: `dashboard/src/features/home-workspace/AnalysisEntryView.tsx` (thêm optional `result` slot; giữ ô search cố định)
- Modify: `dashboard/src/features/home-workspace/StockAnalysisView.tsx` (state symbol + render AiInsightBriefing gated)
- Test: `dashboard/src/features/home-workspace/AnalysisViews.test.tsx` (cập nhật StockAnalysisView case), `AnalysisEntryView.test.tsx` (thêm slot case)

**Interfaces:**
- `AnalysisEntryView` props += `result?: ReactNode`. Khi `result` có → render nó thay cho empty-state (ô search vẫn hiện phía trên, submit vẫn chạy). Khi không → giữ empty-state như cũ.
- `StockAnalysisView`: `useState<string|null>` symbol; `onSubmit={setSymbol}`; `result = symbol ? <PremiumGate…><AiInsightBriefing symbol={symbol} /></PremiumGate> : undefined`.

- [ ] **Step 1: Failing tests**

`AnalysisEntryView.test.tsx` thêm:

```tsx
it("có result → render result, KHÔNG render empty-state", () => {
  render(<AnalysisEntryView {...base} onSubmit={() => {}} result={<div data-testid="res" />} />)
  expect(screen.getByTestId("res")).toBeInTheDocument()
  expect(screen.queryByText(base.emptyTitle)).not.toBeInTheDocument()
  // ô search vẫn còn
  expect(screen.getByPlaceholderText(base.placeholder)).toBeInTheDocument()
})
```

`AnalysisViews.test.tsx` — thay case điều-hướng của StockAnalysisView bằng inline:

```tsx
vi.mock("@/features/stock", () => ({ AiInsightBriefing: ({ symbol }: { symbol: string }) => <div data-testid="ai-insight">{symbol}</div> }))
vi.mock("@/features/premium", () => ({ PremiumGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
// react-router mock giữ nguyên nếu FinancialAnalysisView vẫn dùng navigate

it("StockAnalysisView: nhập mã → render AiInsightBriefing inline (không điều hướng)", () => {
  render(<StockAnalysisView />)
  fireEvent.change(screen.getByPlaceholderText("Nhập mã cổ phiếu..."), { target: { value: "fpt" } })
  fireEvent.click(screen.getByRole("button", { name: "Phân tích" }))
  expect(screen.getByTestId("ai-insight")).toHaveTextContent("FPT")
})
```

- [ ] **Step 2: red.**
- [ ] **Step 3: implement**

`AnalysisEntryView.tsx` — thêm `result?: ReactNode` vào props; trong JSX đổi khối empty-state:

```tsx
      {/* dưới search: result nếu có, ngược lại empty-state */}
      {result ?? (
        <div className="mx-auto max-w-[480px] px-6 pb-20 pt-[100px] text-center">
          <div className="mb-5 text-[56px] opacity-30">{emptyIcon}</div>
          <div className="mb-3 text-[20px] font-bold text-[var(--color-text-1)]">{emptyTitle}</div>
          <div className="text-[14px] leading-[1.65] text-[var(--color-text-2)]">{emptyDesc}</div>
        </div>
      )}
```

(thêm `result` vào destructure props + type `result?: ReactNode`.)

`StockAnalysisView.tsx`:

```tsx
import { useState } from "react"
import { IconArrowRise } from "@arco-design/web-react/icon"
import { AiInsightBriefing } from "@/features/stock"
import { PremiumGate } from "@/features/premium"
import { AnalysisEntryView } from "./AnalysisEntryView"

export function StockAnalysisView() {
  const [symbol, setSymbol] = useState<string | null>(null)
  return (
    <AnalysisEntryView
      icon={<IconArrowRise />}
      title="Phân tích cổ phiếu"
      subtitle="6 lớp dữ liệu · Cập nhật theo phiên giao dịch"
      placeholder="Nhập mã cổ phiếu..."
      emptyIcon={<IconArrowRise />}
      emptyTitle="Nhập mã cổ phiếu để bắt đầu"
      emptyDesc="Hệ thống sẽ phân tích cổ phiếu qua 6 lớp dữ liệu: kỹ thuật, giao dịch nước ngoài, tự doanh CTCK, giao dịch nội bộ, tin tức & sự kiện, và cơ bản – định giá."
      onSubmit={setSymbol}
      result={
        symbol ? (
          <div className="pt-6">
            <PremiumGate
              featureName="AI Insight"
              description="Phân tích AI đa lớp cho mã đang xem (Xu hướng, Thanh khoản, Dòng tiền, Nội bộ, Tin tức)."
            >
              <AiInsightBriefing symbol={symbol} />
            </PremiumGate>
          </div>
        ) : undefined
      }
    />
  )
}
```

(Kiểm `AiInsightBriefing` có export từ `@/features/stock` — recon xác nhận có. Nếu không, dùng `@/features/stock/ai-insight`.)

- [ ] **Step 4: green** — `npx vitest run src/features/home-workspace` rồi FULL `npx vitest run` + `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "feat(home-fe): tab Cổ phiếu render AI insight inline (bỏ điều hướng /co-phieu)"`

---

### Task 3: Verify + kiểm dữ liệu báo cáo

- [ ] Full gates: `npx vitest run` + `npx tsc --noEmit` + `npm run build` — xanh.
- [ ] Kiểm 3 endpoint report trên prod (curl): `/market-analysis/{daily,midday,premarket}/latest` — mỗi cái 200 khi có báo cáo hôm nay, 404 graceful khi chưa (FE fallback). Ghi lại ngày có/không báo cáo quan sát được; nếu phát hiện gap generation thật (vd premarket không chạy ngày thường) → báo cáo như finding, KHÔNG tự sửa backend trong track này.
- [ ] Smoke (local be+fe, Playwright): tab Thị trường→Trước phiên hiện 6 box CÓ SỐ (stale thì mờ + "cũ"); tab Cổ phiếu nhập mã → AI insight hiện inline, không đổi URL.
- [ ] Commit test-only nếu có.
