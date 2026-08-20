# Checklist nghiệm thu

Điều kiện để coi bản TypeScript là "đã viết lại xong". Mục tiêu không phải "code chạy được"
mà **tương đương hành vi** với backend Python đang chạy production.

Dùng file này như một checklist thật: tick từng dòng, và với mỗi dòng phải có **bằng chứng**
(output lệnh, ảnh chụp, file kết quả test) — không tick theo cảm nhận.

---

## 0. Trước khi bắt đầu

- [ ] Đã đọc [01 §5](01-kien-truc-va-framework.md) — 5 cái bẫy (bcrypt, chia nguyên tiền,
      advisory lock, golden test, thay numpy).
- [ ] Đã dump `openapi.json` từ backend Python đang chạy và lưu lại làm mốc so sánh.
- [ ] Đã dump golden fixture cho các hàm tính toán (xem §5 bên dưới) **trước khi** xoá
      backend Python.
- [ ] Có DB staging là bản sao production (để `drizzle-kit pull` và để đối chiếu song song).

---

## 1. Độ phủ endpoint

- [ ] Bản TS phục vụ **đúng 293 operation** (gồm **2 route ẩn khỏi OpenAPI**:
      `GET /api/v1/auth/verify-email` và `GET /api/v1/auth/reset-password` — trang HTML mở từ
      link email; thiếu chúng là **vỡ luồng xác thực email và đặt lại mật khẩu**) trong
      [`types/endpoint-manifest.json`](types/endpoint-manifest.json) — cùng method, cùng path.
- [ ] Không có endpoint **thừa** ngoài 293 cái đó (endpoint mới thuộc `/api/v2`).
- [ ] `/api/v1/market-data/ws` (WebSocket) hoạt động.
- [ ] `/media/**` phục vụ file tĩnh.
- [ ] `/docs`, `/redoc`, `/openapi.json` bật/tắt đúng theo `api_docs_enabled`.
- [ ] Giữ **trailing slash** ở `GET /api/v1/users/` và `POST /api/v1/users/`.

**Cách kiểm tự động** — so sánh tập (method, path) giữa hai backend:

```bash
diff <(curl -s http://localhost:8000/openapi.json | jq -r '.paths|to_entries[]|.key as $p|.value|to_entries[]|select(.key|IN("get","post","put","patch","delete"))|"\(.key|ascii_upcase) \($p)"'|sort) <(curl -s http://localhost:3000/openapi.json | jq -r '.paths|to_entries[]|.key as $p|.value|to_entries[]|select(.key|IN("get","post","put","patch","delete"))|"\(.key|ascii_upcase) \($p)"'|sort)
```

---

## 2. Xác thực & phân quyền

- [ ] **Mật khẩu cũ trong DB production đăng nhập được** (bcrypt verify hash `$2b$…`).
      Bằng chứng: test với ≥3 user thật từ DB staging.
- [ ] Access token do bản TS phát **được bản Python chấp nhận** và ngược lại
      (cùng `JWT_SECRET_KEY`, cùng payload `sub`/`iat`/`exp`/`type`). Điều kiện bắt buộc
      để chạy song song.
- [ ] Refresh token rotation đúng: token cũ không dùng lại được; phát hiện reuse xử lý
      đúng như chương 03.
- [ ] Thiếu header `Authorization` → **401** với `detail: "Yêu cầu xác thực"` (không phải 403).
- [ ] User không active → 403 `"Tài khoản chưa được kích hoạt"`.
- [ ] Không phải admin gọi endpoint admin → 403 `"Yêu cầu quyền quản trị viên"`.
- [ ] Không có Premium gọi endpoint premium → 403 `"Yêu cầu gói Premium đang hoạt động"`.
- [ ] **Admin được coi là Premium** (bypass kiểm tra subscription).
- [ ] Kiểm tra từng endpoint trong 293 cái: mức quyền khớp bảng trong chương endpoint
      tương ứng. Đây là chỗ dễ sai nhất — sai một chiều là lỗ hổng, sai chiều kia là chặn oan.

---

## 3. Hợp đồng lỗi

- [ ] Lỗi ứng dụng trả **đúng envelope** `{"detail": string, "code": string | null}`.
- [ ] Mọi mã lỗi trong chương 04 xuất hiện đúng status + đúng `code` + đúng message tiếng Việt.
- [ ] Lỗi validate trả **422** với hình dạng Pydantic `{"detail":[{"type","loc","msg","input"}]}`
      — **không** phải 400, **không** phải hình dạng của class-validator.
- [ ] 401 **có** kèm `WWW-Authenticate: Bearer`. Bản Python từng nuốt header này;
      **đã sửa 2026-08-18** (`app/main.py` forward `exc.headers`) + test chặn hồi quy
      `tests/test_hardening.py::test_401_includes_www_authenticate_header`.
      `ExceptionFilter` của bản TS phải forward headers của exception, không chỉ status + body.
- [ ] Vượt rate limit → 429 với body + header như chương 02.
- [ ] Route không tồn tại → 404 mặc định của framework; method sai → 405.

---

## 4. Quy ước chung

- [ ] `X-Request-ID` echo lại trên **mọi** response (kể cả response lỗi và CORS pre-flight);
      sinh UUID4 nếu client không gửi.
- [ ] CORS đúng theo env; nếu origins chứa `*` thì **tắt** `allow_credentials` + log warning.
- [ ] Middleware theo đúng thứ tự bọc (request-id ngoài cùng).
- [ ] Datetime serialize giống bản Python (so sánh byte-với-byte, xem §7).
- [ ] Cột `NUMERIC` trả về **number** trong JSON (driver TS trả `string` → phải parse).
- [ ] Phân trang: tên tham số, default, max, và hình dạng wrapper giống hệt từng domain
      (chương 02 ghi rõ chỗ nào không nhất quán — **giữ nguyên sự không nhất quán đó**).

---

## 5. Tính toán số học — golden test

Với mỗi nhóm dưới đây: dump input/output từ bản Python ra JSON, rồi assert bản TS khớp.

- [ ] **38 chỉ báo TA** — khớp tới sai số ≤ `1e-9`. Chú ý cách khởi tạo EMA/seed period.
- [ ] **Engine backtest** — đường equity, danh sách giao dịch, và mọi chỉ số hiệu quả.
- [ ] **Phí/thuế `roundBps`** — làm tròn nửa lên bằng số học nguyên, khớp **tuyệt đối**
      (không sai số). Test cả trường hợp đúng nửa đơn vị.
- [ ] **Giá vốn bình quân** — chia lấy sàn số nguyên, khớp tuyệt đối.
- [ ] **T+N settlement** — ngày tiền về / cổ phiếu khả dụng, có tính ngày nghỉ lễ.
- [ ] **KPI BCTC** — cả nhánh ngân hàng và phi ngân hàng, DuPont, forensic score, valuation.
- [ ] **Peer median theo ngành** — cùng tập peer, cùng kết quả.
- [ ] **Chấm điểm danh mục** (8 lớp) và **chấm điểm insight**.
- [ ] **`return_pct`** — Python `round(x, 2)` là làm tròn nửa về số chẵn, **không** phải
      `toFixed(2)`.
- [ ] Hành vi `NaN` và chia-cho-0 khớp bản numpy (lan truyền NaN, `Infinity`).

---

## 6. Dữ liệu & tích hợp ngoài

- [ ] Lược đồ DB do `drizzle-kit pull` khớp chương 06a/06b/06c: đủ 45 bảng, đủ enum,
      đủ index, đủ CHECK constraint.
- [ ] **Không** chạy lại migration Alembic. Bảng `alembic_version` còn nguyên.
- [ ] Mỗi provider trong chương 07: **normalize ra cùng kết quả** với bản Python trên cùng
      input upstream (lưu response upstream thật làm fixture).
- [ ] Fallback đúng cho từng provider: Yahoo 429, MSN 404, provider timeout — trả đúng thứ
      mà bản Python trả (rỗng / null / snapshot cũ / 503), **không** đổi thành lỗi khác.
- [ ] **SePay IPN**: verify signature đúng (có raw body nếu cần), idempotent khi nhận trùng,
      trả đúng response shape mà SePay mong đợi.
- [ ] **Telegram webhook**: secret trong path, xử lý đúng update, trả đúng response.
- [ ] AI proxy: khi LLM lỗi/trả sai định dạng → **fail-closed**, không hiện nội dung bịa.
- [ ] Cache: mẫu key và TTL khớp chương 08; Redis tắt thì app vẫn chạy (fail-open như hiện tại).

---

## 7. Đối chiếu song song (bước quan trọng nhất)

Chạy hai backend cùng lúc trên **cùng một DB staging**, gọi cùng request, so response.

- [ ] Có script đối chiếu tự động cho các endpoint `GET` không side-effect: so JSON đã
      chuẩn hoá (sort key, bỏ field thời gian biến động) và báo mọi khác biệt.
- [ ] Chạy đối chiếu trên **toàn bộ** endpoint `GET` công khai của nhóm market-data
      (~110 endpoint) với ≥20 mã khác nhau (gồm mã ngân hàng, mã có ít dữ liệu, mã mới lên sàn).
- [ ] Chạy đối chiếu cho endpoint cần auth với ≥3 loại user: free, premium, admin.
- [ ] Đối chiếu **ngoài giờ giao dịch** và **trong giờ giao dịch** — nhiều endpoint đổi
      hành vi theo phiên.
- [ ] Đối chiếu với mã **không tồn tại** và tham số **sai** — hình dạng lỗi phải khớp.
- [ ] Mọi khác biệt còn lại đều được **giải thích và ghi nhận có chủ đích** (không có
      khác biệt nào "chưa biết vì sao").

---

## 8. Nghiệp vụ có tiền — kiểm tra riêng

- [ ] Đặt lệnh mua/bán: **toàn bộ chuỗi kiểm tra theo đúng thứ tự** như chương 31;
      mỗi bước fail trả đúng status + message.
- [ ] Lệnh dùng **snapshot cấu hình phí/thuế tại thời điểm khớp**, không đọc lại config
      hiện tại. Test: đổi phí trong admin → lệnh cũ không thay đổi.
- [ ] Sổ cái tiền mặt cân: tổng ledger = tiền hiện có, sau chuỗi ≥50 lệnh ngẫu nhiên.
- [ ] Không thể bán cổ phiếu chưa về (T+N) — test biên.
- [ ] Không thể mua vượt tiền khả dụng — test biên.
- [ ] Huỷ lệnh hoàn đúng số tiền/cổ phiếu đã phong toả.
- [ ] `cash-adjust` với số **âm** cho kết quả đúng (chú ý khác biệt chia lấy sàn với số âm).
- [ ] Vòng đời đơn Premium + subscription đi đúng state machine (chương 21).
- [ ] Gia hạn khi còn hạn cộng dồn đúng mốc.

---

## 9. Cấp 0-8 — chống gian lận

- [ ] `POST /capN/graduate` **kiểm lại mọi điều kiện phía server** trong transaction —
      không tin client. Test: gọi graduate khi chưa đủ điều kiện → bị từ chối ở **mọi** cấp.
- [ ] Cột nullable trả **`null`**, không phải `0` (điểm kỷ luật TB, tỷ lệ thắng…).
- [ ] `POST /capN/kehoach` phát đúng cập nhật tiến độ (không "nuốt" event).
- [ ] Người dùng FREE ở Cấp 0 chỉ giao dịch được trên tài khoản `san_tap`.
- [ ] Gọi endpoint của cấp **chưa mở** (> `CAP_MAX_ENABLED`) → hành vi đúng như chương 32-35.
- [ ] Reset tài khoản giao dịch ảo qua admin có/không xoá tiến độ Cấp — đúng như hiện tại.

---

## 10. Job nền & realtime

- [ ] 7 job chạy đúng giờ **ICT (UTC+7)**, đúng feature flag.
- [ ] Lock chống chạy trùng dùng **`pg_advisory_xact_lock`** hoặc Redis lock —
      **KHÔNG** dùng session-level `pg_advisory_lock` (lỗi đã gặp ở production).
- [ ] Job bỏ qua vì không lấy được lock thì **có log** (bug cũ sống lâu vì im lặng).
- [ ] Chạy 2 instance đồng thời: mỗi job vẫn chỉ chạy 1 lần.
- [ ] Endpoint chạy job thủ công hoạt động với mọi `job_id` hợp lệ; `job_id` sai trả đúng lỗi.
- [ ] WebSocket: subscribe/unsubscribe/ping đúng giao thức; vượt cap symbol trả
      `{"type":"error","detail":"symbol limit reached"}`; channel `index` không tính vào cap.
- [ ] `REALTIME_ENABLED=false` → WS close code **1013**.
- [ ] Client disconnect → demand ref-count giảm đúng, không rò task.

---

## 11. Vận hành

- [ ] Dùng lại **nguyên tên** biến môi trường production hiện tại.
- [ ] Validator production từ chối JWT secret placeholder / ngắn hơn 32 ký tự.
- [ ] Log dạng JSON có `X-Request-ID`, không log secret / token / mật khẩu.
- [ ] Startup/shutdown theo đúng thứ tự (http client → redis → jobs → alerts → realtime,
      shutdown ngược lại).
- [ ] Graceful shutdown: không mất job đang chạy, đóng WS tử tế.
- [ ] Nếu chạy nhiều instance: `/media` đã chuyển sang object storage **hoặc** xác nhận
      chỉ chạy 1 instance (đĩa local không scale ngang).

---

## 12. Bàn giao

- [ ] Bộ test TS có độ phủ ít nhất tương đương 159 file test Python cho các nhánh nghiệp vụ.
- [ ] `/openapi.json` của bản TS sinh ra từ code, không viết tay.
- [ ] README vận hành: cách chạy dev, chạy migration, chạy test, biến env bắt buộc.
- [ ] Danh sách **nợ kỹ thuật đã ghi nhận** (những chỗ giữ nguyên vì tương đương hành vi,
      dự kiến sửa ở `/api/v2`).
- [ ] Kế hoạch rollback: điều kiện nào thì chuyển route ngược về backend Python.
