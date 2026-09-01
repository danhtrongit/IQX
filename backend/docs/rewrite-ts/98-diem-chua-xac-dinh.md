# Điểm chưa xác định — nơi đặc tả còn mềm

Danh sách **194 điểm** mà người viết từng chương đã tự đánh dấu là *chưa xác định được từ source*, hoặc là **suy luận** chứ không phải quan sát chạy thật.

**Đọc file này trước khi implement.** Ở những điểm dưới đây, tài liệu **không phải nguồn sự thật** — phải mở source (hoặc chạy thử) rồi chốt. Đây là điều ngược lại với việc im lặng đoán: mỗi dòng dưới đây là một chỗ mà bịa ra con số sẽ làm bản viết lại sai hành vi.

## Cách dùng

| Ký hiệu | Nghĩa | Việc cần làm |
|---|---|---|
| *CHƯA XÁC ĐỊNH* | Không đọc được từ source | Mở file được trỏ, chốt giá trị, sửa lại chương |
| *suy luận* | Đúng theo logic source nhưng chưa chạy thật | Gọi thử endpoint trên staging để xác nhận |
| *Quyết định cần chủ sở hữu* | Hành vi hiện tại có thể là bug | Hỏi chủ sản phẩm: giữ nguyên hay sửa |

## Cảnh báo về vùng KHÔNG có ghi chú

Các chương sau **không có** danh sách ghi chú — không phải vì chúng chắc chắn đúng, mà vì agent viết chúng bị ngắt bởi giới hạn chi tiêu trước khi kịp báo cáo:

- `11-media-upload.md`
- `21-endpoints-premium-thanh-toan.md`
- `26-endpoints-market-tin-tuc.md`
- `30-endpoints-quan-ly-danh-muc.md`
- `33-endpoints-cap-3-4.md`
- `21b-endpoints-quan-tri-thanh-toan.md`

Với các chương này, hãy **tự soát** kỹ hơn khi implement.

---

## Danh sách theo chương

### [02-quy-uoc-api.md](02-quy-uoc-api.md) — Quy ước API chung

5 điểm.

- Danh sách đầy đủ giá trị enum UserStatus chưa xác định — chỉ xác nhận được 'active' và 'deleted' qua code path (soft_delete đặt status='deleted'); cần đọc class UserStatus trong app/models/user.py
- app/models/market_data_snapshot.py dùng Numeric(18,6)/Numeric(10,4) KHÔNG có asdecimal=False (khác mọi model khác) ⇒ SQLAlchemy trả Decimal; chưa xác định đường serialize này có mất chính xác hay không — cần đọc app/api/v1/endpoints/market_global.py
- Hành vi khi client gửi X-Request-ID dài hơn 40 ký tự: cột admin_audit_log.request_id là VARCHAR(40) nên INSERT sẽ lỗi; chưa xác định có test nào phủ hay có truncate ở tầng service — cần đọc app/services/admin_audit.py
- OpenAPI ghi content-type của GET /api/v1/admin/users/export là application/json (vì thiếu response_class) trong khi thực tế trả text/csv — đã kiểm chứng bằng source, nhưng chưa xác định frontend đang dựa vào spec hay vào hành vi thật
- Bất đối xứng 429 (default-limit không có CORS/X-Request-ID, decorator-limit thì có) đã kiểm chứng bằng TestClient; chưa xác định frontend hiện đang xử lý hai đường này ra sao ⇒ cần quyết định giữ parity hay chuẩn hoá

### [03-xac-thuc-phan-quyen.md](03-xac-thuc-phan-quyen.md) — Xác thực & phân quyền

8 điểm.

- Cost (rounds) bcrypt thực tế của hash đang nằm trong DB: source không truyền bcrypt__rounds nên dùng default của passlib. Tài liệu passlib 1.7.x ghi default_rounds=12 nhưng KHÔNG đọc được từ repo — phải kiểm tra prefix $2?$NN$ của users.hashed_password trên prod trước khi migrate.
- Nội dung regex `_PLACEHOLDER_PATTERNS` dùng để chặn JWT secret placeholder khi APP_ENV=production — chỉ đọc được phần sử dụng ở model_validator, chưa đọc phần khai báo module-level trong app/core/config.py.
- Body JSON chính xác của lỗi 422 (field `errors` trong ErrorResponse) — cần đọc handler RequestValidationError trong app/main.py (chỉ đọc được handler AppException).
- Body JSON chính xác của lỗi 429 — do slowapi `_rate_limit_exceeded_handler` (thư viện ngoài) quyết định, không nằm trong repo.
- HTML chính xác của trang verify-email result và form reset-password, cùng nội dung HTML/text 2 email — cần đọc app/services/email_templates.py.
- SUY LUẬN (không phải comment trong source): revoke_family() ở nhánh family-mismatch và replay của AuthService.refresh_tokens bị ROLLBACK vì get_db rollback khi exception, và FastAPI ném HTTPException vào điểm yield của dependency. Đã đánh dấu rõ trong tài liệu là suy luận + khuyến nghị commit riêng trước khi throw; nên xác minh bằng test tích hợp trước khi coi là chuẩn.
- Bảng users KHÔNG có cột freeze nào (đã grep freeze|frozen|is_frozen toàn repo) — yêu cầu đề bài giả định có; tài liệu ghi rõ freeze chỉ tồn tại trên virtual_trading_accounts (frozen_at/frozen_by_user_id/freeze_reason), còn khóa ở mức user là cột users.status.
- Không tồn tại endpoint tự đổi mật khẩu khi đã đăng nhập, không có resend-verification cho user tự gọi, không có OAuth/2FA, và WebSocket realtime là public (không auth) — đã ghi vào mục 12.10.

### [04-loi-va-ma-loi.md](04-loi-va-ma-loi.md) — Lỗi & mã lỗi

8 điểm.

- Pydantic `extra` policy từng schema (ignore vs forbid): grep chỉ thấy `model_config = {"from_attributes": True}` ở response model, chưa thấy `extra=` ở request model — CHƯA XÁC ĐỊNH, cần đọc toàn bộ app/schemas/*.py để biết NestJS phải cấu hình `whitelist`/`forbidNonWhitelisted` thế nào (đã ghi vào mục 14.2 điểm 3)
- IP thật cho rate-limit key: `slowapi.util.get_remote_address` đọc `request.client.host`; đằng sau reverse proxy của Coolify chưa rõ có `--proxy-headers`/`X-Forwarded-For` hay không — cần đọc cấu hình hạ tầng (đã ghi mục 6.4)
- Quyết định cần chủ sở hữu: 500 hiện trả `text/plain "Internal Server Error"` (không JSON, không X-Request-ID, không CORS header). Giữ bug-compatible hay đổi sang JSON? (mục 7.3)
- Quyết định cần chủ sở hữu: message 502/503 của market-overview/sector/screening/ai-news là TIẾNG ANH và có thể echo URL upstream ra client (`Expected dict from {url}, got {type}`, `GET {path}: {exc}`). Giữ nguyên hay thay bằng câu tiếng Việt trung tính? (mục 10.3)
- Bug bảo mật thật: `revoke_family()` ở 2 nhánh refresh-token (family mismatch, replay) KHÔNG commit, nên bị `get_db` rollback khi raise 401 → token không thực sự bị thu hồi. Cần quyết định sửa (khuyến nghị) hay bug-compatible; test hiện tại có thể đang khẳng định hành vi cũ (mục 12.3)
- Audit log của route admin nằm cùng transaction nên bị rollback khi route lỗi → hành động admin thất bại không để lại audit trail. Giữ hay sửa? (mục 12.5)
- Danh sách `PydanticErrorType` trong doc chỉ gồm các type QUAN SÁT ĐƯỢC khi chạy thật với schema của repo; Pydantic v2 còn nhiều type khác chưa được liệt kê (đã giữ `type: string` trong interface để không vỡ)
- Bug hiện trạng cần xác nhận trước khi sửa: `watchlist.py:76` và `admin_system.py:115` truyền câu đầy đủ vào tham số `resource` của `NotFoundError` nên message bị prefix thành câu tối nghĩa ("Không tìm thấy Mã VNM không có trong danh sách", "Không tìm thấy Job 'x' not found"). tests/test_watchlist.py đang assert message này

### [05-cau-hinh-env.md](05-cau-hinh-env.md) — Cấu hình & biến môi trường

6 điểm.

- Giá trị env production thực tế không có trong repo — backend/.env local chỉ chứa 27 biến (dev). Muốn biết production bật flag nào phải đọc cấu hình trên host Coolify; CHƯA XÁC ĐỊNH từ source.
- REDIS_TTL_AI_ANALYSIS_SECONDS: đã xác nhận không còn consumer và TTL thật do _get_analysis_ttl() tính (BCTC = 7*24*3600, còn lại = số giây tới hết phiên, sàn 3600). Chi tiết từng nhánh của _ttl_until_end_of_session() (mốc 15:00) cần đọc app/services/ai/analysis_service.py nếu chương AI cần chính xác.
- pool_size=10 / max_overflow=20 của SQLAlchemy engine là hard-code, KHÔNG có biến env. Nếu bản TS muốn cấu hình qua env thì đó là biến mới, không có tương đương ở bản gốc — cần quyết định của người viết spec.
- Bất đối xứng realtime: app/services/realtime/__init__.py yêu cầu cả REALTIME_ENABLED và REDIS_ENABLED, nhưng endpoint WS (app/api/v1/endpoints/realtime_ws.py) chỉ kiểm REALTIME_ENABLED → khi Redis tắt, client vẫn kết nối được nhưng không có dữ liệu. Chưa rõ đây là cố ý hay bug; nếu bản TS sửa thì phải ghi changelog.
- Docstring app/core/rate_limit.py nói rate limit tắt khi TESTING=1, nhưng code chỉ đọc APP_ENV — TESTING không được đọc ở bất kỳ đâu. Đã kết luận docstring lỗi thời, nhưng nếu ops đang dựa vào TESTING=1 thì cần xác nhận lại với người vận hành.
- MARKET_DATA_TIMEOUT_SECONDS và 4 biến MARKET_DATA_CACHE_* (trừ MAX_SIZE) không có consumer nào. Chưa rõ chúng từng được dùng rồi bị bỏ hay chưa bao giờ được nối; nếu bản TS muốn nối MARKET_DATA_TIMEOUT_SECONDS vào HTTP client thì đó là thay đổi hành vi, cần quyết định.

### [06a-csdl-nguoi-dung-thanh-toan.md](06a-csdl-nguoi-dung-thanh-toan.md) — CSDL — người dùng, thanh toán, bài học, audit

10 điểm.

- REFRESH_TOKEN_EXPIRE_DAYS: công thức expires_at = now() + N ngày đã xác nhận trong app/services/auth.py, nhưng giá trị default của env chưa đọc — cần app/core/config.py
- Env SePay/app (APP_PUBLIC_URL, SEPAY_MERCHANT_ID, SEPAY_SECRET_KEY, SEPAY_CHECKOUT_URL, JOBS_ENABLED, ALERTS_ENABLED): tên biến đã xác nhận dùng trong app/services/premium.py và app/services/jobs/__init__.py, giá trị default chưa xác định — cần app/core/config.py
- Nguồn giá trị so sánh header X-Secret-Key của endpoint IPN chưa xác định — cần app/api/v1/endpoints/premium.py (~dòng 150-200) + app/core/config.py
- Trần page_size cho các endpoint danh sách chưa xác định (chỉ biết default page_size=50 của audit log) — cần app/schemas/common.py, app/schemas/lesson.py
- Storage backend cho episodes.file_url / courses.thumbnail_url (base URL, quy tắc tên file) chưa xác định — cần app/services/lesson/storage.py
- Danh sách op destructive bắt buộc có `note` chưa xác định — cần app/schemas/admin_subscriptions.py, app/schemas/admin_payments.py
- Tiêu chí reconcile chính xác của run_ipn_reconcile_scan / AdminIPNService.reconcile chưa xác định — cần app/services/jobs/ipn_reconcile.py, app/services/admin_ipn.py
- Thứ tự cột vật lý của bảng users trong DB production khác thứ tự logic trong tài liệu (full_name và telegram_* được ALTER TABLE thêm vào cuối) — không ảnh hưởng rewrite nhưng ảnh hưởng nếu so sánh pg_dump
- Drizzle API dùng dạng array-return cho tham số thứ ba của pgTable; bản Drizzle cũ dùng dạng object-return — chưa cố định phiên bản Drizzle của dự án TS
- Tên FK constraint sinh bởi .references() inline của Drizzle không khớp mẫu fk_<table>_<col>_<reftable> của Python; đã ghi chú cách dùng foreignKey({name}) nhưng ví dụ trong chương dùng dạng inline

### [06b-csdl-giao-dich-canh-bao.md](06b-csdl-giao-dich-canh-bao.md) — CSDL — giao dịch ảo, cảnh báo, watchlist

9 điểm.

- Đơn vị của alert_events.price (kVND hay VND): code gán float(data.close[-1]) từ get_adjusted_ohlcv; nguồn VNDIRECT trả kVND còn VCI trả VND — cần đọc app/services/ta/data.py
- Hình dạng chính xác của chart_drawings.state: docstring model nói LineToolsAndGroupsState từ getLineToolsState(), nhưng ghi chú dự án nói hiện thực dùng widget.save()/saved_data; backend không validate — cần đọc code frontend
- Danh sách id factor hợp lệ trong backtest_strategies.config.buy/sell.factors[].id — cần đọc app/services/ta/catalog.py
- Chi tiết validate_combination (điều kiện bị từ chối + message lỗi) — cần đọc app/services/ta/conditions.py đầy đủ
- Chu kỳ chạy thật của job quét cảnh báo (docstring nói ~10 phút, cấu hình APScheduler nằm ở app/services/jobs/)
- Cột NOT NULL không có DEFAULT ở DB (initial_cash_vnd, buy/sell_fee_rate_bps, sell_tax_rate_bps, board_lot_size, cash_reserved/pending_vnd, quantity_*, avg_cost_vnd): giá trị mặc định chỉ tồn tại trong code Python — bản TS phải tự cấp, đây là rủi ro INSERT vi phạm NOT NULL
- Ý định thiết kế của các dead column: virtual_orders.expires_at, virtual_trading_accounts.scope_type/scope_id (có cột, không code nào đọc/ghi)
- Không có unique partial index cho virtual_trading_configs.is_active → 2+ dòng active sẽ làm get_active_config ném MultipleResultsFound (500); chưa rõ có ràng buộc vận hành nào ngăn việc này
- Ledger không cân đối ở chế độ T2 (settle không ghi ledger; balance_after_vnd của dòng bán T2 chưa gồm proceeds) — chưa rõ đây là chủ ý sản phẩm hay bug tồn đọng

### [06c-csdl-cap-va-phan-tich.md](06c-csdl-cap-va-phan-tich.md) — CSDL — Cấp 0-8 & phân tích AI

8 điểm.

- KHÔNG có CHECK constraint nào trong 20 bảng — nhiệm vụ nói "bảng cap* có nhiều CHECK, liệt kê ĐỦ kèm biểu thức", nhưng grep toàn bộ app/models/ và alembic/versions/ chỉ thấy CheckConstraint ở app/models/lesson.py (bảng episodes, ngoài phạm vi). Tôi ghi rõ là không có thay vì bịa ra biểu thức; mọi ràng buộc miền giá trị (muc_tu_tin ∈ {1,2,3}, luc_doc_user, o_4, so_lop_dong_thuan 0-5, hanh_vi_canh_bao) được kiểm ở tầng service Python.
- Nhiệm vụ nói Numeric asdecimal=False ở "cap1, cap5, cap7, cap8" — thực tế app/models/cap7.py và cap8.py KHÔNG có cột Numeric nào; các cột đó (luc_chi_so Numeric(18,6), don_nganh_pct/tong_rui_ro_pct Numeric(9,4)) được khai trong app/models/cap1.py trên class OrderKehoach. Đã ghi rõ điều này trong chương.
- order_kehoach.snapshot_lop_du_lieu (JSON, Cấp 1): KHÔNG có schema server-side nào. app/schemas/cap1.py khai `snapshot: dict[str, Any] | None` và service gán thẳng vào cột. Tôi để type là Record<string, unknown> và ghi rõ là free-form do client gửi, thay vì bịa shape.
- Hình dạng JSON trên wire của 6 cột NUMERIC của market_data_snapshot (Decimal ở Python vì KHÔNG có asdecimal=False, trái với annotation Mapped[float]): phụ thuộc serializer của endpoint dữ liệu quốc tế mà tôi chưa đọc. Đã đánh dấu "CHƯA XÁC ĐỊNH — xem app/services/market_data/intl_snapshot.py" và schema endpoint tương ứng.
- Chuỗi cascade khi xóa users: cap0_order_kehoach/order_kehoach/order_ketso KHÔNG trỏ tới users mà cascade từ virtual_orders. Cascade của chính virtual_orders nằm ở chương lược đồ demo trading — đã đánh dấu CHƯA XÁC ĐỊNH thay vì suy đoán.
- Mapping chi tiết task_2_done_at của cap1_progress sang điều kiện nghiệp vụ: model chỉ ghi "derived from source rows — see app/services/cap1/service.py". Tôi trỏ về file đó thay vì đoán điều kiện.
- Đã sửa 2 chỗ sau khi verify lại source (không phải suy đoán nữa): (a) so_lan_khong_duoi_theo_co đếm co_canh_giac_lenh_gia AND hanh_vi_co == 'cho_xac_nhan', KHÔNG phải "khác mua_duoi_theo" — lệnh có cờ mà hanh_vi_co IS NULL không được tính; (b) NGUONG_CUNG_AP_DAO = 1.0/NGUONG_CAU_AP_DAO (1.5), là giá trị suy ra chứ không phải hằng rời.
- Thứ tự cột vật lý trong DB: tôi dựng CREATE TABLE theo thứ tự migration (cột ALTER TABLE ADD COLUMN nằm ở cuối), nên khác thứ tự khai trong model Python. Đã ghi rõ ở Quy ước chung §11, nhưng nếu prod từng bị dump/restore thì thứ tự thật có thể khác.

### [07-tich-hop-ngoai.md](07-tich-hop-ngoai.md) — Tích hợp nhà cung cấp ngoài

6 điểm.

- Hình dạng response upstream đầy đủ của một số endpoint chỉ được suy ra từ các key mà code truy cập (VCI LEData intraday, AccumulatedPriceStepVol, VCI /v1/events, KBS /profile, Fmarket /filter, MBK reportdatatopbynormtype) — chưa có payload thật capture lại. Cần chạy curl thật để bổ sung ví dụ nếu bản TS cần fixture test.
- Giới hạn 'MSN trả 404' được nêu trong yêu cầu nhưng KHÔNG có guard 404 tường minh nào trong msn.py; cơ chế né thực tế chỉ là allow_empty=true ở endpoint world-index/forex và fallback MSN sau Binance cho crypto_ohlc. Nếu cần mô tả chính xác hơn phải đọc log prod.
- Tên field camelCase thật do MBK trả về chưa xác minh — tài liệu chỉ mô tả luật biến đổi (snake_case + xoá 'tern_', 'norm_', 'term_', 'from_', '_code'). Luật này có thể tạo key trùng/ghi đè; hành vi đó chưa được test bao phủ.
- Danh sách endpoint nội bộ theo provider ở §30 lấy từ docs/market-data-source-map.md (cập nhật 2026-04-26) đối chiếu với router hiện tại; có thể lệch nhẹ so với danh mục hợp đồng hiện hành trong `types/endpoint-manifest.json` và [ch90](90-danh-muc-endpoint.md). Cần đối chiếu lại nếu dùng làm checklist nghiệm thu.
- Category 'USER' trong response GET /v1/setting/screeners chỉ xuất hiện khi request có auth Vietcap; backend không gửi token nên thực tế chỉ nhận SYSTEM — chưa xác minh bằng call thật.
- docs/vietcap-market-overview-api.md có nhắc 2 endpoint Vietcap CMS (www.vietcap.com.vn/api/cms-service/v1/config/industry và file tĩnh sector.json) nhưng KHÔNG có source module nào trong backend gọi chúng; đã cố ý không đưa vào chương như provider đang dùng.

### [08-cache.md](08-cache.md) — Tầng cache

7 điểm.

- Cấu hình `maxmemory` / `maxmemory-policy` của Redis production không nằm trong repo backend (`REDIS_URL` chỉ là DSN) — cần đọc hạ tầng Coolify. Nếu policy là `noeviction`, `SET` sẽ lỗi và bị `except` nuốt → cache im lặng ngừng ghi.
- Số worker/process uvicorn ở production (quyết định mức nghiêm trọng của cache stampede và mức lệch giữa các bản in-memory) — cần đọc Dockerfile/compose/command deploy, không có trong các file đã đọc cho chương này.
- Redis production có dùng chung với hệ thống khác hay không — quyết định việc có cần namespace hoá các key không có prefix `iqx:` (`tg_link:`, `mkt:msn:apikey`, `realtime:*`, `rt:*`). Cần đọc env production.
- Ý định gốc của nhóm `MARKET_DATA_CACHE_*`: 4/5 biến (`ENABLED`, `TTL_REFERENCE`, `TTL_REALTIME`, `TTL_HISTORY`) chưa từng được code nào đọc, và `TTLCache` in-memory không được nối vào endpoint nào (chỉ tests dùng). Không rõ đây là tính năng bị bỏ dở hay đã bị Redis thay thế — cần chủ dự án xác nhận trước khi xoá khỏi `.env`.
- `REDIS_TTL_AI_ANALYSIS_SECONDS = 1800` là dead config (chỉ còn trong docstring `analysis_service.py`); TTL thật do `_get_analysis_ttl()` tính (bctc = 604800, còn lại = số giây tới 15:00 VN, sàn 3600). Chưa rõ 1800s có phải hành vi mong muốn ban đầu hay không — tài liệu đặc tả theo hành vi đang chạy.
- `_ttl_until_end_of_session()` không biết cuối tuần/ngày lễ và có sàn 3600 khiến TTL vượt mốc 15:00 khi request đến sau 14:00 — chưa rõ đây là chủ ý hay bug chấp nhận được; cần quyết định trước khi port.
- Sai lệch định dạng datetime giữa cache HIT và MISS: `cache_set_json` dùng `json.dumps(default=str)` (dấu cách) còn FastAPI serialize bằng `isoformat()` (chữ T). Hiện chưa lộ ra vì các endpoint trả dict thô không chứa `datetime`, nhưng chưa rà hết 74 endpoint từng field.

### [09-cron-jobs.md](09-cron-jobs.md) — Job nền & lịch chạy

7 điểm.

- Số worker/instance thật ở production: docstring app/services/jobs/__init__.py ghi 'workers=1', comment app/services/jobs/market_analysis_job.py ghi 'uvicorn --workers 4' — repo KHÔNG có Dockerfile/docker-compose nên không xác nhận được; cần đọc cấu hình deploy Coolify
- Default của APP_PUBLIC_URL (và các biến APP_*) chưa đọc — chỉ đọc phần job của app/core/config.py dòng ~85–175; cần đối chiếu 05-cau-hinh-env.md
- misfire_grace_time không được set trong source; mô tả 'default 1 giây' dựa trên default của APScheduler 3.x (đã cài 3.11.2), chưa xác minh trong tài liệu thư viện
- ALL_SYMBOLS: docstring intl_symbols.py ghi 'universe 45 symbol' nhưng đếm thực tế từ dữ liệu là 43 (5+3+8+6+11+3+2+5) — cần chủ dự án xác nhận có thiếu 2 symbol so với thiết kế
- VN_HOLIDAYS_2026 chỉ có dữ liệu ngày lễ năm 2026 (hardcode) — chưa có nguồn cho 2027+, is_trading_day sẽ coi mọi ngày T2–T6 của 2027 là ngày giao dịch
- Hành vi chi tiết của PremiumService.process_ipn khi bị replay bởi job ipn_reconcile (chống kích hoạt gói 2 lần, có gửi email hay không) chưa đọc — thuộc chương thanh toán/premium
- Ba đợt intl snapshot dùng CHUNG lock key 826101733; không rõ đây là cố ý hay sơ suất (waves cách nhau xa nên chưa gây lỗi thực tế)

### [10-realtime-websocket.md](10-realtime-websocket.md) — Realtime WebSocket

7 điểm.

- Danh sách mã chỉ số hợp lệ cho channel `index`: docstring app/services/realtime/schemas.py:9-10 chỉ liệt kê 'VNINDEX, VN30, HNX, HNX30, UPCOM, VN100...' kèm dấu ba chấm; KHÔNG có whitelist trong code nên mọi chuỗi đều được nhận. Muốn danh sách chuẩn phải đọc tài liệu DNSE hoặc app/services/market_data/.
- Thứ tự bậc giá trong `bids`/`asks`: normalize_orderbook giữ nguyên thứ tự upstream, không sort. Việc DNSE có luôn gửi bậc tốt-nhất-trước hay không: không xác định được từ source.
- Hành vi chính xác của uvicorn khi `ws.close(code=1013)` được gọi TRƯỚC `ws.accept()` — client có thể chỉ thấy handshake bị từ chối (HTTP 403) thay vì đọc được close code 1013. Phụ thuộc phiên bản uvicorn, cần kiểm tra thực tế nếu frontend phân biệt hai trường hợp.
- Frontend xử lý cờ `degraded: true` (tick từ VCI polling) như thế nào: code nằm ở repo dashboard/, không có trong backend.
- Thư viện `websockets` (dùng trong app/services/realtime/openapi_stream.py) KHÔNG được khai báo tường minh trong pyproject.toml — suy luận là vào qua uvicorn[standard]/fastapi[standard]; chưa xác nhận bằng lockfile.
- Sai lệch làm tròn: Python `round()` là round-half-to-even còn JS `Math.round()` là round-half-up, nên `_to_vnd` có thể lệch 1 VND ở giá có phần thập phân đúng .5 sau khi ×1000. Đã ghi chú trong tài liệu nhưng chưa đo mức độ xảy ra thực tế.
- `demand.clear()` (app/services/realtime/demand.py:82) và `dnse_auth.reset_cache()` (dnse_auth.py:106) được định nghĩa nhưng KHÔNG được gọi ở bất kỳ đâu trong app/ hay tests/ (đã grep) — hệ quả là hash `realtime:demand` (không TTL) sẽ rò demand khi process bị SIGKILL. Chiến lược sửa cho bản TS được nêu ở §12 dưới dạng khuyến nghị, chưa phải hành vi hiện có.

### [20-endpoints-auth-users.md](20-endpoints-auth-users.md) — Endpoint — Auth, Users, Health

6 điểm.

- Refresh-token replay protection is broken in the current source: AuthService.refresh_tokens calls revoke_family() then raises UnauthorizedError immediately, so get_db rolls the revoke back and the family is never actually invalidated in the DB. I documented it as a bug to fix in the TS rewrite rather than behaviour to preserve — needs a product decision confirming the rewrite should commit the revoke in a separate transaction.
- POST /auth/login returns 'Trạng thái tài khoản: deleted' / ': suspended' when the password is correct, which leaks account existence and state (get_by_email does not filter deleted, unlike get_by_id). Recorded as current behaviour, but it contradicts the deliberate no-enumeration design of forgot-password; unclear whether frontend depends on these exact messages before it can be tightened.
- PATCH /users/{user_id} audit diff only snapshots keys present in the request body, so the three derived phone columns (phone_country_code, phone_national_number, phone_e164) written by admin_update never appear in admin_audit_log before/after. Documented as-is; unclear whether the incomplete audit trail is intentional.
- PATCH /users/{user_id} with is_email_verified=true sets the boolean but leaves email_verified_at NULL (only GET /auth/verify-email sets both), producing an inconsistent state. Kept as current behaviour; needs confirmation before 'fixing' since frontend may render the timestamp.
- Exact Pydantic/FastAPI 422 message strings for constraint violations I could not execute directly (date_of_birth bad format, max_length overflow, UUID path parse failure, enum rejection) are given as the standard Pydantic v2 wording with an ellipsis rather than verbatim captured output. Password, email and phone 422 messages WERE executed against the real schemas and are verbatim.
- Rate-limit semantics (decorated routes get only 10/min because slowapi's limit() defaults to override_defaults=True; no Retry-After/X-RateLimit-* headers because headers_enabled is off) were derived by reading the installed slowapi 'extension.py' rather than by hitting a running server.

### [22-endpoints-market-tham-chieu-bao-gia.md](22-endpoints-market-tham-chieu-bao-gia.md) — Endpoint — Market: tham chiếu, báo giá, bộ lọc

8 điểm.

- MdIntradayTick.side (từ VCI matchType): không có enum nào trong source, backend chỉ copy thô với default "". Hai giá trị duy nhất xuất hiện trong fixture repo là "unknown" và "shark" (tests/test_market_data.py). Đã ghi là passthrough string + gắn nhãn SHAPE THÔ TỪ PROVIDER, KHÔNG suy diễn thành buy/sell.
- ScreeningCriterion.select_type: chỉ giá trị "multiple" được xác nhận trong source + fixture test. Giá trị cho tiêu chí dạng range (ví dụ "slider") và slider_stepper trong ví dụ JSON thứ ba là chỗ giữ chỗ, đã gắn cảnh báo ⚠️ trong tài liệu. docs/vietcap-screening-api.md chỉ ghi kiểu điều khiển UI ("range/slider"), không ghi giá trị API.
- Đơn vị của MdIntradayTick.accumulated_value (LEData accumulatedValue): backend KHÔNG nhân/chia nên không suy được đơn vị từ code. Cùng tên field ở API bảng giá (price/symbols/getList) là triệu đồng và backend nhân 1e6, nhưng ở LEData thì không. Đã ghi rõ là giữ nguyên giá trị thô, cấm suy diễn chéo giữa hai API.
- Tập giá trị đầy đủ của asset_type ở /reference/symbols: chỉ 'stock' được xác nhận (từ fixture VCI type="STOCK" đã lowercase). Các giá trị khác (etf, cw, bond...) chưa xác minh được từ source nên chỉ ghi là 'lowercase passthrough của upstream type'.
- icb_lv1/icb_lv2 của /reference/search: dữ liệu thật là object {code, name, level} (theo docs/vietcap-market-overview-api-supplement.md), nhưng backend truyền thô nên về lý thuyết có thể là string ở một số bản ghi (helper _icb_to_str trong symbols.py xử lý cả hai). Đã type là MdIcbRef | string | null.
- Nội dung chính xác của body 429 (slowapi _rate_limit_exceeded_handler): shape {"error": "Rate limit exceeded: <exc.detail>"} đọc được từ slowapi/extension.py:80-82, còn chuỗi render của limit ("60 per 1 minute") là suy ra từ RATE_LIMIT_DEFAULT="60/minute", chưa chạy thực tế để xác nhận từng ký tự.
- Danh sách 34 tiêu chí screening (bảng min/max/conditionExtra) lấy từ docs/vietcap-screening-api.md ngày 2026-04-25, KHÔNG lấy từ source Python (source chỉ passthrough). Catalog do Vietcap kiểm soát nên có thể đã đổi; đã ghi rõ nguồn của bảng trong tài liệu.
- metrics của 2 preset 'Good Profit Stocks' và 'Accumulation Stocks': docs chỉ mô tả tiêu chí bằng lời (ADTV > 10 tỷ, RSI 25–50...), không có payload đầy đủ. Ví dụ JSON để metrics: [] cho hai preset đó thay vì bịa nội dung.

### [23-endpoints-market-cong-ty-giao-dich.md](23-endpoints-market-cong-ty-giao-dich.md) — Endpoint — Market: công ty & giao dịch

8 điểm.

- Đơn vị giá của GET /company/{symbol}/price-chart (VCI IQ Insight: openPrice/highPrice/lowPrice/closingPrice) KHÔNG được ghi ở bất kỳ đâu trong source hay docs/company-statistics-api-map.md, và không có consumer nội bộ nào scale nó. Đã ghi 'SHAPE THÔ TỪ PROVIDER — xem chương 07, mục VCI IQ Insight' + chỉ dẫn truyền nguyên trạng. Cần so một điểm gần nhất với close_price của price-board ở môi trường thật để chốt.
- Đơn vị của foreign_buy_value / foreign_sell_value trong POST /trading/price-board: code KHÔNG nhân 1e6 (trong khi total_value từ accumulatedValue thì có ×1e6), và source không ghi đơn vị cho hai field này. Rất có thể upstream cũng ở triệu đồng ⇒ bất nhất đã tồn tại. Đã ghi rõ 'giữ nguyên hành vi, không tự nhân' + TODO.
- Đơn vị của market_cap (cả trong /company/{symbol}/details và trong bản ghi price-history 1Y dùng làm nguồn cho /overview): không có ghi chú đơn vị trong source. Đã yêu cầu truyền nguyên trạng.
- Cửa sổ thời gian MẶC ĐỊNH của provider khi không truyền cặp fromDate/toDate (áp dụng cho cả 8 endpoint trading có ngày, và số bản ghi mặc định của price-history/price-history-summary/proprietary-history): không được ghi trong source. Đã ghi 'cửa sổ mặc định của provider — đừng giả định'.
- Danh sách ĐẦY ĐỦ field giá/thị trường trong bản ghi price-history (endpoint /trading/{symbol}/history trả nguyên bản ghi, không lọc). Chỉ 5 khoá được xác nhận chắc chắn từ code (trading_date, highest_price, lowest_price, market_cap, total_match_volume) cộng toàn bộ nhóm foreign*/cung-cầu từ docs/company-statistics-api-map.md. Phần còn lại đã đánh dấu SHAPE THÔ TỪ PROVIDER + index signature.
- Hình dạng thật của các field KBS profile ít gặp: branches (BRANCH), company_type (TY), auditor (KT), establishment_license (FP) — bảng map tay xác nhận tên field nhưng không xác nhận kiểu dữ liệu (string vs mảng). Đã khai báo branches là unknown, phần còn lại là string theo suy luận từ bảng map.
- Nội dung msg chính xác do tầng validate của framework sinh cho lỗi biên page/size/limit/length và minItems/maxItems của symbols. Đã ghi các chuỗi Pydantic v2 tiêu chuẩn (vd 'Input should be greater than or equal to 1', 'List should have at least 1 item after validation, not 0') và ghi rõ đây là message do framework sinh, không phải chuỗi cứng trong code IQX.
- Tập hợp đầy đủ giá trị event_code của insider-deals (chỉ có 2 ví dụ DDINS/DDDIR trong docs) ⇒ đã khai báo string thay vì union literal.

### [24-endpoints-market-tong-quan-nganh.md](24-endpoints-market-tong-quan-nganh.md) — Endpoint — Market: tổng quan & ngành

8 điểm.

- Công thức tính `impact` (điểm chỉ số) của /overview/index-impact: provider Vietcap tự tính, backend chỉ ép float. Không có công thức trong source lẫn 3 tài liệu provider → ghi CHƯA XÁC ĐỊNH, chỉ khẳng định đơn vị (điểm chỉ số) và quy ước dấu (âm = kéo giảm) vì hai điều này có trong docs/vietcap-market-overview-api.md:179.
- Tham số `size` (MKC/VOL/VAL) của /overview/heatmap chỉ được forward nguyên vẹn cho provider; source không đọc lại field nào phụ thuộc `size` nên không xác định được nó đổi giá trị/thứ tự dữ liệu ra sao → ghi CHƯA XÁC ĐỊNH.
- Cấp ICB của các dòng /overview/sectors/allocation: endpoint không có tham số cấp, mẫu thực tế là mã 4 chữ số với icbCodeParent = null (giống cấp 2) nhưng không có gì trong source khẳng định → ghi CHƯA XÁC ĐỊNH.
- Shape phần tử của /overview/maintenance: source passthrough thô, không đọc field nào và không có test khi đang bảo trì thật → chỉ mô tả quy tắc gói dict→list, không mô tả field banner.
- /overview/sectors/detail với icb_code hợp lệ về kiểu nhưng không tồn tại (vd 9999): không có test cover, không rõ provider trả field null hay 0 → ghi CHƯA XÁC ĐỊNH, chỉ khẳng định chắc chắn là không có 404.
- Ba sai sót của bản Python được nêu là suy luận từ source + hợp đồng UI của provider, KHÔNG phải quan sát chạy thật: (1) cửa sổ from_ts/to_ts mặc định 365 ngày không suy từ time_frame ở liquidity/foreign/foreign-top; (2) /overview/foreign chặn ONE_MINUTE dù upstream hỗ trợ; (3) /insights/ranking trả 502 khi upstream trả mảng rỗng do validator mặc định của fallback. Cách provider ưu tiên from/to vs timeFrame chưa được kiểm chứng bằng request thật.
- Rate limit: các endpoint trong chương không gắn @limiter.limit riêng nên chịu RATE_LIMIT_DEFAULT = 60/minute của SlowAPIMiddleware; đã nêu rõ RATE_LIMIT_MARKET_DATA = 120/minute chỉ áp cho POST /trading/price-board. Chưa kiểm chứng bằng test tải thật.
- Các ví dụ JSON dùng số liệu thị trường VN hợp lý (FPT/VCB/HPG/VNM, ngày 2026-08-17) dựng theo đúng shape + đơn vị của normalizer và mẫu provider trong docs, KHÔNG phải snapshot production.

### [25-endpoints-market-vi-mo-quoc-te-quy.md](25-endpoints-market-vi-mo-quoc-te-quy.md) — Endpoint — Market: vĩ mô, quốc tế, quỹ

6 điểm.

- Đơn vị giá vàng SJC theo lượng/chỉ: source chỉ ghi 'absolute VND' và không scale — đã ghi CHƯA XÁC ĐỊNH, dẫn app/services/market_data/sources/sjc.py
- Đơn vị từng indicator vĩ mô MBK: backend không khai báo, chỉ có field `unit` do upstream trả (đã quan sát '%' cho gdp trong test) — đã ghi CHƯA XÁC ĐỊNH, dẫn sources/mbk.py
- Đơn vị `management_fee` của quỹ Fmarket (khả năng %/năm nhưng source không khẳng định) — đã ghi CHƯA XÁC ĐỊNH, dẫn sources/fmarket.py
- Đơn vị giá từng mã hàng hoá Simplize (USD/oz, USD/thùng, VND nội địa…): backend không khai và không quy đổi — đã ghi CHƯA XÁC ĐỊNH, dẫn sources/spl.py
- Hành vi thật của Binance khi `limit` không thuộc bậc hợp lệ (5/10/.../5000): backend chỉ chặn 1..5000, tôi mô tả là Binance tự làm tròn và ĐÃ ghi rõ 'không dựa vào hành vi này' — chưa xác minh bằng call thật
- Tập key của `/events/calendar` và `/macro/economy` là động (camel→snake của payload upstream); chỉ các key xuất hiện trong test được liệt kê, đã khai index signature

### [27-endpoints-market-bctc.md](27-endpoints-market-bctc.md) — Endpoint — BCTC

6 điểm.

- Thang đo trường `roe` trong bảng ratio VCI (`/statistics-financial`) CHƯA XÁC ĐỊNH — phân số hay phần trăm. Fixture trong repo không nhất quán: tests/test_peer_median.py dùng roe=18.0..26.0 (như %) còn tests/test_bctc_dashboard_compute.py dùng roe=0.25 (phân số). Ảnh hưởng: peer_median.roe, valuation.roe (khối 2 dashboard), justified_pb, rim, fair_value. Đã ghi chú trong tài liệu là rủi ro đã biết, KHÔNG tự thêm nhân/chia 100. Xem app/services/market_data/sources/vietcap.py (fetch_financial_report, nhánh RATIO).
- Dấu thực tế của các khoản chi phí VCI trả về (cogs isa4, provision_expense isb41, operating_expense isb39...) được suy từ comment trong mapping YAML và từ cách code dùng abs(); chưa xác thực bằng response live. Nếu VCI trả DƯƠNG thì các chỗ 'lệch dấu đã biết' (dio/dpo âm, cost_of_risk âm, provision_ppop âm) sẽ không xảy ra. Tài liệu đã nêu cả hai khả năng và yêu cầu sao chép nguyên công thức.
- Không tìm thấy file mockup HTML tham chiếu (template_A_phi_ngan_hang_FPT_dark.html / template_B_ngan_hang_VCB_dark.html) trong repo backend — chỉ SPEC nhắc tới. Không ảnh hưởng contract API nhưng phần thứ tự hiển thị BLOCK_ORDER của frontend chỉ dựa vào SPEC_dashboard_bctc.md.
- Toàn bộ giá trị số trong ví dụ JSON là SỐ MINH HỌA do tôi tự dựng cho nhất quán nội bộ (kiểm được bằng công thức trong tài liệu), KHÔNG phải dữ liệu thật của FPT/VCB. Đã ghi rõ trong tài liệu.
- Chuỗi thông điệp 429 của slowapi không được trích nguyên văn (không đọc cấu hình handler rate-limit); tài liệu ghi 'Thông điệp của slowapi'.
- Chưa xác nhận `Value{n}` có mặt cho MỌI dòng khi `Head` rỗng (page_size lớn hơn số kỳ có sẵn) — suy từ code to_kbs_shape là vòng lặp theo `periods` nên không có khóa Value nào; chưa có test bao ca này.

### [28-endpoints-nhan-dinh-thi-truong.md](28-endpoints-nhan-dinh-thi-truong.md) — Endpoint — Nhận định thị trường

7 điểm.

- Không có endpoint force-regenerate cho một session_date quá khứ, cũng không có endpoint unpublish/xóa bài — đã ghi 'CHƯA XÁC ĐỊNH' ở ghi chú số 16, kèm chỉ dẫn xem app/api/v1/endpoints/market_analysis.py
- Không tìm thấy giá trị rate limit riêng cho nhóm market-analysis; chương ghi 'mặc định (RATE_LIMIT_DEFAULT = 60/minute)' theo SlowAPIMiddleware toàn app trong app/main.py — chưa xác nhận có exempt nào cho router này
- Body 429 của SlowAPI và body 500 mặc định không được đặc tả nguyên văn (không nằm trong app/core/exceptions.py); chương chỉ ghi 'Body do SlowAPI sinh' / 'Body handler 500 mặc định'
- docs/ai/market_analysis_output/nhan-dinh-2026-06-19.json là bản v1.x (còn paragraphs.internal_heat, paragraphs.global_context) không khớp contract hiện tại trong prompts.py — đã cảnh báo ở ghi chú 14 nhưng không có file sample v1.4 nào để đối chiếu hình dạng daily thực tế trên prod
- meta.data_completeness chỉ được tính trong build_analysis_payload (daily); midday/premarket payload không set key này nên field vắng mặt trong meta — đã khai optional, chưa xác nhận bằng row prod
- charts.market_health_detail.callout có shape {tone, text} suy từ _health_callout trong payload.py; chưa đọc hết 3 nhánh nên tập giá trị 'tone' chưa liệt kê được
- tests/test_engine_triggers.py được nêu trong nhiệm vụ nhưng nội dung thuộc alert engine (_vn_exit_label, _format_conditions), không liên quan market-analysis — không dùng làm nguồn

### [29-endpoints-ai.md](29-endpoints-ai.md) — Endpoint — AI

7 điểm.

- Đơn vị cột `price` của sheet `Du_Bao` (đồng hay nghìn đồng): `_to_float` chỉ đổi ',' → '.' và KHÔNG bỏ dấu '.' phần nghìn (khác `google_sheets._parse_number`), nên '26.334' parse thành 26.334. Đã ghi CHƯA XÁC ĐỊNH — phải xem trực tiếp sheet Du_Bao, không có trong repo backend.
- Khung thời gian mà job pattern-recognition dùng để tính sheet CANDLE/CHART: không có trong repo backend (API không có tham số timeframe nào). Đã ghi CHƯA XÁC ĐỊNH — xem job sinh sheet.
- `session_date` của `ai_insight_history` dùng `date.today()` theo timezone process, không phải Asia/Ho_Chi_Minh tường minh — nếu container chạy UTC thì 'hôm nay' đổi lúc 07:00 giờ VN. Đã nêu là điểm cần chốt khi viết lại, không tự quyết.
- Danh sách tên mẫu hình (candles/charts) lấy từ `dashboard/src/features/patterns/PatternIllustration.tsx` — đó là 'những tên frontend biết vẽ', KHÔNG phải enum backend ép; backend trả `name` nguyên văn từ sheet nên tên mới vẫn đi qua API. Đã ghi rõ để không validate whitelist khi viết lại.
- `header.price/high/low/volume` lấy nguyên văn từ price_board (chỉ có fallback `|| 0`), backend không cast kiểu — nếu provider trả chuỗi thì chuỗi lọt qua. Đã khai TS là `number` kèm ghi chú nên cast khi viết lại.
- `compute_dashboard` không trả field `template` ra response #7; client phải branch theo key có mặt trong `blocks` (A vs B). Đã đề xuất thêm field nhưng ghi rõ đó là thay đổi thêm, không phải hành vi hiện tại.
- Công thức chi tiết của `_enrich_industry_summary` (suy ra field tóm tắt từ sector_detail_1d) không được trích đầy đủ trong chương — đã trỏ tới `app/services/ai/payloads.py` dòng ~343.

### [31-endpoints-giao-dich-ao.md](31-endpoints-giao-dich-ao.md) — Endpoint — Giao dịch ảo

6 điểm.

- Thân/thông điệp lỗi 429 khi vượt rate limit do SlowAPI sinh, không phải envelope {detail, code} của app — CHƯA XÁC ĐỊNH nguyên văn, xem app/main.py:137-140 và app/core/rate_limit.py
- Mã lỗi chính xác khi query `status` lạ được truyền xuống cột Enum ở GET /admin/vt/accounts/{id}/orders và /settlements: source KHÔNG whitelist nên lỗi bubble từ tầng ORM/DB (suy đoán 500) — CHƯA XÁC ĐỊNH chắc chắn, xem app/services/admin_vt.py:189-191 và 322-324
- Nhiệm vụ yêu cầu mô tả các bước kiểm tra 'giờ giao dịch', 'biên độ trần/sàn', 'giới hạn cỡ vị thế' trong POST /orders — các bước này KHÔNG tồn tại trong app/services/virtual_trading/service.py:111-215; đã ghi rõ là KHÔNG có thay vì bịa. tests/test_position_size.py thực chất thuộc backtest engine (_position_fraction), không liên quan giao dịch ảo
- Nội dung header WWW-Authenticate và luồng refresh token khi 401 thuộc chương xác thực — chưa đưa vào chương này
- Chưa xác định vì sao ledger của lệnh bán chế độ T2 ghi amount_vnd = +proceeds nhưng balance_after_vnd = cash_available_vnd chưa tăng (app/services/virtual_trading/service.py:414-471) — đã nêu là điểm không nhất quán đã biết, cần chủ sản phẩm xác nhận trước khi sửa
- Base URL trong curl dùng https://api.iqx.vn/api/v1 theo quy ước prefix /api/v1 của router; nếu domain API prod khác thì cần thay đồng loạt

### [32-endpoints-cap-0-2.md](32-endpoints-cap-0-2.md) — Endpoint — Cấp 0,1,2

6 điểm.

- placed_level (POST /cap0/placement): tôi grep các service cap0/cap1/cap2 và KHÔNG thấy chỗ nào đọc lại bảng user_placement ngoài chính set_placement, nên tài liệu ghi 'không cấp nào đọc lại'. Tôi CHƯA grep toàn bộ backend (admin/analytics/report) — nếu có consumer khác thì câu đó cần sửa. Xem app/models/cap0.py::UserPlacement.
- PATCH /cap0/task: nhánh 400 'task_no không hợp lệ (Cấp 0 có 4 nhiệm vụ)' và 'gate không hợp lệ' trong Cap0Service.complete_task theo suy luận của tôi KHÔNG chạm được qua HTTP vì Pydantic (Field(ge=1,le=4) + Literal['debrief']) chặn trước bằng 422. Tôi ghi cả hai khả năng trong bảng lỗi thay vì chọn một. Cần chạy thật để chốt.
- Ví dụ JSON của POST /cap1/ketso (pnl_vnd=1448550, pnl_pct=2.340421406724864) do tôi tự tính từ giả định phí 0,15% + thuế bán 0,1%. Công thức pnl trong service là chính xác (sell.net_amount_vnd + buy.net_amount_vnd), nhưng biểu phí thật nằm ở cấu hình giao dịch ảo — tôi KHÔNG xác minh mức phí. Con số chỉ để minh hoạ hình dạng/đơn vị.
- Lỗi 'POST /capN/kehoach nuốt event bus': commit 7a057a3 chỉ sửa file frontend (5 file dashboard/src). Tôi mô tả cơ chế cập nhật tiến độ phía server bằng cách đọc trực tiếp service, nhưng CHƯA truy toàn bộ history xem có thay đổi backend nào liên quan trước đó. Xem app/services/cap1/service.py::record_kehoach và cap2/service.py::record_kehoach.
- POST /cap2/ketso ghi đè vô điều kiện cả 7 cờ, nên bỏ trống giu_cham_SL_bao_nhieu_phien sẽ xoá giá trị cũ về null (và bỏ cham_SL_cat_dung_phien_ke sẽ hạ về false). Điều này đọc thẳng từ code (7 phép assign không có điều kiện) nhưng tôi KHÔNG tìm thấy test nào khoá hành vi này trong tests/test_cap2.py — nên nó là hành vi hiện tại chưa được pin.
- CAP_MAX_ENABLED: tôi xác nhận giá trị hiện tại = 3 ở dashboard/src/features/cap1/capFlags.ts và grep 'CAP_MAX' trong backend không có kết quả (chỉ xuất hiện trong docs/rewrite-ts). Vậy 'hành vi khi gọi cấp chưa mở' = server vẫn 200 và tạo hàng thật; không có cổng cấp nào ở backend để mô tả.

### [34-endpoints-cap-5-6.md](34-endpoints-cap-5-6.md) — Endpoint — Cấp 5,6

5 điểm.

- Điều kiện chính xác để user được mở tài khoản giao dịch ảo chế độ 'thuc_chien' — đây là CỔNG THẬT của cả Cấp 5 và Cấp 6 (mọi bộ đếm lọc VirtualOrder.mode == 'thuc_chien'), nhưng logic nằm ngoài app/services/cap5 và cap6. Đã ghi 'CHƯA XÁC ĐỊNH — xem app/services/virtual_trading/ và chương premium' thay vì đoán.
- Nơi cấp huy hiệu (badge) khi tốt nghiệp Cấp 5 / Cấp 6: không có mã nào trong cap5.py, cap6.py, services/cap5/service.py, services/cap6/service.py ghi badge. graduate() chỉ dập graduated_at + time_to_graduate_hours. Đã ghi 'CHƯA XÁC ĐỊNH' ở cả hai mục graduate.
- CAP_MAX_ENABLED không tồn tại ở backend (grep app/ alembic/ → 0 kết quả); giá trị 3 lấy từ dashboard/src/features/cap1/capFlags.ts. Nghĩa là việc đưa endpoint Cấp 5/6 vào hành trình người dùng vẫn phụ thuộc một rollout frontend riêng, không phải backend guard.
- Race condition khi hai request POST /capN/enter chạy đồng thời: có UniqueConstraint trên user_id nhưng service không bắt riêng IntegrityError → sẽ thành 500. Đã ghi là hành vi hiện tại; chưa xác định được đây có phải vấn đề thực tế trên prod hay không.
- Không xác minh được bằng cách chạy test (chỉ đọc source + tests/test_cap5.py, tests/test_cap6.py). Mọi detail lỗi, ngưỡng, thứ tự kiểm tra đều trích trực tiếp từ source; các câu giai_thich được copy nguyên văn từ chuỗi trong service.

### [35-endpoints-cap-7-8.md](35-endpoints-cap-7-8.md) — Endpoint — Cấp 7,8

3 điểm.

- CAP_MAX_ENABLED không tồn tại ở backend (grepped all of app/). Nó là frontend-only tại dashboard/src/features/cap1/capFlags.ts với giá trị hiện tại 3, và backend không có cap gate. Phạm vi rollout thực tế vì vậy cần được xác nhận ở cấu hình/phát hành frontend.
- Không có per-endpoint limiter decorator trên các route Cấp 7/8; các route này cùng thừa hưởng `RATE_LIMIT_DEFAULT = 60/minute` theo IP từ SlowAPIMiddleware. Nếu cần quota riêng cho hành trình, đó là thay đổi thiết kế.
- Không có bảng hay endpoint badge trong model/service Cấp 7/8. Rail 0–8 được dựng ở FE từ `graduated_at` của từng bảng tiến độ; cần quyết định riêng nếu sản phẩm muốn badge persist.

### [36-endpoints-watchlist-ban-ve-backtest.md](36-endpoints-watchlist-ban-ve-backtest.md) — Endpoint — Watchlist, bản vẽ, Backtest

5 điểm.

- Giới hạn kích thước body cho PUT /chart-drawings/{symbol}: KHÔNG có trong code ứng dụng (không giới hạn ở Pydantic schema, không middleware body-size, cột JSONB). Giới hạn ở tầng reverse-proxy (Coolify/nginx) CHƯA XÁC ĐỊNH — đã ghi rõ trong doc là cần kiểm tra cấu hình hạ tầng, không đoán con số.
- sharpe_ci không thể port khớp bit-for-bit sang TypeScript: dùng np.random.default_rng(42) (PCG64) + rng.choice cho 500 lần bootstrap. Đã ghi khuyến nghị loại sharpe_ci khỏi golden test hoặc cài lại PCG64, nhưng chưa xác định lựa chọn nào sẽ được chốt.
- Chi tiết nghiệp vụ premium (PremiumService.get_user_subscription, điều kiện sub.is_premium) nằm ngoài phạm vi chương này — chỉ đặc tả hành vi guard quan sát được (403 + message, admin bypass) và trỏ sang chương premium/auth.
- Sai số float chấp nhận được giữa numpy và JS cho các chỉ báo dùng cumsum trên chuỗi dài (_roll_mean, _roll_std): đã đề xuất ngưỡng 1e-9 cho golden test nhưng ngưỡng thực tế cần đo lại trên dữ liệu 1000+ bar, chưa xác nhận bằng thực nghiệm.
- Thứ tự trả về của GET /backtest/strategies khi hai bản ghi có cùng updated_at là không xác định (ORDER BY updated_at DESC không có tie-break phụ) — đã ghi rõ là không xác định thay vì bịa tie-break.

### [37-endpoints-canh-bao-telegram.md](37-endpoints-canh-bao-telegram.md) — Endpoint — Cảnh báo & Telegram

8 điểm.

- Don vi gia cua alert_events.price: tang alert lay nguyen data.close[-1] tu get_adjusted_ohlcv, KHONG nhan/chia 1000. Provider VCI gap-chart / VND dchart khong scale trong app/services/ta/data.py::_normalize. Da ghi ro 'CHUA XAC DINH — xem app/services/market_data/sources/vietcap.py va chuong du lieu gia/TA' thay vi doan VND hay nghin VND.
- hmac.compare_digest tren str raise TypeError voi ky tu non-ASCII => POST /telegram/webhook/<path non-ASCII> co the tra 500 thay vi 200. Da suy luan tu semantics cua hmac.compare_digest, KHONG chay thuc nghiem tren server.
- Loi da biet (chua co test bao phu): handle_update commit ma khong bat IntegrityError, trong khi users.telegram_chat_id la UNIQUE => /start <token> tu mot chat da gan tai khoan khac se nem loi ra endpoint => 500 va Telegram retry. Da ghi vao bang loi + Ghi chu, kem de xuat bat loi o ban TS.
- SlowAPIMiddleware ap default_limits 60/minute/IP cho MOI route ke ca webhook Telegram (suy ra tu cach slowapi hoat dong + main.py add_middleware(SlowAPIMiddleware), khong co test chung minh 429 tren webhook).
- POST /admin/alerts/seed chay dong thoi tu nhieu worker co the va UNIQUE key va thanh 500 (duong startup co try/except, duong endpoint thi khong). Suy luan tu code, chua co test.
- Docstring goc noi GET /alerts/signals tra '10 enabled presets' nhung code chi loc is_enabled=true nen so luong thuc te phu thuoc DB — da ghi ro thay vi khang dinh cung 10.
- app/services/ta/catalog.py duoc liet ke trong nhiem vu nhung KHONG duoc dung boi bat ky endpoint nao trong nhom nay (chi backtest/service.py dung). GET /admin/alerts/indicators lay tu app/services/ta/display_names.py. Da ghi chu khac biet kind 'num|signal' (alerts) vs 'num|bin' (catalog).
- Khong tim thay gioi han so rule/user hay co che chong trung rule trong source (khong quota, khong unique constraint tren user_alert_rules) — da ghi nhan ro la 'KHONG co' thay vi bo trong.

### [38-endpoints-bai-hoc.md](38-endpoints-bai-hoc.md) — Endpoint — Bài học

5 điểm.

- Định dạng serialize timestamp: mã dùng TIMESTAMPTZ + datetime.now(UTC)/func.now(), nhưng hậu tố chính xác trong JSON ('Z' vs '+00:00') do pydantic-core quyết định và tôi KHÔNG xác minh bằng cách chạy API thật. Ví dụ trong chương dùng 'Z' và đã ghi cảnh báo ở «Ghi chú tổng hợp» mục 11 — cần kiểm lại với response thật trước khi chốt hợp đồng với FE.
- Hình dạng chính xác của thân lỗi 422 (RequestValidationError): app/main.py chỉ đăng ký exception handler cho AppException; tôi không tìm thấy handler riêng cho RequestValidationError, nên đã ghi là 'handler mặc định FastAPI' (detail[] chuẩn). Nếu có handler ở middleware/nơi khác thì shape 422 cần cập nhật — xem app/main.py và app/core/.
- Chi tiết nội bộ của PremiumService.get_user_subscription (điều kiện is_premium=true khi còn hạn kể cả status CANCELLED) được đọc từ app/services/premium.py nhưng thuộc chương Premium; chương này chỉ tiêu thụ boolean. Cần chương Premium xác nhận không có nhánh nào khác ảnh hưởng gating bài học.
- Rate limit 60/minute ghi theo RATE_LIMIT_DEFAULT + SlowAPIMiddleware toàn cục; tôi không kiểm tra giá trị env thực tế trên prod (Coolify) nên số có thể khác default. Xem docs/rewrite-ts/05-cau-hinh-env.md và env prod.
- Mã lỗi 500 cho các trường hợp vi phạm constraint (sort_order trùng, ck_episodes_payload_shape) là suy ra từ việc KHÔNG có try/except quanh flush — tôi không có test nào chốt chính xác status/body của các ca này. Đã ghi 'Lỗi 500 chung' thay vì bịa detail.

### [39-endpoints-quan-tri.md](39-endpoints-quan-tri.md) — Endpoint — Quản trị

10 điểm.

- Dòng audit user.export ghi bên trong streaming generator: từ FastAPI >=0.106 dependency dạng yield (get_db, chủ commit) thoát TRƯỚC khi body được stream, nên rất có thể dòng audit không persist trên production. Test pass vì fixture override giữ session mở. Chưa chạy verify trên môi trường thật — đã ghi là rủi ro cần sửa, không khẳng định là bug đã xác nhận.
- premium_subscriptions có unique constraint trên user_id hay không — ảnh hưởng việc active_subscribers/plan_distribution có thể đếm trùng một user. Chưa đọc app/models/premium.py phần __table_args__; đã ghi 'CHƯA XÁC ĐỊNH — xem app/models/premium.py'.
- target_entity/target_id chính xác của các action ngoài phạm vi chương (premium.*, subscription.*, vt.*, lesson.*, market_analysis.*) — bảng tra chỉ ghi tên file phát sinh, cột target để '—' vì chưa đọc từng call site; đã trỏ sang chương tương ứng.
- Hình dạng result của 8 job KHÔNG chạy được qua endpoint #11 (alert_scan, market_analysis_*, intl_snapshot_wave1-3) — chúng không có đường HTTP nào nên không đặc tả; đã trỏ sang app/services/jobs/alert_scan.py, market_analysis_job.py, intl_snapshot_job.py.
- Giá trị cutoff cụ thể của 'đơn PENDING quá cũ' mà ipn_reconcile_scan đánh FAILED — chỉ đọc đoạn 80-110 của file, chưa thấy hằng số very_old_cutoff; đã ghi CHƯA XÁC ĐỊNH.
- Nội dung HTML/text của hai email (verification, password reset) — chưa đọc app/services/email_templates.py; đã trỏ file.
- 422 vs 500 khi truyền role/status sai enum ở /export: suy ra từ đọc code (UserRole(params.role) gọi trong _apply_user_filters, ngoài phạm vi Pydantic validate) chứ không chạy thử request; đã nêu rõ hành vi gốc là 500 và khuyến nghị khai báo enum.
- Ví dụ JobInfo.trigger ('interval[1:00:00]', "cron[day_of_week='mon-fri', ...]") là định dạng str(APScheduler trigger) tái tạo từ cấu hình add_job, không copy từ response thật đã chạy.
- Giá gói trong ví dụ JSON (MONTHLY 299.000đ, ANNUAL 2.790.000đ, LIFETIME 9.900.000đ) và các plan_code QUARTERLY/LIFETIME là giá trị minh hoạ hợp lý cho thị trường VN, KHÔNG đọc từ seed data thật — chỉ TRIAL_7D/MONTHLY/ANNUAL là code có xuất hiện trong source/tests.
- Chuỗi failure_reason trong login_history ('Mật khẩu không đúng') là ví dụ minh hoạ; chưa đọc chỗ ghi UserLoginHistory để lấy nguyên văn các giá trị failure_reason mà AuthService sinh.
