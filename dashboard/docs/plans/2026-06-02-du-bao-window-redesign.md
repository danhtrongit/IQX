# Dự báo dạng cửa sổ + 6 tinh chỉnh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa tính năng "Dự báo" (`/du-bao`) từ nhánh `feat/premium-trial-and-gating` về `main`, biến nó thành cửa sổ nổi kéo–thả giống AI Insight, và áp 6 tinh chỉnh UI (ISSUE-016..021).

**Architecture:** Port 7 file frontend + 1 file backend từ nhánh tham chiếu bằng `git checkout`. Tạo `forecast-window.tsx` nhân khuôn cửa sổ kéo–thả của AI Insight, điều khiển mở/đóng bằng state mới trong `sidebar-context`. Gom các hàm format thuần vào `forecast-format.ts` (có unit test vitest) để DRY và áp các thay đổi #018/#020/#021. Các thay đổi UI khác xác minh bằng `tsc -b && vite build` + kiểm thử thủ công.

**Tech Stack:** React + TypeScript + Vite, framer-motion (cửa sổ kéo–thả), TailwindCSS, lucide-react, vitest (test hàm thuần), FastAPI (backend, đọc Google Sheet).

**Nhánh tham chiếu để port:** `origin/feat/premium-trial-and-gating` (tip `b1ec8b5`).

---

## File Structure

**Tạo mới (frontend):**
- `dashboard/src/components/forecast/forecast-format.ts` — hàm format thuần dùng chung: `netFlowLabel`, `fmtRatioPlain`, `fmtProjectedPrice`, `fmtPct`.
- `dashboard/src/components/forecast/forecast-window.tsx` — khuôn cửa sổ kéo–thả bọc `ForecastPage`.
- `dashboard/tests/forecast-format.spec.ts` — unit test cho `forecast-format.ts`.

**Port từ nhánh (frontend, copy nguyên trạng rồi sửa ở các task sau):**
- `dashboard/src/hooks/use-forecast-ranking.ts`
- `dashboard/src/components/forecast/forecast-page.tsx`
- `dashboard/src/components/forecast/forecast-stock-header.tsx`
- `dashboard/src/components/forecast/forecast-layer-cards.tsx`
- `dashboard/src/components/forecast/forecast-right-rail.tsx`
- `dashboard/src/components/forecast/forecast-patterns.tsx`
- `dashboard/src/components/forecast/forecast-ranking-list.tsx`

**Port từ nhánh (backend):**
- `backend/app/services/ai/forecast_service.py` (bản đọc sheet `Du_Bao`). **Giữ nguyên** `backend/app/api/v1/endpoints/ai_forecast.py` của main (bản nhánh thêm `PremiumUser` không có trên main).

**Sửa (frontend):**
- `dashboard/src/contexts/sidebar-context.tsx` — thêm state cửa sổ; bỏ `"forecast"` khỏi `SidebarPanel`.
- `dashboard/src/components/layout/right-toolbar.tsx` — nút "Dự báo" mở cửa sổ.
- `dashboard/src/components/layout/right-sidebar.tsx` — bỏ panel forecast.
- `dashboard/src/pages/dashboard.tsx` — render `<ForecastWindow>`.
- `dashboard/src/pages/stock.tsx` — render `<ForecastWindow>`.

**Xóa:**
- `dashboard/src/components/forecast/forecast-panel.tsx` (sidebar cũ, đã thay thế).

**Lệnh kiểm thử dùng chung:**
- Build/typecheck: `cd dashboard && npm run build`
- Unit test: `cd dashboard && npx vitest run tests/forecast-format.spec.ts`

---

## Task 1: Port lát cắt forecast frontend từ nhánh

**Files:**
- Tạo (qua git checkout): 7 file frontend liệt kê ở trên.

- [ ] **Step 1: Lấy 7 file frontend từ nhánh tham chiếu**

```bash
cd /Users/danhtrongit/Projects/IQX
git checkout origin/feat/premium-trial-and-gating -- \
  dashboard/src/hooks/use-forecast-ranking.ts \
  dashboard/src/components/forecast/forecast-page.tsx \
  dashboard/src/components/forecast/forecast-stock-header.tsx \
  dashboard/src/components/forecast/forecast-layer-cards.tsx \
  dashboard/src/components/forecast/forecast-right-rail.tsx \
  dashboard/src/components/forecast/forecast-patterns.tsx \
  dashboard/src/components/forecast/forecast-ranking-list.tsx
```

- [ ] **Step 2: Build để xác nhận các file biên dịch được (chưa được tham chiếu, chỉ cần resolve import)**

Run: `cd dashboard && npm run build`
Expected: PASS (không lỗi TypeScript). Nếu lỗi "Cannot find module", kiểm tra phụ thuộc đã có trên main (`usePrice`, `useWatchlist`, `pattern-illustration`, `AIAnalyzingOverlay`, `StockLogo`).

- [ ] **Step 3: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/hooks/use-forecast-ranking.ts dashboard/src/components/forecast/
git commit -m "chore(forecast): port /du-bao forecast components from premium branch (ISSUE-016)"
```

---

## Task 2: Port backend forecast_service (sheet Du_Bao → projectedPrice)

**Files:**
- Modify (qua git checkout): `backend/app/services/ai/forecast_service.py`

- [ ] **Step 1: Lấy bản service từ nhánh**

```bash
cd /Users/danhtrongit/Projects/IQX
git checkout origin/feat/premium-trial-and-gating -- backend/app/services/ai/forecast_service.py
```

- [ ] **Step 2: Xác nhận endpoint của main vẫn tương thích (không sửa ai_forecast.py)**

Run: `cd /Users/danhtrongit/Projects/IQX && rg -n "get_forecast_ranking|get_forecast_for_symbol" backend/app/services/ai/forecast_service.py backend/app/api/v1/endpoints/ai_forecast.py`
Expected: service vẫn export `get_forecast_ranking(...)` và `get_forecast_for_symbol(...)`; endpoint main import đúng hai tên này. (Service mới: `get_forecast_ranking(horizon=None, *, limit=20)` — tương thích lời gọi `get_forecast_ranking(horizon, limit=limit)` của endpoint.)

- [ ] **Step 3: Xác nhận import sheet helper tồn tại**

Run: `cd /Users/danhtrongit/Projects/IQX && rg -n "fetch_sheet_data" backend/app/services/market_data/sources/google_sheets.py`
Expected: tìm thấy `fetch_sheet_data` (cùng helper main đang dùng). Nếu backend có test/khởi động được: `cd backend && python -c "import app.services.ai.forecast_service"` → không lỗi import.

- [ ] **Step 4: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add backend/app/services/ai/forecast_service.py
git commit -m "feat(forecast): source ranking from Du_Bao sheet → projectedPrice (ISSUE-016)"
```

> Lưu ý dữ liệu: cần tab `Du_Bao` tồn tại trong spreadsheet `MODEL_AI`. Nếu chưa có, API trả `items` rỗng/`projectedPrice` null và UI hiển thị "—" — không vỡ.

---

## Task 3: Module format thuần `forecast-format.ts` + unit test (TDD)

**Files:**
- Create: `dashboard/src/components/forecast/forecast-format.ts`
- Test: `dashboard/tests/forecast-format.spec.ts`

- [ ] **Step 1: Viết test thất bại**

Tạo `dashboard/tests/forecast-format.spec.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  netFlowLabel,
  fmtRatioPlain,
  fmtProjectedPrice,
  fmtPct,
} from "../src/components/forecast/forecast-format"

describe("netFlowLabel", () => {
  it("rút gọn về 'Mua ròng' khi giá trị chứa 'mua'", () => {
    expect(netFlowLabel("Khối ngoại mua ròng 1.2 tỷ")).toBe("Mua ròng")
    expect(netFlowLabel("Mua ròng")).toBe("Mua ròng")
  })
  it("rút gọn về 'Bán ròng' khi giá trị chứa 'bán'", () => {
    expect(netFlowLabel("Tự doanh bán ròng 500 triệu")).toBe("Bán ròng")
  })
  it("trả 'Cân bằng' cho trường hợp trung tính", () => {
    expect(netFlowLabel("Cân bằng")).toBe("Cân bằng")
    expect(netFlowLabel("trung lập")).toBe("Cân bằng")
  })
  it("trả '—' cho giá trị rỗng", () => {
    expect(netFlowLabel("")).toBe("—")
    expect(netFlowLabel(null)).toBe("—")
  })
})

describe("fmtRatioPlain", () => {
  it("không thêm hậu tố 'x'", () => {
    expect(fmtRatioPlain(15.2)).toBe("15.20")
    expect(fmtRatioPlain(0)).toBe("0.00")
  })
  it("trả '—' cho giá trị không hợp lệ", () => {
    expect(fmtRatioPlain(null)).toBe("—")
    expect(fmtRatioPlain(undefined)).toBe("—")
  })
})

describe("fmtProjectedPrice", () => {
  it("chia 1000 và để 2 chữ số thập phân", () => {
    expect(fmtProjectedPrice(45200)).toBe("45.20")
  })
  it("trả '—' cho <=0 hoặc null", () => {
    expect(fmtProjectedPrice(0)).toBe("—")
    expect(fmtProjectedPrice(null)).toBe("—")
  })
})

describe("fmtPct", () => {
  it("định dạng phần trăm có dấu", () => {
    expect(fmtPct(0.042, true)).toBe("+4.2%")
    expect(fmtPct(-0.031, true)).toBe("-3.1%")
  })
  it("trả '—' cho null", () => {
    expect(fmtPct(null)).toBe("—")
  })
})
```

- [ ] **Step 2: Chạy test để xác nhận thất bại**

Run: `cd dashboard && npx vitest run tests/forecast-format.spec.ts`
Expected: FAIL ("Cannot find module .../forecast-format").

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `dashboard/src/components/forecast/forecast-format.ts`:

```ts
/** Hàm format thuần dùng chung cho các component của cửa sổ Dự báo. */

/** Rút gọn giá trị dòng tiền tự do về đúng nhãn ròng (Mua/Bán/Cân bằng). */
export function netFlowLabel(value: string | null | undefined): string {
  if (!value) return "—"
  const v = value.toLowerCase()
  if (v.includes("mua")) return "Mua ròng"
  if (v.includes("bán") || v.includes("ban")) return "Bán ròng"
  return "Cân bằng"
}

/** Định dạng chỉ số tài chính thành số trơn (không có hậu tố "x"). */
export function fmtRatioPlain(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toFixed(2)
}

/** Giá dự phóng lưu theo VND; hiển thị theo đơn vị nghìn. */
export function fmtProjectedPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—"
  return (v / 1000).toFixed(2)
}

/** Định dạng một phân số thành chuỗi phần trăm. */
export function fmtPct(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const pct = v * 100
  const sign = signed && pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd dashboard && npx vitest run tests/forecast-format.spec.ts`
Expected: PASS (tất cả test xanh).

- [ ] **Step 5: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-format.ts dashboard/tests/forecast-format.spec.ts
git commit -m "feat(forecast): add shared pure format helpers + tests (ISSUE-016)"
```

---

## Task 4: ISSUE-016 — Cửa sổ kéo–thả + wiring

**Files:**
- Create: `dashboard/src/components/forecast/forecast-window.tsx`
- Modify: `dashboard/src/contexts/sidebar-context.tsx`
- Modify: `dashboard/src/components/layout/right-toolbar.tsx`
- Modify: `dashboard/src/components/layout/right-sidebar.tsx`
- Modify: `dashboard/src/pages/dashboard.tsx`
- Modify: `dashboard/src/pages/stock.tsx`
- Delete: `dashboard/src/components/forecast/forecast-panel.tsx`

- [ ] **Step 1: Tạo `forecast-window.tsx`**

```tsx
import { AnimatePresence, motion, useDragControls } from "framer-motion"
import { GripHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ForecastPage } from "./forecast-page"

/**
 * Cửa sổ nổi kéo–thả cho "Mô hình dự báo" — nhân khuôn của AI Insight
 * (xem dashboard/src/pages/stock.tsx). Nội dung là `ForecastPage`.
 */
export function ForecastWindow({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const dragControls = useDragControls()
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
            dragMomentum={false}
            dragElastic={0.05}
            className="absolute flex flex-col bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-xl overflow-hidden pointer-events-auto"
            style={{
              width: "min(1100px, calc(100vw - 16px))",
              height: "min(700px, calc(100vh - 24px))",
              top: "max(8px, calc(50vh - min(350px, 50vh - 12px)))",
              left: "max(8px, calc(50vw - min(550px, 50vw - 8px)))",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border cursor-move shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <GripHorizontal className="size-4" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground select-none">
                  Mô hình dự báo
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-sm hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 relative bg-background/50">
              <ForecastPage />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Mở rộng `sidebar-context.tsx` — thêm state cửa sổ, bỏ `"forecast"` khỏi `SidebarPanel`**

Sửa union type (dòng `export type SidebarPanel = ...`):

```ts
export type SidebarPanel = "news" | "trading" | "watchlist" | "patterns"
```

Thêm vào interface `SidebarContextType` (sau `setIsOpen`):

```ts
  forecastWindowOpen: boolean
  openForecastWindow: () => void
  closeForecastWindow: () => void
```

Thêm vào default `createContext` value:

```ts
  forecastWindowOpen: false,
  openForecastWindow: () => {},
  closeForecastWindow: () => {},
```

Trong `SidebarProvider`, thêm state và truyền vào value:

```ts
  const [forecastWindowOpen, setForecastWindowOpen] = useState(false)
```

```tsx
    <SidebarContext.Provider
      value={{
        activePanel,
        setActivePanel: handleSetActivePanel,
        togglePanel,
        isOpen,
        setIsOpen,
        forecastWindowOpen,
        openForecastWindow: () => setForecastWindowOpen(true),
        closeForecastWindow: () => setForecastWindowOpen(false),
      }}
    >
```

- [ ] **Step 3: Sửa `right-toolbar.tsx` — nút "Dự báo" mở cửa sổ**

Trong `RightToolbar`, đổi dòng destructure:

```ts
  const { activePanel, setActivePanel, forecastWindowOpen, openForecastWindow } = useSidebar()
```

Đổi mục forecast trong `ITEMS` (bỏ `panel: "forecast"`):

```ts
    { icon: TrendingUp, label: "Dự báo", id: "ai-forecast", onClick: () => openForecastWindow() },
```

Đổi prop `isActive` truyền cho `ToolbarButton` (để nút sáng khi cửa sổ mở):

```tsx
        <ToolbarButton
          key={item.id}
          item={item}
          isActive={item.id === "ai-forecast" ? forecastWindowOpen : item.panel === activePanel}
          onClick={() => handleClick(item)}
        />
```

- [ ] **Step 4: Sửa `right-sidebar.tsx` — bỏ panel forecast**

Xóa dòng import `ForecastPanel`:

```ts
import { ForecastPanel } from "@/components/forecast/forecast-panel"
```

Xóa nhánh `case "forecast"` trong `getPanelContent`:

```tsx
      case "forecast":
        return <ForecastPanel />
```

Xóa dòng `forecast: "Mô hình dự báo",` trong `panelNames`.

- [ ] **Step 5: Render `<ForecastWindow>` trong `dashboard.tsx`**

Thêm import:

```ts
import { useSidebar } from "@/contexts/sidebar-context"
import { ForecastWindow } from "@/components/forecast/forecast-window"
```

Trong component, thêm dòng lấy state (gần các hook khác):

```ts
  const { forecastWindowOpen, closeForecastWindow } = useSidebar()
```

Thêm `<ForecastWindow ... />` ngay sau `<NewsMarkPopover ... />` (vẫn trong `#dashboard-root`):

```tsx
          <ForecastWindow open={forecastWindowOpen} onClose={closeForecastWindow} />
```

- [ ] **Step 6: Render `<ForecastWindow>` trong `stock.tsx`**

Thêm import:

```ts
import { ForecastWindow } from "@/components/forecast/forecast-window"
```

Thêm vào dòng destructure `useSidebar` hiện có (nếu stock.tsx chưa gọi `useSidebar`, thêm `const { forecastWindowOpen, closeForecastWindow } = useSidebar()` cạnh các hook khác — kiểm tra import `useSidebar` đã có; nếu chưa, thêm `import { useSidebar } from "@/contexts/sidebar-context"`).

Thêm `<ForecastWindow ... />` ngay trước thẻ đóng `</AnimatePresence>`/sau khối cửa sổ AI Insight (trong cùng `div` gốc của trang):

```tsx
          <ForecastWindow open={forecastWindowOpen} onClose={closeForecastWindow} />
```

- [ ] **Step 7: Xóa sidebar forecast cũ**

```bash
cd /Users/danhtrongit/Projects/IQX
git rm dashboard/src/components/forecast/forecast-panel.tsx
```

- [ ] **Step 8: Build để xác nhận không lỗi type**

Run: `cd dashboard && npm run build`
Expected: PASS. (Nếu lỗi "forecast" không gán được cho `SidebarPanel` ở đâu đó → còn sót tham chiếu panel forecast; sửa cho hết.)

- [ ] **Step 9: Kiểm thử thủ công**

Chạy app (`cd dashboard && npm run dev`), mở dashboard:
- Bấm nút "Dự báo" ở right-toolbar → cửa sổ nổi mở giữa màn hình.
- Kéo cửa sổ bằng thanh tiêu đề; bấm `X` để đóng.
- Mở trang một cổ phiếu, lặp lại → cửa sổ cũng mở được.
- Không còn sidebar "Mô hình dự báo" cũ.

- [ ] **Step 10: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-window.tsx \
  dashboard/src/contexts/sidebar-context.tsx \
  dashboard/src/components/layout/right-toolbar.tsx \
  dashboard/src/components/layout/right-sidebar.tsx \
  dashboard/src/pages/dashboard.tsx dashboard/src/pages/stock.tsx
git commit -m "feat(forecast): Dự báo as draggable window, retire sidebar panel (ISSUE-016)"
```

---

## Task 5: ISSUE-017 — Nhãn chỉ số header thành "… hiện tại"

**Files:**
- Modify: `dashboard/src/components/forecast/forecast-stock-header.tsx`

- [ ] **Step 1: Đổi 4 nhãn trong khối "Metrics strip"**

Đổi lần lượt các `<Metric label=...>`:

```tsx
          <Metric label="Giá hiện tại" value={price > 0 ? price.toFixed(2) : "—"} />
          <Metric
            label="Tăng hiện tại"
            value={`${change > 0 ? "+" : ""}${change.toFixed(2)}`}
            valueClass={cc}
          />
          <Metric
            label="% thay đổi hiện tại"
            value={`${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
            valueClass={cc}
          />
          <Metric
            label="Khối lượng hiện tại"
            value={fmtVolume(volume)}
            sub={value > 0 ? fmtValueVnd(value) : undefined}
          />
```

- [ ] **Step 2: Cho nhãn dài xuống dòng gọn (tránh tràn grid 4 cột)**

Trong hàm `Metric`, bỏ `whitespace-nowrap` ở thẻ `<p>` nhãn:

```tsx
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">
        {label}
      </p>
```

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: PASS.

- [ ] **Step 4: Kiểm thử thủ công**

Mở cửa sổ Dự báo, chọn 1 mã → header hiển thị "Giá hiện tại / Tăng hiện tại / % thay đổi hiện tại / Khối lượng hiện tại", số liệu realtime đúng, không tràn trên màn nhỏ.

- [ ] **Step 5: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-stock-header.tsx
git commit -m "feat(forecast): header metrics labelled '... hiện tại' (ISSUE-017)"
```

---

## Task 6: ISSUE-018 — Lớp 3 chỉ "Mua ròng / Bán ròng"

**Files:**
- Modify: `dashboard/src/components/forecast/forecast-layer-cards.tsx`

- [ ] **Step 1: Import helper dùng chung**

Thêm vào đầu file:

```ts
import { netFlowLabel } from "./forecast-format"
```

- [ ] **Step 2: Thêm trường `transform` vào `LayerSpec` và gán cho layer `moneyFlow`**

Trong interface `LayerSpec`, thêm sau `rows`:

```ts
  /** Biến đổi giá trị thô trước khi hiển thị (vd rút gọn dòng tiền). */
  transform?: (value: string) => string
```

Trong mảng `LAYERS`, ở object `moneyFlow`, thêm dòng `transform`:

```ts
  {
    key: "moneyFlow",
    index: 3,
    title: "Dòng tiền",
    icon: ArrowLeftRight,
    color: "#10b981",
    iconBg: "bg-emerald-500/15",
    rows: ["Khối ngoại", "Tự doanh"],
    transform: netFlowLabel,
  },
```

- [ ] **Step 3: Áp `transform` khi dựng rows trong `LayerCard`**

Đổi đoạn dựng `rows`:

```tsx
  const rows = spec.rows
    .map((key) => {
      const raw = readString(output, key)
      return { label: key, value: spec.transform && raw ? spec.transform(raw) : raw }
    })
    .filter((r) => r.value)
```

- [ ] **Step 4: Build**

Run: `cd dashboard && npm run build`
Expected: PASS.

- [ ] **Step 5: Kiểm thử thủ công**

Lớp 3 (Dòng tiền): hàng "Khối ngoại" và "Tự doanh" chỉ còn hiển thị "Mua ròng" hoặc "Bán ròng" (màu xanh/đỏ tương ứng), không còn số/đoạn dài.

- [ ] **Step 6: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-layer-cards.tsx
git commit -m "feat(forecast): Lớp 3 shows only Mua ròng/Bán ròng (ISSUE-018)"
```

---

## Task 7: ISSUE-019 — Lớp 4 bỏ dòng "Nội bộ" dài

**Files:**
- Modify: `dashboard/src/components/forecast/forecast-layer-cards.tsx`

- [ ] **Step 1: Bỏ "Nội bộ" khỏi rows của layer `insider`**

Trong mảng `LAYERS`, object `insider`, đổi `rows`:

```ts
    rows: ["Mức cảnh báo"],
```

- [ ] **Step 2: Build**

Run: `cd dashboard && npm run build`
Expected: PASS.

- [ ] **Step 3: Kiểm thử thủ công**

Lớp 4 (Nội bộ): không còn dòng "Nội bộ" dài; chỉ còn "Mức cảnh báo".

- [ ] **Step 4: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-layer-cards.tsx
git commit -m "feat(forecast): Lớp 4 drops verbose Nội bộ row (ISSUE-019)"
```

---

## Task 8: ISSUE-020 — BCTC bỏ "x", làm nổi tiêu đề

**Files:**
- Modify: `dashboard/src/components/forecast/forecast-right-rail.tsx`

- [ ] **Step 1: Dùng `fmtRatioPlain` (bỏ hậu tố "x")**

Thêm import:

```ts
import { fmtRatioPlain } from "./forecast-format"
```

Xóa hàm `fmtRatio` cục bộ trong file. Đổi 3 lời gọi `fmtRatio(...)` thành `fmtRatioPlain(...)`:

```tsx
        <RatioCell label="P/E" value={fmtRatioPlain(ratio.pe)} />
        <RatioCell label="P/B" value={fmtRatioPlain(ratio.pb)} />
```

```tsx
        <RatioCell label="D/E" value={fmtRatioPlain(ratio.de)} />
```

(EPS, BVPS giữ `fmtVnd`; ROA, ROE giữ `fmtPctFraction`.)

- [ ] **Step 2: Làm nổi tiêu đề chỉ số trong `RatioCell`**

Đổi thẻ `<div>` nhãn trong `RatioCell`:

```tsx
      <div className="text-[11px] font-bold uppercase tracking-wider text-foreground">{label}</div>
```

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: PASS.

- [ ] **Step 4: Kiểm thử thủ công**

Khối "Chỉ số BCTC": P/E, P/B, D/E hiển thị số trơn (không còn "x"); tất cả tiêu đề (P/E, P/B, EPS, BVPS, ROA, ROE, D/E) đậm/nổi bật.

- [ ] **Step 5: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-right-rail.tsx
git commit -m "feat(forecast): BCTC drops 'x' suffix, emphasizes ratio titles (ISSUE-020)"
```

---

## Task 9: ISSUE-021 — Mobile hiển thị "Giá dự phóng / Lợi nhuận dự kiến"

**Files:**
- Modify: `dashboard/src/components/forecast/forecast-page.tsx`
- Modify: `dashboard/src/components/forecast/forecast-ranking-list.tsx` (dùng chung formatter — DRY)

- [ ] **Step 1: `forecast-ranking-list.tsx` dùng formatter chung (DRY)**

Thêm import:

```ts
import { fmtProjectedPrice, fmtPct } from "./forecast-format"
```

Xóa hai hàm cục bộ `fmtPct` và `fmtProjectedPrice` trong file (giữ nguyên các lời gọi `fmtPct(...)`, `fmtProjectedPrice(...)` — giờ trỏ tới bản import).

- [ ] **Step 2: `forecast-page.tsx` — đổi hàng chip mobile thành thẻ có 2 chỉ số**

Thêm import:

```ts
import { fmtProjectedPrice, fmtPct } from "./forecast-format"
```

Thay nguyên khối mobile (`<div className="lg:hidden ...">`) bằng:

```tsx
      {/* ── Mobile: thẻ mã kèm Giá dự phóng + Lợi nhuận dự kiến ── */}
      <div className="lg:hidden border-b border-border/30 bg-card/40 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
          {items.map((it) => {
            const active = it.symbol === selectedSymbol
            return (
              <button
                key={it.symbol}
                onClick={() => setSelectedSymbol(it.symbol)}
                className={`shrink-0 w-[150px] rounded-xl border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 bg-card/40 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${active ? "bg-primary" : "bg-emerald-400"}`}
                  />
                  <span className="text-sm font-extrabold text-foreground">{it.symbol}</span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[9px] text-muted-foreground">Giá dự phóng</p>
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {fmtProjectedPrice(it.projectedPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">Lợi nhuận</p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        it.expectedReturn >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {fmtPct(it.expectedReturn, true)}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
```

(Bỏ icon `Plus` nếu không còn dùng — xóa khỏi import `lucide-react` ở đầu file để tránh lỗi "unused".)

- [ ] **Step 3: Build**

Run: `cd dashboard && npm run build`
Expected: PASS (kiểm tra không còn import thừa `Plus`).

- [ ] **Step 4: Kiểm thử thủ công (thu hẹp xuống mobile)**

DevTools responsive < `lg`: hàng chọn mã trên cùng hiển thị thẻ có "Giá dự phóng" và "Lợi nhuận" cho từng mã; bấm thẻ cập nhật phần chi tiết bên dưới. (Nếu sheet `Du_Bao` chưa có giá → "Giá dự phóng" hiển thị "—".)

- [ ] **Step 5: Commit**

```bash
cd /Users/danhtrongit/Projects/IQX
git add dashboard/src/components/forecast/forecast-page.tsx dashboard/src/components/forecast/forecast-ranking-list.tsx
git commit -m "feat(forecast): mobile selector shows Giá dự phóng + Lợi nhuận (ISSUE-021)"
```

---

## Task 10: Nghiệm thu tổng + build sạch

- [ ] **Step 1: Build + unit test toàn bộ**

Run: `cd dashboard && npm run build && npx vitest run tests/forecast-format.spec.ts`
Expected: build PASS, test PASS.

- [ ] **Step 2: Checklist nghiệm thu thủ công (theo spec mục 7)**

- [ ] Nút "Dự báo" mở cửa sổ kéo–thả (dashboard + trang cổ phiếu); kéo/đóng OK; không còn `/du-bao`, không còn sidebar forecast.
- [ ] Header: 4 nhãn "… hiện tại".
- [ ] Lớp 3: chỉ "Mua ròng"/"Bán ròng".
- [ ] Lớp 4: không còn dòng "Nội bộ".
- [ ] BCTC: không "x", tiêu đề chỉ số đậm.
- [ ] Mobile: thấy "Giá dự phóng" + "Lợi nhuận".

- [ ] **Step 3: (Tùy chọn) Đẩy nhánh nếu người dùng yêu cầu**

> Không push nếu người dùng chưa yêu cầu. Toàn bộ commit nằm trên `main` local.

---

## Self-Review (đã thực hiện khi viết plan)

- **Spec coverage:** ISSUE-016 (Task 1,2,3,4) · 017 (Task 5) · 018 (Task 6) · 019 (Task 7) · 020 (Task 8) · 021 (Task 9). Port FE/BE + cửa sổ + dọn sidebar đều có task.
- **Placeholder scan:** không có TBD/TODO; mọi step sửa code đều kèm code thật.
- **Type consistency:** `forecast-format.ts` export `netFlowLabel`/`fmtRatioPlain`/`fmtProjectedPrice`/`fmtPct`; được import đúng tên ở Task 6/8/9. `SidebarPanel` bỏ `"forecast"` đồng bộ với việc gỡ panel ở right-sidebar/right-toolbar. `forecastWindowOpen`/`openForecastWindow`/`closeForecastWindow` đặt tên nhất quán giữa context, toolbar, dashboard, stock.
