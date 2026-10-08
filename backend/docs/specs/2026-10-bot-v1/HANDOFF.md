# Báo cáo triển khai — Bộ Bot, Học viện, Chiến lược, Shop/Xu/Linh thú (10/2026)

Nhánh: `claude/magical-cannon-43udo0` (nền `1eaec5e`). Bộ spec gốc nằm cùng thư mục này (xem [README.md](README.md)).
Báo cáo này trả lời mục 18.3 của spec Bộ Bot và các mục "đầu ra dev" tương ứng của các bộ còn lại.
Đây là báo cáo của code và kiểm thử trong repository; **chưa deploy, chưa chạy migration hay bật worker trên môi trường thật**.

## 1. Phạm vi đã triển khai

| Bộ | Đã làm |
|---|---|
| Bot & nền giao dịch | Bỏ mọi cổng trứng/cấp/tốt nghiệp; `POST /workspace/ensure` tạo tài khoản tự giao dịch và tài khoản Bot, mỗi loại cấp 100.000.000 đồng đúng một lần (khóa idempotent bền vững); Bạch Hổ mặc định. Policy Bot mới `iqx-bot-v1.0`: không stop/L1/chốt lời/trailing/giữ tối đa; bán xét **mọi** vị thế trước, mua tối đa 2 lệnh, 12% NAV_basis gồm phí, trần 30%/mã, không mua thêm/mua lại trong phiên, khớp giá đóng cửa cùng phiên. Nguồn mua mới: VN30 mặc định (snapshot thành phần theo phiên) hoặc ảnh chụp danh mục người dùng áp dụng từ Bộ lọc, hiệu lực từ phiên có ngày > ngày lưu; hủy thay đổi chờ; về VN30. Cấu hình 16 chỉ báo master + Mua + Bán, revision, saved/pending/effective. Lịch sử giao dịch, nhật ký theo phiên. Đặt lệnh thủ công không còn đòi kế hoạch hành trình. Săn mã/Theo dõi độc lập. |
| Mini luyện tập | Module `practice`: bộ mã mờ `mini-set-01` (cửa sổ quan sát và 24 tháng kiểm thử chỉ nằm phía server, không xuất hiện trong payload), 30 tình huống hoán vị phía server theo (người dùng, chỉ báo, bộ), giấu mã/ngày, khóa cấu hình trước khi tính, khớp mở cửa phiên kế tiếp, 100% tiền khả dụng, giữ tối đa mặc định 60 phiên, 2 KPI (Tổng lợi nhuận, Số giao dịch = số lần Mua khớp), lịch sử đầy đủ có bằng chứng điều kiện, nhận xét viết sẵn có phiên bản. |
| Học viện | Catalog `iqx-academy-outline-13ch-71lessons-v1` (13 chương/71 bài: 16 kỹ thuật, 42 cơ bản, 1 Hợp lưu, 12 hướng dẫn), khóa bài ổn định, `academy_completions` là nguồn tiến độ duy nhất; quiz 8/8 chấm server (nháp lưu server, khôi phục, lịch sử, xem lại); bài hướng dẫn hoàn thành bằng nút; quyền mở theo bài (không bao giờ tự bật cấu hình). Panel phải chỉ có "Xem bài"/"Đã học"; màn đọc có khối typed, biểu đồ, ảnh phóng to. |
| Nội dung Chương 1–4 | Trích xuất có kiểm chứng SHA-256 từ 4 gói HTML: Ch1 (5 chỉ báo + Hợp lưu, 16 biểu đồ, 48 câu), Ch2 (6 bài hướng dẫn, 22 ảnh), Ch3 (6 chỉ tiêu, 13 biểu đồ, 48 câu), Ch4 (6 bài hướng dẫn, 27 ảnh). Đáp án và giải thích chỉ ở server. |
| Shop / Xu / Linh thú | Ví xu và sổ cái bất biến; +100 xu cho lần hoàn thành hợp lệ đầu tiên mỗi bài (cùng transaction với completion); mua Thanh Long / Lộc Hươu / Phụng Hoàng / Kim Quy giá 500 xu trong một transaction idempotent; sở hữu lâu dài, đổi linh thú đang dùng miễn phí; chip xu trên header; dùng đúng tài nguyên linh thú hiện có. |
| Chiến lược | 16 chỉ báo theo quyền; Cảnh báo ghim snapshot cấu hình, đánh giá cuối phiên đúng/sai/chưa đánh giá, chống trùng bền vững; Backtest 2 hồ sơ thực thi, đúng 6 KPI, biểu đồ "Lợi nhuận danh mục (%)", lịch sử đầy đủ; Bộ lọc định nghĩa 3.0 với kỳ riêng cho từng điều kiện, provenance từng ô, 3 đối tượng lưu (bộ lọc, danh mục, kết quả), "Áp dụng cho Bot" / "Về VN30", chặn xóa danh mục Bot đang dùng. |
| Workspace | Khung v4: nội dung trái, panel ngữ cảnh 410px (25,2vw từ 1750px), rail công cụ phải 78/86px; ≤900px panel trượt cạnh rail. Rail: Học viện (mặc định), Đặt lệnh, Danh mục, Bot, Shop, Săn mã, Tin tức, Mẫu nến. Link Hành trình cũ chuyển sang Học viện. |

## 2. Commit

| Commit | Nội dung |
|---|---|
| `1d660e2` | Shop/xu/linh thú, workspace ensure, bỏ cổng hành trình ở Đặt lệnh và Săn mã |
| `deb88ce` | Module Mini luyện tập |
| `de57475` | Catalog 13/71, registry 16 chỉ báo, completions, ánh xạ dữ liệu cũ |
| `75cdb9d` | Policy Bot `iqx-bot-v1.0`, nguồn mua VN30/danh mục, snapshot VN30 |
| `06e5c07` | Trích xuất gói nội dung Chương 1–4 |
| `7f2f6e5`, `a5c0407` | Khung workspace v4, bỏ cổng cấp độ ở frontend |
| `a4bf81d` | Phục vụ gói nội dung qua API Học viện |
| `2689832` | Giao diện Shop |
| `76531fe` | Nháp/khôi phục/lịch sử bài kiểm tra |
| `985a057` | Backend Chiến lược (cảnh báo, bộ lọc 3.0, backtest 6 KPI, kết quả đã lưu) |
| `d4849da`, `816771d` | Giao diện Bot |
| `a2d2d27` | API lịch sử giao dịch, nhật ký phiên, đọc cấu hình hiệu lực |
| (commit cuối) | Sửa các điểm rà soát code, migration `0020` |
| `40e12ec` | Giao diện Mini luyện tập |
| `83706e5` | Giao diện Học viện |
| `54c253b` | Giao diện Chiến lược |
| `5f23816`, `fb5b721`, `eee6026`, `f544495`, `3661157` | Tạo lại OpenAPI/contracts |
| `c8e5551` | Lưu bộ spec |

## 3. Phiên bản và chính sách

| Đối tượng | Giá trị |
|---|---|
| Policy Bot | `iqx-bot-v1.0` (hash được ghim trong test); receipt cũ `iqx-bot-academy-activation-1` vẫn kiểm chứng được |
| Thứ tự ứng viên Mua | GTGD bình quân 20 phiên giảm dần, mã tăng dần — **phương án mẫu, `owner_confirmation: pending`** |
| Registry chỉ báo | `iqx-rules-3.0` (16 chỉ báo); `iqx-rules-2.0` chỉ dùng đọc dữ liệu cũ |
| Catalog Học viện | `iqx-academy-outline-13ch-71lessons-v1`; nội dung gói `ch01-v2.0`, `ch02-v3.0`, `ch03-v2.0`, `ch04-v1.0` |
| Shop | `iqx-mascot-shop-v1` (Bạch Hổ 0 xu mặc định; 4 linh thú 500 xu) |
| Mini | bộ `mini-set-01`, hồ sơ `mini-profile-v1` (phí mua 0,15%, bán gộp 0,25%, lô 100 — `verified: false`) |
| Bộ lọc | định nghĩa `3.0`; định nghĩa `2.0` được đọc qua ánh xạ, không ghi đè |

## 4. Migration và bảo toàn dữ liệu

Migration mới đều **bổ sung, không xóa cột/lịch sử**: `0014_academy_catalog_v1`, `0015_workspace_shop`, `0016_bot_policy_v1`, `0017_practice`, `0018_academy_attempt_drafts`, `0019_strategy_v1`, `0020_reward_legacy_method` (nới CHECK `lesson_rewards` để nhận `legacy_migration`). Đã chạy thử toàn bộ 0001–0020 trên PostgreSQL 16 sạch.

- Không cấp vốn lần hai: tài khoản tự giao dịch và Bot hiện có giữ nguyên; khóa cấp vốn mới chỉ áp dụng khi tạo tài khoản.
- Tiến độ học cũ: 0014 sinh `legacy_migration` completions theo bảng ánh xạ tường minh (đã kiểm tra trên dữ liệu mẫu: ATR không thành OBV, ADX không thành Stochastic; chương 2/4/9/13/16–18 cũ không ánh xạ). Bảng `academy_grants` cũ giữ nguyên; script dry-run `scripts/academy-legacy-mapping-report.ts`.
- Cấu hình chỉ báo cũ (35 chỉ báo): đọc qua ánh xạ sang 16; phía nào dùng chỉ báo đã bỏ đang bật thì báo `legacy_needs_review` và Bot chặn đúng phía đó, không bỏ điều kiện rồi chạy phần còn lại.
- Vị thế Bot cũ: giữ số lượng/giá vốn/phí; trường stop/biên độ cũ giữ để đọc lịch sử nhưng không còn thực thi.
- Linh thú: người dùng cũ có linh thú được ghi nhận sở hữu kế thừa và giữ con đang dùng.
- Xu cho các bài đã học trước Shop: **chưa cộng**. Script `scripts/shop-reward-backfill.ts` mặc định chỉ dry-run; muốn ghi cần `--apply` và `V2_SHOP_BACKFILL_APPROVED=true` sau khi chủ sản phẩm duyệt. Ứng viên gồm cả các completion `legacy_migration` (bài đã học trước Shop còn ánh xạ vào catalog hiện tại); khóa duy nhất theo người/bài vẫn là cổng chống cộng hai lần.

## 5. Kiểm thử đã chạy (trên nhánh cuối)

| Bộ | Lệnh | Kết quả |
|---|---|---|
| Backend tĩnh | `npm run lint && npm run typecheck && npm run build && npm run contracts:check && npm run api:coverage:check` | sạch |
| Backend unit (kể cả bộ test chạy trên PostgreSQL 16 thật) | `npx vitest run` | 1.596 pass |
| Backend system (PostgreSQL 16 + Redis) | `npx vitest run --config vitest.system.config.ts` | 83/84 pass; `runtime-worker` chập chờn do Redis dùng chung, chạy riêng thì pass |
| Frontend | `npx tsc -b && npm run lint && npx vitest run && npm run build && npm run contracts:check` | 765 test pass, build và contracts sạch |
| Frontend e2e (Playwright, API mock) | `npx playwright test` | 23 pass (6 bài cần backend thật bị bỏ qua) |
| Chạy thử API thật trên PostgreSQL/Redis cục bộ | đăng ký → ensure ×2 → 5 bài hướng dẫn → mua linh thú → đổi linh thú → quiz RSI 8/8 → Mini | đúng như spec (100 triệu cấp một lần; +100 xu/bài, lần hai không cộng; mua idempotent; thiếu xu bị chặn; đạt 8/8 mở `indicator:rsi`; payload không lộ đáp án; Mini không lộ mã/ngày) |

**Không kiểm tra được trong môi trường này:** các nhà cung cấp dữ liệu thị trường (VCI/VNDirect) không truy cập được từ sandbox, nên Mini, phiên Bot, snapshot VN30, Bộ lọc và Backtest chưa chạy trên dữ liệu thật (logic được kiểm bằng fixture). Khi thiếu dữ liệu, Mini trả `503 PRACTICE_DATA_UNAVAILABLE` và không tiêu lượt.

Rà soát code các vùng rủi ro cao (sổ cái xu, cấp vốn một lần, phiên Bot, nguồn mua, quyền sở hữu, giấu dữ liệu Mini) bằng kịch bản đồng thời trên PostgreSQL thật: không có lỗi nghiêm trọng; 8 điểm trung bình/nhỏ đã sửa (mã bộ Mini mờ; cộng bù xu nhận completion `legacy_migration`; Bot chỉ áp dụng danh mục lưu từ kết quả Bộ lọc của server — danh mục tự khai bị từ chối `LIST_NOT_VERIFIED`; chi tiết lỗi đi qua `details`; khóa chống tạo trùng kết quả đã lưu; route kích hoạt cũ cấp đúng 100 triệu với cùng khóa; cờ `BOT_NEW_BUYS_ENABLED`; đếm phiên giữ theo lịch giao dịch).

## 6. Phần mẫu không đưa vào production

Không dùng `scenario`, `VN30_FIXTURE`, `SAVED_LISTS`, `syntheticBars`, footer xem thử, localStorage làm nguồn tiền/quyền, base64 linh thú, hàm chấm/hoàn thành phía client của HTML. Nội dung bài và ảnh được trích xuất qua script có kiểm tra hash; ảnh giữ nguyên byte.

## 7. Cần chủ sản phẩm xác nhận / quyết định

1. Thứ tự ứng viên Mua của Bot (GTGD20 giảm dần, mã tăng dần) — đang là phương án mẫu. Vì vậy mua mới của Bot bị khóa bởi cờ `BOT_NEW_BUYS_ENABLED` (mặc định `false`): phiên vẫn xét Bán, các ứng viên Mua được ghi nhật ký `candidate_order_unconfirmed`. Bật cờ sau khi chủ sản phẩm xác nhận.
2. Danh sách 30 mã và khoảng thời gian của bộ Mini; phí/lô của hồ sơ Mini; giá chưa điều chỉnh (`prices_not_adjusted`). Nên chạy job tải sẵn dữ liệu 30 mã trước khi mở.
3. Phạm vi mã cho danh mục Bot: hiện chỉ nhận cổ phiếu HOSE đang hoạt động (HNX/UPCOM bị từ chối kèm danh sách lỗi).
4. Nguồn VN30 không có lịch sử thành phần: phiên thiếu snapshot sẽ không mua mới (vẫn bán). Job `market.index-membership` chạy 18:40 các ngày giao dịch.
5. Chênh lệch biến thể chỉ báo đã ghi nhận: CMF khi High = Low (repo trả 0, spec ghi null); Khối lượng khi trung bình bằng 0; DMI chỉ dùng +DI/−DI (ADX chỉ còn ở registry cũ).
6. Backtest: khóa bán `min_held_bars = 2` kế thừa engine cũ; chính sách kỳ cho 36 chỉ tiêu ngoài Chương 3; 11 chỉ tiêu chưa sẵn dữ liệu/định nghĩa (EPS*, PEG, cổ tức, số cổ phiếu, ROIC).
7. Cờ triển khai: `STRATEGY_V2_ENABLED` đang mặc định `false` — Bot không cấu hình được và trang Chiến lược ở trạng thái tắt cho tới khi bật. Các API cấu hình/Chiến lược vẫn giữ guard Premium hiện có.
8. Nội dung bài kỹ thuật Chương 5/7/10 (kế thừa) còn câu "Công tắc tổng ở sidebar…" trái với mô hình mới — cần gói nội dung cập nhật (không tự viết lại giáo trình).
9. Cộng bù xu cho bài đã học trước khi có Shop (script dry-run sẵn).
10. Trang giới thiệu (marketing) vẫn mô tả hành trình trứng/7 cấp — ngoài phạm vi spec.
11. Cảnh báo cũ (Telegram/preset) được giữ trong mục "Cảnh báo cũ" — quyết định có ngừng hay không.

## 8. Triển khai

1. Build backend, chạy `V2_MIGRATIONS_ALLOWED=true npm run db:migrate` trên bản sao staging trước (0014–0020), đối soát bằng `scripts/academy-legacy-mapping-report.ts`.
2. Bật `STRATEGY_V2_ENABLED=true` (và giữ `ACADEMY_ENABLED=true`) ở môi trường cần dùng Bot/Chiến lược. Chỉ bật `BOT_NEW_BUYS_ENABLED=true` sau khi thứ tự ứng viên được xác nhận.
3. Worker: các job mới `market.index-membership` (18:40) và `alerts.eod-evaluate` (mỗi 15 phút từ 15:45, chỉ khi nến phiên đã hoàn tất); `bot.session-eod` giữ 19:00.
4. Frontend deploy cùng thư mục ảnh `frontend/public/assets/academy/`.
5. Chỉ chạy `scripts/shop-reward-backfill.ts --apply` sau khi được duyệt.
