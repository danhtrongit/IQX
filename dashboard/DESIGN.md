# IQX Design System — Financial Dashboard

## 1. Visual Theme & Atmosphere

IQX là một nền tảng phân tích và giao dịch chứng khoán Việt Nam, thiết kế theo triết lý **"Bloomberg meets Modern Web"** — mật độ thông tin cao, giao diện tối chuyên nghiệp, với mọi pixel phục vụ cho việc ra quyết định đầu tư. Đây không phải minimalism trang trí; đây là minimalism chức năng — mỗi element tồn tại vì nó giúp trader đọc thị trường nhanh hơn.

Giao diện chủ đạo là **Dark Mode** với tông Deep Navy (không phải pure black), tạo cảm giác chuyên nghiệp mà không gây mỏi mắt trong những phiên giao dịch dài. Light Mode được hỗ trợ đầy đủ nhưng Dark Mode là trải nghiệm chính.

Typography sử dụng **Tahoma** — một typeface sans-serif tối ưu cho khả năng đọc ở cỡ nhỏ, đặc biệt quan trọng khi dashboard hiển thị hàng trăm con số giá, khối lượng đồng thời. Font được load locally (woff2) để đảm bảo tốc độ render.

Hệ màu tài chính tuân theo chuẩn quốc tế: **Emerald (xanh lá)** cho tăng giá, **Red (đỏ)** cho giảm giá, **Amber (vàng)** cho giá tham chiếu, **Fuchsia (tím)** cho giá trần, **Cyan (xanh dương nhạt)** cho giá sàn. Các màu này là ngôn ngữ thị giác cốt lõi — trader nhận biết xu hướng trong < 100ms nhờ color coding nhất quán.

**Key Characteristics:**
- Dark-first design với tông Deep Navy (`oklch(0.145 0.015 234.82)`) — không phải pure black
- Font Tahoma tối ưu cho data-dense interfaces, kích thước chủ đạo 10px–14px
- Multi-panel layout: Header (44px) + Market Bar (32px) + Main Content + Footer (24px)
- Financial color system: 5 màu ngữ nghĩa cho trạng thái giá chứng khoán
- `tabular-nums` trên toàn bộ số liệu — đảm bảo alignment hoàn hảo trong bảng giá
- Glassmorphism cho overlays (`backdrop-blur-xl`)
- Real-time data với Socket.IO, animation tối thiểu để không cản trở việc đọc dữ liệu
- OKLCH color space cho kiểm soát màu chính xác giữa Light/Dark mode

## 2. Color Palette & Roles

### Color Space
IQX sử dụng **OKLCH** color space — cung cấp perceptual uniformity (các màu cùng lightness trông thực sự sáng như nhau). Tất cả theme tokens được định nghĩa bằng OKLCH. Hue angle chủ đạo là **234.82** (Blue-Navy).

### Semantic Tokens

| Token | Light Mode | Dark Mode | Mô tả |
|-------|-----------|-----------|-------|
| **background** | `oklch(0.995 0.002 234.82)` | `oklch(0.145 0.015 234.82)` | Nền chính — off-white / deep navy |
| **foreground** | `oklch(0.15 0.015 234.82)` | `oklch(0.985 0.005 234.82)` | Text chính |
| **card** | `oklch(1 0 0)` | `oklch(0.20 0.02 234.82)` | Nền card, popover — white / lighter navy |
| **card-foreground** | `oklch(0.15 0.015 234.82)` | `oklch(0.985 0.005 234.82)` | Text trên card |
| **primary** | `oklch(0.69 0.15 234.82)` | `oklch(0.69 0.15 234.82)` | Accent chính — Bright Blue (đồng nhất cả 2 mode) |
| **primary-foreground** | `oklch(0.99 0 0)` | `oklch(0.99 0 0)` | Text trên primary |
| **secondary** | `oklch(0.955 0.02 234.82)` | `oklch(0.27 0.025 234.82)` | Nền secondary — tinted gray |
| **secondary-foreground** | `oklch(0.28 0.06 234.82)` | `oklch(0.96 0.005 234.82)` | Text trên secondary |
| **muted** | `oklch(0.96 0.012 234.82)` | `oklch(0.27 0.025 234.82)` | Nền muted, backgrounds nhạt |
| **muted-foreground** | `oklch(0.50 0.04 234.82)` | `oklch(0.68 0.04 234.82)` | Text phụ, placeholder |
| **accent** | `oklch(0.955 0.02 234.82)` | `oklch(0.27 0.025 234.82)` | Nền hover, accent areas |
| **destructive** | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Đỏ cho lỗi, xóa, cảnh báo |
| **border** | `oklch(0.91 0.015 234.82)` | `oklch(0.34 0.03 234.82)` | Viền elements |
| **input** | `oklch(0.91 0.015 234.82)` | `oklch(0.34 0.03 234.82)` | Viền input fields |
| **ring** | `oklch(0.69 0.15 234.82)` | `oklch(0.55 0.12 234.82)` | Focus ring |

### Chart Colors

| Token | Light Mode | Dark Mode | Dùng cho |
|-------|-----------|-----------|----------|
| **chart-1** | `oklch(0.69 0.15 234.82)` | `oklch(0.72 0.15 234.82)` | Primary series (Blue) |
| **chart-2** | `oklch(0.72 0.14 195)` | `oklch(0.75 0.14 195)` | Secondary series (Teal) |
| **chart-3** | `oklch(0.62 0.15 275)` | `oklch(0.68 0.15 275)` | Tertiary series (Purple) |
| **chart-4** | `oklch(0.74 0.17 155)` | `oklch(0.76 0.17 155)` | Quaternary series (Green) |
| **chart-5** | `oklch(0.65 0.18 350)` | `oklch(0.71 0.18 350)` | Quinary series (Pink) |

### Sidebar Tokens

| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| **sidebar** | `oklch(0.98 0.008 234.82)` | `oklch(0.17 0.02 234.82)` |
| **sidebar-foreground** | `oklch(0.15 0.015 234.82)` | `oklch(0.985 0.005 234.82)` |
| **sidebar-primary** | `oklch(0.69 0.15 234.82)` | `oklch(0.69 0.15 234.82)` |
| **sidebar-accent** | `oklch(0.955 0.02 234.82)` | `oklch(0.27 0.025 234.82)` |
| **sidebar-border** | `oklch(0.91 0.015 234.82)` | `oklch(0.34 0.03 234.82)` |

### Financial Market Colors (Utility Classes)

| Trạng thái | Text Color | Background | Ý nghĩa |
|-----------|------------|------------|----------|
| **Tăng (Bullish)** | `text-emerald-500` | `bg-emerald-500/15` | Giá tăng so với tham chiếu |
| **Giảm (Bearish)** | `text-red-500` | `bg-red-500/15` | Giá giảm so với tham chiếu |
| **Tham chiếu (Reference)** | `text-amber-500` | `bg-amber-500/15` | Giá không đổi |
| **Trần (Ceiling)** | `text-fuchsia-500` | `bg-fuchsia-500/15` | Giá đạt biên trần |
| **Sàn (Floor)** | `text-cyan-500` | `bg-cyan-500/15` | Giá đạt biên sàn |

### TradingView Chart Colors (Dark Mode)

| Element | Color | Mô tả |
|---------|-------|-------|
| **Background** | `#0a0a0f` | Nền chart — darker than dashboard bg |
| **Grid** | `#1a1a2e` | Đường grid — subtle navy |
| **Candle Up** | `#00c853` | Nến tăng — Green A700 |
| **Candle Down** | `#ff1744` | Nến giảm — Red A400 |

### Premium / Branding Gradients

| Dùng cho | Gradient |
|----------|----------|
| **Premium Badge** | `bg-gradient-to-r from-amber-500 to-orange-500` |
| **Auth Modal Header** | `bg-gradient-to-r from-primary via-primary/60 to-primary/20` |
| **Marketing Glow** | `radial-gradient` với primary color |

## 3. Typography Rules

### Font Family
- **Primary**: `Tahoma` — loaded locally (woff2), weights 400 (Regular) và 700 (Bold)
- **Fallback**: `sans-serif`
- **CSS Variable**: `--font-sans: 'Tahoma', sans-serif`
- **Heading Font**: `--font-heading: var(--font-sans)` — cùng Tahoma, không dùng font riêng cho heading

### Hierarchy

| Role | Size | Weight | Tailwind Class | Ghi chú |
|------|------|--------|----------------|---------|
| **Metadata / Labels** | 10px | 400 | `text-[10px]` | Nhãn phụ, exchange name, timestamps, footer |
| **Primary UI Text** | 12px (0.75rem) | 400–700 | `text-xs` | Navigation items, buttons, input text, data cells |
| **Content Text** | 14px (0.875rem) | 400–600 | `text-sm` | Headings, main content, section titles |
| **Large Content** | 16px (1rem) | 400–700 | `text-base` | Page titles, emphasis (dùng hạn chế) |
| **Display** | 18–24px | 700 | `text-lg` / `text-xl` | Marketing pages, hero sections (chỉ trang Home) |

### Principles
- **Data density over readability luxury**: IQX ưu tiên hiển thị nhiều dữ liệu trên cùng viewport. `text-[10px]` là kích thước chấp nhận cho metadata; `text-xs` (12px) là kích thước chủ đạo cho UI text.
- **`tabular-nums` everywhere**: Mọi giá trị số (giá, khối lượng, %, P/L) dùng `tabular-nums` để đảm bảo alignment theo cột. Đây là yêu cầu bắt buộc, không phải tùy chọn.
- **Weight restraint**: Scale trọng lượng chỉ từ 400 (regular) đến 700 (bold). Không dùng light (300) hay black (800+). Bold dùng cho emphasis, không dùng tràn lan.
- **No decorative typography**: Không negative letter-spacing, không tight line-height cho headlines. Typography phục vụ function, không phải aesthetics.

## 4. Component Stylings

### Buttons (CVA-based)

**Variants:**

| Variant | Background | Text | Border | Dùng cho |
|---------|-----------|------|--------|----------|
| **default** | `bg-primary` | `text-primary-foreground` | none | CTA chính: Mua, Bán, Xác nhận |
| **secondary** | `bg-secondary` | `text-secondary-foreground` | none | Action phụ |
| **outline** | transparent | `text-foreground` | `border-input` | Bộ lọc, toggle options |
| **ghost** | transparent | `text-foreground` | none | Toolbar icons, nav items |
| **destructive** | `bg-destructive` | `text-white` | none | Xóa, hủy lệnh |
| **link** | transparent | `text-primary underline` | none | Inline links |

**Sizes:**

| Size | Height | Padding | Font Size | Dùng cho |
|------|--------|---------|-----------|----------|
| **xs** | `h-6` (24px) | `px-2` | `text-xs` | Compact controls, order book buttons |
| **sm** | `h-7` (28px) | `px-2.5` | `text-[0.8rem]` | Sidebar actions, filters |
| **default** | `h-8` (32px) | `px-3` | `text-sm` | Standard buttons |
| **lg** | `h-9` (36px) | `px-4` | `text-sm` | Hero CTAs, forms |

**States:**
- Hover: `opacity-90` hoặc variant-specific lightening
- Disabled: `opacity-50 pointer-events-none`
- Focus: `ring-ring/50 ring-offset-2`
- Border Radius: `rounded-lg` (inherits `--radius: 0.625rem` = 10px)

### Tabs

**Default Variant (Pills):**
- TabsList: `bg-muted text-muted-foreground rounded-lg p-0.5`
- Active Tab: `bg-background text-foreground shadow-sm`

**Line Variant:**
- TabsList: transparent, `border-b`
- Active Tab: `text-foreground` với animated `after:` underline (`bg-primary h-0.5`)
- Used for: Section navigation (Tổng quan / Kỹ thuật / Tài chính...)

### Badges

- Height: `h-5` (20px)
- Radius: `rounded-4xl` (= `--radius * 2.6` ≈ 26px) — highly rounded
- Font: `text-xs font-medium`
- Variants: `default` (primary bg), `secondary`, `outline`, `destructive`
- Financial badges use market colors: `bg-emerald-500/15 text-emerald-500` cho +%, `bg-red-500/15 text-red-500` cho -%

### Inputs

- Height: `h-8` (32px)
- Radius: `rounded-lg`
- Border: `border-input` (1px)
- Background: `bg-transparent`
- Padding: `px-2.5`
- Font: `text-sm` (responsive, trên mobile có thể text-base để tránh zoom)
- Placeholder: `text-muted-foreground`
- Focus: `ring-ring/50 border-ring` — subtle ring effect

### Cards & Containers

- Background: `bg-card` (white light / lighter navy dark)
- Foreground: `text-card-foreground`
- Border: `border-border` (thường subtle)
- Radius: `rounded-lg` (10px)
- Shadow: minimal — IQX dựa vào background contrast thay vì shadow để tạo depth
- Hover: `hover:bg-muted/10` cho interactive cards

### Dialogs & Modals

- Overlay: `bg-black/80` — dark overlay
- Content: `bg-card border-border rounded-lg`
- Glassmorphism variant: `bg-card/95 backdrop-blur-xl` cho news popovers
- Animation: scale + fade in via shadcn defaults

## 5. Layout Principles

### Application Shell

```
┌─────────────────────────────────────────────────────────┐
│ Header (h-11 = 44px)                                    │
│ Logo | Navigation | Search(⌘K) | Icons | Profile       │
├─────────────────────────────────────────────────────────┤
│ Market Bar (h-8 = 32px)                                 │
│ Symbol Info | Price | Change | ← Scrolling Ticker →     │
├────┬───────────────────────────────────┬────────────────┤
│ L  │                                   │ Right Panel    │
│ e  │     Main Content Area             │ (320-360px)    │
│ f  │     (TradingView Chart /          │                │
│ t  │      Market Overview /            │ • Trading      │
│    │      Stock Analysis)              │ • Watchlist    │
│ S  │                                   │ • News         │
│ b  │                                   │ • Chat         │
│ 40 │                                   │                │
│ px │                                   │                │
├────┴───────────────────────────────────┴────────────────┤
│ Footer (h-6 = 24px)                                     │
│ Connection Status | Version | Clock (tabular-nums)      │
└─────────────────────────────────────────────────────────┘
```

### Panel Dimensions

| Panel | Width / Height | Responsive |
|-------|---------------|------------|
| **Header** | `h-11` (44px) | Fixed, sticky top |
| **Market Bar** | `h-8` (32px) | Fixed, below header |
| **Left Sidebar** | `w-10` (40px) | Drawing tools, chart-only pages |
| **Right Panel** | `md:w-[320px]` / `lg:w-[360px]` | Slide-up on mobile |
| **Footer** | `h-6` (24px) | Fixed bottom |

### Spacing System
- Base unit: **4px** (Tailwind default)
- Common spacings: `p-0.5` (2px), `p-1` (4px), `p-1.5` (6px), `p-2` (8px), `p-2.5` (10px), `p-3` (12px), `p-4` (16px)
- **Compact by default**: IQX sử dụng spacing nhỏ hơn so với web app thông thường để tăng data density. `gap-1` (4px) và `gap-2` (8px) là phổ biến nhất.

### Border Radius Scale

| Token | Value | Tính từ `--radius: 0.625rem` | Dùng cho |
|-------|-------|------------------------------|----------|
| **radius-sm** | 6px | `--radius * 0.6` | Small tags, inline badges |
| **radius-md** | 8px | `--radius * 0.8` | Buttons size xs/sm |
| **radius-lg** | 10px | `--radius` (base) | Buttons, inputs, cards |
| **radius-xl** | 14px | `--radius * 1.4` | Large cards, panels |
| **radius-2xl** | 18px | `--radius * 1.8` | Modals |
| **radius-3xl** | 22px | `--radius * 2.2` | Special containers |
| **radius-4xl** | 26px | `--radius * 2.6` | Badges (pill-like) |

### Grid & Container
- **Không có max-width cố định** cho dashboard — sử dụng toàn bộ viewport width
- Marketing/Home pages: centered content với container
- Dashboard: flexible panels chia viewport theo tỷ lệ
- Stock detail pages: nested routes trong `/thi-truong` với sub-navigation

## 6. Depth & Elevation

| Level | Treatment | Dùng cho |
|-------|-----------|----------|
| **Flat (Level 0)** | Solid `bg-background` | Nền chính, content areas |
| **Card (Level 1)** | `bg-card` — slightly lighter/darker than background | Cards, panels, popovers |
| **Sidebar (Level 1)** | `bg-card` solid | Left sidebar, right panel |
| **Glassmorphism** | `bg-card/95 backdrop-blur-xl` | News popovers, floating panels |
| **Overlay** | `bg-black/80` | Modal backdrops |
| **Market Bar** | `bg-card/50` — semi-transparent | Market ticker bar |
| **Focus Ring** | `ring-ring/50 ring-offset-2` | Keyboard focus indicator |

**Shadow Philosophy**: IQX hầu như **không dùng box-shadow**. Depth được tạo bằng sự khác biệt giữa `background` và `card` colors — một cách tiếp cận flat, high-contrast phù hợp với dark themes. Chỉ có `shadow-sm` nhẹ trên active tab indicators.

## 7. Financial UI Patterns

### Order Book Visualization
- **Sell side**: `bg-red-500/8` overlay bars, width tỷ lệ thuận với volume
- **Buy side**: `bg-emerald-500/8` overlay bars, width tỷ lệ thuận với volume
- Bars dùng absolute positioning overlay trên nền row
- Text: `tabular-nums text-[10px]` cho price levels

### Price Display Convention
```
Giá tăng:   text-emerald-500 tabular-nums font-medium
Giá giảm:   text-red-500 tabular-nums font-medium
Tham chiếu: text-amber-500 tabular-nums
Trần:       text-fuchsia-500 tabular-nums font-bold
Sàn:        text-cyan-500 tabular-nums font-bold
```

### 52-Week Range Bar
- Track: `h-1 bg-muted rounded-full`
- Thumb: `size-2.5 rounded-full bg-primary` — chỉ vị trí giá hiện tại
- Labels: `text-[10px] text-muted-foreground` ở hai đầu

### Market Ticker (Auto-scrolling)
- Container: `h-8 overflow-hidden`
- Animation: CSS `@keyframes market-ticker` — continuous horizontal scroll
- Items: index name + value + change% với market colors
- Font: `text-[10px] tabular-nums`

### Stock Search (⌘K)
- Trigger: `w-32` → expands to `w-48` on focus
- Input: `text-xs bg-muted/50`
- Results dropdown: `bg-card border-border rounded-lg shadow-lg`
- Result items: Symbol (bold) + Company name (muted) + Exchange (`text-[10px]`)

## 8. Animation & Motion

### Custom Keyframes

| Animation | Duration | Easing | Dùng cho |
|-----------|----------|--------|----------|
| **fade-in-up** | 0.8s | ease-out | Page sections, lazy-loaded content |
| **slide-in-left** | 0.8s | ease-out | Left-entering panels |
| **slide-in-right** | 0.8s | ease-out | Right-entering panels |
| **pulse-glow** | repeating | ease | Status indicators, live data dots |

### Staggered Delays
- `animation-delay-200` (200ms)
- `animation-delay-400` (400ms)
- `animation-delay-600` (600ms)
- `animation-delay-800` (800ms)
- Dùng cho sequential reveal effects trên homepage

### Framer Motion Patterns
- **Entry**: `initial={{ opacity: 0, scale: 0.3 }}` → `animate={{ opacity: 1, scale: 1 }}`
- **AnimatePresence**: Cho conditional render (AI insight panels, tooltips)
- **Layout animations**: Smooth panel resizing
- **Nguyên tắc**: Animation KHÔNG dùng trên real-time data components (prices, order book) — chỉ cho UI transitions

### tw-animate-css
- Integrated via `tw-animate-css` package
- Provides utility animation classes cho shadcn/ui components
- Dialog, Popover, Dropdown enter/exit animations

## 9. Responsive Behavior

### Breakpoints (Tailwind defaults)

| Breakpoint | Width | Layout Changes |
|-----------|-------|----------------|
| **Mobile** | < 768px | Single column, bottom toolbar thay right sidebar |
| **md** | ≥ 768px | Right panel xuất hiện (320px), 2-panel layout |
| **lg** | ≥ 1024px | Right panel mở rộng (360px), full layout |
| **xl** | ≥ 1280px | Thêm breathing room cho main content |

### Mobile Adaptations
- **Right Panel**: chuyển từ side panel → bottom sheet (slide-up from bottom)
- **Left Sidebar**: ẩn hoàn toàn trên mobile
- **Market Bar**: ticker tiếp tục scroll, nhưng symbol info có thể collapse
- **Header**: Navigation rút gọn, search thu nhỏ
- **Touch targets**: Buttons minimum `h-7` (28px), tăng lên `h-8`–`h-9` trên mobile
- **Font size**: Input fields dùng `text-base` (16px) trên mobile để tránh iOS auto-zoom

### Chart Behavior
- TradingView chart: responsive, fill available width
- Recharts: responsive container, legend position thay đổi theo breakpoint
- Candle chart luôn ưu tiên horizontal space — không bao giờ bị squeeze dưới 60% viewport

## 10. Do's and Don'ts

### Do
- Dùng `tabular-nums` cho MỌI giá trị số — prices, volumes, percentages, timestamps
- Dùng market colors nhất quán: emerald=tăng, red=giảm, amber=tham chiếu, fuchsia=trần, cyan=sàn
- Giữ text sizes nhỏ: `text-[10px]` cho metadata, `text-xs` cho UI, `text-sm` cho headings
- Dùng `bg-card` để tạo elevation thay vì box-shadow
- Dùng OKLCH color values cho theme tokens — đảm bảo perceptual consistency
- Giữ spacing compact: `gap-1` đến `gap-2` là standard cho data-dense areas
- Test cả Light và Dark mode — tokens phải hoạt động ở cả hai
- Dùng `backdrop-blur-xl` cho floating/overlay elements khi cần glassmorphism
- Đặt financial data trong `tabular-nums` containers để đảm bảo column alignment

### Don't
- Không dùng font nào khác ngoài Tahoma — consistency across toàn bộ dashboard
- Không dùng pure black (`#000000`) cho backgrounds — dùng deep navy OKLCH values
- Không animate real-time data (prices, order book) — animation gây distraction và lag
- Không dùng box-shadow nặng — IQX dùng flat design, depth qua color contrast
- Không dùng text lớn hơn `text-base` (16px) trong dashboard — space dành cho data
- Không mix market colors (ví dụ: dùng blue cho "tăng") — 5 màu đã quy định là standard
- Không dùng borders dày — `border-border` (1px) là maximum, nhiều components dùng `border-0`
- Không dùng rounded corners quá lớn cho data components — `rounded-lg` (10px) là max cho cards
- Không quên `font-display: swap` khi load Tahoma — tránh FOIT

## 11. Agent Prompt Guide

### Quick Color Reference
- Primary accent: `oklch(0.69 0.15 234.82)` (Bright Blue)
- Background (dark): `oklch(0.145 0.015 234.82)` (Deep Navy)
- Background (light): `oklch(0.995 0.002 234.82)` (Off White)
- Card (dark): `oklch(0.20 0.02 234.82)` (Lighter Navy)
- Card (light): `oklch(1 0 0)` (Pure White)
- Border (dark): `oklch(0.34 0.03 234.82)`
- Muted text (dark): `oklch(0.68 0.04 234.82)`
- Bullish: `emerald-500` / Bearish: `red-500` / Reference: `amber-500`
- Chart bg: `#0a0a0f` / Candle up: `#00c853` / Candle down: `#ff1744`

### Example Component Prompts
- "Tạo một stock price card: `bg-card rounded-lg p-3`. Symbol ở `text-sm font-bold`. Price ở `text-base tabular-nums font-medium` với color theo market state (emerald/red/amber). Change% ở `text-xs tabular-nums` trong badge `h-5 rounded-4xl` với bg tương ứng (ví dụ `bg-emerald-500/15 text-emerald-500`). Volume ở `text-[10px] text-muted-foreground tabular-nums`."

- "Tạo order book panel: `bg-card p-2 space-y-0.5`. Mỗi price level là một row `h-6 relative flex items-center text-[10px] tabular-nums`. Sell side có `bg-red-500/8` overlay bar absolute từ right, width theo volume ratio. Buy side có `bg-emerald-500/8` overlay bar. Price ở center, volume ở right."

- "Tạo market bar: `h-8 bg-card/50 flex items-center`. Left side: current symbol (`text-xs font-bold`) + price (`text-sm tabular-nums` + market color). Right side: scrolling ticker dùng CSS animation `market-ticker`, mỗi item có index name (`text-[10px]`) + value + change%."

- "Tạo trading form: `bg-card rounded-lg p-4`. Tabs `line` variant cho Buy/Sell. Input fields `h-8 rounded-lg text-sm tabular-nums`. Buy button `bg-emerald-500 text-white h-9 rounded-lg w-full`. Sell button `bg-red-500 text-white h-9 rounded-lg w-full`."

- "Tạo header navigation: `h-11 bg-background border-b border-border`. Logo left. Nav links `text-xs text-muted-foreground hover:text-foreground` horizontal. Search bar `w-32 h-7 rounded-lg bg-muted/50 text-xs` expandable. User avatar + dropdown right."

### Iteration Guide
1. Mọi số liệu tài chính → `tabular-nums` + market color tương ứng
2. Ưu tiên compact: `text-[10px]`–`text-xs`, `gap-1`–`gap-2`, `p-2`–`p-3`
3. Dark mode là primary — test dark trước, light sau
4. Depth bằng color (`bg-card` vs `bg-background`), không bằng shadow
5. Buttons trong trading context dùng size `xs` hoặc `sm` — space quý giá
6. Real-time data: NO animation trên giá trị thay đổi liên tục
7. OKLCH cho theme tokens, Tailwind color classes cho financial states
8. Glassmorphism (`backdrop-blur-xl`) chỉ cho overlays, không cho panels cố định
9. Mobile: right panel → bottom sheet, giữ nguyên market colors và data density
