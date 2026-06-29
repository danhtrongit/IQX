# IQX — Sản phẩm "Người quản lý danh mục"
### Spec bàn giao kỹ thuật · v1.0

> Báo cáo phân tích danh mục tự động, viết bằng giọng một người quản lý danh mục riêng, dựa trên danh mục mô phỏng (paper trading) của người dùng trên iqx.vn.

File đi kèm:
- `bao-cao-danh-muc-day-du.html` — mẫu giao diện đầy đủ (design reference, đã có data giả để xem layout).
- `IQX-Danh-Muc-SystemPrompt.md` — system prompt cho tầng sinh nội dung AI.

---

## 0. Nguyên tắc kiến trúc cốt lõi (đọc trước tiên)

Hệ thống có **hai tầng tách bạch tuyệt đối**:

| Tầng | Vai trò | Công nghệ |
|---|---|---|
| **Tầng định lượng** (deterministic) | Tính MỌI con số: hiệu suất, độ nhạy, tương quan, quy kết, tỷ trọng, điểm số. | Python/Node thuần, không AI |
| **Tầng diễn giải** (AI) | CHỈ đọc số đã tính rồi viết thành lời tiếng Việt. Không tính, không bịa số. | LLM (DeepSeek/Gemini) |

**Luật vàng:** mọi con số hiển thị trên báo cáo đến từ tầng định lượng. LLM nhận số đã tính trong context và chỉ được phép *nhắc lại* chúng, tuyệt đối không tự suy ra hay làm tròn lại. Nếu LLM cần một con số không có trong input → nó phải bỏ qua, không được tự chế. Đây là điều kiện sống còn cho uy tín "fund-grade".

Luồng tổng thể:

```
[Trigger] → [Kiểm tra chặn theo ngày] → [Load data]
   → [Tầng định lượng: tính 8 lớp → Analysis JSON]
   → [Lọc độ tin cậy dữ liệu]
   → [Chọn khuôn insight]
   → [Dựng context cho LLM]
   → [LLM sinh Narrative JSON (chỉ chữ)]
   → [Render: ghép Analysis JSON (số/chart) + Narrative JSON (prose) vào template HTML]
   → [Lưu snapshot cho kỳ sau so sánh]
```

---

## 1. Dữ liệu đầu vào cần có

### 1.1 Danh mục nắm giữ hiện tại (bắt buộc)
Lấy từ hệ thống paper trading hiện có.

```json
{
  "portfolio_id": "A-0412",
  "as_of": "2026-06-23",
  "cash": 49000000,
  "positions": [
    {
      "ticker": "HPG",
      "quantity": 4000,
      "avg_cost": 19500,
      "current_price": 26750,
      "sector": "Thép",
      "market_cap_bn": 95000
    }
  ]
}
```

### 1.2 Lịch sử giao dịch ảo (bắt buộc — cho hành vi, quy kết, hiệu suất TWR)
```json
{
  "transactions": [
    { "ticker": "HPG", "side": "BUY",  "quantity": 4000, "price": 19500, "ts": "2025-12-15T09:30:00+07:00" },
    { "ticker": "HPG", "side": "SELL", "quantity": 1500, "price": 25000, "ts": "2026-06-10T10:00:00+07:00" }
  ]
}
```

### 1.3 Giá lịch sử theo ngày — mỗi mã (bắt buộc — cho độ nhạy, biến động, tương quan, lỗ sâu nhất)
OHLCV daily, tối thiểu ~250 phiên (1 năm) nếu có. **Đây là dữ liệu quyết định độ tin cậy** (xem §4).
```json
{ "ticker": "HPG", "bars": [ { "date": "2026-06-20", "close": 26500, "volume": 12000000 } ] }
```

### 1.4 Chuỗi chỉ số tham chiếu (bắt buộc)
- **VN-Index** daily close — chuẩn chính.
- **Chỉ số ngành** (ngân hàng, thép, chứng khoán, BĐS...) daily close — cho lớp 03 và so chuẩn ngành (lớp 07). Nếu chưa có chỉ số ngành chính thức, tự dựng index trung bình theo vốn hóa các mã trong ngành.

### 1.5 Dữ liệu cơ bản — mỗi mã (bắt buộc cho lớp 07)
```json
{ "ticker": "HPG", "pe": 9.8, "pb": 1.4, "roe": 0.16, "dividend_yield": 0.02, "sector": "Thép" }
```

### 1.6 Tỷ trọng ngành của VN-Index (bắt buộc cho lớp 03)
```json
{ "as_of": "2026-06-23", "sector_weights": { "Ngân hàng": 0.38, "Thép": 0.05, "Công nghệ": 0.04 } }
```

### 1.7 Snapshot báo cáo kỳ trước (bắt buộc từ kỳ 2 — cho tiến bộ)
Lưu lại sau mỗi lần sinh báo cáo. Xem schema §7.

---

## 2. Tầng định lượng — 8 lớp & công thức

Tất cả dùng **log return hoặc simple daily return** nhất quán (khuyến nghị simple: `r_t = close_t / close_{t-1} - 1`). Lookback mặc định **120 phiên** cho các chỉ số rủi ro (có thể cấu hình).

### Lớp 01 — Tổng quan
```
position_mv_i   = quantity_i * current_price_i
nav             = Σ position_mv_i + cash
weight_i        = position_mv_i / nav
cost_basis_i    = quantity_i * avg_cost_i
unrealized_pnl_i= position_mv_i - cost_basis_i
cash_pct        = cash / nav
total_unrealized_pnl = Σ unrealized_pnl_i
total_return_simple  = total_unrealized_pnl / Σ cost_basis_i
```

### Lớp 02 — Hiệu suất so với chuẩn
Dựng chuỗi NAV danh mục theo ngày (từ lịch sử giao dịch + giá đóng cửa). Ưu tiên **Time-Weighted Return (TWR)** để loại ảnh hưởng nạp/rút:
```
# Chia chuỗi thành các sub-period giữa các lần có cash flow (nạp/rút/mua/bán)
sub_period_return_k = (NAV_end_k - flow_k) / NAV_start_k - 1
twr = Π(1 + sub_period_return_k) - 1

benchmark_return = vnindex_end / vnindex_start - 1   # cùng khoảng thời gian
excess_return    = twr - benchmark_return            # đơn vị: điểm %
max_drawdown     = min over t of (NAV_t / running_max(NAV)_t - 1)
```
> v1 có thể dùng `total_return_simple` thay TWR nếu chưa dựng được chuỗi NAV. Ghi rõ method trong output.

### Lớp 03 — Phân bổ & độ lệch
```
port_sector_weight_s = Σ_{i in s} weight_i
active_weight_s      = port_sector_weight_s - vnindex_sector_weight_s   # điểm %
overweight_ratio_s   = port_sector_weight_s / vnindex_sector_weight_s   # "gấp X lần"
```

### Lớp 04 — Tập trung
```
top1            = max(weight_i)
top3            = Σ top 3 weight_i
hhi             = Σ (weight_i)^2          # chỉ tính phần cổ phiếu, loại cash
effective_n     = 1 / hhi                 # "số mã hiệu quả"
largest_sector  = max(port_sector_weight_s)
```

### Lớp 05 — Rủi ro & tương quan
Dùng daily returns trên lookback window. **Chỉ tính cho mã đủ độ tin cậy** (§4).
```
# Chuỗi return danh mục = Σ weight_i * r_i,t  (weight tại đầu kỳ hoặc current, cấu hình)
beta_portfolio  = Cov(r_port, r_vnindex) / Var(r_vnindex)
volatility      = stdev(r_port) * sqrt(252)
tracking_error  = stdev(r_port - r_vnindex) * sqrt(252)
corr_matrix[i][j] = Pearson(r_i, r_j)     # ma trận tương quan từng cặp
beta_i          = Cov(r_i, r_vnindex) / Var(r_vnindex)  # độ nhạy từng mã
```
> **VaR đã bị loại bỏ có chủ đích.** Thay bằng stress-test ở tầng render (§6). Không tính, không hiển thị VaR.

### Lớp 06 — Nguồn gốc lợi nhuận (quy kết)
v1 — contribution đơn giản:
```
contribution_i      = unrealized_pnl_i (+ realized_pnl_i nếu tính cả đã chốt)
contribution_pct_i  = contribution_i / total_pnl
```
> Nâng cấp tương lai (ghi chú, không làm v1): Brinson tách allocation effect vs selection effect.

### Lớp 07 — Chất lượng & so chuẩn ngành
```
w_pe   = Σ weight_i * pe_i      # bình quân gia quyền theo tỷ trọng
w_pb   = Σ weight_i * pb_i
w_roe  = Σ weight_i * roe_i
w_div  = Σ weight_i * dividend_yield_i

# So chuẩn ngành CÓ ĐIỀU KIỆN: chỉ chạy khi một ngành > SECTOR_BENCH_THRESHOLD (vd 25%)
if port_sector_weight_s > 0.25:
    your_sector_return    = return của rổ mã thuộc ngành s trong danh mục (theo kỳ)
    industry_avg_return   = return chỉ số ngành s cùng kỳ
    sector_gap            = your_sector_return - industry_avg_return  # điểm %
```

### Lớp 08 — Kỷ luật & hành vi
Từ lịch sử giao dịch:
```
avg_holding_days     = trung bình (ngày bán - ngày mua) các vị thế đã đóng
turnover             = tổng giá trị giao dịch / NAV bình quân (theo kỳ)
losing_positions     = đếm vị thế đang lỗ
held_loss_periods_i  = số kỳ một vị thế lỗ vẫn được giữ
# Tín hiệu disposition effect:
avg_hold_winners_sold = bình quân ngày giữ các mã LÃI đã bán
avg_hold_losers_held  = bình quân ngày giữ các mã LỖ đang giữ
disposition_flag      = avg_hold_losers_held > avg_hold_winners_sold * 1.5
```

---

## 3. Điểm sức khỏe (5 trụ)

Mỗi trụ chấm 1–5 bằng cách map metric qua ngưỡng. Ví dụ bảng ngưỡng (cấu hình được, tinh chỉnh theo dữ liệu thật):

| Trụ | Metric chính | 5 ⭐ | 3 ⭐ | 1 ⭐ |
|---|---|---|---|---|
| Hiệu suất | excess_return | > +5đ% | −2 đến +2đ% | < −8đ% |
| Rủi ro | beta_portfolio | 0,8–1,1 | 1,2–1,3 | > 1,5 |
| Phân tán rủi ro | effective_n & max_corr | eff_n>8, corr<.5 | eff_n~5 | eff_n<3 hoặc corr>.8 |
| Chất lượng | w_roe & w_pe | roe>18%, pe<12 | roe~12% | roe<8% |
| Kỷ luật | disposition_flag & turnover | không lỗ ôm lâu | 1 mã | nhiều mã + flag |

```
overall_score = round(mean(5 pillar scores), 1)   # vd 3,5
```

---

## 4. Tầng độ tin cậy dữ liệu (bảo vệ uy tín)

Trước khi tính rủi ro, mỗi mã được gắn cờ tin cậy:

```python
def data_confidence(ticker_bars, lookback=120):
    n = len(ticker_bars)
    avg_value_traded = mean(close * volume over last 20 bars)
    has_history  = n >= 120                      # đủ lịch sử
    is_liquid    = avg_value_traded >= 2_000_000_000   # ngưỡng thanh khoản (cấu hình)
    complete     = no_gaps(ticker_bars)          # không thiếu phiên bất thường
    return has_history and is_liquid and complete
```

**Quy tắc khi `False`:**
- KHÔNG tính/hiển thị beta, tương quan, volatility cho mã đó.
- VẪN tính tỷ trọng, giá trị, lãi/lỗ (những thứ không cần chuỗi giá dài).
- Loại mã đó khỏi các aggregate rủi ro, ghi rõ trong Analysis JSON: `"excluded_from_risk": true, "reason": "low_liquidity_short_history"`.
- Tầng AI sẽ diễn giải thành một đoạn "một mã tôi chưa chấm điểm" (xem system prompt) — biến chỗ trống thành nhận định, không phải lỗi.

---

## 5. Thư viện khuôn insight (chống nhàm qua các kỳ)

Engine đánh giá tất cả khuôn, mỗi khuôn có điều kiện kích hoạt + điểm `severity`. Chọn **1–2 khuôn severity cao nhất**, và đảm bảo có ít nhất một khuôn "tích cực" đủ điều kiện được ưu tiên xen kẽ để không kỳ nào cũng toàn tin xấu.

| id | Tên | Điều kiện kích hoạt | severity |
|---|---|---|---|
| `hidden_corr` | Tương quan ẩn | tồn tại cặp i,j: corr>0.75 và (w_i+w_j)>0.2 | (w_i+w_j)*corr |
| `profit_concentration` | Nguồn lãi tập trung | max(contribution_pct) > 0.6 | max_contribution_pct |
| `sector_tilt` | Lệch ngành | overweight_ratio_s > 3 | overweight_ratio_s |
| `holding_losers` | Ôm lỗ | disposition_flag = true | held_loss_periods_max |
| `cash_dry` | Tiền mặt cạn | cash_pct < 0.05 | 0.05 - cash_pct |
| `fake_cheap` | Giả rẻ | w_pe thấp nhưng do 1 mã kéo | concentration của mã rẻ |
| `momentum_fade` | Đà suy yếu | nhiều mã mất xu hướng tăng | số mã / tổng |
| `beta_win` | Thắng nhờ thị trường | total_return>0 nhưng |excess|<1đ% | 1 - |excess| |
| `over_fragmented` | Quá phân mảnh | n>15 và đa số w_i<0.03 | n |
| `healthy_focus` | **Tập trung lành mạnh** (tích cực) | tập trung cao nhưng vào mã chất (roe cao, pe hợp lý) | chất lượng |

Output cho tầng AI:
```json
{ "selected_insights": [
  { "id": "hidden_corr", "data": { "pair": ["TCB","MBB"], "corr": 0.82, "combined_weight": 0.344 } }
]}
```

---

## 6. Chuẩn hiển thị số (áp dụng toàn hệ thống)

| Loại | Ký hiệu | Ví dụ |
|---|---|---|
| Tỷ suất sinh lời, lãi/lỗ | `%` có dấu +/− | `+13,0%` `−12,0%` |
| Chênh lệch hai tỷ lệ (vượt/kém chuẩn) | `điểm %` có dấu | `+5,0 điểm %` |
| Tỷ trọng, cơ cấu | `%` không dấu | `25,0%` |
| Độ nhạy với thị trường (beta) | số thuần | `1,25` |
| Tương quan | số thuần 2 lẻ | `0,82` |
| Giá/lợi nhuận, Giá/sổ sách | số thuần | `11,2` |
| Sinh lời vốn chủ (ROE), cổ tức | `%` | `18,0%` |
| Điểm sức khỏe | `x/5` | `3,5/5` |

- **Dấu thập phân: phẩy** (chuẩn Việt). Ngăn nghìn: dấu chấm. `534.000.000 ₫`.
- Số biến thiên (lãi/lỗ, vượt chuẩn, thay đổi) **luôn có dấu**. Số trạng thái (tỷ trọng, định giá) không cần dấu.
- Một chữ số lẻ cho tỷ suất/tỷ trọng; hai chữ số lẻ cho tương quan/độ nhạy.

**Từ vựng chuẩn hóa (tránh viết tắt tiếng Anh trong báo cáo):**

| Khái niệm | Dùng trong báo cáo |
|---|---|
| alpha / excess return | vượt hiệu suất thị trường |
| beta | độ nhạy với thị trường |
| volatility | mức độ biến động |
| drawdown | mức lỗ sâu nhất |
| diversification | phân tán rủi ro |
| correlation | mức tương quan / vận động cùng nhịp |
| attribution | nguồn gốc lợi nhuận |
| P/E | giá trên lợi nhuận |
| ROE | sinh lời trên vốn chủ |
| VaR | (không dùng — thay bằng bài kiểm tra sức chịu đựng) |

### Stress-test (thay VaR) — render phía client
Tương tác, người dùng chọn mức giảm VN-Index `d ∈ {5,10,15}%`:
```
expected_loss_pct = d * beta_portfolio
expected_loss_vnd = nav * expected_loss_pct / 100
```
Hiển thị kèm một mốc lịch sử có thật ("như nhịp giảm tháng 4/2025") để tạo cảm giác cụ thể.

---

## 7. Logic sinh báo cáo & chặn theo ngày

### Quy tắc chặn
- **Một ngày giao dịch → một báo cáo.** Trong cùng ngày, mọi lần bấm trả về đúng bài đã sinh (cache). Không gọi LLM lại.
- Mốc "ngày mới" tính theo **giá đóng cửa phiên gần nhất** (bấm lúc nào trong ngày cũng dựa trên cùng một mốc giá → kết quả ổn định).
- **Cuối tuần/nghỉ lễ:** gói vào bài của phiên cuối tuần trước đó (bấm thứ Bảy/CN vẫn là bài thứ Sáu). Qua phiên mới mới đổi.

### Phân nhánh nội dung khi sinh bài mới
```
if no_previous_report:
    mode = "first"          # mẫu kỳ 1: bỏ khối "So với kỳ trước"
elif holdings_changed(current, last_snapshot):
    mode = "full_changed"   # bài đầy đủ + đối chiếu việc đã gợi ý kỳ trước
else:
    mode = "light_unchanged"# giữ nhận định cốt lõi, cập nhật theo giá mới + mốc theo dõi
```
Định nghĩa `holdings_changed`:
```python
def holdings_changed(cur, prev):
    if set(cur.tickers) != set(prev.tickers): return True      # thêm/bớt mã
    for t in cur.tickers:
        if abs(cur.weight[t] - prev.weight[t]) > 0.03: return True  # lệch > 3 điểm %
    return False    # chỉ giá nhích nhẹ → không tính là đổi
```

### Snapshot lưu sau mỗi báo cáo (cho kỳ sau)
```json
{
  "report_id": "A-0412-2026-06-23",
  "date": "2026-06-23",
  "holdings": [ { "ticker":"HPG","weight":0.16 } ],
  "scores": { "overall":3.5, "performance":4, "risk":3, "diversification":3, "quality":4, "discipline":2 },
  "recommended_actions": [
    { "id":"sell_vnd", "text":"Đặt ngưỡng dừng cho VND", "status":"open" },
    { "id":"raise_cash", "text":"Nâng tiền mặt lên 15%", "status":"open" }
  ],
  "watch_conditions": [ { "id":"hpg_support", "desc":"HPG thủng hỗ trợ" } ]
}
```
Kỳ sau, engine so `recommended_actions` cũ với danh mục mới để biết người dùng đã làm chưa → feed vào AI cho phần "So với kỳ trước".

---

## 8. Analysis JSON — hợp đồng dữ liệu giữa hai tầng

Đây là output của tầng định lượng, vừa để render chart/số, vừa là input cho LLM. **LLM chỉ được dùng số trong object này.**

```json
{
  "meta": { "portfolio_id":"A-0412", "date":"2026-06-23", "mode":"full_changed", "period":"kỳ 3" },
  "overview": {
    "nav":534000000, "cash_pct":0.092, "n_positions":7,
    "total_return":0.107, "total_pnl":52000000, "holding_months":7,
    "positions":[
      {"ticker":"HPG","sector":"Thép","weight":0.16,"pnl":38000000,"low_confidence":false}
    ]
  },
  "performance": { "portfolio_return":0.107, "benchmark_return":0.072, "excess_return":0.035, "max_drawdown":-0.09, "method":"twr" },
  "allocation": [ {"sector":"Ngân hàng","weight":0.344,"benchmark":0.38,"active":-0.036} ],
  "concentration": { "top1":0.187, "top3":0.504, "effective_n":5.8, "largest_sector":0.344 },
  "risk": {
    "beta":1.25, "volatility":0.21, "tracking_error":0.08,
    "correlation":[ {"a":"TCB","b":"MBB","value":0.82} ],
    "excluded": [ {"ticker":"APG","reason":"low_liquidity_short_history"} ]
  },
  "attribution": [ {"ticker":"HPG","pnl":38000000,"pct":0.63} ],
  "quality": { "pe":11.4, "pb":1.6, "roe":0.18, "dividend":0.02,
    "sector_benchmark": {"sector":"Ngân hàng","your_return":0.09,"industry_return":0.14,"gap":-0.05} },
  "behavior": { "avg_holding_days":48, "losing_count":3, "disposition_flag":true,
    "worst_loser":{"ticker":"VND","pnl_pct":-0.15,"periods_held":3} },
  "scores": { "overall":3.5, "prev_overall":3.2,
    "pillars":{"performance":4,"risk":3,"diversification":3,"quality":4,"discipline":2} },
  "selected_insights": [ {"id":"sector_tilt","data":{"sector":"Thép","ratio":3.2,"weight":0.16}} ],
  "progress": {
    "prev_actions":[ {"id":"trim_hpg","done":true,"detail":"giảm 25%→16%"},
                     {"id":"sell_vnd","done":false} ]
  }
}
```

---

## 9. Narrative JSON — output của LLM

LLM trả về **chỉ chữ**, theo cấu trúc cố định để render ghép vào template:

```json
{
  "title": "Danh mục bạn khỏe lên, giờ là lúc chuẩn bị cho lúc xấu.",
  "verdict": "Một danh mục đang khỏe lên nhưng vẫn nghiêng về kịch bản thị trường tăng...",
  "lede": "Một câu trước khi đi vào chi tiết: ...",
  "progress_text": "Bạn đã làm đúng việc tôi gợi ý...",
  "layers": {
    "overview": "Danh mục vẫn giải ngân gần hết...",
    "performance": "Bạn vẫn vượt thị trường 3,5 điểm %...",
    "allocation": "...", "stress": "...", "risk": "...",
    "attribution": "...", "quality": "...", "behavior": "..."
  },
  "insight": { "label":"Điều bạn có thể chưa để ý", "text":"Bạn giữ hai mã ngân hàng..." },
  "low_data_note": "Với APG bạn mới thêm tuần trước, tôi chưa đưa con số rủi ro...",
  "actions": [
    {"title":"Dứt điểm cổ phiếu VND...","detail":"Kỳ thứ ba tôi nhắc..."}
  ],
  "watch": "Ba mốc tôi sẽ chú ý: ...",
  "closing": "Tổng kết: bạn đang đi đúng hướng..."
}
```

Render = template HTML (file mẫu) với:
- **Số & chart** ← Analysis JSON (`§8`)
- **Mọi đoạn văn** ← Narrative JSON (`§9`)

---

## 10. 4 nguyên tắc nội dung + checklist QA

Tầng AI phải tuân (đã encode trong system prompt). Sau khi sinh, chạy assert tự động:

1. **Tấm gương trung thực** — có đúng 1 cặp ghi-nhận ↔ nói-thẳng (khen liền chê).
2. **Điều chưa để ý** — có ≥1 insight gắn nhãn; nếu engine không chọn được khuôn nào → câu "danh mục khá rõ ràng, không có rủi ro ẩn".
3. **Hướng xử lý cụ thể** — ≤3 action, **mỗi action chứa ít nhất một con số/ngưỡng** (regex kiểm: action.detail phải match số).
4. **Tiến bộ** — từ kỳ 2: có `progress_text` đối chiếu việc cũ.

Guardrail bắt buộc:
- Kết bằng `closing` mang hướng đi, không phải nỗi lo (3 câu cuối phải chứa một hành động/khẳng định tích cực).
- Không phán chắc 100%: ưu tiên "tôi nghiêng về", "nhìn số liệu thì". Không câu "chắc chắn tăng/giảm".
- Không từ "khuyến nghị mua/bán" — chỉ "phân tích", "đề nghị cân nhắc". (Khung pháp lý: phân tích/giáo dục, không phải tư vấn được cấp phép.)

---

## 11. Gợi ý triển khai (cho vibe-code)

- **Tầng định lượng:** Python (`pandas`, `numpy`) là gọn nhất cho 8 lớp. Một module/lớp, mỗi hàm nhận data + trả một phần Analysis JSON. Test bằng danh mục mẫu trong file HTML.
- **Cache:** key = `portfolio_id + trading_date`. Hết hạn khi sang phiên mới.
- **Gọi LLM:** 1 lần/báo cáo. Input = system prompt + Analysis JSON + selected_insights + progress. Output = Narrative JSON. Đặt `temperature` thấp (0.4–0.6) cho nhất quán, ép trả JSON.
- **Render:** template engine (Jinja/React) nhận 2 JSON. Stress-test là JS thuần phía client (công thức §6), không cần gọi lại server.
- **Thứ tự build đề xuất:** (1) tầng định lượng + Analysis JSON với danh mục mẫu → (2) render tĩnh khớp file HTML → (3) cắm LLM sinh prose → (4) logic chặn ngày + snapshot → (5) thư viện insight + độ tin cậy dữ liệu.

---

## 12. Phụ lục — các hằng số cấu hình

```yaml
RISK_LOOKBACK_DAYS: 120
DATA_CONF_MIN_HISTORY: 120
DATA_CONF_MIN_AVG_VALUE_VND: 2000000000
SECTOR_BENCH_THRESHOLD: 0.25
CHANGED_WEIGHT_THRESHOLD: 0.03
HIDDEN_CORR_MIN: 0.75
PROFIT_CONCENTRATION_MIN: 0.60
SECTOR_TILT_RATIO_MIN: 3.0
CASH_DRY_MAX: 0.05
LLM_TEMPERATURE: 0.5
ANNUALIZE_FACTOR: 252
```
