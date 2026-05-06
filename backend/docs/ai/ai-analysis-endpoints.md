# AI Analysis Endpoints

## Biến môi trường cần thiết

```env
AI_PROXY_BASE_URL=http://160.22.123.174:20128/v1
AI_PROXY_MODEL=cx/gpt-5.5
AI_PROXY_API_KEY=<secret>
AI_PROXY_TIMEOUT_SECONDS=120
```

> **Không bao giờ hardcode API key vào source code.** Key được đọc từ `.env` (đã nằm trong `.gitignore`).

---

## Endpoints

### 1. Dashboard AI

```
POST /api/v1/ai/dashboard/analyze
```

Phân tích tổng quan thị trường: trạng thái, dòng tiền, nhóm ngành nổi bật.

**Request:**

```json
{
  "language": "vi",
  "include_payload": false
}
```

**Response:**

```json
{
  "type": "dashboard",
  "input": { "language": "vi" },
  "analysis": "Thị trường đang giữ trạng thái tích cực...",
  "model": "cx/gpt-5.5",
  "as_of": "2026-04-26T10:00:00+00:00"
}
```

---

### 2. Industry AI

```
POST /api/v1/ai/industry/analyze
```

Phân tích ngành ICB: 8 dòng (trạng thái, hiệu suất, dòng tiền, độ rộng, dẫn dắt, điểm yếu, cơ hội, rủi ro).

**Request:**

```json
{
  "icb_code": 8300,
  "language": "vi",
  "include_payload": false
}
```

**Response:**

```json
{
  "type": "industry",
  "input": { "icb_code": 8300, "language": "vi" },
  "analysis": "Trạng thái: Dẫn sóng\nHiệu suất: +2.1%...",
  "model": "cx/gpt-5.5",
  "as_of": "2026-04-26T10:00:00+00:00"
}
```

---

### 3. Insight AI

```
POST /api/v1/ai/insight/analyze
```

Phân tích chuyên sâu cổ phiếu: 6 lớp (xu hướng, cung-cầu, dòng tiền lớn, nội bộ, tin tức, tổng hợp).

**Request:**

```json
{
  "symbol": "VCB",
  "language": "vi",
  "include_payload": false
}
```

**Response:**

```json
{
  "type": "insight",
  "input": { "symbol": "VCB", "language": "vi" },
  "analysis": "Trend: Tăng\nTrạng thái: Mạnh...",
  "model": "cx/gpt-5.5",
  "as_of": "2026-04-26T10:00:00+00:00"
}
```

---

## Tham số `include_payload`

Mặc định `false`. Khi `true`, response sẽ có thêm field `payload` chứa toàn bộ dữ liệu đầu vào đã gửi cho AI. Hữu ích cho debug nhưng payload có thể rất lớn (đặc biệt insight).

## Kiến trúc module

```
app/services/ai/
  __init__.py
  prompt_loader.py      # Đọc prompt markdown từ docs/ai/
  proxy_client.py       # Gọi AI proxy (OpenAI-compatible)
  payloads.py           # Thu thập dữ liệu + tạo payload
  analysis_service.py   # Orchestrate: prompt + payload + proxy

app/api/v1/endpoints/
  ai_analysis.py        # 3 POST endpoints
```

## Prompt files

Prompt được đọc từ file, không hardcode:

```
backend/docs/ai/ai-dashboard.md
backend/docs/ai/ai-industry.md
backend/docs/ai/ai-insight.md
```
