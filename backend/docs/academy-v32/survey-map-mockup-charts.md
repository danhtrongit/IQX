# Mockup chart map (IQX-Hoc-Vien-MAU.html → typed chart specs)

Source: `scratchpad/src/IQX-Hoc-Vien-MAU.html`. The script starts at char 304529. I extracted it to `scratchpad/work/script.js` (2131 lines); line numbers below refer to that file. I ran all drawing code (lines 2–2041) under a stub DOM (`scratchpad/work/run.js`, `run2.js`) and all **129 svg ids rendered without errors**. The labels each one produced are in `scratchpad/work/texts.txt`.

## 0. Key facts

- **129 drawn `<svg id>`**: Ch1 = 46 (`C1L*`), Ch2 SACO = 7 (ids `L1-g1`, `L1-g2`, `L3-g1`, `L5-g1`, `L6-g1`, `L9-g1`, `L10-g1`, with **no chapter prefix**), **Ch3 = 0**, Ch4 = 55 (`C4L*`), Ch5 = 21 (`C5L*`). Three further `<svg viewBox="0 0 24 24">` are UI chrome icons and are out of scope.
- Every drawing is imperative DOM code (`el(tag, attrs, parent, text)`, line 7). Each lesson has an IIFE with its own copy of the helpers. The viewBox is fixed at 760 wide (heights 96–330). Small multiples use 44/120/200/320 widths.
- Colours are **hard-coded dark-theme hex values**, with no tokens and no light mode. Global palette `C` (line 5): `c1 #3987e5, c2 #199e70, c3 #d95926, grid #1f2b3a, text #e7eff9, muted #95a9be, dim #6d8399, gold #dfb969, neg #e66767, pos #2bb886`. Ch4–5 add `UP #2bb886, DN #e66767, MA1 #249bec, MA2 #dfb969, MA3 #d95926, PR #c9d6e4`, plus RSI `RS #b48cf2`, MACD signal `SG #e8a33d`, bands `BB #7fb8ff`, `MID #dfb969`, Elliott `IMP #7fe0bd`, `COR #f2a0a0`.
- The repo **already has a typed chart pipeline** we should extend rather than replace:
  - zod `chartModelSchema` in `backend/src/modules/academy/content/packages/package.schema.ts:273-401`. Kinds: `series_panels`, `grouped`, `line`, `stacked`, `timeline`, `waterfall`, `panels`.
  - Renderers in `frontend/src/pages/academy/charts/` (`lesson-chart.tsx` switch, `series-panels-chart.tsx`, `category-chart.tsx`, `step-charts.tsx`). These are hand-written SVG with Tailwind token classes from `chart-theme.ts` (`ROLE_STROKE`: price→`stroke-foreground`, p1→`chart-1`, p2→`chart-2`, p3→`muted-foreground`, pos/neg→`price-up/down`), plus `ChartDataTable` for accessibility and `useChartWidth` (narrow < 400px).
  - Data is precomputed at import time by `backend/scripts/academy-import/ch1-math.ts`.
- Indicator maths differs between the mockup and `ch1-math.ts`:
  - The mockup **EMA is seeded with the first value** (`ema()` line 1271: `out[0]=a[0]`). `ch1-math.ts:26` seeds with the SMA of the first n values.
  - RSI matches: both are Wilder with an SMA seed (line 1167).
  - Bollinger matches: both use population σ (line 1372).
  - If we reuse `ch1-math` for the C4L7 MACD charts, the curves shift a little and the derived marks (cross index `e=124`) must be recomputed. **Recommendation:** port the mockup helpers verbatim for these illustrative charts so the pictures match the approved mockup, and pin the derived indices in a golden test.
- **Responsive gap:** the mockup draws 11–15px text in a 760-wide viewBox. At 360px phone width that shrinks to about 5–7px. The React renderers must lay out at the measured width, as `series-panels-chart` already does, and must not scale a 760 viewBox.

## 1. Inventory: every svg id

Legend: **Kind →** is the proposed target spec from §2. Data marked *(proc)* is generated procedurally and must be frozen at import (§3).

### Chapter 1 · Nền tảng (46)

| id | Lesson | Chart type | Data / formula | Axes, labels, annotations | Colours | Kind → |
|---|---|---|---|---|---|---|
| C1L1-ic-ket | L1 Đầu tư chứng khoán | icon 44×44 (safe) | none | none | #95a9be on #1d2a3a | Lucide `Vault` |
| C1L1-ic-tk | L1 | icon (bank building) | none | none | #3fc495 | Lucide `Landmark` |
| C1L1-ic-ck | L1 | icon (chart in frame) | none | none | #5db8ff | Lucide `ChartLine` |
| C1L1-g1 | L1 | multi-line, 3 series, x = years 2015–2025 | `VNI=[579.03,664.87,984.24,892.54,960.99,1103.87,1498.28,1007.09,1129.93,1266.78,1784.49]` normalised to 100. Savings `100·1.06^i`. Purchasing power `D[i]=D[i-1]/(1+CPI[i]/100)` with `CPI=[0,2.66,3.53,3.54,2.79,3.23,1.84,3.15,3.25,3.63,3.31]` (lines 9–11) | y 0–350 step 50, unit "triệu"; x labels at even years and 2025; end labels "74 triệu", "179 triệu", "308 triệu". **Animated** stroke-dash draw-in (`s.__go`, line 49; IntersectionObserver line 2072) | D #6d8399, B #199e70, A #3987e5 (w 3.5) | `category` line (+ `end_labels`) |
| C1L1-g2 | L1 | pictogram (10 banknotes per row) | 2015: 10 notes / "100 triệu"; 2025: 7.4 notes / "≈ 74 triệu" | row labels | #14563f/#2bb886, ghost dashed #3a4b5e, #f2a0a0 | `segment_bar` (unit variant) or static. **Bug:** `i>=solid` with solid=7.4 draws 8 full notes and then a 40% note over note 8, so it shows about 8 notes, not 7.4 (line 62/68) |
| C1L1-a1 | L1 advantage 1 | illustration (house vs 100-share card) | "hàng tỷ đồng", "100 cổ phiếu", "2 triệu", "vài triệu đồng" | none | #e09a6c, #5db8ff | static asset / `svg_diagram` |
| C1L1-a2 | L1 adv. 2 | 2 horizontal bars (speed) | "2 ngày" vs "vài tuần – vài tháng" | none | #3987e5, #d95926 | `segment_bar` |
| C1L1-a3 | L1 adv. 3 | illustration (4×4 grid with one owned cell, rising line, coin) | "Giá tăng", "Cổ tức" | none | #5db8ff, #2bb886 | static |
| C1L1-a4 | L1 adv. 4 | illustration (report and document) | no text | none | multi | static |
| C1L1-a5 | L1 adv. 5 | receipt shape | "Thuế khi bán", "0,1%" | none | #2bb886 | static / stat tile |
| C1L2-g1 | L2 Thị trường và các sàn | 2-panel flow (two actors, arrows both ways) | Sơ cấp: Doanh nghiệp ⇄ Nhà đầu tư; Thứ cấp: NĐT A ⇄ NĐT B; arrows "Cổ phiếu"/"Tiền" | panel titles | #7fb8ff, #e8c77d, #3987e5, #2bb886 | `svg_diagram` (or `flow` compare) |
| C1L2-g2 | L2 | flow row with fork | Công ty cổ phần → IPO → Công ty đại chúng → {Niêm yết HOSE·HNX, Đăng ký giao dịch UPCoM} | none | #5db8ff | `flow` row + fork |
| C1L2-g3 | L2 | flow row + header band + child | UBCKNN band; Nhà đầu tư → CTCK → Sở GD → VSDC, actions under each; Doanh nghiệp phát hành under Sở | none | gold band #2a2312/#dfb969 | `flow` |
| C1L2-g4 | L2 | dot cloud (VN-Index) with inner circle of 30 dots (VN30) | dot radii *(proc)* LCG seed 7; inner points by golden angle `a=i·2.39996`, `r=√((i+.5)/30)` | "VN-Index", "toàn bộ cổ phiếu trên HOSE", "VN30" | #3a4b5e, #3987e5 | static asset (decorative) |
| C1L3-g1 | L3 Cơ chế giao dịch | order-ticket mock | MUA/BÁN; ABC, 500, 25.150, LO; 12.575.000 đ | none | #2bb886, #7fb8ff | text block `kv_card` |
| C1L3-g2 | L3 | vertical scale (price band, gradient bar) | ref 25.000, ceiling 26.750 (+7%), floor 23.250 (−7%) | labels, "Tăng: màu xanh lá", "Giảm: màu đỏ" | gradient violet→green→gold→red→cyan | `scale` (v) |
| C1L3-g3 | L3 | Gantt, 3 rows over 9:00–15:00 | HOSE: ATO 9:00–9:15, Liên tục –11:30, Nghỉ –13:00, Liên tục –14:30, ATC –14:45, Thỏa thuận –15:00; HNX: … ATC, PLO 14:45–15:00; UPCoM: Liên tục/Nghỉ/Liên tục –15:00 | ticks 9:00/11:30/13:00/14:30/15:00; legend for short sessions | ATO #b77ee6, LT #3987e5, ATC #d95926, TT #6d8399, PLO #c99a35 | `gantt` |
| C1L3-g4 | L3 | order book (2 columns, ranked) | buy [25.100 09:20 1.000; 25.100 09:31 500; 25.050 09:18 2.000]; sell [25.150 09:25 800; 25.200 09:16 1.500; 25.250 09:40 600] | rank badges 1–3 | #2bb886 / #e66767 | text block `table` |
| C1L4-g1 | L4 T+2, phí, thuế, margin | calendar grid (8 days) with T → T+2 rows | Mua thứ Hai: T(0)→T+2.5(2) "Cổ phiếu về, bán được từ phiên chiều"; Bán thứ Hai: T→T+2 "Tiền về tài khoản"; Mua thứ Năm: T(3)→T+2.5(7), skipping the weekend | weekend columns dimmed | #2bb886, #5db8ff, #dfb969 | `gantt` (day domain + markers) |
| C1L4-g2 | L4 | two receipts | MUA: 1.000×20.000=20.000.000, Phí 0,15% +30.000, Thuế 0 → 20.030.000. BÁN: 22.000.000, −33.000, Thuế 0,1% −22.000 → 21.945.000 | none | #7fe0bd / #f2a0a0 | text block `kv_card` ×2 |
| C1L4-g3 | L4 | stacked horizontal bars | Không vay [Vốn 100]; Margin [Vốn 100, Vay 100] → "Sức mua 200 triệu" | scale 200 | #6d8399, #3987e5 | `segment_bar` |
| C1L4-g4 | L4 | grouped bars ± (leverage) | Giá +20%: [+20, +40]; Giá −20%: [−20, −40] | y −40..+40 step 20 in %, "Lãi/lỗ trên vốn" | #6d8399 vs #3987e5 | `category` grouped |
| C1L5-g1 | L5 Cổ phiếu và trái phiếu | hub diagram (centre + 2 sides, 4 labelled arrows) | Doanh nghiệp; Cổ đông (Góp vốn / Cổ tức, giá tăng); Trái chủ (Cho vay / Lãi và gốc); footers | none | blue / gold | `svg_diagram` |
| C1L5-g2 | L5 | cash-flow bars (neg + stacked final) | Mua −100.000; Năm 1 +8.000; Năm 2 +8.000; Năm 3 +108.000 (8.000 interest + 100.000 principal) | legend | #e66767, #c99a35, #2bb886 | `category` stacked |
| C1L5-g3 | L5 | scatter, 4 points + dashed trend curve | (risk, return) = Tiết kiệm (.08,.12), TPCP (.28,.24), TPDN (.52,.42), Cổ phiếu (.86,.82) | axis titles "Rủi ro →", "Lợi nhuận kỳ vọng ↑" | #6d8399, #c99a35, #d9a33a, #3987e5 | `schematic` |
| C1L6-g1 | L6 Quỹ, ETF, CW, phái sinh | many → hub → box diagram | 5 investors → Quỹ đầu tư → Danh mục (CP×3, TP×2, Tiền×1) | none | #5db8ff | `svg_diagram` |
| C1L6-g2 | L6 | ETF ≈ basket (30 squares, fading opacity) | 30 cells, opacity `.35+.6(1-i/30)` | "Rổ 30 cổ phiếu VN30" | #3987e5 | `svg_diagram` / static |
| C1L6-g3 | L6 | payoff line (piecewise) | x 20k–40k; strike 30.000, premium 2.000 → (20k,−2000)–(30k,−2000)–(40k,+8000); break-even 32.000; point (38k, +6.000) | y ticks −2.000/0/+4.000/+8.000; loss zone shaded; labels | #5db8ff line, #e66767 zone, #c99a35 strike | `schematic` |
| C1L6-g4 | L6 | two crossing lines (long/short futures) | straight lines ±slope through the centre | "Mua"/"Bán", "Lãi"/"Lỗ", "Giá lúc mở vị thế" | #3987e5 / #d95926 | `schematic` |
| C1L6-g5 | L6 | horizontal gradient risk scale + markers | Quỹ mở/ETF 150, Cổ phiếu 400, Chứng quyền 600, Phái sinh 690 (px of 30–730) | "Rủi ro thấp"/"Rủi ro cao" | green→gold→red | `scale` (h, gradient) |
| C1L7-g1 | L7 Quyền cổ đông | milestone timeline + 2 shaded spans + brace | points at 0, .42, .60, 1: Công bố / Giao dịch không hưởng quyền / Đăng ký cuối cùng / Thanh toán; spans [0,.42] "được hưởng quyền", [.42,1] "không được hưởng quyền"; brace .42–.60 "1 ngày làm việc" | none | #6d8399, #e66767, #5db8ff, #2bb886 | `milestones` |
| C1L7-g2 | L7 | before/after stacked h-bars (`ba()`, line 560) | Trước [30 "1.000 × 30.000"]; Sau [28 "1.000 × 28.000", 2 "2 tr"]; totals 30 triệu | scale 33 | #3987e5, #2bb886 | `segment_bar` |
| C1L7-g3 | L7 | same | Trước [30]; Sau [30 "1.200 × 25.000"] | none | none | `segment_bar` |
| C1L7-g4 | L7 | same, 3 rows + legend | Trước [30, cash 3] = 33; Thực hiện quyền [33 "1.200 × 27.500"]; Bỏ quyền [27.5, 3] = "30,5 triệu" (neg tone) | legend "Tiền mặt 3 triệu dùng để mua 200 cổ phiếu mới" | #6d8399 cash | `segment_bar` |
| C1L8-g1 | L8 Chu kỳ kinh tế, lãi suất | sine wave split into 4 coloured phases | `y = Ym + 70·cos(2πx/W)`, 4 equal quarters | phase names; Đỉnh/Đáy | #2bb886, #3987e5, #c99a35, #e66767 | `schematic` |
| C1L8-g2 | L8 | two phase-shifted cosines + lead arrow | `cos((x+sh)/W·2π·1.25)`, sh=0 (economy) vs 70 (market) | "Thị trường tạo đáy trước" | #6d8399, #3987e5 | `schematic` |
| C1L8-g3 | L8 | two vertical cause→effect columns | Lãi suất giảm → [vay rẻ hơn, tiền gửi kém hấp dẫn] → Hỗ trợ giá; Lãi suất tăng → … → Áp lực | none | green / red | `flow` column ×2 |
| C1L8-g4 | L8 | 6-node cycle on ellipse | Lạm phát tăng → Tăng lãi suất → Kinh tế hạ nhiệt → Lạm phát giảm → Giảm lãi suất → Kinh tế tăng tốc → | none | per-node tones | `flow` cycle |
| C1L9-g1 | L9 Bốn pha thị trường | phase zones + hand price path + volume bars | 31 normalised points `pts` (line 675); 48 volume bars `v = base + k·|sin(i·c)|` per phase (line 681) *(analytic)* | phase titles, "Khối lượng" | phase tones | `schematic` (+bars layer) |
| C1L9-g2 | L9 | emotion cycle (cosine + 9 labelled points) | `y = Ym + 95·cos(2πx/W)`; points at r=.04…​.97: Chán nản, Hy vọng, Lạc quan, Phấn khích, Hưng phấn, Lo lắng, Sợ hãi, Hoảng loạn, Chán nản | "Rủi ro cao nhất", "Cơ hội lớn nhất"×2 | #3987e5 + tones | `schematic` |
| C1L9-g3 | L9 | real VN-Index line with phase zones | `P=[['12/19',961],['3/20',662],['6/20',825],['9/20',905],['12/20',1104],['3/21',1191],['6/21',1408],['9/21',1342],['12/21',1498],['1/22',1528],['3/22',1492],['6/22',1197],['9/22',1132],['11/22',911],['12/22',1007]]` at month offsets `T=[0,3,6,9,12,15,18,21,24,25,27,30,33,35,36]` | y 600/1.000/1.400; years 2020–2023; zones (months) Tích lũy 2–5, Tăng 5–23, Phân phối 23–28, Giảm 28–35; markers ≈660, ≈1.530, ≈910 | white line, phase tones | `series_panels` (x = month index 0..36, values null between points) or `schematic` |
| C1L10-g1 | L10 Quản trị rủi ro | area curve over floor | `risk(n)=0.35+0.65/n`, n = 1..20 step .25; floor area 0.35 | x 1/5/10/15/20 "Số cổ phiếu trong danh mục", "Rủi ro"; 2 region labels | #5db8ff, red floor | `schematic` (or `category` line + band) |
| C1L10-g2 | L10 | grouped bars (loss vs gain to recover) | `[[10,11],[20,25],[30,43],[40,67],[50,100]]` | "Lỗ n%" categories, value labels | #e66767 / #2bb886 | `category` grouped |
| C1L10-g3 | L10 | 100% segmented bar | A–E 15% each (Ngân hàng, Bán lẻ, Thép, Công nghệ, Điện), Tiền mặt 25% Dự phòng | % + sub + name | blue ramp, green | `segment_bar` |
| C1L10-g4 | L10 | 3-step calc cards with arrows | Rủi ro tối đa 100 triệu × 2% = 2.000.000 đ → Rủi ro mỗi CP 20.000 − 18.600 = 1.400 đ → KL 2.000.000 ÷ 1.400 ≈ 1.400 CP (1.428 rounded down to a lot) | none | gold/red/blue | `flow` row (cards) or `steps` block |
| C1L10-g5 | L10 | checklist card | 5 rows: Lý do mua, Điểm mua, Điểm cắt lỗ, Mục tiêu, Khối lượng + descriptions | title "Kế hoạch trước khi mua" | #2bb886 ticks | text block `checklist` |

### Chapter 2 · Kỹ năng Sale SACO (7). Chapter 3 · Thương hiệu cá nhân (0)

| id | Lesson | Type | Data | Labels | Kind → |
|---|---|---|---|---|---|
| L1-g1 | Ch2 B1 SACO là ai | grouped bars, 12 months | *(analytic)* `A: a=a·0.97+5`, `B: b=b·0.8+5` over 12 months → end 51 vs 23 (customers, retention 97% vs 80%) | y 0–60 "khách", T1–T12, end values | `category` grouped |
| L1-g2 | Ch2 B1 | funnel, 4 trapezoids + side notes | Traffic 100 → Tư vấn 30 → Chuyển đổi 10 → Chăm sóc 7 (widths 520/430/300/190) | notes | `svg_diagram` (or a small `funnel` kind) |
| L3-g1 | Ch2 B3 Tìm khách hàng | concentric half-rings | radii 285/215/145/75: MXH ≈40, Đồng nghiệp ≈30, Bạn bè ≈20, Gia đình ≈10 | none | `svg_diagram` |
| L5-g1 | Ch2 B5 Tư vấn | 70/30 split bar | Khách nói 70% / Bạn nói 30% + subtitles | none | `segment_bar` |
| L6-g1 | Ch2 B6 Bán giá trị | 2 h-bars, same scale (5.000.000) | Chênh lệch phí 0,1% → 100.000 đ; Bán hoảng loạn 5% → 5.000.000 đ | row label + sub | `segment_bar` |
| L9-g1 | Ch2 B9 Chăm sóc | milestones (5) + highlight span | Ngày 1, 3, 7, 30, Hằng tháng with 2-line detail; band "30 ngày đầu…" over the first 4 | none | `milestones` |
| L10-g1 | Ch2 B10 Lịch làm việc | single-row Gantt 7:30–21:30 | 8–8:45 Bản tin sáng; 9–11:30 Theo dõi, hỗ trợ khách; 11:30–12 Trưa; 13–15 Hỗ trợ khách; 15–15:45 Tổng kết; 19–21 Tiếp cận người mới; light span 9–15 | ticks 8:00, 9:00, 11:30, 13:00, 15:00, 19:00, 21:00; legend of 4. Labels hidden when segment < 70px | `gantt` |

### Chapter 4 · Phương pháp kỹ thuật (55)

| id | Lesson | Type | Data | Axes / annotations | Kind → |
|---|---|---|---|---|---|
| C4L1-g1 | L1 Biểu đồ nến | candle anatomy (2 big candles) | up (o40, h100, l15, c80), down (80, 100, 15, 40) | O/H/L/C callouts with dashed leaders | `candle_glyphs` (annotate `ohlc`) |
| C4L1-g2 | L1 | 4 candle variants | Thân dài (20,100,15,95), Thân ngắn (55,75,40,60), Bóng trên dài (30,105,25,42), Bóng dưới dài (80,88,5,92) | names | `candle_glyphs` |
| C4L1-g3 | L1 | 5 daily = 1 weekly | daily `[[30,48,25,45],[45,60,40,55],[55,58,38,42],[42,70,40,66],[66,85,60,80]]` T2–T6; weekly (30,85,25,80) | "5 nến ngày", "=", "1 nến tuần" | `candle_glyphs` (2 groups + join "=") |
| C4L1-p1…p5 | L1 | pattern thumbnails 120×110 | Doji [50,95,5,51]; Búa [78,92,10,88]; Sao băng [22,90,8,12]; Nhấn chìm tăng [[60,64,30,34],[30,90,26,86]]; Nhấn chìm giảm [[34,64,30,60],[86,90,26,30]] (o,h,l,c) | none (names are in HTML) | `candle_glyphs` ×5 (or 1 with 5 groups) |
| C4L1-g4 | L1 | 42-candle chart, no axes | *(proc)* LCG `(seed*9301+49297)%233280`, seed 11. Drift −0.6 (i<14), +1.1 (i<30), −0.2 after; `c=o+drift+(r−.5)·5`; wicks `+r·2.5` | 3 grid lines | `series_panels` (candles) |
| C4L2-g1 | L2 Xu hướng | 3 small polylines (up/down/sideways) | inline 7-point pixel arrays | panel titles | `schematic` compare ×3 |
| C4L2-g2 | L2 | zigzag + peaks/troughs + 2 dashed connectors | 8 pixel points; Đỉnh 1–3, Đáy 1–2 | caption "Đỉnh và đáy cao dần: xu hướng tăng" | `schematic` |
| C4L2-g3 | L2 | 2 panels of 16 candles + trend lines through lows/highs at idx 1, 5, 9, 13 | inline `up` OHLC (16); `dn = 110 − up` mirrored | "Nối các đáy" / "Nối các đỉnh"; line extended 40px | `series_panels` compare (candles + `segments`) |
| C4L2-g4 | L2 | zigzag + long dashed trendline + short-term red box | 13 pixel points | "Giảm ngắn hạn", "Đường xu hướng tăng dài hạn" | `schematic` |
| C4L2-g5 | L2 | zigzag breaking trendline | 11 pixel points; lower high at (540,75); break ring at (567,109) | "Đỉnh thấp hơn", "Phá đường xu hướng" | `schematic` |
| C4L3-g1 | L3 Hỗ trợ/kháng cự | range: 2 zones + zigzag + touch dots | 10 pixel points; zones y 48–72 / 196–220 | "Kháng cự", "Hỗ trợ" | `schematic` |
| C4L3-g2 | L3 | 15 candles bouncing off a zone | inline OHLC (15); zone 24–32 | "Vùng hỗ trợ" | `series_panels` (candles + zone) |
| C4L3-g3 | L3 | role reversal zigzag | 12 pixel points; zone y 118–140 | "Kháng cự", "Trở thành hỗ trợ", "Phá vỡ" ring, 2 retest dots | `schematic` |
| C4L3-g4 | L3 | true vs false breakout, 7 candles + volume each | inline OHLC; vol true `[20,22,18,24,70,55,48]`, false `[20,22,18,24,26,30,28]`; resistance zone 48–56 | panel titles | `series_panels` compare (candles + volume bars + zone) |
| C4L4-g1 | L4 Khối lượng | 16 candles + volume | inline `[o,h,l,c,v]` ×16 (line 1025) | "Giá", "Khối lượng" | `series_panels` |
| C4L4-g2 | L4 | 2 panels × 8 candles + volume; weakening panel has dashed line over up-day volumes | inline A/B arrays (line 1031) | "Xu hướng khỏe" / "Lực mua suy yếu" | `series_panels` compare (+ `segments` on volume) |
| C4L4-g3 | L4 | 14 candles + volume spike over resistance | inline (line 1050); avg vol 23 | zone "Kháng cự", dashed "Trung bình 20 phiên", "Đột biến" | `series_panels` |
| C4L4-s1…s4 | L4 | 4 thumbnails 320×150: price up/down × volume up/down | `up` 6 candles `[[30,34,29,33]…]`, `dn = 83 − up`; vol `vu=[14..44]`, `vd` reversed | dashed trend over price and volume | `series_panels` (narrow, no axes) ×4 |
| C4L5-g1 | L5 MA | price + MA20 | *(proc)* `series(110, 7, i→50+.22i+6sin(i/9), 5.5)`, window 20..110 | legend | `series_panels` |
| C4L5-g2 | L5 | price + MA20/50/200 | *(proc)* `series(420, 11, 60+.2i+9sin(i/30)+3sin(i/9), 4)`, window 220..420 | legend | `series_panels` |
| C4L5-g3 | L5 | 2 panels up/down + MA20 | *(proc)* seed 3 `40+.32i` / seed 5 `80−.32i`, n 90, noise 4, window 20..90 | titles | compare of `series_panels` |
| C4L5-g4 | L5 | MA20 dynamic support + 4 bounce dots | *(proc)* `series(132, 23, 40+.32i+6.5|sin(iπ/22)|, 1.1)`, window 22..132; dot = local min within ±3 of i ∈ {44, 66, 88, 110} | legend "Bật lên từ MA" | `series_panels` + marks |
| C4L5-g5 | L5 | golden / death cross: SMA10 vs SMA30 | *(proc)* seed 31 `i<45?70−.55i:45.25+.75(i−45)`; seed 37 mirrored; n 110, noise 3, window 30..110; rings at `crosses(a,b)` | titles | compare + marks |
| C4L5-g6 | L5 | sideways whipsaw | *(proc)* `series(130, 41, 50+3.2sin(i/3.6)+1.6sin(i/7.3), 2.2)`; dots at price×MA20 crosses | legend "Tín hiệu nhiễu" | `series_panels` + marks |
| C4L6-g0 | L6 RSI | 3 panels × 14 diverging bars + computed caption | `A=[3,2,-2,3,2,3,-1,2,3,-2,3,2,-1,2]`, `B=[2,-2,1,-1,3,-3,2,-1,-2,2,1,-2,2,-2]`, `C=−A`; caption `RSI≈round(100·G/(G+L))` → 81 / 50 / 19 | titles | `category` compare (diverging bars) + caption |
| C4L6-g1 | L6 | price + RSI(14) panel | *(proc)* `series(140, 5, 50+7sin(i/9)+.04i, 2.4)`, window 20..140; RSI Wilder 14 | RSI 70/50/30 dashed, labels | `series_panels` (2 panels) |
| C4L6-g2 | L6 | same series + OB/OS zones + dots | same; dots from a state machine (enter >70 or <30, mark the extreme, exit at <55 or >45) on both panels | "Quá mua", "Quá bán" | `series_panels` + zones + marks |
| C4L6-g3 | L6 | strong uptrend RSI stays high | *(proc)* seed 9 `i<30?50+sin(i/5):50+.5(i−30)+1.6sin(i/5)`, noise 2.6 | zones, no labels | `series_panels` |
| C4L6-g4 | L6 | divergence schematic, 2 panels (price + RSI) | inline pixel `bp` (9 pts) and `br`; bullish = mirrored (`194−y`, `450−y`); dashed segments between idx 2 and 6 | titles, "Giá"/"RSI" | `schematic` compare (same geometry as C4L7-g5) |
| C4L6-g5 | L6 | worked example: price + MA50 + RSI, buy/stop | *(proc)* shared path `pullback150`: `p0=40`; `d = i<110 ? U[i%7] : i<120 ? D[i−110] : R[(i−120)%7]` + `rng(3)` noise ±.125, with `U=[.9,-.5,.8,-.4,.7,.3,-.6]`, `D=[-.8,-.5,.3,-.7,-.5,.2,-.6,-.4,.2,-.5]`, `R=[1,.8,-.3,.9,.6,-.4,.7]`; window 75..150. Derived: k = argmin RSI in 112..123 = **119** (RSI 42.4), e = first i>k with RSI ≥ RSI[k]+5 and price up = **120** (RSI 50.2); stop = min(p[110..e]) − 1.2 | "Mua", "Cắt lỗ", MA50 legend | `series_panels` + marks + hline |
| C4L7-g1 | L7 MACD | price + MACD (line, signal, histogram) | *(proc)* `series(170, 5, 50+7sin(i/11)+.04i, 2)`, window 50..170; EMA first-value seeded | zero line, legend | `series_panels` (bars + 2 series) |
| C4L7-g2 | L7 | price + EMA12/EMA26 overlay, MACD line only | same series | legends | `series_panels` |
| C4L7-g3 | L7 | crossovers | *(proc)* `series(170, 8, 50+6sin(i/9)+.03i, 2)`; `crossList`: histogram sign change confirmed at h[i+2] | rings on MACD, dots on price | `series_panels` + marks |
| C4L7-g4 | L7 | 2 panels × 8 histogram bars | `[4,8,12,17,22,27,33,38]` / `[38,36,31,25,19,13,8,3]` | titles | `category` compare |
| C4L7-g5 | L7 | divergence schematic (MACD) | identical geometry to C4L6-g4 | none | `schematic` |
| C4L7-g6 | L7 | worked example | `pullback150` again; e = first i ∈ 112..139 with h[i−1]<0≤h[i] = **124**; stop = min(p[108..e]) − 1.2 | "Mua", "Cắt lỗ", MA50 | `series_panels` + marks |
| C4L8-g1 | L8 Bollinger | price + bands 20 ± 2σ (filled) | *(proc)* `series(170, 21, 50+6sin(i/14)+.05i, 2.6)`, window 40..170 | legend | `series_panels` (band) |
| C4L8-g2 | L8 | squeeze → expansion | *(proc)* `genVar(160, 4, f, amp)`: f = i<112 ? 55+3sin(i/8)·(i<60?1:.2) : 55+.55(i−112); amp 3 / .7 / 2.6; window 30..160 | "Dải thắt chặt" above the min upper band in 66..108, "Dải mở rộng" at 140 | `series_panels` + text marks |
| C4L8-g3 | L8 | ranging vs riding | *(proc)* seed 31 `50+2.8sin(i/5)` noise 1.5; seed 32 `40+.42i+1.2sin(i/5)` noise 1.6; n 110, window 25..110 | titles | compare |
| C4L8-g4 | L8 | worked example: buy at mid band | *(proc)* `series(110, 12, 40+.3i+2.2sin((i−14)/6), 2.2)`, window 30..110; k = first local min in 74..89 within mid ± (−.4, +.3), e = k+1; stop = min(p[k−4..k]) − 1.2 | "Mua", "Cắt lỗ" | `series_panels` + marks |
| C4L9-g1 | L9 Fibonacci | number tiles + 3 ratio cards | 1,1,2,3,5,8,13,21,34,55,89 (13/34/55/89 highlighted); 34÷55 ≈ 0,618, 34÷89 ≈ 0,382, 13÷55 ≈ 0,236 | none | text block `tiles` |
| C4L9-g2 | L9 | price path + retracement levels | *(proc)* `path([[38,30],[16,-16.6],[36,24]], 40, 7, .9)` (91 pts); a/b = argmin/argmax in 0..44 | levels 0/23,6/38,2/50/61,8/100 %, gold zone 50–61.8; "Đáy", "Đỉnh" | `series_panels` + `fib` overlay |
| C4L9-g3 | L9 | up vs down fib | *(proc)* up `path([[30,26],[14,-14.5],[22,18]], 40, 11, .7)`, down `path([[30,-26],[14,14.5],[22,-18]], 70, 12, .7)` (67 pts) | "Kéo từ đáy lên đỉnh" / "…đỉnh xuống đáy" | compare + `fib` |
| C4L9-g4 | L9 | worked example | *(proc)* `path([[10,-3],[34,28],[15,-15.6],[4,1.2],[30,22]], 44, 21, 1.1)` (94 pts). Derived **a=9, b=44, k=59, e=60, retracement 60.0%**; stop = p[k] − 3 | "Mua", "Cắt lỗ" | `series_panels` + `fib` + marks |
| C4L10-g1 | L10 Elliott | 8-segment wave schematic | `W1=[[40,250],[130,170],[180,215],[330,70],[390,125],[480,40],[560,140],[610,100],[710,200]]`, tags 1–5 A B C | brackets "5 sóng đẩy", "3 sóng điều chỉnh" | `schematic` |
| C4L10-g2 | L10 | 5-wave rules | `W2=[[40,280],[180,190],[250,245],[450,70],[530,137],[680,40]]`; 2 dashed rule lines | 3 rule texts | `schematic` |
| C4L10-g3 | L10 | fib zones on waves | W2 with point 2 = [250,241]; zones 50–61.8% of wave 1, ≈38.2% of wave 3 | zone labels | `schematic` |
| C4L10-g4 | L10 | how to use | W1, wave 3 thicker; rings at waves 2 and 4 "Vùng mua", wave 5 "Thận trọng"; "Nắm giữ", "Hạn chế mua mới" | none | `schematic` |

### Chapter 5 · Phương pháp cơ bản (21)

| id | Lesson | Type | Data | Annotations | Kind → |
|---|---|---|---|---|---|
| C5L1-g1 | L1 DCA | line (price) + bars (units), 12 months | `P=[20,18,16,15,13,12,14,15,17,19,21,22]` (k đ); units = round(3000/P) → 150, 167, 188, 200, 231, 250, 214, 200, 176, 158, 143, 136 | value labels, T1–T12 | `panels` (line + bars, shared x) |
| C5L1-g2 | L1 | 6 month cards with bars | `P=[20000,15000,12000,15000,20000,25000]`; units 150, 200, 250, 200, 150, 120. **Prose hard-codes** 18 triệu, 1.070 CCQ, giá vốn 16.822, 26,75 triệu, +48,6% (consistent; add a test) | "Tháng n", price, "chứng chỉ" | `category` bars (with top labels) |
| C5L1-g3 | L1 | 3 lines, lump sum vs DCA, 24 months | *(analytic)* `P[m] = m<9 ? 100−4.2m : m<14 ? 62+.6(m−9) : 65+4.5(m−14)`; DCA 3/month; lump 72 at P0; invested (dashed) | y 0/25/50/75 "triệu đồng"; end labels **+5% / +36%** | `category` line |
| C5L2-g1 | L2 Giá trị | price vs intrinsic value, fill-between by sign | *(proc)* `rng(9)`, N 160, `V=50+.16i`, `P=V(1+.2sin(i/11)+.06sin(i/4))+e`, e AR(.6) ±1.1 | 4-item legend | `series_panels` + `fill_between` |
| C5L2-g2 | L2 | margin-of-safety bars + bracket | 100.000 vs 70.000 → "Biên an toàn 30%" | none | `segment_bar` + bracket |
| C5L2-g3 | L2 | 4 formula rows (a ÷ b = c) | EPS 200 tỷ ÷ 100 triệu = 2.000 đ; P/E 24.000 ÷ 2.000 = 12 lần; P/B 24.000 ÷ 16.000 = 1,5 lần; ROE 200 ÷ 1.600 = 12,5% | none | text block `formula` |
| C5L2-m1 | L2 metric card | bars 2019–2025 (EPS) | `[1500,1650,1400,1800,2000,2150,2400]` | ticks 0/1k/2k, last label "2.400" | `category` bar |
| C5L2-m2 | L2 | line 84 months (P/E) + mean band ±2 | *(proc)* `rng(4)`: `14+2.2sin(i/9)+e − (i>66?(i−66)·.2:0)`, e AR(.8) ±.55 → **mean 14,3, current 12,0** | ticks 8–20; years '19–'25 | `series_panels` (single panel) or `category` line + band |
| C5L2-m3 | L2 | line 84 months (P/B) + "Mốc 1" | *(proc)* `rng(7)`: `1.8+.35sin(i/10+1)+e − (i>64?(i−64)·.022:0)` → **mean 1,8, current 1,6** | red hline at 1 | same |
| C5L2-m4 | L2 | bars ROE with 15% threshold tone | `[14,16,13,17,18,19,18]` % | hline 15% | `category` bar (tone by threshold) |
| C5L3-g1 | L3 4M | 4 tiles + 2 brackets | M1 Ý nghĩa/Meaning…​ M4 Biên an toàn; brackets "Doanh nghiệp tốt" (M1–3), "Giá hợp lý" (M4) | none | text block `tiles` |
| C5L3-g2 | L3 | 5 small bar multiples, 10 years | ROIC `[15,16,14,17,16,18,17,16,18,19]` + 10% line; others *(proc)* `rng(5)` `100·(1+g)^i·(1±4%)` with g = .12, .13, .11, .12 → labels "+12%/năm", "+13%", "+11%", "+12%" (CAGR computed from data) | '16, '25 | `panels` of `category` |
| C5L3-g3 | L3 | 5-card calculation flow | EPS 2.000 → ≈6.200 (12%/năm) → ≈124.000 (× P/E 20) → ≈30.700 (quy về hiện tại) → ≈15.350 (÷ 2) | none | `flow` row (cards) / `steps` |
| C5L3-g4 | L3 | horizontal zone scale + 2 markers | 0–44k: Vùng mua 0–15.35, Chờ thêm –30.7, Đắt –44 | ticks 0–40k; markers "Giá mua · 15.350 đ", "Giá trị hợp lý · 30.700 đ" | `scale` |
| C5L4-g0 | L4 CANSLIM | 5-step flow | Thị trường → Lọc cổ phiếu → Theo dõi nền → Mua đúng điểm → Quản lý lệnh (with sub-lines) | none | `flow` row |
| C5L4-g1 | L4 | 7 letter tiles + 3 brackets | C A N S L I M with Vietnamese names; groups (C–N), (S–I), (M) | none | text block `tiles` |
| C5L4-g2 | L4 | 2 bar panels | C: Q1–Q4 `[18,26,34,45]` % with 25% line (tone ≥25); A: 2022–2025 `[1000,1300,1650,2100]` with growth labels +30/+27/+27%, "ROE 21%" | none | `panels` of `category` |
| C5L4-g3 | L4 | cup with handle + volume | *(proc)* `rng(8)` path segs `[[16,14],[26,-14],[10,-1],[26,13.5],[10,-4.4],[4,1],[18,12]]` from 40 (111 pts); **volume uses the same rng after the price** (base 30+14r; handle 16+6r; breakout [78,62,50]; cup 24+10r); hand = max p[76..89], bi = first ≥90 with p > hand+.2 | "Cốc", "Tay cầm", "Điểm mua", avg vol 32 "Trung bình 50 phiên", "Cao hơn … 40–50%" | `series_panels` (price + volume) |
| C5L4-g4 | L4 | horizontal bars RS rating + threshold | A 94, B 86, C 67, D 45, E 22; Mốc 80 | none | `category` bar (h) |
| C5L4-g5 | L4 | worked example: buy zone, stop, target bands + volume | *(proc)* `rng(21)` segs `[[20,6],[12,-3.5],[14,5.4],[8,-3.4],[4,.9],[6,3.6],[22,12]]` from 42 (87 pts); bi = first ≥55 with p ≥ 50.1; volume from the same rng | bands Vùng mua 50–52.5, Chốt lời 61–64; hlines 50 "Điểm mua · 50.000", 47.4 "Cắt lỗ −7%"; "Mua 51.000"; "Khối lượng +60%" | `series_panels` |
| C5L4-g6 | L4 | VN-Index vs MA50 with green/red background per bar | *(proc)* `series(200, 6, i<70?1100+2.2i : i<120?1254−3.4(i−70) : 1084+2.6(i−120), 26)`, window 50..200; ok = p>MA50 and MA50 rising | legend 4 | `series_panels` + `x_shade` |

## 2. Proposed reusable kinds (extend `chartModelSchema`)

Principles:
1. Colours are **tones**, not hex. Proposed tone set: `price | p1 | p2 | p3 | p4 | p5 | pos | neg | warn | info | neutral`.
   - Add `p4` → `chart-7` (violet, RSI) and `p5` → `chart-8` or a new orange token (MA200, EMA26, ATC).
   - `warn` → `chart-2` (gold: MA50, signal, mid band, Fibonacci key levels).
   - `info` → `chart-1`/`brand-cyan`.
2. Geometry uses data or normalised coordinates, never pixels.
3. Every kind must produce either a data table via `chartTables()` or an `alt` text.

```ts
type Tone = 'price'|'p1'|'p2'|'p3'|'p4'|'p5'|'pos'|'neg'|'warn'|'info'|'neutral';
type Num = number | null;
```

### K1 `series_panels`: extend the existing kind (39 = 28 line/indicator + 11 candle)

Covers indicators, candles + volume, Fibonacci, worked examples. Additions are all optional, so the current Ch1 JSON stays valid:

```ts
interface SeriesPanelsModel {
  kind: 'series_panels';
  x: { start: number; end: number; ticks?: string[]; shade?: { from: number; to: number; tone: Tone }[] }; // C5L4-g6, C1L9-g3 zones
  marks: { i: number; label: string }[];                       // existing
  points?: { i: number; panel: number; value: number; tone: Tone; shape?: 'dot'|'ring'; label?: string;
             pos?: 'above'|'below'|'left'|'right' }[];          // buy/sell dots, crosses, bounce dots
  panels: Panel[];
  axes?: false;                                                 // thumbnails C4L1-g4, C4L4-s1..s4
}
interface Panel {
  title: string; bounds?: [number, number]; ticks?: number[]; digits?: number; zero?: true; nonnegative?: true;
  levels?: { value: number; role: 'buy'|'sell'|'neutral'|'avg'; label?: string }[];   // RSI 70/30, avg vol, stop
  zones?: { from: number; to: number; tone: Tone; label?: string }[];                    // OB/OS, S/R zone, buy zone
  band?: { upper: Num[]; lower: Num[] };                                                 // existing (Bollinger)
  fill_between?: { a: number; b: number; above: Tone; below: Tone };                     // C5L2-g1 (series idx)
  candles?: { open: Num[]; high: Num[]; low: Num[]; close: Num[] };                      // NEW: OHLC panel
  series: { name: string; role: Tone; dash?: true; values: Num[] }[];                    // existing (min 0 when candles)
  bars?: { name: string; values: Num[]; colors: ('pos'|'neg'|'neutral')[] };            // existing (volume, histogram)
  segments?: { from: [number, number]; to: [number, number]; tone: Tone; dash?: true; extend?: number }[]; // trend lines (x = index)
  fib?: { lo: { i: number; v: number }; hi: { i: number; v: number }; dir: 'up'|'down';
          levels: number[]; zone?: [number, number] };                                   // C4L9
  notes?: { i: number; value: number; text: string; tone?: Tone }[];                     // "Dải thắt chặt", "Cốc"
}
```

Side-by-side variants (C4L5-g3/g5, C4L8-g3, C4L9-g3, C4L2-g3, C4L3-g4, C4L4-g2) use **K0 `compare`**:

```ts
{ kind: 'compare'; items: { title: string; tone?: Tone; model: ChartModel }[] }
```

This generalises the existing `panels` wrapper, which only accepts category models.

### K2 `category`: extend `grouped|line|stacked` (16)

```ts
{ kind: 'grouped'|'line'|'stacked'; title: string; labels: string[]; unit: string;
  series: { name: string; values: Num[]; tone?: Tone; dash?: true }[];
  orientation?: 'v'|'h';                         // C5L4-g4
  value_labels?: 'all'|'last'|'none';            // most Ch1/Ch5 bars
  threshold?: { value: number; label: string; tone_at_or_above?: Tone; tone_below?: Tone }; // C5L2-m4, C5L4-g2/g4, ROIC 10%
  end_labels?: true;                             // C1L1-g1, C5L1-g3
  bounds?: [number, number]; ticks?: number[];   // ± axes (C1L4-g4)
  caption_value?: string;                        // C4L6-g0 "RSI ≈ 81"
  animate?: 'draw';                              // C1L1-g1 (respect prefers-reduced-motion)
}
```

Members: C1L1-g1, C1L4-g4, C1L5-g2, C1L10-g2, L1-g1, C5L1-g1 (via `panels`), C5L1-g2, C5L1-g3, C5L2-m1, C5L2-m4, C5L3-g2 (`panels`), C5L4-g2 (`panels`), C5L4-g4, C4L7-g4 (`compare`), C4L6-g0 (`compare`). C5L2-m2/m3 can go here as an 84-point line with `band`. I counted them under K1.

### K3 `segment_bar`: horizontal stacked / proportion rows (10)

```ts
{ kind: 'segment_bar'; unit?: string; max: number;
  rows: { label: string; sub?: string; total?: { text: string; tone?: Tone };
          segments: { value: number; label?: string; sub?: string; tone: Tone; ghost?: true }[] }[];
  brackets?: { row: number; from: number; to: number; label: string; tone: Tone }[];   // C5L2-g2
  legend?: { tone: Tone; label: string }[];
  pictogram?: { per_unit: number; icon: 'banknote' } }                                 // C1L1-g2
```

Members: C1L1-a2, C1L1-g2, C1L4-g3, C1L7-g2, C1L7-g3, C1L7-g4, C1L10-g3, L5-g1, L6-g1, C5L2-g2.

### K4 `scale`: 1-D axis with zones and markers (3)

```ts
{ kind: 'scale'; orientation: 'h'|'v'; domain: [number, number]; ticks?: { v: number; label: string }[];
  gradient?: Tone[]; zones?: { from: number; to: number; tone: Tone; label?: string }[];
  ends?: [string, string];
  markers: { v: number; label: string; sub?: string; tone: Tone; side?: 'a'|'b' }[] }
```

Members: C1L3-g2, C1L6-g5, C5L3-g4.

### K5 `schematic`: value-domain sketch (20)

For hand-drawn didactic shapes: trends, S/R, divergence, Elliott, cycles, payoff, scatter. Coordinates are in a declared domain (default 0..100 × 0..100, y up), so the drawing scales responsively.

```ts
{ kind: 'schematic'; domain?: { x: [number, number]; y: [number, number] };
  axes?: { x?: { title?: string; ticks?: { v: number; label: string }[] }; y?: { title?: string; ticks?: { v: number; label: string }[] } };
  panels?: { title?: string; y: [number, number] }[];          // stacked price/indicator (C4L6-g4, C4L7-g5)
  layers: (
    | { t: 'zone'; x?: [number, number]; y?: [number, number]; tone: Tone; label?: string; midline?: true }
    | { t: 'line'; pts: [number, number][]; tone: Tone; width?: 1|2|3|4; dash?: true; colors?: Tone[] }  // per-segment colours: Elliott, C1L8-g1
    | { t: 'segment'; from: [number, number]; to: [number, number]; tone: Tone; dash?: true }
    | { t: 'point'; at: [number, number]; tone: Tone; shape?: 'dot'|'ring'; size?: 's'|'m'|'l'; label?: string; pos?: 'above'|'below'|'left'|'right' }
    | { t: 'tag'; at: [number, number]; text: string; tone: Tone; pos: 'above'|'below' }   // Elliott circled labels
    | { t: 'bracket'; x: [number, number]; y: number; label: string; tone: Tone }
    | { t: 'bars'; x: number[]; h: number[]; tones: Tone[]; base: number }                // C1L9-g1 volume
    | { t: 'text'; at: [number, number]; text: string; tone?: Tone; anchor?: 'start'|'middle'|'end' }
  )[];
  alt: string }
```

Analytic curves (cos, 1/n, payoff, the C1L9-g1 path) are sampled into `pts` at import, about 50–140 points each.

Members:
- Trend and S/R (6): C4L2-g1 (as `compare`), C4L2-g2, C4L2-g4, C4L2-g5, C4L3-g1, C4L3-g3.
- Divergence (2): C4L6-g4, C4L7-g5. These share one geometry, so the importer can emit both from one template with `indicator: 'RSI'|'MACD'`.
- Elliott (4): C4L10-g1, C4L10-g2, C4L10-g3, C4L10-g4.
- Chapter 1 (8): C1L5-g3, C1L6-g3, C1L6-g4, C1L8-g1, C1L8-g2, C1L9-g1, C1L9-g2, C1L10-g1. C1L9-g3 (real VN-Index data) is counted under K1.

### K6 `gantt` and `milestones` (5)

Replaces the existing `timeline` kind for these charts, whose integer-label rows cannot express multiple segments per row.

```ts
{ kind: 'gantt'; domain: [number, number]; tick_format: 'hhmm'|'day';
  ticks: { v: number; label: string }[]; columns?: { label: string; dim?: true }[];      // C1L4-g1 weekday columns
  rows: { name: string; segments: { from: number; to: number; label?: string; tone: Tone; muted?: true }[];
          markers?: { at: number; text: string; tone: Tone }[]; note?: string }[];
  highlight?: { from: number; to: number }; legend?: { tone: Tone; label: string }[] }
{ kind: 'milestones'; points: { at: number; title: string; detail?: string[]; tone: Tone }[];
  spans?: { from: number; to: number; label: string; tone: Tone; side: 'above'|'below' }[];
  brace?: { from: number; to: number; label: string } }
```

`gantt`: C1L3-g3, C1L4-g1, L10-g1. `milestones`: C1L7-g1, L9-g1.

### K7 `candle_glyphs`: axis-less candle illustrations (8)

```ts
{ kind: 'candle_glyphs'; domain: [number, number];
  groups: { title?: string; candles: { o: number; h: number; l: number; c: number; label?: string; size?: 's'|'m'|'l' }[];
            annotate?: 'ohlc' }[];
  join?: string }    // "=" for C4L1-g3
```

Members: C4L1-g1, C4L1-g2, C4L1-g3, C4L1-p1 to C4L1-p5. Candle tone rule: `c >= o ? pos : neg`, the same as the mockup.

### K8 `flow`: boxes and arrows with fixed layouts (7)

```ts
{ kind: 'flow'; layout: 'row'|'column'|'cycle';
  header?: { text: string; tone: Tone };                                        // C1L2-g3 UBCKNN band
  nodes: { id: string; title: string; sub?: string; value?: string; tone?: Tone; emph?: true;
           children?: { title: string; sub?: string; tone?: Tone }[];            // fork (C1L2-g2), child below (C1L2-g3)
           caption?: string }[];
  edges?: 'sequential' | { from: string; to: string; label?: string }[] }
```

Members: C1L2-g2, C1L2-g3, C1L8-g3 (`compare` of 2 columns), C1L8-g4 (cycle), C1L10-g4, C5L3-g3, C5L4-g0. C1L10-g4, C5L3-g3 and C5L4-g0 could also be the existing `steps` block.

### Text blocks rather than charts (8)

These are cards, tables and lists drawn in SVG. As real blocks they are accessible and translatable, and they reflow on phones.
- `kv_card`: C1L3-g1, C1L4-g2.
- Existing `table`: C1L3-g4 (two tables, buy and sell).
- `checklist`, read-only: C1L10-g5.
- `formula`, rows of `a ÷ b = c` with label/value cells: C5L2-g3.
- `tiles` (big glyph + title + sub, optional group brackets): C4L9-g1, C5L3-g1, C5L4-g1.

### Generic `svg_diagram` or static assets (11), plus icons (3)

These are one-off pictures where a semantic spec would cost more than it gives. Two options:
- A tiny sanitised **`svg_diagram`** spec in a fixed viewBox: `{ viewBox: [w, h], shapes: ({t: 'rect'|'circle'|'ellipse'|'path'|'line'|'text', ..., tone})[], alt }`, rendered with tone classes so it themes in light and dark.
- A static themed SVG asset.

Members:
- C1L1-a1, C1L1-a3, C1L1-a4, C1L1-a5 (illustrations).
- C1L2-g1 (primary vs secondary market), C1L2-g4 (VN30 dot cloud; decorative LCG radii, so freeze or simplify).
- C1L5-g1 (hub), C1L6-g1 (fund), C1L6-g2 (ETF basket).
- L1-g2 (funnel), L3-g1 (concentric half-rings).

Icons C1L1-ic-ket, C1L1-ic-tk and C1L1-ic-ck become **Lucide** (`Vault`, `Landmark`, `ChartLine`), per the web DESIGN rule.

### Counts (final assignment, sums to 129)

| Kind | Count | Ch1 | Ch2 | Ch4 | Ch5 |
|---|---|---|---|---|---|
| K1 `series_panels`, line/indicator (incl. C5L2-m2, m3) | 28 | 1 | 0 | 21 | 6 |
| K1 `series_panels`, candles (+volume) | 11 | 0 | 0 | 11 | 0 |
| K2 `category` | 15 | 4 | 1 | 2 | 8 |
| K3 `segment_bar` | 10 | 7 | 2 | 0 | 1 |
| K4 `scale` | 3 | 2 | 0 | 0 | 1 |
| K5 `schematic` | 20 | 8 | 0 | 12 | 0 |
| K6 `gantt` / `milestones` | 5 | 3 | 2 | 0 | 0 |
| K7 `candle_glyphs` | 8 | 0 | 0 | 8 | 0 |
| K8 `flow` | 7 | 5 | 0 | 0 | 2 |
| Text blocks (`kv_card`, `table`, `checklist`, `formula`, `tiles`) | 8 | 4 | 0 | 1 | 3 |
| `svg_diagram` / static asset | 11 | 9 | 2 | 0 | 0 |
| Lucide icons | 3 | 3 | 0 | 0 | 0 |
| **Total** | **129** | **46** | **7** | **55** | **21** |

Wrapper usage:
- `compare` (side-by-side) is needed by 13 ids: C4L2-g1, C4L2-g3, C4L3-g4, C4L4-g2, C4L5-g3, C4L5-g5, C4L6-g0, C4L6-g4, C4L7-g4, C4L7-g5, C4L8-g3, C4L9-g3, C1L8-g3.
- `panels` (stacked category) is needed by 3: C5L1-g1, C5L3-g2, C5L4-g2.

New renderers needed: candles inside `series_panels`, `compare`, `segment_bar`, `scale`, `schematic`, `gantt`, `milestones`, `candle_glyphs`, `flow`, plus the `tiles`, `formula`, `kv_card` and `checklist` blocks. About 8 components; most category and indicator charts reuse existing code.

## 3. Procedural data to freeze at import

Port these helpers **verbatim** into an importer module, for example `backend/scripts/academy-import/v32-charts.ts`, and write the values into `charts.vi.json` at 4 decimals (Ch1 already uses 4).

| Helper (script line) | Definition | Used by |
|---|---|---|
| LCG (182, 858, 902) | `seed=(seed*9301+49297)%233280; r=seed/233280` | C1L2-g4 (seed 7, decorative), C4L1-g4 (seed 11). C4L2's `series()` at line 902 is **dead code**: C4L2-g3 uses inline arrays |
| `rng(seed)` mulberry32-style (1078) | `seed=seed+0x6D2B79F5\|0; t=Math.imul(seed^seed>>>15,1\|seed); t=t+Math.imul(t^t>>>7,61\|t)^t; return ((t^t>>>14)>>>0)/2^32` | all `series`, `genVar`, `path`, plus C5L2-g1, m2, m3, C5L3-g2, C5L4-g3, C5L4-g5, C4L6-g5/C4L7-g6 noise |
| `series(n,seed,f,noise)` (1080) | AR(1) noise `e=e*.55+(r()-.5)*noise; out=f(i)+e` | C4L5-g1…g6, C4L6-g1/g2/g3, C4L7-g1/g2/g3, C4L8-g1/g3/g4, C5L4-g6 |
| `genVar(n,seed,f,amp)` (1374) | same with `amp(i)` | C4L8-g2 |
| `path(segs,start,seed,nz)` (1450; inline in C5L4) | linear legs `v+=d/n` + AR(.5) noise | C4L9-g2/g3/g4, C5L4-g3, C5L4-g5 |
| `sma(a,n)` (1079) | simple mean, null before n−1 | MA20/50/200, SMA10/30, MA50, Bollinger mid |
| `rsi(a,14)` (1167) | Wilder, seed = mean gain/loss of the first 14; `l\|\|1e-9` guard | C4L6-g1, g2, g3, g5 |
| `ema(a,n)` (1271) | k=2/(n+1), **seeded with the first value** (differs from `ch1-math.ts`) | C4L7-* MACD 12/26/9 (`macdOf`, line 1272) |
| `bands(p,20,2)` (1372) | SMA20 ± 2·σ (population) | C4L8-* |
| `crosses(a,b)` (1094), `crossList(M)` (1290), RSI dot state machine (1184) | derived marks | C4L5-g5/g6, C4L7-g3, C4L6-g2 |

Derived values to pin in a golden test (I computed them by running the mockup):
- C4L6-g5: k=119 (RSI 42.42), e=120 (RSI 50.16).
- C4L7-g6: e=124 (MACD 0.342).
- C4L9-g4: a=9, b=44, k=59, e=60, retracement 0.6000.
- C5L1-g3: lump sum +5% (5.4999 shown as "+5%"), DCA +36%.
- C5L2-m2: mean "14,3", current "12,0". C5L2-m3: mean "1,8", current "1,6".
- C5L3-g2 CAGR labels: +12, +13, +11, +12 %/năm.
- C4L6-g0 captions: RSI ≈ 81 / 50 / 19.
- L1-g1 end values: 51 / 23.
- C1L1-g1 end values: 74 / 179 / 308 triệu.
- Also check the C5L1-g2 data against its prose: 1.070 CCQ, 16.822, 26,75 triệu, 48,6%.

Sharing and windowing:
- Shared datasets: C4L6-g1 = C4L6-g2 price (seed 5, sin/9). C4L7-g1 = C4L7-g2 (seed 5, sin/11). C4L6-g5 and C4L7-g6 use the same `pullback150` path.
- The mockup computes indicators over the full history and draws only a window (`from..to`). Export only the window, but compute over full history so MA200 and MA50 are defined, as Ch1's `x.start/end` already does.
- Estimated size: about 10–15k numbers, under 120 KB of JSON for Ch4–5.

## 4. Mockup defects and caveats to carry over

1. **C1L1-g2** shows about 8 notes instead of 7.4 (line 62 `i>=solid` plus the partial overlay at index 7). Fix it in the spec as 7 full notes plus 0.4.
2. **C1L1-g1** draw-in animation is wired with `getTotalLength` and an IntersectionObserver. Keep it optional and honour `prefers-reduced-motion`.
3. Labels disappear on narrow segments (C1L3-g3 and L10-g1 when width < 60–70px) and the legend compensates. The React `gantt` needs the same fallback at narrow width.
4. `window._r1`, `_r3`, `_g3`–`_g6` are debug globals. No prose reads them; the numbers in the prose are hard-coded.
5. Mixed decimal styles inside the drawings ("T+2.5", "1,65k") follow vi-VN in most places but not all. Normalise with the existing `formatValue` / `formatCompact`.
6. Hex values map to tokens as follows:
   - #2bb886, #7fe0bd, #3fc495, #199e70 → `pos`.
   - #e66767, #f2a0a0 → `neg`.
   - #3987e5, #249bec, #5db8ff, #7fb8ff → `p1`/`info`.
   - #dfb969, #e8c77d, #c99a35, #e8a33d, #f0d48f → `warn`/`p2`.
   - #d95926, #f0a07a → `p5`.
   - #b48cf2, #b77ee6, #c9a0f0 → `p4`.
   - #6d8399, #95a9be, #c9d6e4 → `p3`/`price`.
   - #3fc6e0, #6fd6ea → `info` (cyan).
   - Surfaces #121e2c, #172231 and borders #24344a, #1f2b3a → `bg-card` / `border`.
