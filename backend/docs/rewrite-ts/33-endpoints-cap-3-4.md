# Endpoint — Đấu trường Cấp 3, 4

Chương này đặc tả **14 endpoint** của hai cấp giữa chương trình «Đấu trường»: Cấp 3 «Bản lĩnh» (quản lý vốn — khẩu vị rủi ro, mức tự tin, khối lượng mua, Thách thức Bản lĩnh) và Cấp 4 «Thuần thục» (đọc + tự chấm cả 5 lớp, vũ khí / điểm mù đo bằng kết quả thật, Thách thức Thuần thục). Mỗi cấp có đúng 7 endpoint và **KHÔNG cấp nào có `ketso`** — dữ liệu kết sổ của cả hai cấp đến từ `POST /api/v1/cap1/ketso` (+ `POST /api/v1/cap2/ketso` cho 4 cờ vi phạm kỷ luật), xem mục «Nghiệp vụ nền».

Toàn bộ mã nguồn tham chiếu: `app/api/v1/endpoints/cap3.py`, `cap4.py`; `app/schemas/cap3.py`, `cap4.py`; `app/services/cap3/service.py`, `cap4/service.py`; `app/models/cap3.py`, `cap4.py`; `app/models/cap1.py` (bảng `order_kehoach` / `order_ketso` dùng chung); `tests/test_cap3.py`, `tests/test_cap4.py`. Migration: `ee69ea647b02_add_cap3_khau_vi_rui_ro_muc_tu_tin_khoi_.py`, `9c2e4b71fa30_cap3_diem_ky_luat_tb_nullable_chua_biet.py`, `b76c7019f77b_add_cap4_doc_5_lop.py`.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/v1/cap3/progress` | Bearer | Tiến độ Cấp 3 (hoặc `null` nếu chưa vào) — **tính lại + ghi DB** mỗi lần gọi |
| POST | `/api/v1/cap3/enter` | Bearer | Vào Cấp 3 (idempotent) — bắt buộc đã tốt nghiệp Cấp 2 |
| POST | `/api/v1/cap3/khau-vi` | Bearer | Đặt/đổi khẩu vị rủi ro (hồ sơ, đổi được nhiều lần) |
| PATCH | `/api/v1/cap3/task` | Bearer | Kích hoạt tính lại 3 nhiệm vụ (KHÔNG tự đặt xong nhiệm vụ) |
| POST | `/api/v1/cap3/kehoach` | Bearer | Ghi khối «Quản lý vốn» vào kế hoạch Cấp 1 của một lệnh MUA |
| GET | `/api/v1/cap3/thach-thuc` | Bearer | 3 điều kiện Thách thức Bản lĩnh + giá trị hiện tại + giải thích |
| POST | `/api/v1/cap3/graduate` | Bearer | Tốt nghiệp Cấp 3 — chỉ khi đủ 3/3 nhiệm vụ |
| GET | `/api/v1/cap4/progress` | Bearer | Tiến độ Cấp 4 (hoặc `null` nếu chưa vào) — **tính lại + ghi DB** mỗi lần gọi |
| POST | `/api/v1/cap4/enter` | Bearer | Vào Cấp 4 (idempotent) — bắt buộc đã tốt nghiệp Cấp 3 |
| PATCH | `/api/v1/cap4/task` | Bearer | Kích hoạt tính lại 3 nhiệm vụ (KHÔNG tự đặt xong nhiệm vụ) |
| POST | `/api/v1/cap4/kehoach` | Bearer | Ghi khối «Đọc 5 lớp» (tự chấm 5 lớp + đối chiếu AI) vào kế hoạch Cấp 1 |
| GET | `/api/v1/cap4/vu-khi-diem-mu` | Bearer | % thắng THẬT của từng lớp khi user tự đọc lớp đó là «Ủng hộ» |
| GET | `/api/v1/cap4/thach-thuc` | Bearer | 3 điều kiện Thách thức Thuần thục + giá trị hiện tại + giải thích |
| POST | `/api/v1/cap4/graduate` | Bearer | Tốt nghiệp Cấp 4 — chỉ khi đủ 3/3 nhiệm vụ |

**Không có endpoint nào của hai cấp này yêu cầu Premium** (`CurrentUser`, không phải `PremiumUser` — xem docstring đầu `app/api/v1/endpoints/cap3.py`: *"Cap 3 is FREE"*). Nhưng đọc kỹ mục «Thực chiến vs sân tập» bên dưới: FREE **về mặt HTTP** không có nghĩa FREE **về mặt tiến độ**.

---

## Kiểu dữ liệu dùng chung

~~~ts
/** Khẩu vị rủi ro — enum `KhauViRuiRo` (app/models/cap1.py).
 *  than_trong = trần 10% vốn/lệnh · can_bang = trần 20% (mặc định gợi ý) · tan_cong = trần 30%.
 *  (Các mức trần này là chú thích trong enum; server KHÔNG cưỡng chế chúng — xem ghi chú
 *   ở POST /cap3/kehoach.) */
type KhauVi = "than_trong" | "can_bang" | "tan_cong";

/** Mức tự tin lúc đặt lệnh — 1 = Thấp, 2 = Vừa, 3 = Cao (chú thích cột
 *  `order_kehoach.muc_tu_tin`). Chỉ nhận đúng 3 giá trị này. */
type MucTuTin = 1 | 2 | 3;

/** Cách tính khối lượng mua — enum `CachKhoiLuong` (app/models/cap1.py).
 *  linh_hoat = Cách 1 «khẩu vị × tự tin» · ky_luat = Cách 2 «chia đều theo khẩu vị». */
type CachKhoiLuong = "linh_hoat" | "ky_luat";

/** 5 lớp của Cấp 4 == 5 khoá `LyDo` của Cấp 1 (LOP_KEYS trong app/models/cap4.py).
 *  Thứ tự này là THỨ TỰ CHUẨN dùng để phá thế hoà khi chọn vũ khí / điểm mù. */
type Lop = "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia";

/** Nhãn hiển thị của từng lớp — LOP_LABELS (app/models/cap4.py). Server trả kèm
 *  trong `LopWinRate.ten`, client KHÔNG cần tự map. */
const LOP_LABELS: Record<Lop, string> = {
  ky_thuat: "Kỹ thuật",
  dong_tien: "Dòng tiền",
  noi_bo: "Nội bộ",
  tin_tuc: "Tin tức",
  dinh_gia: "Định giá",
};

/** 3 mức tự chấm mỗi lớp — enum `NhanDinhLop` (app/models/cap4.py).
 *  ok = «Ủng hộ» · neu = «Trung tính» · bad = «Ngược chiều» (_MUC_LABELS trong service). */
type NhanDinhLop = "ok" | "neu" | "bad";

/** Nhãn kết luận cho một lớp ở GET /cap4/vu-khi-diem-mu.
 *  chua_du_du_lieu = chưa đạt 3 lệnh đã đóng cho lớp đó.
 *  `null` = đủ dữ liệu nhưng % thắng nằm GIỮA 50% và 70% → không phải vũ khí, cũng
 *  không phải điểm mù. Hai trạng thái này KHÁC NHAU, đừng gộp. */
type NhanVuKhi = "vu_khi" | "diem_mu" | "chua_du_du_lieu";

/** Vỏ lỗi chuẩn của toàn app (app/main.py — handler cho AppException). */
interface ErrorEnvelope {
  detail: string;
  code:
    | "NOT_FOUND"
    | "CONFLICT"
    | "BAD_REQUEST"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "UNPROCESSABLE_ENTITY"
    | "SERVICE_UNAVAILABLE"
    | null;
}

/** Một điều kiện con của nhiệm vụ ③ — Cấp 3 (app/schemas/cap3.py::ThachThucDieuKien).
 *  ★ `gia_tri_hien_tai` NULLABLE ở Cấp 3: null = "CHƯA BIẾT", KHÔNG phải 0. */
interface Cap3ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number | null;
  muc_tieu: number;
  dat: boolean;
  giai_thich: string;
}

/** Một điều kiện con của nhiệm vụ ③ — Cấp 4 (app/schemas/cap4.py::ThachThucDieuKien).
 *  ★ KHÁC Cấp 3: `gia_tri_hien_tai` KHÔNG nullable — cả 3 chỉ số của Cấp 4 luôn đo được. */
interface Cap4ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  giai_thich: string;
}
~~~

**Bẫy tên trùng:** hai cấp đều có schema tên `KehoachRequest`, `OrderKehoachOut`, `TaskRequest`, `ThachThucDieuKien`, `ThachThucOut`, và OpenAPI phải phân biệt chúng bằng tiền tố module (`app__schemas__cap3__KehoachRequest` vs `app__schemas__cap4__KehoachRequest`). Khi viết lại bằng TypeScript **phải đặt tên khác nhau** (`Cap3KehoachRequest` / `Cap4KehoachRequest`, …) — nội dung chúng hoàn toàn khác nhau.

---

## Nghiệp vụ nền

#### 1. Chuỗi cấp và điều kiện tiên quyết

Cấp 0 → 1 → 2 → 3 → 4 → … → 8. Mỗi cấp có bảng `capN_progress` **một hàng / một user** (`UniqueConstraint(user_id)`).

| Cấp | Bảng | Điều kiện `enter` | Nếu không đủ |
|---|---|---|---|
| 3 | `cap3_progress` | tồn tại `cap2_progress` VÀ `cap2_progress.graduated_at IS NOT NULL` | 404 nếu không có hàng Cấp 2; 409 `"Chưa tốt nghiệp Cấp 2"` |
| 4 | `cap4_progress` | tồn tại `cap3_progress` VÀ `cap3_progress.graduated_at IS NOT NULL` | 404 nếu không có hàng Cấp 3; 409 `"Chưa tốt nghiệp Cấp 3"` |

Thứ tự kiểm tra trong `enter` (KHÔNG được đổi): (1) đã có hàng của chính cấp này → trả về ngay, idempotent, **không kiểm tra tiên quyết nữa**; (2) chưa có → mới kiểm cấp trước.

#### 2. Recompute-on-read: mọi endpoint đều là WRITE

`Cap3Service._recompute_progress` / `Cap4Service._recompute_progress` được gọi trong **cả `GET /progress`**, `PATCH /task`, `POST /kehoach`, `GET /thach-thuc`, `GET /cap4/vu-khi-diem-mu` và `POST /graduate`. Chúng ghi lại: các cột chỉ số, các mốc `task_N_done_at`, và (Cấp 3) `von_ban_dau`. `get_db` commit ở cuối mọi request (kể cả GET) — nên **GET cũng sinh UPDATE**.

Hệ quả cho bản TypeScript/NestJS:

- Không đặt các endpoint này sau một `@ReadOnly()` / replica routing nào.
- Mọi con số client thấy đều **suy lại từ history**, không bao giờ tin bộ đếm client gửi lên.
- `POST /enter` là **ngoại lệ duy nhất**: nó KHÔNG recompute. Hàng mới trả về mang toàn giá trị mặc định (`von_ban_dau = 100000000`, `so_lenh_cap3 = 0`, …). FE phải gọi `GET /progress` ngay sau `enter` nếu muốn số thật. (`tests/test_cap3.py::test_cap3_endpoints_wired_and_free` kiểm chính điều này: ngay sau `enter`, `von_ban_dau` là 100 000 000 dù tài khoản ảo mở ở mức khác.)

#### 3. «Lệnh» nghĩa là gì — và kết sổ ở đâu ra (KHÔNG có `POST /capN/ketso`)

Đối chiếu bản cắt OpenAPI: nhóm này có đúng 14 operation, **không có `/cap3/ketso` cũng không có `/cap4/ketso`**. Lý do (docstring `app/services/cap3/service.py`, `cap4/service.py`): Cấp 3 và Cấp 4 **không thêm cột nào vào `order_ketso`** — chúng chỉ thêm cột vào `order_kehoach`. Hàng `order_ketso` được tạo bởi:

- `POST /api/v1/cap1/ketso` — tạo hàng kết sổ (giá ra, số phiên giữ, `pnl_pct`, `pnl_vnd`, `closed_at`, cảm xúc).
- `POST /api/v1/cap2/ketso` — ghi thêm 4 cờ vi phạm kỷ luật lên **cùng hàng đó** (`cham_SL_cat_dung_phien_ke`, `nhoi_lenh_khi_lo`, …).

Cấp 3/4 chỉ **ĐỌC** `order_ketso`. Do đó luồng FE ở Cấp 3/4 vẫn phải gọi `cap1/ketso` (+ `cap2/ketso`) khi đóng lệnh, nếu không thì `so_lenh_cap3`, `lai_pct_cap3`, `diem_ky_luat_tb_cap3`, mọi % thắng của Cấp 4 sẽ đứng yên.

Định nghĩa «lệnh» khác nhau giữa hai cấp — **đây là điểm dễ sai nhất**:

| Chỉ số | Đơn vị đếm | Cửa sổ thời gian |
|---|---|---|
| `cap3.so_lenh_cap3`, `cap3.lai_pct_cap3` | hàng `order_ketso` (một vòng mua→bán đã đóng) | `OrderKetso.closed_at >= cap3_progress.entered_at` |
| `cap4.so_lenh_doc_du_5lop` | hàng `order_kehoach` có `doc_5_lop` chấm đủ 5 lớp (lệnh MUA, **mở hay đóng đều tính**) | **KHÔNG có cửa sổ** — xem mục 4 |
| `cap4` % thắng từng lớp, `ty_le_thang_dong_thuan_cao` | cặp (kế hoạch MUA, kết sổ) đã đóng | **KHÔNG có cửa sổ** |
| `cap4` nhiệm vụ ② | hàng `order_ketso` bất kỳ | `OrderKetso.closed_at >= cap4_progress.entered_at` |
| `cap3.diem_ky_luat_tb_cap3` | từng NGÀY có hoạt động Thực chiến | `VirtualOrder.trading_date >= cap3_progress.entered_at.date()` |

#### 4. Vì sao một số truy vấn KHÔNG lọc theo `entered_at`

Docstring `Cap3Service._cap3_kehoach_du_dieu_kien` và `Cap4Service._cap4_kehoach_rows` giải thích: (1) các cột đó **chỉ có thể** được ghi qua `POST /capN/kehoach`, mà endpoint đó đòi phải có hàng progress → hàng nào có cột đó thì đương nhiên thuộc thời kỳ của cấp; (2) `VirtualOrder.created_at` lấy từ `server_default=func.now()` độ chính xác thấp, còn `entered_at` là timestamp Python micro-giây → so sánh trong cùng một giây có thể sai lệch. **Giữ nguyên hành vi này khi viết lại** — nếu tự ý thêm `WHERE created_at >= entered_at` sẽ làm mất nhiệm vụ ① của những user đặt lệnh ngay giây đầu vào cấp.

#### 5. Thực chiến vs sân tập — FREE vs Premium (RẤT QUAN TRỌNG)

Mọi truy vấn của Cấp 3/4 đều có `VirtualOrder.mode == "thuc_chien"`. Nhưng `VirtualTradingService.place_order` gán:

~~~
mode = "thuc_chien" if is_premium else "san_tap"
~~~

(`is_premium` = `app.api.deps.is_premium_active`, trong đó **admin luôn tính là premium**.)

Kết luận phải ghi vào tài liệu FE: người dùng FREE gọi được **mọi** endpoint Cấp 3/4 (HTTP 200), nhưng mọi lệnh họ đặt đều là `san_tap` nên **không lệnh nào được đếm** — `so_lenh_cap3` mãi là 0, `so_lenh_doc_du_5lop` mãi là 0, nhiệm vụ ①②③ không bao giờ xong, `graduate` mãi trả 409. Đây là hành vi hiện tại của source, không phải bug ở tài liệu: cổng Premium nằm ở tầng đặt lệnh, không nằm ở tầng cấp.

(Đối chiếu: Cấp 0 là cấp duy nhất chạy trên `san_tap`. Từ Cấp 1 trở lên, tất cả đều Thực chiến-only.)

#### 6. `CAP_MAX_ENABLED` — trần cấp

`CAP_MAX_ENABLED` **KHÔNG tồn tại ở backend**. `grep -rn "CAP_MAX" app/ alembic/` → không có kết quả. Nó là hằng số **frontend duy nhất một chỗ**: `dashboard/src/features/cap1/capFlags.ts`.

**Giá trị HIỆN TẠI: `export const CAP_MAX_ENABLED = 3`** (từng là 2, đã mở lên 3 — commit `8f868dd feat(cap3): MỞ Cấp 3 «Bản lĩnh» — CAP_MAX_ENABLED 2 → 3`).

Hệ quả cần ghi rõ:

- Backend **không chặn gì**: `POST /api/v1/cap4/enter` của một user đã tốt nghiệp Cấp 3 sẽ **thành công 200** và tạo thật một hàng `cap4_progress`, dù Cấp 4 chưa mở trên UI. Không có 403/404 «cấp chưa mở».
- Vì vậy trách nhiệm chặn nằm ở client: theo docstring `capFlags.ts`, mỗi nhánh cấp N chỉ sống khi `CAP_MAX_ENABLED >= N`, nên `GET /capN/progress` và `POST /capN/enter` của cấp chưa mở **không bao giờ được bắn ra**. Gọi khi cấp chưa mở là *"tạo THẬT một hàng progress trên server cho một cấp user không vào được"*.
- Với `CAP_MAX_ENABLED = 3`: 7 endpoint Cấp 3 đang được FE gọi thật; 7 endpoint Cấp 4 đã có trên server nhưng FE chưa gọi. **Vẫn phải implement đầy đủ cả 14** — mở Cấp 4 chỉ là sửa một dòng ở FE.
- Nếu bản viết lại muốn thêm cổng backend, đó là **thay đổi hành vi**, phải hỏi trước; và luật bất di bất dịch của FE là nút CTA màn tốt nghiệp ở cấp trần **vẫn phải ghi tốt nghiệp về server** (modal `closable={false}` → disable nút sẽ nhốt vĩnh viễn user đã xong nhiệm vụ).

#### 7. Cấp 3 «Bản lĩnh» — 3 nhiệm vụ

| Mã task | Tên hiển thị (nghiệp vụ) | Điều kiện hoàn thành (server tự suy) | Cổng mở | Client PATCH có tự đặt được? |
|---|---|---|---|---|
| `task_1_done_at` | ① Ghi khối Quản lý vốn | tồn tại ≥1 hàng `order_kehoach` (join `VirtualOrder`, `mode='thuc_chien'`, cùng user) có **cả 3** cột `khau_vi`, `muc_tu_tin`, `cach_khoi_luong` khác NULL | **không có cổng** | KHÔNG |
| `task_2_done_at` | ② Kết sổ đầu tiên của Cấp 3 | `so_lenh_cap3 >= 1` (số hàng `order_ketso` Thực chiến đóng từ `entered_at`) | **gated: chỉ xét khi `task_1_done_at IS NOT NULL`** | KHÔNG |
| `task_3_done_at` | ③ Thách thức Bản lĩnh | ĐỒNG THỜI: `lai_pct_cap3 >= 5.0` **VÀ** `so_lenh_cap3 >= 15` **VÀ** `diem_ky_luat_tb_cap3 IS NOT NULL` **VÀ** `diem_ky_luat_tb_cap3 >= 80.0` | **không có cổng** (đánh giá từ lúc vào cấp) | KHÔNG |

Hằng số (đầu `app/services/cap3/service.py`): `_TASK3_LAI_PCT_MIN = 5.0`, `_TASK3_SO_LENH_MIN = 15`, `_TASK3_DIEM_MIN = 80.0`, `_TASK_NOS = (1, 2, 3)`.

Công thức:

- `so_lenh_cap3 = COUNT(order_ketso)` với join `VirtualOrder.user_id = user`, `mode='thuc_chien'`, `closed_at >= entered_at`.
- `lai_pct_cap3 = Σ order_ketso.pnl_vnd (cùng tập trên) / von_ban_dau × 100`; nếu `von_ban_dau` là 0/falsy → `0.0`.
- `von_ban_dau` được **đồng bộ lại mỗi lần recompute** về `VirtualTradingAccount.initial_cash_vnd` của chính user (`_sync_von_ban_dau`). Nếu user chưa có tài khoản ảo, hoặc `initial_cash_vnd <= 0` → **giữ nguyên giá trị hiện có** (mặc định `VON_BAN_DAU_MAC_DINH = 100_000_000`). Hằng 100 000 000đ chỉ là con số của ví dụ trong spec; `create_default_config` mở tài khoản ở mức khác (1 000 000 000đ theo docstring model; bộ test dùng 250 000 000đ) — hard-code hằng số này từng làm Cấp 3 báo tỷ suất lệch 10 lần so với dải số dư ngay phía trên cùng màn hình.
- `diem_ky_luat_tb_cap3`: lấy **các ngày (`VirtualOrder.trading_date`) DISTINCT** của lệnh Thực chiến với `trading_date >= entered_at.date()`; với mỗi ngày gọi `Cap2Service.diem_ky_luat(user, ngày)`; **bỏ qua** ngày trả `diem = None`; kết quả là trung bình cộng các ngày còn lại, hoặc `None` nếu không có ngày nào / không ngày nào chấm được.

Điểm kỷ luật ngày (để implement lại `Cap2Service.diem_ky_luat`, thang 0–100): 4 thành phần — kế hoạch đầy đủ SL/TP (tối đa 30, theo tỷ lệ hàng kế hoạch trong ngày có đủ `phuong_phap_sl_tp` + `cat_lo` + `chot_loi`; ngày không có lệnh mua nào coi như tỷ lệ 1.0), cắt lỗ đúng phiên (+20/lần, tối đa 40), không nhồi lệnh khi lỗ (+10/lần, tối đa 30), chốt lời đúng không tham (+10/lần, tối đa 30); tổng thô chuẩn hoá về 100. Ba trạng thái phải phân biệt (đây là nguồn của `null` ở Cấp 3):

- Ngày **không có hàng `order_kehoach` NÀO và không có hàng `order_ketso` NÀO** với `trading_date` đó → `diem = None`, `co_giao_dich = false`. Lưu ý: cửa sổ của Cấp 3 lấy `distinct trading_date` từ **mọi `VirtualOrder`**, nên một ngày *có* lệnh khớp nhưng lệnh đó chưa có kế hoạch Cấp 1 và chưa kết sổ vẫn rơi vào nhánh này → `None` (đúng test `test_diem_ky_luat_tb_is_none_when_days_exist_but_no_score`).
- Ngày **có kế hoạch nhưng không có kết sổ nào** → `co_tinh_huong = false` và `diem = diem_ke_hoach` (một con số 0–30, **không** phải `None`) → ngày này **có** vào mẫu số của trung bình.
- Ngày có kết sổ → `diem` là tổng 4 thành phần chuẩn hoá về 100.

(Chi tiết đầy đủ ở chương Cấp 1–2.)

#### 8. Cấp 4 «Thuần thục» — «5 lớp» là gì

Migration `b76c7019f77b_add_cap4_doc_5_lop.py` thêm 4 cột vào `order_kehoach` và tạo bảng `cap4_progress`. «5 lớp» = 5 góc nhìn khi đọc một mã, **dùng lại đúng 5 khoá `LyDo` của Cấp 1** (docstring `app/models/cap4.py`: `LOP_KEYS` được suy từ `LyDo` chứ không khai lại, để hai chỗ không thể trôi lệch nhau). Cấp 1 bắt «chọn 1 trong 5 lý do»; Cấp 4 thay bằng «chấm cả 5 lớp».

| Lớp (khoá) | Nhãn | Ý nghĩa nghiệp vụ | Lấy từ dữ liệu giao dịch nào |
|---|---|---|---|
| `ky_thuat` | Kỹ thuật | đồ thị / xu hướng giá | `order_kehoach.doc_5_lop["ky_thuat"]` — **do user tự chấm**, ghi lúc đặt lệnh MUA |
| `dong_tien` | Dòng tiền | dòng tiền vào/ra mã | `order_kehoach.doc_5_lop["dong_tien"]` |
| `noi_bo` | Nội bộ | hoạt động cổ đông nội bộ | `order_kehoach.doc_5_lop["noi_bo"]` |
| `tin_tuc` | Tin tức | tin/sự kiện | `order_kehoach.doc_5_lop["tin_tuc"]` |
| `dinh_gia` | Định giá | mặt bằng giá trị | `order_kehoach.doc_5_lop["dinh_gia"]` |

Bốn cột Cấp 4 trên `order_kehoach` (tất cả nullable, `JSON` cho hai cột đầu):

| Cột | Nghĩa | Ai điền |
|---|---|---|
| `doc_5_lop` | `{lop: 'ok'\|'neu'\|'bad'}` — **user tự chấm** | client gửi, server validate rồi lưu |
| `ai_5_lop` | `{lop: 'ok'\|'neu'\|'bad'}` — verdict 5 bậc của AI **rút về 3 mức** (nếu đã lộ) | client gửi (chỉ khi AI đã hiện), server validate rồi lưu |
| `so_lop_dong_thuan` | **số lớp mà AI đánh giá `ok`** (0–5) — "điểm đồng thuận" | **SERVER tự tính lại** từ `ai_5_lop` |
| `so_lop_khac_ai` | số lớp mà user chấm KHÁC AI (chỉ tính lớp có trong CẢ hai map) | **SERVER tự tính lại** |

★ **Bẫy tên nguy hiểm nhất của chương này**: `so_lop_dong_thuan` **không** đo mức đồng thuận giữa user và AI. Source:

~~~python
kehoach.so_lop_dong_thuan = sum(1 for muc in ai_clean.values() if muc == NhanDinhLop.OK.value)
kehoach.so_lop_khac_ai   = sum(1 for lop, muc in ai_clean.items() if lop in doc_clean and doc_clean[lop] != muc)
~~~

Tức `so_lop_dong_thuan` = số lớp **AI** nói «Ủng hộ» (không nhìn `doc_5_lop` một chữ nào); `so_lop_khac_ai` = số lớp lệch, duyệt trên khoá của `ai_5_lop` và chỉ đếm lớp cũng có trong `doc_5_lop`. Đặt lại tên biến khi viết lại là **thay đổi hợp đồng API** — giữ nguyên tên trên wire.

★ **NGUYÊN TẮC TỐI THƯỢNG (spec §4/§9)**: Cấp 4 **KHÔNG BAO GIỜ** chấm user đúng/sai so với AI. `so_lop_khac_ai` là con số **TRUNG TÍNH**: lưu, trả về cho FE hiển thị nhãn tím trung tính, hết. Không nhiệm vụ nào, không ngưỡng nào, không nhãn nào thưởng việc giống AI hay phạt việc khác AI. Chất lượng đọc **chỉ** đo bằng kết quả thật (`order_ketso.pnl_pct`). Test `tests/test_cap4.py::test_khac_ai_is_neutral` khoá bất biến này: hai lịch sử giống nhau, chỉ khác độ lệch với AI, phải cho ra chỉ số Cấp 4 y hệt nhau. **Bản viết lại phải có test tương đương.**

#### 9. Cấp 4 — 3 nhiệm vụ

| Mã task | Tên hiển thị | Điều kiện hoàn thành | Cổng mở | Client PATCH tự đặt? |
|---|---|---|---|---|
| `task_1_done_at` | ① Đọc + chấm đủ 5 lớp lần đầu | `so_lenh_doc_du_5lop >= 1` | không | KHÔNG |
| `task_2_done_at` | ② Kết sổ đầu tiên của Cấp 4 | tồn tại ≥1 `order_ketso` Thực chiến với `closed_at >= cap4_progress.entered_at` | **gated: chỉ xét khi `task_1_done_at IS NOT NULL`** | KHÔNG |
| `task_3_done_at` | ③ Thách thức Thuần thục | ĐỒNG THỜI 3 chân: `so_lenh_doc_du_5lop >= 20` **VÀ** (`vu_khi_lop IS NOT NULL` **VÀ** `diem_mu_lop IS NOT NULL`) **VÀ** `ty_le_thang_dong_thuan_cao >= 60.0` | không | KHÔNG |

Hằng số (đầu `app/services/cap4/service.py`): `_TASK3_SO_LENH_MIN = 20`, `_TASK3_TY_LE_THANG_MIN = 60.0`, `_VU_KHI_MIN_PCT = 70.0`, `_DIEM_MU_MAX_PCT = 50.0`, `_MIN_LENH_MOI_LOP = 3`.

Công thức:

- `so_lenh_doc_du_5lop` = số hàng `order_kehoach` (Thực chiến, của user, `doc_5_lop IS NOT NULL`) mà `doc_5_lop` là object và **cả 5 khoá** đều có giá trị thuộc `{ok, neu, bad}`. Chấm thiếu 1 lớp → **không tính**. Lệnh còn mở vẫn tính (đây là *thói quen đọc*, không phải kết quả).
- **Ghép kế hoạch (lệnh MUA) với kết quả (`order_ketso`, khoá theo lệnh BÁN)**: `order_ketso` không có FK về lệnh mua, nên dùng đúng luật của Cấp 1 (`Cap1Service._find_matching_buy`): lệnh MUA **FILLED gần nhất** cùng `account_id` + cùng `symbol` + `created_at <= sell.created_at`. Duyệt trong Python (3 query), danh sách buys sắp tăng dần nên "match cuối cùng" là match gần nhất. Đây là **xấp xỉ 1 lô**: bán 2 lần cùng mã trên 1 lệnh mua sẽ gán bài đọc của lệnh mua đó cho cả hai kết quả.
- % thắng của lớp L = trong các cặp đã đóng mà `doc_5_lop[L] == 'ok'`: `n_orders` = số cặp, `n_wins` = số cặp có `order_ketso.pnl_pct > 0`, `win_rate = n_wins / n_orders × 100`; `n_orders == 0` → `win_rate = null`.
- Nhãn: `n_orders < 3` → `"chua_du_du_lieu"`; ngược lại `win_rate >= 70` → `"vu_khi"`; `win_rate < 50` → `"diem_mu"`; còn lại → `null`.
- `vu_khi_lop` = lớp đủ điều kiện tốt nhất, sort key `(-win_rate, -n_orders, LOP_KEYS.indexOf(lop))`; `diem_mu_lop` = lớp tệ nhất, sort key `(win_rate, -n_orders, LOP_KEYS.indexOf(lop))`. Phá thế hoà: nhiều bằng chứng hơn thắng, rồi tới thứ tự chuẩn của `LOP_KEYS` → **kết quả tất định**.
- `ty_le_thang_dong_thuan_cao` = % cặp đã đóng có `so_lop_dong_thuan >= 3` mà thắng; **không có cặp nào → 0.0** (không phải null, không phải trung bình rỗng đạt tự động).

#### 10. Cột NULL nghĩa là «CHƯA BIẾT» — không phải 0

| Cột / field | NULL nghĩa là | Client PHẢI render | Đã từng là bug |
|---|---|---|---|
| `cap3_progress.diem_ky_luat_tb_cap3` và `GET /cap3/thach-thuc → diem_ky_luat.gia_tri_hien_tai` | **CHƯA BIẾT** — chưa có ngày Thực chiến nào từ khi vào Cấp 3, hoặc có ngày nhưng không ngày nào có tình huống kỷ luật để chấm | `—` (gạch ngang), thanh tiến độ rỗng, **KHÔNG in `0%`** | ★ CÓ. Cột từng là `NOT NULL DEFAULT 0` → widget «Thách thức Bản lĩnh» in `🔲 Điểm kỷ luật ≥ 80% — 0% / 80%` + "Trung bình giai đoạn Cấp 3: 0.0%" ngay dưới thẻ «Điểm kỷ luật» đang nói trung thực "chưa có dữ liệu". Migration `9c2e4b71fa30` đổi sang nullable. |
| `cap3_progress.khau_vi` | chưa đặt khẩu vị (đi cặp với `khau_vi_da_dat = false`) | ẩn/nhắc đặt khẩu vị | — |
| `cap3_progress.graduated_at`, `time_to_graduate_hours` | chưa tốt nghiệp | — | — |
| `cap4_progress.vu_khi_lop` / `diem_mu_lop` | **chưa xác định được** (chưa lớp nào đủ 3 lệnh đã đóng, hoặc không lớp nào vượt ngưỡng) | "chưa xác định" — `GET /cap4/thach-thuc` đã trả sẵn chuỗi `"chưa xác định"` trong `giai_thich` | — |
| `LopWinRate.win_rate` | lớp đó **chưa có lệnh nào đã đóng** được user chấm `ok` | `—`, KHÔNG in `0%` (0% là điểm mù thật) | ★ Rủi ro tương tự: `win_rate = 0.0` và `win_rate = null` là hai trạng thái khác nhau, đừng `?? 0`. |
| `LopWinRate.nhan` | đủ dữ liệu nhưng % thắng nằm giữa 50–70% → "chưa thành vũ khí, cũng chưa phải điểm mù" | nhãn trung tính | — |
| `OrderKehoachOut.so_lop_dong_thuan` / `so_lop_khac_ai` (Cấp 4) | **AI chưa lộ** (`ai_5_lop` là null) → chưa có gì để đối chiếu | `—` | — |
| `cap4_progress.ty_le_thang_dong_thuan_cao` | **không nullable** — luôn là số, `0.0` khi chưa có lệnh đồng thuận cao nào | có thể hiển thị nhưng nên kèm mẫu số từ `giai_thich` (`"Trong 0 lệnh đã đóng…"`) | — |

Nguyên tắc chung khi viết lại: `float | None` ở Python phải là `number | null` ở TypeScript, và **cấm** `?? 0`, `|| 0`, `Number(x)` trên các field này ở bất kỳ tầng nào (DTO, mapper, FE).

★ Migration `9c2e4b71fa30` **KHÔNG back-fill**: các giá trị `0.0` cũ được giữ nguyên, vì service tự tính lại cột này ở **mọi** lần đọc hàng progress — `GET /cap3/progress` đầu tiên sau khi deploy sẽ ghi đè bằng giá trị trung thực (trung bình thật, hoặc NULL). Downgrade **lossy** (NULL → 0.0). Bản TypeScript phải giữ đúng tính chất "tự chữa khi đọc" này, đừng thêm job back-fill.

#### 11. Khoá chống gian lận tốt nghiệp

Đã từng có lỗ hổng «graduation fraud»: client gọi `graduate` khi chưa đủ điều kiện, hoặc `PATCH /task` tự đóng nhiệm vụ. Trạng thái hiện tại của server (phải giữ nguyên 100%):

1. **`PATCH /capN/task` KHÔNG đặt nhiệm vụ nào.** Nó chỉ validate `task_no ∈ {1,2,3}` rồi gọi recompute. Docstring endpoint nói rõ: *"Cả 3 nhiệm vụ đều được suy ra từ order_kehoach/order_ketso — gọi endpoint này chỉ kích hoạt tính lại (idempotent, không tự đặt)"*. `task_no` **không** ảnh hưởng kết quả — gửi 1, 2 hay 3 đều recompute như nhau. **Tuyệt đối không** thêm nhánh "nếu client gửi task_no thì stamp task đó".
2. **`POST /capN/graduate` luôn recompute TRƯỚC khi kiểm tra**: `_recompute_progress` → rồi mới `all(task_N_done_at is not None for N in (1,2,3))`. Không đọc cờ nào từ payload (endpoint graduate **không có request body**).
3. **Điều kiện được kiểm lại từ history**, không từ cột đếm client gửi: `so_lenh_cap3`, `lai_pct_cap3`, `diem_ky_luat_tb_cap3`, `so_lenh_doc_du_5lop`, `vu_khi_lop`, `diem_mu_lop`, `ty_le_thang_dong_thuan_cao` đều được ghi đè trong cùng lần recompute đó.
4. **`None` không bao giờ đạt cổng số**: `diem_ky_luat_tb is not None and diem_ky_luat_tb >= 80.0` — thứ tự này bắt buộc; ở JS `null >= 80` là `false` nhưng `null > -1` là `true`, nên vẫn phải kiểm `!== null` tường minh.
5. **`so_lop_dong_thuan` / `so_lop_khac_ai` client gửi bị bỏ hoàn toàn** (`# noqa: ARG002 — advisory`): server tính lại từ hai blob JSON. Test `test_record_kehoach_recomputes_counts_ignoring_client_values` gửi `so_lop_dong_thuan=5, so_lop_khac_ai=0` và khẳng định server trả `2` và `1`.
6. **Mốc đã đóng không bao giờ bị mở lại**: recompute chỉ stamp khi `task_N_done_at IS NULL` (`if progress.task_1_done_at is None: …`). Nghĩa là user đạt rồi lỗ lại vẫn giữ nhiệm vụ. Đây là **hành vi có chủ ý** ("stamp when first met", giống Cấp 1/2), không phải bug.
7. **`graduate` idempotent**: nếu `graduated_at` đã có thì không ghi lại — `graduated_at` và `time_to_graduate_hours` giữ nguyên (test khẳng định gọi lần hai không dịch mốc).
8. **Transaction**: recompute + kiểm tra + stamp phải nằm trong **cùng một transaction** với request. Ở NestJS/TypeORM/Prisma: bọc `graduate` trong một transaction và nên `SELECT … FOR UPDATE` hàng `capN_progress` để hai request `graduate` song song không cùng ghi. (Source Python hiện dựa vào session-per-request + `UniqueConstraint(user_id)`; đây là chỗ **được phép** siết thêm mà không đổi hợp đồng.)

#### 12. Khẩu vị rủi ro (Cấp 3) — hồ sơ, không phải cấu hình cứng

- `Cap3Progress.khau_vi` là **hồ sơ sống, sửa được nhiều lần** (`set_khau_vi` chỉ ghi đè; test `test_set_khau_vi_sets_and_updates` đổi `than_trong` → `tan_cong` thành công). Cột `khau_vi_da_dat` một khi đã `true` thì **không bao giờ về `false`**.
- `OrderKehoach.khau_vi` là **ảnh chụp per-order** của khẩu vị lúc đặt lệnh đó — cố tình độc lập, để đổi hồ sơ về sau không viết lại lịch sử. Nó do **client gửi trong `POST /cap3/kehoach`**, server **KHÔNG** tự copy từ `Cap3Progress.khau_vi` và **KHÔNG** kiểm tra hai giá trị có khớp nhau hay không.
- Ảnh hưởng về sau của khẩu vị: (a) cổng `khau_vi_da_dat` — chưa đặt thì `POST /cap3/kehoach` bị 409; (b) là ảnh chụp hiển thị lại ở Kết sổ ("Khẩu vị rủi ro lúc đặt"); (c) trần % vốn (10/20/30%) là **gợi ý ở client**, server **không** cưỡng chế `pct_von <= trần` — chỉ đòi `pct_von > 0`. Đừng "sửa" điều này khi viết lại.
- Không có bảng `users.khau_vi_rui_ro`: quyết định lưu trữ (docstring `app/models/cap3.py`) là giữ trên `cap3_progress` để không mở rộng blast radius của bảng `users`.

---

## Cấp 3 «Bản lĩnh»

7 endpoint. Cấp 3 sở hữu bảng `cap3_progress`, mở rộng `order_kehoach` bằng 5 cột (`khau_vi`, `muc_tu_tin`, `cach_khoi_luong`, `khoi_luong`, `pct_von` — migration `ee69ea647b02`), và **không** thêm cột nào cho `order_ketso`.

### GET /api/v1/cap3/progress

> **Tiến độ Cấp 3** — trả trạng thái Cấp 3 của user hiện tại (hoặc `null` nếu chưa vào cấp), sau khi tính lại toàn bộ chỉ số và nhiệm vụ từ lịch sử giao dịch.

| | |
|---|---|
| **Quyền** | Bearer (`CurrentUser` — user active; KHÔNG cần Premium) |
| **Rate limit** | mặc định `RATE_LIMIT_DEFAULT = "60/minute"` per-IP (slowapi, `key_func=get_remote_address`) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap3_progress`, `order_ketso` ⨝ `virtual_orders`, `order_kehoach` ⨝ `virtual_orders`, `virtual_trading_accounts`, `cap2_progress` (qua `Cap2Service.diem_ky_luat`) |
| **Side-effect** | ★ **CÓ** — `UPDATE cap3_progress`: `von_ban_dau`, `so_lenh_cap3`, `lai_pct_cap3`, `diem_ky_luat_tb_cap3`, và stamp `task_1/2/3_done_at` nếu vừa đủ điều kiện. Không gửi email/Telegram, không ghi audit log. |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** `null` khi user CHƯA vào Cấp 3 (chưa có hàng cap3_progress). */
type Cap3ProgressResponse = Cap3ProgressOut | null;

interface Cap3ProgressOut {
  id: string;                            // uuid hàng cap3_progress
  user_id: string;                       // uuid
  entered_at: string;                    // ISO-8601, timezone-aware (UTC)
  khau_vi_da_dat: boolean;               // false cho tới lần POST /cap3/khau-vi đầu tiên
  khau_vi?: KhauVi | null;               // null = chưa đặt
  von_ban_dau: number;                   // VND, BigInteger; = initial_cash_vnd của tài khoản ảo
  task_1_done_at?: string | null;        // null = chưa xong
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_cap3: number;                  // số vòng lệnh ĐÃ ĐÓNG kể từ entered_at
  lai_pct_cap3: number;                  // %, có thể âm; = Σ pnl_vnd / von_ban_dau × 100
  diem_ky_luat_tb_cap3?: number | null;  // ★ null = CHƯA BIẾT, KHÔNG phải 0
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null; // giờ (số thực) giữa entered_at và graduated_at
}
~~~

~~~json
{
  "id": "9f1c3a2e-7b64-4d51-8c0a-2e5f7b91d3a4",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-10T02:15:31.482913Z",
  "khau_vi_da_dat": true,
  "khau_vi": "can_bang",
  "von_ban_dau": 1000000000,
  "task_1_done_at": "2026-08-10T03:41:12.004518Z",
  "task_2_done_at": "2026-08-11T07:02:55.113640Z",
  "task_3_done_at": null,
  "so_lenh_cap3": 11,
  "lai_pct_cap3": 3.42,
  "diem_ky_luat_tb_cap3": 86.6666666666667,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

Ví dụ user chưa vào cấp — body đúng nghĩa là literal `null` (không phải `{}`, không phải `204`):

~~~json
null
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu/không hợp lệ header `Authorization` | `Yêu cầu xác thực` (kèm header `WWW-Authenticate: Bearer`) |
| 403 | `FORBIDDEN` | user tồn tại nhưng `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | **hiếm**: user có hàng `cap3_progress` và có ngày giao dịch trong cửa sổ, nhưng hàng `cap2_progress` đã bị xoá → `Cap2Service.diem_ky_luat` ném lỗi | `Không tìm thấy tiến trình Cấp 2` |
| 429 | — | vượt rate limit (slowapi) | body của slowapi, không theo `ErrorEnvelope` |

**Fallback / suy giảm**

- Chưa vào cấp → `200` + `null` (KHÔNG 404). FE phải phân biệt `null` (chưa vào) với 404 (lỗi).
- Không có tài khoản ảo, hoặc `initial_cash_vnd <= 0` → `von_ban_dau` **giữ nguyên** giá trị hiện có (mặc định 100 000 000). Không lỗi.
- `von_ban_dau` falsy (0) → `lai_pct_cap3 = 0.0` (bảo vệ chia cho 0).
- Không có `order_ketso` nào trong cửa sổ → `so_lenh_cap3 = 0`, `lai_pct_cap3 = 0.0`.
- Không có ngày giao dịch nào / không ngày nào chấm được → `diem_ky_luat_tb_cap3 = null` (**không** 0.0). Trong trường hợp này `Cap2Service.diem_ky_luat` **không** được gọi lần nào → tránh luôn lỗi 404 ở trên.
- Không có provider ngoài nào tham gia → không có nhánh suy giảm theo giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap3/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6f2b8c14-9a3d-4e77-b501-c8d92f4a7e60'
~~~

**Ghi chú khi viết lại**

- Endpoint GET nhưng **ghi DB** — phải nằm trong transaction ghi và commit. Nếu framework mặc định `readonly` cho GET thì sẽ mất tiến độ một cách âm thầm.
- `response_model=Cap3ProgressOut | None` → OpenAPI là `anyOf: [Cap3ProgressOut, null]`. Trong NestJS phải trả `null` thật (đừng để serializer đổi thành `{}` hay `204 No Content`).
- `entered_at` là `DateTime(timezone=True)` → giữ nguyên UTC, đừng đổi sang Asia/Ho_Chi_Minh trong tầng API (FE tự format).
- `time_to_graduate_hours` là **giờ dạng số thực** (`total_seconds() / 3600.0`), không phải phút, không phải chuỗi.
- Thứ tự recompute quan trọng: `_sync_von_ban_dau` **trước** khi tính `lai_pct_cap3` (nếu ngược lại, lần đọc đầu sau khi mở tài khoản sẽ ra % theo mẫu số cũ).
- `diem_ky_luat_tb_cap3` dùng `entered_at.date()` — tức **ngày theo UTC**, so với `VirtualOrder.trading_date` là **ngày giao dịch theo giờ VN**. Đây là hành vi hiện tại; giữ nguyên (dùng ngày UTC của `entered_at`) để số không lệch so với bản Python.

---

### POST /api/v1/cap3/enter

> **Vào Cấp 3** — tạo hàng tiến độ Cấp 3 cho user (idempotent), chỉ khi đã tốt nghiệp Cấp 2.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap3_progress`, `cap2_progress` |
| **Side-effect** | `INSERT cap3_progress` (một hàng/user) với `entered_at = now(UTC)`, `khau_vi_da_dat = false`, `khau_vi = NULL`, `von_ban_dau = 100000000`, mọi chỉ số = 0, `diem_ky_luat_tb_cap3 = NULL`. **KHÔNG recompute.** Không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body** — không có body (endpoint không nhận payload; gửi body cũng bị bỏ qua)

**Response 200** — `Cap3ProgressOut` (xem `GET /cap3/progress`; ở đây **không bao giờ** `null`)

~~~json
{
  "id": "9f1c3a2e-7b64-4d51-8c0a-2e5f7b91d3a4",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-17T01:05:44.918273Z",
  "khau_vi_da_dat": false,
  "khau_vi": null,
  "von_ban_dau": 100000000,
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_cap3": 0,
  "lai_pct_cap3": 0.0,
  "diem_ky_luat_tb_cap3": null,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | **chưa có hàng `cap2_progress`** (user chưa vào Cấp 2) | `Không tìm thấy tiến trình Cấp 2` |
| 409 | `CONFLICT` | có hàng Cấp 2 nhưng `graduated_at IS NULL` | `Chưa tốt nghiệp Cấp 2` |

**Fallback / suy giảm**

- **Idempotent**: đã có hàng → trả lại hàng cũ nguyên trạng, **không** kiểm tra Cấp 2, **không** cập nhật `entered_at`. Kể cả khi hàng Cấp 2 bị xoá sau đó, `enter` vẫn 200.
- Không kiểm tra `CAP_MAX_ENABLED` (không tồn tại ở backend) → cấp «chưa mở» vẫn vào được nếu tiên quyết đủ.
- `von_ban_dau` trả về ở đây là **mặc định 100 000 000**, chưa đồng bộ với tài khoản ảo. FE muốn số thật phải gọi `GET /cap3/progress` ngay sau đó.
- Không phụ thuộc provider ngoài, không phụ thuộc giờ giao dịch.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap3/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 1a7d4f92-3c58-4b06-9e2f-5d81ba63c0f7'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra**: hàng của chính cấp → (nếu chưa có) hàng cấp trước → (nếu có) `graduated_at`. Đảo thứ tự sẽ làm user đã vào Cấp 3 rồi bị 409 khi hàng Cấp 2 bị can thiệp.
- Phân biệt 404 vs 409 rất quan trọng cho FE: 404 = "chưa từng vào Cấp 2", 409 = "đang ở Cấp 2 nhưng chưa xong".
- `enter` **không** đặt `khau_vi` mặc định. Khẩu vị `can_bang` chỉ là *"mặc định gợi ý"* trong chú thích enum, không phải giá trị server ghi.
- Race: hai `enter` song song có thể va `uq_cap3_progress_user_id` → nên bắt lỗi unique và trả về hàng đã tồn tại (giữ tính idempotent), thay vì để lỗi 500 lọt ra.

---

### POST /api/v1/cap3/khau-vi

> **Đặt / đổi khẩu vị rủi ro** — ghi hồ sơ khẩu vị của user cho Cấp 3, mở cổng ghi kế hoạch quản lý vốn.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap3_progress` |
| **Side-effect** | `UPDATE cap3_progress SET khau_vi = <giá trị>, khau_vi_da_dat = true`. **KHÔNG recompute** nhiệm vụ. Không ghi vào `order_kehoach` của các lệnh đã có (lịch sử giữ nguyên ảnh chụp cũ). |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap3KhauViRequest {
  khau_vi: KhauVi; // "than_trong" | "can_bang" | "tan_cong" — BẮT BUỘC
}
~~~

~~~json
{ "khau_vi": "can_bang" }
~~~

**Response 200** — `Cap3ProgressOut` (toàn bộ hàng tiến độ, đã cập nhật)

~~~json
{
  "id": "9f1c3a2e-7b64-4d51-8c0a-2e5f7b91d3a4",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-10T02:15:31.482913Z",
  "khau_vi_da_dat": true,
  "khau_vi": "can_bang",
  "von_ban_dau": 1000000000,
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_cap3": 0,
  "lai_pct_cap3": 0.0,
  "diem_ky_luat_tb_cap3": null,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 3 (`cap3_progress` không có) | `Không tìm thấy tiến trình Cấp 3` |
| 422 | — | `khau_vi` không thuộc 3 giá trị, hoặc thiếu field | `HTTPValidationError` của FastAPI: `{"detail":[{"loc":["body","khau_vi"],"msg":"…","type":"literal_error"}]}` |
| 400 | `BAD_REQUEST` | **không tới được qua HTTP** — service còn một lớp `KhauViRuiRo(khau_vi)` bọc `try/except` ném `BadRequestError` | `khau_vi không hợp lệ` |

**Fallback / suy giảm**

- Đổi khẩu vị **nhiều lần không giới hạn** — không có cooldown, không có audit, không giới hạn số lần (spec §5.2 "đổi khẩu vị = đổi cho toàn tài khoản, có thể sửa lại").
- Đổi khẩu vị **không** hồi tố: `order_kehoach.khau_vi` của các lệnh cũ giữ nguyên; các chỉ số Cấp 3 **không** thay đổi (khẩu vị không tham gia bất kỳ công thức nào của 3 nhiệm vụ).
- `khau_vi_da_dat` không có đường về `false`.
- Không recompute → nếu FE muốn `task_*` cập nhật thì phải gọi `GET /cap3/progress` hoặc `PATCH /cap3/task`.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap3/khau-vi' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2b64e0af-58d3-4d1c-9b77-af3e1c05d2b8' \
  -d '{"khau_vi":"can_bang"}'
~~~

**Ghi chú khi viết lại**

- Giữ **hai lớp** validate: literal ở DTO (→ 422) **và** kiểm enum trong service (→ 400 `khau_vi không hợp lệ`). Lớp service là mạng an toàn cho các caller nội bộ; đừng bỏ.
- Endpoint trả về **cả hàng progress**, không phải chỉ khẩu vị — FE dùng response này thay cho một lần `GET /progress`. Nhưng lưu ý số liệu trong đó **không được recompute**, có thể là số của lần đọc trước.
- Không có endpoint "xoá khẩu vị"; đừng phát minh.

---

### PATCH /api/v1/cap3/task

> **Kích hoạt tính lại nhiệm vụ Cấp 3** — không đánh dấu gì cả; chỉ buộc server tính lại 3 nhiệm vụ từ lịch sử.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (giống `GET /cap3/progress`) |
| **Side-effect** | `UPDATE cap3_progress` (chỉ số + stamp mốc nếu đủ điều kiện) — y hệt `GET /progress`. Không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap3TaskRequest {
  /** 1 | 2 | 3. BẮT BUỘC nhưng KHÔNG ảnh hưởng kết quả — chỉ dùng để validate.
   *  Kiểu ở schema là `int` thuần (không Literal), nên giá trị ngoài {1,2,3}
   *  qua được pydantic và bị service chặn bằng 400. */
  task_no: number;
}
~~~

~~~json
{ "task_no": 1 }
~~~

**Response 200** — `Cap3ProgressOut` (đã recompute)

~~~json
{
  "id": "9f1c3a2e-7b64-4d51-8c0a-2e5f7b91d3a4",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-10T02:15:31.482913Z",
  "khau_vi_da_dat": true,
  "khau_vi": "can_bang",
  "von_ban_dau": 1000000000,
  "task_1_done_at": "2026-08-17T04:12:08.550311Z",
  "task_2_done_at": "2026-08-17T04:12:08.550311Z",
  "task_3_done_at": null,
  "so_lenh_cap3": 4,
  "lai_pct_cap3": 0.86,
  "diem_ky_luat_tb_cap3": 91.25,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `task_no` không thuộc `(1, 2, 3)` — ví dụ `0`, `4`, `-1` | `task_no không hợp lệ` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 3 | `Không tìm thấy tiến trình Cấp 3` |
| 404 | `NOT_FOUND` | hàng `cap2_progress` bị xoá (qua `diem_ky_luat`) | `Không tìm thấy tiến trình Cấp 2` |
| 422 | — | thiếu `task_no`, hoặc không parse được thành số nguyên | `HTTPValidationError` |

**Fallback / suy giảm**

- **Idempotent tuyệt đối**: gọi bao nhiêu lần cũng cho cùng kết quả; nhiệm vụ chưa đủ điều kiện thì `task_N_done_at` vẫn `null`.
- Thứ tự kiểm tra: validate `task_no` **TRƯỚC** khi tìm hàng progress → user chưa vào Cấp 3 gửi `task_no = 9` nhận **400**, không phải 404.
- Không có nhánh nào theo `task_no`; đừng chờ hành vi khác nhau giữa 1/2/3.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap3/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7c1f9e35-0d84-42a6-8b3f-1e5a9c740d62' \
  -d '{"task_no":1}'
~~~

**Ghi chú khi viết lại**

- ★ **Chống gian lận**: KHÔNG được thêm `progress[`task_${task_no}_done_at`] = now`. Toàn bộ giá trị của endpoint này là "xin tính lại". Nếu bản viết lại cho client tự stamp, lỗ hổng graduation fraud quay lại nguyên vẹn.
- Method là `PATCH` (không phải POST) — giữ đúng để client cũ không vỡ.
- Nếu muốn tối ưu, có thể coi `PATCH /task` = alias của `GET /progress` (cùng recompute, cùng response) — nhưng phải giữ nguyên rule 400 cho `task_no` sai.

---

### POST /api/v1/cap3/kehoach

> **Ghi khối «Quản lý vốn»** — bổ sung khẩu vị + mức tự tin + cách/khối lượng + %vốn vào hàng kế hoạch Cấp 1 đã có của một lệnh MUA.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap3_progress`, `virtual_orders` (qua `VirtualTradingRepository.get_order_by_id`), `order_kehoach` |
| **Side-effect** | `UPDATE order_kehoach` (5 cột Cấp 3 trên hàng đã tồn tại — **không INSERT hàng mới**) + `UPDATE cap3_progress` (recompute ngay sau đó, có thể stamp ①/②/③) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap3KehoachRequest {
  order_id: string;              // uuid của lệnh MUA (virtual_orders.id) — BẮT BUỘC
  khau_vi: KhauVi;               // ảnh chụp khẩu vị lúc đặt lệnh — BẮT BUỘC
  muc_tu_tin: MucTuTin;          // 1 | 2 | 3 — BẮT BUỘC
  cach_khoi_luong: CachKhoiLuong;// "linh_hoat" | "ky_luat" — BẮT BUỘC
  khoi_luong: number;            // số cổ phiếu, integer, PHẢI > 0 — BẮT BUỘC
  pct_von: number;               // % vốn, float, PHẢI > 0 — BẮT BUỘC
}
~~~

~~~json
{
  "order_id": "c4e91b7a-2d68-4f05-93ba-7e1c085d6f42",
  "khau_vi": "can_bang",
  "muc_tu_tin": 3,
  "cach_khoi_luong": "linh_hoat",
  "khoi_luong": 1500,
  "pct_von": 18.5
}
~~~

**Response 200**

~~~ts
interface Cap3OrderKehoachOut {
  id: string;                            // uuid hàng order_kehoach
  order_id: string;                      // uuid lệnh MUA
  vung_mua: number;                      // VND/cp — do Cấp 1 ghi, BẮT BUỘC có mặt
  khau_vi?: KhauVi | null;
  muc_tu_tin?: number | null;            // ★ số nguyên tự do trong response (không union 1|2|3)
  cach_khoi_luong?: CachKhoiLuong | null;
  khoi_luong?: number | null;
  pct_von?: number | null;
}
~~~

~~~json
{
  "id": "58d1a3f0-6c47-4e29-b0f5-9a2e7c31b845",
  "order_id": "c4e91b7a-2d68-4f05-93ba-7e1c085d6f42",
  "vung_mua": 61500,
  "khau_vi": "can_bang",
  "muc_tu_tin": 3,
  "cach_khoi_luong": "linh_hoat",
  "khoi_luong": 1500,
  "pct_von": 18.5
}
~~~

(Lưu ý: response **chỉ** trả góc nhìn Cấp 3 của hàng kế hoạch — các field của Cấp 1 (`lyDo`, `trangThai_luc_dat`) và Cấp 2 (`cat_lo`, `chot_loi`) **không** có trong body này, dù vẫn còn nguyên trong DB.)

**Lỗi** — theo **đúng thứ tự kiểm tra trong service**:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | payload sai kiểu: `khau_vi`/`cach_khoi_luong` ngoài enum, `muc_tu_tin` ngoài `{1,2,3}`, `order_id` không phải uuid, thiếu field | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | chưa vào Cấp 3 | `Không tìm thấy tiến trình Cấp 3` |
| 2 | 409 | `CONFLICT` | `khau_vi_da_dat = false` (chưa gọi `POST /cap3/khau-vi`) | `Chưa đặt khẩu vị rủi ro — cần đặt trước khi vào lệnh` |
| 3 | 404 | `NOT_FOUND` | không có lệnh `order_id`, **hoặc** lệnh thuộc user khác | `Không tìm thấy lệnh` |
| 4 | 400 | `BAD_REQUEST` | lệnh không phải `side = BUY` | `Quản lý vốn chỉ ghi cho lệnh MUA` |
| 5 | 400 | `BAD_REQUEST` | `khau_vi` không hợp lệ (chỉ tới được từ caller nội bộ) | `khau_vi không hợp lệ` |
| 6 | 400 | `BAD_REQUEST` | `muc_tu_tin` ngoài `{1,2,3}` (chỉ từ caller nội bộ) | `muc_tu_tin phải là 1, 2 hoặc 3` |
| 7 | 400 | `BAD_REQUEST` | `cach_khoi_luong` không hợp lệ (chỉ từ caller nội bộ) | `cach_khoi_luong không hợp lệ` |
| 8 | 400 | `BAD_REQUEST` | `khoi_luong` null hoặc `<= 0` | `Khối lượng phải là số dương` |
| 9 | 400 | `BAD_REQUEST` | `pct_von` null hoặc `<= 0` | `%vốn phải là số dương` |
| 10 | 404 | `NOT_FOUND` | chưa có hàng `order_kehoach` cho lệnh này (chưa gọi `POST /cap1/kehoach`) | `Không tìm thấy kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước` |
| — | 401/403 | | như các endpoint trên | |

**Fallback / suy giảm**

- **Ghi đè, không cộng dồn**: gọi lại với `order_id` cũ sẽ ghi đè 5 cột (không có phiên bản, không có lịch sử sửa). Không có kiểm tra "lệnh đã đóng thì khoá"; ghi được cả khi lệnh đã bán xong.
- Server **không** cưỡng chế `pct_von` theo trần khẩu vị (10/20/30%) và **không** kiểm `khoi_luong` khớp với `pct_von × von_ban_dau / giá`. Cả hai chỉ cần > 0. Trần % là logic gợi ý ở client.
- Server **không** kiểm `body.khau_vi` có bằng `Cap3Progress.khau_vi` hay không — ảnh chụp per-order được phép lệch với hồ sơ.
- Không kiểm `VirtualOrder.mode`: về lý thuyết ghi được cho lệnh `san_tap`, nhưng khi recompute thì hàng đó bị lọc bởi `mode = 'thuc_chien'` → không tính vào nhiệm vụ ①. (Đây là chỗ hành vi "im lặng": ghi thành công 200 mà tiến độ không nhích — chính là trải nghiệm của user FREE.)
- Recompute cuối cùng có thể **stamp cả ① và ② trong cùng một request** (nếu đã có ≥1 kết sổ trước đó) — hai mốc sẽ có **cùng timestamp**.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap3/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b3a7c520-49e6-4f18-8d7c-05f2a1e93b74' \
  -d '{
        "order_id": "c4e91b7a-2d68-4f05-93ba-7e1c085d6f42",
        "khau_vi": "can_bang",
        "muc_tu_tin": 3,
        "cach_khoi_luong": "linh_hoat",
        "khoi_luong": 1500,
        "pct_von": 18.5
      }'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra là hợp đồng**: progress → khẩu vị (409) → lệnh (404) → BUY (400) → enum/số (400) → kế hoạch Cấp 1 (404). Ví dụ cụ thể: user chưa đặt khẩu vị + `order_id` không tồn tại phải nhận **409 «Chưa đặt khẩu vị rủi ro…»**, không phải 404 «Không tìm thấy lệnh». Test `test_record_kehoach_requires_khau_vi_da_dat` cố định điều này.
- Lệnh của user khác trả **404** (không phải 403) — không rò rỉ sự tồn tại của lệnh.
- `khoi_luong` là **số cổ phiếu** (integer), `pct_von` là **phần trăm** (18.5 nghĩa là 18,5%, KHÔNG phải 0.185). `vung_mua` là **VND trên mỗi cổ phiếu**.
- Cột được ép kiểu khi ghi: `int(muc_tu_tin)`, `int(khoi_luong)`, `float(pct_von)`.
- Endpoint này **mở rộng** hàng `order_kehoach` của Cấp 1 tại chỗ (cùng bảng vật lý). Bản viết lại **không** được tạo bảng `cap3_order_kehoach` riêng — Cấp 4/5/6/7/8 cũng ghi lên đúng hàng đó, tách bảng sẽ phá cả chuỗi.

---

### GET /api/v1/cap3/thach-thuc

> **Thách thức Bản lĩnh** — 3 điều kiện của nhiệm vụ ③ kèm giá trị hiện tại, đạt/chưa đạt và câu giải thích nguồn gốc con số.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (giống `GET /cap3/progress`) — tính toán trong service |
| **Side-effect** | `UPDATE cap3_progress` (recompute trước khi trả) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface Cap3ThachThucOut {
  dat_ca_3: boolean;                    // = lai_pct.dat && so_lenh.dat && diem_ky_luat.dat
  lai_pct: Cap3ThachThucDieuKien;       // muc_tieu = 5.0
  so_lenh: Cap3ThachThucDieuKien;       // muc_tieu = 15.0
  diem_ky_luat: Cap3ThachThucDieuKien;  // muc_tieu = 80.0; gia_tri_hien_tai CÓ THỂ null
}
~~~

Chuỗi `ten` là hằng, nguyên văn: `"Lãi ≥ +5% trên vốn"`, `"Đủ 15 lệnh Thực chiến"`, `"Điểm kỷ luật ≥ 80%"`.

Trường hợp đã có dữ liệu:

~~~json
{
  "dat_ca_3": false,
  "lai_pct": {
    "ten": "Lãi ≥ +5% trên vốn",
    "gia_tri_hien_tai": 6.0,
    "muc_tieu": 5.0,
    "dat": true,
    "giai_thich": "Lãi/lỗ đã chốt ở Cấp 3 đang là 6.0% trên vốn 250,000,000đ — cần đạt ít nhất +5%."
  },
  "so_lenh": {
    "ten": "Đủ 15 lệnh Thực chiến",
    "gia_tri_hien_tai": 15.0,
    "muc_tieu": 15.0,
    "dat": true,
    "giai_thich": "Đã qua 15/15 lệnh Thực chiến kể từ khi vào Cấp 3."
  },
  "diem_ky_luat": {
    "ten": "Điểm kỷ luật ≥ 80%",
    "gia_tri_hien_tai": 63.3,
    "muc_tieu": 80.0,
    "dat": false,
    "giai_thich": "Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi giá chạm, không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt. Làm đúng thì điểm cao. Trung bình giai đoạn Cấp 3: 63.3%."
  }
}
~~~

Trường hợp **CHƯA BIẾT** điểm kỷ luật (user vừa vào cấp, chưa giao dịch) — đây là hình dạng FE phải xử lý đúng:

~~~json
{
  "dat_ca_3": false,
  "lai_pct": {
    "ten": "Lãi ≥ +5% trên vốn",
    "gia_tri_hien_tai": 0.0,
    "muc_tieu": 5.0,
    "dat": false,
    "giai_thich": "Lãi/lỗ đã chốt ở Cấp 3 đang là 0.0% trên vốn 1,000,000,000đ — cần đạt ít nhất +5%."
  },
  "so_lenh": {
    "ten": "Đủ 15 lệnh Thực chiến",
    "gia_tri_hien_tai": 0.0,
    "muc_tieu": 15.0,
    "dat": false,
    "giai_thich": "Đã qua 0/15 lệnh Thực chiến kể từ khi vào Cấp 3."
  },
  "diem_ky_luat": {
    "ten": "Điểm kỷ luật ≥ 80%",
    "gia_tri_hien_tai": null,
    "muc_tieu": 80.0,
    "dat": false,
    "giai_thich": "Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi giá chạm, không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt. Làm đúng thì điểm cao. Chưa có ngày nào ở Cấp 3 có tình huống kỷ luật để chấm, nên chưa có điểm trung bình."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 3 (**khác** `GET /progress` — ở đây là 404, không phải `null`) | `Không tìm thấy tiến trình Cấp 3` |
| 404 | `NOT_FOUND` | `cap2_progress` bị xoá (qua `diem_ky_luat`) | `Không tìm thấy tiến trình Cấp 2` |

**Fallback / suy giảm**

- `diem_ky_luat.gia_tri_hien_tai = null` + `dat = false` + câu giải thích **không chứa con số 0** khi chưa chấm được ngày nào. Test khoá cả hai điều: `assert "0.0%" not in giai_thich` và `assert "chưa" in giai_thich.lower()`.
- `lai_pct.gia_tri_hien_tai` và `so_lenh.gia_tri_hien_tai` **luôn là số** (0.0 khi chưa có gì) — chỉ `diem_ky_luat` mới nullable.
- `so_lenh.gia_tri_hien_tai` và `muc_tieu` được **ép sang float** (`15.0`, không phải `15`) — FE format lại nếu muốn số nguyên.
- `giai_thich` **luôn khác rỗng** với cả 3 điều kiện (§C12c: mọi con số phải kèm nguồn gốc). Đừng trả `null`/`""`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap3/thach-thuc' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e0d4b8c7-1236-4a95-9f04-72b6ea158d31'
~~~

**Ghi chú khi viết lại**

- Chuỗi `giai_thich` phải khớp **định dạng số**: `{lai_pct:.1f}` (1 chữ số thập phân), `{von_ban_dau:,.0f}` (dấu phẩy nhóm nghìn kiểu en-US, không thập phân, kèm hậu tố `đ`), `{muc_tieu:.0f}`, `{diem_tb:.1f}`. Ví dụ đúng: `"trên vốn 250,000,000đ"`. Đây là chuẩn định dạng số toàn app (memo dự án: number format en-US, ngày vi-VN).
- Hằng `_DIEM_KY_LUAT_GIAI_THICH` là **tiền tố dùng chung** của cả hai nhánh (biết / chưa biết) — copy nguyên văn: *"Điểm kỷ luật đo bạn có làm đúng cam kết không: cắt lỗ khi giá chạm, không gồng lỗ, không nhồi lệnh, không tham chốt lời hụt. Làm đúng thì điểm cao."*
- `dat_ca_3` phải tính lại từ 3 cờ, **không** đọc `task_3_done_at` — vì mốc đã stamp thì không mở lại, nên `task_3_done_at != null` mà `dat_ca_3 == false` là trạng thái hợp lệ (user từng đủ, giờ lỗ lại).
- Endpoint này và `GET /progress` khác nhau ở chỗ **chưa vào cấp**: `/thach-thuc` → 404, `/progress` → `null`.

---

### POST /api/v1/cap3/graduate

> **Tốt nghiệp Cấp 3** — đóng cấp và ghi thời gian hoàn thành, chỉ khi đủ 3/3 nhiệm vụ được server tự kiểm lại.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (recompute đầy đủ trước khi kiểm) |
| **Side-effect** | `UPDATE cap3_progress SET graduated_at = now(UTC), time_to_graduate_hours = (now - entered_at)/3600` (chỉ khi `graduated_at IS NULL`) + toàn bộ side-effect của recompute. **KHÔNG** gửi email/Telegram, **KHÔNG** ghi audit log, **KHÔNG** tự `enter` Cấp 4. |

**Path params** — —

**Query params** — —

**Request body** — không có body

**Response 200** — `Cap3ProgressOut` với `graduated_at` và `time_to_graduate_hours` đã điền

~~~json
{
  "id": "9f1c3a2e-7b64-4d51-8c0a-2e5f7b91d3a4",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-10T02:15:31.482913Z",
  "khau_vi_da_dat": true,
  "khau_vi": "tan_cong",
  "von_ban_dau": 250000000,
  "task_1_done_at": "2026-08-10T03:41:12.004518Z",
  "task_2_done_at": "2026-08-11T07:02:55.113640Z",
  "task_3_done_at": "2026-08-17T06:20:47.882015Z",
  "so_lenh_cap3": 15,
  "lai_pct_cap3": 6.0,
  "diem_ky_luat_tb_cap3": 100.0,
  "graduated_at": "2026-08-17T06:21:03.194772Z",
  "time_to_graduate_hours": 172.0921
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 3 | `Không tìm thấy tiến trình Cấp 3` |
| 409 | `CONFLICT` | **chưa đủ 3/3 nhiệm vụ** sau khi recompute | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 3` |
| 404 | `NOT_FOUND` | `cap2_progress` bị xoá (qua `diem_ky_luat`) | `Không tìm thấy tiến trình Cấp 2` |

**Fallback / suy giảm**

- **Idempotent**: đã tốt nghiệp → trả lại hàng cũ, `graduated_at`/`time_to_graduate_hours` **không** bị ghi lại (test khẳng định mốc không dịch).
- `entered_at` naive (không tz) được coi là UTC trước khi trừ (`entered.replace(tzinfo=UTC)`) — quan trọng nếu DB/driver trả datetime không tz.
- Không có nhánh "ép tốt nghiệp" cho admin, không có query param bỏ qua điều kiện.
- Tốt nghiệp Cấp 3 **không** tự tạo hàng Cấp 4 — FE phải gọi `POST /cap4/enter`, và theo `capFlags.ts` chỉ gọi khi `CAP_MAX_ENABLED >= 4` (hiện là 3 → **không gọi**).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap3/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4d9f2a06-b7e1-4c53-90d8-3f6c8b12ea57'
~~~

**Ghi chú khi viết lại**

- ★ **Thứ tự bắt buộc**: lấy hàng → **recompute** → kiểm `all(task_1..3 != null)` → mới stamp. Kiểm trước khi recompute là đúng lỗ hổng graduation fraud cũ.
- Thực chất chỉ nhiệm vụ ③ là rào: nếu ③ xong (`so_lenh >= 15`) thì ② gần như chắc chắn xong; nhưng **vẫn phải kiểm cả 3** (① đòi ghi khối Quản lý vốn — một user có 15 kết sổ mà chưa ghi khối nào sẽ **không** tốt nghiệp được).
- `time_to_graduate_hours` là `float` giờ; đừng làm tròn về `int`.
- Bọc toàn bộ trong một transaction + lock hàng progress (xem mục 11.8).

---

## Cấp 4 «Thuần thục»

7 endpoint. Cấp 4 sở hữu `cap4_progress`, mở rộng `order_kehoach` bằng 4 cột (`doc_5_lop`, `ai_5_lop`, `so_lop_dong_thuan`, `so_lop_khac_ai` — migration `b76c7019f77b`), **không** tạo enum PG mới, **không** thêm cột cho `order_ketso`, và **không có** endpoint `ketso`.

### GET /api/v1/cap4/progress

> **Tiến độ Cấp 4** — trạng thái Cấp 4 của user (hoặc `null` nếu chưa vào), sau khi tính lại toàn bộ chỉ số đọc 5 lớp và vũ khí/điểm mù.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap4_progress`, `order_kehoach` ⨝ `virtual_orders`, `order_ketso` ⨝ `virtual_orders` |
| **Side-effect** | ★ **CÓ** — `UPDATE cap4_progress`: `so_lenh_doc_du_5lop`, `vu_khi_lop`, `diem_mu_lop`, `ty_le_thang_dong_thuan_cao`, stamp `task_1/2/3_done_at`. Không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
type Cap4ProgressResponse = Cap4ProgressOut | null;

interface Cap4ProgressOut {
  id: string;                            // uuid
  user_id: string;                       // uuid
  entered_at: string;                    // ISO-8601 UTC
  task_1_done_at?: string | null;
  task_2_done_at?: string | null;
  task_3_done_at?: string | null;
  so_lenh_doc_du_5lop: number;           // số kế hoạch chấm ĐỦ 5 lớp (mở hay đóng đều tính)
  vu_khi_lop?: Lop | null;               // null = chưa xác định (cần ≥3 lệnh đã đóng/lớp)
  diem_mu_lop?: Lop | null;              // null = chưa xác định
  ty_le_thang_dong_thuan_cao: number;    // %, KHÔNG nullable; 0.0 khi chưa có lệnh nào
  graduated_at?: string | null;
  time_to_graduate_hours?: number | null;
}
~~~

~~~json
{
  "id": "d51b9c74-3e82-4a16-90f7-6b2c8ed140a9",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-14T01:44:09.720154Z",
  "task_1_done_at": "2026-08-14T02:10:33.418907Z",
  "task_2_done_at": "2026-08-14T08:55:01.660238Z",
  "task_3_done_at": null,
  "so_lenh_doc_du_5lop": 14,
  "vu_khi_lop": "ky_thuat",
  "diem_mu_lop": null,
  "ty_le_thang_dong_thuan_cao": 66.66666666666667,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

Chưa vào cấp:

~~~json
null
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 429 | — | vượt rate limit | body slowapi |

**Fallback / suy giảm**

- Chưa vào cấp → `200` + `null` (không 404).
- **Khác Cấp 3**: recompute Cấp 4 **không** gọi service của cấp khác → **không có** nhánh 404 «Không tìm thấy tiến trình Cấp 3» ở đây.
- Không lệnh nào chấm đủ 5 lớp → `so_lenh_doc_du_5lop = 0`.
- Không lớp nào đủ 3 lệnh đã đóng → `vu_khi_lop = null`, `diem_mu_lop = null`.
- Không lệnh đồng thuận cao nào → `ty_le_thang_dong_thuan_cao = 0.0` (**không** null).
- Không phụ thuộc provider ngoài / giờ giao dịch.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap4/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8c05e1b9-72a4-4d3f-b6e8-19f70a2c5d43'
~~~

**Ghi chú khi viết lại**

- Cũng là **GET-mà-ghi** như Cấp 3.
- `vu_khi_lop`/`diem_mu_lop` trong DB là `String(32)` nhưng response schema khai enum 5 lớp — validate trước khi trả (giá trị lạ trong DB sẽ làm response fail schema).
- Chi phí truy vấn: `_compute_metrics` chạy 3 query (`order_kehoach` ⨝ `virtual_orders`, danh sách BUY FILLED, `order_ketso` ⨝ `virtual_orders`) rồi ghép **trong bộ nhớ**. Với user có nhiều nghìn lệnh, thuật toán ghép hiện tại là **O(n_ketso × n_buys)** (vòng lặp lồng trong `_closed_pairs`). Được phép tối ưu (index theo `(account_id, symbol)`) nhưng **phải giữ nguyên kết quả**: "lệnh MUA FILLED gần nhất cùng account+symbol có `created_at <= sell.created_at`".

---

### POST /api/v1/cap4/enter

> **Vào Cấp 4** — tạo hàng tiến độ Cấp 4 (idempotent), chỉ khi đã tốt nghiệp Cấp 3.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap4_progress`, `cap3_progress` |
| **Side-effect** | `INSERT cap4_progress` với `entered_at = now(UTC)`, `so_lenh_doc_du_5lop = 0`, `vu_khi_lop = NULL`, `diem_mu_lop = NULL`, `ty_le_thang_dong_thuan_cao = 0.0`. **KHÔNG recompute.** |

**Path params** — —

**Query params** — —

**Request body** — không có body

**Response 200** — `Cap4ProgressOut`

~~~json
{
  "id": "d51b9c74-3e82-4a16-90f7-6b2c8ed140a9",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-17T02:03:18.664092Z",
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_doc_du_5lop": 0,
  "vu_khi_lop": null,
  "diem_mu_lop": null,
  "ty_le_thang_dong_thuan_cao": 0.0,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa có hàng `cap3_progress` | `Không tìm thấy tiến trình Cấp 3` |
| 409 | `CONFLICT` | có hàng Cấp 3 nhưng `graduated_at IS NULL` | `Chưa tốt nghiệp Cấp 3` |

**Fallback / suy giảm**

- Idempotent: đã có hàng → trả lại nguyên trạng, **không** kiểm tiên quyết lại.
- ★ **Không có cổng `CAP_MAX_ENABLED` ở server**: với `CAP_MAX_ENABLED = 3` hiện tại, endpoint này **vẫn 200** và tạo hàng thật nếu ai đó gọi trực tiếp. Đây là lý do FE phải gác — xem mục 6 «Nghiệp vụ nền».
- Không kiểm khẩu vị Cấp 3, không kiểm tài khoản ảo, không kiểm Premium.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap4/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5e91f3d8-0a26-4b74-8c1f-d3705ba9e264'
~~~

**Ghi chú khi viết lại**

- Cấu trúc giống `POST /cap3/enter` từng dòng, chỉ khác bảng tiên quyết và chuỗi lỗi (`Cấp 3` thay vì `Cấp 2`). Nếu trừu tượng hoá thành một helper dùng chung, **phải giữ nguyên chuỗi detail theo từng cấp** — FE dùng nguyên văn để hiển thị.
- Bắt lỗi unique `uq_cap4_progress_user_id` để giữ tính idempotent dưới race.

---

### PATCH /api/v1/cap4/task

> **Kích hoạt tính lại nhiệm vụ Cấp 4** — không đánh dấu gì; chỉ buộc server tính lại 3 nhiệm vụ từ lịch sử.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (giống `GET /cap4/progress`) |
| **Side-effect** | `UPDATE cap4_progress` (chỉ số + stamp mốc) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap4TaskRequest {
  /** 1 | 2 | 3 — BẮT BUỘC, chỉ để validate; không ảnh hưởng kết quả.
   *  Schema là `int` thuần → giá trị khác bị service chặn 400. */
  task_no: number;
}
~~~

~~~json
{ "task_no": 2 }
~~~

**Response 200** — `Cap4ProgressOut` (đã recompute)

~~~json
{
  "id": "d51b9c74-3e82-4a16-90f7-6b2c8ed140a9",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-14T01:44:09.720154Z",
  "task_1_done_at": "2026-08-17T02:31:57.226104Z",
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_doc_du_5lop": 1,
  "vu_khi_lop": null,
  "diem_mu_lop": null,
  "ty_le_thang_dong_thuan_cao": 0.0,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `task_no` ngoài `(1, 2, 3)` | `task_no không hợp lệ` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 4 | `Không tìm thấy tiến trình Cấp 4` |
| 422 | — | thiếu/không parse được `task_no` | `HTTPValidationError` |

**Fallback / suy giảm**

- Idempotent tuyệt đối; `task_no` không tạo nhánh nào.
- Validate `task_no` **trước** khi tìm hàng progress → chưa vào Cấp 4 + `task_no = 7` cho **400**, không 404.
- Không gọi service cấp khác → không có nhánh 404 của Cấp 3.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap4/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9b7c26e4-4f10-4d85-a3b2-6e0d17f95c88' \
  -d '{"task_no":2}'
~~~

**Ghi chú khi viết lại**

- ★ Không stamp theo `task_no` (chống graduation fraud) — xem mục 11.1.
- `_recompute_progress` của Cấp 4 **trả về `metrics`** (dict) để `thach_thuc`/`vu_khi_diem_mu` dùng lại; `mark_task` bỏ giá trị đó. Khi viết lại nên tách `computeMetrics()` (thuần) và `persistMetrics()` để 3 endpoint dùng chung mà không chạy 2 lần.
- Nhiệm vụ ② cần thêm 1 query (`_so_lenh_ketso_cap4`) và **chỉ chạy khi ① đã xong và ② chưa xong** — giữ điều kiện ngắn mạch này để không tốn query vô ích.

---

### POST /api/v1/cap4/kehoach

> **Ghi khối «Đọc 5 lớp»** — lưu bảng tự chấm 5 lớp của user (+ verdict AI nếu đã lộ) vào hàng kế hoạch Cấp 1 của một lệnh MUA; server tự tính lại 2 con số đối chiếu.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `cap4_progress`, `virtual_orders`, `order_kehoach` |
| **Side-effect** | `UPDATE order_kehoach` (`doc_5_lop`, `ai_5_lop`, `so_lop_dong_thuan`, `so_lop_khac_ai`) + `UPDATE cap4_progress` (recompute, có thể stamp ①/②/③) |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
interface Cap4KehoachRequest {
  order_id: string;                              // uuid lệnh MUA — BẮT BUỘC
  /** Map tự chấm của user. Optional trong schema (default null) nhưng THỰC TẾ BẮT BUỘC:
   *  service gọi _validate_lop_map(doc_5_lop, "doc_5_lop") không điều kiện → null/undefined
   *  cho 400 "doc_5_lop phải là object dạng {lớp: mức}".
   *  Cho phép map THIẾU lớp (đọc dở vẫn lưu được) — nhưng chỉ map đủ 5 lớp mới tính nhiệm vụ. */
  doc_5_lop?: Partial<Record<Lop, NhanDinhLop>> | null;
  /** Verdict AI rút về 3 mức. null/bỏ trống = "AI chưa lộ" → server set cả 2 count về null. */
  ai_5_lop?: Partial<Record<Lop, NhanDinhLop>> | null;
  /** ADVISORY — server LUÔN tính lại, giá trị client gửi bị bỏ hoàn toàn. */
  so_lop_dong_thuan?: number | null;
  /** ADVISORY — như trên. */
  so_lop_khac_ai?: number | null;
}
~~~

~~~json
{
  "order_id": "f0a72c19-58bd-4e63-9c14-7a8e5d20b6f3",
  "doc_5_lop": {
    "ky_thuat": "ok",
    "dong_tien": "ok",
    "noi_bo": "neu",
    "tin_tuc": "bad",
    "dinh_gia": "neu"
  },
  "ai_5_lop": {
    "ky_thuat": "ok",
    "dong_tien": "ok",
    "noi_bo": "ok",
    "tin_tuc": "neu",
    "dinh_gia": "neu"
  },
  "so_lop_dong_thuan": 3,
  "so_lop_khac_ai": 2
}
~~~

**Response 200**

~~~ts
interface Cap4OrderKehoachOut {
  id: string;                                      // uuid hàng order_kehoach
  order_id: string;
  vung_mua: number;                                // VND/cp, do Cấp 1 ghi
  doc_5_lop?: Record<string, NhanDinhLop> | null;   // đúng map đã lưu (có thể thiếu lớp)
  ai_5_lop?: Record<string, NhanDinhLop> | null;
  so_lop_dong_thuan?: number | null;                // = số lớp AI chấm "ok"; null nếu ai_5_lop null
  so_lop_khac_ai?: number | null;                   // = số lớp user chấm khác AI; null nếu ai_5_lop null
}
~~~

~~~json
{
  "id": "7b3d5e91-0c42-4867-a15f-d92e3b064c78",
  "order_id": "f0a72c19-58bd-4e63-9c14-7a8e5d20b6f3",
  "vung_mua": 27350,
  "doc_5_lop": {
    "ky_thuat": "ok",
    "dong_tien": "ok",
    "noi_bo": "neu",
    "tin_tuc": "bad",
    "dinh_gia": "neu"
  },
  "ai_5_lop": {
    "ky_thuat": "ok",
    "dong_tien": "ok",
    "noi_bo": "ok",
    "tin_tuc": "neu",
    "dinh_gia": "neu"
  },
  "so_lop_dong_thuan": 3,
  "so_lop_khac_ai": 2
}
~~~

(Ví dụ trên: AI chấm `ok` ở 3 lớp → `so_lop_dong_thuan = 3`; user lệch AI ở `noi_bo` (`neu` vs `ok`) và `tin_tuc` (`bad` vs `neu`) → `so_lop_khac_ai = 2`. Đúng như test `test_record_kehoach_adds_json_and_counts_to_existing_row`.)

**Lỗi** — theo **đúng thứ tự kiểm tra trong service**:

| # | Status | code | Khi nào | detail |
|---|---|---|---|---|
| 0 | 422 | — | `order_id` không phải uuid, hoặc `doc_5_lop` không phải object/array/null | `HTTPValidationError` |
| 1 | 404 | `NOT_FOUND` | chưa vào Cấp 4 | `Không tìm thấy tiến trình Cấp 4` |
| 2 | 404 | `NOT_FOUND` | không có lệnh `order_id`, hoặc lệnh của user khác | `Không tìm thấy lệnh` |
| 3 | 400 | `BAD_REQUEST` | lệnh không phải BUY | `Đọc 5 lớp chỉ ghi cho lệnh MUA` |
| 4 | 400 | `BAD_REQUEST` | `doc_5_lop` không phải object (null, array, số, chuỗi) | `doc_5_lop phải là object dạng {lớp: mức}` |
| 5 | 400 | `BAD_REQUEST` | `doc_5_lop` là object rỗng `{}` | `doc_5_lop không được để trống` |
| 6 | 400 | `BAD_REQUEST` | khoá lạ trong `doc_5_lop`, ví dụ `thanh_khoan` | `Lớp không hợp lệ: thanh_khoan` |
| 7 | 400 | `BAD_REQUEST` | giá trị lạ, ví dụ `{"ky_thuat":"tot"}` | `Nhận định lớp Kỹ thuật không hợp lệ: tot` |
| 8 | 400 | `BAD_REQUEST` | `ai_5_lop` khác null nhưng sai kiểu / rỗng / khoá lạ / giá trị lạ | `ai_5_lop phải là object dạng {lớp: mức}` · `ai_5_lop không được để trống` · `Lớp không hợp lệ: <khoá>` · `Nhận định lớp <Nhãn> không hợp lệ: <giá trị>` |
| 9 | 404 | `NOT_FOUND` | chưa có hàng `order_kehoach` (chưa gọi `POST /cap1/kehoach`) | `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` |
| — | 401/403 | | như trên | |

**Fallback / suy giảm**

- `ai_5_lop` **không gửi / null** → lưu `ai_5_lop = null` và **ép cả `so_lop_dong_thuan` và `so_lop_khac_ai` về `null`** ("AI chưa lộ → chưa có gì để đối chiếu"). Không phải 0.
- `doc_5_lop` chấm **thiếu lớp** vẫn lưu thành công 200 (đọc dở vẫn ghi được) — nhưng **không** tính vào `so_lenh_doc_du_5lop`, nên nhiệm vụ ① và ③ không nhích. Đây là "im lặng có chủ ý", FE nên nhắc user chấm đủ 5 lớp.
- `so_lop_khac_ai` chỉ đếm lớp có mặt trong **cả hai** map. Lớp chỉ có ở `doc_5_lop` hoặc chỉ có ở `ai_5_lop` bị bỏ qua.
- `so_lop_dong_thuan` đếm trên **`ai_5_lop`**, hoàn toàn không nhìn `doc_5_lop` (xem mục 8 «Bẫy tên»).
- Ghi lại cho cùng `order_id` → **ghi đè** cả 4 cột (không có phiên bản, không khoá sau khi lệnh đã đóng).
- Không kiểm `VirtualOrder.mode` khi ghi; hàng `san_tap` sẽ bị lọc lúc recompute.
- Không gọi AI, không gọi provider ngoài — `ai_5_lop` là dữ liệu **client gửi lên**, server không tự sinh và không xác minh.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap4/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c2e58af1-6d09-4b37-95ca-40e1b7d3286f' \
  -d '{
        "order_id": "f0a72c19-58bd-4e63-9c14-7a8e5d20b6f3",
        "doc_5_lop": {"ky_thuat":"ok","dong_tien":"ok","noi_bo":"neu","tin_tuc":"bad","dinh_gia":"neu"},
        "ai_5_lop":  {"ky_thuat":"ok","dong_tien":"ok","noi_bo":"ok","tin_tuc":"neu","dinh_gia":"neu"},
        "so_lop_dong_thuan": 3,
        "so_lop_khac_ai": 2
      }'
~~~

**Ghi chú khi viết lại**

- ★ **Validate ở tầng service, không ở DTO**: docstring schema nói rõ lý do — để payload sai cho **một** thông báo tiếng Việt (`400`) thay vì một bản dump pydantic. Nếu chuyển sang `class-validator` với `@IsEnum` trên từng khoá thì thông điệp lỗi và mã status **đổi từ 400 sang 422** → phá hợp đồng. Giữ 400 + đúng chuỗi.
- Thứ tự kiểm tra: progress (404) → lệnh (404) → BUY (400) → validate `doc_5_lop` (400) → validate `ai_5_lop` (400) → kế hoạch Cấp 1 (404). Ví dụ: payload có `doc_5_lop` sai **và** chưa có kế hoạch Cấp 1 → phải trả **400** (validate trước), không phải 404.
- `_validate_lop_map` **chuẩn hoá** giá trị về `str(muc_value)` (chấp cả instance enum), và **chỉ giữ các khoá đã kiểm** — nghĩa là output là bản sạch, không mang field lạ. Bản viết lại nên whitelist tương tự (đừng lưu nguyên payload).
- `so_lop_*` client gửi bị bỏ — **bắt buộc** có test tương đương `test_record_kehoach_recomputes_counts_ignoring_client_values`.
- Cả `doc_5_lop` và `ai_5_lop` là **cột JSON** (`sa.JSON`), không JSONB, không enum. Đừng đổi sang 10 cột enum — quyết định lưu trữ được ghi rõ trong docstring model.
- ★ Không viết bất kỳ logic nào chấm điểm user theo độ khớp AI (mục 8, nguyên tắc tối thượng).

---

### GET /api/v1/cap4/vu-khi-diem-mu

> **Vũ khí & điểm mù** — % thắng THẬT của từng lớp trong các lệnh đã đóng mà user tự đọc lớp đó là «Ủng hộ», kèm số lệnh gốc và giải thích, cùng lớp được kết luận là vũ khí / điểm mù.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB: `order_kehoach.doc_5_lop` ghép `order_ketso.pnl_pct` (tính toán trong service) |
| **Side-effect** | `UPDATE cap4_progress` (recompute đầy đủ trước khi trả — kể cả stamp nhiệm vụ) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface LopWinRate {
  lop: Lop;
  ten: string;                 // nhãn tiếng Việt: "Kỹ thuật" | "Dòng tiền" | "Nội bộ" | "Tin tức" | "Định giá"
  n_orders: number;            // số lệnh ĐÃ ĐÓNG mà user chấm lớp này = "ok"
  n_wins: number;              // trong đó bao nhiêu lệnh có pnl_pct > 0
  win_rate: number | null;     // %, null khi n_orders == 0 (KHÔNG phải 0)
  nhan: NhanVuKhi | null;      // null = đủ dữ liệu nhưng nằm giữa 50–70%
  giai_thich: string;          // luôn khác rỗng (§C12c)
}

interface VuKhiDiemMuOut {
  /** LUÔN 5 phần tử (đủ 5 lớp), sắp giảm dần theo win_rate; lớp có win_rate null xếp CUỐI. */
  lop: LopWinRate[];
  vu_khi_lop?: Lop | null;
  diem_mu_lop?: Lop | null;
  so_lenh_toi_thieu: number;   // hằng 3
  nguong_vu_khi: number;       // hằng 70.0
  nguong_diem_mu: number;      // hằng 50.0
  giai_thich: string;          // hằng _VU_KHI_GIAI_THICH
}
~~~

~~~json
{
  "lop": [
    {
      "lop": "ky_thuat",
      "ten": "Kỹ thuật",
      "n_orders": 12,
      "n_wins": 10,
      "win_rate": 83.33333333333334,
      "nhan": "vu_khi",
      "giai_thich": "Khi bạn tự đọc lớp Kỹ thuật là Ủng hộ: 10/12 lệnh đã đóng thắng (83.3%). Từ 70% trở lên — đây là vũ khí của bạn."
    },
    {
      "lop": "dong_tien",
      "ten": "Dòng tiền",
      "n_orders": 3,
      "n_wins": 2,
      "win_rate": 66.66666666666666,
      "nhan": null,
      "giai_thich": "Khi bạn tự đọc lớp Dòng tiền là Ủng hộ: 2/3 lệnh đã đóng thắng (66.7%). Nằm giữa 50% và 70% — chưa thành vũ khí, cũng chưa phải điểm mù."
    },
    {
      "lop": "tin_tuc",
      "ten": "Tin tức",
      "n_orders": 8,
      "n_wins": 2,
      "win_rate": 25.0,
      "nhan": "diem_mu",
      "giai_thich": "Khi bạn tự đọc lớp Tin tức là Ủng hộ: 2/8 lệnh đã đóng thắng (25.0%). Dưới 50% — đây là điểm mù, xem lại cách bạn đọc lớp này."
    },
    {
      "lop": "noi_bo",
      "ten": "Nội bộ",
      "n_orders": 2,
      "n_wins": 0,
      "win_rate": 0.0,
      "nhan": "chua_du_du_lieu",
      "giai_thich": "Khi bạn tự đọc lớp Nội bộ là Ủng hộ: 0/2 lệnh đã đóng thắng (0.0%). Chưa đủ dữ liệu để kết luận — cần ít nhất 3 lệnh đã đóng cho lớp này."
    },
    {
      "lop": "dinh_gia",
      "ten": "Định giá",
      "n_orders": 0,
      "n_wins": 0,
      "win_rate": null,
      "nhan": "chua_du_du_lieu",
      "giai_thich": "Chưa có lệnh nào đã đóng mà bạn tự đọc lớp Định giá là Ủng hộ — cần ít nhất 3 lệnh mới kết luận được."
    }
  ],
  "vu_khi_lop": "ky_thuat",
  "diem_mu_lop": "tin_tuc",
  "so_lenh_toi_thieu": 3,
  "nguong_vu_khi": 70.0,
  "nguong_diem_mu": 50.0,
  "giai_thich": "Đo bằng KẾT QUẢ THẬT của thị trường, không phải độ khớp AI: với mỗi lớp, lấy các lệnh đã đóng mà bạn tự đọc lớp đó là Ủng hộ rồi tính % lệnh thắng. ≥70% là vũ khí, <50% là điểm mù, cần ít nhất 3 lệnh đã đóng mỗi lớp mới kết luận."
}
~~~

> Chú ý thứ tự trong ví dụ: `noi_bo` có `win_rate = 0.0` nên xếp **sau** `tin_tuc` (25.0) và **trước** `dinh_gia` (null). Nhãn `chua_du_du_lieu` **không** đẩy lớp xuống cuối; chỉ `win_rate == null` mới bị đẩy cuối.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 4 | `Không tìm thấy tiến trình Cấp 4` |

**Fallback / suy giảm**

- **Luôn trả đủ 5 phần tử `lop`**, ngay cả khi user chưa có lệnh nào (test HTTP khẳng định `len(lop) == 5`).
- Lớp chưa có lệnh đã đóng nào chấm `ok` → `n_orders = 0`, `n_wins = 0`, `win_rate = null`, `nhan = "chua_du_du_lieu"`, `giai_thich` dùng câu riêng "Chưa có lệnh nào đã đóng…" (không in `%`).
- Không lớp nào đủ điều kiện → `vu_khi_lop = null` và/hoặc `diem_mu_lop = null`; các hằng `so_lenh_toi_thieu`/`nguong_*`/`giai_thich` **vẫn trả** để FE giải thích vì sao chưa có kết luận.
- Lệnh **còn mở** (chưa có `order_ketso`) không bao giờ vào mẫu số; chấm `neu`/`bad` không bao giờ vào mẫu số (test `test_vu_khi_diem_mu_ignores_open_and_unrated_orders`).
- `pnl_pct` đúng bằng 0 **không** tính là thắng (`_is_win` là `pnl_pct > 0`, strict).
- Ba hằng ngưỡng là hằng số phía server — FE **không** được hard-code lại; đọc từ response.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap4/vu-khi-diem-mu' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3f8ab0d5-71c9-4e26-b048-9c5d2e71af03'
~~~

**Ghi chú khi viết lại**

- Sắp xếp: key `(win_rate === null, -(win_rate ?? 0), LOP_KEYS.indexOf(lop))`. Phần `win_rate === null` **phải là khoá đầu tiên** để lớp không dữ liệu xuống cuối; phần `?? 0` ở đây **an toàn** vì chỉ dùng làm khoá sắp xếp cho các phần tử đã bị đẩy cuối — nhưng tuyệt đối **không** dùng `?? 0` khi trả `win_rate` ra ngoài.
- Chọn vũ khí / điểm mù chỉ xét các lớp **đã có nhãn** `vu_khi`/`diem_mu` (tức đã đủ ≥3 lệnh) — lớp `nhan = null` (50–70%) không tham gia cả hai danh sách.
- Định dạng chuỗi: `{win_rate:.1f}%` (1 chữ số thập phân) trong `giai_thich`, còn `win_rate` trong JSON là **float đầy đủ** (83.33333333333334). FE làm tròn, đừng làm tròn ở server.
- Ngưỡng in trong chuỗi là `{70:.0f}` / `{50:.0f}` → "70%", "50%" (không thập phân), trong khi field JSON là `70.0` / `50.0`.
- `_VU_KHI_GIAI_THICH` mở đầu bằng "Đo bằng KẾT QUẢ THẬT của thị trường, không phải độ khớp AI" — câu này là **tuyên bố nguyên tắc**, giữ nguyên văn.
- Endpoint là GET nhưng chạy recompute đầy đủ (kể cả stamp nhiệm vụ ③): mở tab «Vũ khí & điểm mù» có thể hoàn thành nhiệm vụ. Giữ nguyên hành vi.

---

### GET /api/v1/cap4/thach-thuc

> **Thách thức Thuần thục** — 3 điều kiện của nhiệm vụ ③ Cấp 4 kèm giá trị hiện tại, đạt/chưa đạt và giải thích có mẫu số.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (giống `GET /cap4/vu-khi-diem-mu`) |
| **Side-effect** | `UPDATE cap4_progress` (recompute trước khi trả) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
interface Cap4ThachThucOut {
  dat_ca_3: boolean;
  /** muc_tieu = 20.0 — số lệnh đọc + chấm đủ 5 lớp */
  so_lenh_doc_du_5lop: Cap4ThachThucDieuKien;
  /** muc_tieu = 2.0 — gia_tri_hien_tai = số trong {0,1,2}: đã biết vũ khí? + đã biết điểm mù? */
  vu_khi_diem_mu: Cap4ThachThucDieuKien;
  /** muc_tieu = 60.0 — % thắng của lệnh có so_lop_dong_thuan >= 3 */
  ty_le_thang_dong_thuan_cao: Cap4ThachThucDieuKien;
}
~~~

Chuỗi `ten` (sinh từ f-string, kết quả nguyên văn):
`"Đọc + chấm đủ 5 lớp qua ≥ 20 lệnh"`, `"Nhận ra vũ khí + điểm mù của mình"`, `"Lệnh đồng thuận cao (≥3 lớp ủng hộ) thắng ≥ 60%"`.

~~~json
{
  "dat_ca_3": false,
  "so_lenh_doc_du_5lop": {
    "ten": "Đọc + chấm đủ 5 lớp qua ≥ 20 lệnh",
    "gia_tri_hien_tai": 14.0,
    "muc_tieu": 20.0,
    "dat": false,
    "giai_thich": "Đã có 14/20 lệnh bạn đọc và tự chấm cả 5 lớp trước khi đặt — đây là thói quen đọc toàn cảnh, không phải điểm đúng/sai."
  },
  "vu_khi_diem_mu": {
    "ten": "Nhận ra vũ khí + điểm mù của mình",
    "gia_tri_hien_tai": 1.0,
    "muc_tieu": 2.0,
    "dat": false,
    "giai_thich": "Vũ khí: Kỹ thuật · Điểm mù: chưa xác định. Đo bằng KẾT QUẢ THẬT của thị trường, không phải độ khớp AI: với mỗi lớp, lấy các lệnh đã đóng mà bạn tự đọc lớp đó là Ủng hộ rồi tính % lệnh thắng. ≥70% là vũ khí, <50% là điểm mù, cần ít nhất 3 lệnh đã đóng mỗi lớp mới kết luận."
  },
  "ty_le_thang_dong_thuan_cao": {
    "ten": "Lệnh đồng thuận cao (≥3 lớp ủng hộ) thắng ≥ 60%",
    "gia_tri_hien_tai": 66.66666666666667,
    "muc_tieu": 60.0,
    "dat": true,
    "giai_thich": "Trong 12 lệnh đã đóng có ít nhất 3 lớp được đánh giá Ủng hộ, 8 lệnh thắng (66.7%) — kiểm chứng xem đọc toàn cảnh có giúp chọn lệnh tốt hơn không."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 4 | `Không tìm thấy tiến trình Cấp 4` |

**Fallback / suy giảm**

- ★ **Khác Cấp 3**: `gia_tri_hien_tai` ở đây **KHÔNG nullable** — cả 3 chỉ số luôn đo được (0 hợp lệ). Đừng copy schema nullable của Cấp 3 sang.
- Chưa xác định vũ khí / điểm mù → `gia_tri_hien_tai` là `0.0` hoặc `1.0`, và `giai_thich` dùng chuỗi `"chưa xác định"` cho phần thiếu (`LOP_LABELS.get(x or "", "chưa xác định")`).
- Chưa có lệnh đồng thuận cao nào → `gia_tri_hien_tai = 0.0`, và `giai_thich` in `"Trong 0 lệnh đã đóng có ít nhất 3 lớp được đánh giá Ủng hộ, 0 lệnh thắng (0.0%)"` — con số 0 ở đây là **thật** (mẫu số 0 được nói rõ trong câu), khác hoàn toàn với null của Cấp 3.
- `giai_thich` luôn khác rỗng cho cả 3 điều kiện.
- `dat_ca_3` tính lại từ 3 chân, không đọc `task_3_done_at`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap4/thach-thuc' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: a76e1c39-52b8-4d04-9e7a-2c8b31f0d5e6'
~~~

**Ghi chú khi viết lại**

- `vu_khi_diem_mu.gia_tri_hien_tai` = `Number(vu_khi_lop !== null) + Number(diem_mu_lop !== null)`, ép sang float. Mục tiêu cố định `2.0`. Điều kiện `dat` là **cả hai** khác null — biết vũ khí mà chưa biết điểm mù là **chưa đạt** (test `test_thach_thuc_shape_and_values`).
- `so_lenh_doc_du_5lop.gia_tri_hien_tai`/`muc_tieu` ép sang float (`14.0`, `20.0`).
- Câu `giai_thich` của điều kiện ① có mệnh đề *"đây là thói quen đọc toàn cảnh, không phải điểm đúng/sai"* — bắt buộc giữ; nó là câu chống hiểu sai thành điểm chấm.
- Mẫu số trong câu giải thích ③ lấy từ `metrics["n_dong_thuan_cao"]` / `metrics["n_dong_thuan_cao_thang"]` — **không có** trong response schema, chỉ xuất hiện trong chuỗi. Nếu bản viết lại muốn expose chúng thành field riêng thì đó là **mở rộng** (thêm field mới, không xoá chuỗi).
- `thach_thuc` gọi `_recompute_progress` **rồi** `_task3_legs(progress)` — đọc chỉ số từ hàng đã ghi, không từ `metrics`. Giữ đúng để hai nguồn không lệch.

---

### POST /api/v1/cap4/graduate

> **Tốt nghiệp Cấp 4** — đóng cấp và ghi thời gian hoàn thành, chỉ khi đủ 3/3 nhiệm vụ được server tự kiểm lại.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (recompute đầy đủ trước khi kiểm) |
| **Side-effect** | `UPDATE cap4_progress SET graduated_at = now(UTC), time_to_graduate_hours = (now - entered_at)/3600` (chỉ khi `graduated_at IS NULL`) + side-effect của recompute. Không email/Telegram/audit, **không** tự `enter` Cấp 5. |

**Path params** — —

**Query params** — —

**Request body** — không có body

**Response 200** — `Cap4ProgressOut` đã tốt nghiệp

~~~json
{
  "id": "d51b9c74-3e82-4a16-90f7-6b2c8ed140a9",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-14T01:44:09.720154Z",
  "task_1_done_at": "2026-08-14T02:10:33.418907Z",
  "task_2_done_at": "2026-08-14T08:55:01.660238Z",
  "task_3_done_at": "2026-08-17T09:12:40.335721Z",
  "so_lenh_doc_du_5lop": 20,
  "vu_khi_lop": "ky_thuat",
  "diem_mu_lop": "tin_tuc",
  "ty_le_thang_dong_thuan_cao": 83.33333333333334,
  "graduated_at": "2026-08-17T09:12:55.780412Z",
  "time_to_graduate_hours": 79.4795
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | user chưa kích hoạt | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa vào Cấp 4 | `Không tìm thấy tiến trình Cấp 4` |
| 409 | `CONFLICT` | chưa đủ 3/3 nhiệm vụ sau recompute | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 4` |

**Fallback / suy giảm**

- Idempotent: đã tốt nghiệp → trả hàng cũ, mốc không dịch.
- `entered_at` naive được coi là UTC trước khi trừ.
- Không có cửa hậu admin, không có param bỏ qua điều kiện.
- Nếu ba chân của ③ đã đạt trong một lần recompute trước đó thì `task_3_done_at` đã được stamp — `graduate` chỉ cần thấy nó khác null; **không** yêu cầu ba chân vẫn còn đạt ở thời điểm gọi (mốc không mở lại).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap4/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 0b5d7e42-91af-43c6-8752-e6c04a1b9d38'
~~~

**Ghi chú khi viết lại**

- Thứ tự: lấy hàng → recompute → kiểm 3/3 → stamp. Giống Cấp 3 từng bước; chỉ khác chuỗi 409 (`Cấp 4`).
- Công thức tốt nghiệp thực chất khắt khe hơn Cấp 3: cần **20** lệnh chấm đủ 5 lớp, **và** hệ thống phải chỉ ra được **cả** vũ khí **và** điểm mù (mỗi lớp ≥3 lệnh đã đóng, một lớp ≥70%, một lớp <50%), **và** ≥60% thắng ở nhóm đồng thuận cao. Công thức tham chiếu để dựng dữ liệu test (từ `_twenty_orders_all_legs`): 12 lệnh chấm `ky_thuat = ok` với AI 3 lớp `ok` (10 thắng → 83%) + 8 lệnh chấm `tin_tuc = ok` với AI 1 lớp `ok` (2 thắng → 25%) ⇒ `so_lenh = 20`, vũ khí `ky_thuat`, điểm mù `tin_tuc`, đồng thuận cao 10/12 = 83%.
- Transaction + lock hàng progress như Cấp 3.

---

## Ghi chú tổng hợp khi viết lại

1. **14 endpoint, 0 endpoint `ketso`.** Hai cấp này chỉ ĐỌC `order_ketso`; hàng kết sổ do `POST /cap1/ketso` (+ `POST /cap2/ketso`) tạo. Đừng "bổ sung cho đủ bộ" — thêm `POST /cap3/ketso` là thêm API không có trong hợp đồng và sẽ nhân đôi hàng kết sổ.
2. **Mọi endpoint (kể cả GET) đều ghi DB.** Ngoại lệ duy nhất: `POST /capN/enter` (chỉ INSERT, không recompute). Kiến trúc read-replica / `@ReadOnly` sẽ làm mất tiến độ một cách âm thầm.
3. **Không tin client, ở mọi tầng.** `PATCH /task` không stamp; `so_lop_dong_thuan`/`so_lop_khac_ai` bị tính lại; `graduate` recompute trước khi kiểm; mọi chỉ số suy lại từ `order_kehoach`/`order_ketso`. Ba test bắt buộc phải port: `test_record_kehoach_recomputes_counts_ignoring_client_values`, `test_graduate_requires_3_of_3` (cả hai cấp), `test_task3_not_done_while_diem_unknown`.
4. **NULL = «chưa biết», không phải 0.** Ba chỗ nguy hiểm nhất: `cap3.diem_ky_luat_tb_cap3`, `LopWinRate.win_rate`, `OrderKehoachOut.so_lop_dong_thuan`/`so_lop_khac_ai` (Cấp 4, khi AI chưa lộ). Cấm `?? 0` / `|| 0` / `Number()` trên các field này. Ngược lại, `ty_le_thang_dong_thuan_cao` và các `gia_tri_hien_tai` của Cấp 4 **không** nullable — 0.0 ở đó là số đo thật.
5. **Hai cấp KHÔNG đối xứng dù bề ngoài giống nhau.** Bảng khác biệt:

   | | Cấp 3 | Cấp 4 |
   |---|---|---|
   | Endpoint riêng | `POST /khau-vi`, `GET /thach-thuc` | `GET /vu-khi-diem-mu`, `GET /thach-thuc` |
   | Cổng trước khi ghi kế hoạch | **CÓ** — `khau_vi_da_dat` (409) | không |
   | `ThachThucDieuKien.gia_tri_hien_tai` | `number \| null` | `number` (không null) |
   | Chỉ số dựa vào cấp khác | **CÓ** — `Cap2Service.diem_ky_luat` (có thể 404 «tiến trình Cấp 2») | không |
   | Cột đồng bộ từ tài khoản ảo | `von_ban_dau` ← `initial_cash_vnd` | không |
   | Số lệnh mục tiêu ở ③ | 15 kết sổ | 20 kế hoạch chấm đủ 5 lớp |
   | Cửa sổ `entered_at` cho chỉ số chính | **CÓ** | **KHÔNG** (trừ nhiệm vụ ②) |
   | Enum PG mới | `cap3_khau_vi_rui_ro`, `cap3_cach_khoi_luong` | không (JSON + String) |

6. **Cổng nhiệm vụ ②** (cả hai cấp): chỉ xét khi ① đã xong. Một user có kết sổ trước khi ghi khối của cấp sẽ **không** được ②, và khi ① xong thì ① và ② có thể được stamp **cùng một timestamp** trong một request.
7. **Mốc `task_N_done_at` chỉ đi một chiều.** Không có logic un-stamp. Vì thế `dat_ca_3` (tính lại tức thời) có thể `false` trong khi `task_3_done_at != null` — FE phải hiểu hai thứ này khác nhau và **không** dùng `dat_ca_3` để suy ra "đã tốt nghiệp được chưa".
8. **`CAP_MAX_ENABLED = 3`, chỉ tồn tại ở FE** (`dashboard/src/features/cap1/capFlags.ts`). Backend không có cổng cấp: `POST /cap4/enter` vẫn tạo hàng thật. Nếu bản viết lại muốn thêm cổng server, phải coi là **thay đổi hành vi có chủ ý** và giữ nguyên luật "nút tốt nghiệp ở cấp trần vẫn phải ghi được về server".
9. **Premium là cổng ẩn.** Hai cấp mở cho mọi user đã xác thực, nhưng chỉ premium (và admin) mới có lệnh `mode = "thuc_chien"` — nghĩa là user FREE gọi 200 khắp nơi mà tiến độ đứng yên. Tài liệu FE/API cần nói rõ để không bị coi là bug.
10. **Đơn vị và định dạng.** `von_ban_dau`, `vung_mua`, `pnl_vnd` là **VND nguyên** (BigInteger, không xu). `khoi_luong` là **số cổ phiếu**. `pct_von`, `lai_pct_cap3`, `win_rate`, `ty_le_thang_dong_thuan_cao`, `diem_ky_luat_tb_cap3` là **phần trăm dạng 0–100** (18.5 = 18,5%). `time_to_graduate_hours` là **giờ** dạng float. Mọi số trong chuỗi `giai_thich` theo en-US (`250,000,000đ`, `83.3%`); mọi ngày hiển thị theo vi-VN là việc của FE.
11. **Sắp xếp mặc định.** `VuKhiDiemMuOut.lop`: `(win_rate === null, -win_rate, thứ tự LOP_KEYS)` — 5 phần tử luôn đủ, lớp không dữ liệu xuống cuối. Chọn vũ khí: `(-win_rate, -n_orders, thứ tự LOP_KEYS)`; điểm mù: `(win_rate, -n_orders, thứ tự LOP_KEYS)`. Thứ tự `LOP_KEYS` = `ky_thuat, dong_tien, noi_bo, tin_tuc, dinh_gia` (suy từ enum `LyDo`) — **không** đổi thứ tự này, nó là bộ phá thế hoà.
12. **Ghép mua–bán là xấp xỉ 1 lô.** Dùng đúng luật của Cấp 1 (`_find_matching_buy`) để `pnl_pct` và bài đọc 5 lớp cùng nói về một cặp lệnh. Bán 2 lần cùng mã trên 1 lệnh mua sẽ gán bài đọc đó cho cả hai kết quả — **giữ nguyên**, "sửa" nó sẽ làm số Cấp 4 lệch với `pnl_pct` mà Cấp 1 đã ghi.
13. **Thắng là `pnl_pct > 0` strict.** `pnl_pct == 0` không phải thắng. Ở Cấp 3, lãi tính bằng `pnl_vnd` (tiền), ở Cấp 4 thắng/thua tính bằng `pnl_pct` (%) — hai trường khác nhau trên cùng hàng `order_ketso`, đừng thay thế cho nhau.
14. **Chuỗi lỗi và chuỗi giải thích là hợp đồng.** FE hiển thị `detail` nguyên văn. Danh sách đầy đủ (nguyên văn tiếng Việt): `Không tìm thấy tiến trình Cấp 2/3/4`, `Không tìm thấy lệnh`, `Không tìm thấy kế hoạch Cấp 1 — cần ghi lý do + vùng mua trước` (Cấp 3), `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` (Cấp 4 — **thiếu "lý do +"**, khác nhau thật), `Chưa tốt nghiệp Cấp 2/3`, `Chưa đặt khẩu vị rủi ro — cần đặt trước khi vào lệnh`, `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 3/4`, `khau_vi không hợp lệ`, `muc_tu_tin phải là 1, 2 hoặc 3`, `cach_khoi_luong không hợp lệ`, `Khối lượng phải là số dương`, `%vốn phải là số dương`, `Quản lý vốn chỉ ghi cho lệnh MUA`, `Đọc 5 lớp chỉ ghi cho lệnh MUA`, `task_no không hợp lệ`, `doc_5_lop|ai_5_lop phải là object dạng {lớp: mức}`, `doc_5_lop|ai_5_lop không được để trống`, `Lớp không hợp lệ: <khoá>`, `Nhận định lớp <Nhãn> không hợp lệ: <giá trị>`.
15. **400 vs 422.** Field có literal/enum trong pydantic (`khau_vi`, `muc_tu_tin`, `cach_khoi_luong` ở Cấp 3) → sai kiểu cho **422**; field validate trong service (`khoi_luong`, `pct_von`, `task_no`, toàn bộ `doc_5_lop`/`ai_5_lop` của Cấp 4) → **400** với thông điệp tiếng Việt. Nếu chuyển validate của Cấp 4 lên DTO thì status đổi 400 → 422: **phá hợp đồng**, đừng làm.
16. **Không có cache, không có provider ngoài, không có nền tảng bất đồng bộ.** Cả 14 endpoint chỉ đọc/ghi Postgres. Không Redis key nào, không job nền, không webhook, không Telegram, không email, không audit log. Nếu bản viết lại thêm cache cho `GET /progress` thì phải nhớ endpoint đó **ghi DB** — cache sẽ khoá luôn tiến độ.
</content>
</invoke>
