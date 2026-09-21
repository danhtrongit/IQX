# IQX — Contract Linh thú 2D v2

**Ngày đối chiếu:** 20/09/2026  
**Phạm vi:** dữ liệu gán loài, API lifecycle, runtime 2D sprite và ranh giới với Bot v1.  
**Nguồn đối chiếu:** bộ tài liệu `BOT LINH THU` trong `/Users/danhtrongit/Downloads/BOT LINH THU`, kế hoạch [MASCOT-2D-IMPLEMENTATION-PLAN](MASCOT-2D-IMPLEMENTATION-PLAN.md), audit [MASCOT-2D-READINESS-AUDIT](MASCOT-2D-READINESS-AUDIT.md), cùng các file nguồn được dẫn trong từng phần.

Tài liệu này khóa contract để các nhánh backend, frontend và asset có thể triển khai độc lập. Nó không thay các luật giao dịch Bot, nhiệm vụ Cấp 0–6 hay snapshot học hiện tại.

## 1. Quyết định sản phẩm và ranh giới

- Hành trình kết thúc ở **Cấp 6**. Trứng chỉ chuyển sang reveal sau khi backend có `cap6_progress.graduated_at` và profile được gán hợp lệ.
- Có đúng năm loài và mapping cố định: `ky_thuat → bach_ho`, `dong_tien → thanh_long`, `noi_bo → loc_huou`, `tin_tuc → phung_hoang`, `dinh_gia → kim_quy`.
- Loài được chọn từ số lần câu trả lời user trùng câu trả lời AI ở từng lớp. Không dùng P&L, tỷ lệ thắng, lịch sử giao dịch, trọng số cá nhân hay lựa chọn thủ công.
- Runtime mới là **2D sprite-frame** với poster/fallback; không dùng Spine, 3D, Live2D hoặc species SVG để giả làm sprite. Các hiệu ứng stage có thể là CSS/SVG bên ngoài ảnh.
- Mascot chỉ đọc trạng thái Bot. Mascot không cấp vốn, chọn mã, tạo batch, đặt lệnh, sửa sổ tiền, sửa graduation hoặc ảnh hưởng chiến lược.

## 2. Assignment contract hiện có

### 2.1 Cửa sổ và bộ chứng cứ

Service dùng cửa sổ server cố định:

```text
window_start = cap4_progress.entered_at
window_end   = cap6_progress.graduated_at
```

Một bản `JourneyAssessment` chỉ được tính nếu đồng thời:

1. `source=learning`, `mode=thuc_chien`, `record_status=valid`;
2. câu trả lời user có đủ đúng năm key `ky_thuat`, `dong_tien`, `noi_bo`, `tin_tuc`, `dinh_gia` và mỗi giá trị là `ok | neu | bad`;
3. bản ghi nằm trong cửa sổ C4 → tốt nghiệp C6;
4. `proof_version=commit_then_reveal_v1`, nghĩa là submit đã commit trước request reveal;
5. dataset cùng `user_id`, mã, phiên, payload hash và ngày giao dịch với assessment;
6. với mỗi `user + symbol + trading_date`, chọn bản commit đầu tiên. Các import có nhiều bản cùng thời điểm mà không chứng minh được thứ tự bị loại nhóm mơ hồ, không dùng UUID để phá hòa.

Service chọn bộ đầu tiên **trước khi kiểm snapshot AI**. Nếu bộ đầu đó thiếu hoặc hash AI không khớp, assessment sau không được dùng để sửa lịch sử.

### 2.2 Đếm và tie-break

Với mỗi lớp `L`:

```text
match_count[L] = count(user.answers[L] == dataset.payload.ai_answers[L])
```

`ok`, `neu` và `bad` đều là một lần trùng. Lớp có count lớn nhất thắng; thứ tự ổn định khi hòa là:

```text
ky_thuat → dong_tien → noi_bo → tin_tuc → dinh_gia
```

`assignment_basis` được lưu trong profile:

| Trường hợp | `assignment_status` | `assignment_basis` | Kết quả |
|---|---|---|---|
| Không có bộ hợp lệ | `pending_data_repair` | `null` | `mascot_id=null`, giữ Trứng C6, không random |
| Có dữ liệu, mọi count bằng 0 | `assigned` | `zero_match_tie_break` | Bạch Hổ theo thứ tự ổn định, copy trung tính |
| Một lớp có max duy nhất | `assigned` | `ai_match_count` | Loài của lớp max |
| Nhiều lớp cùng max > 0 | `assigned` | `stable_tie_break` | Lớp đầu tiên trong thứ tự cố định |

Sau khi `assigned`, profile không reroll khi GET, refresh, retry, đổi tab, có assessment mới hoặc Bot chạy thêm. `validate_frozen_profile` kiểm tra lại hash, cửa sổ, contribution và danh sách assessment; lỗi integrity trả conflict thay vì chấm lại bằng AI live.

### 2.3 Wire profile trả về

`mascot` trong `GET /api/v1/bot/mascot` có các field hiện hành:

```json
{
  "id": "bach_ho",
  "name": "Bạch Hổ",
  "dominant_layer": "ky_thuat",
  "assignment_basis": "ai_match_count",
  "valid_pair_count": 8,
  "match_counts": {
    "ky_thuat": 8,
    "dong_tien": 5,
    "noi_bo": 4,
    "tin_tuc": 6,
    "dinh_gia": 3
  },
  "tied_layers": [],
  "window_start": "<server timestamp>",
  "window_end": "<server timestamp>",
  "assigned_at": "<server timestamp>"
}
```

Frontend coi `mascot_id`/`id` và `dominant_layer` từ backend là source of truth; không tự tính assignment từ dữ liệu UI.

## 3. Dữ liệu và migration

Contract v2 **tái sử dụng schema và migration hiện có**, không cần migration DB mới cho runtime mascot:

- `journey_reading_datasets` giữ payload AI chưa reveal, `dataset_hash`, mã và phiên;
- `journey_assessments` giữ câu trả lời đầu tiên, `completed_at`, `proof_version` và `revealed_at`;
- `bot_mascot_profiles` giữ `assignment_status`, `mascot_id`, `dominant_layer`, `assignment_basis`, count, tied layers, cửa sổ, contribution refs và hash;
- `journey_identity_ui` giữ `last_seen_egg_level`, `egg_hatch_seen_at`, `mascot_reveal_seen_at`, ngày chào và `last_animated_bot_run_id`;
- `bot_run_receipts` là receipt đọc-only cho animation Bot.

Các bất biến DB hiện có trong migration `c8d9e0f1a2b3_journey_identity.py` và `f3b4c5d6e7f8_journey_identity_invariants.py` phải được giữ: loài chỉ thuộc năm giá trị chuẩn, basis chỉ thuộc `ai_match_count | stable_tie_break | zero_match_tie_break`, profile pending không có loài/basis và profile assigned phải có chứng cứ. Không đổi schema chỉ để chứa frame, asset path hoặc trạng thái animation; các giá trị đó thuộc manifest tĩnh và state frontend.

## 4. API và lifecycle

### 4.1 Endpoint hiện hành

`backend/app/api/v1/endpoints/journey_identity.py` cung cấp:

| Method | Path | Quyền | Vai trò |
|---|---|---|---|
| `GET` | `/api/v1/bot/mascot` | user hiện tại | Đọc lifecycle, profile, UI state và Bot receipt |
| `POST` | `/api/v1/bot/mascot/ui-events` | user hiện tại | Ghi một milestone hiển thị hợp lệ |
| `POST` | `/api/v1/journey/reading-datasets` | user hiện tại | Tạo/đọc snapshot bài học |
| `POST` | `/api/v1/journey/assessments` | user hiện tại | Commit câu trả lời trước reveal |
| `POST` | `/api/v1/journey/assessments/{id}/reveal` | user hiện tại | Đọc AI snapshot sau commit |

Request strict (`extra=forbid`) và `mascot_rules_version` phải khớp `RULES_VERSION` hiện tại.

### 4.2 Lifecycle

| Lifecycle | Điều kiện server | Runtime/UI |
|---|---|---|
| `egg` | Chưa tốt nghiệp C6 | Render Trứng theo `current_level` |
| `pending_data_repair` | Đã tốt nghiệp nhưng chưa có assignment hợp lệ | Giữ Trứng C6, nêu trạng thái chờ sửa dữ liệu; không chọn loài khác |
| `reveal_pending` | Đã assigned, chưa có `mascot_reveal_seen_at` | Hatch/reveal silhouette → màu → greet |
| `mascot` | Đã ghi reveal | Render mascot và phản ứng theo Bot/greeting |

Thứ tự chuyển giao là `hatch_seen` trước `reveal_seen`; frontend không tự đánh dấu hoàn tất khi chỉ mount component. Callback phải đến từ frame/animation đã thực sự hiển thị và stage còn visible.

### 4.3 UI events

Payload chung gửi `mascot_rules_version` và đúng một event:

| Event | Điều kiện server | Tác dụng |
|---|---|---|
| `level_seen` | level 0–6 không vượt current level | Chỉ tăng `last_seen_egg_level` |
| `hatch_seen` | đã tốt nghiệp và assigned | Ghi `egg_hatch_seen_at`, idempotent |
| `reveal_seen` | đã có hatch | Ghi `mascot_reveal_seen_at` và ngày chào server |
| `greet_seen` | đã có reveal | Ghi ngày chào hiện tại của server |
| `bot_run_updated_seen` | reveal xong, run thuộc user và `succeeded` | Tiến `last_animated_bot_run_id` theo `trading_date` |

Server cấp timestamp và ngày `Asia/Ho_Chi_Minh`; frontend bỏ `local_date` khi retry. Event không thể đổi assignment, graduation, vốn, lệnh, strategy hoặc run status. Cursor Bot chỉ đi tới run mới hơn, callback cũ/failed/khác user bị bỏ hoặc trả lỗi.

Wire TypeScript tương ứng nằm ở `dashboard/src/features/journey-identity/types.ts` và `api.ts`; `useIdentityEvent` enqueue tuần tự theo lifecycle và cập nhật query cache bằng response server.

## 5. Runtime 2D và asset contract

### 5.1 Namespace và bộ 50 file

Asset v2 phải ở namespace versioned:

```text
/assets/mascots-2d/v2/shared/fallback-placeholder.webp
/assets/mascots-2d/v2/{slug}/
```

Có **10 file cho mỗi loài × 5 loài = 50 file runtime**:

```text
poster.webp                 # poster full-body, fallback chính
reveal-silhouette.webp      # silhouette khi hatch
avatar-head.webp            # avatar nhỏ
avatar-body.webp            # avatar/card
idle-strip.webp             # 6 frame, 3840×640
greet-strip.webp            # 6 frame, 3840×640
analyzing-strip.webp        # 6 frame, 3840×640
updated-strip.webp          # 5 frame, 3200×640
tap-strip.webp              # 4 frame, 2560×640
manifest.json
```

Mỗi frame strip là 640×640, alpha trong suốt, cùng baseline/anchor `(0.5, 0.92)`, safe padding tối thiểu 8%. Manifest bắt buộc `schemaVersion=2`, `assetVersion` semver, đúng `mascotId/slug/dominantLayer`, canvas 640×640, năm state và `durationsMs.length === frameCount`. Chỉ `idle` và `analyzing` loop; các state còn lại kết thúc ở frame cuối với hold tùy manifest.

`dashboard/src/features/journey-identity/mascot-2d/mascotManifest.ts` là validator/source-of-truth của path và timing. Path tương đối an toàn, không `..`, không `//`, không extension ngoài `.webp`; URL được thêm `?v=<assetVersion>` để tránh cache cũ. `useSpritePreload` cache manifest/ảnh, timeout/decode failure sẽ không treo render.

### 5.2 Renderer và fallback

- `Mascot2DStage` là coordinator hiển thị stage; `SpriteStripPlayer` chạy frame theo `durationsMs`, giữ đúng phần thời gian còn lại khi tab ẩn/overlay che và gọi `onComplete` một lần theo animation token.
- `Mascot2DStage` dùng silhouette → color reveal → sprite; poster được hiển thị trong lúc strip chưa sẵn sàng.
- Manifest/strip lỗi dùng poster; poster lỗi dùng `shared/fallback-placeholder.webp`; mọi fallback đều giữ đúng `mascot_id`, không thay loài khác. Nếu placeholder cũng lỗi, render neutral placeholder và log `mascot_asset_error`.
- `prefers-reduced-motion` chọn frame rút gọn; visibility/occlusion pause cả playhead và timer. Unmount/đổi species hủy listener và không phát completion của run cũ.
- Main visual `JourneyIdentityStage` giữ trạng thái ưu tiên `analyzing > updated > greet > tap_reaction > idle`; không key stage theo tab sidebar. `MascotAvatar` chỉ dùng ảnh tĩnh, không tạo thêm animation player.

### 5.3 Quyết định provenance asset

Artwork runtime được tạo/chỉnh bằng **built-in ImageGen** theo yêu cầu trực tiếp của người dùng; giữ prompt/provenance và không ghi đè asset cũ. Tài liệu checklist cũ yêu cầu PSD/CLIP/KRA là ngoại lệ không áp dụng cho gói này: deliverable source được chấp nhận là **PNG master có alpha**, không tuyên bố có PSD/rig phân lớp khi không có file đó. PNG không được dùng làm sprite strip nếu chưa có frame production tương ứng; poster/fallback phải khai báo đúng trạng thái.

Không dùng script tự vẽ, crop, tách nền hoặc dịch vụ ảnh khác để tự sinh thêm artwork production. Codec/resize đóng gói chỉ được đổi định dạng/kích thước, không vẽ lại nội dung. `IMAGEGEN-ASSETS.md` là nơi lưu prompt, provenance và hash của master/runtime.

## 6. Bot độc lập và fail-closed

`BotRunReceipt` (`bot_run_receipts`) là nguồn đọc cho mascot: `status` gồm `idle | running | succeeded | failed`, cùng `latest_run_id`, `trading_date`, `issues`, `started_at`, `completed_at`. Mascot chỉ phát `analyzing` khi run running và `updated` khi có run succeeded mới hơn cursor.

Bot execution vẫn độc lập với mascot lifecycle. Graduation khởi tạo hai nhánh riêng; lỗi assignment, manifest, reveal hoặc asset không rollback graduation, không cấp lại 100 triệu và không chặn tài khoản Bot. UI không được tạo scheduler/run hoặc ghi giao dịch.

Bot runtime **fail-closed** khi thiếu một trong các input bắt buộc của phiên T:

- giá đóng cửa **official** có `trading_date`, `data_version`/correction basis và `close_is_official`;
- snapshot năm lớp cùng phiên, có source/as-of/version hợp lệ;
- Biên độ L1 canonical cùng phiên và source ref;
- cấu hình phí/lô và các trạng thái mã/corporate-action cần để định giá nhất quán.

Thiếu input trả `issues`/blocked state, không điền 0, không dùng latest close không biết phiên, không chấm lại bằng AI live, không thay L1 bằng công thức đoán và không ghi run `succeeded`. Điều kiện này không làm mascot tự đổi loài hay biến `pending_data_repair` thành assigned.

## 7. Analytics, accessibility và kiểm soát dữ liệu

`identityEvent` chỉ log milestone/asset/state, không log từng frame, câu trả lời, giá, lệnh hoặc P&L. Các event runtime tối thiểu: `mascot_manifest_invalid`, `mascot_asset_error`, `mascot_animation_play`, `mascot_reveal_start`; milestone authoritative vẫn là POST UI event server.

Keyboard Enter/Space và click chỉ tạo `tap_reaction` khi mascot idle, visible và ready; không đổi dữ liệu nghiệp vụ. Reduced motion vẫn giữ reveal/handoff semantics nhưng rút ngắn hiệu ứng. Alt/aria dùng tên loài từ manifest/config, không bịa species khi fallback.

## 8. Rollout contract

1. Giữ API/schema v1 hiện tại; phát hành asset dưới namespace `/v2/` và URL có `assetVersion` để rollback độc lập.
2. Validate manifest và preload/decode trước khi bật sprite cho một loài; poster/neutral fallback phải luôn render được panel.
3. Rollout frontend trước với feature path có thể tắt; không đổi assignment hoặc migration dữ liệu.
4. Kiểm tra trên staging: manifest của cả năm loài, path/version/cache, reduced motion, tab hidden/occlusion, completion callback, refresh giữa hatch/reveal, run supersession và fallback lỗi ảnh.
5. Chỉ bật Bot execution sau khi readiness audit xác nhận official close, versioned five-layer snapshot và L1 canonical. Mascot có thể hiển thị `idle`/`pending_data_repair` khi Bot chưa đủ nguồn.
6. Rollback bằng cách trỏ asset version cũ hoặc tắt renderer v2; không xóa profile, UI milestones, receipt hay migration.

## 9. Ma trận trách nhiệm

| Thành phần | Được ghi | Chỉ đọc | Không được làm |
|---|---|---|---|
| Journey identity backend | profile assignment, UI milestones | graduation, learning snapshot, Bot receipt | reroll bằng live AI, ghi lệnh/vốn |
| Bot worker | run, snapshot, ledger, positions | mascot assignment | dùng loài làm strategy, lấy dữ liệu thiếu làm thành công |
| `JourneyIdentityStage`/`Mascot2DStage` | telemetry local, UI event qua API | state server, manifest, asset | tự assign, tạo Bot run, sửa tiến độ |
| `SpriteStripPlayer` | playhead/frame local | manifest timing | ghi DB, đoán completion bằng timer độc lập |
| Asset pipeline | versioned files + provenance | reference artwork | tự thêm PSD/rig không tồn tại, ghi đè namespace cũ |

Tài liệu này mô tả contract và rollout; không dùng nó để kết luận một bộ kiểm thử đã chạy hoặc một môi trường đã phát hành nếu chưa có báo cáo riêng ghi bằng chứng.
