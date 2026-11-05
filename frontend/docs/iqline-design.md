# Thiết kế thư viện biểu đồ IQLine

Trạng thái: IQLine 1.0 đã làm xong Giai đoạn 1 đến 7, bật mặc định cả bốn nơi. Code TradingView và SVG cũ còn giữ để quay lại, chưa dọn. Còn các điểm chưa kiểm chứng ở §18 và các điểm cần xác nhận ở §16. Số đo Giai đoạn 0: [iqline-gd0-report.md](iqline-gd0-report.md).

Tên hiển thị là **IQLine**. Trong code dùng `iqline` cho thư mục và khoá lưu trữ, `IQLine` cho component và kiểu.

## 1. Mục tiêu và phạm vi

Xây thư viện biểu đồ nến riêng của IQX, theo đúng `frontend/DESIGN.md`. **IQLine 1.0 đã đầy đủ:** không có bản rút gọn cho người dùng và không có bước "đánh giá sau". Bản phát hành đầu tiên thay toàn bộ các nơi dưới đây rồi xoá `public/charting_library`.

| Nơi dùng | Hiện tại | IQLine 1.0 | Chế độ |
|---|---|---|---|
| Tab biểu đồ trong `/demo-trading` (`/bieu-do`, `/dashboard` chuyển hướng tới đây) | TradingView | Thay | `market` |
| `/co-phieu/:symbol` | TradingView | Thay | `market` |
| Flashback | SVG riêng | Thay | `flashback` |
| Học viện, loại `series_panels` (96 biểu đồ) | SVG riêng | Thay | `static` |

**Không thuộc phạm vi:**

- Biểu đồ Recharts (tài chính, backtest, quản trị, dải chỉ số). Đây là biểu đồ sản phẩm, không phải biểu đồ nến.
- Các loại biểu đồ Học viện khác (`category`, `gantt`, `flow`, `diagram`...).
- `mobile/` đang tạm ngừng. "Điện thoại" trong tài liệu này là web trên điện thoại.

## 2. Tính năng của IQLine 1.0

| Nhóm | Tính năng | Dùng ở |
|---|---|---|
| Kiểu hiển thị | Nến, nến rỗng, thanh OHLC, đường, vùng, Heikin Ashi | `market` |
| Khung thời gian | 1, 5, 15, 30, 60 phút, ngày, tuần, tháng; mã và khung nằm trên URL như hiện tại | `market` |
| Trục thời gian | Bỏ khoảng trống nghỉ trưa, cuối tuần và ngày nghỉ; múi giờ `Asia/Ho_Chi_Minh` | `market` |
| Trục giá | Tuyến tính, log, phần trăm; tự co giãn hoặc kéo tay | `market` |
| Dữ liệu | Nạp thêm lịch sử khi kéo về trái, cập nhật nến cuối theo realtime | `market` |
| Chỉ báo | 24 chỉ báo (§9), nhiều ô, kéo đổi chiều cao ô, hộp thoại thêm và sửa, ẩn, xoá | `market`, `flashback` (16) |
| Công cụ vẽ | 14 công cụ (§10), kéo tay nắm, khoá, ẩn, nhân bản, hút vào OHLC, danh sách hình, mẫu kiểu | `market`; Flashback 3 công cụ |
| Lưu trữ | Hình vẽ và chỉ báo theo từng mã, theo tài khoản, giữ cả dữ liệu đã lưu từ TradingView (§11) | `market` |
| Đánh dấu | Tin AI theo sắc thái, điểm đặt lệnh, mẫu hình AI vẽ đè | `market`, `flashback` |
| Đường tham chiếu | Giá tham chiếu, trần, sàn | `market` |
| Tiện ích | Hoàn tác, làm lại, chụp ảnh, toàn màn hình, về khung mặc định, phím tắt | `market` |
| Tương tác chung | Zoom, kéo, crosshair, chú giải nổi, giao diện sáng và tối, điện thoại | Mọi chế độ trừ `static` chỉ có crosshair |
| Flashback | Che tương lai, không ngày thật, không tên mã, khoá warmup (§12) | `flashback` |
| Học viện | Hình minh hoạ có vùng, mức, Fibonacci, chú thích tránh đè (§13) | `static` |

**Có chủ đích không làm**, xem xác nhận ở §16:

- Ngôn ngữ viết chỉ báo cho người dùng cuối. Chỉ báo mới được thêm bằng code qua `registerIndicator` (§9).
- Nhiều biểu đồ trên một màn hình, replay, cảnh báo đặt trên biểu đồ.
- So sánh mã, nhảy tới ngày, mẫu chỉ báo, lưu nhiều bố cục. `tradingview.ts` đang tắt các tính năng này, nên không phải là phần mất đi.

## 3. Hiện trạng trong code

| Nội dung | Hiện trạng | Hệ quả cho thiết kế |
|---|---|---|
| Vỏ TradingView | `tv-chart.tsx`, `tradingview.ts`, `datafeed.ts`, tổng khoảng 1.000 dòng | Thay bằng `<IQLine />` và adapter; các quy tắc vòng đời trong `tv-chart.tsx` phải giữ (§6) |
| Dữ liệu nến | `GET /market-data/quotes/{symbol}/ohlcv`, tham số `interval`, `start`, `end` theo ngày | Dùng lại, không đổi backend |
| Tìm mã | `SymbolPicker` và `searchSymbols` | Dùng lại `SymbolPicker` |
| Realtime | `DataPulse` thăm dò 15 giây. Backend có WebSocket với kênh `tick`, `orderbook`, `ohlc`, `index`, nhưng luồng DNSE trên production đã ngắt từ 2026-10-26 | Giữ thăm dò làm đường chính; chỉ bật `ohlc` khi đã kiểm chứng (§8) |
| Đánh dấu tin | `getMarks`, `NewsMarkPopover`, màu theo sắc thái | Giữ popover, thư viện chỉ vẽ điểm và báo sự kiện bấm |
| Hình vẽ đã lưu | `/chart-drawings/{symbol}` lưu nguyên JSON của `widget.save`, tối đa 512 KB; bản sao ở `iqx.tv_drawings_v2_*` | Bắt buộc có bộ chuyển đổi, nếu không người dùng mất hình vẽ (§11) |
| Biểu đồ Flashback | SVG, `flashback-chart.tsx` 1.029 dòng, trộn tính toán, vẽ và tương tác | Tách lớp là lợi ích lớn nhất ở phần này |
| Số nến Flashback | Tối đa 240 nến hiện, thêm warmup chỉ để tính | Chưa có zoom và kéo; là việc mới |
| Công thức chỉ báo | `flashback-indicators.ts` (frontend) và `quant/v2/indicators.ts` (backend) viết riêng | Cần test đối chiếu (§9) |
| Danh mục chỉ báo | `flashback.indicators.ts`: metadata và kiểm tra tham số, kèm `lesson_id` | Giữ nguyên, thư viện không sở hữu danh mục |
| Code thuần có sẵn | `flashback-chart-layout.ts`, `flashback-drawings.ts`, `series-panels-labels.ts` đều không chạm DOM | Chuyển sang thư viện; cần gỡ phụ thuộc vào `pages/` (§5) |
| Biểu đồ Học viện | 96 `series_panels` trong 29 bài, 40 biểu đồ có nến, có `candles`, `series`, `bars`, `band`, `fill_between`, `levels`, `zones`, `fib`, `notes`, `segments` | Thành chế độ `static` (§13) |

## 4. Quyết định chính

1. **Tự viết bằng TypeScript + Canvas 2D, React chỉ là lớp bọc.** Không nhúng thư viện biểu đồ bên thứ ba, nên IQLine không có yêu cầu ghi nguồn hay phụ thuộc phiên bản. Không dùng Rust/WASM và WebGL cho đến khi đo được nút thắt. Không đọc hoặc chuyển code từ bundle trong `public/charting_library`.
2. **Bên trong tính theo chỉ số nến, bên ngoài neo theo khoá ổn định.** Viewport và phép vẽ dùng chỉ số. Hình vẽ và đánh dấu neo theo `time` ở `market`, theo `session` ở `flashback`. Chỉ số một mình không đủ cho `market`, vì nạp thêm lịch sử sẽ đẩy chỉ số của mọi nến, và đổi khung thời gian sẽ đổi toàn bộ chỉ số.
3. **Chế độ `flashback` không có trường thời gian ở mức kiểu dữ liệu.** Nến Flashback không có `time`, nên không thể lộ ngày thật dù viết nhầm.
4. **Tách "dựng cảnh" khỏi "vẽ".** Hàm thuần sinh danh sách lệnh vẽ, một adapter mỏng đẩy lệnh ra Canvas. jsdom không có Canvas nên test kiểm tra danh sách lệnh.
5. **Chữ và điều khiển nằm ở DOM.** Chú giải, thanh công cụ, nút ẩn/cài đặt/xoá và hộp thoại là React với shadcn. Nến, đường, trục và hình vẽ nằm trên Canvas.
6. **Thư viện không gọi API và không biết luật game.** Dữ liệu đi vào qua `datafeed` và `store` (§6). Luật Flashback đi vào qua dữ liệu và tùy chọn.

## 5. Cấu trúc thư mục

Bắt đầu trong `frontend/src/lib/iqline/`. Thêm luật ESLint `no-restricted-imports` cấm import từ `pages/`, vì cấu hình hiện chưa có luật này. Tách package khi API đã ổn định.

```text
iqline/
  core/          viewport, thang giá, thang thời gian, bố cục ô, tick (thuần)
  scene/         dữ liệu + viewport -> danh sách lệnh vẽ (thuần)
  render/        adapter Canvas, bốn lớp canvas, DPR, đọc token màu
  interaction/   bộ giảm trạng thái cho zoom, kéo, crosshair, phím, hoàn tác
  indicators/    24 chỉ báo và registerIndicator (thuần)
  drawings/      14 công cụ, chọn hình, kéo tay nắm, chuyển đổi layout cũ (thuần)
  labels/        đặt nhãn tránh đè (chuyển từ series-panels-labels.ts)
  react/         <IQLine />, chú giải, thanh công cụ, hộp thoại
```

Hướng phụ thuộc: `react -> render, interaction -> scene -> core, indicators, drawings, labels`. Chỉ `render` và `react` được chạm DOM.

Adapter nằm ngoài thư viện, ở `pages/charts/chart/`: `iqline-datafeed.ts` và `iqline-store.ts`.

**Cần gỡ khi chuyển code:**

- `flashback-drawings.ts` import `formatNumber` từ `flashback-model`. Đổi thành tùy chọn `formatPrice`.
- Màu đang là chuỗi `var(--chart-6)` trong `IndicatorPlot`, `FIB_LEVELS` và `TREND_COLOR`. Đổi thành tên token.
- `MAX_INDICATORS` và kho chỉ báo ở `flashback-indicator-store.ts` vẫn thuộc về Flashback.

## 6. API

```ts
type Bar = { open: number; high: number; low: number; close: number; volume: number }
/** Unix giây. Adapter chịu trách nhiệm đổi đơn vị từ API. */
type TimedBar = Bar & { time: number }
type Interval = "1" | "5" | "15" | "30" | "60" | "D" | "W" | "M"

type Anchor = { time: number; price: number } | { session: number; price: number }

type IQLineDatafeed = {
  /** `to` loại trừ; `countBack` là số nến tối thiểu mong muốn. */
  getBars(q: { symbol: string; interval: Interval; to: number; countBack: number; signal: AbortSignal }):
    Promise<{ bars: TimedBar[]; noMoreHistory: boolean }>
  /** Nến mới hoặc nến cuối được cập nhật. Trả về hàm huỷ. */
  subscribeBars(symbol: string, interval: Interval, onBar: (bar: TimedBar) => void): () => void
  getMarks?(q: { symbol: string; from: number; to: number; signal: AbortSignal }): Promise<ChartMark[]>
}

type IQLineStore = {
  load(symbol: string): Promise<ChartDocument | null>
  save(symbol: string, doc: ChartDocument): void
}

type CommonProps = {
  theme: "light" | "dark"
  indicators: readonly ChartIndicatorInput[]
  onIndicatorsChange?: (next: readonly ChartIndicatorInput[]) => void
  labelToken?: "muted-foreground" | "academy-label"
  formatPrice?: (price: number) => string
  className?: string
}

type MarketProps = CommonProps & {
  mode: "market"
  symbol: string
  interval: Interval
  datafeed: IQLineDatafeed
  store?: IQLineStore
  priceLevels?: { reference?: number; ceiling?: number; floor?: number }
  overlays?: readonly AiOverlay[]
  onMarkClick?: (id: string | number) => void
}

type FlashbackProps = CommonProps & {
  mode: "flashback"
  /** Toàn bộ nến đã mở, gồm cả warmup. Không có trường time. */
  bars: readonly Bar[]
  warmup: number
  /** Tổng số ô trên trục; phần dư sau bars là tương lai. */
  totalSlots: number
  formatX: (session: number) => string
  markers?: readonly SessionMarker[]
  drawings: SessionDrawingController
  interaction?: { zoom?: boolean; pan?: boolean }
}

type StaticProps = Omit<CommonProps, "indicators" | "onIndicatorsChange"> & {
  mode: "static"
  panels: readonly StaticPanel[]
}

type IQLineProps = MarketProps | FlashbackProps | StaticProps

/** Lấy qua ref, cho thanh công cụ bên ngoài. */
type IQLineHandle = { fitContent(): void; screenshot(): Promise<Blob>; undo(): void; redo(): void }
```

**Quy tắc vòng đời, giữ từ `tv-chart.tsx`:**

- Hình vẽ theo từng mã: đổi mã phải nạp đúng hình của mã đó, không mang hình mã cũ sang. Khác với TradingView, IQLine đổi mã và khung mà không dựng lại component.
- Đổi hàm callback không dựng lại biểu đồ. Callback nằm trong ref.
- Đổi giao diện là thay đổi tại chỗ: giữ nguyên zoom, hình vẽ và công cụ đang chọn.
- `key={user?.id}` vẫn giữ ở trang, để đổi tài khoản không lộ hình vẽ của tài khoản trước.
- Lỗi lưu trữ không bao giờ làm hỏng biểu đồ.
- Hủy `getBars` đang chạy khi đổi mã hoặc khung, kết quả về muộn không được ghi đè.

## 7. Dựng hình

**Viewport.** Lưu `{ from, to }` theo chỉ số nến, có thể lẻ. `x(i)` và ngược lại là phép tính thuần. Nạp thêm lịch sử thì dịch viewport đúng số nến vừa thêm, để hình trên màn hình đứng yên.

**Thang thời gian.** Trục cách đều theo nến nên tự bỏ các khoảng không giao dịch. `time` đổi sang chỉ số bằng tìm nhị phân. Phần sau nến cuối được ngoại suy theo bước của khung và phiên giao dịch (`0900-1130,1300-1445` như hiện tại), bỏ cuối tuần. Ngày lễ chưa biết trước nên hình vẽ tương lai có thể lệch tới khi có nến thật; `time` đã lưu không đổi.

**Thang giá.** Giữ luật Flashback v2.3 §3: trục theo nến đang hiện, chừa 6% mỗi đầu, đường chỉ báo không kéo giãn trục, đường ngoài khung có nhãn ở mép phải (`priceRange`, `offscaleLabels`). Áp dụng cho cả `market`. Khi zoom hoặc kéo, thang tính lại theo nến trong viewport. Log và phần trăm là phép đổi toạ độ trong `core`, hình vẽ vẫn neo theo giá thật.

**Bốn lớp canvas chồng nhau:**

| Lớp | Nội dung | Vẽ lại khi |
|---|---|---|
| Nền | Lưới, trục, mặt nạ tương lai | Đổi viewport, kích thước, giao diện |
| Dữ liệu | Nến, khối lượng, chỉ báo, đánh dấu | Đổi dữ liệu hoặc viewport |
| Hình vẽ | Các hình đã vẽ | Đổi hình hoặc viewport |
| Trên cùng | Crosshair, bản xem trước, tay nắm | Mỗi lần di chuột |

Mọi thay đổi gom vào một `requestAnimationFrame`. Chỉ vẽ phần trong viewport. Khi mỗi nến hẹp dưới 1px, gộp nến theo cột pixel (cao nhất, thấp nhất) để giữ tốc độ. Canvas nhân theo `devicePixelRatio`, căn nến về pixel nguyên, dùng `ResizeObserver` để theo kích thước.

**Màu.** Canvas không hiểu `var(--x)`, nên `render` đọc token qua `getComputedStyle` rồi đổi sang `rgb()`, dùng lại cách `toRgbColor` đang có ở `tradingview.ts`. Dùng một `MutationObserver` chung theo dõi class giao diện trên `<html>`. Danh sách lệnh vẽ chỉ chứa tên token.

**Chữ trên Canvas.** Tải đủ các độ đậm cần dùng qua `document.fonts.load` rồi mới đo và vẽ, nếu không số đo rơi vào font dự phòng. Be Vietnam Pro không có chữ số đều và `tabular-nums` không có tác dụng, cả trong DOM (báo cáo Giai đoạn 0). IQLine tự căn từng chữ số theo bề rộng lớn nhất trên Canvas.

**Luật từ `DESIGN.md` phải giữ:**

- Nến và khối lượng chỉ dùng `price-up` và `price-down`. Đường tham chiếu dùng `price-ref`.
- Chỉ báo theo thứ tự `chart-1`, `chart-6`, `chart-8`, `chart-2`, `chart-5`. `chart-7` chỉ dành cho lớp AI.
- Biểu đồ đang có đường trần hoặc sàn thì `chart-6`, `chart-7`, `chart-8` không dùng cho chuỗi khác. Bảng màu tự đổi sang `chart-1`, `chart-2`, `chart-5` khi `priceLevels` có trần hoặc sàn, và có test.
- Fibonacci đang dùng `chart-3`, `chart-4` (cùng giá trị với màu tăng giảm) và `chart-7` (dành cho AI). Đổi sang các màu còn lại khi chuyển.
- Phẳng hoàn toàn (Zone B): không glow, không gradient trừ vùng mờ một màu.
- Lưới dùng `border`, chữ trục 11px, đủ cả hai giao diện.
- `labelToken` chọn màu chữ: Flashback và Học viện dùng `academy-label`, các nơi khác dùng `muted-foreground`.

**Tương tác.** Cách dùng con lăn phụ thuộc trang có cuộn hay không. Trang biểu đồ không cuộn, Flashback có thể dài hơn màn hình.

| Thao tác | `market` | `flashback` | Điện thoại |
|---|---|---|---|
| Zoom | Lăn chuột, phím `+` `-` | Ctrl + lăn chuột, phím `+` `-` | Chụm hai ngón |
| Kéo | Kéo chuột, phím mũi tên | Kéo chuột, phím mũi tên | Vuốt ngang một ngón |
| Co giãn trục | Kéo trên trục giá hoặc trục thời gian | Không | Không |
| Crosshair | Di chuột | Di chuột | Nhấn giữ rồi kéo |

Vuốt dọc phải để cho trang cuộn (`touch-action: pan-y`), trừ lúc đang ở công cụ vẽ (`touch-none`, như Flashback hiện tại). Bàn di chuột: chụm hai ngón là zoom, vuốt ngang là kéo.

**Tiếp cận.** Canvas có `role="img"` và `aria-label` mô tả nội dung. Chú giải O/H/L/C nằm trong DOM, đọc được bằng trình đọc màn hình. Phím mũi tên di chuyển crosshair theo từng nến khi biểu đồ có focus. Tôn trọng `prefers-reduced-motion`.

## 8. Dữ liệu `market`

- `iqline-datafeed.ts` chuyển logic từ `datafeed.ts`: đổi `interval`, kẹp thời gian, lọc nến lỗi, sắp xếp, gộp nhóm tin theo sắc thái.
- API nhận `start` và `end` theo ngày, không có `countBack` và không phân trang: một yêu cầu 1 phút có thể trả 3,5 MB trong 4 giây. Adapter đổi `countBack` sang khoảng ngày ngắn theo khung, không xin cả lịch sử, và lọc lại ở phía client.
- Không có API gốc cho `noMoreHistory`: trả về `true` khi khoảng đã chạm `MIN_TIMESTAMP` hoặc nhiều lần liền không có nến. Khung trong ngày chỉ về tới 5 năm trước.
- Dữ liệu 1 phút có các ngày rời rạc, nên trục cách đều phải có vạch ngăn khi nhảy ngày.
- Nến realtime: IQLine 1.0 thăm dò 15 giây như hiện tại. Kênh `ohlc` chỉ bật khi đã kiểm chứng trong giờ giao dịch, và khi đó adapter phải đổi giá về cùng đơn vị với REST (WebSocket nhân 1.000), tự gộp từ nến 1 phút cho các khung khác, và tiếp tục thăm dò cho chỉ số vì `ohlc` chỉ có cổ phiếu.
- Giá chỉ số và giá cổ phiếu có độ chính xác khác nhau (`pricescale` 100 và 1000 hiện tại), do `formatPrice` xử lý. Chữ số thập phân hiển thị đúng như TradingView đang hiện.

## 9. Chỉ báo

Chuyển nguyên `IndicatorPlot` và các hàm trong `flashback-indicators.ts`.

**16 chỉ báo trong danh mục (dùng ở `market` và `flashback`):**

| Nhóm | Chỉ báo | Bài học |
|---|---|---|
| Ô khối lượng | Volume (ngưỡng trung bình) | ch04-l04 |
| Trên ô giá | MA | ch04-l05 |
| Trên ô giá | Bollinger Bands | ch04-l08 |
| Trên ô giá | EMA | ch06-l01 |
| Trên ô giá | MA Cross | ch06-l02 |
| Trên ô giá | Donchian | ch06-l04 |
| Ô riêng | RSI | ch04-l06 |
| Ô riêng | MACD | ch04-l07 |
| Ô riêng | DMI | ch06-l03 |
| Ô riêng | Stochastic | ch07-l01 |
| Ô riêng | CCI | ch07-l02 |
| Ô riêng | ROC | ch07-l03 |
| Ô riêng | Williams %R | ch07-l04 |
| Ô riêng | OBV | ch07-l05 |
| Ô riêng | MFI | ch07-l06 |
| Ô riêng | Chaikin Money Flow | ch07-l07 |

**7 chỉ báo bổ sung (chỉ ở `market`):** ATR, ATR%, ADX, Keltner, BB Width, Parabolic SAR, Relative Volume. Đây là những chỉ báo đã bị bỏ khỏi luật Bot nhưng vẫn còn công thức trong `calcLegacy`, nên đối chiếu được và không cần dữ liệu ngoài bộ nến. Việc hiển thị trên biểu đồ không đưa chúng trở lại luật Bot. Các chỉ báo cần dữ liệu toàn thị trường (`rs_market`, `rs_sector`, `ad_line`, `breadth_ma50`, `new_high_low`, `index_ma`) không thuộc nhóm này.

**Volume Profile theo vùng nhìn thấy (chỉ ở `market`):** thêm vì layout đã lưu có 2 người dùng chỉ báo này, là chỉ báo duy nhất ngoài danh sách được từ 2 người trở lên dùng. Chia khối lượng từng nến đều theo biên độ giá của nến đó, nên chỉ là ước lượng. Vẽ thành cột ngang trên ô giá.

**Danh sách đã chốt theo số liệu Giai đoạn 0, tổng cộng 24 chỉ báo.** Ichimoku và Volatility O-H-L-C mỗi loại chỉ có 1 người dùng nên không thêm; hai chỉ báo này báo là không chuyển được (§11). Trong 7 chỉ báo bổ sung, chỉ BB Width có người dùng, nên các chỉ báo còn lại được cắt đầu tiên nếu thiếu thời gian.

**Mở rộng bằng code:**

```ts
registerIndicator({
  id: "atr",
  kind: "pane", // "over" | "vol" | "pane"
  params: [{ key: "period", min: 1, max: 200, default: 14 }],
  compute: (bars, params) => ({ series: [{ key: "atr", values: atr(bars, params.period), color: "chart-1" }] }),
})
```

**Cần sửa khi chuyển:**

- Volume đang dùng `slice` trong vòng lặp (`flashback-indicators.ts:361`). Đổi thành cửa sổ trượt, vì `market` có dữ liệu dài.
- Kết quả tính được ghi nhớ theo `(id, tham số, độ dài dữ liệu)`, nên zoom và kéo không tính lại.
- Cập nhật nến cuối chỉ tính lại phần đuôi nếu công thức cho phép; nếu không thì tính lại cả chuỗi.

**Đối chiếu số liệu.** Vì chưa có package dùng chung giữa frontend và backend, thêm một bộ dữ liệu mẫu JSON sinh từ `quant/v2/indicators.ts` rồi kiểm tra 23 chỉ báo ở frontend. Volume Profile không có công thức ở backend nên có test riêng. Bước này có thể phát hiện chỗ lệch đang có, và mỗi chỗ lệch phải được xử lý riêng vì Bot đang chạy theo công thức backend.

## 10. Công cụ vẽ

| Nhóm | Công cụ | Ghi chú |
|---|---|---|
| Đường | Xu hướng, tia, đường kéo dài | Xu hướng đã có |
| Đường | Ngang, tia ngang, dọc | Ngang dùng cho bài Hỗ trợ và kháng cự |
| Kênh | Kênh song song | |
| Fibonacci | Thoái lui, mở rộng | Thoái lui đã có |
| Hình | Chữ nhật | |
| Sóng | Elliott 5 sóng, Elliott ABC | Học viện dạy ở ch04-l10 |
| Chú thích | Ghi chú chữ, thước đo giá và thời gian | |

Tổng cộng 14 công cụ. Flashback dùng ba công cụ: xu hướng, Fibonacci thoái lui, đường ngang.

Mọi công cụ dùng chung một mô tả: danh sách điểm neo, cách vẽ, cách chọn.

Danh sách đã chốt. Layout đã lưu chỉ có 6 hình: 3 đường xu hướng, 1 thước đo giá, 1 hình chữ nhật, 1 Volume Profile cố định. Ba loại đầu đều có trong danh sách. Volume Profile cố định không có (§11).

## 11. Lưu trữ và chuyển dữ liệu từ TradingView

**Định dạng mới.** Dùng lại endpoint `/chart-drawings/{symbol}`, không cần migration backend vì `state` là JSON tự do:

```ts
type ChartDocument = {
  iqline: { version: 1; drawings: Drawing[]; indicators: ChartIndicatorInput[]; chartType: ChartType }
  /** Layout TradingView gốc, giữ tới khi dọn dẹp ở Giai đoạn 7. */
  charts?: unknown[]
}
```

Bản sao trên trình duyệt chuyển sang khoá `iqx.iqline_drawings_v1_*`. Giữ cơ chế hiện tại: API là nguồn chính, bộ nhớ trình duyệt là bản đệm, khách chỉ lưu trên máy.

**Chuyển đổi khi tải:**

1. Nếu có `iqline`, dùng luôn.
2. Nếu chỉ có `charts`, chạy `fromTradingViewLayout(state)`, một hàm thuần đọc hình vẽ và chỉ báo từ layout cũ.
3. Hình vẽ hoặc chỉ báo không chuyển được thì bỏ qua và báo một lần: "N hình vẽ không chuyển được sang IQLine".
4. Nếu máy chưa có dữ liệu server, đọc `iqx.tv_drawings_v2_*`.

**Quay lại an toàn.** Giữ nguyên `charts` để quay về TradingView không mất dữ liệu. Nếu tổng vượt 512 KB thì bỏ `charts` của mã đó. Hình vẽ mới tạo trong IQLine sẽ không hiện khi quay lại TradingView, và điều này được chấp nhận. Cần test TradingView nhận được `state` có thêm khoá `iqline`.

**Phạm vi chuyển đổi, đã xác minh trên production.** Cả 120 layout đều có `charts`; lớn nhất 40,8 KB, nên giữ `charts` không chạm giới hạn 512 KB ở hiện tại. Hình vẽ nằm ở `charts[].panes[].sources[]`, loại `LineTool*`, điểm neo gồm `time_t`, `offset`, `price`, `interval`. `time_t` đổi thẳng sang `time` của IQLine, phần `offset` đổi theo bước của `interval`.

| Loại trong layout | Chuyển thành |
|---|---|
| `LineToolTrendLine`, `LineToolPriceRange`, `LineToolRectangle` | Đường xu hướng, thước đo, hình chữ nhật |
| Volume, RSI, Moving Average, Bollinger Bands, BB Width, MACD, Donchian, Chaikin Money Flow, `VbPVisible` | Chỉ báo tương ứng ở §9 |
| `LineToolVbPFixed`, Ichimoku Cloud, Volatility O-H-L-C | Không chuyển, báo cho người dùng |

Số liệu này không gồm bản lưu trên trình duyệt của khách.

**Flashback** không dùng `store`: hình chỉ nằm ở trình duyệt, mất khi sang ván mới, đúng như spec v2.1 §7.

## 12. Chế độ Flashback

Các luật này là ràng buộc công bằng của game, phải có test:

- Thư viện chỉ nhận nến đã mở. Server vẫn là bên giữ dữ liệu tương lai, biểu đồ không bao giờ có nó trong bộ nhớ.
- Không có ngày thật và tên mã: `Bar` không có `time`, `formatX` trả "Phiên n" như `axisTicks` hiện tại.
- Nến warmup không vẽ và không kéo tới được, kể cả khi kéo hết về bên trái.
- Crosshair và chú giải không đọc được giá trị ở ô tương lai.
- Không có chụp ảnh, tìm mã, hay bất kỳ đường nào từ `market` sang.
- Giữ nguyên chiều cao ô v2.3 §2 (`chartLayout`), luật chú giải nổi và `MAX_INDICATORS = 12` (bên dùng kiểm tra).

**Zoom và kéo: bật, trong giới hạn nến đã mở.** Zoom diễn ra ở từng máy và không thêm thông tin vì phạm vi vẫn bị chặn bởi warmup và tương lai, nên không ảnh hưởng công bằng. Biểu đồ mở với đúng khung như hiện tại, nút và nhấp đúp để về khung mặc định. Có tùy chọn `interaction.zoom` để tắt nếu chơi thử cho thấy không hợp (§16).

## 13. Chế độ Học viện (`static`)

Mỗi `series_panels` chuyển sang `StaticPanel` qua một hàm thuần trong `pages/academy/charts/`. Thư viện vẽ theo số liệu tính sẵn, không chạy công thức chỉ báo.

| Phần | Cách làm |
|---|---|
| Dữ liệu | `candles`, `series`, `bars`, `band`, `fill_between`, `zero`, `bounds`, `ticks`, `digits` |
| Chú thích | `levels`, `zones`, `fib`, `segments`, `notes` |
| Nhãn | `series-panels-labels.ts` chuyển sang `labels/`. File này không phụ thuộc SVG, nên chuyển nguyên và đo chữ qua `measureText` |
| Tương tác | Chỉ crosshair và chú giải, không zoom, không kéo, không vẽ |
| Màu chữ | `academy-label`, không dùng `muted-foreground`; test quét mã nguồn hiện có phải áp dụng cho `static` |
| Bảng số liệu | "Xem bảng số liệu" giữ nguyên ở DOM |

Thêm nút "Thử trên biểu đồ" trong bài chỉ báo, mở `<IQLine mode="market" />` với đúng chỉ báo của bài đó.

## 14. Hiệu năng

Bản thử Giai đoạn 0 đã đạt các mục tiêu máy tính trên Chrome, chưa đo trên điện thoại thật (xem báo cáo):

| Chỉ số | Mục tiêu |
|---|---|
| 5.000 nến, 5 chỉ báo: một khung hình khi kéo, máy tính | Dưới 8 ms |
| Cùng dữ liệu trên điện thoại tầm trung | Dưới 16 ms |
| 50.000 nến 1 phút có gộp theo pixel: một khung hình, máy tính | Dưới 16 ms |
| Lõi vẽ, tải theo trang | Dưới 60 KB gzip |
| Công cụ vẽ và hộp thoại, tải khi cần | Dưới 60 KB gzip |
| Thời gian hiện biểu đồ `/bieu-do` | Không chậm hơn TradingView, mốc đo được là 1,3 đến 1,7 giây |

26 MB của `public/charting_library` là dung lượng trong repo. Người dùng thực tế tải 1.252 KB của thư viện qua 104 yêu cầu.

Điểm yếu đã biết là máy không có GPU: còn 12 đến 20 khung hình mỗi giây khi thu nhỏ toàn bộ. Giai đoạn 1 thử giới hạn DPR về 2 và bỏ tô vùng khi đang gộp nến.

Chỉ cân nhắc Web Worker hoặc WASM nếu không đạt các số này sau khi đã tối ưu.

## 15. Kiểm thử và lộ trình

| Lớp | Cách test |
|---|---|
| `core`, `indicators`, `drawings`, `interaction`, `labels` | Vitest; chuyển kèm test đang có |
| `scene` | So danh sách lệnh vẽ; test các luật ở §7 và §12 |
| `react` | Testing Library cho chú giải, thanh công cụ, hộp thoại |
| `render` | Playwright chụp ảnh so sánh, sáng và tối, máy tính và điện thoại |
| Chuyển dữ liệu | Bộ mẫu layout TradingView đã ẩn danh, gồm cả layout hỏng |
| `market` | Đổi mã, đổi khung, nạp lịch sử, mất kết nối, đổi tài khoản |
| Flashback | Test hiện có và `e2e/flashback-mobile.spec.ts` phải qua; test dựa vào DOM của SVG đổi sang kiểm tra scene |
| Học viện | `real-content.test.tsx`, test quét màu chữ, ảnh chụp đủ 96 biểu đồ |

Làm theo giai đoạn nhưng phát hành một lần. Trong lúc làm, mỗi nơi dùng được bật thử bằng `?iqline=1`, người dùng thường không thấy. Sau Giai đoạn 1, các Giai đoạn 2, 3 và 6 chạy song song được.

| GĐ | Việc | Xong khi |
|---|---|---|
| 0 | Bản thử Canvas trên dữ liệu thật; đo tải và hiệu năng TradingView; thống kê layout đã lưu; kiểm tra kênh `ohlc` và `tabular-nums`. Còn: đo kênh `ohlc` sau khi khôi phục luồng DNSE, đo điện thoại thật | Có số đo so với §14, chốt danh sách §9 và §10 |
| 1 | `core`, `scene`, `render`: mọi kiểu hiển thị, nhiều ô, hai loại trục, ba thang giá, giao diện | Ảnh chụp khớp Flashback hiện tại ở cả hai giao diện |
| 2 | 24 chỉ báo, `registerIndicator`, test đối chiếu backend | Khớp bộ mẫu, hoặc mọi chỗ lệch đã được quyết định |
| 3 | Tương tác, 14 công cụ vẽ, hoàn tác, lưu trữ, chuyển đổi layout cũ | Mở được bản sao ẩn danh của layout thật, chuyển đúng theo bảng ở §11 |
| 4 | Lắp vào `market`: datafeed, realtime, đánh dấu tin, lớp AI, trần sàn, thanh công cụ, điện thoại | Đủ mọi dòng `market` ở §2 |
| 5 | Lắp vào Flashback | Test qua, chơi thử đủ một ván nhiều người |
| 6 | Chế độ `static`, thay `series_panels`, nút "Thử trên biểu đồ" | Đủ 96 biểu đồ, duyệt ảnh chụp |
| 7 | Phát hành IQLine 1.0: bật cả bốn nơi, cờ `VITE_IQLINE_OFF` theo từng nơi để quay lại. Hết thời gian theo dõi thì dọn dẹp | Đạt §14, không có lỗi chặn |

**Dọn dẹp ở Giai đoạn 7:** xoá `public/charting_library`, `tv-chart.tsx`, `tradingview.ts`, `datafeed.ts` cũ, `flashback-chart.tsx`, `series-panels-chart.tsx`, khoá `charting_library` trong `eslint.config.js`, và khoá `charts` trong dữ liệu đã lưu. Cập nhật các chỗ nhắc TradingView trong `frontend/AGENTS.md` (dòng 15, 110) và `frontend/DESIGN.md` (dòng 121).

## 16. Cần xác nhận

Các điểm dưới đây đã có lựa chọn mặc định. Tài liệu đi theo mặc định trừ khi có quyết định khác.

1. **Flashback bật zoom và kéo** (§12). Đây là thay đổi so với hiện tại, và bản nháp trước đề xuất tắt.
2. **Học viện nằm trong IQLine 1.0** (§13). Đây là phần có thể tách ra nếu cần phát hành sớm hơn, vì TradingView không phụ thuộc vào nó.
3. **Danh sách không làm** ở §2, đặc biệt là ngôn ngữ viết chỉ báo cho người dùng.
4. **Những thứ người dùng mất khi chuyển.** Trên production, 1 trong 6 hình vẽ (Volume Profile cố định) và 2 chỉ báo mỗi loại 1 người dùng (Ichimoku, Volatility O-H-L-C) sẽ không chuyển được. TradingView cũng có nhiều công cụ vẽ hơn 14 công cụ ở §10.
5. **Tên IQLine.** Nên tra cứu nhãn hiệu tại Cục Sở hữu trí tuệ trước khi đưa tên ra ngoài. Không ảnh hưởng việc code.

## 17. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Phạm vi lớn, người dùng chưa thấy gì tới khi phát hành | Thứ tự giai đoạn cho phép bật thử sớm với `?iqline=1`; Học viện là phần tách được đầu tiên (§16) |
| Mất hình vẽ đã lưu của người dùng | Thống kê từ GĐ 0, giữ `charts` gốc, báo rõ phần không chuyển được |
| Lộ thông tin trong Flashback do warmup, crosshair hoặc zoom | `Bar` không có `time`, test bắt buộc ở `scene` theo §12 |
| Số chỉ báo lệch với Bot | Test đối chiếu backend ở Giai đoạn 2 |
| Người dùng quen TradingView thấy thiếu tính năng | Danh sách §2 chốt theo số liệu sử dụng, không theo phỏng đoán |
| Hình vẽ lệch khi đổi khung hoặc nạp thêm lịch sử | Neo theo `time`, test riêng cho từng trường hợp |
| Realtime sai nến cuối hoặc hở dữ liệu khi mất kết nối | Thăm dò dự phòng, nạp lại nến cuối sau khi kết nối lại |
| Canvas khó kiểm thử hơn SVG | Tách `scene`, thêm ảnh chụp Playwright |
| Xung đột cử chỉ với cuộn trang trên điện thoại | `touch-action: pan-y`, nhấn giữ để bật crosshair, thử trên máy thật |

## 18. Trạng thái phát hành 1.0

**Công tắc** nằm ở một chỗ, `pages/charts/chart/iqline-flag.ts`: mặc định bật; `VITE_IQLINE_OFF=market,flashback,static` lúc build để tắt theo nơi; `?iqline=0` để xem bản cũ trong một lượt, `?iqline=1` luôn bật. Vitest chạy với cờ tắt vì jsdom không có Canvas; test IQLine tự bật, đường mặc định được kiểm ở `iqline-flag.test.ts` và e2e.

**Đã kiểm chứng:** test thuần và Testing Library, e2e trên Canvas thật với API giả lập, chạy thử `/bieu-do` và `/co-phieu` với dữ liệu thật của iqx.vn qua proxy (cổ phiếu, chỉ số, 5 phút, RSI, điện thoại), so toạ độ 96 biểu đồ Học viện với bản SVG. Đo trên Canvas và ảnh chụp đều có ở Chromium.

**Chưa kiểm chứng trước khi phát hành:**

- Ván Flashback nhiều người trên backend thật, và trang Học viện thật đã đăng nhập.
- Điện thoại thật: chụm hai ngón, nhấn giữ, hiệu năng theo mục tiêu §14. Mới có giả lập cảm ứng của Playwright.
- Safari và Firefox.
- `fromTradingViewLayout` trên layout `widget.save` thật. Mới dùng mẫu tự viết theo cấu trúc đã thống kê ở Giai đoạn 0.
- TradingView thật có nhận `state` có thêm khoá `iqline` khi quay lại hay không.
- Dữ liệu cho `AiOverlay`: mới có lớp vẽ, chưa có nguồn.

**Chỗ lệch công thức với backend** (ghi trong `KNOWN_DIVERGENCES`, giữ nguyên số của Flashback cũ, chưa quyết): MACD và Stochastic đổi `null` đầu chuỗi thành 0 trước khi làm mượt, nên lệch ở đoạn đầu; CMF cho `null` cả cửa sổ nếu có phiên high bằng low, nên trống nhiều với mã hay kịch trần, kịch sàn. Bot chạy theo backend.

**Dọn dẹp** (§15) làm sau thời gian theo dõi, chưa làm.
