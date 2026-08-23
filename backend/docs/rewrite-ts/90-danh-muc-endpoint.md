# Danh mục đầy đủ 293 endpoint

Bảng tra sinh **tự động** từ OpenAPI schema của backend đang chạy. Đây là *checklist nghiệm thu*: bản viết lại bằng TypeScript phải phục vụ đúng 293 dòng dưới đây, cùng method, cùng path, cùng yêu cầu quyền.

Bản máy đọc được: [`types/endpoint-manifest.json`](types/endpoint-manifest.json).

Ký hiệu cột **Quyền**: `—` công khai (không cần token) · `🔒` cần Bearer token. Mức chi tiết hơn (admin / premium) nằm trong từng chương endpoint, vì OpenAPI của FastAPI chỉ ghi "có security" chứ không ghi role.

| Tổng operation | Tổng path | WebSocket |
|---|---|---|
| **293** | 267 | 1 (`/api/v1/market-data/ws`) |

## [20-endpoints-auth-users.md](20-endpoints-auth-users.md)

17 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/users/` | 🔒 | Người dùng | Danh sách người dùng (quản trị) |
| `POST` | `/api/v1/users/` | 🔒 | Người dùng | Tạo người dùng (quản trị) |
| `GET` | `/api/v1/users/me` | 🔒 | Người dùng | Lấy hồ sơ của chính mình |
| `PATCH` | `/api/v1/users/me` | 🔒 | Người dùng | Cập nhật hồ sơ của chính mình |
| `DELETE` | `/api/v1/users/{user_id}` | 🔒 | Người dùng | Xóa người dùng (quản trị) |
| `GET` | `/api/v1/users/{user_id}` | 🔒 | Người dùng | Lấy thông tin người dùng theo ID (quản trị) |
| `PATCH` | `/api/v1/users/{user_id}` | 🔒 | Người dùng | Cập nhật người dùng (quản trị) |
| `GET` | `/api/v1/health` | — | Sức khỏe hệ thống | Kiểm tra sức khỏe |
| `POST` | `/api/v1/auth/forgot-password` | — | Xác thực | Quên mật khẩu |
| `POST` | `/api/v1/auth/login` | — | Xác thực | Đăng nhập |
| `POST` | `/api/v1/auth/logout` | 🔒 | Xác thực | Đăng xuất |
| `GET` | `/api/v1/auth/me` | 🔒 | Xác thực | Lấy thông tin người dùng hiện tại |
| `POST` | `/api/v1/auth/refresh` | — | Xác thực | Làm mới token |
| `POST` | `/api/v1/auth/register` | — | Xác thực | Đăng ký người dùng mới |
| `GET` | `/api/v1/auth/reset-password` | — | Xác thực | Form đặt lại mật khẩu (HTML, mở từ link trong email) **⚠️ ẩn khỏi OpenAPI** |
| `POST` | `/api/v1/auth/reset-password` | — | Xác thực | Đặt lại mật khẩu |
| `GET` | `/api/v1/auth/verify-email` | — | Xác thực | Trang xác thực email (HTML, mở từ link trong email) **⚠️ ẩn khỏi OpenAPI** |

## [21-endpoints-premium-thanh-toan.md](21-endpoints-premium-thanh-toan.md)

10 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/premium/admin/plans` | 🔒 | Premium | Admin List Plans |
| `POST` | `/api/v1/premium/admin/plans` | 🔒 | Premium | Admin Create Plan |
| `DELETE` | `/api/v1/premium/admin/plans/{plan_id}` | 🔒 | Premium | Admin Delete Plan |
| `PATCH` | `/api/v1/premium/admin/plans/{plan_id}` | 🔒 | Premium | Admin Update Plan |
| `POST` | `/api/v1/premium/admin/users/{user_id}/grant` | 🔒 | Premium | Admin Grant Premium |
| `POST` | `/api/v1/premium/checkout` | 🔒 | Premium | Create Checkout |
| `GET` | `/api/v1/premium/me` | 🔒 | Premium | Get My Subscription |
| `GET` | `/api/v1/premium/my-orders` | 🔒 | Premium | Get My Orders |
| `GET` | `/api/v1/premium/plans` | — | Premium | List Plans |
| `POST` | `/api/v1/premium/sepay/ipn` | — | Premium | Sepay Ipn |

## [21b-endpoints-quan-tri-thanh-toan.md](21b-endpoints-quan-tri-thanh-toan.md)

13 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/ipn` | 🔒 | Admin - IPN Logs | List Ipn Logs |
| `GET` | `/api/v1/admin/ipn/{log_id}` | 🔒 | Admin - IPN Logs | Get Ipn Log |
| `POST` | `/api/v1/admin/ipn/{log_id}/retry` | 🔒 | Admin - IPN Logs | Retry Ipn Log |
| `GET` | `/api/v1/admin/payments` | 🔒 | Admin - Payments | List Payments |
| `GET` | `/api/v1/admin/payments/{order_id}` | 🔒 | Admin - Payments | Get Payment |
| `POST` | `/api/v1/admin/payments/{order_id}/mark-paid` | 🔒 | Admin - Payments | Mark Payment Paid |
| `POST` | `/api/v1/admin/payments/{order_id}/reconcile` | 🔒 | Admin - Payments | Reconcile Payment |
| `POST` | `/api/v1/admin/payments/{order_id}/refund` | 🔒 | Admin - Payments | Refund Payment |
| `GET` | `/api/v1/admin/subscriptions` | 🔒 | Admin - Subscriptions | List Subscriptions |
| `GET` | `/api/v1/admin/subscriptions/{sub_id}` | 🔒 | Admin - Subscriptions | Get Subscription |
| `POST` | `/api/v1/admin/subscriptions/{sub_id}/cancel` | 🔒 | Admin - Subscriptions | Cancel Subscription |
| `POST` | `/api/v1/admin/subscriptions/{sub_id}/extend` | 🔒 | Admin - Subscriptions | Extend Subscription |
| `GET` | `/api/v1/admin/users/{user_id}/subscriptions/history` | 🔒 | Admin - Subscriptions | User Subscription History |

## [22-endpoints-market-tham-chieu-bao-gia.md](22-endpoints-market-tham-chieu-bao-gia.md)

14 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-data/quotes/{symbol}/intraday` | — | Dữ liệu thị trường: Báo giá | Get Intraday |
| `GET` | `/api/v1/market-data/quotes/{symbol}/ohlcv` | — | Dữ liệu thị trường: Báo giá | Get Ohlcv |
| `GET` | `/api/v1/market-data/quotes/{symbol}/price-depth` | — | Dữ liệu thị trường: Báo giá | Get Price Depth |
| `GET` | `/api/v1/market-data/screening/criteria` | — | Dữ liệu thị trường: Bộ lọc cổ phiếu | Get Screening Criteria |
| `GET` | `/api/v1/market-data/screening/presets` | — | Dữ liệu thị trường: Bộ lọc cổ phiếu | Get Screening Presets |
| `POST` | `/api/v1/market-data/screening/search` | — | Dữ liệu thị trường: Bộ lọc cổ phiếu | Post Screening Search |
| `GET` | `/api/v1/market-data/reference/event-codes` | — | Dữ liệu thị trường: Tham chiếu | Get Event Codes |
| `GET` | `/api/v1/market-data/reference/groups/{group}/symbols` | — | Dữ liệu thị trường: Tham chiếu | List Group Symbols |
| `GET` | `/api/v1/market-data/reference/indices` | — | Dữ liệu thị trường: Tham chiếu | List Indices |
| `GET` | `/api/v1/market-data/reference/industries` | — | Dữ liệu thị trường: Tham chiếu | List Industries |
| `GET` | `/api/v1/market-data/reference/search` | — | Dữ liệu thị trường: Tham chiếu | Get Search Bar |
| `GET` | `/api/v1/market-data/reference/symbols` | — | Dữ liệu thị trường: Tham chiếu | List Symbols |
| `GET` | `/api/v1/market-data/reference/symbols/search` | — | Dữ liệu thị trường: Tham chiếu | Tìm kiếm mã chứng khoán (DB-backed) |
| `GET` | `/api/v1/market-data/reference/symbols/{symbol}` | — | Dữ liệu thị trường: Tham chiếu | Lấy chi tiết một mã chứng khoán (DB-backed) |

## [23-endpoints-market-cong-ty-giao-dich.md](23-endpoints-market-cong-ty-giao-dich.md)

17 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-data/company/{symbol}/details` | — | Dữ liệu thị trường: Công ty | Get Company Details |
| `GET` | `/api/v1/market-data/company/{symbol}/news` | — | Dữ liệu thị trường: Công ty | Get Company News |
| `GET` | `/api/v1/market-data/company/{symbol}/officers` | — | Dữ liệu thị trường: Công ty | Get Officers |
| `GET` | `/api/v1/market-data/company/{symbol}/overview` | — | Dữ liệu thị trường: Công ty | Get Company Overview |
| `GET` | `/api/v1/market-data/company/{symbol}/price-chart` | — | Dữ liệu thị trường: Công ty | Get Company Price Chart |
| `GET` | `/api/v1/market-data/company/{symbol}/shareholders` | — | Dữ liệu thị trường: Công ty | Get Shareholders |
| `GET` | `/api/v1/market-data/company/{symbol}/subsidiaries` | — | Dữ liệu thị trường: Công ty | Get Subsidiaries |
| `POST` | `/api/v1/market-data/trading/price-board` | — | Dữ liệu thị trường: Giao dịch | Get Price Board |
| `GET` | `/api/v1/market-data/trading/{symbol}/foreign-trade` | — | Dữ liệu thị trường: Giao dịch | Get Foreign Trade |
| `GET` | `/api/v1/market-data/trading/{symbol}/foreign-trade/summary` | — | Dữ liệu thị trường: Giao dịch | Get Foreign Trade Summary |
| `GET` | `/api/v1/market-data/trading/{symbol}/history` | — | Dữ liệu thị trường: Giao dịch | Get Trading History |
| `GET` | `/api/v1/market-data/trading/{symbol}/insider-deals` | — | Dữ liệu thị trường: Giao dịch | Get Insider Deals |
| `GET` | `/api/v1/market-data/trading/{symbol}/proprietary` | — | Dữ liệu thị trường: Giao dịch | Get Proprietary History |
| `GET` | `/api/v1/market-data/trading/{symbol}/proprietary/summary` | — | Dữ liệu thị trường: Giao dịch | Get Proprietary Summary |
| `GET` | `/api/v1/market-data/trading/{symbol}/summary` | — | Dữ liệu thị trường: Giao dịch | Get Trading Summary |
| `GET` | `/api/v1/market-data/trading/{symbol}/supply-demand` | — | Dữ liệu thị trường: Giao dịch | Get Supply Demand History |
| `GET` | `/api/v1/market-data/trading/{symbol}/supply-demand/summary` | — | Dữ liệu thị trường: Giao dịch | Get Supply Demand Summary |

## [24-endpoints-market-tong-quan-nganh.md](24-endpoints-market-tong-quan-nganh.md)

20 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-data/sectors/information` | — | Dữ liệu thị trường: Ngành | Get Sector Information |
| `GET` | `/api/v1/market-data/sectors/ranking` | — | Dữ liệu thị trường: Ngành | Get Sector Ranking |
| `GET` | `/api/v1/market-data/sectors/trading-dates` | — | Dữ liệu thị trường: Ngành | Get Sector Trading Dates |
| `GET` | `/api/v1/market-data/insights/ranking/{kind}` | — | Dữ liệu thị trường: Phân tích | Get Ranking |
| `GET` | `/api/v1/market-data/overview/allocation` | — | Dữ liệu thị trường: Tổng quan | Get Allocation |
| `GET` | `/api/v1/market-data/overview/breadth` | — | Dữ liệu thị trường: Tổng quan | Get Breadth |
| `GET` | `/api/v1/market-data/overview/foreign` | — | Dữ liệu thị trường: Tổng quan | Get Foreign |
| `GET` | `/api/v1/market-data/overview/foreign/top` | — | Dữ liệu thị trường: Tổng quan | Get Foreign Top |
| `GET` | `/api/v1/market-data/overview/heatmap` | — | Dữ liệu thị trường: Tổng quan | Get Heatmap |
| `GET` | `/api/v1/market-data/overview/heatmap/index` | — | Dữ liệu thị trường: Tổng quan | Get Heatmap Index |
| `GET` | `/api/v1/market-data/overview/index-impact` | — | Dữ liệu thị trường: Tổng quan | Get Index Impact |
| `GET` | `/api/v1/market-data/overview/liquidity` | — | Dữ liệu thị trường: Tổng quan | Get Liquidity |
| `GET` | `/api/v1/market-data/overview/maintenance` | — | Dữ liệu thị trường: Tổng quan | Get Maintenance |
| `GET` | `/api/v1/market-data/overview/market-index` | — | Dữ liệu thị trường: Tổng quan | Get Market Index |
| `GET` | `/api/v1/market-data/overview/proprietary` | — | Dữ liệu thị trường: Tổng quan | Get Proprietary |
| `GET` | `/api/v1/market-data/overview/proprietary/top` | — | Dữ liệu thị trường: Tổng quan | Get Proprietary Top |
| `GET` | `/api/v1/market-data/overview/sectors/allocation` | — | Dữ liệu thị trường: Tổng quan | Get Sectors Allocation |
| `GET` | `/api/v1/market-data/overview/sectors/detail` | — | Dữ liệu thị trường: Tổng quan | Get Sector Detail |
| `GET` | `/api/v1/market-data/overview/stock-strength` | — | Dữ liệu thị trường: Tổng quan | Get Stock Strength |
| `GET` | `/api/v1/market-data/overview/valuation` | — | Dữ liệu thị trường: Tổng quan | Get Valuation |

## [25-endpoints-market-vi-mo-quoc-te-quy.md](25-endpoints-market-vi-mo-quoc-te-quy.md)

18 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-data/sheets/tpcp` | — | Dữ liệu thị trường: Google Sheets | Lãi suất TPCP (Google Sheets) |
| `GET` | `/api/v1/market-data/sheets/tygia` | — | Dữ liệu thị trường: Google Sheets | Tỷ giá ngoại tệ (Google Sheets) |
| `GET` | `/api/v1/market-data/sheets/vnd` | — | Dữ liệu thị trường: Google Sheets | Lãi suất VND liên ngân hàng (Google Sheets) |
| `GET` | `/api/v1/market-data/global/crypto/{symbol}/depth` | — | Dữ liệu thị trường: Quốc tế | Get Crypto Depth |
| `GET` | `/api/v1/market-data/global/crypto/{symbol}/ohlc` | — | Dữ liệu thị trường: Quốc tế | Get Crypto Ohlc |
| `GET` | `/api/v1/market-data/global/crypto/{symbol}/ticker` | — | Dữ liệu thị trường: Quốc tế | Get Crypto Ticker |
| `GET` | `/api/v1/market-data/global/forex` | — | Dữ liệu thị trường: Quốc tế | Get Global Forex |
| `GET` | `/api/v1/market-data/global/snapshot` | — | Dữ liệu thị trường: Quốc tế | Get Intl Snapshot |
| `GET` | `/api/v1/market-data/global/world-index` | — | Dữ liệu thị trường: Quốc tế | Get World Index |
| `GET` | `/api/v1/market-data/funds` | — | Dữ liệu thị trường: Quỹ | List Funds |
| `GET` | `/api/v1/market-data/funds/{fund_id}` | — | Dữ liệu thị trường: Quỹ | Get Fund Details |
| `GET` | `/api/v1/market-data/funds/{fund_id}/nav` | — | Dữ liệu thị trường: Quỹ | Get Fund Nav |
| `GET` | `/api/v1/market-data/events/calendar` | — | Dữ liệu thị trường: Sự kiện | Get Events Calendar |
| `GET` | `/api/v1/market-data/macro/commodities` | — | Dữ liệu thị trường: Vĩ mô | List Commodities |
| `GET` | `/api/v1/market-data/macro/commodities/{code}` | — | Dữ liệu thị trường: Vĩ mô | Get Commodity Price |
| `GET` | `/api/v1/market-data/macro/economy/{indicator}` | — | Dữ liệu thị trường: Vĩ mô | Get Macro Data |
| `GET` | `/api/v1/market-data/macro/fx` | — | Dữ liệu thị trường: Vĩ mô | Get Exchange Rates |
| `GET` | `/api/v1/market-data/macro/gold` | — | Dữ liệu thị trường: Vĩ mô | Get Gold Prices |

## [26-endpoints-market-tin-tuc.md](26-endpoints-market-tin-tuc.md)

7 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-data/news/ai` | — | Dữ liệu thị trường: Tin AI | Get Ai News |
| `GET` | `/api/v1/market-data/news/ai/audio/{news_id}` | — | Dữ liệu thị trường: Tin AI | Get Ai News Audio |
| `GET` | `/api/v1/market-data/news/ai/catalogs` | — | Dữ liệu thị trường: Tin AI | Get Ai News Catalogs |
| `GET` | `/api/v1/market-data/news/ai/detail/{slug}` | — | Dữ liệu thị trường: Tin AI | Get Ai News Detail |
| `GET` | `/api/v1/market-data/news/ai/tickers/{symbol}` | — | Dữ liệu thị trường: Tin AI | Get Ai Ticker View |
| `GET` | `/api/v1/market-data/news/latest` | — | Dữ liệu thị trường: Tin tức | Get Latest News |
| `GET` | `/api/v1/market-data/news/sources` | — | Dữ liệu thị trường: Tin tức | List News Sources |

## [27-endpoints-market-bctc.md](27-endpoints-market-bctc.md)

3 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-data/bctc-dashboard/{symbol}` | — | Dữ liệu thị trường: Cơ bản | Get Bctc Storytelling Dashboard |
| `GET` | `/api/v1/market-data/bctc/{symbol}` | — | Dữ liệu thị trường: Cơ bản | Get Bctc Dashboard |
| `GET` | `/api/v1/market-data/fundamentals/{symbol}/{report_type}` | — | Dữ liệu thị trường: Cơ bản | Get Financial Report |

## [28-endpoints-nhan-dinh-thi-truong.md](28-endpoints-nhan-dinh-thi-truong.md)

10 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/market-analysis/daily` | — | Nhận định thị trường | List Recent |
| `GET` | `/api/v1/market-analysis/daily/latest` | — | Nhận định thị trường | Get Latest |
| `POST` | `/api/v1/market-analysis/daily/run` | 🔒 | Nhận định thị trường | Run Now |
| `GET` | `/api/v1/market-analysis/daily/{session_date}` | — | Nhận định thị trường | Get By Date |
| `GET` | `/api/v1/market-analysis/midday/latest` | — | Nhận định thị trường | Get Midday Latest |
| `POST` | `/api/v1/market-analysis/midday/run` | 🔒 | Nhận định thị trường | Run Midday Now |
| `GET` | `/api/v1/market-analysis/midday/{session_date}` | — | Nhận định thị trường | Get Midday By Date |
| `GET` | `/api/v1/market-analysis/premarket/latest` | — | Nhận định thị trường | Get Premarket Latest |
| `POST` | `/api/v1/market-analysis/premarket/run` | 🔒 | Nhận định thị trường | Run Premarket Now |
| `GET` | `/api/v1/market-analysis/premarket/{session_date}` | — | Nhận định thị trường | Get Premarket By Date |

## [29-endpoints-ai.md](29-endpoints-ai.md)

12 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/ai/forecast/ranking` | 🔒 | AI Mô hình dự báo | Get Ranking |
| `GET` | `/api/v1/ai/forecast/symbols/{symbol}` | 🔒 | AI Mô hình dự báo | Get Symbol Forecast |
| `GET` | `/api/v1/ai/patterns/candles` | 🔒 | AI Mẫu hình | Get Candles |
| `GET` | `/api/v1/ai/patterns/charts` | 🔒 | AI Mẫu hình | Get Charts |
| `GET` | `/api/v1/ai/patterns/{kind}/symbols` | 🔒 | AI Mẫu hình | List Symbols |
| `GET` | `/api/v1/ai/bctc-dashboard/{symbol}` | 🔒 | AI Phân tích | Get Bctc Dashboard Narrative |
| `GET` | `/api/v1/ai/bctc/{symbol}` | 🔒 | AI Phân tích | Get Bctc Analyze |
| `POST` | `/api/v1/ai/dashboard/analyze` | 🔒 | AI Phân tích | Post Dashboard Analyze |
| `POST` | `/api/v1/ai/industry/analyze` | 🔒 | AI Phân tích | Post Industry Analyze |
| `POST` | `/api/v1/ai/industry/analyze-batch` | 🔒 | AI Phân tích | Post Industry Analyze Batch |
| `POST` | `/api/v1/ai/insight/analyze` | 🔒 | AI Phân tích | Post Insight Analyze |
| `GET` | `/api/v1/ai/insight/{symbol}` | — | AI Phân tích | Get Insight Analyze |

## [30-endpoints-quan-ly-danh-muc.md](30-endpoints-quan-ly-danh-muc.md)

2 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `POST` | `/api/v1/portfolio-manager/analyze` | 🔒 | Quản lý danh mục | Analyze |
| `GET` | `/api/v1/portfolio-manager/report` | 🔒 | Quản lý danh mục | Latest Report |

## [31-endpoints-giao-dich-ao.md](31-endpoints-giao-dich-ao.md)

24 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/virtual-trading/account` | 🔒 | Giao dịch ảo | Get Account |
| `POST` | `/api/v1/virtual-trading/account/activate` | 🔒 | Giao dịch ảo | Activate Account |
| `GET` | `/api/v1/virtual-trading/leaderboard` | — | Giao dịch ảo | Get Leaderboard |
| `GET` | `/api/v1/virtual-trading/orders` | 🔒 | Giao dịch ảo | List Orders |
| `POST` | `/api/v1/virtual-trading/orders` | 🔒 | Giao dịch ảo | Place Order |
| `POST` | `/api/v1/virtual-trading/orders/{order_id}/cancel` | 🔒 | Giao dịch ảo | Cancel Order |
| `GET` | `/api/v1/virtual-trading/portfolio` | 🔒 | Giao dịch ảo | Get Portfolio |
| `POST` | `/api/v1/virtual-trading/refresh` | 🔒 | Giao dịch ảo | Refresh |
| `GET` | `/api/v1/virtual-trading/trades` | 🔒 | Giao dịch ảo | List Trades |
| `GET` | `/api/v1/virtual-trading/admin/accounts` | 🔒 | Giao dịch ảo (quản trị) | Admin List Accounts |
| `GET` | `/api/v1/virtual-trading/admin/config` | 🔒 | Giao dịch ảo (quản trị) | Admin Get Config |
| `PATCH` | `/api/v1/virtual-trading/admin/config` | 🔒 | Giao dịch ảo (quản trị) | Admin Update Config |
| `POST` | `/api/v1/virtual-trading/admin/reset-all` | 🔒 | Giao dịch ảo (quản trị) | Admin Reset All |
| `POST` | `/api/v1/virtual-trading/admin/users/{user_id}/reset` | 🔒 | Giao dịch ảo (quản trị) | Admin Reset User |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}` | 🔒 | Quản trị: Giao dịch ảo | Chi tiết tài khoản giao dịch ảo |
| `POST` | `/api/v1/admin/vt/accounts/{account_id}/cash-adjust` | 🔒 | Quản trị: Giao dịch ảo | Điều chỉnh số dư tiền mặt |
| `POST` | `/api/v1/admin/vt/accounts/{account_id}/freeze` | 🔒 | Quản trị: Giao dịch ảo | Tạm khóa tài khoản giao dịch ảo |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}/ledger` | 🔒 | Quản trị: Giao dịch ảo | Sổ cái tiền mặt của tài khoản (phân trang) |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}/orders` | 🔒 | Quản trị: Giao dịch ảo | Danh sách lệnh của tài khoản (phân trang) |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}/positions` | 🔒 | Quản trị: Giao dịch ảo | Danh sách vị thế của tài khoản |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}/settlements` | 🔒 | Quản trị: Giao dịch ảo | Danh sách thanh toán T+N của tài khoản (phân trang) |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}/stats` | 🔒 | Quản trị: Giao dịch ảo | Thống kê tài khoản giao dịch ảo |
| `GET` | `/api/v1/admin/vt/accounts/{account_id}/trades` | 🔒 | Quản trị: Giao dịch ảo | Danh sách giao dịch của tài khoản (phân trang) |
| `POST` | `/api/v1/admin/vt/accounts/{account_id}/unfreeze` | 🔒 | Quản trị: Giao dịch ảo | Mở khóa tài khoản giao dịch ảo |

## [32-endpoints-cap-0-2.md](32-endpoints-cap-0-2.md)

20 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `POST` | `/api/v1/cap0/enter` | 🔒 | Cấp 0 | Enter |
| `POST` | `/api/v1/cap0/graduate` | 🔒 | Cấp 0 | Graduate |
| `GET` | `/api/v1/cap0/kehoach` | 🔒 | Cấp 0 | Get Kehoach |
| `POST` | `/api/v1/cap0/kehoach` | 🔒 | Cấp 0 | Record Kehoach |
| `POST` | `/api/v1/cap0/placement` | 🔒 | Cấp 0 | Placement |
| `GET` | `/api/v1/cap0/progress` | 🔒 | Cấp 0 | Get Progress |
| `PATCH` | `/api/v1/cap0/task` | 🔒 | Cấp 0 | Complete Task |
| `POST` | `/api/v1/cap1/enter` | 🔒 | Cấp 1 | Enter |
| `POST` | `/api/v1/cap1/graduate` | 🔒 | Cấp 1 | Graduate |
| `POST` | `/api/v1/cap1/kehoach` | 🔒 | Cấp 1 | Record Kehoach |
| `POST` | `/api/v1/cap1/ketso` | 🔒 | Cấp 1 | Record Ketso |
| `GET` | `/api/v1/cap1/progress` | 🔒 | Cấp 1 | Get Progress |
| `PATCH` | `/api/v1/cap1/task` | 🔒 | Cấp 1 | Mark Task |
| `GET` | `/api/v1/cap2/diem-ky-luat` | 🔒 | Cấp 2 | Get Diem Ky Luat |
| `POST` | `/api/v1/cap2/enter` | 🔒 | Cấp 2 | Enter |
| `POST` | `/api/v1/cap2/graduate` | 🔒 | Cấp 2 | Graduate |
| `POST` | `/api/v1/cap2/kehoach` | 🔒 | Cấp 2 | Record Kehoach |
| `POST` | `/api/v1/cap2/ketso` | 🔒 | Cấp 2 | Record Ketso |
| `GET` | `/api/v1/cap2/progress` | 🔒 | Cấp 2 | Get Progress |
| `PATCH` | `/api/v1/cap2/task` | 🔒 | Cấp 2 | Mark Task |

## [33-endpoints-cap-3-4.md](33-endpoints-cap-3-4.md)

14 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `POST` | `/api/v1/cap3/enter` | 🔒 | Cấp 3 | Enter |
| `POST` | `/api/v1/cap3/graduate` | 🔒 | Cấp 3 | Graduate |
| `POST` | `/api/v1/cap3/kehoach` | 🔒 | Cấp 3 | Record Kehoach |
| `POST` | `/api/v1/cap3/khau-vi` | 🔒 | Cấp 3 | Set Khau Vi |
| `GET` | `/api/v1/cap3/progress` | 🔒 | Cấp 3 | Get Progress |
| `PATCH` | `/api/v1/cap3/task` | 🔒 | Cấp 3 | Mark Task |
| `GET` | `/api/v1/cap3/thach-thuc` | 🔒 | Cấp 3 | Get Thach Thuc |
| `POST` | `/api/v1/cap4/enter` | 🔒 | Cấp 4 | Enter |
| `POST` | `/api/v1/cap4/graduate` | 🔒 | Cấp 4 | Graduate |
| `POST` | `/api/v1/cap4/kehoach` | 🔒 | Cấp 4 | Record Kehoach |
| `GET` | `/api/v1/cap4/progress` | 🔒 | Cấp 4 | Get Progress |
| `PATCH` | `/api/v1/cap4/task` | 🔒 | Cấp 4 | Mark Task |
| `GET` | `/api/v1/cap4/thach-thuc` | 🔒 | Cấp 4 | Get Thach Thuc |
| `GET` | `/api/v1/cap4/vu-khi-diem-mu` | 🔒 | Cấp 4 | Get Vu Khi Diem Mu |

## [34-endpoints-cap-5-6.md](34-endpoints-cap-5-6.md)

18 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/cap5/dung-ngoai` | 🔒 | Cấp 5 | List Dung Ngoai |
| `POST` | `/api/v1/cap5/dung-ngoai` | 🔒 | Cấp 5 | Log Dung Ngoai |
| `POST` | `/api/v1/cap5/dung-ngoai/cham` | 🔒 | Cấp 5 | Cham Dung Ngoai |
| `POST` | `/api/v1/cap5/enter` | 🔒 | Cấp 5 | Enter |
| `POST` | `/api/v1/cap5/graduate` | 🔒 | Cấp 5 | Graduate |
| `POST` | `/api/v1/cap5/ketso` | 🔒 | Cấp 5 | Record Ketso |
| `GET` | `/api/v1/cap5/progress` | 🔒 | Cấp 5 | Get Progress |
| `PATCH` | `/api/v1/cap5/task` | 🔒 | Cấp 5 | Mark Task |
| `GET` | `/api/v1/cap5/thach-thuc` | 🔒 | Cấp 5 | Get Thach Thuc |
| `GET` | `/api/v1/cap5/verdict/{order_id}` | 🔒 | Cấp 5 | Get Verdict |
| `POST` | `/api/v1/cap6/enter` | 🔒 | Cấp 6 | Enter |
| `GET` | `/api/v1/cap6/goi-y` | 🔒 | Cấp 6 | Get Goi Y |
| `POST` | `/api/v1/cap6/graduate` | 🔒 | Cấp 6 | Graduate |
| `POST` | `/api/v1/cap6/kehoach` | 🔒 | Cấp 6 | Record Kehoach |
| `GET` | `/api/v1/cap6/kehoach/{order_id}` | 🔒 | Cấp 6 | Get Kehoach |
| `GET` | `/api/v1/cap6/progress` | 🔒 | Cấp 6 | Get Progress |
| `PATCH` | `/api/v1/cap6/task` | 🔒 | Cấp 6 | Mark Task |
| `GET` | `/api/v1/cap6/thach-thuc` | 🔒 | Cấp 6 | Get Thach Thuc |

## [35-endpoints-cap-7-8.md](35-endpoints-cap-7-8.md)

16 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `POST` | `/api/v1/cap7/cham` | 🔒 | Cấp 7 | Cham |
| `POST` | `/api/v1/cap7/enter` | 🔒 | Cấp 7 | Enter |
| `POST` | `/api/v1/cap7/graduate` | 🔒 | Cấp 7 | Graduate |
| `POST` | `/api/v1/cap7/kehoach` | 🔒 | Cấp 7 | Record Kehoach |
| `GET` | `/api/v1/cap7/kehoach/{order_id}` | 🔒 | Cấp 7 | Get Kehoach |
| `GET` | `/api/v1/cap7/phien` | 🔒 | Cấp 7 | Get Phien |
| `GET` | `/api/v1/cap7/progress` | 🔒 | Cấp 7 | Get Progress |
| `PATCH` | `/api/v1/cap7/task` | 🔒 | Cấp 7 | Mark Task |
| `GET` | `/api/v1/cap7/thach-thuc` | 🔒 | Cấp 7 | Get Thach Thuc |
| `POST` | `/api/v1/cap8/enter` | 🔒 | Cấp 8 | Enter |
| `POST` | `/api/v1/cap8/graduate` | 🔒 | Cấp 8 | Graduate |
| `POST` | `/api/v1/cap8/kehoach` | 🔒 | Cấp 8 | Record Kehoach |
| `GET` | `/api/v1/cap8/kiem-tra` | 🔒 | Cấp 8 | Get Kiem Tra |
| `GET` | `/api/v1/cap8/progress` | 🔒 | Cấp 8 | Get Progress |
| `PATCH` | `/api/v1/cap8/task` | 🔒 | Cấp 8 | Mark Task |
| `GET` | `/api/v1/cap8/thach-thuc` | 🔒 | Cấp 8 | Get Thach Thuc |

## [36-endpoints-watchlist-ban-ve-backtest.md](36-endpoints-watchlist-ban-ve-backtest.md)

14 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/backtest/catalog` | 🔒 | Backtest | Get Catalog |
| `POST` | `/api/v1/backtest/run` | 🔒 | Backtest | Run |
| `GET` | `/api/v1/backtest/strategies` | 🔒 | Backtest | List Strategies |
| `POST` | `/api/v1/backtest/strategies` | 🔒 | Backtest | Create Strategy |
| `DELETE` | `/api/v1/backtest/strategies/{strategy_id}` | 🔒 | Backtest | Delete Strategy |
| `PUT` | `/api/v1/backtest/strategies/{strategy_id}` | 🔒 | Backtest | Update Strategy |
| `DELETE` | `/api/v1/chart-drawings/{symbol}` | 🔒 | Bản vẽ biểu đồ | Delete Chart Drawing |
| `GET` | `/api/v1/chart-drawings/{symbol}` | 🔒 | Bản vẽ biểu đồ | Get Chart Drawing |
| `PUT` | `/api/v1/chart-drawings/{symbol}` | 🔒 | Bản vẽ biểu đồ | Save Chart Drawing |
| `GET` | `/api/v1/watchlist` | 🔒 | Danh mục theo dõi | Get Watchlist |
| `POST` | `/api/v1/watchlist` | 🔒 | Danh mục theo dõi | Add To Watchlist |
| `GET` | `/api/v1/watchlist/check/{symbol}` | 🔒 | Danh mục theo dõi | Check Symbol |
| `PUT` | `/api/v1/watchlist/reorder` | 🔒 | Danh mục theo dõi | Reorder Watchlist |
| `DELETE` | `/api/v1/watchlist/{symbol}` | 🔒 | Danh mục theo dõi | Remove From Watchlist |

## [37-endpoints-canh-bao-telegram.md](37-endpoints-canh-bao-telegram.md)

16 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/alerts/indicators` | 🔒 | Admin · Cảnh báo | List Indicator Options |
| `POST` | `/api/v1/admin/alerts/seed` | 🔒 | Admin · Cảnh báo | Reseed |
| `GET` | `/api/v1/admin/alerts/signals` | 🔒 | Admin · Cảnh báo | List Signals |
| `POST` | `/api/v1/admin/alerts/signals` | 🔒 | Admin · Cảnh báo | Create Signal |
| `DELETE` | `/api/v1/admin/alerts/signals/{key}` | 🔒 | Admin · Cảnh báo | Delete Signal |
| `PUT` | `/api/v1/admin/alerts/signals/{key}` | 🔒 | Admin · Cảnh báo | Update Signal |
| `GET` | `/api/v1/alerts/events` | 🔒 | Cảnh báo | List Events |
| `GET` | `/api/v1/alerts/rules` | 🔒 | Cảnh báo | List Rules |
| `POST` | `/api/v1/alerts/rules` | 🔒 | Cảnh báo | Create Rule |
| `DELETE` | `/api/v1/alerts/rules/{rule_id}` | 🔒 | Cảnh báo | Delete Rule |
| `PUT` | `/api/v1/alerts/rules/{rule_id}` | 🔒 | Cảnh báo | Update Rule |
| `GET` | `/api/v1/alerts/signals` | 🔒 | Cảnh báo | List Signals |
| `DELETE` | `/api/v1/alerts/telegram` | 🔒 | Cảnh báo | Telegram Unlink |
| `GET` | `/api/v1/alerts/telegram` | 🔒 | Cảnh báo | Telegram Status |
| `POST` | `/api/v1/alerts/telegram/link` | 🔒 | Cảnh báo | Telegram Link |
| `POST` | `/api/v1/telegram/webhook/{secret}` | — | Telegram | Telegram Webhook |

## [38-endpoints-bai-hoc.md](38-endpoints-bai-hoc.md)

16 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/lessons/courses` | — | Bài học | List Courses |
| `GET` | `/api/v1/lessons/courses/{slug}` | 🔒 | Bài học | Get Course Detail |
| `GET` | `/api/v1/lessons/episodes/{episode_id}/content` | 🔒 | Bài học | Get Episode Content |
| `POST` | `/api/v1/lessons/episodes/{episode_id}/progress` | 🔒 | Bài học | Update Episode Progress |
| `GET` | `/api/v1/lessons/me/progress` | 🔒 | Bài học | Get My Progress |
| `GET` | `/api/v1/admin/lessons/courses` | 🔒 | Quản trị: Bài học | Admin List Courses |
| `POST` | `/api/v1/admin/lessons/courses` | 🔒 | Quản trị: Bài học | Admin Create Course |
| `DELETE` | `/api/v1/admin/lessons/courses/{course_id}` | 🔒 | Quản trị: Bài học | Admin Delete Course |
| `GET` | `/api/v1/admin/lessons/courses/{course_id}` | 🔒 | Quản trị: Bài học | Admin Get Course |
| `PATCH` | `/api/v1/admin/lessons/courses/{course_id}` | 🔒 | Quản trị: Bài học | Admin Update Course |
| `POST` | `/api/v1/admin/lessons/courses/{course_id}/episodes` | 🔒 | Quản trị: Bài học | Admin Create Episode |
| `POST` | `/api/v1/admin/lessons/courses/{course_id}/reorder` | 🔒 | Quản trị: Bài học | Admin Reorder Episodes |
| `POST` | `/api/v1/admin/lessons/courses/{course_id}/thumbnail` | 🔒 | Quản trị: Bài học | Admin Upload Thumbnail |
| `DELETE` | `/api/v1/admin/lessons/episodes/{episode_id}` | 🔒 | Quản trị: Bài học | Admin Delete Episode |
| `PATCH` | `/api/v1/admin/lessons/episodes/{episode_id}` | 🔒 | Quản trị: Bài học | Admin Update Episode |
| `POST` | `/api/v1/admin/lessons/episodes/{episode_id}/file` | 🔒 | Quản trị: Bài học | Admin Upload Episode File |

## [39-endpoints-quan-tri.md](39-endpoints-quan-tri.md)

12 endpoint.

| Method | Path | Quyền | Nhóm | Mục đích |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/audit` | 🔒 | Admin - Audit | List Audit Logs |
| `POST` | `/api/v1/admin/system/jobs/{job_id}/run` | 🔒 | Quản trị: Hệ thống | Run Job |
| `GET` | `/api/v1/admin/system/status` | 🔒 | Quản trị: Hệ thống | Get Status |
| `POST` | `/api/v1/admin/users/bulk` | 🔒 | Quản trị: Người dùng | Bulk Update Users |
| `GET` | `/api/v1/admin/users/export` | 🔒 | Quản trị: Người dùng | Export Users Csv |
| `GET` | `/api/v1/admin/users/{user_id}/360` | 🔒 | Quản trị: Người dùng | Get User 360 |
| `GET` | `/api/v1/admin/users/{user_id}/login-history` | 🔒 | Quản trị: Người dùng | Get Login History |
| `POST` | `/api/v1/admin/users/{user_id}/resend-verification` | 🔒 | Quản trị: Người dùng | Resend Verification |
| `POST` | `/api/v1/admin/users/{user_id}/reset-password` | 🔒 | Quản trị: Người dùng | Reset Password |
| `GET` | `/api/v1/admin/metrics/overview` | 🔒 | Quản trị: Số liệu | Get Overview |
| `GET` | `/api/v1/admin/metrics/plan-distribution` | 🔒 | Quản trị: Số liệu | Get Plan Distribution |
| `GET` | `/api/v1/admin/metrics/revenue` | 🔒 | Quản trị: Số liệu | Get Daily Revenue |

## WebSocket

| Path | Quyền | Chương |
|---|---|---|
| `/api/v1/market-data/ws` | — (công khai) | [10-realtime-websocket.md](10-realtime-websocket.md) |

> WebSocket không xuất hiện trong `/openapi.json` vì FastAPI không mô tả route WS. Giao thức message được đặc tả đầy đủ ở chương 10.

## Tài nguyên tĩnh

| Path | Mô tả |
|---|---|
| `/media/**` | File bài học (video, PDF, thumbnail) — mount StaticFiles, xem chương 11 |
| `/docs`, `/redoc`, `/openapi.json` | Chỉ bật khi `api_docs_enabled` (xem chương 05) |
