# Endpoint — Bài học (công khai + quản trị)

Chương này đặc tả **đủ 16 endpoint** của phân hệ «Bài học» (learning / khoá học video-PDF-text): 5 endpoint dưới prefix `/api/v1/lessons` (catalog công khai + nội dung tập học + tiến độ người học) và 11 endpoint dưới prefix `/api/v1/admin/lessons` (CRUD khoá học, CRUD tập học, sắp xếp lại thứ tự, upload ảnh bìa và upload file media).

Nguồn sự thật: bản cắt OpenAPI của nhóm `Bài học` + `Quản trị: Bài học` cho **hình dạng**; và `app/api/v1/endpoints/lessons.py`, `app/api/v1/endpoints/admin_lessons.py`, `app/schemas/lesson.py`, `app/services/lesson/{service,storage,image,video_probe}.py`, `app/models/lesson.py`, `app/repositories/lesson.py`, `app/api/deps.py` cho **hành vi**. Hành vi đã chốt được xác nhận bằng `tests/test_lessons_public.py`, `test_lessons_admin.py`, `test_lessons_models.py`, `test_lessons_progress.py`, `test_lessons_storage.py`, `test_lessons_premium_gating.py`, `test_media_static.py`.

Hai mục PHẢI đọc trước khi code: «Phân quyền 16 endpoint» (có một endpoint mà OpenAPI ghi Bearer nhưng thực tế cho phép ẩn danh) và «Gating Premium» (403 cứng, KHÔNG có preview rút gọn — nhưng file media vẫn nằm sau link công khai vĩnh viễn).

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | GET | `/api/v1/lessons/courses` | Công khai | Catalog khoá học **đã xuất bản** (phân trang + filter + search) |
| 2 | GET | `/api/v1/lessons/courses/{slug}` | Công khai (token tuỳ chọn) | Chi tiết khoá học + danh sách tập (không kèm nội dung); có token thì kèm `progress_summary` |
| 3 | GET | `/api/v1/lessons/episodes/{episode_id}/content` | Bearer (+ Premium nếu khoá học premium) | Nội dung đầy đủ của một tập: `markdown_body` hoặc `file_url` |
| 4 | POST | `/api/v1/lessons/episodes/{episode_id}/progress` | Bearer | Upsert tiến độ 1 tập (đánh dấu hoàn thành / lưu vị trí giây) |
| 5 | GET | `/api/v1/lessons/me/progress` | Bearer | Danh sách bản ghi tiến độ của chính user trong **một** khoá học |
| 6 | GET | `/api/v1/admin/lessons/courses` | Bearer + Admin | Danh sách khoá học **kể cả chưa xuất bản** |
| 7 | POST | `/api/v1/admin/lessons/courses` | Bearer + Admin | Tạo khoá học mới (slug do admin tự nhập) — **có audit** |
| 8 | GET | `/api/v1/admin/lessons/courses/{course_id}` | Bearer + Admin | Chi tiết khoá học kèm **mọi** tập (có `file_url`) |
| 9 | PATCH | `/api/v1/admin/lessons/courses/{course_id}` | Bearer + Admin | Sửa khoá học (kể cả đổi slug) — **có audit** |
| 10 | DELETE | `/api/v1/admin/lessons/courses/{course_id}` | Bearer + Admin | **Soft-delete**: chỉ hạ `is_published=false` — **có audit** |
| 11 | POST | `/api/v1/admin/lessons/courses/{course_id}/thumbnail` | Bearer + Admin | Upload/thay ảnh bìa (multipart) — **có audit** |
| 12 | POST | `/api/v1/admin/lessons/courses/{course_id}/episodes` | Bearer + Admin | Tạo tập học mới trong khoá — **có audit** |
| 13 | POST | `/api/v1/admin/lessons/courses/{course_id}/reorder` | Bearer + Admin | Đổi thứ tự tập học nguyên khối — **có audit** |
| 14 | PATCH | `/api/v1/admin/lessons/episodes/{episode_id}` | Bearer + Admin | Sửa metadata tập học — **có audit** |
| 15 | DELETE | `/api/v1/admin/lessons/episodes/{episode_id}` | Bearer + Admin | **Hard-delete** tập + xoá file trên đĩa — **có audit** |
| 16 | POST | `/api/v1/admin/lessons/episodes/{episode_id}/file` | Bearer + Admin | Upload PDF / video cho tập (multipart) — **có audit** |

---

## Kiểu dữ liệu dùng chung

~~~ts
/** app/models/lesson.py :: CourseLevel */
type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

/** app/models/lesson.py :: EpisodeContentType */
type EpisodeContentType = 'pdf' | 'video' | 'text';

/** app/schemas/common.py :: PaginatedResponse[T] — dùng chung toàn API */
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  /** Math.ceil(total / page_size); = 0 khi total === 0 (KHÔNG phải 1) */
  total_pages: number;
}

/** app/schemas/lesson.py :: CourseResponse */
interface CourseResponse {
  id: string;                          // uuid
  slug: string;                        // <= 120 ký tự, unique toàn bảng
  title: string;                       // 1..200
  description: string | null;
  /** Đường dẫn tương đối public, ví dụ "/media/courses/<id>/thumbnail.jpg" */
  thumbnail_url: string | null;
  /** Schema Python khai báo `str`, giá trị thực luôn thuộc CourseLevel */
  level: CourseLevel;
  category: string;                    // 1..60
  is_premium: boolean;
  is_published: boolean;
  /** Denormalised: ĐẾM MỌI tập (kể cả tập chưa xuất bản) */
  total_episodes: number;
  /** Denormalised: TỔNG duration_seconds của MỌI tập; tập không có duration = 0 */
  total_duration_seconds: number;
  created_by_user_id: string | null;   // FK users.id ON DELETE SET NULL
  created_at: string;                  // ISO-8601 UTC
  updated_at: string;                  // ISO-8601 UTC
}

/** app/schemas/lesson.py :: EpisodeBrief — bản CÔNG KHAI, KHÔNG có file_url/markdown_body */
interface EpisodeBrief {
  id: string;
  title: string;
  description: string | null;
  content_type: EpisodeContentType;
  /** null nếu là text, hoặc video chưa probe được thời lượng */
  duration_seconds: number | null;
  file_size_bytes: number | null;      // BIGINT
  sort_order: number;                  // >= 1 trên thực tế
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** app/schemas/lesson.py :: EpisodeAdminBrief — như EpisodeBrief nhưng THÊM file_url */
interface EpisodeAdminBrief extends EpisodeBrief {
  file_url: string | null;
}

/** app/schemas/lesson.py :: EpisodeContent — nội dung đầy đủ cho user đã đăng nhập */
interface EpisodeContent {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: EpisodeContentType;
  /** Link tĩnh công khai dưới /media — KHÔNG signed, KHÔNG hết hạn */
  file_url: string | null;
  /** Chỉ có giá trị khi content_type === 'text' */
  markdown_body: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  sort_order: number;
  is_published: boolean;
}

/** app/schemas/lesson.py :: ProgressRow — LƯU Ý: KHÔNG có user_id trong response */
interface ProgressRow {
  episode_id: string;
  course_id: string;
  /** null = chưa hoàn thành. Khác null = ĐÃ hoàn thành (không bao giờ bị xoá về null) */
  completed_at: string | null;
  last_position_seconds: number | null;
  created_at: string;
  updated_at: string;
}

/** app/schemas/lesson.py :: CourseProgressSummary */
interface CourseProgressSummary {
  completed: number;   // số bản ghi có completed_at != null
  total: number;       // = course.total_episodes (denorm, gồm cả tập chưa xuất bản)
  percent: number;     // round(completed / total * 100, 1); = 0.0 khi total === 0
}

/** Thân lỗi chuẩn của AppException (app/core/exceptions.py) */
interface AppErrorBody {
  detail: string;
  code:
    | 'NOT_FOUND' | 'CONFLICT' | 'UNAUTHORIZED' | 'FORBIDDEN'
    | 'BAD_REQUEST' | 'UNPROCESSABLE_ENTITY' | 'SERVICE_UNAVAILABLE'
    | null;
}

/** Thân lỗi của HTTPException THÔ (413/415 upload) — KHÔNG có field `code` */
interface RawErrorBody {
  detail: string;
}
~~~

---

## Nghiệp vụ nền

**Phân quyền 16 endpoint — bảng đối chiếu OpenAPI vs source**

| # | Endpoint | OpenAPI `security` | Dependency thực tế | Ẩn danh gọi được? |
|---|---|---|---|---|
| 1 | `GET /lessons/courses` | *(không có)* | `DBSession` | Có — 200 |
| 2 | `GET /lessons/courses/{slug}` | `HTTPBearer` | `Depends(_optional_user)` | **Có — 200** |
| 3 | `GET /lessons/episodes/{id}/content` | `HTTPBearer` | `CurrentUser` | Không — 401 |
| 4 | `POST /lessons/episodes/{id}/progress` | `HTTPBearer` | `CurrentUser` | Không — 401 |
| 5 | `GET /lessons/me/progress` | `HTTPBearer` | `CurrentUser` | Không — 401 |
| 6–16 | mọi `/admin/lessons/**` | `HTTPBearer` | `AdminUser` (+ `AuditCtx` ở endpoint ghi) | Không — 401; user thường → 403 |

Giải thích chỗ tinh tế ở #2: `lessons.py` khai báo riêng `_bearer = HTTPBearer(auto_error=False)` và một dependency `_optional_user` — nếu **không** có header `Authorization` thì trả `None`; nếu **có** thì giải mã token, và **bọc `try/except Exception: return None`**. FastAPI vẫn sinh `security: [{HTTPBearer: []}]` trong OpenAPI vì scheme có mặt trong cây dependency, nên **bản cắt OpenAPI nói dối** về endpoint này. `tests/test_lessons_public.py::test_anonymous_get_course_detail` chốt hành vi: ẩn danh → **200**. Hệ quả nữa: token **hết hạn hoặc rác** cũng không gây 401 ở #2 — nó bị nuốt thành "ẩn danh", chỉ mất `progress_summary`.

Endpoint #1 khác #2 ở chỗ nó **không** khai báo scheme nào cả (chỉ nhận `DBSession`), nên OpenAPI để trống `security`. Về hành vi hai endpoint như nhau: đều công khai.

**Gating Premium — MỤC QUAN TRỌNG NHẤT**

Đơn vị gating là **khoá học**, KHÔNG phải tập học. Model `Episode` không có cờ premium nào; chỉ `Course.is_premium` tồn tại. Không có khái niệm "tập mở đầu miễn phí trong khoá premium" — hoặc cả khoá mở, hoặc cả khoá đóng.

Gating chỉ được kiểm ở **đúng một chỗ**: trong handler `get_episode_content` (`lessons.py`), *inline*, không qua dependency `PremiumUser`:

1. Nạp episode kèm course (`EpisodeRepository.get_by_id_with_course`).
2. Nếu `episode is None` **hoặc** `episode.course.is_published === false` **hoặc** `episode.is_published === false` → `404 NOT_FOUND`, detail `"Không tìm thấy Tập học"`.
3. Nếu `episode.course.is_premium === true` **và** `current_user.role !== 'admin'` → gọi `PremiumService.get_user_subscription(user.id)`; nếu `sub.is_premium === false` → `403 FORBIDDEN`, detail `"Yêu cầu gói Premium đang hoạt động"`.
4. Ngược lại → `200` với `EpisodeContent` **đầy đủ**.

Hành vi đã chốt trong `tests/test_lessons_premium_gating.py`:

| Tình huống | Kết quả |
|---|---|
| user free + khoá free | **200**, `markdown_body` đầy đủ |
| user free + khoá premium | **403** |
| user có subscription ACTIVE còn hạn + khoá premium | **200** |
| user gói dùng thử `TRIAL_7D` còn hạn + khoá premium | **200** |
| admin + khoá premium (không cần subscription) | **200** — bỏ qua bước 3 hoàn toàn |
| không token | **401** |
| khoá chưa xuất bản | **404** |
| tập chưa xuất bản | **404** |

**Trả lời dứt điểm câu hỏi "403 hay 200 kèm preview rút gọn?": 403 cứng.** Không có preview, không có truncate `markdown_body`, không có watermark, không có "N giây đầu miễn phí". Bản viết lại KHÔNG được tự thêm preview — đó sẽ là thay đổi hành vi.

Định nghĩa `is_premium` do `PremiumService.get_user_subscription` quyết định (xem chương Premium): `false` nếu không có subscription **hoặc** `current_period_end < now`; `true` nếu còn hạn — **kể cả khi `status` là `CANCELLED`** (chỉ so hạn, không so status). Chương này chỉ tiêu thụ boolean đó, không tái hiện logic.

Chỗ **thiếu gating** cần biết (đây là hành vi hiện tại, không phải khuyến nghị): endpoint #4 `POST .../progress` và #5 `GET /lessons/me/progress` **không** kiểm premium, **không** kiểm `is_published` của khoá/tập. Bất kỳ user đăng nhập nào biết `episode_id` đều ghi được tiến độ cho tập thuộc khoá premium hoặc khoá chưa xuất bản (chỉ 404 khi episode không tồn tại). Xem «Ghi chú khi viết lại» ở từng endpoint.

**Media URL: trả URL, không stream — và rủi ro**

`EpisodeContent.file_url` là **chuỗi đường dẫn tương đối**, ví dụ `/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/ep-7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7.mp4`. Endpoint **không** stream bytes, không redirect 302, không trả signed URL, không có tham số hết hạn.

`app/main.py` mount tĩnh: `app.mount("/media", StaticFiles(directory=settings.LESSON_MEDIA_DIR), name="media")`. Mount này **hoàn toàn công khai** — không guard, không token, không kiểm premium. `tests/test_media_static.py` chốt: `GET /media/courses/<uuid>/thumbnail.jpg` trả 200 với đúng bytes, không cần header nào.

**Rủi ro phải ghi vào tài liệu bàn giao:** link `/media/...` là vĩnh viễn và có thể đoán/rò rỉ. Ai có link (copy từ DevTools, share Zalo, log proxy, bot crawl thư mục nếu directory listing bật) đều tải được video khoá premium mà **không** cần đăng nhập. Gating 403 ở #3 chỉ bảo vệ *metadata + đường dẫn*, không bảo vệ *nội dung*. Bản NestJS nên (a) giữ nguyên hành vi để tương thích client, hoặc (b) chuyển sang signed URL hết hạn ngắn / stream qua guard — nhưng đó là **quyết định sản phẩm**, phải hỏi trước khi tự đổi. Chi tiết lớp lưu trữ, giới hạn dung lượng, xử lý ảnh: xem chương `11-media-upload.md`.

**Quy tắc slug**

- **KHÔNG tự sinh.** Admin nhập tay ở `POST /admin/lessons/courses`; không có bước slugify từ `title`, không có hậu tố `-2` chống trùng, không xử lý dấu tiếng Việt.
- Validator regex trong `app/schemas/lesson.py`: `^[a-z0-9]+(?:-[a-z0-9]+)*$` (chữ thường + số + gạch ngang; không được bắt đầu/kết thúc bằng gạch ngang; không hai gạch liền). Vi phạm → **422** với message `"Slug chỉ được chứa chữ thường, số và dấu gạch ngang (phải bắt đầu và kết thúc bằng chữ hoặc số)"`.
- Unique: cột `courses.slug` là `String(120) UNIQUE INDEX`. Service kiểm trước bằng `slug_exists()` → **409 CONFLICT** với detail `"Slug '<slug>' đã được sử dụng"`. Kiểm tra này **không** khoá hàng → hai request đồng thời cùng slug vẫn có thể chạm unique index và ra 500.
- **Đổi tên khoá học KHÔNG đổi slug.** `PATCH` sửa `title` mà không truyền `slug` → slug giữ nguyên, URL công khai không đổi. Nhưng nếu admin truyền `slug` mới thì slug đổi ngay, **URL cũ chết 404 lập tức**, không có redirect 301, không lưu lịch sử slug cũ. Bản viết lại nên cảnh báo trên UI admin.

**Tự động tính lại `total_episodes` / `total_duration_seconds`**

`EpisodeRepository.refresh_course_denorms(course_id)` chạy `SELECT COUNT(id), COALESCE(SUM(duration_seconds), 0) FROM episodes WHERE course_id = $1` rồi `UPDATE courses SET ...`. Được gọi ở đúng **3** chỗ: sau tạo tập (#12), sau xoá tập (#15), sau upload file tập (#16). **KHÔNG** được gọi sau `PATCH /admin/lessons/episodes/{id}` (#14) — nên đổi `is_published` không ảnh hưởng denorm (đúng, vì denorm đếm cả tập ẩn), nhưng nếu bản viết lại cho sửa `duration_seconds` bằng PATCH thì phải tự gọi lại.

Đếm **mọi** tập, kể cả `is_published = false`. Vì vậy `total_episodes` của khoá học thường **lớn hơn** `episodes.length` mà endpoint #2 trả về.

**Đo thời lượng video (`app/services/lesson/video_probe.py`)**

- Cơ chế: **gọi shell `ffprobe`**, không dùng thư viện Python nào. Lệnh chính xác: `ffprobe -v error -show_entries format=duration -of json <path>`.
- Kiểm tra trước: `shutil.which("ffprobe")` — nếu không có binary trong PATH → trả `null` ngay, không thử chạy.
- Timeout **15 giây** (`asyncio.wait_for`).
- Kết quả: `int(float(data["format"]["duration"]))` — **truncate xuống**, không round. Video 125.9s → `125`.
- Thất bại (binary thiếu / exit code lỗi / JSON không parse được / thiếu key / timeout) → **trả `null`, KHÔNG raise**. Tầng gọi (`EpisodeService.save_file`) còn bọc thêm `try/except` và ghi log `warning "ffprobe failed for episode %s, duration will be NULL"`. Upload vẫn **thành công 200**, chỉ `duration_seconds = null`.
- Chỉ chạy cho `content_type === 'video'`. PDF không probe.
- Tương đương TS: spawn `ffprobe` qua `child_process.execFile` (bọc promisify), timeout 15000ms, `which`-check trước (ví dụ package `which` hoặc thử `execFile('ffprobe', ['-version'])` lúc bootstrap). **Không** thay bằng `fluent-ffmpeg` mặc định vì nó vẫn cần binary; nếu chọn thư viện WASM thì phải giữ đúng ngữ nghĩa "thất bại = null, không lỗi request".

**Quy tắc "đã hoàn thành"**

- Cột `episode_progress.completed_at TIMESTAMPTZ NULL`. Hoàn thành ⇔ `completed_at IS NOT NULL`.
- Logic upsert (`ProgressRepository.upsert`), **nguyên văn ngữ nghĩa**:
  - `if completed === true && row.completed_at === null` → `row.completed_at = now()` (UTC).
  - `if last_position_seconds !== null` → ghi đè `row.last_position_seconds`.
- Hệ quả 1: **đã hoàn thành là một chiều.** Gửi `{"completed": false}` KHÔNG xoá `completed_at` — nó là no-op hoàn toàn. Không có API nào bỏ đánh dấu hoàn thành.
- Hệ quả 2: `completed_at` chỉ set **lần đầu**; gọi lại `{"completed": true}` không làm mới timestamp (idempotent — `tests/test_lessons_progress.py::test_upsert_completed_at_preserved_on_repeat`).
- Hệ quả 3: **không có ngưỡng phần trăm.** Không có logic kiểu "xem 90% thời lượng → tự hoàn thành". Client tự quyết định khi nào gửi `completed: true`; server tin tuyệt đối. `last_position_seconds` **không** bị so với `duration_seconds`, gửi 999999 cho video 300s vẫn 200.
- Khoá chính bảng: `(user_id, episode_id)`. `course_id` là cột thường (có FK + index), **được lấy từ `episode.course_id` phía server**, client không truyền được → không giả mạo được.

**Xoá: cascade DB và file vật lý**

| Hành động | Bản ghi DB | File trên đĩa |
|---|---|---|
| `DELETE /admin/lessons/courses/{id}` (#10) | **Soft**: chỉ `is_published = false`. Course, episodes, progress **giữ nguyên** | **Không xoá gì** — thumbnail + toàn bộ video/PDF vẫn nằm ở `/media` và vẫn tải được công khai |
| `DELETE /admin/lessons/episodes/{id}` (#15) | **Hard delete** hàng `episodes`; `episode_progress` bị **cascade** xoá (`ON DELETE CASCADE`) | Xoá `file_url` tương ứng theo kiểu *best-effort* (`unlink(missing_ok=True)`, lỗi OS bị nuốt) |
| Xoá hàng `courses` trực tiếp trong DB (không có endpoint) | Cascade xuống `episodes` (`ON DELETE CASCADE` + `delete-orphan`) và `episode_progress` | **Không** — không có hook nào xoá thư mục `courses/<id>/` |
| Xoá user (`users.id`) | `courses.created_by_user_id` → `SET NULL`; `episode_progress` của user → **CASCADE xoá** | — |

Tóm lại: **không có endpoint nào xoá vĩnh viễn một khoá học.** Bản viết lại nếu thêm hard-delete course thì phải tự dọn thư mục media, vì backend Python hiện tại không có đoạn code đó.

**Audit log admin**

`AuditCtx` (`app/api/deps_audit.py`) thu `admin_id`, `ip` (`request.client.host`), `user_agent`, `request_id` (ưu tiên `request.state.request_id` do middleware đặt, rồi header `X-Request-ID`, rồi uuid4 mới). `AdminAuditService.record()` được gọi **sau khi mutation đã vào session, trước khi request commit** — cùng một transaction, nên hoặc cả hai landing, hoặc cả hai rollback. `record()` **không** nuốt exception: audit lỗi ⇒ request lỗi.

| Endpoint | Có audit? | `action` | `target_entity` | `before` / `after` |
|---|---|---|---|---|
| #6 `GET /admin/lessons/courses` | **Không** | — | — | — |
| #7 `POST /admin/lessons/courses` | Có | `lesson.course.create` | `course` | chỉ `after` |
| #8 `GET /admin/lessons/courses/{id}` | **Không** | — | — | — |
| #9 `PATCH .../courses/{id}` | Có | `lesson.course.update` | `course` | cả hai |
| #10 `DELETE .../courses/{id}` | Có | `lesson.course.delete` | `course` | cả hai |
| #11 `POST .../thumbnail` | Có | `lesson.course.thumbnail` | `course` | chỉ `after` = `{thumbnail_url}` |
| #12 `POST .../episodes` | Có | `lesson.episode.create` | `episode` | chỉ `after` |
| #13 `POST .../reorder` | Có | `lesson.episode.reorder` | **`course`** | chỉ `after` = `{reorder: [...]}` |
| #14 `PATCH .../episodes/{id}` | Có | `lesson.episode.update` | `episode` | cả hai |
| #15 `DELETE .../episodes/{id}` | Có | `lesson.episode.delete` | `episode` | chỉ `before` |
| #16 `POST .../episodes/{id}/file` | Có | `lesson.episode.upload` | `episode` | chỉ `after` = `{file_url, file_size_bytes, duration_seconds}` |

Snapshot **cố định** (không phải toàn bộ row):
- `_course_snapshot` = `{slug, title, level, category, is_premium, is_published}` — **không** gồm `description`, `thumbnail_url`, denorms.
- `_episode_snapshot` = `{title, content_type, sort_order, is_published, file_url}` — **không** gồm `description`, `markdown_body`, `duration_seconds`, `file_size_bytes`.

Vậy: **9/11 endpoint admin có audit; 2 endpoint GET không có.** Không có endpoint public nào ghi audit.

**Rate limit**

Không endpoint nào của chương này khai báo limit riêng. Áp dụng mặc định toàn cục qua `SlowAPIMiddleware`: `RATE_LIMIT_DEFAULT = "60/minute"` per-IP, storage `memory://`, và **tắt hoàn toàn khi `APP_ENV ∈ {testing, test}`** (`app/core/rate_limit.py`).

**Cache**

Không có Redis cache trên bất kỳ endpoint nào của chương này. Mọi request đọc thẳng Postgres.

---

## Nhóm A — Công khai + người dùng đã đăng nhập (`/api/v1/lessons`)

### GET /api/v1/lessons/courses

> **Danh sách khoá học công khai** — trả catalog các khoá học đã xuất bản, có phân trang, filter và tìm kiếm.

| | |
|---|---|
| **Quyền** | Công khai (OpenAPI không khai báo `security`) |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — bảng `courses` |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | integer | Không | `1` | `>= 1` | Trang, đánh số từ 1 |
| `page_size` | integer | Không | `20` | `1..100` | Số item mỗi trang |
| `category` | string \| null | Không | `null` | — | So khớp **chính xác** `courses.category` (case-sensitive) |
| `level` | string \| null | Không | `null` | — | So khớp **chính xác** `courses.level`. **Không** validate theo enum → `level=Beginner` trả rỗng, không 422 |
| `is_premium` | boolean \| null | Không | `null` | — | `null` = không filter |
| `search` | string \| null | Không | `null` | — | `ILIKE '%<search>%'` trên `title` **HOẶC** `description` |

**Request body** — —

**Response 200**

~~~ts
type Response = PaginatedResponse<CourseResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
      "slug": "nhap-mon-phan-tich-co-ban",
      "title": "Nhập môn phân tích cơ bản: đọc doanh nghiệp qua FPT và VNM",
      "description": "Khoá học 8 tập dành cho người mới, lấy FPT và VNM làm ví dụ xuyên suốt.",
      "thumbnail_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/thumbnail.jpg",
      "level": "beginner",
      "category": "phan-tich-co-ban",
      "is_premium": false,
      "is_published": true,
      "total_episodes": 8,
      "total_duration_seconds": 9420,
      "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
      "created_at": "2026-07-02T03:15:08.442117Z",
      "updated_at": "2026-08-17T01:40:22.907553Z"
    },
    {
      "id": "c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208",
      "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
      "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG",
      "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
      "thumbnail_url": "/media/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208/thumbnail.jpg",
      "level": "advanced",
      "category": "bao-cao-tai-chinh",
      "is_premium": true,
      "is_published": true,
      "total_episodes": 12,
      "total_duration_seconds": 21600,
      "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
      "created_at": "2026-06-11T08:02:41.118902Z",
      "updated_at": "2026-08-16T10:05:13.664201Z"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | *(handler mặc định FastAPI)* | `page < 1`, `page_size > 100` hoặc `< 1`, `is_premium` không parse được thành bool | Mảng `detail[]` chuẩn của FastAPI |
| 429 | *(slowapi)* | Vượt 60 req/phút/IP | Body của slowapi |

**Fallback / suy giảm** — Không có provider ngoài. Không có dữ liệu khớp → `200` với `items: []`, `total: 0`, **`total_pages: 0`** (không phải 1). Trang vượt quá cuối → `items: []` nhưng `total` vẫn là tổng thật. Khoá học `is_published = false` **không bao giờ** xuất hiện ở đây (test `test_catalog_shows_only_published`).

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/lessons/courses?page=1&page_size=20&category=phan-tich-co-ban&is_premium=false&search=FPT' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4b1e7f30-2a58-4c96-8d17-e0f3b6a29c44'
~~~

**Ghi chú khi viết lại**

- Sắp xếp **cứng** `ORDER BY created_at DESC`, không có tham số `sort`. Với hai khoá cùng `created_at` (seed hàng loạt) thứ tự **không xác định** — bản NestJS nên thêm tie-breaker `id` để phân trang ổn định, nhưng phải biết đây là *sửa*, không phải *khớp*.
- Điều kiện `is_published` được **luôn** ghép vào WHERE ở nhánh public (`CourseRepository.list_public`), khác nhánh admin nơi WHERE có thể rỗng.
- `search` dùng `ILIKE` với `%...%` — ký tự `%` và `_` trong input **không được escape** → user gửi `search=%` sẽ khớp tất cả. Không phải lỗ SQL injection (dùng bind param) nhưng là lỗi ngữ nghĩa; TypeORM/Prisma cần escape thủ công nếu muốn sửa.
- `total_pages` dùng `Math.ceil(total / page_size)` và **`0` khi `total === 0`**. Client cũ có thể phụ thuộc con số 0 này.

---

### GET /api/v1/lessons/courses/{slug}

> **Chi tiết khoá học** — trả metadata khoá học kèm danh sách tập đã xuất bản (không có nội dung), và kèm tổng kết tiến độ nếu request có token hợp lệ.

| | |
|---|---|
| **Quyền** | Công khai — token **tuỳ chọn**. OpenAPI ghi `HTTPBearer` nhưng `auto_error=False`; xem mục «Phân quyền» |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `courses` + `episodes` (eager `selectinload`) + `episode_progress` khi có user |
| **Side-effect** | — |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `slug` | string | Không validate regex ở đường dẫn | Slug khoá học, ví dụ `nhap-mon-phan-tich-co-ban` |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface CourseDetailResponse extends CourseResponse {
  /** CHỈ tập is_published === true; đã sort theo sort_order tăng dần */
  episodes: EpisodeBrief[];
  /** null khi request ẩn danh hoặc token không giải mã được */
  progress_summary: CourseProgressSummary | null;
}
~~~

~~~json
{
  "id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
  "slug": "nhap-mon-phan-tich-co-ban",
  "title": "Nhập môn phân tích cơ bản: đọc doanh nghiệp qua FPT và VNM",
  "description": "Khoá học 8 tập dành cho người mới, lấy FPT và VNM làm ví dụ xuyên suốt.",
  "thumbnail_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/thumbnail.jpg",
  "level": "beginner",
  "category": "phan-tich-co-ban",
  "is_premium": false,
  "is_published": true,
  "total_episodes": 8,
  "total_duration_seconds": 9420,
  "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
  "created_at": "2026-07-02T03:15:08.442117Z",
  "updated_at": "2026-08-17T01:40:22.907553Z",
  "episodes": [
    {
      "id": "2d9b4f61-8c3a-4d57-bf10-6e42a90c7d35",
      "title": "Tập 1 — Vì sao phải đọc doanh nghiệp trước khi mua",
      "description": "Bài đọc mở đầu, không có video.",
      "content_type": "text",
      "duration_seconds": null,
      "file_size_bytes": null,
      "sort_order": 1,
      "is_published": true,
      "created_at": "2026-07-02T03:20:11.004512Z",
      "updated_at": "2026-07-02T03:20:11.004512Z"
    },
    {
      "id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7",
      "title": "Tập 2 — Bóc tách doanh thu FPT theo khối",
      "description": null,
      "content_type": "video",
      "duration_seconds": 1284,
      "file_size_bytes": 187433216,
      "sort_order": 2,
      "is_published": true,
      "created_at": "2026-07-03T02:11:47.882300Z",
      "updated_at": "2026-07-03T02:44:09.512884Z"
    }
  ],
  "progress_summary": {
    "completed": 2,
    "total": 8,
    "percent": 25.0
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Slug không tồn tại **hoặc** khoá học có `is_published = false` | `"Không tìm thấy Khoá học"` |
| 422 | *(FastAPI)* | Không xảy ra trên thực tế — `slug` là `str`, mọi giá trị đều hợp lệ | — |

**Fallback / suy giảm** — Ẩn danh → `progress_summary: null`, phần còn lại đầy đủ. Token hết hạn / sai định dạng / user đã bị xoá → **cũng** `progress_summary: null` và **vẫn 200** (exception bị nuốt trong `_optional_user`). Khoá chưa có tập nào → `episodes: []`. Khoá chỉ có tập ẩn → `episodes: []` nhưng `total_episodes` vẫn > 0.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/lessons/courses/nhap-mon-phan-tich-co-ban' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9c0a7e51-3f28-4b74-a6d3-1e58f0b4c927'
~~~

**Ghi chú khi viết lại**

- **Không bao giờ** để `file_url` hoặc `markdown_body` lọt vào `episodes[]` ở endpoint này. Hai test chốt điều đó: `test_course_detail_episodes_have_no_file_url` và `test_course_detail_episodes_have_no_markdown_body` — chúng assert **field không có mặt** (`"file_url" not in ep_data`), không phải bằng `null`. Bản NestJS phải dùng DTO whitelist (`class-transformer` + `excludeExtraneousValues: true`), chứ không serialise thẳng entity.
- Lọc tập ẩn được làm **trong bộ nhớ** (`[ep for ep in course.episodes if ep.is_published]`) sau khi eager-load **toàn bộ** tập. Với khoá 200 tập thì tải hết rồi bỏ. Có thể lọc ở SQL trong bản mới — an toàn về hành vi.
- Thứ tự `episodes[]` đến từ `relationship(order_by="Episode.sort_order")` ở tầng ORM, **không** từ handler. Nếu bản TS query rời thì phải tự thêm `ORDER BY sort_order ASC`.
- **Bất đối xứng cố hữu của `progress_summary`:** `completed` đếm bản ghi tiến độ (có thể trỏ tới tập đã bị ẩn), `total` = `course.total_episodes` (đếm cả tập ẩn) — nhưng `episodes[]` chỉ hiện tập công khai. Do đó `percent` có thể **không** ăn khớp với những gì user thấy trên UI, và về lý thuyết `completed` có thể vượt `episodes.length`. Giữ nguyên công thức để không lệch số với client cũ.
- `percent` là `round(x, 1)` phía Python → JSON ra dạng `25.0`, `33.3`. TS phải trả `number`, và làm tròn 1 chữ số thập phân (`Math.round(x * 10) / 10`) chứ không để `33.333333`.

---

### GET /api/v1/lessons/episodes/{episode_id}/content

> **Nội dung tập học** — trả nội dung đầy đủ của một tập (markdown hoặc đường dẫn file), sau khi vượt kiểm tra xuất bản và Premium.

| | |
|---|---|
| **Quyền** | Bearer; **+ Premium** nếu `course.is_premium === true` (admin miễn) |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `episodes` + `courses` (`selectinload`) + `premium_subscriptions` khi cần |
| **Side-effect** | — (không ghi log xem, không tăng counter, **không** tự tạo bản ghi tiến độ) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `episode_id` | string (uuid) | Phải là UUID hợp lệ, nếu không → 422 | ID tập học |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Response = EpisodeContent;
~~~

~~~json
{
  "id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7",
  "course_id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
  "title": "Tập 2 — Bóc tách doanh thu FPT theo khối",
  "description": null,
  "content_type": "video",
  "file_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/ep-7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7.mp4",
  "markdown_body": null,
  "duration_seconds": 1284,
  "file_size_bytes": 187433216,
  "sort_order": 2,
  "is_published": true
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không có header `Authorization` | `"Yêu cầu xác thực"` (kèm header `WWW-Authenticate: Bearer`) |
| 401 | `UNAUTHORIZED` | Token hết hạn | `"Access token đã hết hạn"` |
| 401 | `UNAUTHORIZED` | Token sai chữ ký / méo | `"Access token không hợp lệ"` |
| 401 | `UNAUTHORIZED` | Token là refresh token | `"Sai loại token"` |
| 403 | `FORBIDDEN` | `user.status !== 'active'` | `"Trạng thái tài khoản: <status>"` |
| 403 | `FORBIDDEN` | `user.is_active === false` (dep `get_current_active_user`) | `"Tài khoản chưa được kích hoạt"` |
| 403 | `FORBIDDEN` | Khoá premium + user không premium | `"Yêu cầu gói Premium đang hoạt động"` |
| 404 | `NOT_FOUND` | Tập không tồn tại **/** khoá chưa xuất bản **/** tập chưa xuất bản | `"Không tìm thấy Tập học"` |
| 422 | *(FastAPI)* | `episode_id` không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — **Không có preview cho user free** — 403 cứng, thân lỗi không kèm mẩu nội dung nào. Nếu tập là `video`/`pdf` mà admin chưa upload file thì `file_url = null` và `200` vẫn trả bình thường (client phải tự xử lý trạng thái "chưa có file") — nhưng trên thực tế tập như vậy có `is_published = false` (xem #12) nên sẽ ra 404 trước. `duration_seconds = null` với video là **hợp lệ** (ffprobe thất bại), UI không được coi đó là lỗi.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/lessons/episodes/7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7/content' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 1f6b83c9-4d07-4e52-9a81-b7c204ef3d68'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra bắt buộc:** nạp episode → (tồn tại **&&** `course.is_published` **&&** `episode.is_published`) → premium. Đảo lại sẽ làm rò rỉ sự tồn tại của khoá nháp qua 403. Ba điều kiện 404 gộp trong **một** biểu thức `or`, cùng một message — cố ý không phân biệt để không leak.
- Bypass admin dùng **`current_user.role !== UserRole.ADMIN`**, tức so **role trên bản ghi user trong DB**, không đọc claim `role` trong JWT. Bản TS phải load user rồi so, đừng tin claim.
- Handler này gọi `PremiumService` **inline** thay vì dùng dependency `PremiumUser`, chính vì cần *nhánh có điều kiện* (chỉ kiểm khi khoá premium). Đừng "dọn dẹp" thành `@UseGuards(PremiumGuard)` ở cấp route — sẽ làm khoá miễn phí cũng đòi Premium.
- Endpoint trả **URL, không stream**. Không thêm `Content-Disposition`, không proxy bytes. Xem cảnh báo rò link ở mục «Media URL».
- `EpisodeContent` **không** có `created_at`/`updated_at` (khác `EpisodeBrief`). Đừng thêm field cho "nhất quán".

---

### POST /api/v1/lessons/episodes/{episode_id}/progress

> **Ghi tiến độ tập học** — upsert bản ghi tiến độ của user hiện tại cho một tập: đánh dấu hoàn thành và/hoặc lưu vị trí đang xem (đơn vị **giây**).

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | **INSERT hoặc UPDATE** bảng `episode_progress` (PK `(user_id, episode_id)`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `episode_id` | string (uuid) | UUID hợp lệ | ID tập học |

**Query params** — —

**Request body**

~~~ts
interface ProgressUpdate {
  /** true → set completed_at = now() NẾU đang null. false / null → KHÔNG làm gì */
  completed?: boolean | null;
  /** Vị trí đang xem, đơn vị GIÂY, >= 0. Không có chặn trên theo duration */
  last_position_seconds?: number | null;
}
~~~

~~~json
{
  "completed": true,
  "last_position_seconds": 1284
}
~~~

**Response 200**

~~~ts
type Response = ProgressRow;
~~~

~~~json
{
  "episode_id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7",
  "course_id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
  "completed_at": "2026-08-17T04:32:58.771044Z",
  "last_position_seconds": 1284,
  "created_at": "2026-08-16T14:02:11.309887Z",
  "updated_at": "2026-08-17T04:32:58.775210Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không có / sai token | `"Yêu cầu xác thực"` / `"Access token đã hết hạn"` / `"Access token không hợp lệ"` |
| 403 | `FORBIDDEN` | Tài khoản không active | `"Tài khoản chưa được kích hoạt"` |
| 404 | `NOT_FOUND` | `episode_id` không có trong bảng `episodes` | `"Không tìm thấy Tập học"` |
| 422 | *(FastAPI)* | `episode_id` không phải UUID; `last_position_seconds < 0`; sai kiểu | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Body **rỗng** `{}` là hợp lệ: sẽ tạo (nếu chưa có) một hàng tiến độ với `completed_at: null`, `last_position_seconds: null` và trả 200. Không có provider ngoài nên không có nhánh suy giảm nào khác.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/lessons/episodes/7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5a2f9d10-7c34-4be8-91d6-0f83b4a7c25e' \
  -d '{"completed": true, "last_position_seconds": 1284}'
~~~

**Ghi chú khi viết lại**

- Endpoint dùng `EpisodeRepository.get_by_id` (**không** kèm course) — nên **không** kiểm `course.is_published`, **không** kiểm `episode.is_published`, và **không** kiểm Premium. Bất kỳ user đăng nhập nào có `episode_id` đều ghi được tiến độ cho tập của khoá premium hoặc khoá nháp. Đây là hành vi hiện tại; nếu siết lại thì phải coi là **thay đổi hành vi có chủ ý** và ghi vào changelog, vì client cũ có thể đang ghi tiến độ trước khi mở nội dung.
- `course_id` **luôn** lấy từ `episode.course_id` phía server. Không nhận từ body.
- Upsert được cài bằng **SELECT rồi INSERT/UPDATE**, không dùng `INSERT ... ON CONFLICT`. Hai request song song cho cùng `(user, episode)` có thể chạm PK và ra 500. Bản NestJS nên dùng `ON CONFLICT (user_id, episode_id) DO UPDATE` — sửa được mà không đổi hợp đồng API.
- `completed: false` là **no-op**, không reset. Đừng "sửa" thành reset — sẽ phá dữ liệu tiến độ và mâu thuẫn `test_upsert_completed_at_preserved_on_repeat`.
- `completed_at` sinh bằng `datetime.now(UTC)` (giờ **UTC**, không phải `Asia/Ho_Chi_Minh`). Toàn bộ timestamp bảng này là `TIMESTAMPTZ`.
- `updated_at` do `onupdate=func.now()` ở tầng ORM (giờ DB), **không** trigger DB. Bản TypeORM cần `@UpdateDateColumn`; Prisma cần `@updatedAt`.
- Response **không** chứa `user_id` dù đó là nửa khoá chính — giữ đúng shape.

---

### GET /api/v1/lessons/me/progress

> **Tiến độ của tôi trong một khoá học** — trả mảng phẳng các bản ghi tiến độ của user hiện tại, giới hạn trong đúng một `course_id`.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `episode_progress` (index `ix_ep_progress_user_course`) |
| **Side-effect** | — |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `course_id` | string (uuid) | **Có** (`Query(...)`) | — | UUID hợp lệ | Chỉ trả tiến độ thuộc khoá học này |

**Request body** — —

**Response 200**

~~~ts
/** Mảng PHẲNG, KHÔNG bọc trong { items } và KHÔNG phân trang */
type Response = ProgressRow[];
~~~

~~~json
[
  {
    "episode_id": "2d9b4f61-8c3a-4d57-bf10-6e42a90c7d35",
    "course_id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
    "completed_at": "2026-08-16T13:58:02.114773Z",
    "last_position_seconds": null,
    "created_at": "2026-08-16T13:57:44.220310Z",
    "updated_at": "2026-08-16T13:58:02.118004Z"
  },
  {
    "episode_id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7",
    "course_id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
    "completed_at": null,
    "last_position_seconds": 642,
    "created_at": "2026-08-17T04:11:09.663288Z",
    "updated_at": "2026-08-17T04:29:50.442116Z"
  }
]
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không có / sai token | `"Yêu cầu xác thực"` / `"Access token đã hết hạn"` / `"Access token không hợp lệ"` |
| 403 | `FORBIDDEN` | Tài khoản không active | `"Tài khoản chưa được kích hoạt"` |
| 422 | *(FastAPI)* | Thiếu `course_id` hoặc không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — `course_id` **không tồn tại** → **200 với `[]`**, KHÔNG phải 404 (không có truy vấn kiểm khoá học). User chưa từng học → `[]` (test `test_get_my_progress_empty_for_no_progress`). Không có endpoint nào lấy tiến độ **mọi** khoá học cùng lúc — muốn dashboard thì client phải gọi lặp theo từng khoá.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/lessons/me/progress?course_id=8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 0d47b6a2-8e91-4c35-bf70-2a5138c9e4d6'
~~~

**Ghi chú khi viết lại**

- **KHÔNG có `ORDER BY`** trong `ProgressRepository.list_for_user_course` → thứ tự do Postgres quyết định, không ổn định. Client **phải** tự sắp xếp (thường join theo `episodes[].sort_order` từ endpoint #2). Bản TS nên thêm `ORDER BY updated_at DESC` hoặc join `sort_order` — nhưng phải hiểu là *cải thiện*, không có test nào chốt thứ tự.
- Trả **mảng trần**, không phải `PaginatedResponse`. Không giới hạn số hàng — khoá 200 tập trả 200 hàng.
- Không kiểm quyền truy cập khoá học: user free vẫn xem được tiến độ mình đã ghi cho khoá premium (do #4 cho ghi).
- Không có bản ghi ⇒ tập đó "chưa bắt đầu". Client không được coi thiếu hàng là lỗi.

---

## Nhóm B — Quản trị: khoá học (`/api/v1/admin/lessons`)

### GET /api/v1/admin/lessons/courses

> **Danh sách khoá học (quản trị)** — như catalog công khai nhưng thấy cả khoá chưa xuất bản và có thêm filter `is_published`.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `courses` |
| **Side-effect** | — (**không** ghi audit log) |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `page` | integer | Không | `1` | `>= 1` | Trang |
| `page_size` | integer | Không | `20` | `1..100` | Số item/trang |
| `category` | string \| null | Không | `null` | — | So khớp chính xác |
| `level` | string \| null | Không | `null` | — | So khớp chính xác, không validate enum |
| `is_premium` | boolean \| null | Không | `null` | — | — |
| `is_published` | boolean \| null | Không | `null` | — | **Chỉ có ở nhánh admin.** `null` = lấy cả xuất bản lẫn nháp |
| `search` | string \| null | Không | `null` | — | `ILIKE '%...%'` trên `title` hoặc `description` |

**Request body** — —

**Response 200**

~~~ts
type Response = PaginatedResponse<CourseResponse>;
~~~

~~~json
{
  "items": [
    {
      "id": "d92b6f14-05ac-4e71-8b3f-71c6ea290d58",
      "slug": "chien-luoc-giao-dich-hpg",
      "title": "Chiến lược giao dịch cổ phiếu thép: nghiên cứu HPG (bản nháp)",
      "description": null,
      "thumbnail_url": null,
      "level": "intermediate",
      "category": "giao-dich",
      "is_premium": true,
      "is_published": false,
      "total_episodes": 3,
      "total_duration_seconds": 0,
      "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
      "created_at": "2026-08-17T02:05:33.771902Z",
      "updated_at": "2026-08-17T02:05:33.771902Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không có / sai token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | `role !== 'admin'` | `"Yêu cầu quyền quản trị viên"` |
| 422 | *(FastAPI)* | `page`/`page_size` ngoài khoảng | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Không filter nào ⇒ `WHERE` **rỗng hoàn toàn** (khác nhánh public luôn có `is_published = true`). Rỗng → `items: []`, `total_pages: 0`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/admin/lessons/courses?page=1&page_size=20&is_published=false' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7e30c9a4-1b62-4d58-8f07-c4a1e296b3d0'
~~~

**Ghi chú khi viết lại**

- Cùng dùng `CourseListParams` với nhánh public, nhưng `is_published` **chỉ được truyền ở nhánh admin** — public handler không nhận query đó (gửi `?is_published=false` vào `/lessons/courses` bị bỏ qua, không 422).
- Cùng `ORDER BY created_at DESC`, không đổi được.
- **Không audit** — đúng nguyên tắc: chỉ mutation mới ghi. Đừng thêm audit cho GET.

---

### POST /api/v1/admin/lessons/courses

> **Tạo khoá học** — tạo khoá học mới với slug do admin tự đặt; mặc định chưa xuất bản.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | INSERT `courses` (kèm `created_by_user_id = admin.id`) + INSERT `admin_audit_logs` action `lesson.course.create` |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface CourseCreate {
  slug: string;              // <= 120, regex ^[a-z0-9]+(?:-[a-z0-9]+)*$, BẮT BUỘC
  title: string;             // 1..200, BẮT BUỘC
  description?: string | null;
  level: CourseLevel;        // BẮT BUỘC, phải đúng 1 trong 3 giá trị
  category: string;          // 1..60, BẮT BUỘC
  is_premium?: boolean;      // default false
  is_published?: boolean;    // default false
}
~~~

~~~json
{
  "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
  "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG",
  "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
  "level": "advanced",
  "category": "bao-cao-tai-chinh",
  "is_premium": true,
  "is_published": false
}
~~~

**Response 201**

~~~ts
type Response = CourseResponse;
~~~

~~~json
{
  "id": "c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208",
  "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
  "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG",
  "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
  "thumbnail_url": null,
  "level": "advanced",
  "category": "bao-cao-tai-chinh",
  "is_premium": true,
  "is_published": false,
  "total_episodes": 0,
  "total_duration_seconds": 0,
  "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
  "created_at": "2026-08-17T02:41:19.508663Z",
  "updated_at": "2026-08-17T02:41:19.508663Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 409 | `CONFLICT` | Slug đã tồn tại | `"Slug 'doc-bao-cao-tai-chinh-vcb-hpg' đã được sử dụng"` |
| 422 | *(FastAPI)* | Slug sai regex | msg: `"Slug chỉ được chứa chữ thường, số và dấu gạch ngang (phải bắt đầu và kết thúc bằng chữ hoặc số)"` |
| 422 | *(FastAPI)* | Thiếu `slug`/`title`/`level`/`category`; `level` ngoài enum; `title` rỗng; `slug` > 120 | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Không có provider ngoài. Nếu ghi audit thất bại thì **cả** INSERT khoá học bị rollback (cùng transaction, `record()` không nuốt lỗi) → client nhận 5xx và không có khoá học nào được tạo. Đây là hành vi mong muốn, phải giữ.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/admin/lessons/courses' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2b58f7d1-9403-4ea6-b17c-58d0e6a3f924' \
  -d '{
    "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
    "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG",
    "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
    "level": "advanced",
    "category": "bao-cao-tai-chinh",
    "is_premium": true,
    "is_published": false
  }'
~~~

**Ghi chú khi viết lại**

- Status **201**, không 200.
- `is_published` **có thể** đặt `true` ngay lúc tạo, dù khoá chưa có tập nào → khoá rỗng lên catalog công khai với `total_episodes: 0`. Không có guard. Test `test_delete_course_soft_deletes` tạo khoá với `is_published: true` ngay từ đầu.
- Thứ tự: validate schema (Pydantic) → kiểm slug trùng → INSERT → ghi audit. Kiểm trùng slug **trước** khi tạo, nên 409 không để lại rác.
- `level` được lưu dạng **chuỗi** (`data.level.value`) vào `VARCHAR(20)`, không phải enum Postgres. Bản TS đừng tạo `CREATE TYPE`.
- `created_by_user_id` lấy từ `admin.id`, không nhận từ body.
- Audit chỉ có `after` = `_course_snapshot` (6 field), không phải toàn bộ response.

---

### GET /api/v1/admin/lessons/courses/{course_id}

> **Chi tiết khoá học (quản trị)** — trả khoá học kèm **toàn bộ** tập (cả tập ẩn) và có `file_url`.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `courses` + `episodes` (`selectinload`) |
| **Side-effect** | — (**không** ghi audit log) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `course_id` | string (uuid) | UUID hợp lệ | ID khoá học (**không** dùng slug ở nhánh admin) |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface CourseAdminDetailResponse extends CourseResponse {
  /** MỌI tập, kể cả is_published === false; sort theo sort_order tăng dần */
  episodes: EpisodeAdminBrief[];
  // LƯU Ý: KHÔNG có progress_summary ở nhánh admin
}
~~~

~~~json
{
  "id": "8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11",
  "slug": "nhap-mon-phan-tich-co-ban",
  "title": "Nhập môn phân tích cơ bản: đọc doanh nghiệp qua FPT và VNM",
  "description": "Khoá học 8 tập dành cho người mới, lấy FPT và VNM làm ví dụ xuyên suốt.",
  "thumbnail_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/thumbnail.jpg",
  "level": "beginner",
  "category": "phan-tich-co-ban",
  "is_premium": false,
  "is_published": true,
  "total_episodes": 3,
  "total_duration_seconds": 1284,
  "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
  "created_at": "2026-07-02T03:15:08.442117Z",
  "updated_at": "2026-08-17T01:40:22.907553Z",
  "episodes": [
    {
      "id": "2d9b4f61-8c3a-4d57-bf10-6e42a90c7d35",
      "title": "Tập 1 — Vì sao phải đọc doanh nghiệp trước khi mua",
      "description": "Bài đọc mở đầu, không có video.",
      "content_type": "text",
      "file_url": null,
      "duration_seconds": null,
      "file_size_bytes": null,
      "sort_order": 1,
      "is_published": true,
      "created_at": "2026-07-02T03:20:11.004512Z",
      "updated_at": "2026-07-02T03:20:11.004512Z"
    },
    {
      "id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7",
      "title": "Tập 2 — Bóc tách doanh thu FPT theo khối",
      "description": null,
      "content_type": "video",
      "file_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/ep-7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7.mp4",
      "duration_seconds": 1284,
      "file_size_bytes": 187433216,
      "sort_order": 2,
      "is_published": true,
      "created_at": "2026-07-03T02:11:47.882300Z",
      "updated_at": "2026-07-03T02:44:09.512884Z"
    },
    {
      "id": "b58d3e07-1c94-4a62-9d80-4f7ea21c6b39",
      "title": "Tập 3 — Bảng cân đối kế toán VNM (PDF)",
      "description": null,
      "content_type": "pdf",
      "file_url": null,
      "duration_seconds": null,
      "file_size_bytes": null,
      "sort_order": 3,
      "is_published": false,
      "created_at": "2026-08-17T02:50:02.663111Z",
      "updated_at": "2026-08-17T02:50:02.663111Z"
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `course_id` không tồn tại | `"Không tìm thấy Khoá học"` |
| 422 | *(FastAPI)* | `course_id` không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Khoá chưa có tập → `episodes: []`. Khoá `is_published = false` **vẫn trả 200** ở nhánh admin (khác #2). Tập `pdf`/`video` chưa upload → `file_url: null`, `file_size_bytes: null`, `duration_seconds: null`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/admin/lessons/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6c19d4b0-5e83-4f27-a91b-3072ec8a5d14'
~~~

**Ghi chú khi viết lại**

- `EpisodeAdminBrief` **KHÔNG** chứa `markdown_body`. Đường duy nhất đọc markdown là `GET /lessons/episodes/{id}/content` (#3) — mà #3 đòi khoá **và** tập đều đã xuất bản. **Đây là khoảng trống nghiệp vụ đã tồn tại:** admin không có endpoint nào đọc được `markdown_body` của một tập **chưa xuất bản** (#3 trả 404 vì `episode.is_published === false`). Bản viết lại nên bổ sung `markdown_body` vào response admin hoặc thêm endpoint admin-get-episode, và ghi rõ đây là **thêm mới**, không phải khớp hành vi cũ.
- Không nhận `slug` — nhánh admin định danh bằng UUID.
- Khác #2, response **không** có `progress_summary`.

---

### PATCH /api/v1/admin/lessons/courses/{course_id}

> **Sửa khoá học** — cập nhật một phần các field metadata, gồm cả việc đổi slug (đổi URL công khai) và xuất bản/ẩn khoá.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `courses` + INSERT `admin_audit_logs` action `lesson.course.update` (có `before` + `after`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `course_id` | string (uuid) | UUID hợp lệ | ID khoá học |

**Query params** — —

**Request body**

~~~ts
/** Mọi field optional. CHỈ field CÓ MẶT trong JSON được ghi (exclude_unset) */
interface CourseUpdate {
  slug?: string | null;          // <= 120, cùng regex như CourseCreate
  title?: string | null;         // 1..200
  description?: string | null;   // gửi null = XOÁ mô tả
  level?: CourseLevel | null;
  category?: string | null;      // 1..60
  is_premium?: boolean | null;
  is_published?: boolean | null;
}
~~~

~~~json
{
  "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG (bản 2026)",
  "is_published": true
}
~~~

**Response 200**

~~~ts
type Response = CourseResponse;
~~~

~~~json
{
  "id": "c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208",
  "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
  "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG (bản 2026)",
  "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
  "thumbnail_url": "/media/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208/thumbnail.jpg",
  "level": "advanced",
  "category": "bao-cao-tai-chinh",
  "is_premium": true,
  "is_published": true,
  "total_episodes": 12,
  "total_duration_seconds": 21600,
  "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
  "created_at": "2026-06-11T08:02:41.118902Z",
  "updated_at": "2026-08-17T05:12:44.771205Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `course_id` không tồn tại | `"Không tìm thấy Khoá học"` |
| 409 | `CONFLICT` | Slug mới đã thuộc khoá khác | `"Slug 'nhap-mon-phan-tich-co-ban' đã được sử dụng"` |
| 422 | *(FastAPI)* | Slug sai regex; `title` rỗng; `level` ngoài enum | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Body `{}` là hợp lệ: không ghi field nào, nhưng vẫn `flush()` + **vẫn ghi 1 hàng audit** với `before`/`after` giống nhau. Không có nhánh provider ngoài.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/admin/lessons/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8d47a2f6-0b31-4e5c-97a8-16b3d0e94c72' \
  -d '{"title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG (bản 2026)", "is_published": true}'
~~~

**Ghi chú khi viết lại**

- **`exclude_unset` là bắt buộc.** Phân biệt "không gửi field" (giữ nguyên) với "gửi `null`" (ghi `null`, ví dụ xoá `description`). NestJS: `PATCH` DTO + `skipMissingProperties`, và **không** dùng `Object.assign` với DTO đã điền default.
- Slug mới được kiểm trùng với `exclude_id = course_id` → đặt lại **chính slug hiện tại** không gây 409.
- **Đổi slug làm chết URL cũ ngay lập tức**, không redirect, không lưu slug cũ. Đây là cạm bẫy SEO/deep-link; cân nhắc bảng `course_slug_history` ở bản mới (thêm mới, phải xin phép).
- `level` khi có mặt được `.value`-hoá về string trước khi ghi (`updates["level"] = lv.value if hasattr(lv, "value") else lv`).
- Endpoint tự nạp course **hai lần**: lần 1 trong handler để lấy `before`, lần 2 trong `CourseService.update`. Cả hai đều 404 cùng message. Không đổi hành vi nếu bản TS chỉ nạp một lần.
- **Không thể** sửa `thumbnail_url` qua endpoint này (không có trong `CourseUpdate`) — chỉ #11 đổi được. Cũng không sửa được `total_episodes`/`total_duration_seconds` (denorm, do hệ thống tính).
- Đặt `is_published: true` **không** kiểm khoá có tập nào hay tập có file hay không. Guard "phải có file mới xuất bản" chỉ tồn tại ở cấp **tập** (#14).

---

### DELETE /api/v1/admin/lessons/courses/{course_id}

> **Ẩn khoá học (soft-delete)** — hạ `is_published` về `false`; **không** xoá bản ghi và **không** xoá file.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `courses SET is_published = false` + INSERT `admin_audit_logs` action `lesson.course.delete` (`before` + `after`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `course_id` | string (uuid) | UUID hợp lệ | ID khoá học |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** 200 + body ĐẦY ĐỦ (KHÔNG phải 204). is_published luôn === false */
type Response = CourseResponse;
~~~

~~~json
{
  "id": "c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208",
  "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
  "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG (bản 2026)",
  "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
  "thumbnail_url": "/media/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208/thumbnail.jpg",
  "level": "advanced",
  "category": "bao-cao-tai-chinh",
  "is_premium": true,
  "is_published": false,
  "total_episodes": 12,
  "total_duration_seconds": 21600,
  "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
  "created_at": "2026-06-11T08:02:41.118902Z",
  "updated_at": "2026-08-17T05:28:31.220914Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `course_id` không tồn tại | `"Không tìm thấy Khoá học"` |
| 422 | *(FastAPI)* | `course_id` không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — **Idempotent**: gọi lại trên khoá đã ẩn vẫn trả 200 (và vẫn ghi thêm 1 hàng audit với `before === after`). Không có bước dọn file, nên `/media/courses/<id>/**` vẫn tải được công khai sau khi "xoá" — **rủi ro rò rỉ nội dung premium đã ẩn**, phải nêu trong bàn giao.

**curl**

~~~bash
curl -sS -X DELETE 'https://iqx.vn/api/v1/admin/lessons/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3a70e5c8-6d29-4b13-8f04-92a1c7be5d36'
~~~

**Ghi chú khi viết lại**

- **Không có cột `deleted_at`.** "Soft-delete" ở đây trùng hoàn toàn với `PATCH {is_published: false}`; khác biệt duy nhất là `action` trong audit log (`lesson.course.delete` vs `lesson.course.update`). Bản mới muốn thêm `deleted_at` thì phải sửa cả filter public.
- Không cascade gì: `episodes`, `episode_progress`, thumbnail, video đều còn nguyên. Ẩn khoá → #2 trả 404 và #3 trả 404, nhưng #4/#5 vẫn hoạt động (không kiểm published).
- Trả 200 kèm body, không 204. Client dựa vào `is_published === false` trong response (test `test_delete_course_soft_deletes`).
- Không có endpoint "restore" — dùng `PATCH {is_published: true}`.

---

### POST /api/v1/admin/lessons/courses/{course_id}/thumbnail

> **Upload ảnh bìa khoá học** — nhận ảnh multipart, resize về JPEG tối đa 1280×720, ghi đè file `thumbnail.jpg` của khoá.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | Multipart upload → ghi đĩa local + UPDATE DB |
| **Side-effect** | Ghi file `<LESSON_MEDIA_DIR>/courses/<course_id>/thumbnail.jpg` (ghi đè) + UPDATE `courses.thumbnail_url` + INSERT `admin_audit_logs` action `lesson.course.thumbnail` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `course_id` | string (uuid) | UUID hợp lệ | ID khoá học |

**Query params** — —

**Request body**

`multipart/form-data`, **đúng một** field:

~~~ts
/** OpenAPI: Body_admin_upload_thumbnail_..._post */
interface ThumbnailUploadForm {
  /** Tên field BẮT BUỘC là "file". MIME phải ∈ {image/jpeg, image/png, image/webp} */
  file: File;   // binary
}
~~~

~~~json
// Không phải JSON. Tương đương form:
// file=@bia-khoa-hoc-vcb-hpg.png  (Content-Type: image/png)
{ "_form": "file=@bia-khoa-hoc-vcb-hpg.png; type=image/png" }
~~~

**Response 200**

~~~ts
type Response = CourseResponse;   // thumbnail_url đã cập nhật
~~~

~~~json
{
  "id": "c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208",
  "slug": "doc-bao-cao-tai-chinh-vcb-hpg",
  "title": "Đọc báo cáo tài chính ngân hàng và thép: VCB, HPG (bản 2026)",
  "description": "Khoá học nâng cao, bóc tách BCTC quý của VCB và HPG.",
  "thumbnail_url": "/media/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208/thumbnail.jpg",
  "level": "advanced",
  "category": "bao-cao-tai-chinh",
  "is_premium": true,
  "is_published": true,
  "total_episodes": 12,
  "total_duration_seconds": 21600,
  "created_by_user_id": "3e5a9c17-70bd-42f8-b6c1-8d29f04ae153",
  "created_at": "2026-06-11T08:02:41.118902Z",
  "updated_at": "2026-08-17T05:44:02.118773Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| **415** | *(không có `code`)* | MIME không ∈ {jpeg, png, webp} — **kiểm TRƯỚC khi tra khoá học** | `"Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp"` |
| 404 | `NOT_FOUND` | `course_id` không tồn tại (chỉ tới được sau khi MIME hợp lệ) | `"Không tìm thấy Khoá học"` |
| **413** | *(không có `code`)* | Kích thước > `LESSON_MAX_THUMBNAIL_MB` (default **5 MB**) | `"Ảnh quá lớn (tối đa 5 MB)"` |
| 500 | — | Pillow không mở được ảnh (file hỏng dù MIME đúng) | Lỗi 500 chung |
| 422 | *(FastAPI)* | Thiếu field `file`; `course_id` không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Không có provider ngoài. Nếu Pillow lỗi → 500 và **không** cập nhật DB (file đích có thể không được tạo). Nếu 413/415 → DB không đổi và **file cũ vẫn còn nguyên** (khác #16, xem cảnh báo ở đó). Giới hạn dung lượng + định dạng chi tiết: chương `11-media-upload.md`.

**curl**

~~~bash
# multipart: KHÔNG tự đặt -H 'Content-Type', curl sinh boundary qua -F
curl -sS -X POST 'https://iqx.vn/api/v1/admin/lessons/courses/c41e7a95-6b0d-4f83-a2e6-9d17f5b3c208/thumbnail' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: b4e07a13-92cf-4d58-a760-1c38e5b9d024' \
  -F 'file=@bia-khoa-hoc-vcb-hpg.png;type=image/png'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra khác #16 và đó là chủ ý (hoặc bug lâu năm) cần giữ nguyên khi khớp hành vi:** ở đây MIME được kiểm **trước** khi tra khoá học → gửi ảnh sai định dạng cho `course_id` không tồn tại trả **415**, không phải 404. Ở #16 thì episode được nạp trước, nên trả **404** trước.
- Kiểm MIME dựa **hoàn toàn** vào `file.content_type` do client khai (`(file.content_type or "").split(";")[0].strip().lower()`) — **không** sniff magic bytes. Client đặt `type=image/png` cho file `.exe` vẫn qua bước MIME, rồi bị Pillow chặn bằng 500. Bản mới nên sniff (`file-type`) và trả 415 thay vì 500.
- Kiểm dung lượng xảy ra **sau** `await file.read()` đọc **toàn bộ** vào RAM → 5 MB không sao nhưng client gửi 500 MB vẫn nuốt hết vào bộ nhớ trước khi trả 413. Bản NestJS **nên** dùng limit của Multer (`limits.fileSize`) để chặn ở tầng stream; hành vi HTTP (413 + message) phải giữ.
- Tên file **luôn** là `thumbnail.jpg`, bất kể input là PNG/WebP (Pillow ép JPEG, `quality=85`, `optimize=True`, `thumbnail((1280, 720), LANCZOS)`, RGBA/P → RGB).
- Vì URL không đổi giữa các lần upload, **CDN/browser sẽ cache ảnh cũ**. Bản mới nên thêm query cache-bust (`?v=<updated_at>`) hoặc tên file có hash — nhưng đổi shape `thumbnail_url` là thay đổi hợp đồng, phải xin phép.
- `save_thumbnail_jpeg` **không** dùng `write_atomic` (khác #16) → ghi trực tiếp, upload thất bại giữa đường có thể để lại `thumbnail.jpg` hỏng.
- Audit `after` chỉ có `{"thumbnail_url": "..."}`, không có `before`.

---

## Nhóm C — Quản trị: tập học (`/api/v1/admin/lessons`)

### POST /api/v1/admin/lessons/courses/{course_id}/episodes

> **Tạo tập học** — thêm một tập vào khoá; `sort_order` tự tăng nếu không truyền; tập `pdf`/`video` khởi tạo ở trạng thái **chưa xuất bản**.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | INSERT `episodes` + **UPDATE `courses.total_episodes` / `total_duration_seconds`** (`refresh_course_denorms`) + INSERT `admin_audit_logs` action `lesson.episode.create` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `course_id` | string (uuid) | UUID hợp lệ | Khoá học chứa tập |

**Query params** — —

**Request body**

~~~ts
interface EpisodeCreate {
  title: string;                       // 1..200, BẮT BUỘC
  description?: string | null;
  content_type: EpisodeContentType;    // 'pdf' | 'video' | 'text', BẮT BUỘC
  /** BẮT BUỘC khi content_type === 'text'; PHẢI bỏ trống khi 'pdf'/'video'. Tối đa 200KB (đo bằng BYTE UTF-8) */
  markdown_body?: string | null;
  /** Bỏ trống → server đặt = max(sort_order trong khoá) + 1 (khoá rỗng → 1) */
  sort_order?: number | null;
}
~~~

~~~json
{
  "title": "Tập 4 — Đọc thuyết minh BCTC của VCB",
  "description": "Bài đọc, không có video.",
  "content_type": "text",
  "markdown_body": "# Thuyết minh BCTC VCB\n\nQuý II/2026, thu nhập lãi thuần của VCB đạt 14.820 tỷ VND...\n"
}
~~~

**Response 201**

~~~ts
type Response = EpisodeAdminBrief;
~~~

~~~json
{
  "id": "e6c02b74-3a19-4f85-b2d0-71ce4a83d95f",
  "title": "Tập 4 — Đọc thuyết minh BCTC của VCB",
  "description": "Bài đọc, không có video.",
  "content_type": "text",
  "file_url": null,
  "duration_seconds": null,
  "file_size_bytes": null,
  "sort_order": 4,
  "is_published": true,
  "created_at": "2026-08-17T06:02:14.771208Z",
  "updated_at": "2026-08-17T06:02:14.771208Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `course_id` không tồn tại | `"Không tìm thấy Khoá học"` |
| 422 | *(FastAPI)* | `content_type = 'text'` mà thiếu `markdown_body` | msg: `"Nội dung text yêu cầu markdown_body"` |
| 422 | *(FastAPI)* | `content_type = 'pdf'`/`'video'` mà **có** `markdown_body` | msg: `"Chỉ nội dung text mới có markdown_body"` |
| 422 | *(FastAPI)* | `markdown_body` > 200 KB (UTF-8 bytes) | msg: `"Nội dung markdown quá lớn (tối đa 200KB)"` |
| 422 | *(FastAPI)* | Thiếu `title`/`content_type`; `content_type` ngoài enum; `title` rỗng hoặc > 200 | `detail[]` chuẩn FastAPI |
| 500 | — | Truyền `sort_order` đã có trong khoá → vi phạm `uq_episodes_course_sort` | Lỗi 500 chung (IntegrityError) |

**Fallback / suy giảm** — Không có provider ngoài. Nếu `refresh_course_denorms` hoặc audit lỗi → **cả** INSERT tập bị rollback.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/admin/lessons/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/episodes' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: cf1a5e83-207b-4d69-91c4-6a30e8b52f17' \
  -d '{
    "title": "Tập 4 — Đọc thuyết minh BCTC của VCB",
    "description": "Bài đọc, không có video.",
    "content_type": "text",
    "markdown_body": "# Thuyết minh BCTC VCB\n\nQuý II/2026, thu nhập lãi thuần của VCB đạt 14.820 tỷ VND...\n"
  }'
~~~

**Ghi chú khi viết lại**

- **`is_published` KHÔNG nhận từ body** (không có trong `EpisodeCreate`). Server tự đặt: `is_published = (content_type === 'text')`. Nghĩa là tập `text` **xuất bản ngay**, tập `pdf`/`video` **ẩn** cho tới khi upload file rồi `PATCH {is_published: true}`.
- Giới hạn markdown đo bằng **byte UTF-8** (`len(v.encode())`), không phải số ký tự — tiếng Việt có dấu tốn 2-3 byte/ký tự. TS: `Buffer.byteLength(v, 'utf8') > 200 * 1024`.
- Bất biến ở DB (`ck_episodes_payload_shape`): `text` ⇒ `markdown_body IS NOT NULL AND file_url IS NULL`; `pdf`/`video` ⇒ `markdown_body IS NULL`. Phải giữ CHECK constraint này trong migration TS — nó là hàng rào cuối cùng.
- `sort_order` tự tăng dùng `MAX(sort_order) + 1` với `MAX(NULL) → 0` (`scalar_one_or_none() or 0`) ⇒ tập đầu tiên là **1**, không phải 0. Test `test_episode_sort_order_auto_increments` chốt 1, 2.
- `MAX + 1` **không** khoá bảng → hai request tạo tập đồng thời có thể cùng ra một số và một bên 500 do unique `(course_id, sort_order)`. Xem xét `advisory lock` theo `course_id` hoặc retry ở bản mới.
- Khi admin **tự truyền** `sort_order`, service **không** kiểm trùng → 500 thô. Bản mới nên trả 409 với message tiếng Việt rõ ràng (thay đổi lỗi, cần thống nhất với FE).
- `sort_order` trong `EpisodeCreate` **không** có `ge=1` (khác `ReorderItem`) → tạo được tập với `sort_order = 0` hoặc âm.

---

### POST /api/v1/admin/lessons/courses/{course_id}/reorder

> **Sắp xếp lại tập học** — cập nhật `sort_order` cho một danh sách tập trong cùng khoá theo kiểu nguyên khối (một transaction).

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE nhiều hàng `episodes.sort_order` + INSERT `admin_audit_logs` action `lesson.episode.reorder` (`target_entity = "course"`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `course_id` | string (uuid) | UUID hợp lệ | Khoá học cần sắp xếp |

**Query params** — —

**Request body**

~~~ts
interface ReorderItem {
  episode_id: string;   // uuid
  sort_order: number;   // integer, >= 1 (BẮT BUỘC — khác EpisodeCreate)
}

interface ReorderRequest {
  /** KHÔNG có ràng buộc min length → mảng rỗng cũng hợp lệ (no-op) */
  items: ReorderItem[];
}
~~~

~~~json
{
  "items": [
    { "episode_id": "b58d3e07-1c94-4a62-9d80-4f7ea21c6b39", "sort_order": 1 },
    { "episode_id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7", "sort_order": 2 },
    { "episode_id": "2d9b4f61-8c3a-4d57-bf10-6e42a90c7d35", "sort_order": 3 }
  ]
}
~~~

**Response 200**

~~~ts
/** OpenAPI khai báo object tự do (additionalProperties: true) */
interface ReorderResponse {
  message: string;   // luôn là "Đã cập nhật thứ tự tập học"
}
~~~

~~~json
{ "message": "Đã cập nhật thứ tự tập học" }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `course_id` không tồn tại | `"Không tìm thấy Khoá học"` |
| 422 | *(FastAPI)* | `sort_order < 1`; `episode_id` không phải UUID; thiếu `items` | `detail[]` chuẩn FastAPI |
| 500 | — | `sort_order` mới đụng một tập **không** nằm trong `items` → vi phạm `uq_episodes_course_sort` | Lỗi 500 chung |

**Fallback / suy giảm** — `items: []` → 200, không đổi gì, **vẫn ghi audit** với `after: {"reorder": []}`. `episode_id` không tồn tại hoặc thuộc khoá khác → **không lỗi**, xem cảnh báo dưới. Không có provider ngoài.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/admin/lessons/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/reorder' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 41d8b0e7-53fa-4c26-9187-b0e6a35d24c9' \
  -d '{
    "items": [
      { "episode_id": "b58d3e07-1c94-4a62-9d80-4f7ea21c6b39", "sort_order": 1 },
      { "episode_id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7", "sort_order": 2 },
      { "episode_id": "2d9b4f61-8c3a-4d57-bf10-6e42a90c7d35", "sort_order": 3 }
    ]
  }'
~~~

**Ghi chú khi viết lại**

- **Thuật toán "âm rồi dương" phải sao chép nguyên xi**, nếu không sẽ vi phạm unique `(course_id, sort_order)` giữa đường:
  1. `UPDATE episodes SET sort_order = -sort_order WHERE course_id = $1 AND id IN (<ids>)` → flush.
  2. Lặp từng item: `UPDATE episodes SET sort_order = $new WHERE id = $episode_id` → flush.
  Bước 1 đẩy tạm các giá trị sang miền âm để miền dương trống chỗ. Nếu bản TS làm gọn thành một `CASE WHEN` duy nhất thì phải chắc DB đánh giá unique ở **cuối câu lệnh** — Postgres kiểm **theo từng hàng**, nên `CASE` một phát **vẫn có thể** vi phạm; an toàn nhất là giữ hai bước, hoặc đặt constraint `DEFERRABLE INITIALLY DEFERRED` (đổi schema, cần thống nhất).
- **Bug đã có trong bản Python, đọc kỹ trước khi quyết định:** bước 1 lọc theo `course_id`, nhưng bước 2 `UPDATE ... WHERE Episode.id == item.episode_id` **không** lọc `course_id`. Hệ quả: admin gửi `episode_id` của **khoá khác** thì tập của khoá khác **bị đổi `sort_order`** (và có thể làm hỏng thứ tự khoá đó / gây 500 do trùng). Không có validation nào chặn. Bản NestJS **nên** thêm `AND course_id = :courseId` vào bước 2 và trả 400/404 cho id lạ — đây là **sửa bug**, ghi rõ trong changelog.
- Không yêu cầu `items` phải phủ **hết** tập trong khoá và không yêu cầu `sort_order` liên tục hoặc phân biệt. Gửi hai item cùng `sort_order = 1` ⇒ 500. Gửi `sort_order = 5` khi đã có tập khác giữ 5 và tập đó **không** trong `items` ⇒ 500. FE nên luôn gửi **toàn bộ** danh sách tập với thứ tự 1..N.
- Response là object tự do trong OpenAPI (`Record<string, unknown>`); trên thực tế luôn đúng một field `message`. Client không nên parse gì ngoài status code.
- **Không** gọi `refresh_course_denorms` (đúng — đổi thứ tự không đổi số lượng/thời lượng).

---

### PATCH /api/v1/admin/lessons/episodes/{episode_id}

> **Sửa tập học** — cập nhật một phần metadata tập; chặn xuất bản tập `pdf`/`video` khi chưa có file.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `episodes` + INSERT `admin_audit_logs` action `lesson.episode.update` (`before` + `after`). **KHÔNG** gọi `refresh_course_denorms` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `episode_id` | string (uuid) | UUID hợp lệ | ID tập học |

**Query params** — —

**Request body**

~~~ts
/** exclude_unset: chỉ field CÓ MẶT được ghi */
interface EpisodeUpdate {
  title?: string | null;           // 1..200
  description?: string | null;
  /** Tối đa 200KB byte UTF-8. KHÔNG kiểm chéo content_type ở tầng schema */
  markdown_body?: string | null;
  sort_order?: number | null;      // KHÔNG có ge=1 ở đây
  is_published?: boolean | null;
  // KHÔNG sửa được: content_type, file_url, duration_seconds, file_size_bytes, course_id
}
~~~

~~~json
{
  "title": "Tập 3 — Bảng cân đối kế toán VNM (bản cập nhật quý II/2026)",
  "is_published": true
}
~~~

**Response 200**

~~~ts
type Response = EpisodeAdminBrief;
~~~

~~~json
{
  "id": "b58d3e07-1c94-4a62-9d80-4f7ea21c6b39",
  "title": "Tập 3 — Bảng cân đối kế toán VNM (bản cập nhật quý II/2026)",
  "description": null,
  "content_type": "pdf",
  "file_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/ep-b58d3e07-1c94-4a62-9d80-4f7ea21c6b39.pdf",
  "duration_seconds": null,
  "file_size_bytes": 4718592,
  "sort_order": 3,
  "is_published": true,
  "created_at": "2026-08-17T02:50:02.663111Z",
  "updated_at": "2026-08-17T06:31:47.220583Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `episode_id` không tồn tại | `"Không tìm thấy Tập học"` |
| 400 | `BAD_REQUEST` | `is_published = true` cho tập `pdf`/`video` mà `file_url` đang null | `"Phải upload file trước khi xuất bản tập học dạng PDF/Video"` |
| 422 | *(FastAPI)* | `markdown_body` > 200 KB; `title` rỗng / > 200 | msg: `"Nội dung markdown quá lớn (tối đa 200KB)"` / `detail[]` chuẩn |
| 500 | — | `sort_order` mới trùng tập khác trong cùng khoá → `uq_episodes_course_sort` | Lỗi 500 chung |
| 500 | — | Ghi `markdown_body` cho tập `pdf`/`video` → vi phạm `ck_episodes_payload_shape` | Lỗi 500 chung |

**Fallback / suy giảm** — Body `{}` → 200, không đổi field, vẫn ghi audit. Không có provider ngoài.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/admin/lessons/episodes/b58d3e07-1c94-4a62-9d80-4f7ea21c6b39' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9b2e46f1-07d3-4a85-bc90-e51d3a87f602' \
  -d '{"title": "Tập 3 — Bảng cân đối kế toán VNM (bản cập nhật quý II/2026)", "is_published": true}'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra:** nạp episode (404 nếu thiếu) → **guard xuất bản** → ghi field. Guard đọc `updates.get("is_published") is True` (đúng `true`, không phải truthy) **và** `episode.content_type ∈ ('pdf','video')` **và** `not episode.file_url` — dùng `file_url` **hiện có trong DB**, vì `PATCH` không sửa được `file_url`.
- Guard **chỉ chặn một chiều**: hạ `is_published: false` luôn được, kể cả tập đã có file.
- `markdown_body` validate **dung lượng** nhưng **không** validate chéo `content_type` (khác `EpisodeCreate`). Gửi `markdown_body` cho tập `video` sẽ đi tới DB rồi bị `ck_episodes_payload_shape` chặn ⇒ **500**, không phải 422. Bản NestJS nên tự kiểm trước và trả 400/422 với message tiếng Việt; ghi rõ là **sửa lỗi**, vì mã lỗi thay đổi.
- **Không** gọi `refresh_course_denorms` — nếu bản mới cho sửa `duration_seconds` bằng PATCH thì bắt buộc phải gọi, không thì denorm lệch vĩnh viễn.
- Endpoint nạp episode **hai lần** (handler lấy `before`, service lấy để ghi) — an toàn khi gộp thành một.
- `sort_order` sửa bằng PATCH **không** dùng thuật toán âm-rồi-dương ⇒ dễ 500. Muốn đổi thứ tự thì dùng #13.

---

### DELETE /api/v1/admin/lessons/episodes/{episode_id}

> **Xoá tập học vĩnh viễn** — hard-delete hàng `episodes`, cascade xoá tiến độ người học, và xoá file media trên đĩa theo kiểu best-effort.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + filesystem local |
| **Side-effect** | Xoá file `<LESSON_MEDIA_DIR>/...` (nếu có `file_url`) → DELETE `episodes` → **CASCADE** DELETE `episode_progress` → UPDATE denorms khoá → INSERT `admin_audit_logs` action `lesson.episode.delete` (`before`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `episode_id` | string (uuid) | UUID hợp lệ | ID tập học |

**Query params** — —

**Request body** — —

**Response 200** — **Không áp dụng: endpoint trả 204 No Content, thân rỗng.**

~~~ts
/** HTTP 204, KHÔNG có body. Đừng parse JSON */
type Response = void;
~~~

~~~json
// 204 No Content — không có thân phản hồi
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `episode_id` không tồn tại (kiểm **hai lần**: handler rồi service) | `"Không tìm thấy Tập học"` |
| 422 | *(FastAPI)* | `episode_id` không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — Xoá file là **best-effort**: `MediaStorage.delete` dùng `unlink(missing_ok=True)` và bắt `OSError` trả `False` — file đã mất, quyền sai, hay đĩa read-only đều **không** làm request thất bại. `from_url()` trả `None` nếu `file_url` không bắt đầu bằng `/media/` hoặc bị path-traversal → khi đó **không xoá gì** và vẫn 204. Tập `text` không có file → bỏ qua bước xoá file. **Không idempotent**: gọi lần hai trả 404.

**curl**

~~~bash
curl -sS -X DELETE 'https://iqx.vn/api/v1/admin/lessons/episodes/b58d3e07-1c94-4a62-9d80-4f7ea21c6b39' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e2a30f57-4b18-4c69-8d20-71fb95c3ea04'
~~~

**Ghi chú khi viết lại**

- **Xoá file TRƯỚC khi xoá hàng DB.** Nếu DELETE DB hoặc audit rollback sau đó, file đã mất mà hàng vẫn còn ⇒ `file_url` treo (trỏ tới file không tồn tại, client tải về 404 từ `/media`). Bản mới an toàn hơn nếu commit DB trước rồi dọn file ở tác vụ nền — đây là **thay đổi thứ tự**, phải nêu.
- `episode_progress` bị **CASCADE xoá** (`ON DELETE CASCADE` trên `episode_id`) — **tiến độ người học mất vĩnh viễn**, không cảnh báo, không đếm trước. Test `test_cascade_delete_episode_removes_progress` chốt hành vi. UI admin nên xác nhận hai bước.
- `refresh_course_denorms` chạy sau khi xoá → `total_episodes` giảm 1, `total_duration_seconds` trừ đi thời lượng tập đó.
- Chống path-traversal ở `from_url` là bắt buộc port sang TS: chỉ nhận prefix `/media/`, `path.resolve` rồi kiểm nằm trong `base` (`p.relative_to(base)`), sai → `null`. Test `test_from_url_rejects_path_traversal` và `test_from_url_rejects_traversal_in_segment` chốt điều này.
- Trả **204**, không body. Đừng "cải tiến" thành 200 + `{message}`.
- Không có endpoint xoá vĩnh viễn cho **khoá học** (#10 chỉ soft-delete) — bất đối xứng cố hữu giữa hai cấp.

---

### POST /api/v1/admin/lessons/episodes/{episode_id}/file

> **Upload file cho tập học** — nhận PDF hoặc video multipart, ghi nguyên bản vào đĩa theo kiểu atomic, đo thời lượng nếu là video.

| | |
|---|---|
| **Quyền** | Bearer + Admin |
| **Rate limit** | mặc định 60/minute per-IP |
| **Cache** | không |
| **Nguồn dữ liệu** | Multipart upload → đĩa local + `ffprobe` (chỉ với video) + UPDATE DB |
| **Side-effect** | Xoá file cũ → ghi `<LESSON_MEDIA_DIR>/courses/<course_id>/ep-<episode_id>.<pdf\|mp4\|webm>` → UPDATE `episodes.{file_url, file_size_bytes, duration_seconds}` → UPDATE denorms khoá → INSERT `admin_audit_logs` action `lesson.episode.upload` |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `episode_id` | string (uuid) | UUID hợp lệ | Tập học nhận file. `content_type` của tập quyết định định dạng chấp nhận |

**Query params** — —

**Request body**

`multipart/form-data`, **đúng một** field:

~~~ts
/** OpenAPI: Body_admin_upload_episode_file_..._post */
interface EpisodeFileUploadForm {
  /** Tên field BẮT BUỘC là "file".
   *  Tập 'pdf'   → MIME phải là application/pdf, tối đa LESSON_MAX_PDF_MB (default 50 MB)
   *  Tập 'video' → MIME ∈ {video/mp4, video/webm}, tối đa LESSON_MAX_VIDEO_MB (default 500 MB)
   *  Tập 'text'  → 400, không nhận file */
  file: File;   // binary
}
~~~

~~~json
// Không phải JSON. Tương đương form:
// file=@tap-02-boc-tach-doanh-thu-fpt.mp4  (Content-Type: video/mp4)
{ "_form": "file=@tap-02-boc-tach-doanh-thu-fpt.mp4; type=video/mp4" }
~~~

**Response 200**

~~~ts
type Response = EpisodeAdminBrief;
~~~

~~~json
{
  "id": "7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7",
  "title": "Tập 2 — Bóc tách doanh thu FPT theo khối",
  "description": null,
  "content_type": "video",
  "file_url": "/media/courses/8f3c1d20-4a6b-4e19-9f77-2b5d0c8a4e11/ep-7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7.mp4",
  "duration_seconds": 1284,
  "file_size_bytes": 187433216,
  "sort_order": 2,
  "is_published": false,
  "created_at": "2026-07-03T02:11:47.882300Z",
  "updated_at": "2026-08-17T06:58:03.114772Z"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Không token | `"Yêu cầu xác thực"` |
| 403 | `FORBIDDEN` | Không phải admin | `"Yêu cầu quyền quản trị viên"` |
| 404 | `NOT_FOUND` | `episode_id` không tồn tại — **kiểm TRƯỚC MIME** | `"Không tìm thấy Tập học"` |
| 400 | `BAD_REQUEST` | Tập có `content_type = 'text'` | `"Tập học dạng text không cần upload file"` |
| **415** | *(không có `code`)* | Tập `pdf` nhưng MIME ≠ `application/pdf` | `"Chỉ chấp nhận file PDF"` |
| **415** | *(không có `code`)* | Tập `video` nhưng MIME ∉ {`video/mp4`, `video/webm`} | `"Chỉ chấp nhận video MP4 hoặc WebM"` |
| **413** | *(không có `code`)* | Vượt giới hạn: PDF > 50 MB / video > 500 MB (theo env) | `"File quá lớn (tối đa 50 MB)"` / `"File quá lớn (tối đa 500 MB)"` |
| 422 | *(FastAPI)* | Thiếu field `file`; `episode_id` không phải UUID | `detail[]` chuẩn FastAPI |

**Fallback / suy giảm** — **`ffprobe` thất bại (không cài / timeout 15s / JSON lỗi) → vẫn 200**, `duration_seconds: null`, log `warning`. Không retry, không job nền bù. `total_duration_seconds` của khoá khi đó **không** cộng thêm gì cho tập này. Với PDF, `duration_seconds` **luôn** `null` (không probe). Nếu 413 xảy ra giữa lúc đọc stream → không có file mới được ghi, **nhưng file cũ đã bị xoá** (xem cạm bẫy đầu tiên bên dưới).

**curl**

~~~bash
# multipart: KHÔNG tự đặt -H 'Content-Type', curl sinh boundary qua -F
curl -sS -X POST 'https://iqx.vn/api/v1/admin/lessons/episodes/7a1f5c83-2e60-4b9d-8c14-f30b6d92a5e7/file' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 5f80c136-a24b-4e97-b013-8ce4d97a2650' \
  -F 'file=@tap-02-boc-tach-doanh-thu-fpt.mp4;type=video/mp4'

# Ví dụ PDF cho tập content_type = "pdf"
curl -sS -X POST 'https://iqx.vn/api/v1/admin/lessons/episodes/b58d3e07-1c94-4a62-9d80-4f7ea21c6b39/file' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Request-ID: 7c94b053-1e6a-4f28-90d1-2b57ae83c614' \
  -F 'file=@bang-can-doi-ke-toan-vnm.pdf;type=application/pdf'
~~~

**Ghi chú khi viết lại**

- **Cạm bẫy nghiêm trọng nhất — mất dữ liệu:** file cũ được **xoá trước khi** đọc/ghi file mới (`if episode.file_url: storage.delete(from_url(...))` nằm **trên** vòng đọc chunk). Nếu request sau đó thất bại vì 413 hoặc mạng đứt, DB rollback nên `file_url` vẫn trỏ tới file **đã bị xoá** ⇒ tập hỏng, user tải 404 từ `/media`. Bản NestJS **nên** ghi file mới với tên tạm, commit DB, rồi mới xoá file cũ. Đây là **sửa bug**, ghi vào changelog.
- **Thứ tự kiểm tra (khác #11):** nạp episode (404) → phân nhánh theo `content_type` (400 nếu `text`) → kiểm MIME (415) → xoá file cũ → đọc theo chunk 1 MB, đếm dồn, vượt hạn thì 413 → `write_atomic` → probe → UPDATE DB → denorms → audit.
- Kiểm dung lượng **theo stream**, không đọc hết vào RAM (khác #11): chunk `1024 * 1024` byte, cộng dồn, `> max_bytes` → 413. TS: `Multer` với `limits.fileSize` hoặc `busboy` stream + đếm. Message 413 phải dùng **MB đã chia** (`max_bytes // (1024*1024)`).
- Định dạng chấp nhận do **`content_type` của tập trong DB** quyết định, không do client chọn. Muốn đổi tập `pdf` sang `video` thì hiện **không có** cách nào (`EpisodeUpdate` không chứa `content_type`) — phải xoá tập rồi tạo lại.
- Phần mở rộng file: PDF → `pdf`; video → `mp4` nếu MIME **chứa** `"mp4"`, ngược lại `webm`. Đặt tên `ep-<episode_id>.<ext>` trong `courses/<course_id>/`. Upload lại **cùng** định dạng ⇒ ghi đè cùng đường dẫn ⇒ **URL không đổi ⇒ CDN/browser cache file cũ**. Upload đổi định dạng (mp4 → webm) ⇒ file cũ đã bị xoá ở bước trên, URL mới.
- MIME cũng **chỉ tin client** (`file.content_type`), không sniff magic bytes — file `.exe` khai `video/mp4` sẽ được lưu và phục vụ công khai từ `/media`. Đây là **rủi ro an ninh thật**; bản mới nên sniff.
- `write_atomic`: ghi vào `<target>.tmp` rồi `os.replace()` (rename nguyên tử cùng filesystem), lỗi thì `unlink` file tạm. TS: `fs.createWriteStream(tmp)` + `fs.promises.rename(tmp, target)`, và **phải** dọn `.tmp` trong `catch`. `file_size_bytes` lấy từ **tổng byte thực đã ghi** do `write_atomic` trả về, không lấy từ header `Content-Length`.
- Upload **không** tự đặt `is_published = true` — tập vẫn ẩn cho tới khi admin gọi #14. Response ví dụ ở trên cố ý giữ `is_published: false`.
- Giới hạn dung lượng/định dạng và cấu hình `LESSON_MEDIA_DIR`, `LESSON_MAX_PDF_MB`, `LESSON_MAX_VIDEO_MB`, `LESSON_MAX_THUMBNAIL_MB`: xem chương `05-cau-hinh-env.md` và `11-media-upload.md`.

---

## Ghi chú tổng hợp khi viết lại

1. **Đếm lại cho chắc: 16 endpoint** — 5 public/user (`/api/v1/lessons/**`) + 11 admin (`/api/v1/admin/lessons/**`). Tag OpenAPI tương ứng: `Bài học` và `Quản trị: Bài học`.

2. **Đừng tin `security` trong OpenAPI cho `/lessons/courses/{slug}`.** Nó ghi `HTTPBearer` chỉ vì scheme có trong cây dependency với `auto_error=False`. Hành vi đúng: **ẩn danh 200**, token xấu cũng 200 (mất `progress_summary`). NestJS: guard "optional JWT" phải `return true` khi thiếu/khi verify lỗi, không throw.

3. **Gating premium chỉ có ở đúng một endpoint** (`GET /lessons/episodes/{id}/content`), đơn vị là **khoá học**, kết quả là **403 cứng** với `"Yêu cầu gói Premium đang hoạt động"`. Admin bypass bằng `role === 'admin'` đọc từ DB. Không có preview/truncate. Không được đặt `PremiumGuard` ở cấp controller vì khoá miễn phí phải qua được.

4. **Bảo mật nội dung là điểm yếu đã biết, không phải bug cần sửa im lặng.** `file_url` là link `/media` tĩnh, công khai, vĩnh viễn, không signed; mount `StaticFiles` không có guard nào; soft-delete khoá không dọn file. Nếu chọn signed URL / stream-qua-guard ở bản TS thì đó là quyết định sản phẩm — ghi rõ và thống nhất với FE trước khi làm.

5. **Ba thứ tự kiểm tra không đối xứng, dễ port sai:**
   - #3: episode tồn tại **&&** course published **&&** episode published (gộp một `or`, cùng message) → rồi mới premium.
   - #11 (thumbnail): **MIME trước, khoá học sau** ⇒ 415 thắng 404.
   - #16 (file tập): **episode trước, MIME sau** ⇒ 404 thắng 415.

6. **Hai lớp mã lỗi khác nhau.** `AppException` → body `{detail, code}`. `HTTPException` thô của 413/415 upload → body **chỉ có `{detail}`**, không có `code`. Client cũ có thể đang phân biệt bằng sự vắng mặt của `code`; giữ nguyên.

7. **Tiến độ là một chiều và không có ngưỡng.** `completed_at` set một lần, không bao giờ xoá; `completed: false` là no-op; `last_position_seconds` (đơn vị **giây**) không bị so với `duration_seconds`. Không có logic auto-complete theo phần trăm ở bất kỳ đâu trong backend.

8. **Denorm `total_episodes` / `total_duration_seconds` đếm cả tập ẩn** và chỉ được tính lại ở 3 chỗ (tạo tập, xoá tập, upload file). Đây là lý do `progress_summary.total` có thể lớn hơn `episodes.length` mà endpoint #2 trả về. Đừng "chuẩn hoá" cho khớp — sẽ lệch số so với client hiện tại.

9. **Bất biến DB phải mang sang migration TS nguyên vẹn:**
   - `courses.slug` UNIQUE (+ index), `VARCHAR(120)`.
   - `UNIQUE (episodes.course_id, episodes.sort_order)` — nền tảng của thuật toán reorder âm-rồi-dương.
   - `CHECK ck_episodes_payload_shape`: `text` ⇒ `markdown_body NOT NULL AND file_url NULL`; `pdf`/`video` ⇒ `markdown_body NULL`.
   - `episode_progress` PK `(user_id, episode_id)`; `episode_id`/`course_id`/`user_id` đều `ON DELETE CASCADE`; `courses.created_by_user_id` `ON DELETE SET NULL`.
   - Index: `ix_courses_catalog(is_published, is_premium, category)`, `ix_courses_created_at`, `ix_episodes_course_sort(course_id, sort_order)`, `ix_ep_progress_user_course(user_id, course_id, completed_at)`.

10. **`level` và `content_type` lưu dạng `VARCHAR`, không phải enum Postgres.** Không tạo `CREATE TYPE`. Đồng thời query param `level` **không** validate enum ⇒ giá trị lạ trả list rỗng, không 422.

11. **Đơn vị & định dạng:** thời lượng = **giây** (integer, truncate từ float, có thể `null`); dung lượng = **byte** (`BIGINT`); `percent` = phần trăm 0..100 làm tròn **1 chữ số thập phân**; mọi timestamp là `TIMESTAMPTZ` sinh ở **UTC** (`datetime.now(UTC)` / `func.now()`), serialize ISO-8601 — ví dụ trong chương này dùng hậu tố `Z` theo mặc định của pydantic-core; nếu bản TS xuất `+00:00` thì phải kiểm lại với FE trước khi đổi.

12. **Sắp xếp mặc định:** `courses` → `ORDER BY created_at DESC` (không tie-breaker); `episodes` trong response chi tiết → `sort_order ASC` (do `relationship(order_by=...)`, phải tự thêm `ORDER BY` nếu query rời); `GET /lessons/me/progress` → **KHÔNG có ORDER BY**, thứ tự không xác định.

13. **Audit: 9/11 endpoint admin ghi log**, hai endpoint GET không ghi. `record()` chạy **trong cùng transaction** với mutation và **không nuốt lỗi** — audit fail ⇒ toàn bộ request fail. Snapshot là tập field cố định (6 field cho course, 5 cho episode), không phải toàn bộ row. `target_entity` của reorder là `"course"`, không phải `"episode"`.

14. **Ba bug đã xác định trong bản Python** (quyết định giữ hay sửa phải ghi vào changelog): (a) reorder bước 2 không lọc `course_id` ⇒ đổi được thứ tự tập của khoá khác; (b) #16 xoá file cũ trước khi ghi file mới ⇒ 413/lỗi mạng làm mất file mà `file_url` vẫn trỏ tới; (c) `PATCH` episode cho phép gửi `markdown_body` cho tập `pdf`/`video` ⇒ **500** từ CHECK constraint thay vì 422.

15. **Ba khoảng trống nghiệp vụ** cần thống nhất trước khi code: không có endpoint đọc `markdown_body` của tập **chưa xuất bản** cho admin; không có endpoint lấy tiến độ **mọi** khoá học trong một lần gọi; không có endpoint hard-delete khoá học (và nếu thêm thì phải tự dọn thư mục `/media/courses/<id>/`).

16. **Rate limit + cache:** không endpoint nào của chương này có limit riêng hay Redis cache. Mặc định `60/minute` per-IP toàn cục (`SlowAPIMiddleware`, storage `memory://` — **không** chia sẻ giữa các worker/instance), tắt khi `APP_ENV ∈ {testing, test}`.

17. **`ffprobe` là dependency hệ thống, không phải package.** Docker image của bản TS phải cài `ffmpeg`/`ffprobe`, nếu không mọi video sẽ có `duration_seconds: null` một cách âm thầm (chỉ log warning) và `total_duration_seconds` của khoá luôn bằng 0.
