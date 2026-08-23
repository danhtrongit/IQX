# Media & upload file

Chương này đặc tả **toàn bộ** bề mặt xử lý file nhị phân của backend IQX: một static mount
công khai tại `/media`, hai endpoint upload multipart dành riêng cho admin (thumbnail khoá học
+ file tập học PDF/Video), lớp lưu trữ trên đĩa local, xử lý ảnh bằng Pillow và đo thời lượng
video bằng `ffprobe`. Đọc chương này khi port sang NestJS: nó mô tả chính xác tên form field,
thứ tự kiểm tra, message lỗi, quy tắc đặt tên file, những gì được ghi vào CSDL sau upload, và
**những chỗ hiện tại đang sai/nguy hiểm** mà bản viết lại nên sửa chứ không nên nhân bản.

---

## 1. Phạm vi chương & bản đồ file nguồn

### 1.1 Toàn bộ bề mặt media của hệ thống

Đã grep `UploadFile` trên toàn bộ `app/` — **chỉ có 2 endpoint upload** trong cả backend:

| # | Method + path | Mục đích |
|---|---|---|
| 1 | `POST /api/v1/admin/lessons/courses/{course_id}/thumbnail` | Upload/thay ảnh bìa khoá học |
| 2 | `POST /api/v1/admin/lessons/episodes/{episode_id}/file` | Upload PDF hoặc video cho tập học |

Và **1 static mount**: `GET|HEAD /media/*`.

> **Quan trọng cho bản TS:** KHÔNG có endpoint upload avatar người dùng, KHÔNG có upload
> ảnh cho bài viết/tin tức, KHÔNG có upload CSV/import. Nếu bản viết lại thấy cần thêm,
> đó là tính năng mới — không phải parity.

### 1.2 File nguồn

| File | Vai trò |
|---|---|
| `app/main.py` (dòng 143–145) | `mkdir` thư mục media + `app.mount("/media", StaticFiles(...), name="media")` |
| `app/core/config.py` (dòng 144–147) | 4 biến env `LESSON_*` |
| `app/api/v1/endpoints/admin_lessons.py` | 2 endpoint upload + audit log |
| `app/services/lesson/service.py` | `CourseService.save_thumbnail`, `EpisodeService.save_file`, `EpisodeService.delete`, hằng số MIME + `CHUNK_SIZE` |
| `app/services/lesson/storage.py` | `MediaStorage`: `course_dir`, `public_url`, `write_atomic`, `delete`, `from_url` |
| `app/services/lesson/image.py` | `save_thumbnail_jpeg` — resize bằng Pillow |
| `app/services/lesson/video_probe.py` | `probe_duration_seconds` — gọi `ffprobe` |
| `app/models/lesson.py` | Bảng `courses`, `episodes`, CHECK constraint `ck_episodes_payload_shape` |
| `app/schemas/lesson.py` | `CourseResponse`, `EpisodeAdminBrief`, `EpisodeCreate`, `EpisodeUpdate` |
| `app/repositories/lesson.py` | `EpisodeRepository.update`, `refresh_course_denorms` |
| `alembic/versions/3a7f2b1c4d9e_add_lessons_tables.py` | CHECK constraint gốc (bắt buộc `file_url IS NOT NULL`) |
| `alembic/versions/bce6d181d7bd_relax_episodes_check_for_pending_upload.py` | Nới CHECK constraint để cho phép "pending upload" |
| `tests/test_media_static.py` | Hành vi serve file đã chốt |
| `tests/test_lessons_storage.py` | Hành vi `MediaStorage` đã chốt (bao gồm chặn path traversal) |
| `tests/conftest.py` (dòng 9, 27) | Test dùng `LESSON_MEDIA_DIR` = thư mục tạm |

### 1.3 Thư viện Python đang dùng (từ `pyproject.toml`)

| Dependency | Dùng để làm gì | Tương đương TS |
|---|---|---|
| `python-multipart>=0.0.9` | Parse `multipart/form-data` | `multer` (Express) / `@fastify/multipart` |
| `pillow>=10.0,<12.0` | Resize + convert JPEG thumbnail | `sharp` |
| `fastapi[standard]` → `starlette.staticfiles` | Serve `/media` | `@nestjs/serve-static` (`ServeStaticModule`) |
| `ffprobe` (**binary hệ thống, KHÔNG phải package Python**) | Đo thời lượng video | `ffprobe` (giữ nguyên binary) hoặc `fluent-ffmpeg` |

> `ffprobe` không nằm trong `pyproject.toml`. Nó được gọi qua `shutil.which("ffprobe")` —
> nếu không có trên PATH thì bỏ qua im lặng và `duration_seconds` = `null`. Bản TS phải giữ
> đúng hành vi "best-effort" này.

---

## 2. Cấu hình env liên quan

Đọc từ `app/core/config.py` dòng 144–147 (khối `# ── Lessons / Media ──`):

| Biến env | Type | Default trong source | Bắt buộc | Ý nghĩa hành vi |
|---|---|---|---|---|
| `LESSON_MEDIA_DIR` | `string` | `"./media"` | Không | Thư mục vật lý gốc chứa mọi file media. Được `mkdir(parents=True, exist_ok=True)` khi `create_app()` chạy và một lần nữa trong constructor `MediaStorage`. |
| `LESSON_MAX_PDF_MB` | `number` | `50` | Không | Giới hạn dung lượng upload cho tập học `content_type = 'pdf'`. Byte thực tế = `LESSON_MAX_PDF_MB * 1024 * 1024`. |
| `LESSON_MAX_VIDEO_MB` | `number` | `500` | Không | Giới hạn cho tập học `content_type = 'video'`. |
| `LESSON_MAX_THUMBNAIL_MB` | `number` | `5` | Không | Giới hạn cho ảnh bìa khoá học. |

```ts
/** Khối config media — map 1:1 với 4 biến env ở trên. */
export interface MediaConfig {
  /** env LESSON_MEDIA_DIR — default './media' */
  lessonMediaDir: string;
  /** env LESSON_MAX_PDF_MB — default 50 */
  lessonMaxPdfMb: number;
  /** env LESSON_MAX_VIDEO_MB — default 500 */
  lessonMaxVideoMb: number;
  /** env LESSON_MAX_THUMBNAIL_MB — default 5 */
  lessonMaxThumbnailMb: number;
}
```

### 2.1 Bẫy: default là đường dẫn TƯƠNG ĐỐI

`LESSON_MEDIA_DIR` default `"./media"` được dùng ở **hai chỗ với cách xử lý khác nhau**:

- `app/main.py`: `Path(settings.LESSON_MEDIA_DIR)` — **không** `.resolve()`. Starlette
  `StaticFiles(directory=...)` sẽ dựng đường dẫn tuyệt đối theo CWD của process.
- `app/services/lesson/storage.py`: `Path(base_dir or s.LESSON_MEDIA_DIR).resolve()` — có
  `.resolve()`, cũng theo CWD.

⇒ Hai chỗ chỉ trỏ về **cùng một thư mục khi CWD của process ổn định**. Nếu process được
start từ một CWD khác (systemd `WorkingDirectory` sai, container `WORKDIR` khác), file được
ghi vào một thư mục và được serve từ thư mục khác → mọi URL trả 404.

> **Bắt buộc trong bản TS:** đặt `LESSON_MEDIA_DIR` là **đường dẫn tuyệt đối** trong env
> production, và resolve về absolute path **một lần duy nhất** trong config module rồi
> inject giá trị đã resolve vào cả `ServeStaticModule` và storage service. Không để hai
> nơi tự resolve độc lập.

Trong repo hiện tại có thư mục `backend/media/` rỗng, **không được git track** (git không
track thư mục rỗng) và **không có entry trong `.gitignore`**. Bản TS nên (a) thêm
`media/` vào `.gitignore`, (b) coi thư mục này là volume mount trong production.

### 2.2 Giá trị dùng khi test

`tests/conftest.py` set `LESSON_MEDIA_DIR` = `tempfile.mkdtemp(prefix="iqx_test_media_")`
**trước khi import app**, rồi gọi `get_settings.cache_clear()`. Bản TS cần cơ chế tương
đương (ví dụ `test-env.ts` set env trước khi khởi tạo `ConfigModule`), nếu không test sẽ ghi
rác vào `./media` của dev.

---

## 3. Mount static `/media`

### 3.1 Cách mount (từ `app/main.py`)

Trong `create_app()`, **ngay trước** `app.include_router(api_v1_router)`:

1. `media_dir = Path(settings.LESSON_MEDIA_DIR)`
2. `media_dir.mkdir(parents=True, exist_ok=True)` — **tự tạo thư mục khi startup**, tạo cả
   thư mục cha, không lỗi nếu đã tồn tại.
3. `app.mount("/media", StaticFiles(directory=media_dir), name="media")`

Đặc điểm cần giữ:

- Prefix public là **`/media`**, **KHÔNG có `/api/v1`**. Đây là điểm dễ sai nhất khi port:
  URL media nằm ngoài API prefix.
- `StaticFiles` được khởi tạo **không** truyền `html=True` → không có index.html, không có
  fallback `404.html`, không có directory listing.
- `name="media"` chỉ dùng cho `url_for`, không ảnh hưởng hành vi HTTP.
- Mount được thêm **trước** router API, nhưng vì không có path chồng nhau nên thứ tự không
  gây khác biệt quan sát được. Vẫn nên giữ nguyên thứ tự để an toàn.

### 3.2 Hành vi HTTP của static mount (đọc từ `starlette/staticfiles.py` + `starlette/responses.py` trong `.venv`)

| Tình huống | Kết quả |
|---|---|
| `GET /media/<path>` trỏ tới file thường tồn tại | `200` + nội dung file |
| `HEAD /media/<path>` | `200` + header, không body |
| Method khác `GET`/`HEAD` (POST, PUT, DELETE…) | `405` |
| File không tồn tại | `404` |
| Đường dẫn trỏ tới **thư mục** (vì `html=False`) | `404` — không listing, không index |
| Path traversal (`/media/../../etc/passwd`) | `404`. Starlette `get_path()` chạy `os.path.normpath` để bỏ `..`/`.`; `lookup_path()` còn kiểm tra `os.path.commonpath([full_path, directory]) == directory` (dùng `os.path.realpath`, tức là **symlink cũng bị chặn**) |
| Tên file quá dài (`ENAMETOOLONG`) | `404` |
| Null byte / ký tự không hợp lệ trong path | `404` |
| Lỗi quyền đọc filesystem (`PermissionError`) | `401` (đúng — Starlette dùng 401, không phải 403) |

Header trên response `200`:

| Header | Giá trị |
|---|---|
| `content-type` | Đoán từ đuôi file bằng `mimetypes` (`.jpg` → `image/jpeg`, `.pdf` → `application/pdf`, `.mp4` → `video/mp4`, `.webm` → `video/webm`) |
| `content-length` | Kích thước file |
| `last-modified` | Từ `stat.st_mtime`, format HTTP-date |
| `etag` | `"<md5(f"{st_mtime}-{st_size}")>"` — weak-ish, đổi khi file bị ghi đè |
| `accept-ranges` | `bytes` |

**Range request được hỗ trợ đầy đủ** — điều này quan trọng cho việc seek video:

- `Range: bytes=...` một khoảng → `206 Partial Content` + `content-range: bytes {start}-{end}/{size}`
- Nhiều khoảng → `206` + `content-type: multipart/byteranges; boundary=...`
- `If-Range` được so với `last-modified` **hoặc** `etag`; không khớp → trả full `200`
- Range header sai cú pháp → lỗi "Malformed range header."

**KHÔNG có header `Cache-Control`.** Starlette không set. Browser sẽ dùng heuristic caching
dựa trên `last-modified`. Đây là một điểm cần cải thiện (xem §15.4 và §17).

### 3.3 Middleware nào chạy trên `/media`

Middleware trong `create_app()` được add theo thứ tự: `CORSMiddleware` → `RequestIDMiddleware`
→ `SlowAPIMiddleware`. Trong Starlette, middleware add sau nằm **ngoài** cùng. Tất cả là
app-level middleware nên chúng **cũng chạy cho request tới `/media`** (mount không được miễn):

1. **CORS** — origin trong `CORS_ORIGINS` được cấp `Access-Control-Allow-Origin`. Nếu
   `CORS_ORIGINS` chứa `*` thì `allow_credentials` bị tự động tắt kèm cảnh báo log.
2. **RequestIDMiddleware** — mọi response `/media` cũng có header `X-Request-ID`.
3. **SlowAPIMiddleware** — ⚠️ **rate limit cũng áp cho file tĩnh.**

Chi tiết rate limit (đọc `slowapi/extension.py` trong `.venv`):

- `limiter = Limiter(key_func=get_remote_address, default_limits=[RATE_LIMIT_DEFAULT], storage_uri="memory://", enabled=APP_ENV not in ("testing","test"))`
- `RATE_LIMIT_DEFAULT` = `"60/minute"` (config.py dòng 83)
- `key_style` default = `"url"` ⇒ khoá bucket = `(IP của client, đúng path đang gọi)`
- Với mount static, `_find_route_handler` không tìm được `endpoint` (Mount không có attribute
  `endpoint`) nên `handler = None`, nhưng vì `key_style="url"` nên `_endpoint_key` = path
  (khác rỗng) ⇒ **default limit vẫn được đánh giá**.

⇒ **Hệ quả thực tế:** một IP gọi **cùng một** URL media quá **60 lần/phút** sẽ nhận `429`.
Trình phát video seek nhiều lần (mỗi seek là một Range request tới **cùng path**) hoàn toàn
có thể chạm ngưỡng này. Đây là hạn chế thật của kiến trúc hiện tại.

> **Khuyến nghị bản TS:** đừng để rate limiter (`ThrottlerGuard`) áp lên route static. Trong
> NestJS, `ServeStaticModule` nên được cấu hình **trước/ngoài** global throttler, hoặc thẳng
> hơn: đưa `/media` ra khỏi Node hoàn toàn (nginx/CDN — xem §17).

### 3.4 Kiểm soát truy cập: **KHÔNG CÓ**

`/media` là **hoàn toàn public**. Không guard, không token, không signed URL, không kiểm tra
`is_published`, không kiểm tra `is_premium`. Ai biết URL đều tải được file. Xem §15 để hiểu
đầy đủ rủi ro và cách sửa.

---

## 4. Quy tắc đặt tên file & sinh URL công khai

### 4.1 Cây thư mục vật lý

```
<LESSON_MEDIA_DIR>/
└── courses/
    └── <course_id>/                       ← UUID của khoá học, dạng string canonical
        ├── thumbnail.jpg                  ← LUÔN tên này, LUÔN .jpg
        ├── ep-<episode_id>.pdf            ← tập học content_type = 'pdf'
        ├── ep-<episode_id>.mp4            ← tập học video, MIME video/mp4
        └── ep-<episode_id>.webm           ← tập học video, MIME video/webm
```

Chỉ có **một** cấp thư mục con: `courses/<course_id>/`. Không phân mảnh theo ngày, không
phân shard theo prefix hash.

### 4.2 Quy tắc đặt tên — chính xác từ source

| Loại | Tên file | Sinh ở đâu |
|---|---|---|
| Thumbnail khoá học | `thumbnail.jpg` (hằng số, không phụ thuộc file gốc) | `CourseService.save_thumbnail`: `target = course_dir / "thumbnail.jpg"` |
| File tập học | `ep-{episode_id}.{ext}` với `ext` ∈ `pdf` \| `mp4` \| `webm` | `EpisodeService.save_file`: `target = course_dir / f"ep-{episode_id}.{ext}"` |

Cách chọn `ext` cho tập học:

- `content_type == 'pdf'` → `ext = "pdf"`
- `content_type == 'video'` → `ext = "mp4"` nếu chuỗi `"mp4"` xuất hiện trong MIME đã
  normalize, ngược lại `ext = "webm"`

**Tên file gốc do client gửi (`filename`) bị bỏ hoàn toàn.** Không sanitize, không lưu, không
dùng làm phần nào của tên đích. Đây là một điểm **tốt** — nó triệt tiêu cả lớp lỗ hổng
path-traversal-qua-filename và tên file độc. Bản TS phải giữ nguyên nguyên tắc này: **tên
đích do server sinh ra, không bao giờ lấy từ client.**

### 4.3 Sinh URL công khai

`MediaStorage.public_url(abs_path)`:

1. `rel = abs_path.relative_to(self.base)` — nếu `abs_path` **không** nằm trong base thì
   `relative_to` ném `ValueError` (không bắt) → 500. Trong luồng hiện tại không xảy ra vì
   target luôn được dựng từ `course_dir()`.
2. Trả `f"/media/{rel.as_posix()}"` — `as_posix()` đảm bảo dùng `/` cả trên Windows.

Kết quả cụ thể:

```
/media/courses/3f1c9d0e-...-a1b2/thumbnail.jpg
/media/courses/3f1c9d0e-...-a1b2/ep-8c2d....-9f01.mp4
```

Đặc điểm quan trọng:

- URL là **đường dẫn tương đối (path-only)**, **không** có scheme/host. Frontend phải tự
  ghép với origin của backend. `APP_PUBLIC_URL` **không** được dùng ở đây.
- URL này là **giá trị được lưu vào DB** (`courses.thumbnail_url`, `episodes.file_url`).
  Xem §11.
- Không có cache-buster (không hash nội dung, không query `?v=`). Thumbnail luôn là cùng URL
  ⇒ khi thay ảnh, client/CDN có thể còn giữ bản cũ. `ETag`/`Last-Modified` đổi nên
  revalidate sẽ đúng, nhưng CDN cache theo TTL thì không.

### 4.4 Giải mã URL ngược về đường dẫn vật lý

`MediaStorage.from_url(url)` — dùng khi cần xoá file cũ:

1. `url` falsy (`null`, `""`) hoặc **không** bắt đầu bằng `"/media/"` → trả `null`.
2. `rel = url[len("/media/"):]`
3. `p = (self.base / rel).resolve()`
4. Kiểm tra `p.relative_to(self.base)`; nếu ném `ValueError` → trả `null` (**chặn path
   traversal**).
5. Trả `p`.

Tests đã chốt (trong `tests/test_lessons_storage.py`):

- `from_url("/media/../../etc/passwd")` → `None`
- `from_url("/media/courses/../../../etc/shadow")` → `None`
- `from_url("/static/image.png")` → `None`
- `from_url(None)` → `None`, `from_url("")` → `None`
- Round-trip: `from_url(public_url(f)) == f`

```ts
/** Hợp đồng của MediaStorage — port trực tiếp sang TS. */
export interface MediaStoragePort {
  /** Thư mục gốc đã resolve về absolute. */
  readonly base: string;
  /** Trả (và mkdir -p) `<base>/courses/<courseId>`. */
  courseDir(courseId: string): Promise<string>;
  /** absPath -> '/media/<relative>'; ném lỗi nếu absPath ngoài base. */
  publicUrl(absPath: string): string;
  /** Ghi qua file `.tmp` rồi rename atomic; trả tổng số byte đã ghi. */
  writeAtomic(target: string, chunks: AsyncIterable<Buffer> | Iterable<Buffer>): Promise<number>;
  /** Xoá best-effort. true nếu đã xoá HOẶC file không tồn tại; false nếu lỗi OS. */
  delete(absPath: string): Promise<boolean>;
  /** '/media/...' -> absolute path; null nếu không phải URL media hoặc thoát khỏi base. */
  fromUrl(url: string | null): string | null;
}
```

---

## 5. Lớp `MediaStorage` — hợp đồng đầy đủ

### 5.1 Constructor

- Nhận `base_dir` optional (dùng trong test); nếu không có thì lấy `settings.LESSON_MEDIA_DIR`.
- `.resolve()` về absolute.
- `mkdir(parents=True, exist_ok=True)` — **constructor có side-effect tạo thư mục**.

### 5.2 `course_dir(course_id)`

- Trả `base / "courses" / str(course_id)`
- `mkdir(parents=True, exist_ok=True)` — idempotent (test `test_course_dir_idempotent`).
- ⚠️ **Side-effect:** gọi hàm này tạo thư mục **ngay cả khi upload sau đó thất bại** ⇒ có thể
  để lại thư mục rỗng. Không có cơ chế dọn thư mục rỗng.

### 5.3 `write_atomic(target, chunks) -> number`

1. `target.parent.mkdir(parents=True, exist_ok=True)`
2. `tmp = target.with_suffix(target.suffix + ".tmp")` — ví dụ `ep-<id>.mp4` → `ep-<id>.mp4.tmp`
3. Mở `tmp` ở mode `"wb"`, ghi lần lượt từng chunk, cộng dồn `total += len(chunk)`
4. `os.replace(tmp, target)` — rename atomic trên cùng filesystem, ghi đè file đích nếu có
5. Nếu có exception ở bất kỳ bước nào: `tmp.unlink(missing_ok=True)` (bỏ qua `OSError`) rồi
   **re-raise**
6. Trả `total`

Đã chốt bởi test: tạo file đúng nội dung, trả đúng tổng byte (`[b"abc", b"de", b"fghi"]` → 9),
**không để lại `.tmp`** khi thành công, tự tạo thư mục cha nhiều cấp.

> Lưu ý cho bản TS: `.tmp` nằm **trong cùng thư mục** với đích — đây là điều kiện cần để
> rename atomic (cùng filesystem). Nếu dùng `os.tmpdir()` rồi `rename` sang volume khác thì
> `rename` sẽ fail `EXDEV`. Dùng `fs.promises.rename` với tmp cùng thư mục.
>
> Cũng lưu ý: file `.tmp` nằm **trong** `LESSON_MEDIA_DIR` nên trong khoảng thời gian đang
> ghi, `/media/courses/<id>/ep-<id>.mp4.tmp` là **URL tải được công khai** (nội dung dở dang).
> Bản TS nên ghi tmp vào thư mục staging **ngoài** vùng static, cùng filesystem.

### 5.4 `delete(abs_path) -> boolean`

- Nhận `Path` hoặc `str`.
- `p.unlink(missing_ok=True)` → trả `true`.
- `OSError` → trả `false` (không ném).
- ⇒ **File không tồn tại vẫn trả `true`** (test `test_delete_missing_file_returns_true`). Đây
  là semantics "best-effort", đừng đổi thành `false` trong bản TS.

---

## 6. Endpoint upload thumbnail khoá học

### 6.1 Hợp đồng HTTP

| Thuộc tính | Giá trị |
|---|---|
| Method + path | `POST /api/v1/admin/lessons/courses/{course_id}/thumbnail` |
| Path param | `course_id` — `UUID`; không parse được → `422` |
| Auth | `AdminUser` (Bearer JWT, `role === 'admin'`, tài khoản active) |
| Content-Type | `multipart/form-data` |
| **Tên form field** | **`file`** — đúng một field, không có field kèm theo |
| Query param | Không có |
| Status thành công | **`200`** (không phải `201`) |
| Response model | `CourseResponse` (bản ghi khoá học **sau khi** cập nhật `thumbnail_url`) |
| Audit action | `lesson.course.thumbnail` |
| OpenAPI tag | `Quản trị: Bài học` |

### 6.2 Thứ tự kiểm tra — CHÍNH XÁC (đọc `CourseService.save_thumbnail`)

Đây là thứ tự thật, không phải thứ tự "hợp lý":

1. **Body multipart được parse trước tiên** (do FastAPI: `await request.form()` chạy **trước**
   `solve_dependencies`). Nghĩa là toàn bộ byte đã lên server **trước khi** kiểm tra quyền admin.
2. Auth: `get_current_user` → `get_current_active_user` → `get_current_admin`.
   - Không có Bearer → `401` `{"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}` + header `WWW-Authenticate: Bearer`
   - Tài khoản không active → `403` `{"detail":"Tài khoản chưa được kích hoạt","code":"FORBIDDEN"}`
   - `role != 'admin'` → `403` `{"detail":"Yêu cầu quyền quản trị viên","code":"FORBIDDEN"}`
3. `max_bytes = LESSON_MAX_THUMBNAIL_MB * 1024 * 1024`
4. **Validate MIME**: `content_type = (file.content_type or "").split(";")[0].strip().lower()`
   — tức là cắt bỏ phần `; charset=...`, trim, hạ chữ thường. Phải thuộc
   `{"image/jpeg", "image/png", "image/webp"}`; nếu không →
   `415` `{"detail":"Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp"}`
5. **Tìm khoá học**: không có → `404` `{"detail":"Không tìm thấy Khoá học","code":"NOT_FOUND"}`
6. `raw = await file.read()` — **đọc TOÀN BỘ file vào RAM** (comment trong source: "thumbnail
   is small, max 5MB" — nhưng giới hạn chưa được kiểm tra ở thời điểm này!)
7. **Kiểm tra dung lượng**: `len(raw) > max_bytes` →
   `413` `{"detail":"Ảnh quá lớn (tối đa 5 MB)"}` (số lấy từ env)
8. `course_dir = storage.course_dir(course_id)` → tạo thư mục
9. `target = course_dir / "thumbnail.jpg"`
10. `save_thumbnail_jpeg(raw, target)` — xem §8
11. `url = storage.public_url(target)`
12. `repo.update(course, {"thumbnail_url": url})` → `setattr` + `flush()` + `refresh()`
13. Ghi audit `lesson.course.thumbnail` với `after = {"thumbnail_url": <url mới>}`
14. Request transaction `commit()` trong `get_db`

**⚠️ Hai vấn đề rút ra từ thứ tự này (bản TS PHẢI sửa):**

- **Bước 4 xảy ra TRƯỚC bước 5** ⇒ upload MIME sai vào `course_id` không tồn tại trả `415`,
  không phải `404`. Endpoint tập học lại làm ngược lại (§7.2). Bất đối xứng có thật.
- **Bước 6 xảy ra TRƯỚC bước 7** ⇒ giới hạn 5 MB **không** chặn được việc nhận dữ liệu; nó chỉ
  từ chối **sau khi** đã đọc hết. Starlette `UploadFile` dùng `SpooledTemporaryFile` với
  `spool_max_size = 1MB`, nên >1 MB sẽ tràn ra file tạm trên đĩa, còn `file.read()` thì kéo
  toàn bộ vào một `bytes` trong RAM. Kết hợp với việc auth chạy sau khi body đã nhận (bước 1),
  đây là vector DoS về đĩa + RAM.

### 6.3 Điều kiện lỗi — bảng đầy đủ

| Tình huống | Status | Body |
|---|---|---|
| `course_id` không phải UUID | `422` | Lỗi validation FastAPI (danh sách `detail[]`) |
| Thiếu form field `file` | `422` | Lỗi validation FastAPI |
| Không có Bearer token | `401` | `{"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}` |
| Tài khoản không active | `403` | `{"detail":"Tài khoản chưa được kích hoạt","code":"FORBIDDEN"}` |
| Không phải admin | `403` | `{"detail":"Yêu cầu quyền quản trị viên","code":"FORBIDDEN"}` |
| MIME ngoài jpeg/png/webp | `415` | `{"detail":"Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp"}` — **KHÔNG có field `code`** |
| Khoá học không tồn tại | `404` | `{"detail":"Không tìm thấy Khoá học","code":"NOT_FOUND"}` |
| File > `LESSON_MAX_THUMBNAIL_MB` | `413` | `{"detail":"Ảnh quá lớn (tối đa 5 MB)"}` — **KHÔNG có field `code`** |
| MIME hợp lệ nhưng byte không phải ảnh thật | **`500`** | Pillow `Image.open` ném `UnidentifiedImageError`, **không ai bắt** ⇒ lỗi 500. Xem §8.3 |
| Quá 60 request/phút cùng path cùng IP | `429` | Body của slowapi |

> **Lưu ý về hình dạng body lỗi:** `415` và `413` được ném bằng `fastapi.HTTPException` thuần,
> **không** phải `AppException`. Handler trong `main.py` chỉ đăng ký cho `AppException` ⇒ hai
> mã này đi qua handler mặc định của FastAPI và body **chỉ có `detail`**, không có `code`.
> Đây là bất nhất thật của API hiện tại. Bản TS nên chuẩn hoá: cấp `code` cho mọi lỗi
> (đề xuất `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`) và ghi rõ trong chương 04.

---

## 7. Endpoint upload file tập học (PDF/Video)

### 7.1 Hợp đồng HTTP

| Thuộc tính | Giá trị |
|---|---|
| Method + path | `POST /api/v1/admin/lessons/episodes/{episode_id}/file` |
| Path param | `episode_id` — `UUID` |
| Auth | `AdminUser` |
| Content-Type | `multipart/form-data` |
| **Tên form field** | **`file`** — đúng một field, không có field kèm theo |
| Status thành công | **`200`** |
| Response model | `EpisodeAdminBrief` (bao gồm `file_url`, `file_size_bytes`, `duration_seconds` mới) |
| Audit action | `lesson.episode.upload` |

> Chú ý path: là `/admin/lessons/episodes/{episode_id}/file` — **không** lồng dưới
> `/courses/{course_id}/`. `course_id` được suy ra từ bản ghi tập học.

### 7.2 Thứ tự kiểm tra — CHÍNH XÁC (đọc `EpisodeService.save_file`)

1. Multipart body được parse (trước auth — như §6.2 bước 1).
2. Auth `AdminUser` (3 khả năng lỗi 401/403 như trên).
3. **Tìm tập học** kèm `course` (`get_by_id_with_course`, dùng `selectinload`):
   không có → `404` `{"detail":"Không tìm thấy Tập học","code":"NOT_FOUND"}`
4. `content_mime = (file.content_type or "").split(";")[0].strip().lower()`
5. **Rẽ nhánh theo `episode.content_type` (giá trị trong DB, KHÔNG theo MIME client gửi):**

   | `episode.content_type` | MIME cho phép | `max_bytes` | `ext` | Lỗi nếu MIME sai |
   |---|---|---|---|---|
   | `'pdf'` | `application/pdf` | `LESSON_MAX_PDF_MB * 1024 * 1024` | `pdf` | `415` `{"detail":"Chỉ chấp nhận file PDF"}` |
   | `'video'` | `video/mp4`, `video/webm` | `LESSON_MAX_VIDEO_MB * 1024 * 1024` | `mp4` nếu MIME chứa `"mp4"`, ngược lại `webm` | `415` `{"detail":"Chỉ chấp nhận video MP4 hoặc WebM"}` |
   | `'text'` (hoặc bất kỳ giá trị khác) | — | — | — | `400` `{"detail":"Tập học dạng text không cần upload file","code":"BAD_REQUEST"}` |

6. **XOÁ FILE CŨ NGAY LẬP TỨC** nếu `episode.file_url` khác `null`:
   `old_path = storage.from_url(episode.file_url)`; nếu `old_path` khác `null` thì
   `storage.delete(old_path)`.
7. `course_dir = storage.course_dir(episode.course_id)`
8. `target = course_dir / f"ep-{episode_id}.{ext}"`
9. **Đọc theo chunk 1 MB** (`CHUNK_SIZE = 1024 * 1024`) trong vòng lặp:
   - `chunk = await file.read(CHUNK_SIZE)`; chunk rỗng → thoát vòng lặp
   - `total_bytes += len(chunk)`
   - `total_bytes > max_bytes` → `413` `{"detail":"File quá lớn (tối đa {max_bytes // (1024*1024)} MB)"}`
     — ví dụ `"File quá lớn (tối đa 50 MB)"` cho PDF, `"... 500 MB)"` cho video
   - `chunks.append(chunk)` — ⚠️ **tích luỹ toàn bộ file vào một list trong RAM**
10. `actual_bytes = storage.write_atomic(target, iter(chunks))`
11. Nếu là video: `duration_seconds = await probe_duration_seconds(target)` bọc trong
    `try/except Exception` → nếu ném thì log `warning` `"ffprobe failed for episode %s, duration will be NULL"`
    và giữ `duration_seconds = None`. Nếu là PDF: `duration_seconds` giữ `None`.
12. `url = storage.public_url(target)`
13. `ep_repo.update(episode, {"file_url": url, "file_size_bytes": actual_bytes, "duration_seconds": duration_seconds})`
14. `ep_repo.refresh_course_denorms(course_id)` — recompute `courses.total_episodes` =
    `COUNT(episodes.id)` và `courses.total_duration_seconds` = `COALESCE(SUM(duration_seconds), 0)`
    cho khoá học đó, rồi `flush()`
15. Ghi audit `lesson.episode.upload` với
    `after = {"file_url", "file_size_bytes", "duration_seconds"}`
16. `commit()`

### 7.3 Ba lỗi hành vi thật ở endpoint này (bản TS phải sửa)

**(1) Xoá file cũ trước khi ghi file mới ⇒ mất dữ liệu khi upload thất bại.**
Bước 6 xoá file cũ khỏi đĩa. Nếu bước 9 ném `413` (file mới quá lớn), transaction DB rollback
⇒ `episodes.file_url` vẫn trỏ tới file **vừa bị xoá**. Kết quả: tập học "có file" theo DB
nhưng `/media/...` trả `404`. Cùng vấn đề nếu mất kết nối giữa lúc đọc.

> Sửa trong bản TS: ghi file mới ra tên tạm/tên mới **trước**, cập nhật DB thành công, **rồi**
> mới xoá file cũ. Nếu tên đích không đổi (cùng `episode_id` + cùng `ext`) thì `write_atomic`
> đã tự ghi đè an toàn ⇒ **không cần** xoá trước. Chỉ cần xoá khi `ext` thay đổi (mp4 → webm).

**(2) `ext` đổi ⇒ file mồ côi.**
Nếu upload lại video và MIME đổi từ `video/mp4` sang `video/webm`, tên đích đổi từ
`ep-<id>.mp4` sang `ep-<id>.webm`. Bước 6 có xoá `.mp4` cũ nên trường hợp này **được xử lý** —
nhưng chỉ nhờ tác dụng phụ của lỗi (1). Nếu sửa (1) mà quên xử lý đổi `ext`, sẽ sinh rác.

**(3) `duration_seconds` bị ghi đè thành `null` khi `ffprobe` không có.**
Bước 13 luôn set `duration_seconds`, kể cả `None`. Trên môi trường không cài `ffprobe`,
upload lại một video từng có duration hợp lệ sẽ **xoá** duration đó, và `refresh_course_denorms`
sẽ hạ `courses.total_duration_seconds` tương ứng.

> Sửa trong bản TS: chỉ ghi `durationSeconds` khi probe trả giá trị; hoặc ghi rõ đây là hành
> vi có ý (reset) — nhưng đừng để môi trường thiếu binary âm thầm phá dữ liệu.

### 7.4 Không kiểm tra magic byte

Cả hai endpoint chỉ tin `Content-Type` **do client khai báo trong part multipart**. Không đọc
magic byte, không dùng `libmagic`. Hệ quả:

- Một file thực thi đổi tên, gửi kèm `Content-Type: application/pdf`, sẽ được lưu thành
  `ep-<id>.pdf` và **serve công khai** với `content-type: application/pdf`.
- Với thumbnail thì Pillow gián tiếp làm nhiệm vụ validate (nó phải parse được ảnh), nhưng
  cách "validate" đó biểu hiện thành lỗi `500` chứ không phải `4xx`.

> Bản TS: thêm kiểm tra magic byte (`file-type`) cho PDF/video và trả `415` với message
> nhất quán. Với ảnh, dùng `sharp().metadata()` trong `try/catch` → `400`/`415`, không để 500.

---

## 8. Xử lý ảnh thumbnail bằng Pillow → `sharp`

### 8.1 Thông số chính xác (`app/services/lesson/image.py`)

Hàm `save_thumbnail_jpeg(src_bytes, target, max_w=1280, max_h=720) -> int`:

| Bước | Chi tiết |
|---|---|
| 1 | `target.parent.mkdir(parents=True, exist_ok=True)` |
| 2 | `img = Image.open(BytesIO(src_bytes))` — mở từ buffer trong RAM |
| 3 | `img.thumbnail((1280, 720), Image.Resampling.LANCZOS)` |
| 4 | Nếu `img.mode` ∈ `("RGBA", "P")` → `img = img.convert("RGB")` |
| 5 | `img.save(target, format="JPEG", quality=85, optimize=True)` |
| 6 | Trả `target.stat().st_size` (số byte của file JPEG đã ghi) |

Ngữ nghĩa quan trọng của `Image.thumbnail()`:

- **Chỉ thu nhỏ, KHÔNG bao giờ phóng to.** Ảnh 400×300 giữ nguyên 400×300.
- **Giữ đúng tỉ lệ (aspect ratio).** Không crop, không pad. `1280×720` là **hộp giới hạn**,
  không phải kích thước đích. Ảnh 3000×1000 → 1280×427 (không phải 1280×720).
- Resampling filter: **LANCZOS**.

Đầu ra **luôn** là:

- Format: **JPEG** (kể cả input là PNG/WebP)
- Chất lượng: **85**
- `optimize=True` (Pillow chạy thêm một lượt tối ưu bảng Huffman)
- Tên file: **`thumbnail.jpg`**
- Không strip EXIF một cách tường minh; Pillow re-encode nên phần lớn metadata không được
  chuyển sang, nhưng đừng khẳng định "đã strip hoàn toàn" — CHƯA XÁC ĐỊNH cho từng loại
  metadata cụ thể.
- Không có tuỳ chọn `progressive`.

### 8.2 `save_thumbnail_jpeg` KHÔNG atomic

Khác `write_atomic`, hàm này ghi **trực tiếp** vào `thumbnail.jpg`. Nếu Pillow lỗi giữa lúc
`save`, file đích còn lại **một JPEG hỏng dở dang** — và nó vẫn được `/media` serve. Bản TS
nên ghi ra `.tmp` rồi rename, giống nhánh episode.

### 8.3 Ảnh không parse được ⇒ `500`, không phải `4xx`

`Image.open` với byte không phải ảnh ném `PIL.UnidentifiedImageError`. Không có `try/except`
trong `save_thumbnail_jpeg`, cũng không có trong `CourseService.save_thumbnail`, cũng không
có exception handler nào cho nó trong `main.py` ⇒ **HTTP 500**. Transaction rollback nên DB
không đổi; nhưng `courses/<id>/` đã được tạo. Đây là hành vi hiện tại — bản TS nên đổi thành
`400`/`415` có message tiếng Việt rõ ràng và ghi rõ trong chương lỗi.

### 8.4 Bảng chuyển đổi Pillow → `sharp`

| Pillow | `sharp` tương đương |
|---|---|
| `Image.open(BytesIO(raw))` | `sharp(buffer, { failOn: 'error' })` |
| `img.thumbnail((1280, 720), LANCZOS)` | `.resize(1280, 720, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })` |
| `img.convert("RGB")` cho mode `RGBA`/`P` | `.flatten({ background: '#ffffff' })` (JPEG không có alpha; `flatten` quyết định màu nền — Pillow `convert("RGB")` dùng **đen** cho vùng trong suốt, nên nếu muốn parity tuyệt đối thì `background: '#000000'`) |
| `img.save(target, "JPEG", quality=85, optimize=True)` | `.jpeg({ quality: 85, optimize: true, mozjpeg: false })` rồi `.toFile(tmpTarget)` |
| `target.stat().st_size` | `(await fs.promises.stat(target)).size`, hoặc `info.size` từ `toFile()` |

> ⚠️ `fit: 'inside'` + `withoutEnlargement: true` là **bắt buộc** để khớp `Image.thumbnail()`.
> Nếu dùng mặc định `fit: 'cover'` của `sharp`, ảnh sẽ bị **crop** — khác hành vi hiện tại.
>
> ⚠️ Màu nền khi flatten: Pillow `convert("RGB")` từ `RGBA` cho ra **nền đen** ở vùng alpha.
> Nếu quyết định dùng nền trắng (đẹp hơn) thì phải ghi vào changelog vì đây là thay đổi
> quan sát được.

---

## 9. Đo thời lượng video bằng `ffprobe`

`app/services/lesson/video_probe.py` — `probe_duration_seconds(path) -> int | None`:

1. `shutil.which("ffprobe")` trả falsy → **trả `None` ngay**, không log, không lỗi.
2. Chạy subprocess:
   ```
   ffprobe -v error -show_entries format=duration -of json <path>
   ```
3. `asyncio.wait_for(proc.communicate(), timeout=15)` — **timeout 15 giây**.
4. `data = json.loads(out)`; trả `int(float(data["format"]["duration"]))` — **truncate về int
   (bỏ phần thập phân, không làm tròn)**. Video 90.7s → `90`.
5. `except Exception: return None` — bắt **tất cả** (timeout, JSON lỗi, thiếu key, exit code
   khác 0…). Không log trong hàm này; log `warning` nằm ở caller (`EpisodeService.save_file`).

Chỉ gọi cho `content_type == 'video'`. Không gọi cho PDF.

```ts
/**
 * Best-effort: trả số giây (int, truncate) hoặc null.
 * KHÔNG BAO GIỜ ném. Không có ffprobe trên PATH → null im lặng.
 */
export type ProbeDurationSeconds = (absPath: string) => Promise<number | null>;
```

Yêu cầu triển khai (Node):

- Dùng `child_process.execFile('ffprobe', [...])` (**không** `exec` với string — tránh shell
  injection qua đường dẫn), `timeout: 15_000`, `killSignal: 'SIGKILL'`.
- Kiểm tra sự tồn tại của binary trước (`which`/`lookpath`) và cache kết quả.
- `Math.trunc(parseFloat(...))` để khớp `int(float(...))`.
- Image runtime (Docker) phải cài `ffmpeg`/`ffprobe`, nếu không mọi video sẽ có
  `durationSeconds = null` và `courses.total_duration_seconds` = 0 → UI hiển thị sai.

---

## 10. Trạng thái "pending upload" & migration `bce6d181d7bd`

### 10.1 Bài toán: tạo metadata trước, upload file sau

Luồng thiết kế của admin là **2 bước**, không phải 1 request:

```
Bước 1  POST /api/v1/admin/lessons/courses/{course_id}/episodes
        body JSON: { title, description?, content_type: 'pdf'|'video', sort_order? }
        → tạo row episodes với file_url = NULL, is_published = false
        → trả EpisodeAdminBrief, lấy `id`

Bước 2  POST /api/v1/admin/lessons/episodes/{id}/file
        multipart, field `file`
        → ghi file, set file_url + file_size_bytes + duration_seconds

Bước 3  PATCH /api/v1/admin/lessons/episodes/{id}
        body JSON: { "is_published": true }
        → chỉ thành công nếu file_url đã khác NULL
```

Lý do phải chia 2 bước: `episode_id` là thành phần của **tên file** (`ep-<episode_id>.<ext>`)
và của thư mục đích, nên phải có row (có UUID) trước khi biết ghi file vào đâu.

### 10.2 Vì sao CHECK constraint phải nới

Migration **`3a7f2b1c4d9e_add_lessons_tables`** tạo constraint tên
`ck_episodes_content_type_payload` với biểu thức:

```sql
(content_type = 'text'  AND markdown_body IS NOT NULL AND file_url IS NULL)
OR
(content_type IN ('pdf','video') AND file_url IS NOT NULL AND markdown_body IS NULL)
```

Nhánh thứ hai bắt buộc `file_url IS NOT NULL` ⇒ **INSERT ở bước 1 luôn bị Postgres từ chối**.
Luồng 2 bước không thể chạy.

Migration **`bce6d181d7bd_relax_episodes_check_for_pending_upload`** (revision
`bce6d181d7bd`, `down_revision = "3a7f2b1c4d9e"`, create date `2026-05-23`) sửa việc này:

- `upgrade()`: `ALTER TABLE episodes DROP CONSTRAINT "ck_episodes_ck_episodes_content_type_payload"`
  rồi `ADD CONSTRAINT "ck_episodes_payload_shape" CHECK (...)` với biểu thức mới **bỏ điều
  kiện `file_url IS NOT NULL`**:

  ```sql
  (content_type = 'text'  AND markdown_body IS NOT NULL AND file_url IS NULL)
  OR
  (content_type IN ('pdf','video') AND markdown_body IS NULL)
  ```

- `downgrade()`: drop `ck_episodes_payload_shape`, add lại `ck_episodes_ck_episodes_content_type_payload`
  với biểu thức cũ.

> **Ghi chú về tên constraint bị lặp prefix:** tên cũ là
> `ck_episodes_ck_episodes_content_type_payload` — bị **prefix hai lần** vì naming convention
> của metadata tự thêm `ck_episodes_` vào một tên vốn đã bắt đầu bằng `ck_episodes_`. Vì vậy
> migration dùng **raw SQL với tên chính xác** thay vì `op.drop_constraint`, để tránh bị mangle
> thêm. Bản TS (Prisma/TypeORM/Drizzle) chỉ cần constraint cuối cùng tên
> **`ck_episodes_payload_shape`**; **không** cần tái tạo tên lặp prefix — nhưng nếu migrate
> từ DB production hiện có thì script migration đầu tiên phải drop **đúng tên cũ** đó.

### 10.3 Ngữ nghĩa của constraint hiện tại

Bảng chân lý (constraint mới, `ck_episodes_payload_shape`):

| `content_type` | `markdown_body` | `file_url` | Hợp lệ? |
|---|---|---|---|
| `'text'` | NOT NULL | NULL | ✅ |
| `'text'` | NOT NULL | NOT NULL | ❌ |
| `'text'` | NULL | bất kỳ | ❌ |
| `'pdf'` / `'video'` | NULL | **NULL** | ✅ ← **đây là trạng thái "pending upload"** |
| `'pdf'` / `'video'` | NULL | NOT NULL | ✅ (đã upload) |
| `'pdf'` / `'video'` | NOT NULL | bất kỳ | ❌ |
| Giá trị khác (`'audio'`…) | bất kỳ | bất kỳ | ❌ (cả hai nhánh đều false) |

⇒ Constraint **gián tiếp** giới hạn `content_type` chỉ còn 3 giá trị hợp lệ, dù cột là
`VARCHAR(20)` chứ không phải enum Postgres.

### 10.4 Việc kiểm tra chuyển sang tầng service

Docstring của migration nói rõ: *"Publish-time validation is enforced at the service layer
instead."* Cụ thể:

**Khi tạo (`EpisodeService.create`):**

- Nếu `sort_order` không được gửi → `sort_order = max_sort_order(course_id) + 1`
  (`max_sort_order` trả `0` khi khoá học chưa có tập nào ⇒ tập đầu tiên có `sort_order = 1`)
- `is_published = (data.content_type.value == "text")` ⇒ **`text` được publish ngay;
  `pdf`/`video` LUÔN tạo ra ở trạng thái `is_published = false`**
- Sau khi tạo: `refresh_course_denorms(course_id)`
- Validation ở tầng schema (`EpisodeCreate`, Pydantic `model_validator(mode="after")`):
  - `content_type == 'text'` mà thiếu `markdown_body` → `"Nội dung text yêu cầu markdown_body"`
  - `content_type != 'text'` mà **có** `markdown_body` → `"Chỉ nội dung text mới có markdown_body"`
  - `len(markdown_body.encode()) > 200 * 1024` → `"Nội dung markdown quá lớn (tối đa 200KB)"`
  - (Tất cả đều thành `422` qua cơ chế validation của FastAPI)

**Khi cập nhật (`EpisodeService.update`):**

- Guard chống publish rỗng: nếu `updates.get("is_published") is True` **và**
  `episode.content_type in ("pdf","video")` **và** `not episode.file_url` →
  `400` `{"detail":"Phải upload file trước khi xuất bản tập học dạng PDF/Video","code":"BAD_REQUEST"}`
- ⚠️ Guard đọc `episode.file_url` **từ DB**, không từ payload. Payload `EpisodeUpdate` **không
  có** field `file_url` (chỉ `title`, `description`, `markdown_body`, `sort_order`,
  `is_published`) ⇒ admin **không thể** set `file_url` bằng tay qua API. Tốt — giữ nguyên.

**Tập học "pending upload" bị ẩn khỏi public thế nào:**

- `GET /api/v1/lessons/courses/{slug}` chỉ trả các tập có `ep.is_published` là true.
- `GET /api/v1/lessons/episodes/{id}/content` trả `404` nếu `not episode.course.is_published`
  hoặc `not episode.is_published`.

```ts
export type EpisodeContentType = 'pdf' | 'video' | 'text';
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';

/** Trạng thái suy ra (KHÔNG có cột nào trong DB) — dùng cho UI admin. */
export type EpisodeUploadState =
  | 'pending_upload'   // content_type pdf|video && fileUrl === null
  | 'uploaded_draft'   // fileUrl !== null && !isPublished
  | 'published'        // isPublished === true
  | 'text';            // content_type === 'text'

export function deriveEpisodeUploadState(ep: {
  contentType: EpisodeContentType;
  fileUrl: string | null;
  isPublished: boolean;
}): EpisodeUploadState {
  if (ep.contentType === 'text') return 'text';
  if (ep.fileUrl === null) return 'pending_upload';
  return ep.isPublished ? 'published' : 'uploaded_draft';
}
```

---

## 11. Những gì được ghi vào CSDL sau upload

### 11.1 Bảng `courses` — cột liên quan media

| Cột | Type Postgres | Nullable | Ghi bởi | Giá trị |
|---|---|---|---|---|
| `thumbnail_url` | `VARCHAR(500)` | ✅ | `save_thumbnail` | **Đường dẫn TƯƠNG ĐỐI** dạng `/media/courses/<course_id>/thumbnail.jpg`. **KHÔNG** phải absolute filesystem path, **KHÔNG** phải URL đầy đủ có host. |
| `total_episodes` | `INTEGER NOT NULL` default `0` | ❌ | `refresh_course_denorms` | `COUNT(episodes.id)` của khoá học |
| `total_duration_seconds` | `INTEGER NOT NULL` default `0` | ❌ | `refresh_course_denorms` | `COALESCE(SUM(episodes.duration_seconds), 0)` |

`refresh_course_denorms` được gọi sau: `EpisodeService.create`, `EpisodeService.delete`,
`EpisodeService.save_file`. **KHÔNG** được gọi sau `EpisodeService.update` và **KHÔNG** sau
`save_thumbnail` (thumbnail không ảnh hưởng denorm).

### 11.2 Bảng `episodes` — cột liên quan media

| Cột | Type Postgres | Nullable | Sau upload nhận giá trị gì |
|---|---|---|---|
| `file_url` | `VARCHAR(500)` | ✅ | `/media/courses/<course_id>/ep-<episode_id>.<ext>` — **tương đối**, `ext` ∈ `pdf`\|`mp4`\|`webm` |
| `file_size_bytes` | `BIGINT` | ✅ | `actual_bytes` — giá trị trả về từ `write_atomic`, tức là **số byte thật đã ghi xuống đĩa**, không phải `Content-Length` client khai |
| `duration_seconds` | `INTEGER` | ✅ | Video: kết quả `ffprobe` (int, truncate) hoặc `null`. PDF: **luôn** `null` |
| `content_type` | `VARCHAR(20) NOT NULL` | ❌ | **KHÔNG bị upload thay đổi.** Quyết định loại file được nhận, chứ không bị file quyết định |
| `markdown_body` | `TEXT` | ✅ | Không liên quan; phải `NULL` cho pdf/video (CHECK constraint) |
| `is_published` | `BOOLEAN NOT NULL` default `true` (server_default) | ❌ | **KHÔNG được upload tự bật.** Vẫn `false` sau khi upload; phải `PATCH` riêng |

> **Không có cột lưu MIME type.** MIME của file được **suy ra từ đuôi trong `file_url`** khi
> Starlette serve. Nếu bản TS muốn thêm cột `mime_type` thì đó là mở rộng — phải ghi vào
> changelog và migration riêng, không phải parity.
>
> **Không có cột lưu tên file gốc**, không có checksum/hash, không có `uploaded_by`,
> không có `uploaded_at` (chỉ có `updated_at` chung của row, tự cập nhật qua `onupdate=func.now()`).

### 11.3 Bảng `admin_audit_logs` — dấu vết upload

`AdminAuditService.record` chèn một row (`flush()` + `refresh()`, **không commit** — transaction
của request sở hữu). Các action liên quan media:

| Action | Endpoint | `target_entity` | `target_id` | `payload_before` | `payload_after` |
|---|---|---|---|---|---|
| `lesson.course.thumbnail` | Upload thumbnail | `"course"` | `str(course_id)` | `null` | `{"thumbnail_url": "<url mới>"}` |
| `lesson.episode.upload` | Upload file tập học | `"episode"` | `str(episode_id)` | `null` | `{"file_url", "file_size_bytes", "duration_seconds"}` |
| `lesson.episode.delete` | Xoá tập học | `"episode"` | `str(episode_id)` | `{title, content_type, sort_order, is_published, file_url}` | `null` |
| `lesson.episode.create` | Tạo tập học | `"episode"` | `str(episode.id)` | `null` | snapshot như trên (với `file_url = null`) |
| `lesson.episode.update` | PATCH tập học | `"episode"` | `str(episode_id)` | snapshot trước | snapshot sau |
| `lesson.course.delete` | Soft-delete khoá học | `"course"` | `str(course_id)` | snapshot course | snapshot course |

Mỗi row audit còn ghi `admin_user_id`, `ip` (`request.client.host` hoặc `null`),
`user_agent` (header `user-agent`), `request_id` (ưu tiên `request.state.request_id` do
`RequestIDMiddleware` set, rồi header `x-request-id`, cuối cùng `uuid4()` mới).

Hệ quả quan trọng: **audit nằm cùng transaction với thao tác DB** ⇒ upload thất bại (rollback)
⇒ **không có row audit**. Nhưng **file trên đĩa thì đã bị ghi/xoá rồi** (filesystem không
tham gia transaction). Đây là bất đối xứng cần biết khi điều tra sự cố.

```ts
/** Đúng hình dạng payload_after của hai action upload. */
export interface AuditPayloadThumbnailUpload {
  thumbnail_url: string | null;
}
export interface AuditPayloadEpisodeUpload {
  file_url: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
}
/** Snapshot episode dùng cho create/update/delete. */
export interface AuditEpisodeSnapshot {
  title: string;
  content_type: EpisodeContentType;
  sort_order: number;
  is_published: boolean;
  file_url: string | null;
}
```

### 11.4 Response type sau upload

```ts
export interface CourseResponse {
  id: string;                        // UUID
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;      // '/media/courses/<id>/thumbnail.jpg'
  level: string;                     // giá trị của CourseLevel, cột là VARCHAR(20)
  category: string;
  is_premium: boolean;
  is_published: boolean;
  total_episodes: number;
  total_duration_seconds: number;
  created_by_user_id: string | null; // UUID
  created_at: string;                // ISO-8601
  updated_at: string;                // ISO-8601
}

export interface EpisodeAdminBrief {
  id: string;                        // UUID
  title: string;
  description: string | null;
  content_type: string;              // 'pdf' | 'video' | 'text' (cột VARCHAR(20))
  file_url: string | null;           // '/media/courses/<courseId>/ep-<id>.<ext>'
  duration_seconds: number | null;
  file_size_bytes: number | null;    // BIGINT — dùng number cẩn thận, hoặc string
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}
```

> `file_size_bytes` là `BIGINT`. Với video ≤ 500 MB thì `number` của JS an toàn tuyệt đối
> (`< 2^53`). Nếu bản TS nâng `LESSON_MAX_VIDEO_MB` lên rất lớn thì vẫn an toàn — chỉ cần biết
> driver Postgres của Node (`pg`) mặc định trả `BIGINT` dạng **string**; phải cấu hình parser
> hoặc cast rõ ràng để response giữ nguyên kiểu `number` như hiện tại.

---

## 12. Vòng đời file trên đĩa: xoá, ghi đè, rác

### 12.1 Bảng đầy đủ: hành động nào xoá file vật lý

| Hành động | Endpoint | Xoá file vật lý? | Chi tiết |
|---|---|---|---|
| Upload lại file tập học | `POST .../episodes/{id}/file` | ✅ **Có** | Xoá file cũ **trước khi** đọc file mới (§7.3 lỗi (1)) |
| Xoá tập học | `DELETE /api/v1/admin/lessons/episodes/{id}` | ✅ **Có** | `from_url(file_url)` → `delete(path)`, best-effort; rồi **hard delete** row + `refresh_course_denorms` |
| Upload lại thumbnail | `POST .../courses/{id}/thumbnail` | ➖ **Ghi đè** | Cùng tên `thumbnail.jpg` nên bị ghi đè (không phải xoá) |
| Soft-delete khoá học | `DELETE /api/v1/admin/lessons/courses/{id}` | ❌ **KHÔNG** | Chỉ set `is_published = false`. **Toàn bộ thumbnail + file tập học vẫn nằm trên đĩa và vẫn tải được công khai qua `/media`** |
| PATCH khoá học / tập học | `PATCH ...` | ❌ Không | Không chạm filesystem |
| Xoá khoá học ở mức DB (cascade) | *(không có endpoint)* | ❌ **KHÔNG** | `courses.id` → `episodes.course_id` có `ON DELETE CASCADE`, nên xoá row course sẽ xoá row episodes **nhưng không xoá file nào**. Cả thư mục `courses/<id>/` thành rác vĩnh viễn |
| Reorder tập học | `POST .../courses/{id}/reorder` | ❌ Không | Chỉ đổi `sort_order` |

### 12.2 Các nguồn sinh rác (orphan file) đã xác định

1. **Soft-delete khoá học** → file còn nguyên, URL còn tải được.
2. **Không có endpoint hard-delete khoá học** ⇒ nếu ai đó xoá row bằng SQL trực tiếp, toàn bộ
   thư mục thành rác.
3. **`course_dir()` tạo thư mục ngay cả khi upload sau đó fail** ⇒ thư mục rỗng.
4. **File `.tmp` còn lại** khi process bị kill (SIGKILL/OOM) giữa lúc `write_atomic` — nhánh
   `except` không chạy được. `.tmp` này **nằm trong vùng static** nên vẫn tải được.
5. **Không có job dọn rác.** Grep không thấy bất kỳ scheduled job nào quét `LESSON_MEDIA_DIR`.

> **Khuyến nghị bản TS:** viết một job (BullMQ/`@nestjs/schedule`) đối chiếu file trên
> storage với `episodes.file_url` + `courses.thumbnail_url`, xoá file không có row tham chiếu
> **và** cũ hơn N giờ (để không đụng file đang upload). Đồng thời xoá `.tmp` cũ. Chạy dry-run
> log trước khi cho xoá thật.

### 12.3 Thứ tự thao tác của `EpisodeService.delete`

1. `get_by_id_with_course(episode_id)` → không có → `404` `"Không tìm thấy Tập học"`
2. `course_id = episode.course_id` (lưu lại **trước** khi xoá row)
3. Nếu `episode.file_url`: `path = from_url(...)`; nếu `path` khác `null` → `delete(path)`
   (best-effort, lỗi bị nuốt)
4. `ep_repo.delete(episode)` → `session.delete()` + `flush()`
5. `refresh_course_denorms(course_id)`
6. Ghi audit `lesson.episode.delete` với `before` = snapshot
7. Endpoint trả **`204 No Content`** (không body)

⚠️ **File bị xoá TRƯỚC khi row bị xoá.** Nếu bước 4/5/6 fail → transaction rollback → row vẫn
tồn tại nhưng file đã mất. Bản TS nên đảo thứ tự: commit DB xong mới xoá file (hoặc đưa việc
xoá file vào một outbox/queue).

⚠️ `episode_progress` có FK tới `episodes.id` với `ON DELETE CASCADE` ⇒ hard-delete tập học
**xoá luôn tiến độ học của mọi user** cho tập đó. Đây là hành vi hiện tại, ghi rõ để bản TS
không "vô tình" đổi.

---

## 13. curl mẫu đầy đủ

Giả định `BASE=http://localhost:8000` và `TOKEN` là access token JWT của một user có
`role = 'admin'`, tài khoản active.

```bash
export BASE=http://localhost:8000
export TOKEN='eyJhbGciOi...'    # access token của admin
```

### 13.1 Upload thumbnail khoá học

```bash
COURSE_ID=3f1c9d0e-1111-2222-3333-a1b2c3d4e5f6

curl -i -X POST \
  "$BASE/api/v1/admin/lessons/courses/$COURSE_ID/thumbnail" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/duong/dan/anh-bia.png;type=image/png"
```

- Tên form field **bắt buộc là `file`**.
- `;type=image/png` set `Content-Type` của part. **Không có nó**, curl đoán từ đuôi file; với
  đuôi lạ curl gửi `application/octet-stream` → backend trả `415`. Nên set tường minh.
- MIME hợp lệ: `image/jpeg`, `image/png`, `image/webp`.
- Response `200` là JSON `CourseResponse`, trong đó `thumbnail_url` là URL mới:

```json
{
  "id": "3f1c9d0e-1111-2222-3333-a1b2c3d4e5f6",
  "slug": "phan-tich-co-ban",
  "title": "Phân tích cơ bản",
  "thumbnail_url": "/media/courses/3f1c9d0e-1111-2222-3333-a1b2c3d4e5f6/thumbnail.jpg",
  "level": "beginner",
  "category": "co-ban",
  "is_premium": false,
  "is_published": false,
  "total_episodes": 0,
  "total_duration_seconds": 0,
  "created_by_user_id": "…",
  "created_at": "2026-08-17T10:00:00+00:00",
  "updated_at": "2026-08-17T10:05:00+00:00",
  "description": null
}
```

Kiểm tra ảnh đã serve được (không cần token):

```bash
curl -i "$BASE/media/courses/$COURSE_ID/thumbnail.jpg" -o /dev/null
# 200, content-type: image/jpeg, etag, last-modified, accept-ranges: bytes
```

### 13.2 Luồng 3 bước hoàn chỉnh cho tập học PDF

```bash
# ── Bước 1: tạo metadata tập học (JSON, KHÔNG multipart) ──
curl -s -X POST "$BASE/api/v1/admin/lessons/courses/$COURSE_ID/episodes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Bài 1 — Đọc báo cáo tài chính",
        "description": "Slide dạng PDF",
        "content_type": "pdf"
      }'
# → 201, EpisodeAdminBrief với file_url: null, is_published: false, sort_order: 1
# Lấy "id" từ response:
EPISODE_ID=8c2d7e10-4444-5555-6666-9f0112233445

# ── Bước 2: upload file PDF (multipart, field `file`) ──
curl -i -X POST \
  "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID/file" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/duong/dan/bai-1.pdf;type=application/pdf"
# → 200, EpisodeAdminBrief:
#    file_url: "/media/courses/<COURSE_ID>/ep-<EPISODE_ID>.pdf"
#    file_size_bytes: 1843200
#    duration_seconds: null      ← PDF luôn null
#    is_published: false         ← upload KHÔNG tự publish

# ── Bước 3: xuất bản ──
curl -i -X PATCH "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_published": true}'
# → 200. Nếu bước 2 chưa chạy: 400
#    {"detail":"Phải upload file trước khi xuất bản tập học dạng PDF/Video","code":"BAD_REQUEST"}
```

### 13.3 Upload video MP4

```bash
curl -i -X POST \
  "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID/file" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/duong/dan/bai-2.mp4;type=video/mp4" \
  --progress-bar
# → 200, file_url ".../ep-<id>.mp4", file_size_bytes = byte thật,
#   duration_seconds = số giây (int) nếu có ffprobe, ngược lại null
```

### 13.4 Upload video WebM

```bash
curl -i -X POST \
  "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID/file" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/duong/dan/bai-2.webm;type=video/webm"
# → file_url ".../ep-<id>.webm"  (ext = webm vì MIME không chứa "mp4")
```

### 13.5 Các trường hợp lỗi — tái hiện bằng curl

```bash
# MIME sai cho thumbnail → 415, body CHỈ có "detail" (không có "code")
curl -s -X POST "$BASE/api/v1/admin/lessons/courses/$COURSE_ID/thumbnail" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@notes.txt;type=text/plain"
# {"detail":"Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp"}

# Ảnh quá lớn → 413
# {"detail":"Ảnh quá lớn (tối đa 5 MB)"}

# MIME sai cho tập học PDF → 415
curl -s -X POST "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID/file" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@clip.mp4;type=video/mp4"
# {"detail":"Chỉ chấp nhận file PDF"}     ← vì episode.content_type = 'pdf'

# Upload cho tập học dạng text → 400 (có "code")
# {"detail":"Tập học dạng text không cần upload file","code":"BAD_REQUEST"}

# Thiếu field `file` → 422 (validation FastAPI)
curl -s -X POST "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID/file" \
  -H "Authorization: Bearer $TOKEN" -F "upload=@bai-1.pdf;type=application/pdf"

# Sai tên field (dùng `upload` thay vì `file`) → cũng 422

# Không có token → 401
curl -s -X POST "$BASE/api/v1/admin/lessons/courses/$COURSE_ID/thumbnail" \
  -F "file=@anh.png;type=image/png"
# {"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}

# Token của user thường → 403
# {"detail":"Yêu cầu quyền quản trị viên","code":"FORBIDDEN"}

# Method sai trên static mount → 405
curl -i -X POST "$BASE/media/courses/$COURSE_ID/thumbnail.jpg"

# Path traversal trên static mount → 404
curl -i "$BASE/media/../../etc/passwd"

# Range request (seek video) → 206
curl -i -H "Range: bytes=0-1023" \
  "$BASE/media/courses/$COURSE_ID/ep-$EPISODE_ID.mp4" -o /dev/null
```

### 13.6 Xoá tập học (kèm xoá file vật lý)

```bash
curl -i -X DELETE "$BASE/api/v1/admin/lessons/episodes/$EPISODE_ID" \
  -H "Authorization: Bearer $TOKEN"
# → 204 No Content, không body.
# File trên đĩa bị xoá best-effort; episode_progress của mọi user bị CASCADE xoá.
```

---

## 14. Bảng tổng hợp mã lỗi của toàn chương

| Status | `code` trong body | Message (nguyên văn tiếng Việt) | Ném từ |
|---|---|---|---|
| `400` | `BAD_REQUEST` | `Tập học dạng text không cần upload file` | `EpisodeService.save_file` |
| `400` | `BAD_REQUEST` | `Phải upload file trước khi xuất bản tập học dạng PDF/Video` | `EpisodeService.update` |
| `401` | `UNAUTHORIZED` | `Yêu cầu xác thực` (+ header `WWW-Authenticate: Bearer`) | `get_current_user` |
| `401` | — | *(Starlette)* | `/media` khi `PermissionError` trên filesystem |
| `403` | `FORBIDDEN` | `Tài khoản chưa được kích hoạt` | `get_current_active_user` |
| `403` | `FORBIDDEN` | `Yêu cầu quyền quản trị viên` | `get_current_admin` |
| `404` | `NOT_FOUND` | `Không tìm thấy Khoá học` | `CourseService.save_thumbnail` |
| `404` | `NOT_FOUND` | `Không tìm thấy Tập học` | `EpisodeService.save_file`, `.delete` |
| `404` | — | *(Starlette)* | `/media`: file không tồn tại, là thư mục, path traversal, tên quá dài, null byte |
| `405` | — | *(Starlette)* | `/media` với method khác `GET`/`HEAD` |
| `413` | **KHÔNG có** | `Ảnh quá lớn (tối đa {LESSON_MAX_THUMBNAIL_MB} MB)` | `CourseService.save_thumbnail` |
| `413` | **KHÔNG có** | `File quá lớn (tối đa {max_bytes // (1024*1024)} MB)` | `EpisodeService.save_file` |
| `415` | **KHÔNG có** | `Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp` | `CourseService.save_thumbnail` |
| `415` | **KHÔNG có** | `Chỉ chấp nhận file PDF` | `EpisodeService.save_file` |
| `415` | **KHÔNG có** | `Chỉ chấp nhận video MP4 hoặc WebM` | `EpisodeService.save_file` |
| `422` | — | Body validation của FastAPI (`detail` là array) | UUID sai, thiếu field `file` |
| `429` | — | Body của slowapi | Vượt `RATE_LIMIT_DEFAULT` = `60/minute` theo `(IP, path)` |
| `500` | — | Lỗi chưa xử lý | Pillow không parse được ảnh (`UnidentifiedImageError`) |

```ts
/** Body lỗi của AppException (400/401/403/404) — CÓ field code. */
export interface AppErrorBody {
  detail: string;
  code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'
      | 'UNPROCESSABLE_ENTITY' | 'SERVICE_UNAVAILABLE';
  errors?: Array<Record<string, unknown>> | null;
}

/** Body lỗi của HTTPException thuần (413/415) — KHÔNG có field code. */
export interface RawHttpErrorBody {
  detail: string;
}

export type UploadErrorBody = AppErrorBody | RawHttpErrorBody;
```

> **Quyết định cho bản TS:** nên chuẩn hoá `413`/`415` để **có** `code`
> (`PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`) và ghi vào changelog "sai lệch chủ ý".
> Nếu mục tiêu là parity byte-for-byte thì giữ nguyên hình dạng thiếu `code`. **Phải chọn một
> và ghi rõ**, đừng để mỗi endpoint một kiểu.

---

## 15. Kiểm soát truy cập & rủi ro bảo mật

### 15.1 `/media` là public hoàn toàn — không có ngoại lệ

Không có guard, không có middleware auth, không có signed URL, không có kiểm tra
`is_published`/`is_premium`. Cụ thể:

- Một tập học **premium** (`courses.is_premium = true`) được bảo vệ ở endpoint
  `GET /api/v1/lessons/episodes/{id}/content` — endpoint này yêu cầu đăng nhập và, nếu khoá
  học premium và user không phải admin, gọi `PremiumService.get_user_subscription` rồi trả
  `403` `"Yêu cầu gói Premium đang hoạt động"` nếu không có gói.
- **Nhưng** field `file_url` mà endpoint đó trả về trỏ tới `/media/...` — và `/media/...`
  **không có bất kỳ kiểm tra nào**.

⇒ **Rủi ro #1 (nghiêm trọng): rào premium chỉ bảo vệ metadata, không bảo vệ nội dung.**
Bất kỳ ai có URL (một user premium chia sẻ link, hoặc URL bị lộ qua log/referrer/CDN) đều
tải được PDF/video premium mà **không cần đăng nhập**. URL có chứa hai UUID nên không thể
brute-force thực tế, nhưng "khó đoán" **không phải** là kiểm soát truy cập.

### 15.2 Các rủi ro còn lại

| # | Rủi ro | Mức | Chi tiết |
|---|---|---|---|
| 2 | **Nội dung chưa xuất bản vẫn tải được** | Cao | Tập học `is_published = false` hoặc khoá học `is_published = false` bị ẩn ở API, nhưng file vẫn nằm ở `/media`. Nội dung nháp/embargo bị lộ |
| 3 | **Nội dung đã "xoá" vẫn tải được** | Cao | Soft-delete khoá học không xoá file nào (§12.1) |
| 4 | **Không kiểm tra magic byte** | Trung bình | Chỉ tin `Content-Type` client khai. File tuỳ ý được lưu và serve. Với PDF thì đây là kênh phát tán file độc: `content-type: application/pdf` khiến browser mở inline; PDF có JS embed. Không có `Content-Disposition: attachment`, không có `X-Content-Type-Options: nosniff` |
| 5 | **Body được nhận trước khi kiểm tra auth** | Trung bình | FastAPI parse `request.form()` **trước** `solve_dependencies` ⇒ khách vô danh có thể đẩy hàng trăm MB vào `SpooledTemporaryFile`/đĩa trước khi bị `401`. DoS đĩa + băng thông |
| 6 | **Giới hạn thumbnail kiểm tra SAU khi đọc hết vào RAM** | Trung bình | `file.read()` không giới hạn ⇒ RAM spike bằng kích thước file. Nhiều request song song → OOM |
| 7 | **File tập học được gom hết vào RAM trước khi ghi** | Trung bình | `chunks: list[bytes]` giữ toàn bộ file. Video 500 MB = 500 MB RAM/request. 4 admin upload đồng thời = 2 GB |
| 8 | **File `.tmp` nằm trong vùng static** | Thấp | `/media/.../ep-<id>.mp4.tmp` tải được trong lúc đang ghi và sau khi process bị kill |
| 9 | **Không có `Cache-Control`** | Thấp | Nội dung premium có thể bị proxy/CDN trung gian cache. Với nội dung có thu phí nên set `Cache-Control: private, no-store` (hoặc chuyển sang signed URL) |
| 10 | **Thumbnail luôn cùng URL** | Thấp | Không cache-bust ⇒ CDN có TTL sẽ serve ảnh cũ sau khi thay |
| 11 | **Rate limit áp lên file tĩnh** | Thấp (nhưng gây lỗi UX) | 60 req/phút cho **cùng** path/IP; player seek video có thể bị `429` (§3.3) |

### 15.3 Điều đang làm ĐÚNG — phải giữ trong bản TS

1. **Tên file do server sinh**, hoàn toàn bỏ `filename` của client ⇒ triệt tiêu path traversal
   và tên file độc từ phía upload.
2. **`from_url` kiểm tra `relative_to(base)` sau `resolve()`** ⇒ chặn traversal khi resolve URL
   thành đường dẫn để xoá. Đã có test riêng cho `/media/../../etc/passwd` và
   `/media/courses/../../../etc/shadow`.
3. **Starlette `lookup_path` dùng `realpath` + `commonpath`** ⇒ chặn cả symlink escape.
4. **`write_atomic` qua `.tmp` + `os.replace`** ⇒ không bao giờ serve file ghi dở (trừ chính
   file `.tmp`).
5. **`file_size_bytes` lấy từ số byte thật đã ghi**, không tin `Content-Length` của client.
6. **`EpisodeUpdate` không có field `file_url`** ⇒ admin không thể trỏ `file_url` tới đường
   dẫn tuỳ ý.
7. **Guard chống publish rỗng** đọc `file_url` từ DB, không từ payload.

### 15.4 Kiến nghị bảo mật cho bản TS (theo mức ưu tiên)

**P0 — phải làm:**

- Đưa nội dung tập học **ra khỏi** static mount public. Hai lựa chọn:
  - **(a) Signed URL có thời hạn** (khuyến nghị nếu dùng S3/R2): endpoint
    `GET /api/v1/lessons/episodes/{id}/file-url` chạy đúng chuỗi guard hiện có
    (auth → published → premium) rồi trả presigned URL TTL ngắn (5–15 phút).
  - **(b) Streaming qua controller**: endpoint có guard, đọc file rồi `StreamableFile` —
    nhưng **phải tự implement Range/206** để player seek được (Starlette đang làm sẵn việc này,
    Node thì phải viết tay).
- Chạy guard admin **trước** khi consume body. Trong NestJS, **guard chạy trước interceptor**
  ⇒ `@UseGuards(JwtAuthGuard, AdminGuard)` + `@UseInterceptors(FileInterceptor('file'))` cho
  đúng hành vi mong muốn (tốt hơn FastAPI hiện tại). Vẫn nên đặt thêm giới hạn ở tầng
  reverse-proxy (`client_max_body_size`) để chặn từ ngoài.
- Đặt `limits.fileSize` cho multer **theo loại** để bị từ chối **trong lúc stream**, không
  phải sau khi đã nhận hết.

**P1:**

- Kiểm tra magic byte (`file-type`) cho PDF/video; `sharp().metadata()` trong `try/catch` cho
  ảnh → trả `4xx`, không `500`.
- Trả header `X-Content-Type-Options: nosniff` và `Content-Disposition: attachment` cho PDF
  (nếu vẫn serve trực tiếp).
- Đảo thứ tự "xoá file cũ": ghi mới + commit DB trước, xoá cũ sau.
- Ghi tmp ra thư mục staging **ngoài** vùng public (cùng filesystem để rename atomic).

**P2:**

- Job dọn rác định kỳ (§12.2).
- Cache-bust cho thumbnail: đưa hash nội dung vào tên file (`thumbnail-<hash8>.jpg`) hoặc
  thêm `?v=<updated_at epoch>` vào `thumbnail_url` khi trả về API.
- Miễn rate limit cho route static (hoặc bỏ static ra khỏi Node).
- Xoá file khi soft-delete khoá học? **Không** — soft-delete phải đảo ngược được. Thay vào đó
  chặn truy cập bằng cơ chế guard/signed URL ở P0.

---

## 16. Mapping sang TypeScript/NestJS

### 16.1 Bảng thay thế thư viện

| Python hiện tại | TypeScript/NestJS | Ghi chú |
|---|---|---|
| `app.mount("/media", StaticFiles(directory=dir))` | `ServeStaticModule.forRoot({ rootPath, serveRoot: '/media', serveStaticOptions: {...} })` | Xem §16.2 — mặc định của `serve-static` **khác** Starlette ở vài chỗ |
| `fastapi.UploadFile` + `python-multipart` | `@UploadedFile()` + `FileInterceptor('file')` (`@nestjs/platform-express` → `multer`) | Field name `'file'` phải khớp chính xác |
| `Pillow` | `sharp` | Xem bảng chuyển đổi §8.4 |
| `shutil.which` + `asyncio.create_subprocess_exec("ffprobe", ...)` | `execFile('ffprobe', [...], { timeout: 15000 })` | Không dùng `exec` với string |
| `pathlib.Path` + `os.replace` | `node:path` + `fs.promises.rename` | tmp phải cùng filesystem |
| `SpooledTemporaryFile` (1 MB in-memory rồi rơi xuống đĩa) | `multer.diskStorage` | **Đừng** dùng `memoryStorage` cho video |

### 16.2 `ServeStaticModule` — cấu hình để khớp hành vi Starlette

```ts
ServeStaticModule.forRoot({
  // PHẢI là absolute, resolve MỘT LẦN trong config module rồi dùng chung
  // với MediaStorage (§2.1).
  rootPath: mediaConfig.lessonMediaDir,
  serveRoot: '/media',
  serveStaticOptions: {
    index: false,        // Starlette: html=False → không index.html
    redirect: false,     // Starlette: không redirect thư mục khi html=False
    dotfiles: 'deny',    // cứng rắn hơn Starlette (nên làm)
    fallthrough: false,  // thư mục / thiếu file → 404, không rơi xuống route sau
    acceptRanges: true,  // Starlette bật sẵn
    etag: true,
    lastModified: true,
    // Starlette KHÔNG set Cache-Control. Nếu muốn parity thì để mặc định của
    // Express là `public, max-age=0` — VẪN KHÁC. Quyết định rõ ràng:
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Nội dung có thu phí: cân nhắc 'private, no-store' (xem §15.4)
    },
  },
});
```

**Khác biệt cần chấp nhận hoặc bù:**

| Điểm | Starlette | Express `serve-static` |
|---|---|---|
| Method khác GET/HEAD | `405` | `404` khi `fallthrough: false` (hoặc rơi xuống route sau) — **muốn `405` thì phải tự viết middleware** |
| `PermissionError` | `401` | thường `500`/`404` |
| Thuật toán ETag | `md5(f"{mtime}-{size}")` | `W/"<size>-<mtime>"` — **format khác** ⇒ client cache cũ sẽ revalidate một lần. Chấp nhận được, nhưng ghi vào changelog |
| Cache-Control | không set | `public, max-age=0` mặc định |
| Multi-range | `multipart/byteranges` | `serve-static` hỗ trợ (qua `send`) |

Nếu cần khớp `405` chính xác: thêm middleware trước `ServeStaticModule` kiểm tra
`req.path.startsWith('/media/') && !['GET','HEAD'].includes(req.method)` → `res.sendStatus(405)`.

### 16.3 Controller upload — khung NestJS

```ts
import {
  Controller, Post, Param, ParseUUIDPipe, UploadedFile,
  UseGuards, UseInterceptors, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('admin/lessons')       // global prefix 'api/v1'
@UseGuards(JwtAuthGuard, ActiveUserGuard, AdminGuard)   // chạy TRƯỚC interceptor
export class AdminLessonMediaController {
  constructor(
    private readonly courses: CourseService,
    private readonly episodes: EpisodeService,
    private readonly audit: AdminAuditService,
  ) {}

  @Post('courses/:courseId/thumbnail')
  @HttpCode(200)                                        // KHÔNG phải 201
  @UseInterceptors(FileInterceptor('file', {            // ← tên field: 'file'
    storage: diskStorage({ destination: STAGING_DIR }), // staging NGOÀI vùng public
    limits: { fileSize: cfg.lessonMaxThumbnailMb * 1024 * 1024, files: 1 },
  }))
  async uploadThumbnail(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @UploadedFile() file: Express.Multer.File,
    @AuditCtx() ctx: AuditContext,
  ): Promise<CourseResponse> { /* … */ }

  @Post('episodes/:episodeId/file')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', {            // ← tên field: 'file'
    storage: diskStorage({ destination: STAGING_DIR }),
    // Giới hạn ở đây phải là MAX của pdf/video vì chưa biết content_type
    // của episode trước khi parse body. Giới hạn CHÍNH XÁC theo loại được
    // kiểm tra lại trong service sau khi đọc episode từ DB.
    limits: { fileSize: Math.max(cfg.lessonMaxPdfMb, cfg.lessonMaxVideoMb) * 1024 * 1024, files: 1 },
  }))
  async uploadEpisodeFile(
    @Param('episodeId', ParseUUIDPipe) episodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @AuditCtx() ctx: AuditContext,
  ): Promise<EpisodeAdminBrief> { /* … */ }
}
```

**Điểm cần chú ý khi cấu hình limit:**

- Multer limit là **một số cố định cho cả route**, còn logic hiện tại chọn limit **theo
  `episode.content_type` đọc từ DB** — mà DB chỉ được đọc **sau** khi body đã parse. Cách
  giải quyết: đặt `limits.fileSize` = max(pdf, video) ở tầng multer (chặn cứng phía ngoài),
  rồi trong service kiểm tra `file.size > limitTheoLoai` → trả `413` với **đúng message**
  `File quá lớn (tối đa {N} MB)`.
- Multer vượt `limits.fileSize` ném `MulterError('LIMIT_FILE_SIZE')` → Nest map thành `400`
  hoặc `413` tuỳ version. **Phải viết exception filter** để chuẩn hoá về `413` với message
  tiếng Việt đúng như bảng §14.
- `limits.files: 1` để không nhận nhiều part file.
- **Bắt buộc**: dùng `diskStorage`, **không** `memoryStorage`. `memoryStorage` với video
  500 MB là lỗi kiến trúc (nhân bản đúng lỗi §15.2 #7).
- Đặt thêm `client_max_body_size` ở nginx/Coolify proxy — chặn ở biên, rẻ nhất.

### 16.4 Nơi cấu hình limit — checklist

| Tầng | Cấu hình gì | Giá trị |
|---|---|---|
| Reverse proxy (nginx / Coolify) | `client_max_body_size` | `> LESSON_MAX_VIDEO_MB` (ví dụ `600m`) — nếu nhỏ hơn, proxy trả `413` trước khi app thấy request, message sẽ **không** phải tiếng Việt |
| `FileInterceptor` options | `limits.fileSize`, `limits.files` | max(pdf, video) MB; `files: 1` |
| Service (sau khi đọc episode từ DB) | So `file.size` với limit theo `content_type` | `LESSON_MAX_PDF_MB` / `LESSON_MAX_VIDEO_MB` / `LESSON_MAX_THUMBNAIL_MB` |
| Body parser toàn cục | **Không đụng** — multipart không đi qua `json`/`urlencoded` parser | — |
| Fastify (nếu dùng `@nestjs/platform-fastify`) | `@fastify/multipart` `limits: { fileSize, files: 1 }` | Tương đương multer |

> Nếu chọn Fastify: dùng `FastifyFileInterceptor` từ `@nestjs/platform-fastify` hoặc
> `fastify-multer`. API `@UploadedFile()` giữ nguyên hình dạng. Với video lớn, Fastify
> stream tốt hơn Express — nhưng phải bật `attachFieldsToBody: false` và tự pipe stream ra
> đĩa/S3 để không buffer vào RAM.

### 16.5 Port `MediaStorage` sang TS — điểm cần cẩn thận

```ts
// publicUrl: PHẢI dùng dấu '/' kể cả trên Windows (Python dùng as_posix()).
publicUrl(absPath: string): string {
  const rel = path.relative(this.base, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path outside media base');   // Python: ValueError từ relative_to
  }
  return `/media/${rel.split(path.sep).join('/')}`;
}

// fromUrl: PHẢI resolve rồi mới kiểm tra containment (đúng thứ tự của Python).
fromUrl(url: string | null): string | null {
  if (!url || !url.startsWith('/media/')) return null;
  const rel = url.slice('/media/'.length);
  const p = path.resolve(this.base, rel);
  const relBack = path.relative(this.base, p);
  if (relBack.startsWith('..') || path.isAbsolute(relBack)) return null;
  return p;
}

// delete: file không tồn tại → TRẢ true (không phải false, không ném).
async delete(absPath: string): Promise<boolean> {
  try { await fs.promises.rm(absPath, { force: true }); return true; }
  catch { return false; }
}
```

Port nguyên **tất cả** test trong `tests/test_lessons_storage.py` sang Jest/Vitest — chúng là
đặc tả thực thi của lớp này, đặc biệt hai test path traversal.

---

## 17. Hạn chế kiến trúc: đĩa local không scale ngang — khuyến nghị S3/R2

### 17.1 Vấn đề, phát biểu chính xác

Storage hiện tại là **đĩa local của process backend**. Điều đó có nghĩa:

| Hệ quả | Chi tiết |
|---|---|
| **Không scale ngang được** | Chạy 2+ instance backend sau load balancer: instance A nhận upload và ghi vào đĩa của A. Request `GET /media/...` rơi vào instance B → **404**. Endpoint API vẫn trả `file_url` bình thường (DB dùng chung) nên lỗi biểu hiện là "ảnh/video hỏng ngẫu nhiên", cực khó debug. |
| **Không zero-downtime deploy được** | Deploy container mới, container cũ bị xoá → mất toàn bộ media nếu không có volume persistent. |
| **State nằm trong container** | Rebuild `--no-cache` (đúng quy trình deploy Coolify hiện tại) sẽ mất media nếu `LESSON_MEDIA_DIR` không trỏ vào bind mount / named volume. |
| **Không CDN** | Video được stream trực tiếp từ process Node/Python. Băng thông + CPU của app server phải gánh việc phục vụ file — chính xác là việc mà CDN làm tốt hơn 100 lần. |
| **Backup thủ công** | Backup DB không bao gồm media. Restore DB mà không restore đĩa ⇒ `file_url` trỏ vào hư không. |
| **Rate limit trên static** | §3.3 — vì file đi qua app nên nó ăn quota rate limit của app. |

⇒ **Kết luận: đây là hạn chế kiến trúc của bản Python hiện tại, KHÔNG phải yêu cầu nghiệp vụ.**
Bản viết lại TS **nên** sửa. Nếu vì lý do thời gian phải giữ đĩa local ở phase 1, thì **bắt
buộc** ghi vào runbook: *"backend media chỉ được chạy 1 instance; `LESSON_MEDIA_DIR` phải là
persistent volume; đã có ticket chuyển sang object storage."*

### 17.2 Kiến trúc đích khuyến nghị

```
Admin browser
   │  POST /api/v1/admin/lessons/episodes/{id}/file  (multipart, field `file`)
   ▼
NestJS  ── guard admin ──► validate MIME + magic byte + size
                          │
                          ├─ ảnh: sharp resize (1280×720 inside, JPEG q85) ──┐
                          └─ pdf/video: stream trực tiếp ────────────────────┤
                                                                            ▼
                                                        S3 / Cloudflare R2 (PutObject)
                                                        key: courses/<courseId>/…
                                                                            │
                          ghi DB: fileUrl (key hoặc URL), fileSizeBytes, durationSeconds
                                                                            │
Người học ◄──── signed URL TTL ngắn ◄──── GET /api/v1/lessons/episodes/{id}/file-url
                (qua CDN)                 (guard: auth → published → premium)
```

### 17.3 Thiết kế trừu tượng để không bị lock-in

```ts
/** Trừu tượng hoá storage — đĩa local và S3/R2 cùng implement. */
export interface ObjectStoragePort {
  /** key ví dụ: 'courses/<courseId>/ep-<episodeId>.mp4' */
  put(key: string, body: NodeJS.ReadableStream | Buffer, contentType: string): Promise<{ size: number }>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  /** URL public (local disk) hoặc presigned (S3/R2). ttlSeconds bị bỏ qua ở local. */
  urlFor(key: string, ttlSeconds?: number): Promise<string>;
}

/** Chọn implementation theo env — cho phép chuyển dần, không big-bang. */
export type MediaBackend = 'local' | 's3' | 'r2';

export interface MediaBackendConfig {
  backend: MediaBackend;               // env MEDIA_BACKEND, default 'local' (parity)
  // dùng khi backend === 'local'
  lessonMediaDir: string;
  // dùng khi backend === 's3' | 'r2'  — CHƯA TỒN TẠI trong backend Python hiện tại,
  // đây là biến MỚI của bản TS, phải bổ sung vào chương 05 khi triển khai.
  bucket?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string;              // domain CDN đứng trước bucket
  signedUrlTtlSeconds?: number;        // đề xuất 900
}
```

**Chiến lược migration (nếu chuyển sau khi đã chạy TS bằng đĩa local):**

1. Giữ `episodes.file_url` / `courses.thumbnail_url` nguyên dạng `/media/...` (cột
   `VARCHAR(500)` — đủ chỗ cho cả key S3 dài).
2. Thêm cột `storage_backend VARCHAR(10) NOT NULL DEFAULT 'local'` để biết mỗi row đang ở đâu
   trong lúc chuyển dần. *(Cột này CHƯA TỒN TẠI — là thiết kế mới, không phải parity.)*
3. Script copy đĩa → bucket, giữ đúng key `courses/<courseId>/<filename>`.
4. Đổi `MEDIA_BACKEND=s3`, giữ `/media` mount thêm một thời gian để phục vụ row `local`.
5. Sau khi mọi row đã là `s3`, xoá static mount + xoá `serveRoot: '/media'`.

### 17.4 Nếu vẫn giữ đĩa local ở phase 1 — điều kiện tối thiểu

- `LESSON_MEDIA_DIR` là **absolute path** trỏ vào **persistent volume**.
- Backend chỉ chạy **1 instance** (hoặc dùng shared filesystem như NFS/EFS — nhưng NFS + rename
  atomic có bẫy riêng, cần test).
- Có backup định kỳ thư mục media, và runbook restore **đồng bộ** DB + media.
- Đặt nginx/CDN đứng trước `/media` để giảm tải app **và** để không bị rate limit của app.
- Ghi rõ hạn chế này vào README deploy.

---

## 18. Hành vi đã chốt bởi test hiện có

### 18.1 `tests/test_media_static.py`

Một test duy nhất — `test_media_thumbnail_file_is_served`:

1. Ghi trực tiếp `b"fake-jpeg"` vào
   `Path(LESSON_MEDIA_DIR) / "courses" / str(uuid4()) / "thumbnail.jpg"` (tự `mkdir -p`).
2. `GET /media/courses/<uuid>/thumbnail.jpg`
3. Khẳng định `status_code == 200` **và** `response.content == b"fake-jpeg"`.

Điều test này chốt cho bản TS:

- Prefix public là **`/media`**, cấu trúc con **`courses/<courseId>/thumbnail.jpg`**.
- Nội dung được serve **nguyên byte**, không transform lúc đọc.
- Static mount đọc đúng `LESSON_MEDIA_DIR` từ config (test chỉ set env, không mock gì).
- File **không cần** có row DB tương ứng để tải được — bằng chứng trực tiếp cho §15.1
  (`/media` không kiểm tra gì).

### 18.2 `tests/test_lessons_storage.py` — 12 test

| Nhóm | Test | Chốt điều gì |
|---|---|---|
| `write_atomic` | `creates_file` | File tồn tại, size = `len(content)`, nội dung đúng |
| | `returns_total_bytes` | `[b"abc", b"de", b"fghi"]` → trả `9`, nội dung `b"abcdefghi"` |
| | `no_tmp_file_left_on_success` | Không còn `<target>.tmp` sau khi thành công |
| | `creates_parent_dirs` | Tự tạo `a/b/c/` nhiều cấp |
| `delete` | `existing_file_returns_true` | Trả `true`, file mất |
| | `missing_file_returns_true` | **File không tồn tại vẫn trả `true`** |
| | `accepts_string_path` | Nhận cả `str` và `Path` |
| `public_url` | `converts_abs_path` | Bắt đầu bằng `/media/`, chứa `courses/abc/ep.pdf` |
| `from_url` | `resolves_valid_url` | Round-trip `from_url(public_url(f)) === f` |
| | `returns_none_for_non_media_url` | `/static/image.png` → `null`; `None` → `null`; `""` → `null` |
| | `rejects_path_traversal` | `/media/../../etc/passwd` → `null` |
| | `rejects_traversal_in_segment` | `/media/courses/../../../etc/shadow` → `null` |
| `course_dir` | `creates_directory` | Thư mục tồn tại, là dir, tên chứa `courseId` |
| | `idempotent` | Gọi 2 lần trả cùng đường dẫn, không lỗi |

### 18.3 Khoảng trống test — bản TS PHẢI bổ sung

Không tìm thấy test nào cho những điều sau (grep `tests/test_lessons_admin.py` không có
`upload`/`thumbnail`/`files=`):

- ❌ Endpoint upload thumbnail (mọi nhánh: `200`, `415`, `413`, `404`, `401`, `403`)
- ❌ Endpoint upload file tập học (mọi nhánh: `200`, `415` × 2, `413`, `400`, `404`)
- ❌ `save_thumbnail_jpeg`: kích thước đầu ra, format JPEG, không phóng to, chuyển RGBA→RGB
- ❌ `probe_duration_seconds`: không có `ffprobe` → `null`; timeout; JSON lỗi
- ❌ Guard chống publish tập học pdf/video chưa có file (`400`)
- ❌ Trạng thái "pending upload": tạo pdf/video → `file_url` là `null`, `is_published` là `false`
- ❌ Xoá tập học có xoá file vật lý
- ❌ `refresh_course_denorms` cập nhật `total_episodes` / `total_duration_seconds` sau upload
- ❌ `/media` trả `404` cho file không tồn tại, `405` cho POST, `404` cho thư mục
- ❌ Range request `206` trên file media

> Viết những test này **trước** khi port (TDD) — chúng chính là bảng đặc tả trong §6, §7, §8,
> §9, §12 của chương này.

---

## 19. Checklist nghiệm thu chương 11

Bản TS được coi là đạt parity chương này khi:

**Static serving**

- [ ] `GET /media/courses/<courseId>/thumbnail.jpg` trả `200` + đúng byte, không cần auth
- [ ] Thư mục media được tạo tự động khi app startup (`mkdir -p`)
- [ ] `LESSON_MEDIA_DIR` được resolve thành absolute **một lần** và dùng chung cho cả static
      module và storage service
- [ ] File không tồn tại → `404`; thư mục → `404`; path traversal → `404`
- [ ] `Range` request trả `206` + `content-range` (bắt buộc để seek video)
- [ ] `accept-ranges: bytes`, `etag`, `last-modified` có trên response `200`
- [ ] `/media` **không** bị global throttler chặn

**Upload thumbnail**

- [ ] `POST /api/v1/admin/lessons/courses/{course_id}/thumbnail`, field form **`file`**,
      `multipart/form-data`, status thành công **`200`**
- [ ] MIME cho phép đúng `image/jpeg`, `image/png`, `image/webp`; normalize bằng
      `split(';')[0].trim().toLowerCase()`
- [ ] MIME sai → `415` message `Định dạng ảnh không hợp lệ. Chấp nhận: jpeg, png, webp`
- [ ] Quá `LESSON_MAX_THUMBNAIL_MB` → `413` message `Ảnh quá lớn (tối đa 5 MB)`
- [ ] Ghi ra **`thumbnail.jpg`**, JPEG, quality 85, resize `fit: inside` trong 1280×720,
      không phóng to
- [ ] `courses.thumbnail_url` = `/media/courses/<courseId>/thumbnail.jpg` (tương đối)
- [ ] Audit `lesson.course.thumbnail` với `after = { thumbnail_url }`
- [ ] Ảnh hỏng → `4xx` có message tiếng Việt (**cải thiện có chủ ý** so với `500` hiện tại —
      ghi vào changelog)

**Upload file tập học**

- [ ] `POST /api/v1/admin/lessons/episodes/{episode_id}/file`, field form **`file`**,
      status thành công **`200`**
- [ ] Loại file được quyết định bởi `episode.content_type` **trong DB**, không bởi MIME client
- [ ] `pdf`: chỉ `application/pdf`, limit `LESSON_MAX_PDF_MB`, ext `pdf`,
      sai → `415 Chỉ chấp nhận file PDF`
- [ ] `video`: `video/mp4` | `video/webm`, limit `LESSON_MAX_VIDEO_MB`, ext `mp4` nếu MIME chứa
      `"mp4"` ngược lại `webm`, sai → `415 Chỉ chấp nhận video MP4 hoặc WebM`
- [ ] `text` → `400 Tập học dạng text không cần upload file` (code `BAD_REQUEST`)
- [ ] Vượt limit → `413 File quá lớn (tối đa {N} MB)` với N đúng theo loại
- [ ] Tên file `ep-<episodeId>.<ext>`; **filename của client bị bỏ hoàn toàn**
- [ ] Ghi atomic (tmp + rename), tmp **không** nằm trong vùng public
- [ ] `file_size_bytes` = số byte **thật đã ghi**
- [ ] Video: `duration_seconds` từ `ffprobe` (`Math.trunc`), timeout 15s, không có binary →
      `null` im lặng
- [ ] PDF: `duration_seconds` luôn `null`
- [ ] `is_published` **không** bị upload bật lên
- [ ] `refresh_course_denorms` được gọi sau upload (cập nhật `total_episodes`,
      `total_duration_seconds`)
- [ ] Audit `lesson.episode.upload` với `after = { file_url, file_size_bytes, duration_seconds }`
- [ ] **Sửa lỗi:** file cũ chỉ bị xoá **sau khi** DB commit thành công (khác hiện tại)
- [ ] **Sửa lỗi:** `duration_seconds` không bị ghi đè thành `null` khi thiếu `ffprobe`

**Pending upload & constraint**

- [ ] Tạo tập học `pdf`/`video` thành công với `file_url = null`, `is_published = false`
- [ ] Tạo tập học `text` → `is_published = true`, yêu cầu `markdown_body`, `markdown_body`
      ≤ 200 KB (đo theo byte UTF-8)
- [ ] `sort_order` tự gán = `max(sort_order) + 1` (tập đầu tiên = 1)
- [ ] CHECK constraint tên `ck_episodes_payload_shape` với đúng biểu thức §10.2
- [ ] Migration đầu tiên (nếu migrate từ DB production) drop đúng tên cũ
      `ck_episodes_ck_episodes_content_type_payload`
- [ ] `PATCH is_published: true` trên tập pdf/video chưa có file → `400 Phải upload file trước
      khi xuất bản tập học dạng PDF/Video`
- [ ] `EpisodeUpdate` **không** cho phép set `file_url`

**Xoá & dọn dẹp**

- [ ] `DELETE /api/v1/admin/lessons/episodes/{id}` → `204`, xoá file vật lý best-effort,
      hard-delete row, cascade `episode_progress`, `refresh_course_denorms`
- [ ] Soft-delete khoá học **không** xoá file (parity) — nhưng nội dung không còn tải được
      công khai (cải thiện P0)
- [ ] Có job dọn rác (file không có row tham chiếu + `.tmp` cũ)

**Bảo mật**

- [ ] Guard admin chạy **trước** khi consume multipart body
- [ ] Có limit ở tầng proxy (`client_max_body_size`) và tầng multer (`limits.fileSize`)
- [ ] Không buffer toàn bộ file vào RAM (dùng `diskStorage`/stream, không `memoryStorage`)
- [ ] Có kiểm tra magic byte cho PDF/video
- [ ] Nội dung premium/chưa xuất bản **không** tải được qua URL public (signed URL hoặc
      streaming có guard)

---

## 20. Những gì CHƯA XÁC ĐỊNH

Ghi lại trung thực để không ai đoán bừa:

1. **Giá trị `LESSON_MEDIA_DIR` thực tế trên production.** `.env` và `.env.example` trong repo
   **không chứa** biến nào bắt đầu bằng `LESSON_` hoặc `MEDIA` (đã grep). Docstring trong
   `app/services/lesson/storage.py` gợi ý `/www/wwwroot/iqx.vn/media`, nhưng đó là **comment**,
   không phải cấu hình đang chạy — và ghi chú deploy hiện tại là Coolify, khác aaPanel.
   → Cần đọc env thực tế trên Coolify trước khi viết Dockerfile/volume mount cho bản TS.
2. **`ffprobe` có được cài trên image production hay không.** Không có `Dockerfile` trong
   `backend/` và không tìm thấy `docker-compose*.yml` trong repo (đã tìm ở `backend/` và root
   `IQX/`). → Nếu chưa cài, mọi `duration_seconds` đang là `null` trên production và
   `total_duration_seconds` = 0. Cần kiểm tra bằng query DB thật.
3. **Có nginx/CDN đứng trước `/media` trên production hay không.** Nếu có, phần rate limit
   §3.3 và một phần header behavior §3.2 bị proxy ghi đè. → Cần đọc config reverse proxy.
4. **Kích thước media hiện tại trên production** (để lên kế hoạch migrate sang S3/R2).
   Thư mục `backend/media/` trong repo rỗng và không được git track.
5. **Pillow có strip hết metadata EXIF/ICC không.** Re-encode JPEG thường không mang theo phần
   lớn metadata, nhưng để khẳng định chắc chắn cần test thực nghiệm với ảnh có EXIF GPS. →
   Nếu bản TS dùng `sharp`, mặc định `sharp` **cũng** strip metadata trừ khi gọi
   `.withMetadata()`; nên viết một test khẳng định "không có EXIF trong output" cho cả hai bản.
6. **Có row nào trong DB production đang ở trạng thái lệch** (`file_url` khác `null` nhưng file
   vật lý không tồn tại) — hệ quả của lỗi §7.3 (1) và §12.3. → Nên chạy script đối chiếu
   trước khi migrate.
