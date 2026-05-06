# Prompt cho Antigravity: Xây AI Analysis Backend cho 3 Prompt

Bạn là Antigravity. Làm việc trong repo:

```text
/Users/danhtrong.it/Documents/projects/IQX
```

## Yêu cầu quan trọng

- Hãy tự đọc code/docs trước khi sửa.
- Không hỏi lại nếu có thể tự xác minh bằng codebase.
- Không hardcode API key vào source code.
- Không commit secret.
- Dùng `.env` hoặc settings hiện có để cấu hình AI proxy.
- Viết test đầy đủ.
- Không sửa các phần unrelated như auth, premium, database transaction.
- Không phá response schema market-data hiện có.

## Files cần đọc

Đọc kỹ 3 prompt AI:

```text
backend/docs/ai/ai-dashboard.md
backend/docs/ai/ai-industry.md
backend/docs/ai/ai-insight.md
```

Đọc thêm docs dữ liệu:

```text
backend/docs/market-data-source-map.md
backend/docs/company-statistics-api-map.md
```

## AI Proxy

Dùng OpenAI-compatible proxy:

```text
Base URL: http://160.22.123.174:20128/v1
Model: cx/gpt-5.5
API Key: lấy từ biến môi trường AI_PROXY_API_KEY
```

Không hardcode API key. Thêm env vars kiểu:

```env
AI_PROXY_BASE_URL=http://160.22.123.174:20128/v1
AI_PROXY_MODEL=cx/gpt-5.5
AI_PROXY_API_KEY=<set-local-secret-here>
```

Nếu backend đã có config/settings pattern thì tích hợp theo pattern đó.

## Mục tiêu

Xây backend layer để:

1. Đọc 3 prompt markdown trong `backend/docs/ai/`.
2. Thu thập dữ liệu từ các market-data service/router hiện có.
3. Tạo payload chuẩn cho từng AI:
   - Dashboard AI
   - Industry AI
   - Insight AI
4. Gọi model qua proxy OpenAI-compatible.
5. Trả về response có cấu trúc cho frontend/API consumer.
6. Có test cho prompt loader, payload builder, proxy client, và endpoint/service chính.

## Dữ liệu backend hiện đã có

Các route quan trọng:

```text
GET /api/v1/market-data/overview/market-index
GET /api/v1/market-data/overview/liquidity
GET /api/v1/market-data/overview/breadth
GET /api/v1/market-data/overview/sectors/allocation
GET /api/v1/market-data/overview/sectors/detail
GET /api/v1/market-data/overview/index-impact
GET /api/v1/market-data/overview/foreign
GET /api/v1/market-data/overview/foreign/top
GET /api/v1/market-data/overview/proprietary
GET /api/v1/market-data/overview/proprietary/top
GET /api/v1/market-data/overview/stock-strength
GET /api/v1/market-data/sectors/information
GET /api/v1/market-data/sectors/ranking

GET /api/v1/market-data/quotes/{symbol}/ohlcv
GET /api/v1/market-data/quotes/{symbol}/intraday
GET /api/v1/market-data/quotes/{symbol}/price-depth
POST /api/v1/market-data/trading/price-board

GET /api/v1/market-data/trading/{symbol}/history
GET /api/v1/market-data/trading/{symbol}/summary
GET /api/v1/market-data/trading/{symbol}/foreign-trade
GET /api/v1/market-data/trading/{symbol}/foreign-trade/summary
GET /api/v1/market-data/trading/{symbol}/supply-demand
GET /api/v1/market-data/trading/{symbol}/supply-demand/summary
GET /api/v1/market-data/trading/{symbol}/proprietary
GET /api/v1/market-data/trading/{symbol}/proprietary/summary
GET /api/v1/market-data/trading/{symbol}/insider-deals

GET /api/v1/market-data/company/{symbol}/overview
GET /api/v1/market-data/company/{symbol}/details
GET /api/v1/market-data/news/ai
GET /api/v1/market-data/news/ai/tickers/{symbol}
GET /api/v1/market-data/news/ai/detail/{slug}
```

## Không làm

- Không thêm nguồn dữ liệu mới nếu API hiện tại đã đủ.
- Không hardcode prompt text trực tiếp trong code.
- Không hardcode API key.
- Không sửa các phần unrelated.
- Không gọi mạng thật trong test.

## Module đề xuất

Tạo module mới:

```text
backend/app/services/ai/
  __init__.py
  prompt_loader.py
  proxy_client.py
  payloads.py
  analysis_service.py
```

Nếu repo đã có convention khác thì theo convention hiện có.

## 1. Prompt Loader

Tạo helper đọc prompt từ:

```text
backend/docs/ai/ai-dashboard.md
backend/docs/ai/ai-industry.md
backend/docs/ai/ai-insight.md
```

Yêu cầu:

- Không hardcode nội dung prompt trong code.
- Có thể cache nội dung prompt nếu hợp lý.
- Nếu file không tồn tại, raise lỗi rõ ràng.
- Có test.

## 2. AI Proxy Client

Tạo client gọi OpenAI-compatible API:

```http
POST {AI_PROXY_BASE_URL}/chat/completions
Authorization: Bearer {AI_PROXY_API_KEY}
Content-Type: application/json
```

Body mẫu:

```json
{
  "model": "cx/gpt-5.5",
  "messages": [
    {
      "role": "system",
      "content": "<prompt markdown>"
    },
    {
      "role": "user",
      "content": "<json payload>"
    }
  ],
  "temperature": 0.2
}
```

Yêu cầu:

- Timeout hợp lý.
- Handle lỗi HTTP/network rõ ràng.
- Không log API key.
- Test bằng mock HTTP, không gọi mạng thật.
- Parse response từ `choices[0].message.content`.

## 3. Dashboard AI Payload

Đọc prompt:

```text
backend/docs/ai/ai-dashboard.md
```

Nguồn dữ liệu nên dùng:

```text
/overview/market-index
/overview/liquidity
/overview/breadth
/overview/sectors/allocation
/overview/index-impact
/overview/foreign
/overview/foreign/top
/overview/proprietary
/overview/proprietary/top
/news/ai
```

Payload cần có:

- Index performance.
- Liquidity/current value.
- Market breadth.
- Sector movement/allocation.
- Foreign flow.
- Proprietary flow.
- Index impact leaders/laggards.
- Relevant market news nếu có.

## 4. Industry AI Payload

Đọc prompt:

```text
backend/docs/ai/ai-industry.md
```

Input cần hỗ trợ:

```json
{
  "icb_code": 9500,
  "language": "vi"
}
```

Nguồn dữ liệu nên dùng:

```text
/overview/sectors/detail?icb_code=...
/overview/sectors/allocation
/sectors/information
/sectors/ranking
/overview/stock-strength
/overview/market-index
/overview/foreign/top
```

Có thể gọi nhiều timeframe:

```text
ONE_DAY
ONE_WEEK
ONE_MONTH
```

Payload cần có/tính:

- sector name
- state
- sector 1D/1W/1M performance
- VNINDEX context
- trading value
- volume/value leaders
- breadth: up/down/flat, breadth percent
- foreign net volume/value theo stock trong sector nếu có
- leader contribution percent
- relative strength
- opportunity/risk hints từ ranking/strength

## 5. Insight AI Payload

Đọc prompt:

```text
backend/docs/ai/ai-insight.md
```

Input cần hỗ trợ:

```json
{
  "symbol": "VCB",
  "language": "vi"
}
```

Nguồn dữ liệu nên dùng:

```text
/quotes/{symbol}/ohlcv
/trading/price-board
/quotes/{symbol}/intraday
/quotes/{symbol}/price-depth
/trading/{symbol}/history
/trading/{symbol}/summary
/trading/{symbol}/supply-demand
/trading/{symbol}/supply-demand/summary
/trading/{symbol}/foreign-trade
/trading/{symbol}/foreign-trade/summary
/trading/{symbol}/proprietary
/trading/{symbol}/proprietary/summary
/trading/{symbol}/insider-deals
/news/ai/tickers/{symbol}
/news/ai/detail/{slug}
/company/{symbol}/overview
/company/{symbol}/details
```

Payload cần có/tính:

- OHLCV 30 phiên.
- Current price/volume.
- MA10, MA20.
- VolMA10, VolMA20.
- Support/resistance/pivot gần nhất.
- Supply/demand:
  - `total_buy_trade_volume`
  - `total_sell_trade_volume`
  - `total_net_trade_volume`
  - `average_buy_trade_volume`
  - `average_sell_trade_volume`
  - `total_buy_unmatched_volume`
  - `total_sell_unmatched_volume`
- Label cung-cầu cao/bình thường/thấp so với 30 phiên nếu đủ dữ liệu.
- Foreign 30 phiên:
  - total/matched/deal buy/sell/net volume/value
  - net/volume ratio
- Proprietary 30 phiên:
  - total/matched/deal buy/sell/net volume/value
  - net/volume ratio
- Insider transactions gần nhất.
- News list + full content/summaries.
- Company context.

## API endpoint đề xuất

Thêm router mới, ví dụ:

```text
POST /api/v1/ai/dashboard/analyze
POST /api/v1/ai/industry/analyze
POST /api/v1/ai/insight/analyze
```

Nếu backend đã có router naming convention khác thì theo convention hiện có.

Request mẫu dashboard:

```json
{
  "language": "vi",
  "include_payload": false
}
```

Request mẫu industry:

```json
{
  "icb_code": 9500,
  "language": "vi",
  "include_payload": false
}
```

Request mẫu insight:

```json
{
  "symbol": "VCB",
  "language": "vi",
  "include_payload": false
}
```

Response mẫu:

```json
{
  "type": "insight",
  "input": {
    "symbol": "VCB"
  },
  "analysis": "Nội dung AI trả về",
  "model": "cx/gpt-5.5",
  "as_of": "2026-04-26T10:00:00Z"
}
```

Nếu `include_payload=true`, response có thêm:

```json
{
  "payload": {}
}
```

Mặc định không trả payload vì insight payload có thể lớn.

## Testing bắt buộc

Dùng TDD.

### Test prompt loader

Cần test:

- Load đúng `ai-dashboard.md`.
- Load đúng `ai-industry.md`.
- Load đúng `ai-insight.md`.
- File thiếu thì lỗi rõ.

### Test payload builder

Cần test:

- Dashboard payload có index, breadth, liquidity, flows.
- Industry payload có sector metrics, breadth, leaders.
- Insight payload có OHLCV, MA, support/resistance, supply-demand, foreign, proprietary, insider, news.

### Test AI proxy client

Cần test:

- Gửi đúng URL `/chat/completions`.
- Gửi đúng model `cx/gpt-5.5`.
- Có Authorization header nhưng không leak key trong exception/log.
- Parse đúng `choices[0].message.content`.
- Handle HTTP error.

### Test API endpoints

Cần test:

- Mock service/proxy, không gọi mạng thật.
- Missing `symbol` hoặc `icb_code` trả validation error.
- Response đúng schema.
- `include_payload=false` không trả payload.
- `include_payload=true` có trả payload.

## Verification

Chạy các lệnh sau:

```bash
cd backend
uv run ruff check app tests
uv run pytest
```

Cả hai phải pass.

## Acceptance Criteria

Hoàn thành khi:

- 3 prompt markdown được đọc từ `backend/docs/ai/`.
- Có 3 endpoint hoặc service tương đương cho:
  - Dashboard AI
  - Industry AI
  - Insight AI
- Insight payload dùng dữ liệu cung-cầu thật từ:
  - `/trading/{symbol}/supply-demand`
  - `/trading/{symbol}/supply-demand/summary`
  - `/trading/{symbol}/history`
  - `/trading/{symbol}/summary`
- Không còn thiếu field quan trọng cho 3 AI.
- Không commit API key.
- Không gọi mạng thật trong test.
- `uv run ruff check app tests` pass.
- `uv run pytest` pass.
- Cập nhật docs ngắn gọn mô tả:
  - env vars cần thiết
  - cách gọi 3 endpoint AI
  - ví dụ request/response
