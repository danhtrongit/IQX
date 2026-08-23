# Job nền & lịch chạy

Chương này đặc tả toàn bộ tầng job nền của backend IQX: thứ tự khởi tạo/tắt trong lifespan của
app, từng job theo lịch (job_id, trigger, flag env, điều kiện bỏ qua, side-effect, tính idempotent),
cơ chế khoá chống chạy trùng khi có nhiều worker, và endpoint chạy job thủ công. Chương cũng ghi lại
**một bug production thật** của cơ chế khoá hiện tại (advisory lock cấp session bị leak qua connection
pool) để bản TypeScript không lặp lại, kèm mapping cụ thể sang `@nestjs/schedule` và BullMQ.

Nguồn đã đọc: `app/main.py`, `app/services/jobs/__init__.py`, `app/services/jobs/{alert_scan,expiry_sweep,intl_snapshot_job,ipn_reconcile,market_analysis_job}.py`,
`app/services/alerts/{startup,scan,seeder}.py`, `app/services/realtime/__init__.py`, `app/services/realtime/bridge.py`,
`app/api/v1/endpoints/admin_system.py`, `app/api/v1/endpoints/market_analysis.py`, `app/core/config.py`,
`app/services/ai/market_analysis/{generator,memory,market_calendar}.py`,
`app/services/market_data/{intl_symbols,intl_snapshot}.py`, `app/services/bctc_dashboard/peer_median.py`.

---

## 1. Tổng quan & bản đồ file nguồn

Backend hiện tại dùng **APScheduler 3.11.2** (`AsyncIOScheduler`) nhúng **trong chính process web** —
không có worker riêng, không có message queue, không có job store bền vững. Scheduler là một biến
module-level (`_scheduler`), tạo lúc app startup và huỷ lúc shutdown. Hệ quả quan trọng:

- **Lịch không bền vững**: khởi động lại app → mất toàn bộ trạng thái "đã chạy lần cuối lúc nào".
  Không có khái niệm bù lần chạy bị bỏ (`missed run`) ngoài cơ chế `coalesce` trong bộ nhớ.
- **Mỗi worker uvicorn đều nạp scheduler riêng** → cron nổ ở tất cả worker cùng lúc. Đây là lý do
  tồn tại lớp advisory lock (§7).
- Job chạy trên **cùng event loop** với request HTTP → một job nặng (LLM 30–120 giây, hoặc fetch 43
  symbol Yahoo) làm tăng latency của API trên worker đó.

| File | Vai trò |
|---|---|
| `app/main.py` | `lifespan()` — thứ tự startup/shutdown |
| `app/services/jobs/__init__.py` | Bootstrap scheduler, đăng ký 10 job, `list_jobs()`, `run_job_now()`, `is_running()` |
| `app/services/jobs/expiry_sweep.py` | Job hết hạn gói Premium (mỗi 1 giờ) |
| `app/services/jobs/ipn_reconcile.py` | Job đối soát IPN đơn thanh toán treo (mỗi 6 giờ) |
| `app/services/jobs/alert_scan.py` | Wrapper mỏng → `app/services/alerts/scan.py` |
| `app/services/jobs/market_analysis_job.py` | 4 job AI: EOD 16:30, retry 17:00, midday 11:30, premarket 07:15 |
| `app/services/jobs/intl_snapshot_job.py` | 3 đợt snapshot dữ liệu quốc tế (06:00 / 07:05 / 08:30) |
| `app/api/v1/endpoints/admin_system.py` | `GET /admin/system/status`, `POST /admin/system/jobs/{job_id}/run` |
| `app/api/v1/endpoints/market_analysis.py` | 3 endpoint `run now` riêng cho các bài AI (admin, có audit) |

---

## 2. Vòng đời startup/shutdown trong lifespan

`app/main.py::lifespan` chạy **tuần tự, `await` từng bước**, theo đúng thứ tự sau (không song song):

```
STARTUP
 1. setup_logging()                                  # cấu hình logging trước mọi log khác
 2. settings = get_settings()                         # Settings cache (lru_cache)
 3. log "🚀 Starting {APP_NAME} v{APP_VERSION} ({APP_ENV})"
 4. await market_data.http.startup()                  # tạo httpx.AsyncClient dùng chung
 5. await cache.redis_cache.startup()                 # kết nối Redis + PING (bỏ qua nếu REDIS_ENABLED=false)
 6. await jobs.startup()                              # tạo AsyncIOScheduler + add_job + scheduler.start()
 7. await alerts.startup.alerts_startup()             # seed 10 preset cảnh báo + đăng ký Telegram webhook
 8. await realtime.startup()                          # bật cầu nối DNSE (no-op nếu REALTIME_ENABLED=false)
 ── yield (app phục vụ request) ──
SHUTDOWN (thứ tự NGƯỢC, nhưng KHÔNG có bước ngược của alerts_startup)
 9.  await realtime.shutdown()                        # stop bridge, nhả leader lock nếu đang giữ
 10. await jobs.shutdown()                            # scheduler.shutdown(wait=False)
 11. await cache.redis_cache.shutdown()               # đóng Redis
 12. await market_data.http.shutdown()                # đóng httpx client
 13. log "👋 Shutting down {APP_NAME}"
```

Chi tiết hành vi từng bước cần giữ nguyên khi viết lại:

| Bước | Hành vi bắt buộc | Khi lỗi |
|---|---|---|
| 4. HTTP client | Khởi tạo client dùng chung cho toàn bộ provider dữ liệu thị trường | Không bắt lỗi trong lifespan (lỗi → app không lên) |
| 5. Redis | Nếu `REDIS_ENABLED=false` → log `"Redis cache disabled"` và **return ngay**. Nếu bật: `from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=5, socket_timeout=3, retry_on_timeout=True)` rồi `PING` | Bọc `try/except`: log warning `"Redis cache unavailable, running uncached"`, `_redis = None` → **app vẫn lên, chạy không cache** |
| 6. Jobs | Nếu `JOBS_ENABLED=false` → log `"Scheduler disabled via JOBS_ENABLED=false"`, **không tạo scheduler** (`_scheduler` giữ `None` → `is_running()` = false, `list_jobs()` = `[]`) | Không bắt lỗi |
| 7. Alerts startup | (a) mở session riêng, `seed_alert_signals(db)`; (b) nếu `is_configured()` (có `TELEGRAM_BOT_TOKEN`) **và** `TELEGRAM_WEBHOOK_SECRET` **và** `APP_PUBLIC_URL` → gọi Telegram `setWebhook` tới `{APP_PUBLIC_URL bỏ / cuối}/api/v1/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}` với `secret_token` = chính secret đó, `allowed_updates=["message"]` | Cả (a) và (b) đều bọc `try/except` riêng: (a) log warning `"Alert signal seeding skipped: …"` (chịu đua seed giữa nhiều worker), (b) log warning `"Telegram setWebhook failed: …"`. **Không chặn app** |
| 8. Realtime | `return` ngay nếu `REALTIME_ENABLED=false`. Nếu bật mà `REDIS_ENABLED=false` → log warning `"Realtime requires Redis; REDIS_ENABLED=false — skipping bridge"` và return. Ngược lại `get_bridge().start()` (tạo `asyncio.Task` tên `dnse-bridge`) | Không bắt lỗi |
| 10. Jobs shutdown | `scheduler.shutdown(wait=False)` — **KHÔNG chờ job đang chạy kết thúc**, rồi `_scheduler = None` | — |
| 9. Realtime shutdown | Return ngay nếu `REALTIME_ENABLED=false`; ngược lại `await get_bridge().stop()` — nhả Redis leader lock nếu đang là leader | — |

**Ghi chú quan trọng cho bản TS**

1. Không có bước "shutdown" ứng với `alerts_startup` (webhook Telegram vẫn treo sau khi app tắt) — đúng theo bản gốc, giữ nguyên.
2. `scheduler.shutdown(wait=False)` nghĩa là job đang dở bị bỏ giữa đường khi container bị recreate → mọi job phải chịu được việc bị cắt giữa (xem tính idempotent ở §5).
3. Trong NestJS: bước 4–8 map sang `OnModuleInit`/`OnApplicationBootstrap` của các module tương ứng; thứ tự đảm bảo bằng **thứ tự import module trong `AppModule`** (Nest khởi tạo module theo topological order của dependency) hoặc gom vào một `BootstrapService` gọi tuần tự cho chắc chắn. Bước 9–12 map sang `OnApplicationShutdown` + `app.enableShutdownHooks()`.

---

## 3. Bootstrap scheduler: tham số & mặc định

`jobs.startup()` tạo:

```
AsyncIOScheduler(timezone="UTC")
```

Timezone mặc định của scheduler là **UTC**, nhưng **mọi cron job đều truyền `timezone="Asia/Ho_Chi_Minh"` tường minh**
ở `CronTrigger`. Các job dùng `IntervalTrigger` không phụ thuộc timezone.

Mọi `add_job(...)` đều dùng cùng bộ tham số:

| Tham số | Giá trị | Ý nghĩa cần tái tạo |
|---|---|---|
| `max_instances` | `1` | Không cho 2 lần chạy cùng job chồng nhau **trong cùng process** |
| `coalesce` | `True` | Nhiều lần nổ bị trễ dồn lại → chỉ chạy **1 lần** |
| `replace_existing` | `True` | Đăng ký lại cùng `id` thì ghi đè (an toàn khi reload) |
| `misfire_grace_time` | **không set** → dùng default của APScheduler 3 (**1 giây**) | Nếu event loop bận > 1 giây tại thời điểm nổ, lần chạy đó bị **bỏ** và chỉ log; không tự bù. Đây là một trong các lý do phải có job retry 17:00 |

Số job tối đa = **10** (khi bật hết flag). Với cấu hình mặc định (`ALERTS_ENABLED=false`,
`MARKET_ANALYSIS_ENABLED=false`, `MIDDAY_ANALYSIS_ENABLED=false`, `PREMARKET_ANALYSIS_ENABLED=false`,
`INTL_DATA_ENABLED=false`) thì **chỉ có 2 job** được đăng ký: `expiry_sweep` và `ipn_reconcile_scan`.

Ba hàm tiện ích module-level (dùng cho endpoint admin):

```ts
// Hợp đồng của app/services/jobs/__init__.py
function listJobs(): JobInfo[];        // [] nếu scheduler chưa chạy
function isRunning(): boolean;         // _scheduler != null && _scheduler.running
async function runJobNow(jobId: string): Promise<void>;
//   - scheduler null            → throw ValueError("Scheduler not running")
//   - không tìm thấy jobId      → throw ValueError(`Unknown job id: ${jobId}`)
//   - còn lại: gọi trực tiếp job.func() KHÔNG truyền tham số (bỏ qua trigger/lock của APScheduler)
```

> **Lưu ý dead code:** `run_job_now` được import vào `admin_system.py` nhưng **không endpoint nào gọi**
> (`# noqa: F401 — re-exported for symmetry`). Endpoint chạy thủ công dùng `job_map` riêng chỉ gồm 2 job
> (xem §9). Bản TS nên hợp nhất hai đường này thành một registry duy nhất.

---

## 4. Bảng đầy đủ tất cả job

`job_id` dưới đây là **định danh chính thức** (dùng cho `list_jobs()` và cần giữ nguyên trong bản TS
để dashboard admin không phải sửa).

| job_id | Mô tả | Trigger (giờ ICT = UTC+7) | Flag env bật/tắt | Điều kiện bỏ qua | Side-effect | Idempotent? |
|---|---|---|---|---|---|---|
| `expiry_sweep` | Hết hạn subscription + hạ quyền user | `IntervalTrigger(hours=1)` — mỗi 1 giờ **kể từ lúc app start**, không neo vào đầu giờ | `JOBS_ENABLED` (mặc định `true`) — không có flag riêng | Không có gate nào (chạy cả cuối tuần, cả ngày lễ) | UPDATE `premium_subscriptions.status` → `expired`; UPDATE `users.role` `premium`→`user`; INSERT 1 dòng `admin_audit_log` (`action="system.expiry_sweep"`, `admin_user_id=NULL`); `commit` | **Có** về mặt dữ liệu nghiệp vụ (lần 2 không tìm thấy gì). **Không** về audit log: mỗi lần chạy luôn ghi thêm 1 dòng audit dù `expired_count=0` |
| `ipn_reconcile_scan` | Đối soát đơn `PENDING` treo với log IPN SePay | `IntervalTrigger(hours=6)` — mỗi 6 giờ kể từ lúc app start | `JOBS_ENABLED` | Không có gate | Replay `process_ipn` (→ kích hoạt gói, cộng quyền, có thể gửi email tuỳ tầng premium); UPDATE đơn > 24h thành `FAILED`; INSERT 1 dòng audit `"system.ipn_reconcile_scan"`; `commit` | **Phụ thuộc** `process_ipn` (chống trùng nằm ở tầng thanh toán). Việc đánh `FAILED` là idempotent. Audit luôn ghi thêm dòng |
| `alert_scan` | Quét cảnh báo intraday theo watchlist → gửi Telegram | `IntervalTrigger(minutes=max(ALERT_SCAN_INTERVAL_MINUTES, 1))`, mặc định **10 phút** | `ALERTS_ENABLED` (mặc định `false`) | **Gate giờ giao dịch**: T2–T6 và (09:00–11:30 hoặc 13:00–15:00 ICT) → ngoài giờ trả `{skipped:"market_closed"}`. **KHÔNG kiểm tra ngày lễ** (dùng `is_market_open`, không dùng `is_trading_day`) | INSERT `alert_events` (trước khi gửi), gọi Telegram `sendMessage`, UPDATE `delivered`/`delivery_error`; nhiều `commit` | **Có** — unique constraint `uq_alert_events_user_rule_symbol_date` trên `(user_id, rule_id, symbol, session_date)` + insert-trước-gửi; `IntegrityError` → rollback, coi như worker khác đã bắn |
| `market_analysis_daily` | Sinh bài nhận định VN-Index cuối ngày (EOD) | `CronTrigger(day_of_week="mon-fri", hour=MARKET_ANALYSIS_CRON_HOUR, minute=MARKET_ANALYSIS_CRON_MINUTE, tz=Asia/Ho_Chi_Minh)` → mặc định **16:30 ICT** | `MARKET_ANALYSIS_ENABLED` (mặc định `false`) | `is_trading_day(today ICT)` false (cuối tuần hoặc ngày lễ VN) → `{skipped:"not_trading_day"}`; advisory lock **826101730** đã bị giữ → `{skipped:"locked"}` | Gọi AI proxy tối đa **4 lần** (`max_retries=3` + 1); UPSERT `analysis_history` theo `(session_date, report_type='daily')`, `is_published=true`; DELETE + INSERT lại `analysis_claims`; verify claim cũ + `commit` | **Có** ở mức dòng dữ liệu (UPSERT theo unique key `uq_analysis_session_date_report_type`), nhưng **tốn token LLM mỗi lần chạy** và sinh nội dung khác nhau |
| `market_analysis_daily_retry` | Lưới an toàn: chạy lại EOD nếu 16:30 thất bại | `CronTrigger(mon-fri, MARKET_ANALYSIS_RETRY_HOUR, MARKET_ANALYSIS_RETRY_MINUTE, tz=ICT)` → mặc định **17:00 ICT** | `MARKET_ANALYSIS_ENABLED` (chung flag với job 16:30) | 1) không phải ngày giao dịch → `{skipped:"not_trading_day"}`; 2) đã có `analysis_history` với `session_date=today, report_type='daily', is_published=true` → `{skipped:"already_published"}`; 3) lock **826101732** bị giữ → `{skipped:"locked"}` | Như `market_analysis_daily` | **Có** — tự kiểm tra "đã publish chưa" trước khi làm gì |
| `market_analysis_midday` | Bài "Cập nhật phiên sáng" | `CronTrigger(mon-fri, MIDDAY_ANALYSIS_CRON_HOUR, MIDDAY_ANALYSIS_CRON_MINUTE, tz=ICT)` → mặc định **11:30 ICT** | `MIDDAY_ANALYSIS_ENABLED` (mặc định `false`) | Không phải ngày giao dịch; lock **826101731** bị giữ | UPSERT `analysis_history` với `report_type='midday'`; **không** ghi `analysis_claims` (`persist_claims=false`); **không** nạp memory (`use_memory=false`) | Như trên |
| `market_analysis_premarket` | Bài "Sáng nay cần lưu ý" (trước phiên) | `CronTrigger(mon-fri, PREMARKET_ANALYSIS_CRON_HOUR, PREMARKET_ANALYSIS_CRON_MINUTE, tz=ICT)` → mặc định **07:15 ICT** | `PREMARKET_ANALYSIS_ENABLED` (mặc định `false`) | Không phải ngày giao dịch; lock **826101734** bị giữ | UPSERT `analysis_history` với `report_type='premarket'`; `temperature=0.5` (khác 0.3 của daily/midday); có bước `postprocess` resolve `hot_news[].id`/`events_filtered[].id` từ pool trong payload | Như trên |
| `intl_snapshot_wave1` | Snapshot quốc tế đợt 1 — **toàn bộ** `ALL_SYMBOLS` (gồm crypto qua Binance) | `CronTrigger(mon-fri, hour=6, minute=0, tz=ICT)` — **giờ hardcode, không có env** | `INTL_DATA_ENABLED` (mặc định `false`) | Không phải ngày giao dịch VN; lock **826101733** bị giữ (dùng chung cho cả 3 đợt) | Fetch Yahoo (`fetch_many`) + Binance; UPSERT `market_data_snapshot` theo `(snapshot_date, symbol)`; sao chép dòng cũ với `stale=true` cho symbol thiếu; `commit`; log `ERROR` khi vi phạm ngưỡng chất lượng dữ liệu | **Có** — UPSERT theo `(snapshot_date, symbol)`; chạy lại chỉ ghi đè giá mới |
| `intl_snapshot_wave2` | Đợt 2 — `WAVE2_SYMBOLS` (Á mở sớm + FX + hàng hoá) | `CronTrigger(mon-fri, hour=7, minute=5, tz=ICT)` — hardcode | `INTL_DATA_ENABLED` | Như wave1 (cùng lock 826101733) | Như wave1 (không có crypto trong tập này) | **Có** |
| `intl_snapshot_wave3` | Đợt 3 — `WAVE3_SYMBOLS` (Á mở muộn + ETF Việt Nam) | `CronTrigger(mon-fri, hour=8, minute=30, tz=ICT)` — hardcode | `INTL_DATA_ENABLED` | Như wave1 (cùng lock) | Như wave1 | **Có** |

**Không có job nào khác.** Các vòng lặp nền còn lại **không đi qua scheduler** và không nằm trong bảng trên:

- `realtime` bridge (`asyncio.Task` tên `dnse-bridge`): vòng lặp leader election + stream DNSE, gia hạn
  Redis lock `realtime:leader` mỗi `REALTIME_LEADER_RENEW_SECONDS` (mặc định 10 giây), TTL
  `REALTIME_LEADER_LOCK_TTL` (30 giây). Xem chương realtime.
- `realtime_ws.py` tạo `asyncio.Task` per-connection để forward Redis pub/sub → WebSocket.
- `openapi_stream.py` tạo task keepalive cho kết nối WS DNSE.

---

## 5. Chi tiết hành vi từng job

### 5.1 `expiry_sweep` — hết hạn gói Premium

Thứ tự thao tác (bắt buộc giữ nguyên):

1. `now = now(UTC)`; tính `now_naive` (bỏ tzinfo) để so sánh SQL — lý do trong source: tương thích cả
   SQLite (test) và Postgres.
2. `SELECT` các `premium_subscriptions` có `status = 'active'` **và** `current_period_end < now_naive`.
   Dùng `SELECT` trước (không `UPDATE ... RETURNING`) để lấy `user_id`.
3. Đặt `status = 'expired'` cho từng dòng tìm được (chưa commit).
4. Với **từng** `user_id`: kiểm tra còn subscription nào `status='active'` **và** `current_period_end >= now_naive`
   không (`LIMIT 1`). Nếu còn → **bỏ qua**, không hạ quyền.
5. Nếu không còn: `UPDATE users SET role='user' WHERE id=:uid AND role='premium'`. Điều kiện
   `role='premium'` là **chốt an toàn: tuyệt đối không hạ quyền admin**. Đếm `downgraded_count` theo `rowcount > 0`.
6. INSERT `admin_audit_log`: `admin_user_id=NULL`, `action="system.expiry_sweep"`, `target_entity=NULL`,
   `target_id=NULL`, `payload_after={expired_count, downgraded_count, ran_at}`,
   `note="Auto-expired {N} subs; downgraded {M} users"`.
7. `commit`, log `"Expiry sweep: {summary}"`, trả về summary.

```ts
interface ExpirySweepResult {
  expired_count: number;
  downgraded_count: number;
  ran_at: string;          // ISO 8601, UTC
}
```

### 5.2 `ipn_reconcile_scan` — đối soát IPN treo

1. `cutoff = now(UTC) - 30 phút`; `very_old_cutoff = now(UTC) - 24 giờ` (đều so sánh dạng naive).
2. `SELECT` `premium_payment_orders` có `status='pending'` **và** `created_at < cutoff`, **`LIMIT 100`**.
3. Với **mỗi** đơn: `SELECT` **toàn bộ** `sepay_ipn_logs` có `secret_key_valid = true` và `raw_body IS NOT NULL`,
   `ORDER BY received_at DESC`, rồi **lọc phía ứng dụng**: lấy log đầu tiên có
   `raw_body.order.order_invoice_number == order.invoice_number`.
   > ⚠️ Đây là truy vấn N+1 quét toàn bảng cho mỗi đơn treo (tối đa 100 lần). Bản TS **nên** thay bằng
   > một query duy nhất với điều kiện JSON (`raw_body->'order'->>'order_invoice_number' IN (...)`) —
   > hành vi nghiệp vụ không đổi, chỉ đổi chi phí.
4. Không tìm thấy log khớp:
   - nếu `order.created_at < very_old_cutoff` (> 24h) → `status = 'failed'`, `failed_old++`;
   - ngược lại: để nguyên `pending`.
5. Tìm thấy: `IPNPayload.model_validate(raw_body)` → `PremiumService.process_ipn(payload)`.
   Nếu kết quả có `message == "processed"` → `reconciled++`. Ngoại lệ bất kỳ → log warning
   `"Reconcile failed for invoice {invoice}: {exc}"` và **tiếp tục** đơn kế tiếp (không abort cả job).
6. INSERT audit `action="system.ipn_reconcile_scan"`, `payload_after={attempted, reconciled, failed_old, ran_at}`,
   `note="Reconcile scan: attempted=… reconciled=… failed_old=…"`; `commit`.

```ts
interface IpnReconcileResult {
  attempted: number;
  reconciled: number;
  failed_old: number;
  // CHÚ Ý: giá trị trả về KHÔNG có ran_at (khác payload audit, nơi có ran_at)
}
```

### 5.3 `alert_scan` — quét cảnh báo intraday

Wrapper `run_alert_scan_job()` gọi `run_alert_scan()` **không tham số** → `session=None`, `force=False`.

1. **Gate giờ**: `is_market_open(now ICT)` = `weekday() < 5` **và** (`09:00 ≤ t < 11:30` hoặc `13:00 ≤ t < 15:00`).
   Sai → trả `{skipped: "market_closed"}` ngay, không mở DB session.
   `force=true` (chỉ dùng cho test/thủ công) bỏ qua gate này.
2. Mở session riêng (`get_session_factory()`), rồi `_do_scan`:
   - Lấy **tất cả** `user_alert_rules` đang bật. Rỗng → `{rules:0, symbols_scanned:0, alerts_fired:0}`.
   - Gom rule theo `user_id`; nạp `watchlist_symbols_by_user()`; nạp `users` liên quan.
   - **Universe** = hợp của watchlist của những user **có `telegram_chat_id`** (user chưa liên kết
     Telegram bị loại hoàn toàn — không quét, không ghi event).
   - Với mỗi symbol trong universe: `get_adjusted_ohlcv(symbol, today-420 ngày, today, use_cache=False)`.
     Lỗi fetch → log warning, bỏ symbol đó (không làm hỏng cả lượt quét). `< 60` nến → bỏ.
     Tính `frame` chỉ báo một lần/symbol rồi tái dùng cho mọi rule.
   - Với mỗi (user, symbol trong watchlist của user, rule của user): `evaluate_latest(frame, combination)`.
     Ngoại lệ khi đánh giá → log warning `"Alert eval failed (symbol/rule_id)"`, tiếp tục.
3. `_fire` (thứ tự bắt buộc — **insert trước, gửi sau**):
   - Nếu đã có `alert_events` cho `(user, rule, symbol, today)` → return `false`.
   - INSERT `alert_events` với `delivered=false`, `fired_at=now(UTC)`, `price`, `signal_key=rule.base_signal_key`,
     `session_date=today (ICT)`; `commit`. Nếu `IntegrityError` → `rollback`, return `false`
     (worker khác đã bắn trước).
   - Nếu user có `telegram_chat_id`: gửi `sendMessage` với `parse_mode=HTML`, nội dung
     `"{🟢|🔴} <b>{rule.name}</b> — <b>{symbol}</b>\nGiá: {price làm tròn 0 lẻ, phân cách nghìn}"`
     (🟢 khi `rule.side == buy`, 🔴 khi `sell`). Thành công → `delivered=true`; lỗi →
     `delivery_error = str(exc)[:300]` (cắt 300 ký tự). `commit`.

```ts
type AlertScanResult =
  | { skipped: 'market_closed' }
  | {
      rules: number;
      symbols_scanned: number;   // số symbol có frame hợp lệ (>= 60 nến)
      alerts_fired: number;
      ran_at?: string;           // ISO có offset +07:00; KHÔNG có ở nhánh rules = 0
    };
```

### 5.4 Bốn job AI market-analysis

Khung chung của cả 4 job (`market_analysis_job.py`), thứ tự kiểm tra:

```
today = now(Asia/Ho_Chi_Minh).date()
1. if !is_trading_day(today)  → return { skipped: 'not_trading_day', date: today }
2. if session được truyền vào (test / trigger nội bộ) → chạy generator NGAY, KHÔNG lấy lock
3. (riêng job retry) if đã có bài daily published cho today → return { skipped: 'already_published', date }
4. mở session mới; got = SELECT pg_try_advisory_lock(<key>)
   if !got → return { skipped: 'locked', date }
5. try  { chạy generator }
   finally { SELECT pg_advisory_unlock(<key>); commit }   ← nguồn của bug ở §7
```

`is_trading_day(d)` (từ `market_calendar.py`) = `d.weekday() < 5` **và** `d ∉ VN_HOLIDAYS_2026`.
Tập ngày lễ **hardcode cho năm 2026**: `2026-01-01, 02-16, 02-17, 02-18, 02-19, 02-20, 04-06, 04-30, 05-01, 09-02`.
→ **Cảnh báo bảo trì:** sang 2027 tập này rỗng, mọi ngày T2–T6 đều bị coi là ngày giao dịch. Bản TS nên
đưa danh sách lễ vào bảng cấu hình/DB thay vì hardcode (giữ nguyên giá trị 2026 làm dữ liệu seed).

Khoá advisory theo job:

| Job | Lock key |
|---|---|
| `market_analysis_daily` | `826101730` |
| `market_analysis_midday` | `826101731` |
| `market_analysis_daily_retry` | `826101732` |
| `intl_snapshot_wave1/2/3` | `826101733` (dùng **chung** cho cả 3 đợt) |
| `market_analysis_premarket` | `826101734` |

Generator (chi tiết đầy đủ ở chương AI market-analysis) — phần liên quan tới job:

- Số lần thử: `max_retries=3` → **tối đa 4 lượt gọi LLM**; lượt sau được nối thêm khối
  `"=== SỬA LỖI ==="` liệt kê lỗi validate của lượt trước.
- Chỉ publish khi **không còn lỗi blocking**; lỗi "cosmetic" vẫn publish và được ghi vào
  `meta.validation_warnings`.
- `persist_analysis` **UPSERT** theo `(session_date, report_type)` với `is_published=true`;
  `public_id` = `output.id` hoặc fallback `"vnindex-{date}"` cho daily, `"{report_type}-{date}"` cho
  midday/premarket (vì `public_id` là UNIQUE).
- `persist_analysis` lỗi → log `error` + `db.rollback()`, job vẫn trả về `persisted=false` (không raise).

```ts
type JobSkipReason = 'not_trading_day' | 'locked' | 'already_published';

interface JobSkipped {
  skipped: JobSkipReason;
  date: string;               // 'YYYY-MM-DD' theo ICT
}

interface AnalysisRunSummary {
  session_date: string;       // 'YYYY-MM-DD'
  session_type: string;
  valid: boolean;             // không còn lỗi validate nào
  persisted: boolean;         // đã ghi analysis_history thành công
  memory_loaded: boolean;
  attempts: number;           // 1..4
  errors: string[];
  model: string;
  generation_time_ms: number;
}

type MarketAnalysisJobResult = JobSkipped | AnalysisRunSummary;
```

### 5.5 Ba đợt snapshot quốc tế

Tập symbol (từ `intl_symbols.py`):

| Tập | Nội dung | Số symbol |
|---|---|---|
| `ALL_SYMBOLS` (wave 1) | 8 nhóm: `us_index` 5, `us_futures` 3, `asia_index` 8, `fx` 6, `commodity` 11, `bond` 3, `crypto` 2, `etf` 5 | **43** (docstring trong source ghi "45-symbol universe" — đếm thực tế là 43; tin theo dữ liệu, không theo docstring) |
| `WAVE2_SYMBOLS` (wave 2) | `^N225, ^KS11, ^AXJO` + toàn bộ `fx` (6) + toàn bộ `commodity` (11) | **20** |
| `WAVE3_SYMBOLS` (wave 3) | `^HSI, 000001.SS, 399001.SZ, VNM` | **4** |
| `CRITICAL_SYMBOLS` (dùng cho alert) | `^GSPC, ^N225, DX-Y.NYB, BZ=F, GC=F, VNM` | 6 |

Luồng một đợt (`_run(wave, session)`):

1. `today = now(ICT).date()`.
2. Tách tập yêu cầu thành **crypto** (`BTC-USD`, `ETH-USD`) và **phần còn lại (Yahoo)**.
3. Yahoo: `fetch_many(yahoo_requested)`.
4. Crypto: với mỗi symbol tra bảng `{"BTC-USD": {ticker:"BTCUSDT", name:"Bitcoin"}, "ETH-USD": {ticker:"ETHUSDT", name:"Ethereum"}}`,
   gọi `binance.fetch_ticker(ticker)`; nếu thiếu `last_price` hoặc `price_change` → log warning và **bỏ symbol**;
   `previous_close = last_price - price_change`, `change_value = price_change`,
   `change_percent = data.change_pct` (mặc định `0.0`), `currency="USD"`, `market_state="REGULAR"`.
   Lỗi fetch → log warning, bỏ symbol (sẽ được stale-copy ở bước 6).
5. `parsed = {...yahoo, ...crypto}` (crypto ghi đè Yahoo nếu trùng key).
6. `persist_snapshot_rows(session, today, parsed, requested)`:
   - Loại trước những dòng thiếu **bất kỳ** trong 4 field NOT NULL: `last_price`, `previous_close`,
     `change_value`, `change_percent` (log warning danh sách bị loại).
   - Với symbol hợp lệ: tìm dòng `(snapshot_date=today, symbol)`; có → update tại chỗ, `stale=false`;
     không → INSERT mới, `stale=false`. `asset_category` tra `CATEGORY_BY_SYMBOL`, không có → `"other"` (log warning).
     `market_time` parse từ ISO string, lỗi parse → `null` + log warning.
   - Với symbol **vắng mặt**: lấy dòng mới nhất có `snapshot_date < today` của symbol đó;
     - không có lịch sử → đưa vào `missing[]`;
     - có → copy toàn bộ giá trị sang dòng hôm nay với **`stale = true`** (update nếu dòng hôm nay đã tồn tại, ngược lại INSERT), `stale_copied++`.
   - `commit`; trả `{upserted, stale_copied, missing}`.
7. **Luật cảnh báo chất lượng dữ liệu** (chỉ ghi log, **không** gửi Telegram/email):
   `(len(missing) + stale_copied) > 0.2 * len(requested)` **hoặc** có symbol CRITICAL trong `missing`
   **hoặc** có symbol CRITICAL bị stale → `logger.error("intl_snapshot_job wave=%d: data quality alert — …")`.
8. Kết quả bổ sung `wave` và `date`.

```ts
interface IntlSnapshotOk {
  upserted: number;
  stale_copied: number;
  missing: string[];
  wave: 1 | 2 | 3;
  date: string;              // 'YYYY-MM-DD' ICT
}
type IntlSnapshotResult = IntlSnapshotOk | JobSkipped;   // skipped: 'not_trading_day' | 'locked'
```

---

## 6. "Chạy 1 lần/ngày" vs "chạy theo nhịp"

| Nhóm | job_id | Nhịp | Ghi chú đối chiếu |
|---|---|---|---|
| **1 lần/ngày (T2–T6, ICT)** | `market_analysis_premarket` | 07:15 | Bài trước phiên |
| | `market_analysis_midday` | 11:30 | Bài giữa phiên |
| | `market_analysis_daily` | 16:30 | Bài cuối ngày (EOD) |
| | `market_analysis_daily_retry` | 17:00 | Chỉ chạy thực sự khi 16:30 thất bại |
| | `intl_snapshot_wave1` | 06:00 | Toàn bộ 43 symbol |
| | `intl_snapshot_wave2` | 07:05 | 20 symbol |
| | `intl_snapshot_wave3` | 08:30 | 4 symbol |
| **Theo nhịp (không neo giờ)** | `alert_scan` | mỗi `ALERT_SCAN_INTERVAL_MINUTES` phút (mặc định 10) | Có gate giờ giao dịch bên trong |
| | `expiry_sweep` | mỗi 1 giờ | Chạy 24/7, kể cả cuối tuần & lễ |
| | `ipn_reconcile_scan` | mỗi 6 giờ | Chạy 24/7 |

**Khác biệt hành vi cần chấp nhận (hoặc bù) khi sang TS:** `IntervalTrigger` của APScheduler đếm từ
**thời điểm scheduler start**, nên `expiry_sweep` chạy vào phút thứ 60 sau khi app lên, không phải phút
`:00` của mỗi giờ. Nếu dùng `@Cron('0 * * * *')` thì lịch bị "neo" vào đầu giờ — với 3 job theo nhịp này,
neo giờ **an toàn hơn** (dễ đoán, dễ theo dõi) và không phá nghiệp vụ. Nếu muốn giữ đúng bản gốc, dùng
`@Interval(3_600_000)` / BullMQ `repeat: { every: 3_600_000 }`. **Khuyến nghị: neo giờ** và ghi rõ trong
changelog vận hành.

Thời khoá biểu một ngày giao dịch (ICT), khi bật hết flag:

```
06:00  intl_snapshot_wave1     (43 symbol: Yahoo + Binance)
07:05  intl_snapshot_wave2     (20 symbol)
07:15  market_analysis_premarket   ← đọc snapshot của wave1/wave2
08:30  intl_snapshot_wave3     (4 symbol)
09:00–11:30  alert_scan mỗi 10'  (trong giờ)
11:30  market_analysis_midday
13:00–15:00  alert_scan mỗi 10'
16:30  market_analysis_daily
17:00  market_analysis_daily_retry (no-op nếu 16:30 đã publish)
mọi lúc: expiry_sweep mỗi 1h, ipn_reconcile_scan mỗi 6h
```

---

## 7. Chống chạy trùng nhiều worker — và BUG PRODUCTION đã gặp

### 7.1 Cơ chế hiện tại (Python)

Có **ba** cơ chế khác nhau, cần nắm rõ vì bản TS sẽ hợp nhất lại:

1. **Advisory lock cấp SESSION (Postgres)** — dùng cho 4 job AI + 3 đợt snapshot quốc tế:
   `SELECT pg_try_advisory_lock(:key)` → nếu `false` thì bỏ lượt chạy (`{skipped:"locked"}`);
   `finally: SELECT pg_advisory_unlock(:key)` + `commit`.
2. **Unique constraint DB** — dùng cho `alert_scan`: không khoá gì cả; mọi worker đều quét, nhưng
   `uq_alert_events_user_rule_symbol_date` bảo đảm mỗi (user, rule, symbol, ngày) chỉ bắn 1 lần;
   `IntegrityError` → rollback im lặng. Đây là **mô hình đúng**: idempotent theo dữ liệu, không theo khoá.
3. **Không có gì** — `expiry_sweep` và `ipn_reconcile_scan`: nếu chạy 4 worker song song thì cả 4 đều
   quét; nghiệp vụ vẫn đúng (điều kiện `WHERE status='active'` / `role='premium'` khiến lần sau không
   còn gì để làm) nhưng sẽ có **4 dòng audit trùng nhau mỗi lượt** và `process_ipn` bị replay song song.

> **Mâu thuẫn trong source, cần biết:** docstring `jobs/__init__.py` viết *"We assume uvicorn runs with
> workers=1 (current production config)"*, còn comment trong `market_analysis_job.py` viết *"prod runs
> uvicorn --workers 4, so the cron fires in every worker"*. Repo **không chứa Dockerfile/docker-compose**
> (deploy qua Coolify, cấu hình nằm ngoài repo) → **CHƯA XÁC ĐỊNH số worker thật ở production; cần đọc
> cấu hình deploy Coolify.** Bản TS phải thiết kế cho **N ≥ 2 instance** trong mọi trường hợp.

### 7.2 BUG production: advisory lock cấp session bị leak qua connection pool

**Đây là bug thật, đã xảy ra và đã tái diễn.** Bằng chứng ngay trong source:
`app/services/bctc_dashboard/peer_median.py` (dòng 13–15) ghi:

> "We deliberately never use a session-level lock (`pg_try_advisory_lock`) — those leaked across the
> pool and broke prod for 8 days."

**Triệu chứng:** cron vẫn nổ đúng giờ mỗi ngày, log APScheduler báo chạy xong bình thường, nhưng
**không có dòng nào được ghi vào `analysis_history`**; mọi worker đều log `"lock held by another
worker — skipping"`. Tab "Giữa phiên"/"Trước phiên" trên web đứng yên ở một ngày cũ (đã ghi nhận: bài
midday đứng 8 ngày).

**Nguyên nhân gốc:** `pg_try_advisory_lock` là khoá **cấp session (connection)**. SQLAlchemy async chạy
trên **pool asyncpg**: câu `SELECT pg_try_advisory_lock(...)` giành khoá trên connection `C1`, nhưng
generator bên trong có **nhiều `commit()`/`rollback()` riêng** (nạp memory, verify claim, persist bài);
đến lúc `finally` chạy `pg_advisory_unlock`, câu lệnh có thể được thực thi trên **connection khác** `C2`
→ `unlock` là **no-op** (trả `false`) → khoá vẫn nằm trên `C1` đang idle trong pool. Nếu `C1` không bị
recycle, khoá **bị giữ vĩnh viễn** và **mọi lần chạy tiếp theo của job đó đều skip**.

**Cách chẩn đoán (đưa vào runbook):** join `pg_locks` với `pg_stat_activity` lọc `locktype='advisory'`
— khoá bị leak biểu hiện `granted = true`, `state = 'idle'`, tuổi connection tính bằng **ngày**
(bằng đúng thời gian kể từ lần khởi động backend gần nhất).

**Cách chữa cháy:** recreate container backend → đóng toàn bộ connection ứng dụng → **giải phóng tất cả
advisory lock bị leak**. Sau đó phải trigger lại job để bù bài của ngày hôm đó (nếu còn kịp).

**Đã tái diễn:** sau lần chữa cháy đầu (14/07/2026), khoá leak lại trên một lần recycle connection sau
đó và làm hai bài premarket + midday đứng tiếp (ghi nhận 22/07/2026). Bản Python **chưa** áp bản sửa
dứt điểm.

### 7.3 Bắt buộc với bản TypeScript

**TUYỆT ĐỐI KHÔNG** dùng `pg_try_advisory_lock` + `pg_advisory_unlock` với connection lấy từ pool ORM.
Chọn **một** trong ba phương án sau, theo thứ tự ưu tiên:

| # | Phương án | Cách làm | Ưu / Nhược |
|---|---|---|---|
| **1 (khuyến nghị)** | **BullMQ + `jobId` khử trùng theo ngày** | Producer (repeatable job hoặc `@Cron`) chỉ `queue.add(name, data, { jobId: \`${name}:${todayIct()}\` })`. Redis từ chối job có `jobId` đã tồn tại → **đúng một lần chạy/ngày/cụm**, bất kể bao nhiêu instance | Không cần khoá DB; có retry/backoff, có lịch sử, có dashboard; **cần Redis** (đã có sẵn) |
| **2** | **`pg_advisory_xact_lock` trong 1 transaction bao trọn job** | `BEGIN; SELECT pg_advisory_xact_lock($1); …job…; COMMIT;` — khoá **tự nhả** khi transaction kết thúc (kể cả crash) | Không thể leak. **Nhược:** job không được `commit` giữa đường (commit là nhả khoá) — với job AI hiện có nhiều commit nội bộ thì phải tách "khoá" ra một client riêng hoặc gộp thành 1 transaction |
| **3** | **Redis lock có TTL + gia hạn** | `SET lock:<job>:<date> <workerId> NX EX <ttl>` rồi gia hạn định kỳ; nhả bằng compare-and-delete. Chính là mô hình `realtime:leader` đã chạy tốt trong repo (`REALTIME_LEADER_LOCK_TTL=30`, renew 10s) | Tự hết hạn → **không leak vĩnh viễn**; cần vòng gia hạn nếu job chạy lâu hơn TTL |

Nếu vì lý do nào đó vẫn phải dùng advisory lock cấp session, thì **bắt buộc**: `const client = await pool.connect()`
→ dùng **đúng client đó** cho cả `pg_try_advisory_lock`, toàn bộ job, và `pg_advisory_unlock`, rồi
`client.release()` trong `finally`. Không được để ORM tự chọn connection.

**Quan sát bắt buộc (thiếu ở bản Python — thêm mới):**

- Đếm metric `job.skipped{reason="locked"}`. Nếu một job có `reason="locked"` **hai ngày liên tiếp** →
  báo động: đó chính là dấu hiệu leak/kẹt khoá.
- Health check dữ liệu, không chỉ health check tiến trình: sau `cron + 30 phút`, nếu `analysis_history`
  chưa có dòng cho `(today, report_type)` → cảnh báo. Bug trên tồn tại 8 ngày **vì log job vẫn xanh**.
- Ghi `job_runs` (job_id, started_at, finished_at, status, result JSON, error) — bản Python chỉ có
  audit log cho 2 job hệ thống.

---

## 8. Múi giờ

- Tất cả cron nghiệp vụ dùng **ICT = Asia/Ho_Chi_Minh = UTC+7 cố định, không có DST**.
- Scheduler được tạo với `timezone="UTC"`, nhưng từng `CronTrigger` **ghi đè** bằng
  `timezone="Asia/Ho_Chi_Minh"` → giờ trong bảng §4 là giờ ICT.
- Mọi phép tính "hôm nay" trong job (`is_trading_day`, `session_date`, `snapshot_date`) dùng
  `datetime.now(timezone(timedelta(hours=7))).date()` → **ngày theo ICT**, không phải ngày UTC.
  Đây là điểm dễ sai nhất: 06:00 ICT = 23:00 UTC **ngày hôm trước**.
- `expiry_sweep` và `ipn_reconcile_scan` tính mốc thời gian bằng **UTC** (`datetime.now(UTC)`), so sánh
  với cột timestamp trong DB. Giữ nguyên: DB lưu UTC.

Cấu hình bên TypeScript:

```ts
// KHÔNG set process.env.TZ = 'Asia/Ho_Chi_Minh' — DB và log phải giữ UTC.
export const ICT = 'Asia/Ho_Chi_Minh';

/** 'YYYY-MM-DD' theo ICT — tương đương datetime.now(ICT).date() bên Python */
export function todayIct(now: Date = new Date()): string {
  // 'en-CA' cho khuôn dạng YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: ICT }).format(now);
}

// @nestjs/schedule: truyền timeZone tường minh cho TỪNG cron
@Cron('30 16 * * 1-5', { name: 'market_analysis_daily', timeZone: ICT })

// BullMQ: dùng tz trong repeat options
await queue.add('market_analysis_daily', {}, {
  repeat: { pattern: '30 16 * * 1-5', tz: ICT },
});
```

Bảng đối chiếu cron expression (đều `1-5` = T2–T6):

| job_id | Cron TS |
|---|---|
| `market_analysis_premarket` | `15 7 * * 1-5` |
| `market_analysis_midday` | `30 11 * * 1-5` |
| `market_analysis_daily` | `30 16 * * 1-5` |
| `market_analysis_daily_retry` | `0 17 * * 1-5` |
| `intl_snapshot_wave1` | `0 6 * * 1-5` |
| `intl_snapshot_wave2` | `5 7 * * 1-5` |
| `intl_snapshot_wave3` | `30 8 * * 1-5` |
| `alert_scan` | `*/10 * * * *` (hoặc `every: ALERT_SCAN_INTERVAL_MINUTES * 60_000`) |
| `expiry_sweep` | `0 * * * *` (bản gốc: interval 1h từ lúc boot) |
| `ipn_reconcile_scan` | `0 */6 * * *` (bản gốc: interval 6h từ lúc boot) |

> Giờ của 4 job AI **phải đọc từ env** (`MARKET_ANALYSIS_CRON_HOUR/MINUTE`, …) như bản gốc → không
> hardcode được trong decorator `@Cron`. Dùng `SchedulerRegistry.addCronJob()` lúc bootstrap, hoặc
> BullMQ `repeat.pattern` dựng từ config. Giờ của 3 đợt snapshot quốc tế **là hardcode trong bản gốc**
> (06:00 / 07:05 / 08:30) — nên đưa ra env mới trong bản TS, mặc định giữ nguyên giá trị này.

---

## 9. Endpoint quản trị hệ thống & chạy job thủ công

Router: `app/api/v1/endpoints/admin_system.py`, `prefix="/admin/system"`, nằm dưới `/api/v1`.
Tag OpenAPI: `"Quản trị: Hệ thống"`.

### 9.1 `GET /api/v1/admin/system/status`

- **Quyền:** `AdminUser` (bearer JWT + `role == admin`; chi tiết ở chương xác thực).
- **Hành vi:** đếm `COUNT(*)` 5 bảng, lấy `received_at` mới nhất của `sepay_ipn_logs`, đếm IPN
  `result_status='processed'` trong 24h gần nhất, đọc trạng thái scheduler từ bộ nhớ process.
- **Cảnh báo hiệu năng:** 5 lần `COUNT(*)` không điều kiện — bảng lớn sẽ chậm. Bản TS nên dùng
  `reltuples` hoặc cache 60 giây.
- **Quan trọng:** `scheduler_running` và `jobs` phản ánh **chỉ process đang phục vụ request đó**.
  Với nhiều instance, kết quả là "một trong N" — không phải trạng thái cụm. Bản TS dùng BullMQ nên trả
  trạng thái queue (dùng chung Redis) để con số nhất quán.

```ts
interface JobInfo {
  id: string;
  name: string;
  next_run_at: string | null;     // ISO 8601, null nếu job bị pause
  trigger: string;                // biểu diễn chuỗi của trigger, ví dụ "interval[1:00:00]"
}

interface SystemStatus {
  version: string;                // settings.APP_VERSION
  environment: string;            // settings.APP_ENV
  scheduler_running: boolean;
  jobs: JobInfo[];                // [] khi JOBS_ENABLED=false
  db_stats: Record<'users' | 'subscriptions' | 'payment_orders' | 'ipn_logs' | 'audit_log', number>;
  last_ipn_received_at: string | null;
  last_ipn_processed_count_24h: number;
  generated_at: string;           // ISO, UTC
}
```

### 9.2 `POST /api/v1/admin/system/jobs/{job_id}/run`

- **Quyền:** `AdminUser`. Có `AuditCtx` (IP + user-agent + admin_id) → ghi audit.
- **Danh sách `job_id` HỢP LỆ — chỉ 2 giá trị:**

| `job_id` | Hàm được gọi | Ghi chú |
|---|---|---|
| `expiry_sweep` | `run_expiry_sweep(session=db)` | Nhận **session của request** → dùng chung transaction với audit |
| `ipn_reconcile_scan` | `run_ipn_reconcile_scan(session=db)` | Như trên |

- 8 job còn lại (`alert_scan`, 4 job market-analysis, 3 đợt intl snapshot) **không** chạy được qua
  endpoint này. Ba bài AI có endpoint riêng (§10). **Ba đợt snapshot quốc tế không có endpoint chạy thủ
  công nào** — muốn chạy tay ở production phải `docker exec` vào container. Bản TS **nên** mở rộng
  registry cho đủ 10 job (đây là cải tiến, không phải parity).
- **Truyền session của request** nghĩa là job **bỏ qua advisory lock** (nhánh `session is not None`) và
  chạy trong transaction của request → an toàn cho test, nhưng khi chạy tay ở production **có thể chạy
  song song với lượt cron**. Bản TS nên khoá cả đường thủ công (BullMQ `jobId` giải quyết luôn việc này).
- **Side-effect thêm:** ghi 1 dòng `admin_audit_log` với `action="system.job_run"`,
  `target_entity="job"`, `target_id=<job_id>`, `payload_after=<kết quả job>`,
  `note="Manual trigger of <job_id>"`. Kết quả là **job tự ghi 1 dòng audit của nó** (`system.expiry_sweep`
  / `system.ipn_reconcile_scan`) **cộng thêm** 1 dòng `system.job_run` → 2 dòng audit cho một lần bấm.

```ts
interface RunJobResponse {
  job_id: string;
  result: Record<string, unknown>;   // ExpirySweepResult | IpnReconcileResult
  ran_at: string;                    // ISO, UTC
}
```

- **Lỗi khi `job_id` sai:** ném `NotFoundError(f"Job '{job_id}' not found")` → HTTP **404** với body

```json
{ "detail": "Không tìm thấy Job 'foo' not found", "code": "NOT_FOUND" }
```

> Câu `detail` bị lặp ngữ nghĩa vì `NotFoundError(resource=...)` nhận tham số **vị trí đầu tiên là
> `resource`** và tự ghép thành `f"Không tìm thấy {resource}"`. Bản TS **nên** trả
> `"Không tìm thấy job 'foo'"` (sửa lỗi diễn đạt) nhưng **giữ nguyên** `status=404` và `code="NOT_FOUND"`.
> Nếu ưu tiên parity byte-level cho client cũ thì giữ nguyên chuỗi.

- Không có lỗi 400/409 riêng cho trường hợp scheduler chưa chạy — vì endpoint gọi thẳng hàm job, không
  qua scheduler. `JOBS_ENABLED=false` **vẫn** chạy được job thủ công.

---

## 10. Các endpoint "chạy ngay" của bài AI

Router `app/api/v1/endpoints/market_analysis.py`, `prefix="/market-analysis"` (dưới `/api/v1`).
Cả ba đều **`AdminUser`**, đều ghi audit, và đều **mở session riêng bên trong generator** (không dùng
session của request) để không đụng transaction của request:

| Endpoint | Hàm gọi | `action` audit | `target_entity` / `target_id` | Ghi chú |
|---|---|---|---|---|
| `POST /api/v1/market-analysis/daily/run` | `run_daily_analysis()` | `market_analysis.run` | `market_analysis` / `session_date` | note `"Manual market-analysis generation"` |
| `POST /api/v1/market-analysis/midday/run` | `run_midday_analysis()` | `market_analysis.midday.run` | như trên | note `"Manual midday market-analysis generation"` |
| `POST /api/v1/market-analysis/premarket/run` | `run_premarket_analysis()` | `market_analysis.premarket.run` | như trên | note `"Manual premarket market-analysis generation"` |

Ba endpoint này gọi **generator trực tiếp**, tức là **bỏ qua cả gate `is_trading_day` và advisory lock**
của job wrapper → admin có thể sinh bài vào Chủ nhật hoặc ngày lễ. Đây là hành vi có chủ đích (dùng để
bù bài) → **giữ nguyên**, nhưng bản TS nên log rõ `manual=true` để phân biệt trong lịch sử.

Response `GenerateResult` = **đúng** `AnalysisRunSummary` ở §5.4 (9 field: `session_date`, `session_type`,
`valid`, `persisted`, `memory_loaded`, `attempts`, `errors`, `model`, `generation_time_ms`).

---

## 11. Mapping sang TypeScript: `@nestjs/schedule` vs BullMQ

Nguyên tắc chọn:

- **`@nestjs/schedule` (`@Cron`/`@Interval`)**: chạy in-process, không cần Redis, không retry, không khử
  trùng giữa nhiều instance. **Chỉ dùng khi** job nhẹ, idempotent, và việc chạy trùng ở N instance vô hại
  (hoặc kèm Redis lock).
- **BullMQ**: producer (cron) tách khỏi consumer (worker), có `attempts` + `backoff`, có `jobId` khử trùng,
  có lịch sử/dashboard, chịu được restart. **Dùng cho** job tốn tiền/tốn thời gian hoặc phải chạy đúng một
  lần trên cụm.

| job_id | Cơ chế khuyến nghị | Lý do & tham số cụ thể |
|---|---|---|
| `expiry_sweep` | `@Cron('0 * * * *')` + **Redis lock** (TTL 5 phút) | Nhẹ, idempotent; lock chỉ để tránh 4 dòng audit trùng. Nếu đã có BullMQ thì dùng luôn cho thống nhất |
| `ipn_reconcile_scan` | **BullMQ** — `repeat.pattern='0 */6 * * *'`, `attempts: 3`, `backoff: {type:'exponential', delay: 60_000}`, `jobId` theo cửa sổ 6h | Liên quan **tiền thật** (replay IPN, kích hoạt gói): cần retry, cần lịch sử, cần chống chạy song song |
| `alert_scan` | **BullMQ 2 tầng** | Tầng 1 (`repeat.every = ALERT_SCAN_INTERVAL_MINUTES*60_000`) kiểm tra gate giờ rồi phát **1 job/symbol** (`jobId = alert:<symbol>:<slot>`), tầng 2 worker `concurrency: 5` xử lý. Lý do: bản Python fetch tuần tự toàn bộ universe trên event loop web — nghẽn rõ khi universe lớn. Tính đúng đắn vẫn dựa vào unique constraint, không dựa vào khoá |
| `market_analysis_daily` | **BullMQ** — `repeat.pattern` dựng từ env, `tz: ICT`, `jobId = 'ma:daily:'+todayIct()`, `attempts: 1` | Đắt (tới 4 lượt LLM), phải **đúng 1 lần/ngày/cụm**. `jobId` theo ngày ICT là cách chống trùng đúng — không dùng advisory lock. `attempts: 1` vì generator đã tự retry 4 lượt bên trong |
| `market_analysis_daily_retry` | **BullMQ** — `pattern='0 17 * * 1-5'`, `jobId='ma:daily:retry:'+todayIct()` | **Vẫn giữ job 17:00** dù BullMQ có `attempts`: nó bảo vệ cả trường hợp process chết hẳn lúc 16:30, không chỉ trường hợp job lỗi. Giữ nguyên kiểm tra "đã publish chưa" trước khi chạy |
| `market_analysis_midday` | **BullMQ** — `jobId='ma:midday:'+todayIct()` | Như daily |
| `market_analysis_premarket` | **BullMQ** — `jobId='ma:premarket:'+todayIct()` | Như daily; nhớ `temperature=0.5` |
| `intl_snapshot_wave1/2/3` | **BullMQ** — `jobId='intl:w{n}:'+todayIct()`, `attempts: 3`, `backoff exponential 30s` | Phụ thuộc provider ngoài (Yahoo hay bị 429, Binance) → retry thật sự có giá trị. **Ba đợt phải có `jobId` riêng** (bản Python dùng chung một lock key `826101733` cho cả 3 — nếu một đợt còn chạy khi đợt sau nổ thì đợt sau bị skip; đừng tái tạo hạn chế đó) |

Cấu trúc module đề xuất:

```
src/jobs/
├─ jobs.module.ts                # đăng ký BullModule.forRoot + các queue
├─ job-registry.ts               # JobId union + metadata (mô tả, flag env, cron) — 1 nguồn sự thật
├─ job-lock.service.ts           # Redis lock (SET NX EX + renew + CAD release)
├─ trading-calendar.service.ts   # isTradingDay(), todayIct() — thay market_calendar.py
├─ producers/schedule.producer.ts# cron → queue.add với jobId khử trùng
└─ processors/
   ├─ expiry-sweep.processor.ts
   ├─ ipn-reconcile.processor.ts
   ├─ alert-scan.processor.ts
   ├─ market-analysis.processor.ts   # 4 job dùng chung 1 processor, phân biệt bằng data.kind
   └─ intl-snapshot.processor.ts     # 3 đợt, phân biệt bằng data.wave
```

---

## 12. Code mẫu: một job hoàn chỉnh (`market_analysis_premarket`)

Minh hoạ đầy đủ: cron đọc env → khử trùng bằng `jobId` theo ngày ICT → gate ngày giao dịch → gọi
generator → trả kết quả có kiểu. Không dùng advisory lock cấp session ở bất kỳ đâu.

```ts
// src/jobs/producers/schedule.producer.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Queue } from 'bullmq';
import { ICT, todayIct } from '../trading-calendar.service';

@Injectable()
export class SchedulePremarketProducer implements OnModuleInit {
  constructor(
    private readonly registry: SchedulerRegistry,
    private readonly queue: Queue,              // queue 'market-analysis'
    private readonly config: AppConfigService,  // đọc env đã validate
  ) {}

  onModuleInit(): void {
    if (!this.config.PREMARKET_ANALYSIS_ENABLED) return;   // parity với flag Python

    const hour = this.config.PREMARKET_ANALYSIS_CRON_HOUR;     // default 7
    const minute = this.config.PREMARKET_ANALYSIS_CRON_MINUTE; // default 15
    const job = new CronJob(
      `${minute} ${hour} * * 1-5`,             // T2–T6
      async () => {
        const date = todayIct();
        // jobId khử trùng: Redis từ chối trùng → đúng 1 lần/ngày trên toàn cụm
        await this.queue.add('premarket', { date }, {
          jobId: `ma:premarket:${date}`,
          attempts: 1,
          removeOnComplete: { age: 7 * 24 * 3600 },
          removeOnFail: false,
        });
      },
      null, true, ICT,                          // timeZone = Asia/Ho_Chi_Minh
    );
    this.registry.addCronJob('market_analysis_premarket', job);
  }
}
```

```ts
// src/jobs/processors/market-analysis.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

type Skip = { skipped: 'not_trading_day' | 'locked' | 'already_published'; date: string };

@Processor('market-analysis', { concurrency: 1 })
export class MarketAnalysisProcessor extends WorkerHost {
  private readonly log = new Logger(MarketAnalysisProcessor.name);

  constructor(
    private readonly calendar: TradingCalendarService,
    private readonly generator: MarketAnalysisGeneratorService,
  ) { super(); }

  async process(job: Job<{ date: string }>): Promise<AnalysisRunSummary | Skip> {
    const date = job.data.date ?? todayIct();

    // Bước 1 — gate ngày giao dịch (T2–T6 + không phải ngày lễ VN)
    if (!(await this.calendar.isTradingDay(date))) {
      this.log.log(`Premarket skipped: ${date} is not a VN trading day`);
      return { skipped: 'not_trading_day', date };
    }

    // Bước 2 — KHÔNG có advisory lock: jobId đã bảo đảm 1 lần/ngày/cụm.
    //           Nếu buộc phải khoá thêm, dùng Redis lock có TTL, KHÔNG dùng
    //           pg_try_advisory_lock cấp session (xem chương 09 §7.2 — bug prod).
    const res = await this.generator.runPremarket();   // temperature 0.5, tối đa 4 lượt LLM

    this.log.log(
      `Premarket market-analysis: date=${res.session_date} type=${res.session_type} ` +
      `valid=${res.valid} persisted=${res.persisted} attempts=${res.attempts}`,
    );

    // Cảnh báo dữ liệu (thiếu ở bản Python): publish thất bại phải nhìn thấy được
    if (!res.persisted) {
      this.log.error(`Premarket NOT persisted for ${date}: ${JSON.stringify(res.errors)}`);
    }
    return res;
  }
}
```

Nếu chọn phương án khoá Postgres (§7.3 #2), phần khoá phải trông như sau — **transaction-scoped**:

```ts
// pg_advisory_xact_lock: tự nhả khi COMMIT/ROLLBACK → không thể leak
await dataSource.transaction(async (tx) => {
  await tx.query('SELECT pg_advisory_xact_lock($1)', [826101734]);
  await doTheWork(tx);      // KHÔNG commit giữa đường trong khối này
});
```

---

## 13. Biến env liên quan tới job

| Biến | Kiểu | Default | Ảnh hưởng |
|---|---|---|---|
| `JOBS_ENABLED` | boolean | `true` | `false` → **không tạo scheduler**, không job nào chạy (endpoint chạy tay vẫn hoạt động). Dùng cho test và tắt khẩn cấp |
| `ALERTS_ENABLED` | boolean | `false` | Bật/tắt đăng ký job `alert_scan` |
| `ALERT_SCAN_INTERVAL_MINUTES` | int | `10` | Nhịp quét; giá trị thực tế = `max(value, 1)` |
| `MARKET_ANALYSIS_ENABLED` | boolean | `false` | Bật/tắt **cả** `market_analysis_daily` và `market_analysis_daily_retry` |
| `MARKET_ANALYSIS_CRON_HOUR` | int | `16` | Giờ ICT của job EOD |
| `MARKET_ANALYSIS_CRON_MINUTE` | int | `30` | Phút của job EOD |
| `MARKET_ANALYSIS_RETRY_HOUR` | int | `17` | Giờ ICT của job retry |
| `MARKET_ANALYSIS_RETRY_MINUTE` | int | `0` | Phút của job retry |
| `MIDDAY_ANALYSIS_ENABLED` | boolean | `false` | Bật/tắt job giữa phiên |
| `MIDDAY_ANALYSIS_CRON_HOUR` | int | `11` | Giờ ICT |
| `MIDDAY_ANALYSIS_CRON_MINUTE` | int | `30` | Phút |
| `PREMARKET_ANALYSIS_ENABLED` | boolean | `false` | Bật/tắt job trước phiên |
| `PREMARKET_ANALYSIS_CRON_HOUR` | int | `7` | Giờ ICT |
| `PREMARKET_ANALYSIS_CRON_MINUTE` | int | `15` | Phút |
| `INTL_DATA_ENABLED` | boolean | `false` | Bật/tắt **cả 3** đợt snapshot quốc tế (giờ hardcode) |
| `REDIS_ENABLED` / `REDIS_URL` | boolean / string | `false` / `redis://localhost:6379/0` | Không ảnh hưởng scheduler bản Python, nhưng **bắt buộc** cho BullMQ ở bản TS |
| `TELEGRAM_BOT_TOKEN` | string | `""` | Rỗng → `alert_scan` vẫn INSERT `alert_events` nhưng `send_message` raise → `delivery_error` được ghi |
| `TELEGRAM_WEBHOOK_SECRET` | string | `""` | Thiếu → bỏ qua bước đăng ký webhook lúc startup |
| `APP_PUBLIC_URL` | string | **CHƯA XÁC ĐỊNH default — cần đọc `app/core/config.py` phần APP\_\*** | Thiếu → bỏ qua đăng ký webhook |
| `REALTIME_ENABLED` | boolean | `false` | Bật cầu nối DNSE ở bước 8 của lifespan; cần `REDIS_ENABLED=true` |
| `REALTIME_LEADER_LOCK_TTL` | int (giây) | `30` | TTL Redis lock `realtime:leader` — **mẫu khoá nên copy cho job** |
| `REALTIME_LEADER_RENEW_SECONDS` | int (giây) | `10` | Nhịp gia hạn lock |

---

## 14. Type TypeScript gom lại

```ts
/** Định danh job — giữ nguyên chuỗi để dashboard admin không phải sửa */
type JobId =
  | 'expiry_sweep'
  | 'ipn_reconcile_scan'
  | 'alert_scan'
  | 'market_analysis_daily'
  | 'market_analysis_daily_retry'
  | 'market_analysis_midday'
  | 'market_analysis_premarket'
  | 'intl_snapshot_wave1'
  | 'intl_snapshot_wave2'
  | 'intl_snapshot_wave3';

/** job_id được endpoint POST /admin/system/jobs/{job_id}/run chấp nhận (bản gốc) */
type ManualJobId = 'expiry_sweep' | 'ipn_reconcile_scan';

type JobCadence = 'daily_once' | 'interval';

interface JobDescriptor {
  id: JobId;
  name: string;                 // đúng chuỗi `name` bản gốc (hiện ra ở /admin/system/status)
  cadence: JobCadence;
  cron: string | null;          // null với job theo nhịp
  intervalMs: number | null;    // null với job cron
  enabledBy: string;            // tên biến env cổng bật/tắt
  timeZone: 'Asia/Ho_Chi_Minh' | null;
  tradingDayGate: boolean;      // true = bỏ qua ngày lễ/cuối tuần VN
  marketHoursGate: boolean;     // chỉ alert_scan = true
  legacyAdvisoryLockKey: number | null;   // tham chiếu bản Python; bản TS KHÔNG dùng
}

type JobResult =
  | ExpirySweepResult
  | IpnReconcileResult
  | AlertScanResult
  | MarketAnalysisJobResult
  | IntlSnapshotResult;
```

---

## 15. Checklist nghiệm thu

Kiểm tra hành vi (bản Python có sẵn test tương ứng trong `tests/test_jobs.py`,
`tests/test_daily_retry_job.py`, `tests/test_midday_job.py`, `tests/test_premarket_job.py`,
`tests/test_intl_snapshot_job.py` — bản TS nên có test tương đương):

1. `JOBS_ENABLED=false` → `scheduler_running=false`, `jobs=[]`, không job nào nổ.
2. Bật/tắt từng flag → **đúng** số job được đăng ký (2 khi mặc định, 10 khi bật hết).
3. `expiry_sweep`: sub hết hạn → `expired`; user bị hạ `premium`→`user`; **admin không bị hạ**; user
   còn sub active khác **không** bị hạ; luôn có dòng audit `system.expiry_sweep`.
4. `ipn_reconcile_scan`: đơn `pending` mới < 30 phút **không** bị chạm; đơn > 24h không có IPN → `failed`;
   đơn có IPN khớp → replay `process_ipn`, `reconciled` tăng.
5. Bốn job AI + ba đợt intl: chạy vào Chủ nhật/ngày lễ 2026 → `{skipped:'not_trading_day'}`.
6. Job retry: đã có bài daily published → `{skipped:'already_published'}` (không gọi LLM);
   chưa có → thực sự sinh lại.
7. `alert_scan`: ngoài giờ → `{skipped:'market_closed'}`; gọi 2 lần liên tiếp trong giờ với cùng điều
   kiện → **chỉ 1** `alert_events` (khử trùng theo unique constraint).
8. Chạy **2 instance song song** cho từng job "1 lần/ngày" → đúng **1** dòng dữ liệu được ghi, và
   **không có khoá nào còn sót** sau khi job xong (kiểm tra: `pg_locks` không còn `locktype='advisory'`,
   hoặc key Redis đã hết hạn).
9. Sau khi restart app **20 lần liên tiếp** rồi chạy lại job → **vẫn chạy**, không bao giờ rơi vào trạng
   thái `skipped:'locked'` vĩnh viễn (đây chính là bài test mà bản Python sẽ fail).
10. `POST /admin/system/jobs/khong-ton-tai/run` → 404, `code="NOT_FOUND"`.
11. Không phải admin gọi 2 endpoint admin → 403 (theo chương xác thực).

---

## 16. Điểm CHƯA XÁC ĐỊNH / cần xác nhận trước khi code

1. **Số worker/instance ở production**: hai comment trong source nói ngược nhau (workers=1 vs workers=4),
   repo **không có Dockerfile/docker-compose** → **cần đọc cấu hình deploy Coolify** (biến `CMD`/số
   replica). Ảnh hưởng trực tiếp tới việc có cần khoá phân tán hay không (kết luận an toàn: **có**).
2. **Giá trị default của `APP_PUBLIC_URL`** và các biến `APP_*` — chương này chỉ đọc phần job của
   `app/core/config.py` (dòng ~85–175); cần đối chiếu chương "Cấu hình env" (`05-cau-hinh-env.md`).
3. **`misfire_grace_time`**: không set trong source → mô tả trên dựa vào default của APScheduler 3.x.
   Nếu cần chính xác tuyệt đối, xác nhận lại trong tài liệu APScheduler 3.11.2.
4. **Số symbol của `ALL_SYMBOLS`**: docstring ghi 45, đếm từ dữ liệu ra **43**. Cần chủ dự án xác nhận có
   thiếu 2 symbol so với thiết kế ban đầu hay không (**không tự thêm**).
5. **Ngày lễ sau 2026**: `VN_HOLIDAYS_2026` chỉ có dữ liệu 2026 → cần nguồn dữ liệu lễ cho các năm sau
   trước khi bản TS lên production năm 2027.
6. **Hành vi `process_ipn` khi replay** (chống kích hoạt gói 2 lần, có gửi email hay không) nằm ở chương
   thanh toán/premium — chương này chỉ ghi nhận job **gọi** nó.
