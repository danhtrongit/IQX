# Thiết kế: Dự báo dạng cửa sổ (window) + 6 tinh chỉnh

- **Ngày:** 2026-06-02
- **Nhánh làm việc:** `main` (theo yêu cầu của người dùng)
- **Phạm vi issue:** ISSUE-016 → ISSUE-021

## 1. Bối cảnh

Tính năng "Dự báo" chi tiết (`/du-bao`) — gồm header cổ phiếu, 5 lớp dữ liệu,
chỉ số BCTC, AI mẫu hình, danh sách mã đề xuất với "Giá dự phóng / Lợi nhuận dự
kiến" — **hiện chỉ tồn tại trên nhánh `origin/feat/premium-trial-and-gating`**,
không có trên `main`. Trên `main` chỉ có một sidebar xếp hạng đơn giản
(`forecast-panel.tsx`).

Người dùng muốn làm việc **trên `main`**, nên việc đầu tiên là **port** lát cắt
forecast từ nhánh kia về `main`, rồi áp 6 thay đổi.

### Nhánh tham chiếu (nguồn để port)
`origin/feat/premium-trial-and-gating` (tip `b1ec8b5`), phân nhánh từ `main` tại
`8a36e34`.

## 2. Mục tiêu

1. Dự báo hiển thị ở dạng **cửa sổ nổi kéo–thả** (draggable window) giống AI
   Insight, mở từ nút "Dự báo" trên right-toolbar (thay vì là một trang riêng
   `/du-bao` hay một sidebar).
2. Đổi nhãn chỉ số ở header thành "… hiện tại".
3. Lớp 3 (Dòng tiền): Khối ngoại / Tự doanh chỉ hiển thị "Mua ròng" hoặc "Bán
   ròng".
4. Lớp 4 (Nội bộ): bỏ dòng "Nội bộ" dài dòng.
5. Chỉ số BCTC: bỏ chữ "x" sau số; làm nổi bật tất cả tiêu đề chỉ số.
6. Trên mobile: hiển thị "Giá dự phóng / Lợi nhuận dự kiến" (hiện đang bị ẩn).

## 3. Kiến trúc

### 3.1 Port lát cắt forecast về `main`

**Frontend — copy nguyên trạng từ nhánh tham chiếu, sau đó sửa:**
- `dashboard/src/components/forecast/forecast-page.tsx`
- `dashboard/src/components/forecast/forecast-stock-header.tsx`
- `dashboard/src/components/forecast/forecast-layer-cards.tsx`
- `dashboard/src/components/forecast/forecast-right-rail.tsx`
- `dashboard/src/components/forecast/forecast-patterns.tsx`
- `dashboard/src/components/forecast/forecast-ranking-list.tsx`
- `dashboard/src/hooks/use-forecast-ranking.ts`

Tất cả phụ thuộc đã có sẵn trên `main`: `usePrice`
(`@/contexts/market-data-context`), `useWatchlist` (`@/hooks/use-watchlist`),
`CandlePatternIllustration`/`ChartPatternIllustration`
(`@/components/patterns/pattern-illustration`), `AIAnalyzingOverlay`,
`StockLogo`, `ScrollArea`, `api`, framer-motion, lucide-react.

**KHÔNG port:** trang `dashboard/src/pages/du-bao.tsx` và bao bọc `PremiumGate`
— vì nội dung sẽ nằm trong cửa sổ, không phải trang riêng. (Có thể cân nhắc giữ
`PremiumGate` bao quanh nội dung cửa sổ ở bước sau nếu muốn khóa tính năng;
ngoài phạm vi bản này.)

**Backend — port phiên bản đọc sheet `Du_Bao`:**
- `backend/app/services/ai/forecast_service.py` (bản trên nhánh tham chiếu) để
  endpoint `GET /api/v1/ai/forecast/ranking` trả về `projectedPrice` +
  `expectedReturn` (theo sheet `Du_Bao`, `upProbability = null`).
- Bản trên `main` hiện đọc sheet khác (per-horizon, có `upProbability`, không có
  `projectedPrice`). UI mới dùng `projectedPrice`, nên bắt buộc phải có bản port
  này, nếu không "Giá dự phóng" luôn rỗng.
- **Giả định/Rủi ro:** sheet `Du_Bao` phải tồn tại trong Google Sheet
  `MODEL_AI`. Nếu chưa có, UI vẫn chạy nhưng "Giá dự phóng" hiển thị "—" cho tới
  khi sheet được thêm. Cần xác nhận với người dùng/đội backend.

### 3.2 Cửa sổ kéo–thả (DraggableWindow + ForecastWindow)

Tái sử dụng đúng khuôn cửa sổ AI Insight tại
`dashboard/src/pages/stock.tsx:154-205` (framer-motion `drag` + `dragControls`,
titlebar có `GripHorizontal` + nút `X`, kích thước
`min(1100px, calc(100vw - 16px)) × min(700px, calc(100vh - 24px))`, đặt giữa
màn hình).

- Tạo `dashboard/src/components/forecast/forecast-window.tsx`:
  - Bao `ForecastPage` trong khuôn cửa sổ ở trên.
  - Titlebar: "Mô hình dự báo".
  - Nhận prop `open` + `onClose`.
  - Trên mobile, kích thước `min(…, 100vw/100vh)` khiến cửa sổ gần như toàn màn
    hình (giống AI Insight) — phần layout mobile do `ForecastPage` xử lý.
- (Tùy chọn refactor: tách khuôn chung thành `DraggableWindow` dùng chung cho cả
  AI Insight. Bản này **không** đụng AI Insight để giữ phạm vi gọn — chỉ nhân
  bản khuôn cho ForecastWindow.)

### 3.3 Kích hoạt & nơi đặt cửa sổ (qua context)

- Mở rộng `dashboard/src/contexts/sidebar-context.tsx`: thêm
  `forecastWindowOpen: boolean`, `openForecastWindow()`, `closeForecastWindow()`.
- `dashboard/src/components/layout/right-toolbar.tsx`: nút "Dự báo"
  (`id: "ai-forecast"`) đổi từ `panel: "forecast"` sang `onClick:
  openForecastWindow`.
- Render `<ForecastWindow open={forecastWindowOpen} onClose={closeForecastWindow}/>`
  một lần trên mỗi trang có right-toolbar: `dashboard/src/pages/dashboard.tsx` và
  `dashboard/src/pages/stock.tsx`. Do router chỉ mount một trang tại một thời
  điểm nên không có hai cửa sổ cùng lúc.
- **Dọn dẹp:** gỡ panel "forecast" khỏi sidebar:
  - bỏ nhánh `activePanel === "forecast"` trong
    `dashboard/src/components/layout/right-sidebar.tsx`,
  - bỏ `"forecast"` khỏi union `SidebarPanel` trong `sidebar-context.tsx`,
  - xóa `dashboard/src/components/forecast/forecast-panel.tsx` (đã bị thay thế).

## 4. Sáu issue — thay đổi cụ thể

### ISSUE-016 (#1) — Dự báo dạng cửa sổ
Theo mục 3.2 + 3.3. Tiêu chí xong: bấm "Dự báo" mở cửa sổ kéo–thả chứa
`ForecastPage`; kéo bằng titlebar; đóng bằng `X`; không còn điều hướng `/du-bao`
và không còn sidebar forecast cũ.

### ISSUE-017 (#2) — Nhãn chỉ số ở header
File: `forecast-stock-header.tsx` (khối "Metrics strip").
- `Giá` → `Giá hiện tại`
- `Tăng` → `Tăng hiện tại`
- `% tăng/giảm` → `% thay đổi hiện tại`
- `Khối lượng` → `Khối lượng hiện tại`

Lưu ý layout: nhãn dài hơn; bỏ `whitespace-nowrap` ở `<Metric>` để nhãn xuống
dòng gọn, hoặc giảm cỡ chữ — tránh tràn ở grid 4 cột trên màn nhỏ.

### ISSUE-018 (#3) — Lớp 3 chỉ "Mua ròng / Bán ròng"
File: `forecast-layer-cards.tsx`, layer `moneyFlow` (rows `["Khối ngoại",
"Tự doanh"]`).
- Thêm helper rút gọn giá trị thô về đúng nhãn định tính: nếu chứa "mua" → "Mua
  ròng"; chứa "bán" → "Bán ròng"; còn lại → "Cân bằng"/"Trung lập" (tái dùng
  logic `cleanLayerSummaryValue` ở
  `dashboard/src/components/stock/stock-ai-insight-utils.ts:42-70`).
- Chỉ áp helper này cho layer `moneyFlow`; các layer khác giữ nguyên.

### ISSUE-019 (#4) — Lớp 4 bỏ dòng "Nội bộ" dài
File: `forecast-layer-cards.tsx`, layer `insider`.
- `rows: ["Nội bộ", "Mức cảnh báo"]` → `rows: ["Mức cảnh báo"]`.

### ISSUE-020 (#5) — BCTC: bỏ "x", làm nổi tiêu đề
File: `forecast-right-rail.tsx`.
- `fmtRatio(v, suffix = "x")`: bỏ hậu tố "x" (mặc định `suffix = ""`) → P/E,
  P/B, D/E hiển thị số trơn (vd `15.20` thay vì `15.20x`).
- `RatioCell`: tiêu đề (`P/E, P/B, EPS, BVPS, ROA, ROE, D/E`) đổi từ
  `text-muted-foreground` sang **đậm/nổi bật** (`font-bold text-foreground`, cỡ
  chữ to hơn một bậc). Áp cho cả hai hàng chỉ số.

### ISSUE-021 (#6) — Mobile hiển thị "Giá dự phóng / Lợi nhuận dự kiến"
File: `forecast-page.tsx` (khối mobile `lg:hidden`) + tái dùng formatter từ
`forecast-ranking-list.tsx`.
- Hiện mobile chỉ là hàng chip (mã + chấm màu), không có hai chỉ số.
- Đổi hàng chip thành **hàng thẻ cuộn ngang**, mỗi thẻ gồm: mã, "Giá dự phóng"
  (`fmtProjectedPrice`), "Lợi nhuận dự kiến" (`fmtPct(expectedReturn, true)` màu
  xanh/đỏ), trạng thái chọn. Bấm thẻ chọn mã → cập nhật phần chi tiết bên dưới.
- Tách `fmtProjectedPrice` và `fmtPct` ra dùng chung (đặt cạnh
  `use-forecast-ranking.ts` hoặc một util nhỏ) để không lặp code giữa
  `forecast-ranking-list.tsx` và `forecast-page.tsx`.

## 5. Luồng dữ liệu

- Xếp hạng: `GET /api/v1/ai/forecast/ranking?horizon=5&limit=30` → `useForecastRanking`
  → `items[{rank, symbol, expectedReturn, projectedPrice, upProbability}]`.
- Mỗi mã được chọn (`selectedSymbol`) nạp:
  - `GET /api/v1/ai/insight/{symbol}` → 5 lớp (`ForecastLayerCards`).
  - `GET /api/v1/market-data/fundamentals/{symbol}/ratio?period=Q` → BCTC
    (`ForecastRightRail`).
  - `GET /api/v1/market-data/company/{symbol}/overview` → tên/sàn
    (`ForecastStockHeader`).
  - `GET /api/v1/ai/patterns/{candles,charts}?symbol=` → mẫu hình
    (`ForecastPatterns`).
  - Giá realtime qua `usePrice` (`MarketDataProvider`).

**Provider:** `ForecastWindow` phải nằm trong `MarketDataProvider` (đã có ở
`dashboard.tsx`/`stock.tsx`) để `usePrice` hoạt động. Cần kiểm tra hai trang này
đã bọc `MarketDataProvider` quanh nơi render cửa sổ.

## 6. Xử lý lỗi

Giữ nguyên hành vi sẵn có trong các component đã port: mỗi component tự bắt lỗi
fetch và hiển thị trạng thái rỗng/lỗi (AlertTriangle + thông báo tiếng Việt).
Cửa sổ không sập khi một sub-API lỗi — từng khối độc lập.

## 7. Kiểm thử / Nghiệm thu

Chủ yếu kiểm thử thủ công bằng app thật (chưa có test UI cho khu vực này):
1. Bấm "Dự báo" trên dashboard và trang cổ phiếu → cửa sổ mở, kéo được, đóng
   được; không còn route `/du-bao`, không còn sidebar forecast cũ.
2. Header: 4 nhãn đã đổi thành "… hiện tại", số liệu realtime đúng.
3. Lớp 3: Khối ngoại/Tự doanh chỉ còn "Mua ròng"/"Bán ròng".
4. Lớp 4: không còn dòng "Nội bộ" dài; còn "Mức cảnh báo".
5. BCTC: không còn "x" sau số; tiêu đề chỉ số đậm/nổi bật.
6. Thu hẹp xuống mobile: thấy "Giá dự phóng" và "Lợi nhuận dự kiến" ở bộ chọn mã.
7. `projectedPrice`: nếu sheet `Du_Bao` có dữ liệu → hiển thị giá; nếu không →
   "—" (không vỡ layout).
8. Build sạch: `cd dashboard && npm run build` (hoặc lint) không lỗi TypeScript.

## 8. Ngoài phạm vi

- Refactor AI Insight để dùng chung `DraggableWindow` (chỉ nhân bản khuôn).
- Thêm sheet `Du_Bao` nếu chưa tồn tại (việc dữ liệu, không phải code).
- Khóa Premium cho cửa sổ Dự báo (`PremiumGate`).

## 9. Rủi ro & lưu ý

- **Phân kỳ với nhánh premium:** port lát cắt forecast lên `main` sẽ trùng/đụng
  với chính các file đó khi `feat/premium-trial-and-gating` merge sau này → khả
  năng xung đột merge. Đây là hệ quả đã được người dùng chấp nhận khi chọn `main`.
- **Backend `Du_Bao`:** phụ thuộc dữ liệu ngoài (Google Sheet).
- **Hai chỗ render cửa sổ** (dashboard + stock): chấp nhận lặp nhẹ; bù lại tránh
  thêm tầng layout chung.
