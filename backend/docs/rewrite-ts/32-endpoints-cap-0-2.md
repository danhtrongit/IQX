# Endpoint — Đấu trường Cấp 0, 1, 2

Chương này đặc tả **20 endpoint** của ba cấp đầu chương trình «Đấu trường»: Cấp 0 «Nhập môn» (7 endpoint — cơ học đặt lệnh, có thêm `placement` và `kehoach` riêng), Cấp 1 «Học việc» (6 endpoint — Form Kế hoạch + Kết sổ), Cấp 2 «Kỷ luật» (7 endpoint — cắt lỗ/chốt lời + đo vi phạm + điểm kỷ luật). Ba cấp **không đối xứng**: chỉ Cấp 0 có `placement`, chỉ Cấp 0 có `GET /kehoach`, Cấp 0 **không có `ketso`**, Cấp 1 và Cấp 2 **có cả `kehoach` và `ketso`**, và chỉ Cấp 2 có `diem-ky-luat`.

Nguồn: `app/api/v1/endpoints/cap0.py`, `cap1.py`, `cap2.py`; `app/schemas/cap0.py`, `cap1.py`, `cap2.py`; `app/services/cap0/service.py`, `cap1/service.py`, `cap2/service.py`; `app/models/cap0.py`, `cap1.py`, `cap2.py`; `app/api/deps.py`; `app/services/virtual_trading/service.py`; `tests/test_cap0.py`, `test_cap1.py`, `test_cap2.py`. Migration: `9a4c2f1e7b60_cap0_v3_five_tasks_one_gate.py`, `5c7d2e9a4f18_cap0_four_tasks_no_tours.py`, `4d8e6b2a1c93_cap1_five_tasks_drop_portfolio_view.py`, `f809de621bd0_add_cap2_discipline_tracking.py`, `8f1a5c7d2e64_cap2_two_tasks_drop_discipline_metrics.py`.

Frontend gọi bộ này ở route `/dau-truong` (`dashboard/src/features/cap0`, `cap1`, `cap2`).

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | GET | `/api/v1/cap0/progress` | Bearer | Tiến độ Cấp 0 (hoặc `null` nếu chưa vào) — **đọc thuần, KHÔNG tính lại** |
| 2 | POST | `/api/v1/cap0/enter` | Bearer | Vào Cấp 0 (idempotent) + seed tài khoản ảo 100.000.000 ₫ nếu chưa có |
| 3 | POST | `/api/v1/cap0/placement` | Bearer | Câu hỏi xếp lớp 1 boolean → `placed_level` (0 hoặc 2); upsert `user_placement` |
| 4 | PATCH | `/api/v1/cap0/task` | Bearer | Đánh dấu nhiệm vụ ①-④ (client tự khai) + cổng `debrief` |
| 5 | POST | `/api/v1/cap0/kehoach` | Bearer | Ghi/ghi đè chip «lý do đời thường» cho 1 lệnh MUA (upsert, không 409) |
| 6 | GET | `/api/v1/cap0/kehoach` | Bearer | Đọc chip + dữ liệu suy ra từ CHÍNH lệnh đó (khoá theo `order_id`) |
| 7 | POST | `/api/v1/cap0/graduate` | Bearer | Tốt nghiệp Cấp 0 — 4/4 nhiệm vụ + cổng `debrief` |
| 8 | GET | `/api/v1/cap1/progress` | Bearer | Tiến độ Cấp 1 (hoặc `null`) — **đọc thuần, KHÔNG tính lại** |
| 9 | POST | `/api/v1/cap1/enter` | Bearer | Vào Cấp 1 (idempotent) — bắt buộc đã tốt nghiệp Cấp 0 |
| 10 | PATCH | `/api/v1/cap1/task` | Bearer | Kích hoạt **tính lại** ③④⑤ (KHÔNG tự đóng nhiệm vụ nào) |
| 11 | POST | `/api/v1/cap1/kehoach` | Bearer | Ghi Form Kế hoạch (lý do + vùng mua) cho 1 lệnh MUA — **409 nếu đã có** |
| 12 | POST | `/api/v1/cap1/ketso` | Bearer | Kết sổ 1 lệnh BÁN đã khớp — server tính pnl/số phiên giữ |
| 13 | POST | `/api/v1/cap1/graduate` | Bearer | Tốt nghiệp Cấp 1 — 5/5 nhiệm vụ |
| 14 | GET | `/api/v1/cap2/progress` | Bearer | Tiến độ Cấp 2 (hoặc `null`) — **đọc thuần, KHÔNG tính lại** |
| 15 | POST | `/api/v1/cap2/enter` | Bearer | Vào Cấp 2 (idempotent) — bắt buộc đã tốt nghiệp Cấp 1 |
| 16 | PATCH | `/api/v1/cap2/task` | Bearer | Kích hoạt **tính lại** ①② (KHÔNG tự đóng nhiệm vụ nào) |
| 17 | POST | `/api/v1/cap2/kehoach` | Bearer | Ghi cắt lỗ/chốt lời **vào hàng kế hoạch Cấp 1 đã có** (ghi đè) |
| 18 | POST | `/api/v1/cap2/ketso` | Bearer | Ghi 7 cờ kỷ luật **vào hàng kết sổ Cấp 1 đã có** (ghi đè cả 7) |
| 19 | GET | `/api/v1/cap2/diem-ky-luat` | Bearer | Điểm kỷ luật 0-100 của 1 ngày + breakdown «số đến từ đâu» |
| 20 | POST | `/api/v1/cap2/graduate` | Bearer | Tốt nghiệp Cấp 2 — 2/2 nhiệm vụ |

**Không endpoint nào trong 20 endpoint này yêu cầu Premium.** Cả ba router dùng `CurrentUser` (`Annotated[User, Depends(get_current_active_user)]`), không phải `PremiumUser` — docstring đầu mỗi file endpoint ghi rõ *"Cap N is FREE"*. Nhưng đọc mục «Thực chiến vs sân tập» bên dưới: **FREE về mặt HTTP không có nghĩa FREE về mặt tiến độ** — từ Cấp 1 trở lên mọi phép đếm đều lọc `mode == "thuc_chien"`, mà `mode` do GÓI THUÊ BAO quyết định.

---

## Kiểu dữ liệu dùng chung

~~~ts
// ─── Cấp 0 ────────────────────────────────────────────────────────────────

/** 5 chip «lý do đời thường» của khối Kế hoạch Cấp 0 — enum `LyDoDoiThuong`
 *  (app/models/cap0.py), thứ tự hiển thị CỐ ĐỊNH đúng như dưới đây.
 *  ★ Bộ này CỐ Ý rời rạc hoàn toàn với `LyDo` phân tích của Cấp 1. */
type LyDoDoiThuong =
  | "cong_ty_toi_biet"
  | "nguoi_quen_gioi_thieu"
  | "thay_tren_mang"
  | "gia_dang_tang"
  | "thu_cho_biet";

/** Nhãn nguyên văn spec §4 — `LY_DO_DOI_THUONG_LABELS` (app/models/cap0.py).
 *  Server TRẢ KÈM nhãn này trong `ly_do_label` để FE không phải giữ bản map
 *  thứ hai dễ lệch. POST /cap0/kehoach nhận CẢ slug LẪN nhãn nguyên văn. */
const LY_DO_DOI_THUONG_LABELS: Record<LyDoDoiThuong, string> = {
  cong_ty_toi_biet: "Công ty tôi biết",
  nguoi_quen_gioi_thieu: "Người quen giới thiệu",
  thay_tren_mang: "Thấy trên mạng",
  gia_dang_tang: "Giá đang tăng",
  thu_cho_biet: "Thử cho biết",
};

/** Cổng hành vi DUY NHẤT của Cấp 0. `sl_typed` và `star` đã bị xoá khỏi cấp
 *  (migration 9a4c2f1e7b60 + 5c7d2e9a4f18) — gửi lên là 422. */
type Cap0Gate = "debrief";

// ─── Cấp 1 ────────────────────────────────────────────────────────────────

/** 5 lý do mua PHÂN TÍCH — enum `LyDo` (app/models/cap1.py). */
type LyDo = "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia";

/** Nhận định của «AI Thanh tra» lúc ĐẶT lệnh — enum `TrangThaiLucDat`.
 *  Client gửi lên (nó là thứ user thấy trên màn hình lúc đó); server KHÔNG
 *  tự suy lại. `ung_ho` là giá trị nhiệm vụ ④ đếm. */
type TrangThaiLucDat = "ung_ho" | "trung_tinh" | "can_chu_y" | "nguoc_chieu";

/** Cảm xúc gắn vào Kết sổ — enum `CamXuc`. Nullable = user chưa chọn. */
type CamXuc = "binh_tinh" | "so" | "hoi_tiec" | "khong_ro";

// ─── Cấp 2 ────────────────────────────────────────────────────────────────

/** 2 cách chọn 1 để đặt cắt lỗ/chốt lời — enum `PhuongPhapSlTp`
 *  (app/models/cap1.py, cột trên `order_kehoach`). */
type PhuongPhapSlTp = "ho_tro_khang_cu" | "bien_do_dao_dong";

/** Xếp loại ngày theo điểm kỷ luật. `null` = không xếp loại được
 *  (ngày không có tình huống thử thách kỷ luật) — KHÔNG phải "đỏ". */
type XepLoai = "xanh" | "vang" | "do";

// ─── Vỏ lỗi chuẩn toàn app (app/core/exceptions.py) ───────────────────────

interface ErrorEnvelope {
  detail: string;
  code:
    | "NOT_FOUND"        // 404
    | "CONFLICT"         // 409
    | "BAD_REQUEST"      // 400
    | "UNAUTHORIZED"     // 401
    | "FORBIDDEN"        // 403
    | "UNPROCESSABLE_ENTITY"  // 422 do service chủ động ném
    | "SERVICE_UNAVAILABLE"   // 503
    | null;
  errors?: Array<Record<string, unknown>> | null;
}

/** 422 do PYDANTIC (sai kiểu / ngoài khoảng / thiếu field bắt buộc) có vỏ
 *  KHÁC — `HTTPValidationError` của FastAPI, không có `code`: */
interface HTTPValidationError {
  detail: Array<{ loc: (string | number)[]; msg: string; type: string }>;
}
~~~

---

## Nghiệp vụ nền

#### 1. Chuỗi tiến độ Cấp 0 → 1 → 2, và một hàng progress cho mỗi cấp

Mỗi cấp có bảng progress RIÊNG, một hàng/user, `UNIQUE(user_id)`: `cap0_progress`, `cap1_progress`, `cap2_progress`. Không có bảng "cấp hiện tại" tập trung — cấp hiện tại được SUY RA từ các hàng đó (`Cap1Service.get_current_level`: chưa có/chưa tốt nghiệp `cap0_progress` → 0; có nhưng `cap1_progress` chưa tốt nghiệp → 1; cả hai đã tốt nghiệp → 2).

Điều kiện tiên quyết vào cấp:

| Endpoint | Tiên quyết | Thiếu hàng cấp dưới | Có hàng nhưng chưa tốt nghiệp |
|---|---|---|---|
| `POST /cap0/enter` | không có | — | — |
| `POST /cap1/enter` | `cap0_progress.graduated_at != null` | 404 `Không tìm thấy tiến trình Cấp 0` | 409 `Chưa tốt nghiệp Cấp 0` |
| `POST /cap2/enter` | `cap1_progress.graduated_at != null` | 404 `Không tìm thấy tiến trình Cấp 1` | 409 `Chưa tốt nghiệp Cấp 1` |

★ Kiểm tiên quyết chỉ chạy khi hàng của CHÍNH cấp đó chưa tồn tại. Nếu `capN_progress` đã có, `enter` trả về ngay hàng cũ, **không kiểm lại cấp dưới**. Đây là hành vi hiện tại và phải giữ nguyên (nếu không, xoá tay một hàng cấp dưới sẽ khoá cứng user đang học cấp trên).

★ Tốt nghiệp cấp N **KHÔNG** tự tạo hàng cấp N+1. Frontend phải gọi `POST /cap{N+1}/enter`.

#### 2. `CAP_MAX_ENABLED` — trần cấp

`CAP_MAX_ENABLED` **KHÔNG tồn tại ở backend** (`grep -rn "CAP_MAX" app/ alembic/` → không có kết quả). Nó là hằng số **frontend, đúng một chỗ**: `dashboard/src/features/cap1/capFlags.ts`.

**Giá trị HIỆN TẠI: `export const CAP_MAX_ENABLED = 3`** (commit `8f868dd feat(cap3): MỞ Cấp 3 «Bản lĩnh» — CAP_MAX_ENABLED 2 → 3`).

Hệ quả cho bản viết lại:

- Cấp 0 và Cấp 1 **luôn mở** (chúng là nền sản phẩm). Từ Cấp 2 trở lên, nhánh cấp N chỉ sống khi `CAP_MAX_ENABLED >= N`. Với giá trị 3 hiện tại, **cả 20 endpoint của chương này đều đang được FE gọi thật.**
- **Server không có cổng cấp nào.** Gọi `POST /cap2/enter` khi FE chưa mở Cấp 2 vẫn **HTTP 200 và tạo hàng THẬT** nếu đã tốt nghiệp Cấp 1. Chặn nằm hoàn toàn ở client. Nếu bản TS muốn thêm cổng phía server, đó là **thay đổi hành vi có chủ ý**, phải giữ nguyên luật bất di bất dịch: *nút tốt nghiệp ở đúng cấp trần vẫn phải bấm được và vẫn ghi được về server* (modal tốt nghiệp `closable={false}`, chỉ unmount khi có `graduated_at` — nút disabled kiểu "sắp ra mắt" sẽ NHỐT VĨNH VIỄN user đã xong nhiệm vụ; lỗi này đã phải sửa hai lần).

#### 3. Thực chiến vs sân tập — Cấp 0 chạy trên `san_tap`, Cấp 1-2 chỉ đếm `thuc_chien` (RẤT QUAN TRỌNG)

`VirtualTradingService.place_order` gán mode theo **GÓI THUÊ BAO**, không theo cấp:

~~~
mode = "thuc_chien" if is_premium else "san_tap"
~~~

`is_premium` = `app.api.deps.is_premium_active(user, db)` — **admin luôn tính là premium**. Ngoài ra lệnh `san_tap` **luôn thanh toán T0** bất kể cấu hình global (`effective_settlement_mode = config.settlement_mode if is_premium else SettlementMode.T0`).

Vậy:

| Cấp | Cơ chế tài khoản | Lệnh của user FREE | Ảnh hưởng tiến độ |
|---|---|---|---|
| Cấp 0 | Tài khoản ảo 100tr seed ở `POST /cap0/enter`. FREE luyện tập trên `mode="san_tap"` + T0. | `san_tap` | **KHÔNG ảnh hưởng** — 4 nhiệm vụ Cấp 0 do client PATCH, không phép đếm nào lọc `mode`. Cấp 0 tốt nghiệp được hoàn toàn bằng FREE. |
| Cấp 1 | Cùng tài khoản ảo đó; nhiệm vụ ⑤ đếm `mode == "thuc_chien" AND status == FILLED` | `san_tap` | ⑤ **mãi 0/10** → `graduate` mãi 409 |
| Cấp 2 | như trên; ① đếm `thuc_chien` + BUY + FILLED, ② chỉ quét `order_ketso` của lệnh `thuc_chien` | `san_tap` | ①② **không bao giờ xong** → `graduate` mãi 409 |

★ **Cấp 0 KHÔNG BAO GIỜ được lọc theo `mode`.** `Cap0Service.record_kehoach` có docstring dài giải thích: từng gate trên `mode == "san_tap"` và điều đó **giấu bảng chip khỏi toàn bộ nhóm user đang trả tiền** (họ vẫn học Cấp 0, nhưng lệnh của họ là `thuc_chien`) — write bị 400 (FE bọc non-fatal nên im lặng), read bị lọc mất, Kết sổ hiện `Lý do mua —` mãi mãi. `mode` **vẫn được BÁO CÁO** trên read model (`Cap0KehoachOut.mode`) vì nó là sự thật về lệnh, nhưng **không bao giờ được quyết định chip có hiện hay không**.

★ **KHÔNG endpoint giao dịch ảo nào bị giới hạn riêng cho Cấp 0.** Giới hạn duy nhất là hệ quả của `mode`/T0 ở `POST /api/v1/virtual-trading/orders`. Không có kiểm tra "user đang ở Cấp 0 nên chỉ được đặt lệnh X". Xem chương giao dịch ảo.

#### 4. Nhiệm vụ và điều kiện tốt nghiệp — Cấp 0

Bộ nhiệm vụ HIỆN TẠI là **4 nhiệm vụ, 1 cổng hành vi, không có chặng** — theo migration **`5c7d2e9a4f18` (four_tasks_no_tours)**, là bản MỚI NHẤT. Bản `9a4c2f1e7b60` (five_tasks_one_gate) đã bị nó thay thế: **KHÔNG dùng bản 5 nhiệm vụ, KHÔNG có 3 tour sản phẩm, KHÔNG có `task_5_done_at`, `task_6_done_at`, `task1_star_clicked`, `task5_sl_typed`, `task5_debrief_done`, `task6_debrief_done`.**

| Mã task | Tên hiển thị | Điều kiện hoàn thành | Ai đóng |
|---|---|---|---|
| `task_1_done_at` | ① Đặt lệnh mua đầu tiên | `PATCH /cap0/task {task_no:1}` | **Client PATCH** (không kiểm lệnh thật) |
| `task_2_done_at` | ② Xem tab Nắm giữ | `PATCH {task_no:2}` — **bị 400 nếu ① chưa xong** | **Client PATCH** |
| `task_3_done_at` | ③ Xem tab Theo dõi | `PATCH {task_no:3}` — **bị 400 nếu ① chưa xong** | **Client PATCH** |
| `task_4_done_at` | ④ Bán một lệnh — kết sổ đầu tiên | `PATCH {task_no:4, gate:"debrief"}` — **bare `{task_no:4}` bị 400** | **Client PATCH + cổng** |
| `task4_debrief_done` (bool) | cổng hành vi duy nhất: đã ĐÓNG màn Kết sổ | set `true` khi request mang `gate:"debrief"` | Client |

**Điều kiện tốt nghiệp Cấp 0**: `task_1..4_done_at` đều non-null **VÀ** `task4_debrief_done === true`. Thiếu bất cứ thứ gì → **409 `Chưa hoàn thành đủ nhiệm vụ và cổng Cấp 0`**.

Ràng buộc thứ tự (`_TASKS_AFTER_FIRST_BUY = (2, 3)`): ②③ vô nghĩa trước lệnh mua đầu tiên (tab Nắm giữ trống không dạy được gì), nên bị từ chối tới khi ① xong. **Từ chối này an toàn để thử lại**: FE bắn ②③ từ sự kiện MỞ TAB, và mở tab thì lặp lại — lần mở sau khi mua sẽ tự ghi nhận. Ràng buộc này cũng khớp với dữ liệu migration sinh ra (②③ được COPY từ ①, nên NULL ① ⇒ NULL ②③ — không hàng nào vi phạm được).

#### 5. Nhiệm vụ và điều kiện tốt nghiệp — Cấp 1

**5 nhiệm vụ**, theo migration **`4d8e6b2a1c93`** (bỏ «Xem lại danh mục», ⑥ «10 lệnh Thực chiến» xuống slot ⑤). **Toàn bộ 5 nhiệm vụ đều được SUY RA từ dữ liệu nguồn — không nhiệm vụ nào do client khai.**

| Mã task | Tên hiển thị | Điều kiện hoàn thành | Nguồn suy ra | Đóng ở đâu |
|---|---|---|---|---|
| `task_1_done_at` | ① Lệnh đầu có kế hoạch | hàng `order_kehoach` đầu tiên được ghi | `order_kehoach` | trong `POST /cap1/kehoach` |
| `task_2_done_at` | ② Bán + Kết sổ đầu tiên | hàng `order_ketso` đầu tiên được ghi | `order_ketso` | trong `POST /cap1/ketso` |
| `task_3_done_at` | ③ Đủ 5 lý do (không cần khớp) | `so_ly_do_da_dung >= 5` — COUNT DISTINCT `order_kehoach."lyDo"` của user | `order_kehoach` | `_recompute_counters` |
| `task_4_done_at` | ④ ≥3 lệnh lý do ✅ Ủng hộ | `so_lenh_ly_do_ung_ho >= 3` — COUNT `trangThai_luc_dat = 'ung_ho'` | `order_kehoach` | `_recompute_counters` |
| `task_5_done_at` | ⑤ 10 lệnh Thực chiến | `so_lenh_thuc_chien >= 10` — COUNT `virtual_orders` `mode='thuc_chien' AND status='FILLED'` (KHÔNG lọc side) | `virtual_orders` | `_recompute_counters` |

Ngưỡng trong source: `_TASK3_THRESHOLD = 5`, `_TASK4_THRESHOLD = 3`, `_TASK5_THRESHOLD = 10`.

**Điều kiện tốt nghiệp Cấp 1**: cả 5 `task_N_done_at` non-null. Thiếu → **409 `Chưa hoàn thành đủ 5 nhiệm vụ Cấp 1`**.

`da_xem_tour` được set `true` ngay lúc `enter` (chỉ vào được qua Cấp 0 đã tốt nghiệp ⇒ tour đã xem). Nó **không phải** điều kiện tốt nghiệp.

#### 6. Nhiệm vụ và điều kiện tốt nghiệp — Cấp 2

**2 nhiệm vụ LÀM SONG SONG**, theo migration **`8f1a5c7d2e64`** (từ 5 nhiệm vụ + bộ máy chuỗi kỷ luật xuống 2). Bảng `cap2_progress` do `f809de621bd0` tạo ra và `8f1a5c7d2e64` cắt gọn: **KHÔNG còn `task_3/4/5_done_at`, `chuoi_current`, `chuoi_record`, `last_chuoi_reset_at`.** Cả hai counter đều được **tính lại từ `order_kehoach`/`order_ketso` ở MỌI lần ghi** — không bao giờ tin counter từ client.

| Mã task | Tên hiển thị | Điều kiện hoàn thành | Cách đếm | Đóng ở đâu |
|---|---|---|---|---|
| `task_1_done_at` | ① 10 lệnh Thực chiến có đặt cắt lỗ / chốt lời | `so_lenh_co_cl_tp >= 10` | COUNT `order_kehoach` JOIN `virtual_orders`: `user`, `mode='thuc_chien'`, `side=BUY`, `status=FILLED`, `cat_lo IS NOT NULL`, `chot_loi IS NOT NULL`. **Không cửa sổ ngày** | `record_kehoach`, `record_ketso`, `PATCH /cap2/task` |
| `task_2_done_at` | ② Thực hiện đúng khi giá chạm mốc — 2 lần | `so_lan_thuc_hien_dung >= 2` | duyệt `order_ketso` của lệnh `thuc_chien` có `closed_at >= cap2_progress.entered_at`, **tối đa 1 lần/round trip** | như trên |

Ngưỡng: `_TASK1_TARGET_LENH = 10`, `_TASK2_TARGET_LAN = 2`.

Cách đếm ② (`_dem_thuc_hien_dung`), duyệt theo `closed_at` tăng dần:

1. Nếu `cham_SL_cat_dung_phien_ke === true` → tính là **cắt lỗ đúng** (`so_lan_cat_lo_dung++`), **`continue`** (chân SL thắng khi cả hai cùng khớp).
2. Ngược lại: tìm kế hoạch của chân MUA khớp → nếu `_is_chot_loi_dung` → **chốt lời đúng** (`so_lan_chot_loi_dung++`).

`_is_chot_loi_dung(ketso, kehoach)` = `kehoach != null` **AND** `kehoach.chot_loi != null` **AND** `ketso.gia_ra >= kehoach.chot_loi` **AND** `ketso.cham_TP_giu_lam_hut === false`.

**Bất biến phải giữ**: `so_lan_thuc_hien_dung === so_lan_cat_lo_dung + so_lan_chot_loi_dung` (khối ④ màn «Phân tích danh mục» render 🛑/🎯/✅ từ ba số này).

★ **Không nhiệm vụ nào gác nhiệm vụ kia** — ② có thể xong ở lệnh thứ 2 khi ① còn 2/10. Đó là toàn bộ ý nghĩa "làm song song". Test `test_task2_counts_a_cat_lo_and_a_chot_loi_and_finishes_before_task1` khoá điều này.

★ ① **được tính lại ngay ở `record_kehoach`, không chờ Kết sổ**: ① nói về việc ĐẶT mốc; 10 vị thế đang mở đều có cắt lỗ + chốt lời là đã xong nhiệm vụ, chờ Kết sổ sẽ đóng băng hành trình ở 0/10.

★ `task_N_done_at` một khi đã stamp thì **KHÔNG BAO GIỜ bị xoá**, kể cả khi counter tụt (chỉ xảy ra với dữ liệu sửa tay).

**Điều kiện tốt nghiệp Cấp 2**: `task_1_done_at` và `task_2_done_at` đều non-null. Thiếu → **409 `Chưa hoàn thành đủ 2 nhiệm vụ Cấp 2`**.

#### 7. Khoá chống gian lận tốt nghiệp — mô tả CHÍNH XÁC kiểm tra phía server

Từng có lỗ hổng «graduation fraud»: client tự khai nhiệm vụ xong rồi gọi `graduate`. Trạng thái server HIỆN TẠI (phải sao chép nguyên vẹn, đừng "cải tiến"):

**a) `PATCH /cap1/task` và `PATCH /cap2/task` KHÔNG stamp theo `task_no`.** Chúng validate `task_no` rồi **BỎ ĐI** và chỉ chạy lại phép đếm. Toàn bộ giá trị của endpoint là "xin tính lại". Docstring Cấp 1 nói thẳng: *"nó chỉ chạy lại phép đếm; `task_no` chỉ để hợp lệ hoá (1-5); mọi giá trị hợp lệ cho cùng kết quả"*. **Tuyệt đối KHÔNG viết `progress[\`task_${task_no}_done_at\`] = now`** — làm vậy là mở lại lỗ hổng nguyên vẹn.

**b) Mọi counter Cấp 1/Cấp 2 đều được đếm lại bằng SQL trên dữ liệu nguồn**, không nhận từ payload. Client không có field nào để gửi `so_lenh_thuc_chien` hay `so_lenh_co_cl_tp` — và nếu bản TS thêm, phải bỏ qua.

**c) `graduate` kiểm lại TOÀN BỘ điều kiện trên hàng progress đọc trong CÙNG transaction**, không tin trạng thái client đang thấy: đọc hàng → `all(task_N_done_at != null)` (+ `task4_debrief_done` với Cấp 0) → nếu không đủ thì 409 **trước khi ghi bất cứ gì** → chỉ khi đủ mới stamp `graduated_at` + `time_to_graduate_hours`.

**d) `graduate` là idempotent, không phải "ghi lại"**: `if progress.graduated_at is None` mới stamp. Gọi lần hai trả về đúng hàng cũ, `graduated_at`/`time_to_graduate_hours` **không đổi** (không được "làm mới" thời gian tốt nghiệp).

**e) ★ CẠM BẪY CÓ THẬT — `graduate` của Cấp 1 và Cấp 2 KHÔNG gọi recompute trước khi kiểm.** Nó chỉ đọc các stamp đã có. Nghĩa là một user vừa đủ 10 lệnh Thực chiến nhưng chưa có write nào chạy `_recompute_counters` sẽ có `task_5_done_at = null` → **409 dù thực chất đã đủ**. Đây là lý do FE phải `PATCH /capN/task` (ping recompute) trước khi mở nút tốt nghiệp. Bản viết lại **giữ nguyên** thứ tự này để hành vi không lệch; nếu muốn recompute trong `graduate`, phải coi là thay đổi hành vi có chủ ý và đặt recompute **TRƯỚC** phép kiểm (kiểm trước rồi recompute chính là hình dạng của lỗ hổng cũ).

**f) ★ Nói thẳng về Cấp 0: 4 nhiệm vụ Cấp 0 LÀ do client khai.** Server **không** kiểm có lệnh mua thật, không kiểm có lệnh bán thật, không đọc `virtual_orders` trong `complete_task`. Khoá phía server chỉ gồm ba thứ: (i) `task_no` phải trong 1-4; (ii) ②③ bị từ chối khi ① chưa xong; (iii) ④ **buộc** kèm `gate="debrief"`. Đây là mức bảo vệ hiện tại của Cấp 0 và tài liệu này không tô hồng nó. Nếu bản TS muốn siết (ví dụ ① đòi có ít nhất một `virtual_orders` BUY FILLED của user), đó là **thay đổi hành vi có chủ ý** phải ghi vào changelog — nhưng nó KHÔNG được làm ②③④ khó thử lại hơn hiện tại.

**g) ★ Ràng buộc ẩn của cổng Cấp 0**: `gate` được set **độc lập** với `task_no`. `PATCH {task_no:1, gate:"debrief"}` sẽ bật `task4_debrief_done = true` trong khi `task_4_done_at` vẫn null. Điều này **không** đủ để tốt nghiệp (vẫn thiếu `task_4_done_at`, mà muốn có nó lại phải gửi đúng `{task_no:4, gate:"debrief"}`), nhưng phải sao chép đúng vì FE dựa vào việc mở lại màn Kết sổ (retro-debrief) để thoát trạng thái kẹt.

#### 8. Ý nghĩa của NULL — «CHƯA BIẾT», KHÔNG phải 0

Đã có bug thật: giá trị "chưa biết" bị in ra thành `0`. Luật:

| Cột / field | `null` nghĩa là | **KHÔNG** được hiểu là |
|---|---|---|
| `task_N_done_at` | chưa hoàn thành nhiệm vụ đó | — |
| `graduated_at` | chưa tốt nghiệp | — |
| `time_to_graduate_hours` | chưa tốt nghiệp ⇒ chưa đo được | `0` giờ |
| `Cap0KehoachOut.gia_vao` | lệnh chưa khớp ⇒ **chưa có giá vào** | giá `0` ₫ |
| `Cap0KehoachOut.so_phien_giu` | **vị thế còn mở** ⇒ round trip chưa có độ dài. Kết sổ in `—` | `0` phiên (0 là giá trị THẬT: mua/bán trong cùng phiên) |
| `OrderKehoachOut.phuong_phap_sl_tp` / `cat_lo` / `chot_loi` (view Cấp 2) | lệnh **chưa** đi qua bước cắt lỗ/chốt lời của Cấp 2 (mọi lệnh thời Cấp 1 đều null) | mốc bằng `0` |
| `OrderKetsoOut.cam_xuc` | user chưa chọn cảm xúc | "không rõ" (`khong_ro` là giá trị THẬT user chọn được) |
| `giu_cham_SL_bao_nhieu_phien` | **chưa biết / không áp dụng** | `0` phiên |
| `DiemKyLuatOut.diem` | không chấm được (ngày không đặt lệnh nào) | `0` điểm |
| `DiemKyLuatOut.xep_loai` | không xếp loại được (ngày không có tình huống thử thách kỷ luật, dù `diem` có số) | `"do"` |
| `DiemKyLuatOut.thanh_phan` | không có gì để phân tích | breakdown toàn `0` |
| `GET /capN/progress` trả `null` | **user chưa vào cấp đó** | hàng progress rỗng với các số `0` |

★ Đặc biệt: `so_phien_giu = 0` và `so_phien_giu = null` là **hai chuyện khác nhau** và cả hai đều hợp lệ. `0` = mua và bán trong cùng phiên (ca phổ biến nhất ở Cấp 0). `null` = chưa bán.

★ Đặc biệt: `DiemKyLuatOut` có ba trạng thái, không hai: (a) `co_giao_dich=false` → `diem=null`; (b) `co_giao_dich=true, co_tinh_huong=false` → `diem` là **điểm thô 0-40 chưa chuẩn hoá**, `xep_loai=null`; (c) `co_tinh_huong=true` → `diem` đã chuẩn hoá 0-100 + `xep_loai`. Đừng gộp (a) với (b).

#### 9. `order_kehoach` / `order_ketso` dùng chung nhiều cấp — cột nào phân biệt cấp

Hai bảng này là **một bảng vật lý dùng chung cho Cấp 1 → Cấp 8**. Cấp 2-8 **không** tạo bảng mới; mỗi cấp thêm CỘT vào chính hai bảng đó (`app/models/cap1.py` có các block "Cấp 2 additions", "Cấp 3 additions"… tới "Cấp 8 additions").

**Không có cột `cap_level`.** Cấp được phân biệt bằng **cột nào đã được điền**:

| Bảng | Cột của Cấp 1 (NOT NULL) | Cột Cấp 2 thêm (nullable) |
|---|---|---|
| `order_kehoach` | `order_id` (UNIQUE), `"lyDo"`, `"trangThai_luc_dat"`, `vung_mua`, `co_bam_doc_chi_tiet` | `phuong_phap_sl_tp`, `cat_lo`, `chot_loi` |
| `order_ketso` | `order_id` (UNIQUE), `gia_ra`, `so_phien_giu`, `so_ngay_lich`, `pnl_pct`, `pnl_vnd`, `closed_at` | `cham_SL_cuoi_phien`, `cham_SL_cat_dung_phien_ke`, `cham_SL_khong_cat`, `giu_cham_SL_bao_nhieu_phien`, `cham_TP_giu_lam_hut`, `ban_som_khi_lo_nhe`, `nhoi_lenh_khi_lo` |

Suy luận cấp được dùng trong source:

- «lệnh này đã qua Cấp 2 chưa» = `cat_lo IS NOT NULL AND chot_loi IS NOT NULL`. `_so_lenh_co_cl_tp` **không cần cửa sổ ngày** vì hai cột đó chỉ có thể do `Cap2Service.record_kehoach` ghi, mà hàm đó **đòi có `cap2_progress`** — nên một kế hoạch thời Cấp 1 không bao giờ thoả được.
- Ngược lại, 7 cờ của `order_ketso` **có server_default `false`/`0`**, nên chúng KHÔNG phân biệt được cấp. Vì vậy ② của Cấp 2 phải dùng cửa sổ thời gian: `OrderKetso.closed_at >= Cap2Progress.entered_at`.

★ **Cấp 0 KHÔNG dùng hai bảng này.** Nó có bảng riêng `cap0_order_kehoach` (`order_id` UNIQUE + `ly_do_doi_thuong`). Bốn lý do (docstring `Cap0Service.record_kehoach`, migration `9a4c2f1e7b60`): (1) `order_kehoach."lyDo"` là enum NOT NULL trên 5 lý do PHÂN TÍCH — mở rộng nó cho phép một lệnh Cấp 1 bị xếp vào "Thấy trên mạng"; (2) `trangThai_luc_dat`/`vung_mua` NOT NULL → hàng Cấp 0 chỉ tồn tại được bằng cách BỊA một phán quyết AI Thanh tra mà user chưa từng thấy, rồi Cấp 1 đọc lại như thật; (3) `order_kehoach.order_id` là UNIQUE và `Cap1Service.record_kehoach` ném 409 khi đã có hàng → một hàng Cấp 0 sẽ **khoá vĩnh viễn** Form Kế hoạch Cấp 1 của cùng lệnh đó; (4) nhiệm vụ ③ Cấp 1 đếm DISTINCT `"lyDo"` → hàng Cấp 0 sẽ thổi phồng counter bằng một lý do user chưa từng chọn theo nghĩa phân tích. Hai chiều không thể đè nhau: Cấp 1 chỉ ghi `order_kehoach` và không bao giờ đọc/ghi `cap0_order_kehoach`. Test khoá: `tests/test_cap0.py::test_cap0_chip_cannot_collide_with_or_clobber_cap1_kehoach`.

#### 10. ★ Cơ chế cập nhật tiến độ sau khi ghi kehoach/ketso — LỖI ĐÃ SỬA, đừng lặp lại

Lỗi đã xảy ra (commit `7a057a3 fix(cap6/7/8-fe): kehoach POST không nuốt event bus`): một 500/timeout của `POST /capN/kehoach` **ném lỗi ra `catch` của `handleSubmit`** ở frontend. Hệ quả: lệnh ĐÃ khớp bị báo "Đặt lệnh MUA thất bại", form không reset (kế hoạch cũ dính sang lệnh sau), và **toàn bộ chuỗi `onOrderFilled` bị bỏ qua** — không cấp nào ghi được lệnh mua vào `lastBuyBySymbolRef`, nên khi user bán thì Kết sổ của MỌI cấp lặng lẽ không mở và lệnh không vào nhật ký. Đó là lỗi **frontend**, nhưng nó sinh ra từ một hình dạng API mà bản viết lại phải hiểu đúng:

**Sự thật về response:** `POST /cap0/kehoach`, `POST /cap1/kehoach`, `POST /cap1/ketso`, `POST /cap2/kehoach`, `POST /cap2/ketso` **KHÔNG trả về progress**. Chúng trả về hàng kehoach/ketso. Tiến độ được cập nhật **phía server, im lặng**:

| Endpoint | Ghi gì lên progress | Có recompute counter? |
|---|---|---|
| `POST /cap0/kehoach` | **KHÔNG GÌ CẢ** (nhiệm vụ ① Cấp 0 do `PATCH /cap0/task` đóng) | không |
| `POST /cap1/kehoach` | stamp `task_1_done_at` nếu null | **CÓ** — `_recompute_counters` (③④⑤) |
| `POST /cap1/ketso` | stamp `task_2_done_at` nếu null | **KHÔNG** ★ |
| `POST /cap2/kehoach` | không stamp trực tiếp | **CÓ** — `_recompute_progress` (①②) |
| `POST /cap2/ketso` | không stamp trực tiếp | **CÓ** — `_recompute_progress` (①②) |

**Vì vậy bản TS phải làm đúng ba điều:**

1. **Client BẮT BUỘC invalidate/refetch `GET /capN/progress` sau mỗi lần ghi kehoach/ketso** — response không mang progress nên không có cách nào khác. FE hiện tại làm bằng `queryClient.invalidateQueries({ queryKey: capNKeys.all })` trong `onSuccess` của mọi mutation (`dashboard/src/features/cap1/hooks.ts`).
2. **Mọi `POST /capN/kehoach` ở client phải là NON-FATAL**: lỗi của nó không được ném ra ngoài luồng "lệnh đã khớp" và không được chặn `onOrderFilled`. Lệnh đã khớp thật rồi; ghi kế hoạch thất bại là chuyện phụ, thử lại được.
3. **★ `POST /cap1/ketso` KHÔNG recompute** → nhiệm vụ ⑤ Cấp 1 (`so_lenh_thuc_chien`) **trễ đúng một lệnh bán** nếu client không ping. Commit `f74ceaa`/`0cda005` sửa đúng chỗ này ở FE: sau khi Kết sổ ghi thành công **thì mới** gọi `PATCH /cap1/task` để xin recompute (ping phải đi SAU khi ketso đã được ghi, không song song). Bản TS **giữ nguyên** server-side (không thêm recompute vào `record_ketso`) và **giữ nguyên** ping ở client — nếu đổi, phải đổi có chủ ý và ghi rõ.

#### 11. Placement (chỉ Cấp 0)

- **Câu hỏi đến từ đâu**: hoàn toàn từ **frontend**, hard-code trong `dashboard/src/features/cap0/PlacementModal.tsx`. Backend **không** phục vụ bộ câu hỏi nào — không có endpoint "lấy câu hỏi xếp lớp". Câu hỏi: *"Bạn đã từng mua bán cổ phiếu thật bao giờ chưa?"* với 3 đáp án: `never` — "Chưa bao giờ"; `unsure` — "Có, nhưng chưa tự tin"; `regular` — "Có, giao dịch thường xuyên". Bài test xếp lớp 5 phút của spec cũ **đã bị bỏ hẳn**.
- **Cách tính**: contract API chỉ nhận **một boolean** `has_traded_before`. FE map `never → false`, còn `unsure` và `regular` **đều gửi `true`**. Server: `placed_level = 2 if has_traded else 0`. **`placed_level` không bao giờ bằng 1** dù comment cột ghi `# 0/1/2`.
- **Ảnh hưởng**: upsert đúng một hàng `user_placement` (`user_id` UNIQUE, `has_traded_before`, `placed_level`). **Không cấp nào đọc lại bảng này.** Không service nào trong `cap0/cap1/cap2` truy vấn `UserPlacement` ngoài chính `set_placement`. Nó là dữ kiện phân tích + gợi ý điều hướng cho FE, **KHÔNG phải quyền vào cấp**: gửi `has_traded_before=true` **không** cho phép bỏ qua Cấp 0 — `POST /cap1/enter` vẫn đòi `cap0_progress.graduated_at != null`.
- **Làm lại được?** **Có, không giới hạn.** Trả lời lại ghi đè cả `has_traded_before` và `placed_level` (test `test_placement_maps_level` trả lời `false` rồi `true`). Không có audit/history của các lần trả lời trước.
- **Không cần `cap0_progress`**: `set_placement` không đọc hàng progress → gọi `placement` trước `enter` vẫn 200.

#### 12. Điểm kỷ luật (chỉ Cấp 2) — công thức đầy đủ

Thang **0-100**, chấm cho **một ngày**. `Cap2Service.diem_ky_luat`. Không persist ở đâu — tính tại thời điểm gọi.

**Ngày mặc định** = `datetime.now(UTC+7).date()` — múi giờ **Việt Nam (UTC+7)**, không phải UTC.

**Tập dữ liệu của ngày** (cả hai đều lọc `VirtualOrder.user_id`, `mode='thuc_chien'`, `trading_date == ngày`):
- `kehoach_rows` — `order_kehoach` JOIN `virtual_orders`;
- `ketso_rows` — `order_ketso` JOIN `virtual_orders` (⇒ theo `trading_date` của lệnh **BÁN**).

**Nếu cả hai rỗng** → `{co_giao_dich:false, co_tinh_huong:false, diem:null, xep_loai:null, giai_thich:"Ngày không đặt lệnh nào — không chấm điểm.", thanh_phan:null}`.

**4 thành phần (điểm THÔ, trước chuẩn hoá):**

| | Thành phần | Công thức | Tối đa |
|---|---|---|---|
| A | `ke_hoach` | `40 × ty_le_du`, với `ty_le_du` = (số `kehoach_rows` có ĐỦ `phuong_phap_sl_tp` **và** `cat_lo` **và** `chot_loi` non-null) / (tổng `kehoach_rows`). **Không có `kehoach_rows` nào → `ty_le_du = 1.0`** (không có gì để thiếu) | 40 |
| B | `cat_lo_dung` | `min(40, count(cham_SL_cat_dung_phien_ke === true) × 20)` | 40 |
| C | `khong_nhoi` | `min(30, count(nhoi_lenh_khi_lo === false) × 10)` | 30 |
| D | `chot_loi_dung` | `min(30, count(_is_chot_loi_dung(ketso, kehoach khớp)) × 10)` | 30 |

`co_tinh_huong = ketso_rows.length > 0`.

**Nhánh không có tình huống** (`co_tinh_huong === false`): `diem = A` — **điểm THÔ 0-40, KHÔNG chuẩn hoá**; `xep_loai = null`; `giai_thich = "Ngày không có tình huống thử thách kỷ luật — điểm tính theo phần kế hoạch (tối đa 40)."`; `thanh_phan` vẫn trả đủ.

**Nhánh có tình huống**: `raw = A+B+C+D`; `diem = clamp(raw / 140 × 100, 0, 100)` (mẫu số `_DIEM_RAW_MAX = 40+40+30+30 = 140`).

**Xếp loại**: `diem >= 85` → `xanh` / nhận xét `"Ngày kỷ luật cao"`; `diem >= 70` → `vang` / `"Ổn, còn 1-2 điểm chưa trọn"`; còn lại → `do` / `"Có vi phạm đáng chú ý"`.

**`giai_thich`** (format chuỗi nguyên văn, các số làm tròn 0 chữ số thập phân):
`"{nhận xét}: kế hoạch {A:.0f}/40 + cắt lỗ đúng {B:.0f}/40 + không nhồi {C:.0f}/30 + chốt lời đúng {D:.0f}/30."`

★ **Đặc tính thang điểm phải sao chép nguyên trạng**: một round trip duy nhất, hoàn hảo, đạt tối đa `40+20+10+10 = 80` thô → `80/140×100 ≈ 57.14` → **xếp loại `do`**. Test `test_diem_ky_luat_full_formula_with_test_situations` khoá chính con số này (`pytest.approx(80/140*100)`, `xep_loai == "do"`). Muốn tới `xanh` phải có ≥2 lần cắt lỗ đúng + ≥3 lệnh không nhồi + ≥3 lần chốt lời đúng trong CÙNG ngày. Đừng "sửa" mẫu số cho đẹp.

★ `diem-ky-luat` **không còn nằm trong hành trình Cấp 2** (mockup mới bỏ nó khỏi cả Hành trình lẫn Phân tích danh mục) nhưng endpoint **vẫn phải mount**: Cấp 3 tiêu thụ cùng phép tính này ở server (`Cap3Progress.diem_ky_luat_tb_cap3`) và các trang giao dịch Cấp 6/7 vẫn đọc endpoint này.

#### 13. Đếm phiên giao dịch — quy tắc chung của cả ba cấp

`_count_trading_sessions(start, end)` (bản Cấp 0 và bản Cấp 1 **giống nhau từng dòng**, cố ý copy chứ không import — Cấp 1 phụ thuộc Cấp 0, không được ngược lại):

- `end <= start` → **`0`**;
- ngược lại: đếm số ngày `d` với `start < d <= end` mà `is_trading_day(d, set())` → **chỉ luật Thứ 2-Thứ 6** (`d.weekday() < 5`), **KHÔNG có lịch nghỉ lễ** (tham số `holidays` được truyền `set()` rỗng).

⇒ Mua và bán cùng phiên = **0 phiên**, không phải 1. Mua Thứ 5 (2026-08-13), bán Thứ 2 (2026-08-17) = **2 phiên** (14/8 Thứ 6 + 17/8 Thứ 2), trong khi `so_ngay_lich = 4`.

★ Vì không có lịch lễ, `so_phien_giu` **sẽ đếm dư** các ngày lễ trong tuần (30/4, 2/9, Tết…). Đây là hành vi hiện tại; nếu bản TS muốn dùng lịch lễ thật thì đó là **thay đổi hành vi có chủ ý**.

★ `Cap0Service._find_matching_sell` và `Cap1Service._find_matching_buy` là **xấp xỉ một lô** (single-lot), vì tài khoản ảo dùng **giá bình quân**, không theo lô (`VirtualPosition`). Đủ tốt cho luồng "1 lệnh = 1 round trip" mà Cấp 0/1 dạy:
- `_find_matching_sell(buy)`: lệnh **BÁN** `FILLED` **SỚM NHẤT** cùng `account_id` + `symbol` có `created_at >= buy.created_at`;
- `_find_matching_buy(sell)`: lệnh **MUA** `FILLED` **GẦN NHẤT** cùng `account_id` + `symbol` có `created_at <= sell.created_at`.

★ `so_phien_giu` của Cấp 0 đo tới **lệnh BÁN**, tuyệt đối **không tới `now()`**: màn Kết sổ mở lại được nhiều ngày sau (`findRetroDebrief` tồn tại đúng vì thế), nên đo tới `now()` làm một round trip cùng phiên đọc lại vào Thứ 5 báo "3 phiên".

#### 14. Rate limit, request-id, và tầng lỗi dùng chung

- **Rate limit**: mặc định toàn app — `RATE_LIMIT_DEFAULT = "60/minute"` per-IP (`slowapi`, `key_func=get_remote_address`, `storage_uri="memory://"`, `SlowAPIMiddleware`). **Không endpoint nào trong chương này khai limit riêng.** Tắt khi `APP_ENV in ("testing","test")`.
- **`X-Request-ID`**: `RequestIDMiddleware` đặt ngoài cùng nên header này có trên **mọi** response, kể cả lỗi CORS pre-flight. Client nên gửi lên để trace.
- **401** cho mọi endpoint nếu thiếu/không hợp lệ Bearer: `{"detail":"Yêu cầu xác thực","code":"UNAUTHORIZED"}` + header `WWW-Authenticate: Bearer`. **403** `{"detail":"Tài khoản chưa được kích hoạt","code":"FORBIDDEN"}` nếu `user.is_active === false`. Hai lỗi này áp cho **cả 20 endpoint** và **không** lặp lại trong từng bảng lỗi dưới đây.
- **Không endpoint nào trong chương này dùng Redis cache.** Tất cả đọc/ghi Postgres trực tiếp.

---

## Cấp 0 «Nhập môn» — 7 endpoint

Router: `APIRouter(prefix="/cap0", tags=["Cấp 0"])`, mount dưới `/api/v1`.

Kiểu chung của cấp này:

~~~ts
/** GET /cap0/progress · POST /cap0/enter · PATCH /cap0/task · POST /cap0/graduate
 *  đều trả về đúng shape này (schema `Cap0ProgressOut`).
 *  ★ 4 nhiệm vụ + ĐÚNG MỘT cờ cổng. Test `test_cap0_endpoints_wired_and_free`
 *  khoá cả danh sách khoá: không được có task_5_done_at, task_6_done_at,
 *  task1_star_clicked, task5_sl_typed, task5_debrief_done, task6_debrief_done. */
interface Cap0ProgressOut {
  id: string;                       // uuid, PK cap0_progress
  user_id: string;                  // uuid
  entered_at: string;               // ISO-8601 có timezone
  virtual_balance_init: number;     // VND, BigInteger. Mặc định 100000000
  task_1_done_at: string | null;    // ① Đặt lệnh mua đầu tiên
  task_2_done_at: string | null;    // ② Xem tab Nắm giữ
  task_3_done_at: string | null;    // ③ Xem tab Theo dõi
  task_4_done_at: string | null;    // ④ Bán một lệnh — kết sổ đầu tiên
  task4_debrief_done: boolean;      // cổng hành vi DUY NHẤT (NOT NULL, default false)
  graduated_at: string | null;
  time_to_graduate_hours: number | null;  // giờ, số thực
}

/** POST /cap0/kehoach · GET /cap0/kehoach (schema `Cap0KehoachOut`).
 *  Chỉ `id`, `order_id`, `ly_do_doi_thuong` là dữ liệu ĐƯỢC LƯU; 5 field còn
 *  lại SUY RA LIVE từ `virtual_orders` mỗi lần đọc nên không bao giờ lệch với
 *  lệnh mà nó đang mô tả. */
interface Cap0KehoachOut {
  id: string;                       // uuid, PK cap0_order_kehoach
  order_id: string;                 // uuid lệnh MUA
  symbol: string;                   // suy ra: virtual_orders.symbol
  mode: string;                      // suy ra: "san_tap" | "thuc_chien" — BÁO CÁO, không lọc
  ly_do_doi_thuong: LyDoDoiThuong;  // slug đã lưu
  ly_do_label: string;              // nhãn nguyên văn §4, server map sẵn
  mua_luc: string;                  // suy ra: virtual_orders.created_at
  ngay_mua: string;                 // suy ra: virtual_orders.trading_date, "YYYY-MM-DD"
  gia_vao: number | null;           // suy ra: filled_price_vnd. null = chưa khớp
  so_phien_giu: number | null;      // suy ra tới lệnh BÁN khớp. null = còn mở
}
~~~

---

### GET /api/v1/cap0/progress

> **Tiến độ Cấp 0** — trả về hàng `cap0_progress` của user hiện tại, hoặc `null` nếu user chưa vào Cấp 0.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (`60/minute` per-IP) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `SELECT * FROM cap0_progress WHERE user_id = :me` |
| **Side-effect** | không (đọc thuần — **KHÔNG** tính lại, **KHÔNG** ghi DB) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `Cap0ProgressOut | null` (xem «Kiểu chung của cấp này»).

~~~ts
type Response = Cap0ProgressOut | null;
~~~

~~~json
{
  "id": "3f8a1c62-9b04-4d17-8e35-c07a6b2d9f41",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T02:14:33.508291+00:00",
  "virtual_balance_init": 100000000,
  "task_1_done_at": "2026-08-17T02:31:07.114882+00:00",
  "task_2_done_at": "2026-08-17T02:33:52.660415+00:00",
  "task_3_done_at": "2026-08-17T02:35:10.902733+00:00",
  "task_4_done_at": null,
  "task4_debrief_done": false,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| — | — | Không có lỗi nghiệp vụ. Chưa vào cấp → **200 với body `null`**, KHÔNG phải 404 | — |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài, không phụ thuộc giờ giao dịch. Chưa có hàng → `200 null`. Frontend phải phân biệt `null` («chưa vào Cấp 0» → hiện màn Cửa vào + `PlacementModal`) với một hàng có toàn số 0.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap0/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8c1f2a47-6d09-4b53-9e18-a3f70c65d2b4'
~~~

**Ghi chú khi viết lại**

- `response_model=Cap0ProgressOut | None` ⇒ **body là literal `null`**, không phải `{}` và không phải 204.
- **KHÔNG thêm recompute vào endpoint này.** Cấp 3 có `GET /progress` tính-lại-rồi-ghi-DB; Cấp 0/1/2 **không**. Đừng "đồng bộ hoá" ba cấp này với Cấp 3.
- `virtual_balance_init` là **hằng số ghi lúc `enter`** (100.000.000 ₫), **không phải số dư hiện tại**. Số dư hiện tại lấy từ API giao dịch ảo.
- `time_to_graduate_hours` là **giờ** (float), không phải giây/phút.

---

### POST /api/v1/cap0/enter

> **Vào Cấp 0** — tạo hàng tiến độ (idempotent) và seed tài khoản giao dịch ảo 100.000.000 ₫ nếu user chưa có tài khoản nào.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | INSERT `cap0_progress` (nếu chưa có) · INSERT `virtual_trading_accounts` (nếu user chưa có tài khoản) |

**Path params** — —

**Query params** — —

**Request body** — Không có body. (Gửi `{}` cũng được — endpoint không khai `body`.)

**Response 200** — `Cap0ProgressOut`.

~~~ts
type Response = Cap0ProgressOut;
~~~

~~~json
{
  "id": "3f8a1c62-9b04-4d17-8e35-c07a6b2d9f41",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T02:14:33.508291+00:00",
  "virtual_balance_init": 100000000,
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "task_4_done_at": null,
  "task4_debrief_done": false,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| — | — | Không có nhánh lỗi nghiệp vụ. Không tiên quyết cấp dưới, không 409 khi gọi lại | — |

**Fallback / suy giảm** — Gọi lại nhiều lần **luôn** trả về đúng hàng cũ (`entered_at` không đổi). Nếu user **đã có** tài khoản giao dịch ảo (kể cả với `initial_cash_vnd` khác 100tr) thì **KHÔNG seed lại và KHÔNG nạp thêm tiền**. Nếu hàng `cap0_progress` đã có nhưng tài khoản bị xoá, lần gọi sau sẽ seed lại tài khoản (hai nhánh độc lập).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap0/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4d6b90e1-2f7c-4a85-b3d6-51e9c7af08b2'
~~~

**Ghi chú khi viết lại**

- Hằng số: `_CAP0_INITIAL_CASH_VND = 100_000_000` (VND, **đồng**, không phải nghìn đồng). Dùng cho **cả** `cap0_progress.virtual_balance_init` **và** `initial_cash_vnd` của tài khoản mới.
- Tài khoản mới (`VirtualTradingRepository.create_account`): `status = ACTIVE`, `cash_available_vnd = 100_000_000`, `cash_reserved_vnd = 0`, `cash_pending_vnd = 0`, `activated_at = now()`.
- **Thứ tự trong source**: tạo/đọc progress **trước**, seed tài khoản **sau**. Cả hai trong cùng transaction của request.
- Idempotency dựa vào `UNIQUE(user_id)` trên `cap0_progress` (`uq_cap0_progress_user_id`) — giữ constraint này, đừng chỉ dựa vào `SELECT` rồi `INSERT` (race hai request song song).
- ★ Không có cổng `CAP_MAX_ENABLED`, không có kiểm placement. Ai đã đăng nhập và active đều vào được Cấp 0.

---

### POST /api/v1/cap0/placement

> **Câu hỏi xếp lớp** — ghi nhận một câu trả lời boolean «đã từng giao dịch thật chưa» và trả về cấp được gợi ý.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — tính toán thuần (`placed_level = 2 if has_traded else 0`) |
| **Side-effect** | UPSERT `user_placement` (một hàng/user, `uq_user_placement_user_id`) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface PlacementRequest {
  /** Bắt buộc. FE map: "Chưa bao giờ" → false; "Có, nhưng chưa tự tin" và
   *  "Có, giao dịch thường xuyên" → CẢ HAI đều true (contract chỉ có 1 bit). */
  has_traded_before: boolean;
}
~~~

~~~json
{ "has_traded_before": true }
~~~

**Response 200**

~~~ts
interface PlacementResponse {
  /** Chỉ có thể là 0 hoặc 2. KHÔNG BAO GIỜ là 1 (dù comment cột ghi "0/1/2"). */
  placed_level: 0 | 2;
}
~~~

~~~json
{ "placed_level": 2 }
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — (`HTTPValidationError`) | Thiếu `has_traded_before`, hoặc không phải boolean | `[{"loc":["body","has_traded_before"],"msg":"Field required","type":"missing"}]` |

**Fallback / suy giảm** — Không có nhánh suy giảm. **Không đòi** `cap0_progress` (gọi trước `enter` vẫn 200). Trả lời lại **ghi đè** hàng cũ, không giới hạn số lần, không lưu lịch sử các lần trước.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap0/placement' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9e35b781-04ca-4f62-8b17-d6a29c05f3e8' \
  -d '{"has_traded_before": true}'
~~~

**Ghi chú khi viết lại**

- ★ **`placed_level` KHÔNG cấp quyền gì.** Không service nào của Cấp 0/1/2 đọc `user_placement`. `placed_level = 2` **không** cho phép bỏ qua Cấp 0: `POST /cap1/enter` vẫn đòi `cap0_progress.graduated_at != null`, `POST /cap2/enter` vẫn đòi Cấp 1 tốt nghiệp. Đây là dữ kiện phân tích + gợi ý điều hướng FE.
- ★ **Trần xếp lớp bị kẹp bởi `CAP_MAX_ENABLED` ở phía FE**: spec §3 viết nhánh thứ ba là "→ Cấp 2 «Kỷ luật»", nhưng copy trên `PlacementModal.tsx` chỉ hứa tới Cấp 1 khi Cấp 2 chưa mở. Backend **không** liên quan; đừng suy ra logic server từ câu chữ modal.
- Modal ở FE **không có đường thoát** (`closable=false`, `maskClosable=false`, `escToExit=false`, không footer) — user buộc chọn một đáp án. Vì thế endpoint này phải **luôn** trả 200 nhanh; một lỗi ở đây làm user kẹt ở cửa vào.
- Union 3 nhánh (`never`/`unsure`/`regular`) được giữ ở FE để sau này mở contract 3 mức chỉ cần đổi chỗ gọi API. Nếu bản TS mở rộng contract, **giữ tương thích ngược** với `has_traded_before: boolean`.
- Nếu tách bảng: giữ `has_traded_before` **và** `placed_level` (cả hai NOT NULL). Đừng chỉ lưu `placed_level` — mất câu trả lời gốc là mất dữ kiện.

---

### PATCH /api/v1/cap0/task

> **Đánh dấu nhiệm vụ Cấp 0** — đóng một trong 4 nhiệm vụ (idempotent) và/hoặc bật cổng hành vi `debrief`.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `cap0_progress` (`task_N_done_at`, `task4_debrief_done`) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap0TaskRequest {
  /** 1-4. Pydantic `Field(ge=1, le=4)` ⇒ ngoài khoảng là 422 (KHÔNG phải 400). */
  task_no: 1 | 2 | 3 | 4;
  /** Chỉ nhận "debrief" hoặc bỏ trống. BẮT BUỘC khi task_no = 4.
   *  "sl_typed" và "star" đã bị xoá khỏi Cấp 0 ⇒ gửi lên là 422. */
  gate?: Cap0Gate | null;
}
~~~

~~~json
{ "task_no": 4, "gate": "debrief" }
~~~

**Response 200** — `Cap0ProgressOut` (trạng thái tiến độ **sau** khi cập nhật).

~~~ts
type Response = Cap0ProgressOut;
~~~

~~~json
{
  "id": "3f8a1c62-9b04-4d17-8e35-c07a6b2d9f41",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T02:14:33.508291+00:00",
  "virtual_balance_init": 100000000,
  "task_1_done_at": "2026-08-17T02:31:07.114882+00:00",
  "task_2_done_at": "2026-08-17T02:33:52.660415+00:00",
  "task_3_done_at": "2026-08-17T02:35:10.902733+00:00",
  "task_4_done_at": "2026-08-17T07:48:26.331904+00:00",
  "task4_debrief_done": true,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự kiểm** trong `Cap0Service.complete_task`:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | (Pydantic, trước service) `task_no` ngoài 1-4, hoặc `gate` khác `"debrief"`/`null` | `HTTPValidationError` |
| 1 | 400 | `BAD_REQUEST` | `task_no` ngoài `(1,2,3,4)` — chỉ chạm được khi gọi trực tiếp service | `task_no không hợp lệ (Cấp 0 có 4 nhiệm vụ)` |
| 2 | 400 | `BAD_REQUEST` | `gate` non-null nhưng không phải `"debrief"` — cùng lý do trên | `gate không hợp lệ` |
| 3 | 400 | `BAD_REQUEST` | `task_no = 4` mà `gate != "debrief"` (kể cả thiếu `gate`) | `Nhiệm vụ 4 chỉ hoàn thành khi đóng màn Kết sổ (cần gate="debrief")` |
| 4 | 404 | `NOT_FOUND` | Chưa có hàng `cap0_progress` | `Không tìm thấy tiến trình Cấp 0` |
| 5 | 400 | `BAD_REQUEST` | `task_no ∈ {2,3}` mà `task_1_done_at` còn `null` | `Nhiệm vụ 2 chỉ tính sau khi hoàn thành nhiệm vụ ① (đặt lệnh mua đầu tiên)` (số 2/3 nội suy theo `task_no`) |

**Fallback / suy giảm** — **Idempotent hai chiều**: gọi lại cùng `task_no` **không** ghi đè timestamp cũ (`if getattr(progress, done_attr) is None`), nên thời điểm hoàn thành thật được giữ. Nếu ②/③ bị 400 vì ① chưa xong thì **không sao**: FE bắn ②③ từ sự kiện MỞ TAB (lặp lại), nên lần mở tab sau khi mua sẽ tự ghi nhận — client **không được** hiện lỗi đỏ cho nhánh này. Endpoint không phụ thuộc provider ngoài, không phụ thuộc giờ giao dịch.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap0/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2b47d1f9-8e60-4c35-a17b-903fd6c2e548' \
  -d '{"task_no": 4, "gate": "debrief"}'
~~~

**Ghi chú khi viết lại**

- ★ **Thứ tự kiểm là quan trọng và dễ làm sai**: kiểm `gate` bắt buộc của ④ chạy **TRƯỚC** khi đọc hàng progress. Nên `PATCH {task_no:4}` (thiếu gate) của user **chưa vào cấp** trả **400** (thông điệp về gate), **không phải 404**. Đừng đảo hai bước này.
- ★ **`gate` được set độc lập với `task_no`**: `{task_no:1, gate:"debrief"}` bật `task4_debrief_done = true` trong khi `task_4_done_at` vẫn null. Sao chép nguyên hành vi (xem «Khoá chống gian lận», điểm g).
- ★ **①②③ gọi trần**, không kèm `gate`. Chỉ ④ có gate bắt buộc (`_TASK_REQUIRED_GATE = {4: "debrief"}`).
- Server **KHÔNG** kiểm có lệnh mua/bán thật. Nhiệm vụ Cấp 0 là client-khai (xem «Khoá chống gian lận», điểm f). Đừng viết tài liệu FE như thể server đã xác minh.
- Timestamp ghi bằng `datetime.now(UTC)` — **UTC**, có timezone. Đừng ghi naive datetime (`graduate` phải tính hiệu với `entered_at`).
- `_GATE_ATTR = {"debrief": "task4_debrief_done"}` — chỉ một phần tử. Nếu bản TS thêm gate mới thì phải cập nhật cả schema `gate` (union literal) lẫn phép kiểm tốt nghiệp.

---

### POST /api/v1/cap0/kehoach

> **Ghi chip «lý do đời thường»** — lưu (hoặc ghi đè) một trong 5 chip của khối «Kế hoạch» Cấp 0 cho một lệnh MUA.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `cap0_order_kehoach` + đọc `virtual_orders` để kiểm quyền và dựng read model |
| **Side-effect** | INSERT **hoặc** UPDATE `cap0_order_kehoach` (upsert theo `order_id`). **KHÔNG chạm `cap0_progress`** |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap0KehoachRequest {
  /** uuid của lệnh MUA (`virtual_orders.id`) — phải thuộc user gọi. */
  order_id: string;
  /** Nhận CẢ HAI dạng: slug ("thu_cho_biet") HOẶC nhãn nguyên văn §4
   *  ("Thử cho biết"). Server `.strip()` rồi thử nhãn trước, slug sau.
   *  Luôn LƯU dưới dạng slug. */
  ly_do_doi_thuong: LyDoDoiThuong | string;
}
~~~

~~~json
{
  "order_id": "7a4c2e18-6b05-4f93-8d21-e5c907b3fa64",
  "ly_do_doi_thuong": "Công ty tôi biết"
}
~~~

**Response 200** — `Cap0KehoachOut` (chip vừa ghi + toàn bộ dữ liệu suy ra từ chính lệnh đó).

~~~ts
type Response = Cap0KehoachOut;
~~~

~~~json
{
  "id": "c05f9a37-1d84-4e62-b7a0-3f6182dc45e9",
  "order_id": "7a4c2e18-6b05-4f93-8d21-e5c907b3fa64",
  "symbol": "VCB",
  "mode": "san_tap",
  "ly_do_doi_thuong": "cong_ty_toi_biet",
  "ly_do_label": "Công ty tôi biết",
  "mua_luc": "2026-08-13T02:07:41.882094+00:00",
  "ngay_mua": "2026-08-13",
  "gia_vao": 61800,
  "so_phien_giu": null
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự kiểm** trong `Cap0Service.record_kehoach`:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | Thiếu `order_id`/`ly_do_doi_thuong`, hoặc `order_id` không phải uuid | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap0_progress` | `Không tìm thấy tiến trình Cấp 0` |
| 2 | 400 | `BAD_REQUEST` | `ly_do_doi_thuong` không khớp slug **và** không khớp nhãn nguyên văn | `ly_do_doi_thuong không hợp lệ` |
| 3 | 404 | `NOT_FOUND` | Lệnh không tồn tại **hoặc** `order.user_id != me` (lệnh của người khác **cũng** 404, không 403 — không tiết lộ sự tồn tại) | `Không tìm thấy lệnh` |
| 4 | 400 | `BAD_REQUEST` | `order.side != BUY` | `Kế hoạch Cấp 0 chỉ ghi cho lệnh MUA` |
| 5 | 404 | `NOT_FOUND` | (chỉ về mặt lý thuyết) view vừa ghi đọc lại ra `null` — `# pragma: no cover` | `Không tìm thấy kế hoạch Cấp 0` |

**Fallback / suy giảm** — **Gọi lại cho cùng `order_id` là UPSERT, KHÔNG 409**: FE ghi chip ở thời điểm khớp lệnh và một lần retry **không được** dồn user vào ngõ cụt. Lệnh **chưa khớp** vẫn ghi được chip (không kiểm `status`), khi đó `gia_vao = null`. Vị thế còn mở → `so_phien_giu = null` (Kết sổ in `—`). **Client phải bọc lời gọi này NON-FATAL**: lỗi ở đây không được chặn luồng "lệnh đã khớp" (xem «Nghiệp vụ nền» mục 10).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap0/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e1a58c76-3204-4bd9-9f61-7c85a0d2fe33' \
  -d '{"order_id":"7a4c2e18-6b05-4f93-8d21-e5c907b3fa64","ly_do_doi_thuong":"Công ty tôi biết"}'
~~~

**Ghi chú khi viết lại**

- ★★ **TUYỆT ĐỐI KHÔNG lọc theo `order.mode`.** Đã từng gate `mode == "san_tap"` và điều đó **400 mọi write của user đang trả tiền** (FE bọc non-fatal nên im lặng) rồi lọc mất read của họ ⇒ Kết sổ của họ hiện `Lý do mua —` mãi mãi. Cấp 0 miễn phí và mở cho **cả** người đang trả tiền, mà lệnh của họ là `thuc_chien`. `mode` **vẫn được trả về** trên response (sự thật về lệnh) nhưng **không bao giờ** quyết định hiển thị. Test khoá: `test_cap0_kehoach_works_for_a_premium_subscriber_whose_orders_are_thuc_chien`.
- ★ **Không dùng bảng `order_kehoach` của Cấp 1.** Bảng riêng `cap0_order_kehoach` — 4 lý do ở «Nghiệp vụ nền» mục 9.
- ★ **`mode` và thời điểm mua KHÔNG được lưu trong `cap0_order_kehoach`.** Chúng đã có trên `virtual_orders` (`mode`/`created_at`/`trading_date`) và được suy ra khi đọc, nên không bao giờ lệch với lệnh chúng mô tả. Đừng "tối ưu" bằng cách denormalize.
- Parse `ly_do_doi_thuong`: `.strip()` → tra **bảng nhãn nguyên văn trước** (`_LY_DO_BY_LABEL`) → rồi thử **slug** → nếu cả hai fail thì 400. Chấp nhận cả hai dạng nghĩa là một lần sửa copy ở bất kỳ phía nào cũng không âm thầm làm rơi chip. So khớp nhãn là **chính xác từng ký tự** (kể cả dấu tiếng Việt), không case-insensitive.
- Endpoint gọi `record_kehoach` **rồi** `get_kehoach_view` (hai truy vấn) để response luôn mang dữ liệu suy ra tươi. Giữ nguyên hai bước — trả thẳng hàng vừa ghi sẽ thiếu `symbol`/`mode`/`gia_vao`/`so_phien_giu`.

---

### GET /api/v1/cap0/kehoach

> **Đọc chip của một lệnh** — trả về chip đã ghi cộng `Giá vào` / `Thời gian giữ` suy ra từ CHÍNH lệnh đó, cho màn Kết sổ §5.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `cap0_order_kehoach` JOIN `virtual_orders` (+ 1 truy vấn tìm lệnh BÁN khớp) |
| **Side-effect** | không |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `order_id` | `string` (uuid) | **Có** | — | `format: uuid`; `Query()` không có default ⇒ thiếu là 422 | uuid lệnh MUA cần đọc chip. **Khoá theo LỆNH, không theo mã** |

**Request body** — —

**Response 200** — `Cap0KehoachOut | null`.

~~~ts
type Response = Cap0KehoachOut | null;
~~~

~~~json
{
  "id": "c05f9a37-1d84-4e62-b7a0-3f6182dc45e9",
  "order_id": "7a4c2e18-6b05-4f93-8d21-e5c907b3fa64",
  "symbol": "VCB",
  "mode": "san_tap",
  "ly_do_doi_thuong": "cong_ty_toi_biet",
  "ly_do_label": "Công ty tôi biết",
  "mua_luc": "2026-08-13T02:07:41.882094+00:00",
  "ngay_mua": "2026-08-13",
  "gia_vao": 61800,
  "so_phien_giu": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 422 | — | Thiếu `order_id` hoặc không phải uuid | `HTTPValidationError` |
| — | — | Lệnh không tồn tại / không phải của user / chưa ghi chip → **200 `null`**, KHÔNG 404 | — |

**Fallback / suy giảm** — Chưa ghi chip, lệnh của người khác, hay `order_id` bịa ⇒ **`200 null`** và màn Kết sổ **để trống**, tuyệt đối không bịa số. Vị thế còn mở (không có lệnh BÁN `FILLED` nào ở/sau lệnh mua) ⇒ `so_phien_giu = null` → in `—`. Lệnh chưa khớp ⇒ `gia_vao = null`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap0/kehoach?order_id=7a4c2e18-6b05-4f93-8d21-e5c907b3fa64' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5f80c937-a2e4-41db-8756-b09fe1c4d2a7'
~~~

**Ghi chú khi viết lại**

- ★★ **Khoá theo `order_id`, KHÔNG theo `symbol`.** Bản đọc theo mã cũ (`/kehoach/latest`) luôn trả lệnh mua MỚI NHẤT của mã — có thể là một vị thế khác đang mở — nên `Lý do mua`/`Thời gian giữ` nói về một lệnh khác với `Giá vào`/`Giá ra` in ngay cạnh nó. Kịch bản khoá bằng test: mua VNM Thứ 2 (chip A) → bán Thứ 3 → mua VNM lại Thứ 4 (chip B) → bán Thứ 5. Đọc theo lệnh Thứ 2 phải ra **chip A, `gia_vao` Thứ 2, `so_phien_giu = 1`**; đọc theo lệnh Thứ 4 ra **chip B, `so_phien_giu = 1`**. Đừng để lệnh vào lại đè lên câu trả lời của round trip trước.
- ★ Round trip Thứ 2 được đóng bởi lệnh bán **ĐẦU TIÊN ở/sau nó**, không phải lệnh bán cuối cùng (`_find_matching_sell` = `ORDER BY created_at ASC LIMIT 1`).
- ★ `so_phien_giu` đo **tới lệnh BÁN**, không tới `now()` (xem «Nghiệp vụ nền» mục 13).
- Phân quyền nằm trong **chính câu JOIN** (`VirtualOrder.user_id == me`), không phải bước kiểm sau. Giữ cách này để không có đường rò dữ liệu.
- Response là `Cap0KehoachOut | None` ⇒ literal `null`.

---

### POST /api/v1/cap0/graduate

> **Tốt nghiệp Cấp 0** — chốt tốt nghiệp khi đủ 4/4 nhiệm vụ **và** cổng hành vi `debrief`.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | UPDATE `cap0_progress.graduated_at` + `time_to_graduate_hours` (chỉ lần đầu). **KHÔNG** tạo hàng Cấp 1, **KHÔNG** gửi email/Telegram, **KHÔNG** ghi audit log |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap0ProgressOut` (đã có `graduated_at`).

~~~ts
type Response = Cap0ProgressOut;
~~~

~~~json
{
  "id": "3f8a1c62-9b04-4d17-8e35-c07a6b2d9f41",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T02:14:33.508291+00:00",
  "virtual_balance_init": 100000000,
  "task_1_done_at": "2026-08-17T02:31:07.114882+00:00",
  "task_2_done_at": "2026-08-17T02:33:52.660415+00:00",
  "task_3_done_at": "2026-08-17T02:35:10.902733+00:00",
  "task_4_done_at": "2026-08-17T07:48:26.331904+00:00",
  "task4_debrief_done": true,
  "graduated_at": "2026-08-17T07:49:02.775618+00:00",
  "time_to_graduate_hours": 5.575907
}
~~~

**Lỗi**

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap0_progress` | `Không tìm thấy tiến trình Cấp 0` |
| 2 | 409 | `CONFLICT` | Thiếu bất kỳ `task_1..4_done_at` **hoặc** `task4_debrief_done === false` | `Chưa hoàn thành đủ nhiệm vụ và cổng Cấp 0` |

**Fallback / suy giảm** — **Idempotent**: gọi lại sau khi đã tốt nghiệp trả về đúng hàng cũ, `graduated_at` và `time_to_graduate_hours` **không bị ghi lại**. Không phụ thuộc provider ngoài, tốt nghiệp được **ngoài giờ giao dịch** và cuối tuần.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap0/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: a7c3e594-1802-4f6b-bd75-3e91c0a24f68'
~~~

**Ghi chú khi viết lại**

- ★ **Kiểm ĐỦ CẢ HAI**: `all(task_1..4_done_at != null)` **AND** `task4_debrief_done`. Bỏ cổng ra khỏi phép kiểm là mở lại lỗ hổng: `task4_debrief_done` là bằng chứng duy nhất user đã **đóng** màn Kết sổ.
- ★ **Kiểm rồi mới ghi**, trong cùng transaction, dựa trên hàng vừa `SELECT` — không tin trạng thái client đang thấy.
- `time_to_graduate_hours = (now - entered_at).total_seconds() / 3600.0` — đơn vị **GIỜ**, số thực. `entered_at` naive (không tz) phải được coi là **UTC** trước khi trừ (`entered.replace(tzinfo=UTC)`) — nếu không sẽ nổ `TypeError` khi trừ aware/naive. Bản TS dùng Date/`Temporal` cũng phải xử lý cùng giả định.
- Không tự tạo hàng Cấp 1. FE gọi `POST /cap1/enter` sau khi thấy `graduated_at` (và theo `capFlags.ts` thì Cấp 1 **luôn mở** nên nhánh này không bị trần cấp chặn).

---

## Cấp 1 «Học việc» — 6 endpoint

Router: `APIRouter(prefix="/cap1", tags=["Cấp 1"])`. **Có cả `kehoach` và `ketso`**, **không có** `placement`, **không có** `GET /kehoach`, **không có** endpoint riêng nào khác.

Kiểu chung của cấp này:

~~~ts
/** GET /cap1/progress · POST /cap1/enter · PATCH /cap1/task · POST /cap1/graduate
 *  (schema `Cap1ProgressOut`). 5 nhiệm vụ. ★ KHÔNG có `task_6_done_at` và
 *  KHÔNG có `so_lan_xem_danh_muc` — migration 4d8e6b2a1c93 đã xoá cùng nhiệm vụ
 *  «Xem lại danh mục». */
interface Cap1ProgressOut {
  id: string;                    // uuid, PK cap1_progress
  user_id: string;               // uuid
  entered_at: string;            // ISO-8601 có timezone
  /** Set true ngay lúc enter (chỉ vào được qua Cấp 0 đã tốt nghiệp ⇒ tour đã
   *  xem). KHÔNG phải điều kiện tốt nghiệp. */
  da_xem_tour: boolean;
  task_1_done_at: string | null; // ① lệnh đầu có kế hoạch
  task_2_done_at: string | null; // ② bán + Kết sổ đầu tiên
  task_3_done_at: string | null; // ③ đủ 5 lý do
  task_4_done_at: string | null; // ④ ≥3 lệnh lý do ✅ Ủng hộ
  task_5_done_at: string | null; // ⑤ 10 lệnh Thực chiến
  so_ly_do_da_dung: number;      // 0-5, COUNT DISTINCT order_kehoach."lyDo"
  so_lenh_ly_do_ung_ho: number;  // COUNT trangThai_luc_dat = 'ung_ho'
  so_lenh_thuc_chien: number;    // COUNT virtual_orders mode='thuc_chien' AND FILLED
  graduated_at: string | null;
  time_to_graduate_hours: number | null;  // giờ
}

/** POST /cap1/kehoach (schema `app__schemas__cap1__OrderKehoachOut`).
 *  ★ Đây là VIEW CỦA CẤP 1 trên bảng `order_kehoach` dùng chung — nó KHÔNG trả
 *  các cột Cấp 2-8 (cat_lo, chot_loi, khau_vi, doc_5_lop…). */
interface Cap1OrderKehoachOut {
  id: string;                       // uuid, PK order_kehoach
  order_id: string;                 // uuid lệnh MUA (UNIQUE)
  lyDo: LyDo;                       // ★ tên field mixedCase NGUYÊN VĂN spec §9
  trangThai_luc_dat: TrangThaiLucDat; // ★ mixedCase NGUYÊN VĂN
  vung_mua: number;                 // VND/cổ phiếu, BigInteger, > 0
  co_bam_doc_chi_tiet: boolean;
  snapshot_lop_du_lieu: Record<string, unknown> | null;  // JSON tự do
}

/** POST /cap1/ketso (schema `app__schemas__cap1__OrderKetsoOut`).
 *  ★ VIEW CỦA CẤP 1 — không trả 7 cờ kỷ luật Cấp 2 hay 5 cột verdict Cấp 5. */
interface Cap1OrderKetsoOut {
  id: string;             // uuid, PK order_ketso
  order_id: string;       // uuid lệnh BÁN (UNIQUE)
  gia_ra: number;         // VND/cổ phiếu = sell.filled_price_vnd (null → 0)
  so_phien_giu: number;   // phiên T2-T6, 0 = cùng phiên
  so_ngay_lich: number;   // ngày dương lịch giữa 2 trading_date
  pnl_pct: number;        // PHẦN TRĂM, không phải tỷ lệ. 2.34 = +2.34%
  pnl_vnd: number;        // VND, đã trừ phí/thuế (dùng net_amount_vnd)
  cam_xuc: CamXuc | null; // null = user chưa chọn
  closed_at: string;      // ISO-8601, thời điểm GHI kết sổ (không phải khớp lệnh)
}
~~~

---

### GET /api/v1/cap1/progress

> **Tiến độ Cấp 1** — trả về hàng `cap1_progress` của user hiện tại, hoặc `null` nếu chưa vào Cấp 1.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `SELECT * FROM cap1_progress WHERE user_id = :me` |
| **Side-effect** | không (đọc thuần — **KHÔNG** tính lại, **KHÔNG** ghi DB) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `Cap1ProgressOut | null`.

~~~ts
type Response = Cap1ProgressOut | null;
~~~

~~~json
{
  "id": "8d2f5a10-4c76-4b93-9e08-1a63cf7d2b45",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T08:02:11.409377+00:00",
  "da_xem_tour": true,
  "task_1_done_at": "2026-08-17T08:19:44.201553+00:00",
  "task_2_done_at": "2026-08-18T06:41:12.884930+00:00",
  "task_3_done_at": null,
  "task_4_done_at": null,
  "task_5_done_at": null,
  "so_ly_do_da_dung": 3,
  "so_lenh_ly_do_ung_ho": 2,
  "so_lenh_thuc_chien": 6,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| — | — | Không có lỗi nghiệp vụ. Chưa vào cấp → **200 `null`** | — |

**Fallback / suy giảm** — `200 null` khi chưa vào Cấp 1 (FE hiện màn Cửa vào Cấp 1). ★ **Các counter trong body có thể CŨ**: chúng chỉ được cập nhật ở `POST /cap1/kehoach`, `POST /cap1/ketso` (chỉ ②) và `PATCH /cap1/task`. Muốn số tươi thì client phải `PATCH /cap1/task` **trước**, rồi mới đọc — hoặc dùng luôn body trả về từ `PATCH`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap1/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 60f1a8d3-72b5-4c09-8e46-df3a15c7920b'
~~~

**Ghi chú khi viết lại**

- ★ **KHÔNG recompute ở đây** (khác Cấp 3, nơi `GET /progress` tính lại và ghi DB). Giữ nguyên để `GET` là idempotent thật và không nuốt write vào một request đọc.
- 3 counter là **cột đã lưu** trên `cap1_progress`, không phải subquery. Chúng là **bản sao suy ra** — nguồn sự thật là `order_kehoach`/`virtual_orders`. Đừng để client sửa được chúng.
- `so_ly_do_da_dung` tối đa **5** (chỉ có 5 giá trị `LyDo`). Nếu bản TS thấy > 5 thì có bug ở phép DISTINCT.

---

### POST /api/v1/cap1/enter

> **Vào Cấp 1** — tạo hàng tiến độ Cấp 1 (idempotent); bắt buộc đã tốt nghiệp Cấp 0.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — đọc `cap0_progress`, ghi `cap1_progress` |
| **Side-effect** | INSERT `cap1_progress` (nếu chưa có), với `da_xem_tour = true`. **KHÔNG** seed tài khoản (tài khoản đã có từ Cấp 0) |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap1ProgressOut`.

~~~ts
type Response = Cap1ProgressOut;
~~~

~~~json
{
  "id": "8d2f5a10-4c76-4b93-9e08-1a63cf7d2b45",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T08:02:11.409377+00:00",
  "da_xem_tour": true,
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "task_4_done_at": null,
  "task_5_done_at": null,
  "so_ly_do_da_dung": 0,
  "so_lenh_ly_do_ung_ho": 0,
  "so_lenh_thuc_chien": 0,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự**: đọc `cap1_progress` **trước**; nếu đã có thì trả về ngay và **hai lỗi dưới đây không bao giờ chạy**.

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap0_progress` (chưa từng vào Cấp 0) | `Không tìm thấy tiến trình Cấp 0` |
| 2 | 409 | `CONFLICT` | Có `cap0_progress` nhưng `graduated_at === null` | `Chưa tốt nghiệp Cấp 0` |

**Fallback / suy giảm** — Gọi lại luôn trả hàng cũ, `entered_at` không đổi. ★ Nếu `cap1_progress` đã tồn tại thì **không kiểm lại Cấp 0** — xoá tay hàng Cấp 0 không khoá được user đang học Cấp 1.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap1/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: bd47f206-9e13-4a58-b0c7-2f861da35e94'
~~~

**Ghi chú khi viết lại**

- ★ **Thứ tự kiểm bắt buộc**: (1) có `cap1_progress`? → trả về. (2) có `cap0_progress`? → không thì 404. (3) `cap0_progress.graduated_at` non-null? → không thì 409. (4) INSERT. Đảo (1) xuống sau (2)(3) sẽ làm user Cấp 1 bị 404 khi dữ liệu Cấp 0 khuyết.
- `da_xem_tour = true` **cứng** lúc tạo, kèm chú thích trong source: *"Only reachable via a graduated Cấp 0 (Nhánh A) — tours already seen."* Không có endpoint nào set lại field này.
- `UNIQUE(user_id)` = `uq_cap1_progress_user_id`.
- Không phụ thuộc `user_placement`.

---

### PATCH /api/v1/cap1/task

> **Xin tính lại tiến độ Cấp 1** — chạy lại phép đếm ③④⑤; endpoint **không** tự đóng nhiệm vụ nào.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | tính toán — COUNT trên `order_kehoach` + `virtual_orders` |
| **Side-effect** | UPDATE `cap1_progress`: `so_ly_do_da_dung`, `so_lenh_ly_do_ung_ho`, `so_lenh_thuc_chien`, và stamp `task_3/4/5_done_at` khi vượt ngưỡng |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap1TaskRequest {
  /** 1-5. ★ KHÔNG có ràng buộc Pydantic (`task_no: int` trơn) ⇒ giá trị ngoài
   *  khoảng bị SERVICE chặn với 400, KHÁC Cấp 0 (Cấp 0 là 422).
   *  ★ Giá trị này được validate rồi BỎ ĐI — mọi giá trị hợp lệ cho cùng kết quả. */
  task_no: number;
}
~~~

~~~json
{ "task_no": 5 }
~~~

**Response 200** — `Cap1ProgressOut` **sau khi** tính lại.

~~~ts
type Response = Cap1ProgressOut;
~~~

~~~json
{
  "id": "8d2f5a10-4c76-4b93-9e08-1a63cf7d2b45",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T08:02:11.409377+00:00",
  "da_xem_tour": true,
  "task_1_done_at": "2026-08-17T08:19:44.201553+00:00",
  "task_2_done_at": "2026-08-18T06:41:12.884930+00:00",
  "task_3_done_at": "2026-08-18T06:41:29.117204+00:00",
  "task_4_done_at": "2026-08-18T06:41:29.117204+00:00",
  "task_5_done_at": "2026-08-18T06:41:29.117204+00:00",
  "so_ly_do_da_dung": 5,
  "so_lenh_ly_do_ung_ho": 4,
  "so_lenh_thuc_chien": 10,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 400 | `BAD_REQUEST` | `task_no` không thuộc `(1,2,3,4,5)` — **nhánh này THẬT SỰ chạm được** qua HTTP | `task_no không hợp lệ` |
| 2 | 404 | `NOT_FOUND` | Chưa có hàng `cap1_progress` | `Không tìm thấy tiến trình Cấp 1` |
| — | 422 | — | `task_no` không phải số (ví dụ `"nam"`) | `HTTPValidationError` |

**Fallback / suy giảm** — Idempotent hoàn toàn: gọi 10 lần cho cùng kết quả. Counter là **đơn điệu tăng** trong thực tế (chỉ thêm lệnh), và `task_N_done_at` một khi stamp thì không bị xoá dù counter tụt (dữ liệu sửa tay). Không phụ thuộc provider ngoài, chạy được ngoài giờ giao dịch.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap1/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 17c93e5a-4028-4f6d-91b3-e7a0524dcb86' \
  -d '{"task_no": 5}'
~~~

**Ghi chú khi viết lại**

- ★★ **TUYỆT ĐỐI KHÔNG stamp theo `task_no`.** Đây là khoá chống «graduation fraud» quan trọng nhất của cấp. Docstring: *"It never marks anything on the client's say-so; `task_no` is validated and then discarded."*
- ★ Endpoint này **chỉ tính ③④⑤**. ① và ② được stamp bởi `POST /cap1/kehoach` và `POST /cap1/ketso` — `_recompute_counters` **không chạm** hai slot đó, nên gọi `PATCH` không "cứu" được một ① bị thiếu.
- ★ **Đây là endpoint FE phải gọi SAU khi `POST /cap1/ketso` thành công** (commit `f74ceaa`/`0cda005`), vì `record_ketso` không recompute → ⑤ trễ một lệnh bán. Ping phải đi **sau khi ketso đã ghi**, không song song.
- 3 truy vấn COUNT (giữ nguyên điều kiện, đây là hợp đồng nghiệp vụ):
  1. `COUNT(DISTINCT order_kehoach."lyDo")` FROM `order_kehoach` JOIN `virtual_orders` ON id = order_id WHERE `virtual_orders.user_id = :me`. **Không** lọc `mode`, **không** lọc `status`, **không** cửa sổ ngày.
  2. `COUNT(*)` cùng JOIN, thêm `order_kehoach."trangThai_luc_dat" = 'ung_ho'`.
  3. `COUNT(*)` FROM `virtual_orders` WHERE `user_id = :me` AND `mode = 'thuc_chien'` AND `status = 'FILLED'`. ★ **KHÔNG lọc `side`** — cả lệnh MUA và BÁN đều được đếm vào ⑤ («10 lệnh Thực chiến»). Đừng "sửa" thành chỉ BUY.
- Stamp chỉ khi `>= ngưỡng` **và** slot đang null: `so_ly_do_da_dung >= 5` → ③; `so_lenh_ly_do_ung_ho >= 3` → ④; `so_lenh_thuc_chien >= 10` → ⑤.
- 3 nhiệm vụ có thể được stamp **cùng một timestamp** (`now` được tính một lần trước cả ba phép kiểm) — đúng như ví dụ JSON ở trên.

---

### POST /api/v1/cap1/kehoach

> **Ghi Form Kế hoạch** — lưu lý do mua + nhận định AI lúc đặt + vùng mua cho một lệnh MUA; một lệnh chỉ ghi được **một lần**.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `order_kehoach` (bảng dùng chung Cấp 1-8) + đọc `virtual_orders` |
| **Side-effect** | INSERT `order_kehoach` · stamp `cap1_progress.task_1_done_at` nếu null · **recompute ③④⑤** |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap1KehoachRequest {
  order_id: string;                    // uuid lệnh MUA của chính user
  lyDo: LyDo;                          // ★ mixedCase NGUYÊN VĂN spec §9
  trangThai_luc_dat: TrangThaiLucDat;  // ★ mixedCase NGUYÊN VĂN
  /** VND / cổ phiếu. Phải > 0 (server kiểm `<= 0` → 400). BigInteger. */
  vung_mua: number;
  /** Có bấm đọc chi tiết lớp dữ liệu hay không. Optional, default false. */
  co_bam_doc_chi_tiet?: boolean;
  /** Ảnh chụp lớp dữ liệu lúc đặt lệnh — JSON TỰ DO, server KHÔNG validate
   *  cấu trúc, lưu nguyên vào cột JSON `snapshot_lop_du_lieu`. Optional. */
  snapshot?: Record<string, unknown> | null;
}
~~~

~~~json
{
  "order_id": "d5b81f37-2a60-4c94-8e13-7f6902ac4b58",
  "lyDo": "ky_thuat",
  "trangThai_luc_dat": "ung_ho",
  "vung_mua": 96500,
  "co_bam_doc_chi_tiet": true,
  "snapshot": {
    "symbol": "FPT",
    "ky_thuat": "gia_tren_ma20",
    "dong_tien": "khoi_ngoai_mua_rong",
    "vnindex_luc_dat": 1428.77
  }
}
~~~

**Response 200** — `Cap1OrderKehoachOut`. ★ **KHÔNG trả tiến độ** — client phải refetch `GET /cap1/progress`.

~~~ts
type Response = Cap1OrderKehoachOut;
~~~

~~~json
{
  "id": "9c47a218-5f03-4b8e-a960-2d17ef85c34b",
  "order_id": "d5b81f37-2a60-4c94-8e13-7f6902ac4b58",
  "lyDo": "ky_thuat",
  "trangThai_luc_dat": "ung_ho",
  "vung_mua": 96500,
  "co_bam_doc_chi_tiet": true,
  "snapshot_lop_du_lieu": {
    "symbol": "FPT",
    "ky_thuat": "gia_tren_ma20",
    "dong_tien": "khoi_ngoai_mua_rong",
    "vnindex_luc_dat": 1428.77
  }
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự kiểm** trong `Cap1Service.record_kehoach`:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | `lyDo`/`trangThai_luc_dat` ngoài union literal, `order_id` không phải uuid, thiếu field bắt buộc | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap1_progress` | `Không tìm thấy tiến trình Cấp 1` |
| 2 | 404 | `NOT_FOUND` | Lệnh không tồn tại **hoặc** không phải của user | `Không tìm thấy lệnh` |
| 3 | 400 | `BAD_REQUEST` | `order.side != BUY` | `Kế hoạch chỉ ghi cho lệnh MUA` |
| 4 | 400 | `BAD_REQUEST` | Giá trị enum không parse được (chỉ chạm được khi gọi trực tiếp service) | `lyDo hoặc trangThai_luc_dat không hợp lệ` |
| 5 | 400 | `BAD_REQUEST` | `vung_mua` null hoặc `<= 0` | `Vùng mua phải là số dương` |
| 6 | **409** | `CONFLICT` | Lệnh này **đã có** hàng `order_kehoach` | `Lệnh này đã có kế hoạch` |

**Fallback / suy giảm** — ★ **KHÔNG upsert — 409 khi ghi lại** (khác hẳn `POST /cap0/kehoach`). Sửa kế hoạch không được hỗ trợ ở Cấp 1; Cấp 2 **bổ sung** cột vào hàng đã có (`POST /cap2/kehoach`) chứ không tạo hàng mới. Lệnh **chưa khớp** vẫn ghi được kế hoạch (không kiểm `status` — đúng nghiệp vụ: kế hoạch lập lúc ĐẶT lệnh). **Client phải bọc lời gọi này NON-FATAL**: lỗi ở đây không được chặn luồng `onOrderFilled` (xem «Nghiệp vụ nền» mục 10).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap1/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3ae61c08-7d45-49f2-8b06-c1f75e93da20' \
  -d '{"order_id":"d5b81f37-2a60-4c94-8e13-7f6902ac4b58","lyDo":"ky_thuat","trangThai_luc_dat":"ung_ho","vung_mua":96500,"co_bam_doc_chi_tiet":true,"snapshot":{"symbol":"FPT","vnindex_luc_dat":1428.77}}'
~~~

**Ghi chú khi viết lại**

- ★★ **Giữ NGUYÊN VĂN tên field `lyDo` và `trangThai_luc_dat` trên wire** (mixedCase, không phải `ly_do`/`trang_thai_luc_dat`). Spec §9 liệt schema này là VERBATIM; cột DB cũng mang đúng tên đó (`order_kehoach."lyDo"` — cần trích dẫn kép trong SQL Postgres). Đổi sang snake_case là **breaking change** với frontend hiện tại.
- ★ **`order_kehoach.order_id` là UNIQUE** — đây là gốc của 409 và cũng là lý do Cấp 0 phải có bảng riêng (xem «Nghiệp vụ nền» mục 9).
- ★ **Không lọc `order.mode`** ở đây (giống Cấp 0). Nhưng phép đếm ⑤ thì có → xem «Thực chiến vs sân tập».
- Thứ tự **ghi rồi mới stamp**: INSERT `order_kehoach` → flush → `if task_1_done_at is None: task_1_done_at = now()` → `_recompute_counters`. Nếu stamp trước khi INSERT thành công thì một lệnh 409 vẫn đóng ① — sai.
- `vung_mua` đơn vị **VND / cổ phiếu** (giá), không phải số lượng và không phải tổng tiền. Kiểu `BigInteger`; server `int(vung_mua)` (**cắt phần thập phân**, không làm tròn).
- `snapshot` → cột `snapshot_lop_du_lieu`. Tên request khác tên response — **đừng đồng bộ hoá**.
- `co_bam_doc_chi_tiet` NOT NULL server_default `false`; thiếu trong body → `false`.
- ★ Response **không mang progress** ⇒ client bắt buộc invalidate query progress (xem mục 10).

---

### POST /api/v1/cap1/ketso

> **Kết sổ một lệnh bán** — server tự tính giá ra, số phiên giữ, số ngày lịch, lãi/lỗ cho một lệnh BÁN đã khớp.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | tính toán từ `virtual_orders` (lệnh BÁN + lệnh MUA khớp) |
| **Side-effect** | INSERT **hoặc** UPDATE-`cam_xuc` trên `order_ketso` · stamp `cap1_progress.task_2_done_at` nếu null. ★ **KHÔNG recompute ③④⑤** |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap1KetsoRequest {
  order_id: string;          // uuid lệnh BÁN, phải FILLED và thuộc user
  /** Optional. null/bỏ trống = pre-flight (chưa chọn cảm xúc). */
  cam_xuc?: CamXuc | null;
}
~~~

~~~json
{
  "order_id": "f3902b6e-8c41-4d75-a028-5b7ce19d4a37",
  "cam_xuc": "binh_tinh"
}
~~~

**Response 200** — `Cap1OrderKetsoOut`. ★ **KHÔNG trả tiến độ.**

~~~ts
type Response = Cap1OrderKetsoOut;
~~~

~~~json
{
  "id": "2e59a743-0c68-4f81-95b2-d7a3061ecf4a",
  "order_id": "f3902b6e-8c41-4d75-a028-5b7ce19d4a37",
  "gia_ra": 63500,
  "so_phien_giu": 2,
  "so_ngay_lich": 4,
  "pnl_pct": 2.340421406724864,
  "pnl_vnd": 1448550,
  "cam_xuc": "binh_tinh",
  "closed_at": "2026-08-17T07:12:58.640119+00:00"
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự kiểm** trong `Cap1Service.record_ketso`:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | `cam_xuc` ngoài union literal, `order_id` không phải uuid | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap1_progress` | `Không tìm thấy tiến trình Cấp 1` |
| 2 | 404 | `NOT_FOUND` | Lệnh không tồn tại **hoặc** không phải của user | `Không tìm thấy lệnh` |
| 3 | 400 | `BAD_REQUEST` | `order.side != SELL` | `Kết sổ chỉ ghi cho lệnh BÁN` |
| 4 | 400 | `BAD_REQUEST` | `order.status != FILLED` | `Lệnh bán chưa khớp` |
| 5 | 400 | `BAD_REQUEST` | `cam_xuc` không parse được (chỉ chạm được khi gọi trực tiếp service) | `cam_xuc không hợp lệ` |
| 6 | **409** | `CONFLICT` | Đã có hàng `order_ketso` **VÀ** request **không** mang `cam_xuc` | `Lệnh này đã kết sổ` |
| 7 | **409** | `CONFLICT` | Không tìm được lệnh MUA khớp (cùng `account_id`+`symbol`, `FILLED`, `created_at <= sell.created_at`) | `Không tìm thấy lệnh mua tương ứng để kết sổ` |

**Fallback / suy giảm** — ★ **`cam_xuc` là UPSERT, phần tính toán thì KHÔNG.** Từ Cấp 5 trở lên, FE gọi endpoint này **hai lần**: lần 1 là **pre-flight** ngay khi lệnh bán khớp (để pnl/số phiên tồn tại trước khi modal Kết sổ mở) — lúc đó `cam_xuc` là `null`; lần 2 do modal gửi với cảm xúc thật, và lần đó **UPDATE** hàng cũ thay vì 409 (đây chính là bug "cảm xúc âm thầm không lưu ở Cấp 5"). Luật đầy đủ: (a) gọi lại **không** kèm `cam_xuc` → **409** (không có gì để thêm); (b) gọi lại **có** `cam_xuc` → UPDATE, và `gia_ra`/`so_phien_giu`/`so_ngay_lich`/`pnl_*`/`closed_at` **không bao giờ được tính lại**; (c) `cam_xuc` đã non-null **không bao giờ bị xoá về null**. Cả hai nhánh đều stamp `task_2_done_at` nếu còn null.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap1/ketso' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8b2704ce-df19-4a63-90f5-6e1c85307ba4' \
  -d '{"order_id":"f3902b6e-8c41-4d75-a028-5b7ce19d4a37","cam_xuc":"binh_tinh"}'
~~~

**Ghi chú khi viết lại**

- ★ **Công thức, nguyên văn source** (lệnh MUA khớp = `_find_matching_buy`):
  - `so_ngay_lich = (sell.trading_date - buy.trading_date).days` — **ngày dương lịch**, có thể lớn hơn `so_phien_giu`.
  - `so_phien_giu = _count_trading_sessions(buy.trading_date, sell.trading_date)` — chỉ T2-T6, **không lịch lễ**, cùng phiên = `0` (xem «Nghiệp vụ nền» mục 13).
  - `gia_ra = sell.filled_price_vnd ?? 0` — VND/cổ phiếu.
  - `pnl_vnd = sell.net_amount_vnd + buy.net_amount_vnd`. ★ **`buy.net_amount_vnd` là số ÂM** (tiền ra), `sell` là số dương (tiền vào) — nên đây là phép **CỘNG**, không phải trừ. Cả hai đã gồm phí/thuế.
  - `cost_basis = -buy.net_amount_vnd`.
  - `pnl_pct = cost_basis ? (pnl_vnd / cost_basis * 100) : 0.0` — **đơn vị PHẦN TRĂM** (2.34 nghĩa là +2.34%), và `cost_basis === 0` cho `0.0` chứ không phải NaN/Infinity.
  - `closed_at = now()` — thời điểm **GHI kết sổ**, KHÔNG phải thời điểm khớp lệnh. Cấp 2 dùng chính field này làm cửa sổ (`closed_at >= cap2_progress.entered_at`).
- ★ `net_amount_vnd` có thể `null` trên lệnh chưa khớp → source dùng `or 0`. Với `status = FILLED` (đã kiểm ở bước 4) thì thực tế luôn có giá trị.
- ★ **KHÔNG gọi `_recompute_counters`.** Đây là chủ ý của source hiện tại; hệ quả là ⑤ trễ một lệnh bán và FE phải ping `PATCH /cap1/task` sau đó. Đừng "sửa" âm thầm — nếu thêm recompute, phải ghi vào changelog và xoá ping ở FE cho khỏi làm hai lần.
- ★ Xấp xỉ một lô: `_find_matching_buy` lấy lệnh MUA `FILLED` **gần nhất** ở/trước lệnh bán, cùng `account_id` + `symbol`. Tài khoản ảo dùng giá bình quân (không theo lô) nên đây là xấp xỉ có ý thức. Bán một phần / nhiều lô sẽ ra số gần đúng — **giữ nguyên**, đừng tự dựng lot-tracking (sẽ lệch với engine giao dịch ảo).
- `order_ketso.order_id` UNIQUE — gốc của nhánh 409.
- ★ Response **không mang progress** ⇒ client invalidate progress **và** ping `PATCH /cap1/task`.

---

### POST /api/v1/cap1/graduate

> **Tốt nghiệp Cấp 1** — chốt tốt nghiệp khi đủ 5/5 nhiệm vụ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — đọc `cap1_progress` |
| **Side-effect** | UPDATE `cap1_progress.graduated_at` + `time_to_graduate_hours` (chỉ lần đầu). **KHÔNG** tạo hàng Cấp 2, **KHÔNG** email/Telegram/audit log |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap1ProgressOut` (đã có `graduated_at`).

~~~ts
type Response = Cap1ProgressOut;
~~~

~~~json
{
  "id": "8d2f5a10-4c76-4b93-9e08-1a63cf7d2b45",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-17T08:02:11.409377+00:00",
  "da_xem_tour": true,
  "task_1_done_at": "2026-08-17T08:19:44.201553+00:00",
  "task_2_done_at": "2026-08-18T06:41:12.884930+00:00",
  "task_3_done_at": "2026-08-18T06:41:29.117204+00:00",
  "task_4_done_at": "2026-08-18T06:41:29.117204+00:00",
  "task_5_done_at": "2026-08-18T06:41:29.117204+00:00",
  "so_ly_do_da_dung": 5,
  "so_lenh_ly_do_ung_ho": 4,
  "so_lenh_thuc_chien": 10,
  "graduated_at": "2026-08-18T06:42:03.552810+00:00",
  "time_to_graduate_hours": 22.663373
}
~~~

**Lỗi**

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap1_progress` | `Không tìm thấy tiến trình Cấp 1` |
| 2 | 409 | `CONFLICT` | Thiếu bất kỳ `task_1..5_done_at` | `Chưa hoàn thành đủ 5 nhiệm vụ Cấp 1` |

**Fallback / suy giảm** — Idempotent: gọi lại trả hàng cũ, `graduated_at`/`time_to_graduate_hours` **không** bị ghi lại. ★ **KHÔNG recompute trước khi kiểm** ⇒ một user đã đủ điều kiện thực chất nhưng chưa có write nào chạy recompute sẽ nhận **409**. Client phải `PATCH /cap1/task` trước khi mở nút tốt nghiệp. Tốt nghiệp được ngoài giờ giao dịch.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap1/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c6f10a83-24d7-4be5-9018-7a3fe5b2c904'
~~~

**Ghi chú khi viết lại**

- ★ Thứ tự bắt buộc: đọc hàng → `all(task_1..5_done_at != null)` → **409 trước khi ghi gì** → chỉ khi đủ mới stamp. Kiểm sau khi ghi là hình dạng của lỗ hổng cũ.
- ★ **Giữ nguyên việc KHÔNG recompute** trong `graduate` (khác Cấp 3). Nếu bản TS thêm recompute, đặt nó **TRƯỚC** phép kiểm và ghi vào changelog.
- `time_to_graduate_hours = (now - entered_at).total_seconds() / 3600.0`, **giờ**, float; `entered_at` naive phải coi là UTC trước khi trừ.
- Không tự tạo hàng Cấp 2. FE gọi `POST /cap2/enter` — và theo `capFlags.ts`, chỉ gọi khi `CAP_MAX_ENABLED >= 2` (hiện là 3 → **có gọi**).
- ★ Luật bất di bất dịch: nếu Cấp 1 là cấp trần thì nút CTA của modal tốt nghiệp **vẫn phải bấm được** và vẫn gọi endpoint này (modal `closable={false}`, chỉ unmount khi có `graduated_at`).

---

## Cấp 2 «Kỷ luật» — 7 endpoint

Router: `APIRouter(prefix="/cap2", tags=["Cấp 2"])`. Có `kehoach` + `ketso` (**cả hai đều BỔ SUNG vào hàng của Cấp 1, không tạo hàng mới**) và endpoint riêng `GET /cap2/diem-ky-luat`.

Kiểu chung của cấp này:

~~~ts
/** GET /cap2/progress · POST /cap2/enter · PATCH /cap2/task · POST /cap2/graduate
 *  (schema `Cap2ProgressOut`). ★ ĐÚNG 2 nhiệm vụ. Test khoá: KHÔNG được có
 *  task_3/4/5_done_at, chuoi_current, chuoi_record, last_chuoi_reset_at. */
interface Cap2ProgressOut {
  id: string;                    // uuid, PK cap2_progress
  user_id: string;               // uuid
  entered_at: string;            // ISO-8601 — ★ cũng là MỐC CỬA SỔ của nhiệm vụ ②
  task_1_done_at: string | null; // ① 10 lệnh Thực chiến có đặt cắt lỗ/chốt lời
  task_2_done_at: string | null; // ② Thực hiện đúng khi giá chạm mốc — 2 lần
  so_lenh_co_cl_tp: number;      // ① — mốc 10
  so_lan_cat_lo_dung: number;    // 🛑 vế cắt lỗ
  so_lan_chot_loi_dung: number;  // 🎯 vế chốt lời
  so_lan_thuc_hien_dung: number; // ✅ tổng — ② mốc 2. BẤT BIẾN: = cat_lo + chot_loi
  graduated_at: string | null;
  time_to_graduate_hours: number | null;  // giờ
}

/** POST /cap2/kehoach (schema `app__schemas__cap2__OrderKehoachOut`).
 *  ★ VIEW CỦA CẤP 2 trên `order_kehoach` — chỉ 5 field, KHÔNG có lyDo/
 *  trangThai_luc_dat (dù chúng vẫn nằm trên hàng DB). Muốn đọc chúng thì gọi
 *  POST /cap1/kehoach lúc ghi, hoặc màn Kết sổ của cấp tương ứng. */
interface Cap2OrderKehoachOut {
  id: string;
  order_id: string;
  vung_mua: number;                              // của Cấp 1, NOT NULL
  phuong_phap_sl_tp: PhuongPhapSlTp | null;      // null = chưa qua bước Cấp 2
  cat_lo: number | null;                          // VND/cp, null = CHƯA BIẾT
  chot_loi: number | null;                        // VND/cp, null = CHƯA BIẾT
}

/** POST /cap2/ketso (schema `app__schemas__cap2__OrderKetsoOut`).
 *  ★ VIEW CỦA CẤP 2 trên `order_ketso` — Cấp 1's fields + 7 cờ. KHÔNG có
 *  so_phien_giu/so_ngay_lich/cam_xuc (chúng ở view Cấp 1). */
interface Cap2OrderKetsoOut {
  id: string;
  order_id: string;
  gia_ra: number;      // do Cấp 1 tính, KHÔNG tính lại ở Cấp 2
  pnl_pct: number;     // phần trăm
  pnl_vnd: number;     // VND
  closed_at: string;
  // ── 4 vi phạm + 3 đo lường (spec §13, tên NGUYÊN VĂN mixedCase) ──
  cham_SL_cuoi_phien: boolean;         // giá chạm cắt lỗ vào cuối phiên
  cham_SL_cat_dung_phien_ke: boolean;  // ★ chạm SL cuối phiên → bán ATO phiên kế = "cắt lỗ ĐÚNG"
  cham_SL_khong_cat: boolean;          // vi phạm: chạm SL mà không cắt
  giu_cham_SL_bao_nhieu_phien: number | null;  // null = CHƯA BIẾT, ≠ 0
  cham_TP_giu_lam_hut: boolean;        // vi phạm: chạm chốt lời, giữ tiếp làm hụt
  ban_som_khi_lo_nhe: boolean;         // vi phạm
  nhoi_lenh_khi_lo: boolean;           // vi phạm
}

/** GET /cap2/diem-ky-luat (schema `DiemKyLuatOut` + `DiemKyLuatThanhPhan`). */
interface DiemKyLuatThanhPhan {
  ke_hoach: number;            ke_hoach_toi_da: number;      // luôn 40
  cat_lo_dung: number;         cat_lo_dung_toi_da: number;   // luôn 40
  khong_nhoi: number;          khong_nhoi_toi_da: number;    // luôn 30
  chot_loi_dung: number;       chot_loi_dung_toi_da: number; // luôn 30
}
interface DiemKyLuatOut {
  ngay: string;                 // "YYYY-MM-DD"
  co_giao_dich: boolean;
  co_tinh_huong: boolean;
  diem: number | null;          // null = không chấm được. Xem 3 trạng thái ở mục 12
  xep_loai: XepLoai | null;     // null ≠ "do"
  giai_thich: string;           // luôn có, tiếng Việt, hiện NGUYÊN VĂN
  thanh_phan: DiemKyLuatThanhPhan | null;
}
~~~

---

### GET /api/v1/cap2/progress

> **Tiến độ Cấp 2** — trả về hàng `cap2_progress` của user hiện tại, hoặc `null` nếu chưa vào Cấp 2.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — `SELECT * FROM cap2_progress WHERE user_id = :me` |
| **Side-effect** | không (đọc thuần — **KHÔNG** tính lại) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `Cap2ProgressOut | null`.

~~~ts
type Response = Cap2ProgressOut | null;
~~~

~~~json
{
  "id": "5b1c8e42-9074-4a36-bd5f-e28031a6c7f9",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-18T01:05:47.226813+00:00",
  "task_1_done_at": null,
  "task_2_done_at": "2026-08-18T08:22:41.703558+00:00",
  "so_lenh_co_cl_tp": 4,
  "so_lan_cat_lo_dung": 1,
  "so_lan_chot_loi_dung": 1,
  "so_lan_thuc_hien_dung": 2,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| — | — | Không có lỗi nghiệp vụ. Chưa vào cấp → **200 `null`** | — |

**Fallback / suy giảm** — `200 null` khi chưa vào Cấp 2. Counter có thể **cũ** (chỉ cập nhật ở `POST /cap2/kehoach`, `POST /cap2/ketso`, `PATCH /cap2/task`) — muốn số tươi thì `PATCH /cap2/task` trước.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap2/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 0d74be21-5a83-4c97-b16e-38f2c05a9d47'
~~~

**Ghi chú khi viết lại**

- ★ Ví dụ JSON trên minh hoạ **"làm song song"**: ② đã xong (`task_2_done_at` non-null) khi ① mới 4/10. Đây là trạng thái HỢP LỆ, không phải dữ liệu lỗi.
- ★ Bất biến phải kiểm được: `so_lan_thuc_hien_dung === so_lan_cat_lo_dung + so_lan_chot_loi_dung`. Khối ④ màn «Phân tích danh mục» render 🛑 `so_lan_cat_lo_dung` / 🎯 `so_lan_chot_loi_dung` / ✅ `so_lan_thuc_hien_dung`.
- ★ `entered_at` **không chỉ là dữ liệu hiển thị** — nó là mốc cửa sổ của nhiệm vụ ② (`OrderKetso.closed_at >= entered_at`). Đừng sửa/reset nó.
- **KHÔNG recompute ở đây** (khác Cấp 3).

---

### POST /api/v1/cap2/enter

> **Vào Cấp 2** — tạo hàng tiến độ Cấp 2 (idempotent); bắt buộc đã tốt nghiệp Cấp 1.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — đọc `cap1_progress`, ghi `cap2_progress` |
| **Side-effect** | INSERT `cap2_progress` (nếu chưa có). Không seed tài khoản, không tạo hàng cấp khác |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap2ProgressOut`.

~~~ts
type Response = Cap2ProgressOut;
~~~

~~~json
{
  "id": "5b1c8e42-9074-4a36-bd5f-e28031a6c7f9",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-18T01:05:47.226813+00:00",
  "task_1_done_at": null,
  "task_2_done_at": null,
  "so_lenh_co_cl_tp": 0,
  "so_lan_cat_lo_dung": 0,
  "so_lan_chot_loi_dung": 0,
  "so_lan_thuc_hien_dung": 0,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi** — chỉ chạy khi `cap2_progress` **chưa** tồn tại.

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap1_progress` | `Không tìm thấy tiến trình Cấp 1` |
| 2 | 409 | `CONFLICT` | Có `cap1_progress` nhưng `graduated_at === null` | `Chưa tốt nghiệp Cấp 1` |

**Fallback / suy giảm** — Gọi lại trả hàng cũ, `entered_at` không đổi (quan trọng: `entered_at` là mốc cửa sổ của ②). Nếu `cap2_progress` đã có thì **không kiểm lại Cấp 1**.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap2/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7e50a93c-1b26-4d84-af07-c9351e6bd208'
~~~

**Ghi chú khi viết lại**

- ★ **Không có cổng `CAP_MAX_ENABLED` ở server.** Endpoint này **vẫn 200 và tạo hàng THẬT** nếu ai đó gọi trực tiếp khi FE chưa mở Cấp 2. Với `CAP_MAX_ENABLED = 3` hiện tại thì FE có gọi thật.
- Thứ tự: (1) có `cap2_progress`? → trả về; (2) có `cap1_progress`? → 404; (3) đã tốt nghiệp? → 409; (4) INSERT.
- `UNIQUE(user_id)` = `uq_cap2_progress_user_id`. 4 counter tạo với `server_default '0'`.
- ★ `entered_at = now(UTC)` và **cả 4 counter khởi tạo 0, KHÔNG back-fill bằng SQL**. Migration `8f1a5c7d2e64` giải thích: cả hai counter là hàm thuần của `order_kehoach`/`order_ketso` và service tính lại ở mọi write, nên back-fill viết tay là bản cài đặt thứ hai, dễ lệch. Write đầu tiên sau khi vào cấp làm chúng đúng.

---

### PATCH /api/v1/cap2/task

> **Xin tính lại tiến độ Cấp 2** — chạy lại cả hai phép đếm ①②; endpoint **không** tự đóng nhiệm vụ nào.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | tính toán — `order_kehoach` + `order_ketso` + `virtual_orders` |
| **Side-effect** | UPDATE `cap2_progress`: 4 counter + stamp `task_1/2_done_at` khi vượt ngưỡng |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap2TaskRequest {
  /** 1 hoặc 2. ★ Không có ràng buộc Pydantic ⇒ giá trị khác bị SERVICE chặn 400.
   *  ★ Giá trị được validate rồi BỎ ĐI — cả 1 và 2 cho cùng kết quả. */
  task_no: number;
}
~~~

~~~json
{ "task_no": 1 }
~~~

**Response 200** — `Cap2ProgressOut` sau khi tính lại.

~~~ts
type Response = Cap2ProgressOut;
~~~

~~~json
{
  "id": "5b1c8e42-9074-4a36-bd5f-e28031a6c7f9",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-18T01:05:47.226813+00:00",
  "task_1_done_at": "2026-08-18T09:14:36.482091+00:00",
  "task_2_done_at": "2026-08-18T08:22:41.703558+00:00",
  "so_lenh_co_cl_tp": 10,
  "so_lan_cat_lo_dung": 1,
  "so_lan_chot_loi_dung": 1,
  "so_lan_thuc_hien_dung": 2,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 400 | `BAD_REQUEST` | `task_no` không thuộc `(1,2)` — bao gồm `3`, `4`, `5` (số nhiệm vụ CŨ). Nhánh này **chạm được** qua HTTP | `task_no không hợp lệ` |
| 2 | 404 | `NOT_FOUND` | Chưa có hàng `cap2_progress` | `Không tìm thấy tiến trình Cấp 2` |
| — | 422 | — | `task_no` không phải số | `HTTPValidationError` |

**Fallback / suy giảm** — Idempotent hoàn toàn. `task_N_done_at` đã stamp thì không bị xoá dù counter tụt. Không phụ thuộc provider ngoài, chạy được ngoài giờ giao dịch.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap2/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 41b8de07-3c95-4a26-8f70-b25e9013cd6a' \
  -d '{"task_no": 1}'
~~~

**Ghi chú khi viết lại**

- ★★ **KHÔNG stamp theo `task_no`** — khoá chống «graduation fraud» (xem «Nghiệp vụ nền» mục 7).
- ★ `task_no = 3/4/5` phải **400**, không được im lặng bỏ qua. Test `test_mark_task_rejects_the_removed_task_numbers` khoá điều này: ba số nhiệm vụ cũ đã bị migration `8f1a5c7d2e64` xoá và server phải nói ra.
- Phép tính đầy đủ của `_recompute_progress` (giữ **nguyên thứ tự**, vì bước 1 dùng `entered_at`):
  1. Lấy `rows` = `order_ketso` JOIN `virtual_orders` WHERE `user_id = :me` AND `mode = 'thuc_chien'` AND `closed_at >= progress.entered_at`, `ORDER BY closed_at ASC`.
  2. `so_lenh_co_cl_tp` = COUNT `order_kehoach` JOIN `virtual_orders` WHERE `user_id`, `mode='thuc_chien'`, `side=BUY`, `status=FILLED`, `cat_lo IS NOT NULL`, `chot_loi IS NOT NULL`. **Không cửa sổ ngày.**
  3. Duyệt `rows` đếm ②: `cham_SL_cat_dung_phien_ke` → `so_lan_cat_lo_dung++` + **`continue`**; ngược lại tìm kế hoạch của chân MUA khớp → `_is_chot_loi_dung` → `so_lan_chot_loi_dung++`. **Tối đa 1 lần/round trip**, chân SL thắng khi cả hai khớp.
  4. `so_lan_thuc_hien_dung = so_lan_cat_lo_dung + so_lan_chot_loi_dung`.
  5. `now` tính **một lần** trước cả hai phép kiểm; `so_lenh_co_cl_tp >= 10` → stamp ①; `so_lan_thuc_hien_dung >= 2` → stamp ②. Hai nhánh **độc lập**, không nhánh nào gác nhánh kia.
- ★ Bước 3 hiện là **vòng lặp N+1 query** (mỗi row 2 truy vấn: lấy lệnh bán, rồi tìm kế hoạch của chân mua). Bản TS **được phép** tối ưu thành JOIN, **miễn giữ nguyên kết quả**: tối đa 1 lần/round trip, SL thắng tie, và `_is_chot_loi_dung` đúng 4 điều kiện.

---

### POST /api/v1/cap2/kehoach

> **Ghi cắt lỗ / chốt lời** — bổ sung khối cam kết mốc giá vào hàng kế hoạch mà Cấp 1 đã tạo cho lệnh MUA đó.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — UPDATE `order_kehoach` (bảng dùng chung) |
| **Side-effect** | UPDATE `order_kehoach.phuong_phap_sl_tp` / `cat_lo` / `chot_loi` · **recompute ①②** |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap2KehoachRequest {
  order_id: string;                    // uuid lệnh MUA của chính user
  phuong_phap_sl_tp: PhuongPhapSlTp;   // 2 cách chọn 1, BẮT BUỘC
  /** Giá cắt lỗ, VND/cổ phiếu. Phải > 0. BẮT BUỘC. */
  cat_lo: number;
  /** Giá chốt lời, VND/cổ phiếu. Phải > 0. BẮT BUỘC. */
  chot_loi: number;
}
~~~

~~~json
{
  "order_id": "d5b81f37-2a60-4c94-8e13-7f6902ac4b58",
  "phuong_phap_sl_tp": "ho_tro_khang_cu",
  "cat_lo": 91000,
  "chot_loi": 106000
}
~~~

**Response 200** — `Cap2OrderKehoachOut`. ★ **KHÔNG trả tiến độ.**

~~~ts
type Response = Cap2OrderKehoachOut;
~~~

~~~json
{
  "id": "9c47a218-5f03-4b8e-a960-2d17ef85c34b",
  "order_id": "d5b81f37-2a60-4c94-8e13-7f6902ac4b58",
  "vung_mua": 96500,
  "phuong_phap_sl_tp": "ho_tro_khang_cu",
  "cat_lo": 91000,
  "chot_loi": 106000
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự kiểm** trong `Cap2Service.record_kehoach`:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | `phuong_phap_sl_tp` ngoài union literal, thiếu `cat_lo`/`chot_loi`, `order_id` không phải uuid | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap2_progress` | `Không tìm thấy tiến trình Cấp 2` |
| 2 | 404 | `NOT_FOUND` | Lệnh không tồn tại **hoặc** không phải của user | `Không tìm thấy lệnh` |
| 3 | 400 | `BAD_REQUEST` | `order.side != BUY` | `Cắt lỗ/Chốt lời chỉ ghi cho lệnh MUA` |
| 4 | 400 | `BAD_REQUEST` | `phuong_phap_sl_tp` không parse được (chỉ chạm được khi gọi trực tiếp service) | `phuong_phap_sl_tp không hợp lệ` |
| 5 | 400 | `BAD_REQUEST` | `cat_lo` null/`<= 0` **hoặc** `chot_loi` null/`<= 0` (một thông điệp cho cả hai) | `Cắt lỗ/Chốt lời phải là số dương` |
| 6 | **404** | `NOT_FOUND` | **Chưa có hàng `order_kehoach`** cho lệnh này — tức chưa gọi `POST /cap1/kehoach` | `Không tìm thấy kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước` |

**Fallback / suy giảm** — ★ **Thứ tự nghiệp vụ CỨNG: `POST /cap1/kehoach` trước, `POST /cap2/kehoach` sau.** Endpoint này **không bao giờ tạo hàng mới** — nó chỉ UPDATE. Gọi lại cho cùng lệnh là **ghi đè** cả ba cột (không 409), nên user sửa lại mốc được. **Client phải bọc NON-FATAL** (xem «Nghiệp vụ nền» mục 10).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap2/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b93c7e18-06a5-4d72-91fb-4e2085ca63d7' \
  -d '{"order_id":"d5b81f37-2a60-4c94-8e13-7f6902ac4b58","phuong_phap_sl_tp":"ho_tro_khang_cu","cat_lo":91000,"chot_loi":106000}'
~~~

**Ghi chú khi viết lại**

- ★ **Cả `cat_lo` và `chot_loi` đều BẮT BUỘC** và cùng ghi trong một lần. Không có nhánh "chỉ đặt cắt lỗ". Nhiệm vụ ① đếm lệnh có **ĐỦ CẢ HAI** — test `test_counter_1_refuses_a_half_filled_plan` khoá điều này.
- ★ **KHÔNG kiểm quan hệ giá.** Server **không** kiểm `cat_lo < vung_mua < chot_loi`, không kiểm `cat_lo < chot_loi`, không kiểm so với giá khớp thật. Chỉ kiểm `> 0`. Đây là hành vi hiện tại — siết thêm là **thay đổi hành vi có chủ ý**.
- ★ `int(cat_lo)` / `int(chot_loi)` — **cắt phần thập phân**, không làm tròn. Đơn vị **VND / cổ phiếu**, không phải phần trăm và không phải tổng tiền.
- ★ **`cat_lo`/`chot_loi` non-null chính là dấu hiệu «lệnh đã qua Cấp 2»** — chúng chỉ có thể do endpoint này ghi, mà endpoint này đòi `cap2_progress`. Nhờ vậy `_so_lenh_co_cl_tp` không cần cửa sổ ngày. **Đừng cho bất kỳ đường nào khác ghi hai cột này**, nếu không phép đếm ① sẽ tính cả lệnh thời Cấp 1.
- ★ ① được **recompute ngay tại đây**, không chờ Kết sổ. Docstring: chờ Kết sổ sẽ đóng băng hành trình ở 0/10 dù user có 10 vị thế mở đều đủ mốc. Test `test_counter_1_moves_on_kehoach_alone_no_sell_needed`.
- ★ Response **không mang progress** ⇒ client invalidate `GET /cap2/progress`.
- Không lọc `order.mode` khi GHI; nhưng phép đếm ① thì lọc `thuc_chien` ⇒ user FREE ghi được mốc mà counter vẫn 0.

---

### POST /api/v1/cap2/ketso

> **Ghi 7 cờ kỷ luật** — bổ sung 4 vi phạm + 3 đo lường vào hàng kết sổ mà Cấp 1 đã tạo, rồi tính lại 2 nhiệm vụ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — UPDATE `order_ketso` (bảng dùng chung) |
| **Side-effect** | UPDATE **cả 7 cột cờ** trên `order_ketso` · **recompute ①②** |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap2KetsoRequest {
  order_id: string;                          // uuid lệnh BÁN của chính user
  /** ★ CẢ 7 field dưới đây đều OPTIONAL với default, và CẢ 7 đều được GHI ĐÈ
   *  vô điều kiện. Bỏ trống một field = ghi giá trị default lên hàng, KHÔNG
   *  phải "giữ nguyên giá trị cũ". Xem Ghi chú. */
  cham_SL_cuoi_phien?: boolean;              // default false
  cham_SL_cat_dung_phien_ke?: boolean;       // default false — ★ cờ tính ② vế cắt lỗ
  cham_SL_khong_cat?: boolean;               // default false
  giu_cham_SL_bao_nhieu_phien?: number | null;  // default null = CHƯA BIẾT (≠ 0)
  cham_TP_giu_lam_hut?: boolean;             // default false — ★ chặn ② vế chốt lời
  ban_som_khi_lo_nhe?: boolean;              // default false
  nhoi_lenh_khi_lo?: boolean;                // default false — ★ trừ điểm kỷ luật
}
~~~

~~~json
{
  "order_id": "f3902b6e-8c41-4d75-a028-5b7ce19d4a37",
  "cham_SL_cuoi_phien": true,
  "cham_SL_cat_dung_phien_ke": true,
  "cham_SL_khong_cat": false,
  "giu_cham_SL_bao_nhieu_phien": 1,
  "cham_TP_giu_lam_hut": false,
  "ban_som_khi_lo_nhe": false,
  "nhoi_lenh_khi_lo": false
}
~~~

**Response 200** — `Cap2OrderKetsoOut`. ★ **KHÔNG trả tiến độ.**

~~~ts
type Response = Cap2OrderKetsoOut;
~~~

~~~json
{
  "id": "2e59a743-0c68-4f81-95b2-d7a3061ecf4a",
  "order_id": "f3902b6e-8c41-4d75-a028-5b7ce19d4a37",
  "gia_ra": 25000,
  "pnl_pct": -9.8471336,
  "pnl_vnd": -2015400,
  "closed_at": "2026-08-17T07:12:58.640119+00:00",
  "cham_SL_cuoi_phien": true,
  "cham_SL_cat_dung_phien_ke": true,
  "cham_SL_khong_cat": false,
  "giu_cham_SL_bao_nhieu_phien": 1,
  "cham_TP_giu_lam_hut": false,
  "ban_som_khi_lo_nhe": false,
  "nhoi_lenh_khi_lo": false
}
~~~

**Lỗi** — theo **ĐÚNG thứ tự kiểm** trong `Cap2Service.record_ketso`:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | Kiểu sai (ví dụ `nhoi_lenh_khi_lo: "co"`), `order_id` không phải uuid | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap2_progress` | `Không tìm thấy tiến trình Cấp 2` |
| 2 | 404 | `NOT_FOUND` | Lệnh không tồn tại **hoặc** không phải của user | `Không tìm thấy lệnh` |
| 3 | 400 | `BAD_REQUEST` | `order.side != SELL` | `Đo kỷ luật chỉ ghi cho lệnh BÁN` |
| 4 | **404** | `NOT_FOUND` | **Chưa có hàng `order_ketso`** cho lệnh này — tức chưa gọi `POST /cap1/ketso` | `Không tìm thấy kết sổ Cấp 1 — cần kết sổ (Cấp 1) trước` |

**Fallback / suy giảm** — ★ **Thứ tự nghiệp vụ CỨNG: `POST /cap1/ketso` trước, `POST /cap2/ketso` sau.** Endpoint này **không bao giờ tạo hàng** và **không bao giờ tính lại** `gia_ra`/`pnl_*`/`closed_at` (chúng là của Cấp 1). Gọi lại là ghi đè cả 7 cờ, không 409. **Client phải bọc NON-FATAL.**

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap2/ketso' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6c209fa4-8b73-4e15-90d2-1f5be37ac086' \
  -d '{"order_id":"f3902b6e-8c41-4d75-a028-5b7ce19d4a37","cham_SL_cuoi_phien":true,"cham_SL_cat_dung_phien_ke":true,"giu_cham_SL_bao_nhieu_phien":1}'
~~~

**Ghi chú khi viết lại**

- ★★ **CẠM BẪY GHI ĐÈ**: cả 7 cột được assign **vô điều kiện** từ tham số, kể cả tham số mang giá trị default. Nghĩa là gọi lại **không kèm** `giu_cham_SL_bao_nhieu_phien` sẽ **XOÁ giá trị cũ về `null`**, và không kèm `cham_SL_cat_dung_phien_ke` sẽ **hạ nó về `false`** — có thể làm nhiệm vụ ② mất một lần đã tính. Client **phải luôn gửi đủ 7 field**. Nếu bản TS muốn ngữ nghĩa PATCH (chỉ ghi field có mặt), đó là **thay đổi hành vi có chủ ý** và phải phân biệt được "field vắng mặt" với "field = null".
- ★ **KHÔNG kiểm `order.status == FILLED`** ở đây (Cấp 1 có kiểm). Không cần thiết vì bước 4 đòi hàng `order_ketso` đã tồn tại, mà hàng đó chỉ được tạo cho lệnh BÁN đã FILLED. Đừng thêm phép kiểm — sẽ không sai, nhưng khác source.
- ★ **`cham_SL_cat_dung_phien_ke` LÀ ĐỊNH NGHĨA của "cắt lỗ đúng"** theo spec §9: giá chạm cắt lỗ cuối phiên → **bán ATO phiên kế**. Nó vào cả nhiệm vụ ② (vế 🛑) và thành phần B của điểm kỷ luật (+20/lần). Đừng suy nó ra từ giá — nó là **quan sát của user về round trip này**, do client báo lên (giống `cam_xuc` ở Cấp 1).
- ★ 4 cờ vi phạm (`cham_SL_khong_cat`, `cham_TP_giu_lam_hut`, `ban_som_khi_lo_nhe`, `nhoi_lenh_khi_lo`) **ĐƯỢC nhận từ client** và lưu như nguồn sự thật cho lệnh đó; nhưng **mọi số tổng hợp** (2 nhiệm vụ, điểm kỷ luật) đều **đi lại toàn bộ history** từ các cờ đã lưu, không bao giờ nhận counter từ client.
- ★ `cham_TP_giu_lam_hut = true` **triệt tiêu** vế chốt lời của ② cho round trip đó (điều kiện 4 của `_is_chot_loi_dung`), dù `gia_ra >= chot_loi`. Test `test_task2_ignores_a_touched_mark_the_user_did_not_act_on`.
- ★ `giu_cham_SL_bao_nhieu_phien` là **đo lường, không phải cờ**: `null` = **CHƯA BIẾT / không áp dụng**, `0` là một giá trị THẬT khác nghĩa. Cột có `server_default '0'` (di sản của `f809de621bd0`) nhưng schema request default `null` — nên đừng render `null` thành `0`.
- ★ Response **không mang progress** ⇒ client invalidate `GET /cap2/progress`. (Ở Cấp 2 endpoint này **đã** recompute, nên **không cần** ping `PATCH /cap2/task` như Cấp 1.)

---

### GET /api/v1/cap2/diem-ky-luat

> **Điểm kỷ luật của một ngày** — chấm 0-100 cho một ngày giao dịch kèm breakdown «số đến từ đâu» và câu giải thích tiếng Việt.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không (tính tại thời điểm gọi, **không persist ở đâu**) |
| **Nguồn dữ liệu** | tính toán — `order_kehoach` + `order_ketso` + `virtual_orders` của đúng một `trading_date` |
| **Side-effect** | không |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `ngay` | `string \| null` | Không | `null` → **hôm nay theo giờ Việt Nam (UTC+7)** | `format: date`, `"YYYY-MM-DD"` | Ngày cần chấm. Không giới hạn quá khứ/tương lai — ngày tương lai chỉ đơn giản không có lệnh nào |

**Request body** — —

**Response 200** — `DiemKyLuatOut`.

~~~ts
type Response = DiemKyLuatOut;
~~~

Ví dụ (một round trip hoàn hảo trong ngày — đúng con số test khoá `80/140*100`):

~~~json
{
  "ngay": "2026-08-17",
  "co_giao_dich": true,
  "co_tinh_huong": true,
  "diem": 57.142857142857146,
  "xep_loai": "do",
  "giai_thich": "Có vi phạm đáng chú ý: kế hoạch 40/40 + cắt lỗ đúng 20/40 + không nhồi 10/30 + chốt lời đúng 10/30.",
  "thanh_phan": {
    "ke_hoach": 40,
    "ke_hoach_toi_da": 40,
    "cat_lo_dung": 20,
    "cat_lo_dung_toi_da": 40,
    "khong_nhoi": 10,
    "khong_nhoi_toi_da": 30,
    "chot_loi_dung": 10,
    "chot_loi_dung_toi_da": 30
  }
}
~~~

Ngày không đặt lệnh nào:

~~~json
{
  "ngay": "2026-08-16",
  "co_giao_dich": false,
  "co_tinh_huong": false,
  "diem": null,
  "xep_loai": null,
  "giai_thich": "Ngày không đặt lệnh nào — không chấm điểm.",
  "thanh_phan": null
}
~~~

Ngày có mua nhưng chưa bán gì (không có tình huống thử thách kỷ luật) — ★ `diem` là điểm **THÔ 0-40 chưa chuẩn hoá**, `xep_loai` là `null`:

~~~json
{
  "ngay": "2026-08-18",
  "co_giao_dich": true,
  "co_tinh_huong": false,
  "diem": 20,
  "xep_loai": null,
  "giai_thich": "Ngày không có tình huống thử thách kỷ luật — điểm tính theo phần kế hoạch (tối đa 40).",
  "thanh_phan": {
    "ke_hoach": 20,
    "ke_hoach_toi_da": 40,
    "cat_lo_dung": 0,
    "cat_lo_dung_toi_da": 40,
    "khong_nhoi": 0,
    "khong_nhoi_toi_da": 30,
    "chot_loi_dung": 0,
    "chot_loi_dung_toi_da": 30
  }
}
~~~

**Lỗi**

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap2_progress` (chưa vào Cấp 2) | `Không tìm thấy tiến trình Cấp 2` |
| — | 422 | — | `ngay` không đúng định dạng `YYYY-MM-DD` | `HTTPValidationError` |

**Fallback / suy giảm** — **Ba trạng thái, không hai** (xem «Nghiệp vụ nền» mục 12): (a) không lệnh nào → `diem = null`, `thanh_phan = null`, `co_giao_dich = false`; (b) có lệnh nhưng chưa có kết sổ nào trong ngày → `diem` là điểm **thô 0-40**, `xep_loai = null`, `thanh_phan` đầy đủ; (c) có kết sổ → `diem` chuẩn hoá 0-100 + `xep_loai`. Ngày cuối tuần / ngày lễ / ngày tương lai đều rơi vào (a). Không phụ thuộc provider ngoài, không phụ thuộc giờ giao dịch. `giai_thich` **luôn** có chuỗi (không bao giờ null) — FE hiện **nguyên văn**, đừng tự sinh câu khác.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap2/diem-ky-luat?ngay=2026-08-17' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: f2b6014d-7a38-4e95-b0c1-635de89af720'
~~~

**Ghi chú khi viết lại**

- ★ **Công thức đầy đủ + thang điểm + xếp loại: xem «Nghiệp vụ nền» mục 12** — chép nguyên, kể cả mẫu số `140` và việc một round trip hoàn hảo chỉ đạt ~57.14 (`do`). Test `test_diem_ky_luat_full_formula_with_test_situations` khoá đúng con số này. **Đừng "sửa" mẫu số cho đẹp.**
- ★ **Ngày mặc định theo giờ VIỆT NAM (UTC+7)**, không phải UTC: `datetime.now(timezone(timedelta(hours=7))).date()`. Dùng UTC sẽ lệch ngày từ 00:00-07:00 giờ VN — nghĩa là mọi request buổi sáng sớm chấm sai ngày.
- ★ Cả hai truy vấn lọc theo **`virtual_orders.trading_date == ngay`**, nên `ketso_rows` được gom theo `trading_date` của lệnh **BÁN**, không theo `order_ketso.closed_at`. Đây là hai mốc khác nhau — đừng đổi.
- ★ Cả hai truy vấn lọc **`mode = 'thuc_chien'`** ⇒ với user FREE, mọi ngày đều là trạng thái (a) «không đặt lệnh nào».
- ★ Thành phần A khi **không có lệnh mua nào trong ngày**: `ty_le_du = 1.0` (không có gì để thiếu ⇒ **đầy đủ mặc định**), nên `ke_hoach = 40`. Đừng để phép chia cho 0.
- ★ Thành phần C **cộng điểm cho việc KHÔNG vi phạm** (`count(nhoi_lenh_khi_lo === false) × 10`), không phải trừ điểm khi vi phạm. Một ngày 3 lệnh không nhồi được `min(30, 30) = 30`.
- ★ Thành phần D dùng `_is_chot_loi_dung` với kế hoạch của **chân MUA khớp**, cùng xấp xỉ một lô như nhiệm vụ ②. Vòng lặp này cũng là N+1 query — được phép tối ưu, **miễn giữ nguyên kết quả**.
- ★ `thanh_phan.*_toi_da` là **hằng số** (40/40/30/30) và **luôn được trả kèm** để FE hiện "40/40" mà không hard-code trần. Giữ chúng trong response.
- ★ Endpoint này **không còn nằm trong hành trình Cấp 2** (mockup mới bỏ khỏi Hành trình và Phân tích danh mục) nhưng **BẮT BUỘC vẫn mount**: Cấp 3 dùng chính phép tính này server-side (`Cap3Progress.diem_ky_luat_tb_cap3`) và trang giao dịch Cấp 6/7 vẫn đọc endpoint. Đừng xoá vì "FE Cấp 2 không dùng".
- `diem` là float, có thể có nhiều chữ số thập phân (`57.142857142857146`). FE tự làm tròn khi hiện; **API không làm tròn** (chỉ `giai_thich` làm tròn 0 chữ số).

---

### POST /api/v1/cap2/graduate

> **Tốt nghiệp Cấp 2** — chốt tốt nghiệp khi đủ 2/2 nhiệm vụ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — đọc `cap2_progress` |
| **Side-effect** | UPDATE `cap2_progress.graduated_at` + `time_to_graduate_hours` (chỉ lần đầu). **KHÔNG** tạo hàng Cấp 3, **KHÔNG** email/Telegram/audit log |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap2ProgressOut` (đã có `graduated_at`).

~~~ts
type Response = Cap2ProgressOut;
~~~

~~~json
{
  "id": "5b1c8e42-9074-4a36-bd5f-e28031a6c7f9",
  "user_id": "b21d7e04-5c93-4f28-a610-8de3f95c1b77",
  "entered_at": "2026-08-18T01:05:47.226813+00:00",
  "task_1_done_at": "2026-08-18T09:14:36.482091+00:00",
  "task_2_done_at": "2026-08-18T08:22:41.703558+00:00",
  "so_lenh_co_cl_tp": 10,
  "so_lan_cat_lo_dung": 1,
  "so_lan_chot_loi_dung": 1,
  "so_lan_thuc_hien_dung": 2,
  "graduated_at": "2026-08-18T09:15:10.049237+00:00",
  "time_to_graduate_hours": 8.156339
}
~~~

**Lỗi**

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 1 | 404 | `NOT_FOUND` | Chưa có hàng `cap2_progress` | `Không tìm thấy tiến trình Cấp 2` |
| 2 | 409 | `CONFLICT` | Thiếu `task_1_done_at` **hoặc** `task_2_done_at` | `Chưa hoàn thành đủ 2 nhiệm vụ Cấp 2` |

**Fallback / suy giảm** — Idempotent: gọi lại trả hàng cũ, `graduated_at`/`time_to_graduate_hours` **không** bị ghi lại. ★ **KHÔNG recompute trước khi kiểm** ⇒ client phải `PATCH /cap2/task` trước khi mở nút tốt nghiệp. Tốt nghiệp được ngoài giờ giao dịch.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap2/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5a1d78be-63f0-4c29-b784-e0925c31fa46'
~~~

**Ghi chú khi viết lại**

- ★ Thứ tự bắt buộc: đọc hàng → `task_1_done_at != null AND task_2_done_at != null` → **409 trước khi ghi gì** → chỉ khi đủ mới stamp.
- ★ **Đạt 2/2 KHÔNG phải là tốt nghiệp.** Migration `8f1a5c7d2e64` nói rõ: nó cố ý **không** chạm `graduated_at` — tốt nghiệp là **hành động của user** qua endpoint này, có "khoảnh khắc tốt nghiệp" riêng và `time_to_graduate_hours` riêng. Đừng auto-graduate trong `_recompute_progress`.
- `time_to_graduate_hours = (now - entered_at).total_seconds() / 3600.0`, **giờ**, float; `entered_at` naive coi là UTC.
- Không tự tạo hàng Cấp 3. FE gọi `POST /cap3/enter` và chỉ khi `CAP_MAX_ENABLED >= 3` (hiện là 3 → **có gọi**). Chi tiết Cấp 3: chương `33-endpoints-cap-3-4.md`.
- ★ Luật bất di bất dịch: nếu Cấp 2 là cấp trần thì nút CTA modal tốt nghiệp **vẫn phải bấm được** và vẫn ghi về server.

---

## Ghi chú tổng hợp khi viết lại

1. **Ba cấp KHÔNG đối xứng — bảng đối chiếu là hợp đồng, không phải gợi ý.**

   | | Cấp 0 | Cấp 1 | Cấp 2 |
   |---|---|---|---|
   | Số endpoint | 7 | 6 | 7 |
   | `enter` / `progress` / `task` / `graduate` | ✓ | ✓ | ✓ |
   | `POST /kehoach` | ✓ (**upsert**, bảng RIÊNG `cap0_order_kehoach`) | ✓ (**409** nếu đã có, bảng chung `order_kehoach`) | ✓ (**UPDATE** hàng Cấp 1, 404 nếu chưa có) |
   | `GET /kehoach` | ✓ (khoá theo `order_id`) | ✗ | ✗ |
   | `POST /ketso` | ✗ | ✓ (INSERT + tính pnl) | ✓ (UPDATE 7 cờ, 404 nếu chưa có) |
   | `POST /placement` | ✓ | ✗ | ✗ |
   | Endpoint riêng khác | — | — | `GET /diem-ky-luat` |
   | Số nhiệm vụ | 4 + 1 cổng | 5 | 2 (song song) |
   | Nhiệm vụ do ai đóng | **client PATCH** | **server suy ra 100%** | **server suy ra 100%** |
   | `GET /progress` recompute? | không | không | không |
   | `graduate` recompute? | không (không cần) | **không** ★ | **không** ★ |

2. **`task_no` — hai chế độ validate khác nhau, đừng đồng bộ hoá.** Cấp 0 dùng `Field(ge=1, le=4)` ⇒ ngoài khoảng là **422** (Pydantic). Cấp 1 (`int` trơn, service kiểm 1-5) và Cấp 2 (`int` trơn, service kiểm 1-2) ⇒ ngoài khoảng là **400** với `detail: "task_no không hợp lệ"`. Client đang phân biệt hai vỏ lỗi này.

3. **Tên field mixedCase nguyên văn spec — KHÔNG đổi sang snake_case**: `lyDo`, `trangThai_luc_dat` (Cấp 1); `cham_SL_cuoi_phien`, `cham_SL_cat_dung_phien_ke`, `cham_SL_khong_cat`, `giu_cham_SL_bao_nhieu_phien`, `cham_TP_giu_lam_hut` (Cấp 2). Cột DB cũng mang đúng tên đó (trong Postgres phải trích dẫn kép). Đổi là breaking change với FE hiện tại.

4. **Tên field request ≠ tên field response ở hai chỗ, cố ý**: `snapshot` (request) → `snapshot_lop_du_lieu` (response/cột) ở `POST /cap1/kehoach`. Đừng "chuẩn hoá".

5. **Đơn vị, không được đoán**: `virtual_balance_init`, `vung_mua`, `cat_lo`, `chot_loi`, `gia_vao`, `gia_ra`, `pnl_vnd` — **VND** (`vung_mua`/`cat_lo`/`chot_loi`/`gia_*` là VND **trên một cổ phiếu**; `pnl_vnd` và `virtual_balance_init` là VND tổng). `pnl_pct` — **phần trăm** (2.34 = +2.34%), không phải tỷ lệ 0.0234. `time_to_graduate_hours` — **giờ** (float). `so_phien_giu` — **phiên T2-T6**. `so_ngay_lich` — **ngày dương lịch**. `diem` — thang 0-100 ở nhánh (c), nhưng **0-40 thô** ở nhánh (b).

6. **Sắp xếp**: `_cap2_ketso_rows` `ORDER BY OrderKetso.closed_at ASC` (cũ → mới) — thứ tự này quyết định round trip nào được tính khi đủ 2 lần; `_find_matching_sell` `ORDER BY created_at ASC LIMIT 1` (**sớm nhất** ở/sau); `_find_matching_buy` / `_find_matching_kehoach` `ORDER BY created_at DESC LIMIT 1` (**gần nhất** ở/trước). Ba hướng sắp xếp khác nhau — đừng gom thành một helper "tìm lệnh đối ứng".

7. **`ORDER BY` nào đi với `LIMIT 1` thì phải giữ nguyên chiều**; sai chiều `_find_matching_sell` làm `so_phien_giu` của Cấp 0 báo theo lệnh bán cuối cùng thay vì lệnh đóng round trip đó (đúng bug đã có test khoá).

8. **Ép chuyển kiểu**: `int(vung_mua)`, `int(cat_lo)`, `int(chot_loi)` — **cắt phần thập phân** (`Math.trunc`), không `Math.round`.

9. **Timestamp**: mọi `now()` là `datetime.now(UTC)` (aware). Trong `graduate`, `entered_at` naive phải được coi là UTC trước khi trừ. Riêng ngày mặc định của `diem-ky-luat` là **UTC+7**. Hai múi giờ khác nhau trong cùng một cấp — đọc lại mục 12 trước khi viết.

10. **404 chứ không 403 cho tài nguyên của người khác**: mọi `get_order_by_id` đều kiểm `order.user_id != me` rồi ném `NotFoundError("lệnh")`. `GET /cap0/kehoach` còn đưa phân quyền vào chính câu JOIN. Giữ nguyên — không tiết lộ sự tồn tại.

11. **`null` là "CHƯA BIẾT", không phải 0** — xem bảng đầy đủ ở «Nghiệp vụ nền» mục 8. Ba chỗ đã từng in sai: `so_phien_giu`, `giu_cham_SL_bao_nhieu_phien`, `DiemKyLuatOut.xep_loai`.

12. **Chống «graduation fraud»** — 4 luật không được vi phạm: (a) `PATCH /capN/task` **không stamp theo `task_no`** (Cấp 1/2); (b) mọi counter đếm lại bằng SQL trên dữ liệu nguồn, không nhận từ payload; (c) `graduate` kiểm lại toàn bộ điều kiện trên hàng đọc trong cùng transaction, **kiểm trước khi ghi**; (d) `graduate` idempotent, không ghi lại `graduated_at`. Đọc thêm điểm (e)(f)(g) ở «Nghiệp vụ nền» mục 7 — chúng nói thật về những gì server **chưa** kiểm.

13. **`POST /capN/kehoach` và `POST /capN/ketso` KHÔNG trả progress.** Client bắt buộc invalidate/refetch `GET /capN/progress`, và **phải bọc mọi lời gọi kehoach là NON-FATAL** — lỗi ở đây không được ném ra luồng "lệnh đã khớp" và không được chặn `onOrderFilled` (đó chính là lỗi đã sửa ở commit `7a057a3`). Riêng sau `POST /cap1/ketso` còn phải ping `PATCH /cap1/task` (vì `record_ketso` không recompute) — ping đi **sau** khi ketso ghi xong.

14. **Bảng dùng chung**: `order_kehoach` và `order_ketso` là **một bảng vật lý cho Cấp 1 → Cấp 8**, không có cột `cap_level`. Cấp được suy ra từ cột nào đã điền (`cat_lo`/`chot_loi` non-null ⇒ đã qua Cấp 2) hoặc từ cửa sổ thời gian (`closed_at >= cap2_progress.entered_at`) khi cột có server_default. Cấp 0 **không** dùng hai bảng này. Chi tiết + 4 lý do ở «Nghiệp vụ nền» mục 9.

15. **`CAP_MAX_ENABLED = 3`, chỉ tồn tại ở FE** (`dashboard/src/features/cap1/capFlags.ts`). Backend không có cổng cấp nào: `POST /cap2/enter` vẫn tạo hàng thật nếu tiên quyết đủ. Thêm cổng server = thay đổi hành vi có chủ ý, và phải giữ luật "nút tốt nghiệp ở cấp trần vẫn ghi được về server".

16. **FREE về HTTP ≠ FREE về tiến độ.** Cấp 0 tốt nghiệp được hoàn toàn bằng FREE (`san_tap`, T0). Từ Cấp 1 trở lên mọi phép đếm lọc `mode = 'thuc_chien'`, mà `mode = "thuc_chien" if is_premium else "san_tap"` ⇒ user FREE bị 409 vĩnh viễn ở `graduate` của Cấp 1 và Cấp 2, và `diem-ky-luat` luôn trả «không đặt lệnh nào». Cổng Premium nằm ở tầng đặt lệnh, không ở tầng cấp. **Đây là hành vi hiện tại của source, không phải lỗi tài liệu.**

17. **Bộ nhiệm vụ phải lấy bản MỚI NHẤT**: Cấp 0 = `5c7d2e9a4f18` (4 nhiệm vụ, không tour) — **không** dùng `9a4c2f1e7b60` (5 nhiệm vụ); Cấp 1 = `4d8e6b2a1c93` (5 nhiệm vụ, bỏ «Xem lại danh mục»); Cấp 2 = `8f1a5c7d2e64` (2 nhiệm vụ song song) — **không** dùng bộ 5 nhiệm vụ + chuỗi kỷ luật của `f809de621bd0`. Các cột đã xoá **không được xuất hiện lại trên wire**; ba test `test_capN_endpoints_wired_and_free` khoá đúng danh sách cấm.

18. **Không endpoint nào trong 20 endpoint dùng Redis cache, gọi provider ngoài, gửi email/Telegram, hay ghi audit log.** Toàn bộ là Postgres. Rate limit là mặc định `60/minute` per-IP. Vì vậy mục «Fallback / suy giảm» của cả 20 endpoint không có nhánh "provider lỗi" — nhánh suy giảm duy nhất là **thiếu dữ liệu** (`null`, `200 null`, hoặc trạng thái (a)/(b) của `diem-ky-luat`).
