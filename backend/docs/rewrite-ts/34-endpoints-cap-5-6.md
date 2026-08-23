# Endpoint — Đấu trường Cấp 5, 6

Chương này đặc tả **18 endpoint** của hai cấp: Cấp 5 «Lão luyện» (**10 endpoint** — tách QUYẾT ĐỊNH khỏi KẾT QUẢ qua «4 ô», + «đứng ngoài có chủ đích») và Cấp 6 «Đối chiếu» (**8 endpoint** — khi 5 lớp mâu thuẫn thì tin lớp nào, và điều đó tuỳ kiểu cổ phiếu). Cả hai cấp đều **FREE về HTTP** (`CurrentUser`, KHÔNG phải `PremiumUser`) nhưng **Thực chiến-only về tiến độ** — đọc mục «Nghiệp vụ nền» §5.

★ **Điểm cực dễ implement sai:** Cấp 5 **CÓ `POST /cap5/ketso`** nhưng **KHÔNG có `kehoach`**; Cấp 6 **CÓ `POST /cap6/kehoach`** nhưng **KHÔNG có `ketso`**. Đây là kết quả đối chiếu bản cắt OpenAPI, không phải suy đoán — xem §4.

Mã nguồn tham chiếu: `app/api/v1/endpoints/cap5.py`, `cap6.py`; `app/schemas/cap5.py`, `cap6.py`; `app/services/cap5/service.py`, `cap6/service.py`; `app/models/cap5.py`, `cap6.py`; `app/models/cap1.py` (bảng dùng chung `order_kehoach` / `order_ketso`), `app/models/cap4.py` (`LOP_KEYS` / `LOP_LABELS` / `NhanDinhLop`); `tests/test_cap5.py`, `tests/test_cap6.py`. Migration: `c81a4d5e93f2_add_cap5_4_o_quyet_dinh_dung_ngoai.py`, `1df8155bcd7c_add_cap6_doi_chieu_trong_so_kieu.py`, `7b3c1e5a9d24_cap6_ty_le_thang_nullable.py`.

---

## Bảng tra nhanh

| # | Method | Path | Quyền | Mục đích |
|---|---|---|---|---|
| 1 | GET | `/api/v1/cap5/progress` | Bearer | Tiến độ Cấp 5 (hoặc `null` nếu chưa vào) — **tính lại + chấm đứng-ngoài + ghi DB** |
| 2 | POST | `/api/v1/cap5/enter` | Bearer | Vào Cấp 5 (idempotent) — bắt buộc đã tốt nghiệp Cấp 4 |
| 3 | PATCH | `/api/v1/cap5/task` | Bearer | Kích hoạt tính lại 3 nhiệm vụ (KHÔNG tự đặt xong nhiệm vụ) |
| 4 | GET | `/api/v1/cap5/verdict/{order_id}` | Bearer | Verdict hệ GỢI Ý cho 1 lệnh BÁN đã kết sổ + 4 tín hiệu provenance |
| 5 | POST | `/api/v1/cap5/ketso` | Bearer | Chốt phân loại «4 ô» cho 1 lệnh (user Đồng ý / Sửa verdict hệ) |
| 6 | POST | `/api/v1/cap5/dung-ngoai` | Bearer | Ghi 1 quyết định «đứng ngoài có chủ đích» + snapshot giá (server tự lấy) |
| 7 | GET | `/api/v1/cap5/dung-ngoai` | Bearer | Nhật ký đứng ngoài + thống kê (chấm luôn các lần tới hạn) |
| 8 | POST | `/api/v1/cap5/dung-ngoai/cham` | Bearer | Chấm tường minh mọi nước đứng ngoài đã đủ 5 phiên (idempotent) |
| 9 | GET | `/api/v1/cap5/thach-thuc` | Bearer | 3 điều kiện Thách thức Lão luyện + giá trị hiện tại + giải thích |
| 10 | POST | `/api/v1/cap5/graduate` | Bearer | Tốt nghiệp Cấp 5 — chỉ khi đủ 3/3 nhiệm vụ |
| 11 | GET | `/api/v1/cap6/progress` | Bearer | Tiến độ Cấp 6 (hoặc `null` nếu chưa vào) — **tính lại + ghi DB** |
| 12 | POST | `/api/v1/cap6/enter` | Bearer | Vào Cấp 6 (idempotent) — bắt buộc đã tốt nghiệp Cấp 5; **luôn tính lại** |
| 13 | PATCH | `/api/v1/cap6/task` | Bearer | Kích hoạt tính lại 3 nhiệm vụ (KHÔNG tự đặt xong nhiệm vụ) |
| 14 | GET | `/api/v1/cap6/goi-y` | Bearer | Kiểu cổ phiếu của mã (suy từ NGÀNH) + bảng trọng số lớp gợi ý + «vì sao» |
| 15 | POST | `/api/v1/cap6/kehoach` | Bearer | Ghi bước «Đối chiếu» vào kế hoạch Cấp 1 của 1 lệnh MUA |
| 16 | GET | `/api/v1/cap6/kehoach/{order_id}` | Bearer | Đọc lại bước Đối chiếu ĐÃ GHI trên 1 lệnh (cho màn Kết sổ) |
| 17 | GET | `/api/v1/cap6/thach-thuc` | Bearer | 3 điều kiện Thách thức Đối chiếu + 2 nhóm khớp/lệch |
| 18 | POST | `/api/v1/cap6/graduate` | Bearer | Tốt nghiệp Cấp 6 — chỉ khi đủ 3/3 nhiệm vụ |

**Rate limit:** cả 18 endpoint dùng mặc định toàn app — `RATE_LIMIT_DEFAULT = "60/minute"` (`app/core/config.py`, áp qua `SlowAPIMiddleware` trong `app/main.py`). Không endpoint nào có giá trị riêng.

---

## Kiểu dữ liệu dùng chung

~~~ts
/** Vỏ lỗi chuẩn toàn app (handler AppException trong app/main.py). */
interface ErrorEnvelope {
  detail: string;
  code:
    | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "UNAUTHORIZED"
    | "FORBIDDEN" | "UNPROCESSABLE_ENTITY" | "SERVICE_UNAVAILABLE" | null;
  errors?: Array<Record<string, unknown>> | null;
}

/** Quyết định đúng/sai — enum `Verdict` (app/models/cap5.py).
 *  ★ ĐO QUY TRÌNH, KHÔNG đo lãi/lỗ. */
type Verdict = "dung" | "sai";

/** 4 ô = verdict cuối × kết quả — enum `O4` (app/models/cap5.py).
 *  dung_thua và sai_thang là 2 ô «phản trực giác» mà sản phẩm nhấn mạnh. */
type O4 = "dung_thang" | "dung_thua" | "sai_thang" | "sai_thua";

/** 5 lý do đứng ngoài — enum `LyDoDungNgoai` (app/models/cap5.py), chọn ĐÚNG 1. */
type LyDoDungNgoai =
  | "chua_du_co_so" | "dinh_gia_dat" | "cho_vung_mua_tot_hon"
  | "du_lieu_nguoc_chieu" | "du_vi_the_nhom";

/** Nhãn hiển thị — LY_DO_DUNG_NGOAI_LABELS (app/models/cap5.py).
 *  Thứ tự khai báo này CŨNG là thứ tự phá thế hoà khi chọn `ly_do_hay_dung`. */
const LY_DO_DUNG_NGOAI_LABELS: Record<LyDoDungNgoai, string> = {
  chua_du_co_so: "Chưa đủ cơ sở (lớp chưa ủng hộ)",
  dinh_gia_dat: "Định giá đang đắt",
  cho_vung_mua_tot_hon: "Chờ vùng mua tốt hơn",
  du_lieu_nguoc_chieu: "Dữ liệu ngược chiều — rủi ro cao",
  du_vi_the_nhom: "Đã đủ vị thế nhóm này",
};

/** Kết quả 1 nước đứng ngoài sau 5 phiên — enum `KetQuaDungNgoai`.
 *  `null` = chưa tới hạn HOẶC tới hạn mà chưa lấy được giá (KHÔNG bao giờ đoán). */
type KetQuaDungNgoai = "ne_dung" | "ne_hut" | "trung_tinh";

/** KET_QUA_LABELS (app/models/cap5.py). */
const KET_QUA_LABELS: Record<KetQuaDungNgoai, string> = {
  ne_dung: "Né đúng", ne_hut: "Né hụt", trung_tinh: "Trung tính",
};

/** 5 lớp — LOP_KEYS (app/models/cap4.py) == 5 khoá `LyDo` của Cấp 1.
 *  Thứ tự này là THỨ TỰ CHUẨN dùng để sắp `ung_ho`/`nguoc_chieu`/`trung_tinh`. */
type Lop = "ky_thuat" | "dong_tien" | "noi_bo" | "tin_tuc" | "dinh_gia";

/** LOP_LABELS (app/models/cap4.py) — server luôn trả kèm nhãn, client KHÔNG tự map. */
const LOP_LABELS: Record<Lop, string> = {
  ky_thuat: "Kỹ thuật", dong_tien: "Dòng tiền", noi_bo: "Nội bộ",
  tin_tuc: "Tin tức", dinh_gia: "Định giá",
};

/** 3 mức tự chấm mỗi lớp — enum `NhanDinhLop` (app/models/cap4.py).
 *  ok = Ủng hộ · neu = Trung tính · bad = Ngược chiều. */
type NhanDinhLop = "ok" | "neu" | "bad";

/** 6 kiểu cổ phiếu — enum `KieuCoPhieu` (app/models/cap6.py).
 *  ★ `dau_co_nho` KHÔNG suy được từ ngành (là thuộc tính vốn hoá/thanh khoản,
 *  bảng `symbols` không có market cap) — chỉ tới được qua nhánh client fallback. */
type KieuCoPhieu =
  | "ngan_hang" | "tang_truong" | "chu_ky"
  | "phong_thu" | "bat_dong_san" | "dau_co_nho";

/** Một tín hiệu provenance của verdict hệ (app/schemas/cap5.py::VerdictSignal).
 *  ★ `dat = null` = «CHƯA BIẾT» (hệ chưa từng ghi dữ liệu nguồn cho tín hiệu này),
 *  KHÔNG phải «đạt» và KHÔNG phải «không đạt». Tín hiệu unknown bị LOẠI khỏi
 *  phép tính verdict — user không bị chấm sai vì dữ liệu hệ chưa có. */
interface VerdictSignal {
  ma: "co_so" | "ky_luat_thoat" | "khong_nhoi" | "khoi_luong_khop";
  ten: string;
  dat: boolean | null;
  giai_thich: string;
}

/** Blob JSON `order_ketso.verdict_provenance` — FE đọc nguyên văn, KHÔNG query vào trong. */
interface VerdictProvenance {
  verdict_he: Verdict;
  giai_thich: string;
  signals: VerdictSignal[];
  /** ISO-8601 UTC, thời điểm hệ tính verdict lúc ghi kết sổ. */
  computed_at: string;
}

/** Một nước đứng ngoài (app/schemas/cap5.py::DungNgoaiOut) — dùng lại ở 3 endpoint. */
interface DungNgoaiItem {
  id: string;                        // uuid
  symbol: string;
  decided_at: string;                // ISO-8601, có timezone
  reason: LyDoDungNgoai;
  ly_do_ten: string;
  /** VND. Snapshot do SERVER lấy lúc ghi — client không bao giờ gửi lên. */
  gia_luc_dung_ngoai: number;
  /** Ngày phiên đích để chấm = decided_at (giờ VN) + 5 phiên giao dịch. */
  han_cham_date: string;             // "YYYY-MM-DD"
  da_toi_han: boolean;
  cham_at: string | null;            // null = chưa chấm
  gia_sau_5_phien: number | null;    // null = CHƯA BIẾT, không phải 0
  ket_qua: KetQuaDungNgoai | null;   // null = chưa chấm
  ket_qua_ten: string | null;
  /** % thay đổi giá; null khi chưa có `gia_sau_5_phien`. KHÔNG phải 0. */
  pct_thay_doi: number | null;
  /** §C12c — FE hiện NGUYÊN VĂN, không bao giờ hiện con số trơ. */
  giai_thich: string;
}

/** Một điều kiện con của nhiệm vụ ③ — Cấp 5 (app/schemas/cap5.py::ThachThucDieuKien).
 *  ★ KHÁC Cấp 6: KHÔNG có `du_du_lieu` (cả 3 chỉ số Cấp 5 luôn đo được). */
interface Cap5ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  giai_thich: string;
}

/** Một điều kiện con của nhiệm vụ ③ — Cấp 6 (app/schemas/cap6.py::ThachThucDieuKien).
 *  ★ CÓ `du_du_lieu`: false = chưa đủ dữ liệu để phán (không đạt cũng KHÔNG bị
 *  tính là trượt). Server luôn trả field này, default true. */
interface Cap6ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  du_du_lieu: boolean;
  giai_thich: string;
}

/** Một phía của so sánh khớp-vs-lệch (app/schemas/cap6.py::NhomDoiChieu). */
interface NhomDoiChieu {
  khop: boolean;
  ten: string;                       // "Nhóm khớp gợi ý" | "Nhóm lệch gợi ý"
  so_lenh: number;                   // số lệnh ĐÃ ĐÓNG trong nhóm
  so_thang: number;
  /** ★★ null = nhóm CHƯA CÓ lệnh đã đóng nào. `0` là kết quả THẬT (có lệnh đã
   *  đóng, không thắng lệnh nào). HAI TRẠNG THÁI KHÁC NHAU — xem §14. */
  ty_le_thang: number | null;
  du_du_lieu: boolean;               // so_lenh >= so_lenh_toi_thieu
  so_lenh_toi_thieu: number;         // luôn = 3 (MIN_LENH_MOI_NHOM)
  giai_thich: string;
}

/** Blob JSON `order_kehoach.trong_so_goi_y` — bản sao bảng trọng số của kiểu
 *  + provenance, ĐÓNG BĂNG tại thời điểm ghi đối chiếu. */
interface TrongSoGoiY {
  kieu: KieuCoPhieu;
  kieu_ten: string;
  /** Tên ngành ICB đã suy ra kiểu; null khi kiểu do client cung cấp. */
  nganh: string | null;
  /** "nganh" = server suy từ ICB · "client" = fallback do client chọn. */
  nguon: "nganh" | "client";
  lop_uu_tien: Lop[];
  lop_it_tin: Lop[];
  giai_thich: string;
}

/** Blob JSON `order_kehoach.lop_mau_thuan` — bản chuẩn hoá của 5 lớp lúc đặt. */
interface LopMauThuan {
  ung_ho: Lop[];                     // lớp được chấm "ok", theo thứ tự LOP_KEYS
  ung_ho_ten: string[];
  nguoc_chieu: Lop[];                // lớp được chấm "bad"
  nguoc_chieu_ten: string[];
  trung_tinh: Lop[];                 // lớp được chấm "neu"
  /** Cò kích hoạt bước Đối chiếu (spec §4): ≥1 Ủng hộ VÀ ≥1 Ngược chiều.
   *  Được GHI LẠI, KHÔNG cưỡng chế — xem §12. */
  co_mau_thuan: boolean;
  /** Nguồn dữ liệu: "doc_5_lop" (ưu tiên) hoặc "client" (dự phòng). */
  nguon: "doc_5_lop" | "client";
}
~~~

**Bẫy tên trùng:** hai cấp đều có schema tên `TaskRequest`, `ThachThucDieuKien`, `ThachThucOut`; OpenAPI phải phân biệt bằng tiền tố module (`app__schemas__cap5__ThachThucOut` vs `app__schemas__cap6__ThachThucOut`). Khi viết lại bằng TypeScript **phải đặt tên khác nhau** (`Cap5ThachThucOut` / `Cap6ThachThucOut`, …) — nội dung hoàn toàn khác nhau. Ngoài ra `KetsoRequest` (Cấp 5) và `KehoachRequest` (Cấp 6) trùng tên với schema cùng tên ở các cấp khác.

---

## Nghiệp vụ nền

#### 1. Chuỗi cấp và điều kiện tiên quyết

`POST /cap5/enter` yêu cầu **đã tốt nghiệp Cấp 4**; `POST /cap6/enter` yêu cầu **đã tốt nghiệp Cấp 5**. Thứ tự kiểm tra trong `enter` (đảo thứ tự là sai):

1. Có hàng `capN_progress` của chính cấp N → **trả về ngay** (idempotent).
2. Chưa có → đọc hàng cấp N−1. Không có hàng → `404 Không tìm thấy tiến trình Cấp {N−1}`.
3. Có hàng nhưng `graduated_at IS NULL` → `409 Chưa tốt nghiệp Cấp {N−1}`.
4. Tạo hàng mới với `entered_at = now()` (UTC).

**KHÔNG có cascade:** tốt nghiệp Cấp 4 KHÔNG tự tạo hàng Cấp 5; FE phải gọi `POST /cap5/enter`. Tương tự Cấp 5 → Cấp 6.

★ **Khác biệt giữa hai `enter`** (rất dễ copy sai): `POST /cap5/enter` khi hàng đã tồn tại trả về **hàng thô, KHÔNG tính lại**; `POST /cap6/enter` **LUÔN tính lại** trước khi trả (kể cả nhánh idempotent) — có chú thích riêng trong docstring: FE hiện đúng thứ nó trả, nên user quay lại không được thấy số cũ.

#### 2. Recompute-on-read — mọi endpoint đều là WRITE

Với **mọi** endpoint của cả hai cấp (kể cả `GET`), server chạy `_recompute_progress`: tính lại toàn bộ chỉ số từ dữ liệu đã lưu, dập `task_N_done_at` nếu đủ điều kiện, rồi `flush()`. Cấp 5 còn chạy thêm `_score_due_decisions` (chấm đứng-ngoài) trong chính `_recompute_progress`.

| Endpoint | Có tính lại? | Ghi chú |
|---|---|---|
| `GET /cap5/progress` | Có (+ chấm đứng ngoài) | `null` nếu chưa vào → không tính lại |
| `POST /cap5/enter` | **KHÔNG** (nhánh idempotent) | hàng mới có sẵn số 0 |
| `PATCH /cap5/task` | Có | mục đích duy nhất của endpoint |
| `GET /cap5/verdict/{id}` | Không | chỉ đọc + suy verdict, không ghi |
| `POST /cap5/ketso` | Có | sau khi ghi 4 ô |
| `POST /cap5/dung-ngoai` | Có | 2 lần `refresh(decision)` |
| `GET /cap5/dung-ngoai` | Có (+ chấm) | |
| `POST /cap5/dung-ngoai/cham` | Có (+ chấm tường minh) | |
| `GET /cap5/thach-thuc` | Có | |
| `POST /cap5/graduate` | Có | trước khi kiểm 3/3 |
| `GET /cap6/progress` | Có | `null` nếu chưa vào |
| `POST /cap6/enter` | **Có, luôn luôn** | khác Cấp 5 |
| `PATCH /cap6/task` | Có | |
| `GET /cap6/goi-y` | Không | chỉ đọc bảng ngành/kiểu |
| `POST /cap6/kehoach` | Có | trừ nhánh no-op idempotent (`return` sớm) |
| `GET /cap6/kehoach/{id}` | Không | **KHÔNG tính lại, KHÔNG ghi đè** — cố ý |
| `GET /cap6/thach-thuc` | Có | |
| `POST /cap6/graduate` | Có | trước khi kiểm 3/3 |

**Khi viết lại:** những `GET` này ghi DB → phải nằm trong transaction ghi và **commit**. Nếu framework mặc định readonly cho GET, tiến độ sẽ mất âm thầm.

#### 3. `CAP_MAX_ENABLED` — trần cấp

`CAP_MAX_ENABLED` **KHÔNG tồn tại ở backend** (`grep -rn "CAP_MAX" app/ alembic/` → không kết quả). Nó là hằng số **frontend, một chỗ duy nhất**: `dashboard/src/features/cap1/capFlags.ts`.

**Giá trị HIỆN TẠI: `export const CAP_MAX_ENABLED = 3`.**

Hệ quả cho chương này:

- **Server KHÔNG có cổng cấp.** `POST /cap5/enter` và `POST /cap6/enter` vẫn **200 và tạo hàng THẬT** nếu tiên quyết đủ, dù cấp chưa mở với FE. Toàn bộ 18 endpoint của chương này hiện **chưa được FE gọi** (5 > 3 và 6 > 3).
- Trách nhiệm chặn nằm ở client: theo docstring `capFlags.ts`, nhánh cấp N chỉ sống khi `CAP_MAX_ENABLED >= N`, nên `GET /capN/progress` lẫn `POST /capN/enter` của cấp chưa mở **không bao giờ được bắn ra** — gọi khi cấp chưa mở là *"tạo THẬT một hàng progress trên server cho một cấp user không vào được"*.
- **Vẫn phải implement đầy đủ cả 18** — mở thêm cấp chỉ là sửa một dòng ở FE.
- Nếu bản viết lại muốn thêm cổng server thì phải coi là **thay đổi hành vi có chủ ý**, và giữ nguyên luật bất di bất dịch của `capFlags.ts`: nút tốt nghiệp ở đúng cái trần **vẫn phải bấm được và vẫn ghi tốt nghiệp về server** (modal tốt nghiệp `closable={false}`, chỉ unmount khi có `graduated_at` → nút `disabled` sẽ NHỐT VĨNH VIỄN user đã xong nhiệm vụ).

#### 4. `ketso` / `kehoach` — cấp nào có cái gì (ĐỐI CHIẾU BẢN CẮT OpenAPI)

Đã đối chiếu 18 path trong bản cắt. Kết quả **xác nhận chính xác**:

| Cấp | `enter` | `progress` | `task` | `graduate` | `kehoach` | `ketso` | `thach-thuc` | Endpoint riêng |
|---|---|---|---|---|---|---|---|---|
| **5** | ✅ | ✅ | ✅ | ✅ | ❌ **KHÔNG CÓ** | ✅ `POST /cap5/ketso` | ✅ | `GET /verdict/{order_id}`, `POST /dung-ngoai`, `GET /dung-ngoai`, `POST /dung-ngoai/cham` |
| **6** | ✅ | ✅ | ✅ | ✅ | ✅ `POST /cap6/kehoach` + `GET /cap6/kehoach/{order_id}` | ❌ **KHÔNG CÓ** | ✅ | `GET /goi-y` |

**Vì sao đối xứng ngược nhau:**

- Cấp 5 chèn bước của mình vào **màn Kết sổ** (sau khi bán) → nó ghi 5 cột lên `order_ketso`: `verdict_he`, `verdict_user`, `verdict_provenance`, `o_4`, `ly_do_sua`. Không có gì để ghi lúc MUA → không có `kehoach`.
- Cấp 6 chèn bước của mình vào **panel MUA** (bước «Đối chiếu», hiện khi 5 lớp mâu thuẫn) → nó ghi 6 cột lên `order_kehoach`: `kieu_co_phieu`, `lop_mau_thuan`, `trong_so_goi_y`, `lop_quyet_dinh`, `khop_goi_y`, `ly_do_doi_chieu`. Dữ liệu kết sổ của Cấp 6 đến từ `POST /api/v1/cap1/ketso` (Cấp 1) — Cấp 6 chỉ **đọc** `order_ketso.pnl_pct` để chia nhóm khớp/lệch, nên không có `POST /cap6/ketso`.
- Đổi lại, Cấp 6 có **`GET /cap6/kehoach/{order_id}`** — endpoint đọc-lại-theo-lệnh mà Cấp 5 không có tương ứng. Nó tồn tại vì `GET /cap6/goi-y` KHÔNG thay thế được: `/goi-y` suy lại kiểu từ ngành **ở thời điểm hiện tại**, nên với mã hệ không phân loại được (kiểu do client chọn lúc mua) nó vẫn trả "chưa phân loại" và màn Kết sổ sẽ hiện "không xét" dù server ĐÃ ghi `khop_goi_y` cho lệnh đó.

Cả hai cấp **đều không có** endpoint nào tương đương `POST /cap3/khau-vi` (đặt hồ sơ).

#### 5. Thực chiến vs sân tập — FREE vs Premium (RẤT QUAN TRỌNG)

Docstring đầu `cap5.py` và `cap6.py` ghi rõ: *"Cấp 5/6 is FREE: all endpoints use `CurrentUser` (authenticated), NOT `PremiumUser`"*. Nhưng **FREE về HTTP ≠ FREE về tiến độ**:

| | Cấp 0 | Cấp 5 | Cấp 6 |
|---|---|---|---|
| Chế độ giao dịch ảo bắt buộc | `san_tap` (sân tập) | **`thuc_chien` (Thực chiến)** | **`thuc_chien`** |
| Bộ đếm lọc theo `mode` | — | `VirtualOrder.mode == "thuc_chien"` | `VirtualOrder.mode == "thuc_chien"` |

`VirtualOrder.mode` là `String` với `default="thuc_chien"` (`app/models/virtual_trading.py`); Cấp 0 gắn nhãn `"san_tap"` cho lệnh luyện tập. **Mọi truy vấn đếm của Cấp 5 và Cấp 6 đều `WHERE VirtualOrder.mode == 'thuc_chien'`**:

- Cấp 5 `_classified_o_4`: `order_ketso.o_4 IS NOT NULL` JOIN `virtual_orders` WHERE `user_id` + `mode == 'thuc_chien'`.
- Cấp 6 `_doi_chieu_rows`: `order_kehoach.lop_quyet_dinh IS NOT NULL` JOIN `virtual_orders` WHERE `user_id` + `mode == 'thuc_chien'`; `_closed_pairs` cũng lọc `mode == 'thuc_chien'` ở cả 2 truy vấn.

★ **Hệ quả:** một user FREE chỉ được giao dịch sân tập thì các endpoint Cấp 5/6 vẫn trả **200**, `POST /cap5/dung-ngoai` vẫn ghi được (bảng `standby_decision` KHÔNG lọc mode), nhưng `so_lenh_phan_loai` / `so_lenh_doi_chieu` **mãi bằng 0** → nhiệm vụ ① và ③ không bao giờ xong → không tốt nghiệp được. Đây là **cổng thật của hai cấp này**, và nó nằm ở tầng dữ liệu, không ở tầng quyền. **CHƯA XÁC ĐỊNH** trong phạm vi chương này: điều kiện chính xác để một user được mở tài khoản `thuc_chien` — xem `app/services/virtual_trading/` và chương premium.

Ngoại lệ đáng ghi: `standby_decision` (đứng ngoài) **không dính tới lệnh nào cả** → nhiệm vụ ② Cấp 5 xong được kể cả với user chưa từng vào Thực chiến.

#### 6. Cấp 5 «Lão luyện» — 3 NHIỆM VỤ

Cả 3 nhiệm vụ **suy ra từ dữ liệu**, `PATCH /cap5/task` chỉ kích hoạt tính lại. Không nhiệm vụ nào gác lên nhiệm vụ khác (`NOT gated`). Một khi `task_N_done_at` đã dập thì **KHÔNG BAO GIỜ bị xoá** kể cả chỉ số tụt sau đó.

| Mã task | Cột | Tên hiển thị (theo spec §2) | Điều kiện hoàn thành (nguyên văn code) | Tự động? |
|---|---|---|---|---|
| `task_no = 1` | `task_1_done_at` | ① Lệnh đầu tiên đã phân loại 4 ô | `so_lenh_phan_loai >= 1` — tức có ≥1 hàng `order_ketso.o_4 IS NOT NULL` (Thực chiến) | **Tự động** khi `POST /cap5/ketso` thành công |
| `task_no = 2` | `task_2_done_at` | ② Đứng ngoài có chủ đích lần đầu | `so_lan_dung_ngoai >= 1` — chỉ cần **ĐÃ GHI** 1 `standby_decision`, **KHÔNG cần đã chấm** | **Tự động** khi `POST /cap5/dung-ngoai` thành công |
| `task_no = 3` | `task_3_done_at` | ③ Thách thức Lão luyện | **cả 3 chân cùng đúng một lúc** — xem §7 | **Tự động** ở mọi lần recompute |

`PATCH /cap5/task` nhận `task_no ∈ {1, 2, 3}`; giá trị khác → `400 task_no không hợp lệ`. Gửi `task_no = 2` **không** đặt xong nhiệm vụ 2 — nó chỉ chạy recompute.

#### 7. Cấp 5 — ĐIỀU KIỆN TỐT NGHIỆP

`POST /cap5/graduate` → `_recompute_progress` → kiểm `task_1_done_at`, `task_2_done_at`, `task_3_done_at` đều `IS NOT NULL`. Thiếu bất kỳ cái nào → **`409` `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 5`** (code `CONFLICT`). Endpoint **không** nói thiếu cái gì — FE phải gọi `GET /cap5/thach-thuc` để biết.

Nhiệm vụ ③ «Thách thức Lão luyện» = **3 chân, ALL must hold at once**:

| Chân | Hằng số | Ngưỡng | Đo bằng gì |
|---|---|---|---|
| Số lệnh đã phân loại 4 ô | `_TASK3_SO_LENH_MIN` | **≥ 20** | `COUNT(order_ketso.o_4 IS NOT NULL)` của lệnh Thực chiến |
| Số lần đứng ngoài **ĐÃ CHẤM** | `_TASK3_DUNG_NGOAI_MIN` | **≥ 5** | `COUNT(standby_decision.ket_qua IS NOT NULL)` — lần chưa chấm KHÔNG tính |
| Tỷ lệ quyết định đúng | `_TASK3_TY_LE_MIN` | **≥ 70.0 %** | `% hàng có o_4 bắt đầu bằng "dung"` trên tổng đã phân loại |

★ Ba chân là **AND**. Thiếu một chân → `dat_ca_3 = false` → `task_3_done_at` không dập → `graduate` 409.

★ **Đứng ngoài NHIỀU HƠN KHÔNG được thưởng thêm** (spec §5/§9, ghi trong docstring model): ngưỡng là ≥5 lần đã chấm, hết. Không có bậc cao hơn, không có điểm cộng.

★ `ty_le_quyet_dinh_dung` là **thước đo CHẤT LƯỢNG QUYẾT ĐỊNH, không phải tỷ lệ thắng** — câu này có nguyên văn trong `giai_thich` mà server trả.

#### 8. Cấp 5 — VERDICT HỆ, 4 TÍN HIỆU và 4 Ô

★★ **NGUYÊN LÝ TỐI THƯỢNG (spec §1/§4): «quyết định đúng» đo QUY TRÌNH, KHÔNG đo lãi/lỗ.** `_compute_signals` chỉ đọc dữ liệu quy trình; `ketso.pnl_pct` **không** là input của bất kỳ tín hiệu nào. `pnl_pct` chỉ chọn **CỘT** của ma trận 4 ô. Test `test_losing_but_disciplined_order_is_dung` và `test_winning_but_undisciplined_order_is_sai` chốt bất biến này.

**4 tín hiệu** (`VerdictSignal.ma`), tính từ `order_kehoach` của lệnh MUA khớp + `order_ketso` của lệnh BÁN:

| `ma` | `ten` | Đạt (`dat = true`) khi | `dat = null` («CHƯA BIẾT») khi |
|---|---|---|---|
| `co_so` | Có cơ sở lúc đặt | `so_lop_dong_thuan >= 3` **HOẶC** `trangThai_luc_dat == "ung_ho"` (OR, spec §1) | **Không tìm thấy hàng `order_kehoach` nào** cho lệnh mua khớp (vị thế có trước Cấp 1) |
| `ky_luat_thoat` | Tôn trọng cắt lỗ / chốt lời đã cam kết | cả 3 cờ `cham_SL_khong_cat`, `cham_TP_giu_lam_hut`, `ban_som_khi_lo_nhe` đều `false` | **KHÔNG BAO GIỜ null** — 3 cờ là `NOT NULL DEFAULT false`, `false` được đọc là "không vi phạm" |
| `khong_nhoi` | Không nhồi lệnh khi lỗ | `nhoi_lenh_khi_lo == false` | **KHÔNG BAO GIỜ null** — cùng lý do trên |
| `khoi_luong_khop` | Khối lượng khớp khẩu vị | `pct_von <= trần(khẩu vị) + 0.5` | `pct_von IS NULL` **HOẶC** không xác định được khẩu vị |

**Quy tắc suy verdict** (`_verdict_from_signals`): lấy các tín hiệu có `dat != null`; `verdict = "dung"` khi **TẤT CẢ** chúng `true`, ngược lại `"sai"`. Tín hiệu `null` **bị loại khỏi phép tính** — user không bị chấm sai vì dữ liệu hệ chưa từng ghi. (Cạnh biên: nếu *mọi* tín hiệu đều `null` thì `all([]) == true` → verdict `"dung"`; trên thực tế `ky_luat_thoat` và `khong_nhoi` luôn đo được nên trường hợp này không xảy ra.)

**Khẩu vị → trần %vốn/lệnh** (`KHAU_VI_TRAN_PCT`, spec §5):

| Khẩu vị | Nhãn | Trần | Dung sai |
|---|---|---|---|
| `than_trong` | Thận trọng | 10.0 % | `KHAU_VI_TOLERANCE_PCT = 0.5` điểm phần trăm |
| `can_bang` | Cân bằng | 20.0 % | (bù làm tròn lô — khối lượng phải là số cổ nguyên, nên mục tiêu 20% có thể ra 20.3%) |
| `tan_cong` | Tấn công | 30.0 % | |

★ **Thứ tự nguồn khẩu vị:** ưu tiên **snapshot trên lệnh** `order_kehoach.khau_vi`; chỉ khi snapshot `NULL` mới rơi về hồ sơ sống `Cap3Progress.khau_vi`. Lý do: snapshot là khẩu vị *đang có hiệu lực lúc đặt lệnh*, nên đổi hồ sơ về sau **không được** làm lật verdict của lệnh cũ.

**Ghép lệnh BÁN với lệnh MUA** (`_find_matching_buy`) — sao y luật của Cấp 1, **phải giữ nguyên**: lệnh MUA `FILLED` **gần nhất** cùng `account_id` + `symbol`, có `created_at <= sell.created_at`, `ORDER BY created_at DESC LIMIT 1`. Đây là xấp xỉ một-lô, và là cùng xấp xỉ đã sinh ra `pnl_pct` của hàng đó.

**4 ô** (`_derive_o_4(verdict, pnl_pct)`):

| | Thắng (`pnl_pct > 0`) | Thua (`pnl_pct <= 0`) |
|---|---|---|
| `verdict = "dung"` | `dung_thang` | `dung_thua` ← quyết định tốt vẫn có thể lỗ |
| `verdict = "sai"` | `sai_thang` ← **ô nguy hiểm nhất**, may mắn bị nhầm là kỹ năng | `sai_thua` |

★ **Đóng cửa đi ngang (`pnl_pct == 0`) tính là THUA** (`thang = pnl_pct > 0`, không phải `>=`) — khớp `_is_win` của Cấp 4. Đừng dùng `>=`.

★ Ô được chốt theo **`verdict_user`** (chốt của user), không theo `verdict_he`: `ketso.o_4 = _derive_o_4(verdict_user, pnl_pct)`. Nhưng `verdict_he` vẫn được ghi riêng để đối chiếu.

#### 9. Cấp 5 — «ĐỨNG NGOÀI CÓ CHỦ ĐÍCH» (bảng `standby_decision`)

**«Đứng ngoài» nghĩa là gì:** đây là bản ghi của một **QUYẾT ĐỊNH KHÔNG VÀO LỆNH** — user xem một mã, quyết định *không mua*, và ghi lại lý do. Nó **KHÔNG phải** một lệnh, **KHÔNG** tạo `VirtualOrder`, **KHÔNG** ảnh hưởng số dư hay vị thế. Triết lý sản phẩm (spec §5): *"đứng ngoài cũng là một quyết định"* — nó được đối xử như một quyết định hạng nhất, có thể review được.

Bảng `standby_decision` (migration `c81a4d5e93f2`):

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `Uuid` PK | |
| `user_id` | `Uuid` FK `users.id` `ON DELETE CASCADE`, index | index kép `ix_standby_decision_user_decided (user_id, decided_at)` |
| `symbol` | `String(20)` NOT NULL | đã `.strip().upper()` |
| `decided_at` | `DateTime(tz)` NOT NULL | `now(UTC)` lúc ghi |
| `reason` | `String(32)` NOT NULL | 1 trong 5 `LyDoDungNgoai`, validate ở service (KHÔNG phải PG enum) |
| `gia_luc_dung_ngoai` | `Numeric(18,4)` NOT NULL | VND, `asdecimal=False` → `float` trong Python/JSON |
| `cham_at` | `DateTime(tz)` NULL | **thời điểm thực sự được chấm**, không phải hạn dự kiến |
| `gia_sau_5_phien` | `Numeric(18,4)` NULL | giá đóng cửa điều chỉnh của phiên đích |
| `ket_qua` | `String(16)` NULL | 1 trong 3 `KetQuaDungNgoai` |

★ `han_cham_date` **KHÔNG phải một cột** — nó được suy tại thời điểm đọc từ `decided_at + 5 phiên`, nên đổi luật cửa sổ không cần backfill, và "đã chấm" là một phép kiểm `NULL` duy nhất không thể lệch với `ket_qua`.

**AI CHẤM: hệ tự chấm, lazy compute-on-read, KHÔNG có cron.** Không có scheduler nào cho Cấp 5. Mọi lần đọc `GET /cap5/progress` hoặc `GET /cap5/dung-ngoai` (và mọi endpoint Cấp 5 gọi `_recompute_progress`) đều chạy `_score_due_decisions`; `POST /cap5/dung-ngoai/cham` phơi **chính routine đó** ra một cách tường minh và trả thêm `so_moi_cham`.

**Thuật toán chấm** (`_score_due_decisions`):

1. Lấy mọi `standby_decision` của user, `ORDER BY decided_at DESC`.
2. Bỏ qua hàng đã có `ket_qua IS NOT NULL` (idempotent).
3. `target = han_cham_date(decided_at)` = `add_trading_days(ngày VN của decided_at, 5, holidays=∅)` — helper `app/services/virtual_trading/settlement.py`, chỉ biết **Thứ 2–Thứ 6**, **KHÔNG có lịch nghỉ lễ** (truyền `set()` rỗng).
4. `if target > hôm_nay_VN` → **chưa tới hạn**, để nguyên.
5. Lấy giá đóng cửa điều chỉnh của phiên `target` qua `get_adjusted_ohlcv(symbol, decided_on, target + 7 ngày)`.
6. Không lấy được → **để nguyên CHƯA CHẤM, KHÔNG ĐOÁN**, thử lại lần đọc sau.
7. Lấy được → tính `pct` và phân loại, ghi `gia_sau_5_phien`, `ket_qua`, `cham_at = now(UTC)`, `scored += 1`.

**Ngưỡng phân loại** (`_classify_dung_ngoai`, `pct = (gia_sau - gia_luc) / gia_luc * 100`):

| Điều kiện | `ket_qua` | Nhãn | Ý nghĩa |
|---|---|---|---|
| `pct <= 2.0` (kể cả âm) | `ne_dung` | Né đúng | Nước đứng ngoài hợp lý — **biên +2.0% ĐƯỢC TÍNH LÀ né đúng** |
| `pct >= 5.0` | `ne_hut` | Né hụt | Đã bỏ lỡ — **biên +5.0% ĐƯỢC TÍNH LÀ né hụt** |
| `2.0 < pct < 5.0` | `trung_tinh` | Trung tính | **Khoảng giữa KHÔNG BAO GIỜ bị phạt** (spec §5) |

Hằng số: `SO_PHIEN_CHAM = 5`, `NGUONG_NE_DUNG_PCT = 2.0`, `NGUONG_NE_HUT_PCT = 5.0`, `MIN_DA_CHAM_PHAN_TICH = 3`.

**Dung sai ngày lễ (holiday tolerance).** Vì helper phiên giao dịch không biết lịch nghỉ lễ, phiên đích tính ra có thể là ngày lễ không có bar. Luật fallback trong `_fetch_close_vnd`:

1. Có bar đúng `target` → dùng nó.
2. Không có → **chỉ** fallback khi chuỗi giá rõ ràng chạy **VƯỢT QUA** `target` (tồn tại `t > target_iso`) → nghĩa là dữ liệu cửa sổ đó đã đầy đủ, `target` chỉ là ngày lễ. Lúc đó dùng **phiên cuối cùng NẰM TRONG cửa sổ** (`decided_iso < t < target_iso`).
3. Chuỗi dừng trước `target`, hoặc không có phiên nào trong cửa sổ → **để CHƯA CHẤM**.

Không có luật này thì một ngày lễ duy nhất sẽ treo vĩnh viễn một quyết định.

**`ly_do_hay_dung`** (khối ⑬): lý do dùng nhiều nhất. Phá thế hoà **xác định** theo thứ tự khai báo của `LY_DO_DUNG_NGOAI_LABELS` (`chua_du_co_so` → `dinh_gia_dat` → `cho_vung_mua_tot_hon` → `du_lieu_nguoc_chieu` → `du_vi_the_nhom`), khoá không thuộc bảng bị đẩy về hạng 99. `null` khi chưa có quyết định nào. Thống kê chỉ đáng tin khi `du_de_phan_tich = so_lan_da_cham >= 3`.

#### 10. Cấp 6 «Đối chiếu» — 3 NHIỆM VỤ

| Mã task | Cột | Tên hiển thị | Điều kiện hoàn thành | Tự động? |
|---|---|---|---|---|
| `task_no = 1` | `task_1_done_at` | ① Lệnh đầu tiên đi qua bước Đối chiếu | `so_lenh_doi_chieu >= 1` — có ≥1 `order_kehoach.lop_quyet_dinh IS NOT NULL` (Thực chiến) | **Tự động** khi `POST /cap6/kehoach` thành công |
| `task_no = 2` | `task_2_done_at` | ② Kết sổ đầu tiên của Cấp 6 | `so_lenh_da_ket_so >= 1` — có ≥1 **vòng tròn ĐÃ ĐÓNG** mà lệnh MUA của nó có đối chiếu | **Tự động** — cần `POST /cap1/ketso` cho lệnh BÁN tương ứng |
| `task_no = 3` | `task_3_done_at` | ③ Thách thức Đối chiếu | cả 3 chân cùng đúng — xem §11 | **Tự động** ở mọi lần recompute |

★ Nhiệm vụ ② **không** xong bằng cách gọi endpoint Cấp 6 nào cả — nó cần một lệnh bán được kết sổ ở **Cấp 1** (`POST /api/v1/cap1/ketso`). Đây là lý do Cấp 6 không có `ketso` riêng.

`PATCH /cap6/task` nhận `task_no ∈ {1, 2, 3}`; khác → `400 task_no không hợp lệ`.

#### 11. Cấp 6 — ĐIỀU KIỆN TỐT NGHIỆP

`POST /cap6/graduate` thiếu điều kiện → **`409` `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 6`** (code `CONFLICT`).

Nhiệm vụ ③ «Thách thức Đối chiếu» = **3 chân AND**:

| Chân | Hằng số | Ngưỡng | Đo bằng gì |
|---|---|---|---|
| Số lệnh đã đối chiếu | `_TASK3_SO_LENH_MIN` | **≥ 15** | `COUNT(order_kehoach.lop_quyet_dinh IS NOT NULL)` (Thực chiến) |
| Số kiểu cổ phiếu đã gặp | `_TASK3_SO_KIEU_MIN` | **≥ 3** | `COUNT(DISTINCT kieu_co_phieu)` **không NULL** trong các hàng trên |
| «Đối chiếu giúp ích» | `MIN_LENH_MOI_NHOM` | `ty_le_thang_khop >= ty_le_thang_lech`, **VÀ mỗi nhóm ≥ 3 lệnh ĐÃ ĐÓNG** | `_nhom()` × 2 |

★ **Hoà tính là ĐẠT** (`>=`, không phải `>`) — test `test_win_rate_ties_count_as_pass`.

★ Chân thứ 3 **cần CẢ HAI nhóm đạt ≥3 lệnh đã đóng** mới được xét. Dưới ngưỡng: `du_ca_2_nhom = false` → `doi_chieu_giup_ich = false` → chân không đạt, và `GET /cap6/thach-thuc` báo `du_du_lieu = false` với câu *"Trên 1-2 lệnh thì con số không nói được gì, nên IQX không so"*. **Đây không phải trượt, cũng không phải pass mặc định.**

#### 12. Cấp 6 — «ĐỐI CHIẾU TRỌNG SỐ KIỂU» là gì (migration `1df8155bcd7c`)

**Vấn đề nghiệp vụ:** ở Cấp 4 user tự chấm 5 lớp (Kỹ thuật / Dòng tiền / Nội bộ / Tin tức / Định giá) cho mỗi lệnh. Khi các lớp **nói ngược nhau** (≥1 lớp `ok` Ủng hộ VÀ ≥1 lớp `bad` Ngược chiều — đó là `co_mau_thuan`), user phải chọn **tin lớp nào**. Cấp 6 dạy rằng câu trả lời **tuỳ KIỂU cổ phiếu**: định giá đáng tin với ngân hàng nhưng ít tin với cổ phiếu tăng trưởng.

★★ **NGUYÊN LÝ TỐI THƯỢNG (spec §5/§10): bảng trọng số là GỢI Ý, KHÔNG phải LUẬT.** Server gợi ý lớp nào nên ưu tiên **và luôn trả kèm câu «vì sao»** (§C12c). User tự chọn `lop_quyet_dinh` và **được chọn NGOÀI gợi ý** — đó là `khop_goi_y = false`: một **SỰ THẬT TRUNG TÍNH**. Không có bộ đếm nào loại nó, không ngưỡng nào phạt nó, không nhãn nào gọi nó là "sai". Tác dụng duy nhất: chọn nhóm nào để so % thắng, mà trọng tài là **kết quả thị trường thật**. Test `test_lech_goi_y_is_neutral_never_penalised` chốt bất biến này. Nhãn: `KHOP_GOI_Y_LABELS = { true: "Khớp gợi ý", false: "Lệch gợi ý" }` — **cả hai đều không nói đúng/sai**.

**BẢNG TRỌNG SỐ 6 KIỂU** (`KIEU_CO_PHIEU` trong `app/models/cap6.py` — đây là DATA, một nguồn sự thật duy nhất cho cả `GET /cap6/goi-y` và `trong_so_goi_y`/`khop_goi_y` mà server suy lúc ghi):

| `kieu` | `kieu_ten` | `lop_uu_tien` (theo thứ tự) | `lop_it_tin` |
|---|---|---|---|
| `ngan_hang` | Ngân hàng | `dinh_gia`, `noi_bo` | `ky_thuat` |
| `tang_truong` | Tăng trưởng / công nghệ | `ky_thuat`, `tin_tuc`, `dong_tien` | `dinh_gia` |
| `chu_ky` | Chu kỳ / công nghiệp | `dong_tien`, `dinh_gia` | `ky_thuat` |
| `phong_thu` | Phòng thủ / tiêu dùng | `dinh_gia`, `noi_bo` | `ky_thuat` |
| `bat_dong_san` | Bất động sản | `noi_bo`, `tin_tuc`, `dong_tien` | `dinh_gia` |
| `dau_co_nho` | Đầu cơ / vốn hóa nhỏ | `dong_tien`, `ky_thuat` | `dinh_gia`, `noi_bo` |

Câu `giai_thich` của từng kiểu là nguyên văn, xem `app/models/cap6.py` (ví dụ `ngan_hang`: *"Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ thuật ngắn hạn ít tin cậy hơn cho nhóm này."*). FE hiện **nguyên văn**. Có hàm `_assert_lop_keys()` chạy **lúc import**, `raise RuntimeError` nếu bảng nhắc một lớp Cấp 4 không biết, hoặc một lớp vừa `uu_tien` vừa `it_tin`, hoặc thiếu bảng cho một kiểu → **phải giữ kiểm tra khởi động này khi viết lại**.

**THUẬT TOÁN SO KHỚP (`khop_goi_y`)** — đúng một dòng, cực đơn giản, đừng phức tạp hoá:

~~~ts
khop_goi_y = trong_so_goi_y.lop_uu_tien.includes(lop_quyet_dinh)
~~~

- `true` = lớp user chọn **nằm trong** `lop_uu_tien` của kiểu.
- `false` = **không** nằm trong (kể cả khi nó nằm trong `lop_it_tin`, hay không nằm trong cả hai — cả ba trường hợp đều là `false`). `lop_it_tin` **KHÔNG** tham gia phép so; nó chỉ để hiển thị.
- `null` = **kiểu chưa phân loại** → không có gợi ý nào → **không có gì để khớp**. ★ User **không bao giờ** bị dán nhãn "lệch" trước một gợi ý chưa từng được đưa ra.

**MAP NGÀNH → KIỂU (server-side, `kieu_from_nganh`).** Nguồn: `Symbol.icb_lv2` (ưu tiên, mịn hơn) rồi `Symbol.icb_lv1` (dự phòng, thô), lấy qua `SymbolRepository.get_by_symbol`. Khoá được chuẩn hoá bởi `_norm_nganh`: NFKD bỏ dấu, `đ/Đ → d/D`, gom khoảng trắng, `lower()` — nên nhãn ICB thượng nguồn có thể lệch hoa/thường/dấu mà không vỡ map.

| Nguồn | Ngành ICB | → `kieu` |
|---|---|---|
| `icb_lv2` | Ngân hàng | `ngan_hang` |
| `icb_lv2` | Công nghệ Thông tin · Viễn thông | `tang_truong` |
| `icb_lv2` | Xây dựng và Vật liệu · Hàng & Dịch vụ Công nghiệp · Dầu khí · Tài nguyên Cơ bản · Hóa chất · Ô tô và phụ tùng · Dịch vụ tài chính (chứng khoán) · Du lịch và Giải trí · Truyền thông | `chu_ky` |
| `icb_lv2` | Thực phẩm và đồ uống · Hàng cá nhân & Gia dụng · Y tế · Điện, nước & xăng dầu khí đốt · Bán lẻ · Bảo hiểm | `phong_thu` |
| `icb_lv2` | Bất động sản | `bat_dong_san` |
| `icb_lv1` | Công nghiệp · Nguyên vật liệu · Dịch vụ Tiêu dùng | `chu_ky` |
| `icb_lv1` | Hàng Tiêu dùng · Dược phẩm và Y tế · Tiện ích Cộng đồng | `phong_thu` |

**4 hệ quả CỐ Ý, phải giữ nguyên:**

1. `POST /cap6/kehoach` **suy lại kiểu từ symbol của lệnh, và giá trị của SERVER THẮNG** — client không thể khai kiểu khác để lật `khop_goi_y` (spec §10: *"Kiểu cổ phiếu do user tự gán tay — KHÔNG"*).
2. Chỉ khi server **KHÔNG** phân loại được (không có hàng `symbols`, không có giá trị ICB, hoặc ngành cố ý không map) thì `kieu_co_phieu` của client mới được nhận — **và phải validate lại theo enum 6 kiểu trước** (khác → `400 kieu_co_phieu không hợp lệ`).
3. `dau_co_nho` **không suy được từ ngành** (thuộc tính vốn hoá/thanh khoản; `symbols` không có market cap) → chỉ tới được qua nhánh (2). Ghi rõ chứ không giả lập.
4. `icb_lv1 == "Tài chính"` **CỐ Ý KHÔNG MAP**: ở cấp 1 nó trộn bất động sản, dịch vụ tài chính (chứng khoán) và bảo hiểm — ba nhóm có trọng số khác nhau. Đoán ở đó tệ hơn "chưa phân loại", và spec thiết kế sẵn cho trạng thái đó (§4/§10: bỏ gợi ý theo kiểu, **vẫn** cho user chọn lớp quyết định).

**`lop_mau_thuan` suy lại từ `doc_5_lop`** (dữ liệu Cấp 4 đã lưu trên chính hàng đó), chuẩn hoá thành `{ung_ho, ung_ho_ten, nguoc_chieu, nguoc_chieu_ten, trung_tinh, co_mau_thuan, nguon}` theo thứ tự chuẩn `LOP_KEYS`. Bản của client chỉ được dùng khi `doc_5_lop` vắng. Validate của map client **CỐ Ý dễ tính**: khoá/giá trị lạ bị **loại bỏ im lặng** chứ không 400 (vì bản có thẩm quyền là `doc_5_lop`); map rỗng sau khi lọc → `null`.

**Cò `co_mau_thuan` KHÔNG được cưỡng chế như một cổng.** Nó được tính và lưu (để khối ⑭/⑮ và FE đọc), nhưng ghi đối chiếu cho một lệnh **không** mâu thuẫn **không phải lỗi**: cò này là luật UI (spec §4 *"không hiện bước Đối chiếu"*), và một 4xx ở server chỉ biến một lần suy ngẫm vô hại thành luồng vỡ.

#### 13. KHOÁ CHỐNG GIAN LẬN — «graduation fraud»

Codebase này **đã từng có lỗ hổng gian lận tốt nghiệp**. Luật nền: **KHÔNG TIN CLIENT — mọi điều kiện phải kiểm lại từ dữ liệu đã lưu, trong transaction, ngay trước khi dập `graduated_at`.**

**A. Client KHÔNG BAO GIỜ đặt được nhiệm vụ hay chỉ số.**

| Đường tấn công | Chốt phía server |
|---|---|
| `PATCH /cap5/task` / `PATCH /cap6/task` gửi `task_no` để "đánh dấu xong" | Handler **KHÔNG** ghi `task_N_done_at` theo `task_no`. Nó chỉ validate `task_no ∈ {1,2,3}` rồi gọi `_recompute_progress`. Nhiệm vụ chỉ được dập khi dữ liệu nguồn đủ. `task_no` gần như **chỉ để tương thích API** |
| Gửi `so_lenh_phan_loai`, `ty_le_quyet_dinh_dung`, `so_lenh_doi_chieu`, `ty_le_thang_khop`… | **Không schema request nào có các field này.** Chúng luôn được tính lại từ `order_ketso` / `order_kehoach` / `standby_decision` (docstring model: *"NEVER client-supplied"*) |
| Gửi `verdict_he` để tự tuyên bố quyết định đúng | `record_ketso` nhận `verdict_he` **chỉ trong signature** (`# noqa: ARG002 — advisory`) và **LUÔN TÍNH LẠI** từ dữ liệu quy trình đã lưu, kể cả khi FE đã hiện nó. Schema `KetsoRequest` **không có** `verdict_he` lẫn `o_4`. Test `test_ketso_recomputes_verdict_he_ignoring_client` |
| Gửi `o_4` để tự xếp ô | `o_4` luôn `_derive_o_4(verdict_user, ketso.pnl_pct)` — `pnl_pct` đọc từ DB, không nhận từ client |
| Gửi `trong_so_goi_y` / `khop_goi_y` để tự khai "khớp gợi ý" | `record_kehoach` nhận cả hai **chỉ trong signature** (`# noqa: ARG002`) và **bỏ qua hoàn toàn**; server suy lại từ bảng kiểu. Schema `KehoachRequest` **không có** hai field này. Test `test_kehoach_never_trusts_client_kieu_or_khop` |
| Gửi `kieu_co_phieu` khác để lật `khop_goi_y` | Server suy lại từ ngành và **thắng**; client chỉ được dùng khi server bó tay, và phải qua validate enum |
| Gửi `gia_luc_dung_ngoai` để tự tạo nước "né đúng" | Schema `DungNgoaiRequest` chỉ có `symbol` + `reason`. Giá do **server** `resolve_price()` lấy, và **fail closed 503** nếu không nguồn nào có giá (một hàng không có snapshot so sánh được thì không bao giờ chấm được — mất luôn ý nghĩa của việc ghi) |
| Gửi `ket_qua` để tự chấm né đúng | Không có endpoint nào nhận `ket_qua`. `POST /cap5/dung-ngoai/cham` **không có request body** — nó chỉ chạy routine chấm và **không đoán** khi thiếu giá |
| Gửi `lop_mau_thuan` để giả mâu thuẫn | Suy lại từ `doc_5_lop` đã lưu; client chỉ là dự phòng, và cò `co_mau_thuan` dù sao cũng không phải cổng |

**B. `POST /capN/graduate` — trình tự kiểm bắt buộc (cả hai cấp giống nhau):**

1. `_require_progress(user_id)` → không có hàng → **404**.
2. `await _recompute_progress(...)` → **tính lại TẤT CẢ** chỉ số + dập lại nhiệm vụ ngay tại đây (không tin `task_N_done_at` cũ; recompute chỉ có thể **thêm** chứ không xoá).
3. Kiểm `all(task_N_done_at is not None for N in (1,2,3))` → thiếu → **409**.
4. Chỉ khi `graduated_at IS NULL` mới ghi: `graduated_at = now(UTC)`, `time_to_graduate_hours = (now - entered_at).total_seconds() / 3600`.
5. Gọi lại → **idempotent**, `graduated_at` **giữ nguyên giá trị đầu** (test `assert again.graduated_at == first`), không tính lại giờ.

★ Bước 2 **trước** bước 3 là điểm cốt tử: đừng đọc cờ nhiệm vụ đã cache rồi mới tính lại.

★ `entered_at` có thể naive tuỳ driver → code `replace(tzinfo=UTC)` trước khi trừ. Bản viết lại phải xử lý cùng cách, nếu không `time_to_graduate_hours` sẽ sai hoặc ném lỗi.

**C. FREEZE của Cấp 6 — chống «dời người thắng sang nhóm khớp».**

Đây là khoá chống gian lận **riêng và quan trọng nhất** của chương này. Chân ③ của Cấp 6 so % thắng nhóm khớp với nhóm lệch, nên một `lop_quyet_dinh` còn sửa được **sau khi đã biết kết quả** sẽ cho user chờ xem lệnh nào lãi rồi dời chúng sang nhóm khớp — chế tạo ra chân ③.

Luật trong `record_kehoach`, chạy **sau** khi đã có `kehoach` và **trước** khi ghi:

~~~text
if kehoach.lop_quyet_dinh IS NOT NULL:
    same = (lop_quyet_dinh trùng) AND (ly_do_doi_chieu.trim() trùng)
    if same:                      -> RETURN hàng cũ, no-op (retry mạng KHÔNG 409)
    if order.status == FILLED:     -> 409 (khoá)
    # chưa FILLED -> cho sửa, chảy tiếp xuống ghi lại
~~~

- **Chưa khớp (`status != FILLED`) → CÒN SỬA ĐƯỢC.** Panel là một form user được lùi bước; và một lệnh mua chưa khớp **không thể** vào một cặp đã đóng (`_closed_pairs` chỉ ghép lệnh mua `FILLED`), nên chưa có kết quả nào để sửa hướng về.
- **Đã khớp (`FILLED`) → ĐÓNG BĂNG.** Post lại y nguyên = no-op; khác đi = **409** với `detail` nguyên văn: *"Lệnh này đã khớp — phần Đối chiếu không sửa được nữa. Lớp bạn chọn tin phải được chốt TRƯỚC khi biết lệnh lãi hay lỗ, đó là điều làm so sánh khớp/lệch gợi ý có nghĩa."*
- Đây là **time-lock của Cấp 7 áp cho input duy nhất Cấp 6 nhận từ user**. Test: `test_lop_quyet_dinh_is_frozen_once_the_order_has_filled`, `test_doi_chieu_stays_editable_while_the_order_has_not_filled`.

**D. Cấp 5 — `POST /cap5/ketso` CÓ ghi lại được, và vì sao vẫn an toàn.**

Post lại **cùng một `order_id`** sẽ **ghi đè** phân loại (KHÔNG 409) — vì Kết sổ là luồng UI user được lùi bước ("Đồng ý" rồi "Tôi thấy khác"), và một retry không được thành lỗi. Vẫn an toàn vì:

- Đây là **sửa từng lệnh**, không phải "phân loại lại hàng loạt" mà spec §9 cấm: không gì ở đây ghi được sang lệnh khác.
- `verdict_he` và `o_4` **luôn** được suy lại từ dữ liệu quy trình đã lưu → không bản ghi lại nào **bịa** ra được một ô.

**E. `GET /cap6/kehoach/{order_id}` — chỉ đọc, KHÔNG tính lại, KHÔNG ghi.** Đây là bất biến cố ý (test `test_get_kehoach_never_rewrites_what_was_recorded`): endpoint này đọc từ **cột đã lưu**, kể cả khi bảng ngành hôm nay đã suy ra kiểu khác. Đừng "tối ưu" bằng cách tính lại.

**F. Quyền sở hữu: lệnh của người khác → 404, KHÔNG PHẢI 403.** Quy ước chung của `GET /cap5/verdict/{id}`, `POST /cap5/ketso`, `POST /cap6/kehoach`, `GET /cap6/kehoach/{id}`: `order is None OR order.user_id != user_id` → cùng một `404 Không tìm thấy lệnh`. Cố ý — không tiết lộ lệnh có tồn tại hay không. Test `test_get_kehoach_404_for_another_users_order`.

#### 14. Ý nghĩa NULL — «CHƯA BIẾT», KHÔNG PHẢI 0

Codebase này **đã có bug "unknown hiện thành 0"**, và migration `7b3c1e5a9d24` tồn tại **chỉ để sửa đúng lỗi đó**. Bảng đầy đủ cho chương này:

| Field | `null` nghĩa là | `0` nghĩa là |
|---|---|---|
| `cap6_progress.ty_le_thang_khop` | **Nhóm khớp CHƯA CÓ lệnh đã đóng nào** | Có lệnh đã đóng, **không thắng lệnh nào** |
| `cap6_progress.ty_le_thang_lech` | Nhóm lệch chưa có lệnh đã đóng nào | Có lệnh đã đóng, không thắng lệnh nào |
| `NhomDoiChieu.ty_le_thang` | Y như trên (`so_lenh == 0`) | Y như trên |
| `VerdictSignal.dat` | Hệ **chưa từng ghi** dữ liệu nguồn → bị **loại** khỏi phép tính verdict | (không áp dụng — kiểu boolean) |
| `OrderKehoach.khop_goi_y` | **Kiểu chưa phân loại** → không có gợi ý để khớp → lệnh **không vào nhóm nào** | (không áp dụng) |
| `standby_decision.ket_qua` | Chưa tới hạn, HOẶC tới hạn mà chưa lấy được giá | (không áp dụng) |
| `standby_decision.gia_sau_5_phien` / `DungNgoaiItem.pct_thay_doi` | Chưa chấm được | Giá đúng bằng 0 / không đổi 0% (thực tế) |
| `task_N_done_at`, `graduated_at`, `cham_at` | Chưa xảy ra | (không áp dụng) |
| `KehoachCap6DetailOut.id` | Lệnh **không có hàng `order_kehoach`** nào | (không áp dụng) |

★★ **Lịch sử migration `7b3c1e5a9d24` (2026-08-01)**: `ty_le_thang_khop`/`ty_le_thang_lech` ban đầu được tạo `NOT NULL DEFAULT 0`, nên một nhóm **chưa có lệnh đã đóng nào** bị lưu — và `GET /cap6/progress` trả về — là `0.0`: **không phân biệt được** với nhóm CÓ lệnh đã đóng mà thắng 0 lệnh. Hai câu này **ngược nhau**, và câu thứ hai đọc như một lời phán xét về user. Migration làm hai cột **nullable**, `server_default = None`. **Không backfill**: mọi hàng được tính lại từ `order_kehoach ⋈ order_ketso` ở lần đọc kế tiếp (`_recompute_progress` chạy ở mọi read/write Cấp 6), nên `0` cũ tự thành `NULL`.

★ Trong code, `_compute_metrics` gán thẳng `nhom["ty_le_thang"]` (đã là `None` khi `so_lenh == 0`) — **KHÔNG dùng `or`**: `x or 0.0` sẽ gộp `None` và `0.0` thành cùng một số. Comment trong source ghi rõ điều này.

★ **Cạnh biên phải chú ý:** trong `GET /cap6/thach-thuc`, khối điều kiện `doi_chieu_giup_ich` có `gia_tri_hien_tai` và `muc_tieu` **KHÔNG nullable** (schema `Cap6ThachThucDieuKien` yêu cầu `number`), nên service **đổi `null` thành `0.0`** ở đúng hai chỗ đó. Con số `0.0` ấy **chỉ có nghĩa khi `du_du_lieu = true`**. Tỷ lệ nullable thật nằm ở `nhom_khop.ty_le_thang` / `nhom_lech.ty_le_thang` ngay bên dưới. **FE phải đọc `du_du_lieu` trước, không được vẽ `gia_tri_hien_tai` khi nó `false`.**

#### 15. Quan hệ với GIAO DỊCH ẢO — bảng tổng hợp

| | Cấp 5 | Cấp 6 |
|---|---|---|
| Bảng riêng | `cap5_progress`, `standby_decision` | `cap6_progress` |
| Cột thêm vào bảng dùng chung | `order_ketso` **+5**: `verdict_he`, `verdict_user`, `verdict_provenance`, `o_4`, `ly_do_sua` | `order_kehoach` **+6**: `kieu_co_phieu`, `lop_mau_thuan`, `trong_so_goi_y`, `lop_quyet_dinh`, `khop_goi_y`, `ly_do_doi_chieu` |
| Lệnh nào được ghi | Lệnh **BÁN** (`side == SELL`) đã có `order_ketso` | Lệnh **MUA** (`side == BUY`) đã có `order_kehoach` |
| Chế độ | `thuc_chien` (bộ đếm) | `thuc_chien` (bộ đếm) |
| Thay panel mua? | Không — chỉ chèn vào Kết sổ | Không — chèn 1 bước vào panel mua, **cộng dồn** lên Cấp 1-5 |
| Repo dùng | `VirtualTradingRepository` (**read-only**) | `VirtualTradingRepository` (read-only) + `SymbolRepository` |

**Vì sao KHÔNG lọc theo `entered_at`** (cả hai cấp, cố ý — cùng lý do Cấp 4): `order_ketso.o_4` chỉ có thể được ghi bởi `POST /cap5/ketso`, mà endpoint đó **đòi có hàng `Cap5Progress`**; tương tự `order_kehoach.lop_quyet_dinh` chỉ được ghi bởi `POST /cap6/kehoach` (đòi `Cap6Progress`). Nên mọi hàng mang các cột đó **tự thân đã là thời-Cấp-5/6**. Thêm bộ lọc `entered_at` chỉ tạo cửa sổ sai lệch do độ trễ.

**Ghép cặp đã đóng (`_closed_pairs`, Cấp 6)** — sao y luật Cấp 1, **3 truy vấn**, thực hiện trong Python:

1. Lấy các `order_kehoach` có đối chiếu + lệnh MUA của chúng.
2. Lấy mọi lệnh MUA `FILLED` Thực chiến, `ORDER BY created_at ASC`.
3. Lấy mọi `(order_ketso, lệnh BÁN)` Thực chiến, `ORDER BY closed_at ASC`.
4. Với mỗi kết sổ: quét danh sách MUA **theo thứ tự tăng dần** và giữ **cái khớp CUỐI CÙNG** (`account_id` trùng, `symbol` trùng, `created_at <= sell.created_at`) → đó là lệnh mua gần nhất. Nếu lệnh mua đó có đối chiếu → thêm vào cặp.

★ **Phân nhóm khớp/lệch** dùng `kehoach.khop_goi_y is not None and bool(kehoach.khop_goi_y) is khop` — dùng `is` (không phải `==`) để một `0`/`1` lạ từ driver không rơi vào nhóm sai. Lệnh có `khop_goi_y = null` **không vào nhóm nào** (test `test_unclassified_orders_join_neither_win_rate_group`).

★ `_is_win(ketso) = ketso.pnl_pct > 0` — đi ngang tính **thua**, khớp Cấp 4/Cấp 5.

---

## Cấp 5 «Lão luyện»

10 endpoint. Prefix router `/cap5`, tag OpenAPI `Cấp 5`. Toàn bộ dùng `CurrentUser` (Bearer, **không** Premium).

### GET /api/v1/cap5/progress

> **Tiến độ Cấp 5** — trả toàn bộ trạng thái Cấp 5 của user hiện tại, hoặc `null` nếu chưa vào cấp.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không (nhánh chấm đứng-ngoài có dùng cache provider `ta:ohlcv:{SYMBOL}:{start}:{end}`, TTL 1800s) |
| **Nguồn dữ liệu** | DB (`cap5_progress`, `order_ketso`, `standby_decision`, `virtual_orders`) + provider giá (VCI/VNDIRECT) khi có nước đứng ngoài tới hạn |
| **Side-effect** | ★ **CÓ GHI DB** — cập nhật 3 chỉ số + dập `task_N_done_at`; chấm các `standby_decision` đã tới hạn (ghi `gia_sau_5_phien`, `ket_qua`, `cham_at`) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** null = user CHƯA vào Cấp 5. Response body đúng là chữ `null` (không phải {}). */
type Cap5ProgressResponse = Cap5ProgressOut | null;

interface Cap5ProgressOut {
  id: string;                          // uuid hàng cap5_progress
  user_id: string;                     // uuid
  entered_at: string;                  // ISO-8601, có timezone
  /** ① Lệnh đầu tiên đã phân loại 4 ô. null = chưa xong. */
  task_1_done_at: string | null;
  /** ② Đứng ngoài có chủ đích lần đầu (chỉ cần ĐÃ GHI, chưa cần đã chấm). */
  task_2_done_at: string | null;
  /** ③ Thách thức Lão luyện (3 chân AND). */
  task_3_done_at: string | null;
  /** Số lệnh Thực chiến đã có o_4. NOT NULL, mặc định 0 — 0 ở đây là 0 THẬT. */
  so_lenh_phan_loai: number;
  /** Số nước đứng ngoài ĐÃ CHẤM (ket_qua != null). Lần chưa chấm KHÔNG tính. */
  so_lan_dung_ngoai_da_cham: number;
  /** % lệnh nằm ô dung_* trên tổng đã phân loại. NOT NULL; 0.0 khi chưa có lệnh
   *  nào (đây là ngoại lệ có ý thức: cột NOT NULL DEFAULT 0, KHÁC Cấp 6). */
  ty_le_quyet_dinh_dung: number;
  graduated_at: string | null;
  /** Giờ từ entered_at tới graduated_at. null khi chưa tốt nghiệp. */
  time_to_graduate_hours: number | null;
}
~~~

~~~json
{
  "id": "3f7a91c2-5d84-4e16-9b03-7c2e8a4f1d60",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-07-28T02:14:33.512088+00:00",
  "task_1_done_at": "2026-08-03T07:41:02.118934+00:00",
  "task_2_done_at": "2026-08-05T03:22:47.905611+00:00",
  "task_3_done_at": null,
  "so_lenh_phan_loai": 14,
  "so_lan_dung_ngoai_da_cham": 6,
  "ty_le_quyet_dinh_dung": 78.57142857142857,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / hết hạn Bearer token | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Tài khoản bị vô hiệu hoá (`get_current_active_user`) | `Không đủ quyền truy cập` |

**KHÔNG có 404** — chưa vào cấp thì trả `null` với status 200.

**Fallback / suy giảm** — Provider giá lỗi hoặc ngoài giờ giao dịch: `_fetch_close_vnd` bắt **mọi** exception, log `debug`, trả `None` → nước đứng ngoài đó **giữ nguyên chưa chấm**, `so_lan_dung_ngoai_da_cham` không tăng, endpoint **vẫn 200**. Không có nhánh "giả định giá đi ngang". Nếu bảng `standby_decision` rỗng thì không gọi provider lần nào.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap5/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8c41d7e2-9b06-4a35-8f71-d3e5920c4b18'
~~~

**Ghi chú khi viết lại**

- `GET` nhưng **GHI DB** → phải trong transaction ghi + commit. NestJS: đừng đặt route này sau interceptor readonly.
- `response_model = Cap5ProgressOut | None` → OpenAPI cho phép `null`. Client TS phải khai `| null`, đừng ép non-null.
- `ty_le_quyet_dinh_dung` là `float` **không nullable** ở Cấp 5 (`NOT NULL DEFAULT 0`) — **khác** `ty_le_thang_*` của Cấp 6. Đừng "đồng bộ hoá" hai cấp.
- Endpoint có thể gọi provider giá **N lần tuần tự** (một lần mỗi nước đứng ngoài tới hạn chưa chấm) → có thể chậm. Code hiện tại **không** song song hoá và **không** đặt timeout riêng; giữ nguyên hành vi, nhưng biết rằng đây là điểm nóng.

---

### POST /api/v1/cap5/enter

> **Vào Cấp 5** — tạo hàng tiến trình Cấp 5 (idempotent), yêu cầu đã tốt nghiệp Cấp 4.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap5_progress`, `cap4_progress`) |
| **Side-effect** | INSERT `cap5_progress` (`entered_at = now(UTC)`) — **chỉ ở lần đầu**. ★ Nhánh idempotent **KHÔNG** tính lại, **KHÔNG** ghi gì |

**Path params** — —

**Query params** — —

**Request body** — Không có body (`POST` rỗng).

**Response 200** — `Cap5ProgressOut` (xem `GET /cap5/progress`, nhưng **không bao giờ `null`**).

~~~json
{
  "id": "3f7a91c2-5d84-4e16-9b03-7c2e8a4f1d60",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-08-17T01:05:19.774203+00:00",
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_phan_loai": 0,
  "so_lan_dung_ngoai_da_cham": 0,
  "ty_le_quyet_dinh_dung": 0.0,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa có hàng `cap4_progress` (chưa từng vào Cấp 4) | `Không tìm thấy tiến trình Cấp 4` |
| 409 | `CONFLICT` | Có hàng Cấp 4 nhưng `graduated_at IS NULL` | `Chưa tốt nghiệp Cấp 4` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài → không có nhánh suy giảm. Gọi lại nhiều lần luôn trả cùng một hàng với `entered_at` **giữ nguyên lần đầu**.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap5/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5e28b0f4-1a67-4c93-b2d8-70f4c6a91e35'
~~~

**Ghi chú khi viết lại**

- **Thứ tự kiểm tra**: hàng Cấp 5 → (nếu chưa có) hàng Cấp 4 → (nếu có) `graduated_at`. Đảo thứ tự sẽ làm user **đã vào Cấp 5 rồi** bị 409 nếu hàng Cấp 4 bị can thiệp.
- ★ **Nhánh idempotent KHÔNG tính lại** — đây là điểm **KHÁC `POST /cap6/enter`**. Bản viết lại đừng "sửa cho nhất quán": FE Cấp 5 gọi `/cap5/progress` ngay sau đó, còn Cấp 6 thì không.
- Có `UniqueConstraint("user_id", name="uq_cap5_progress_user_id")` → hai request đồng thời sẽ để một cái đụng unique. Code hiện tại **không** bắt riêng lỗi này (sẽ thành 500). Nếu muốn cứng hơn thì phải coi là thay đổi có ý thức.
- `entered_at` là cột riêng, **không** dùng `created_at` của `TimestampMixin` (`created_at` là `DateTime` **không** timezone, `server_default now()`).

---

### PATCH /api/v1/cap5/task

> **Kích hoạt tính lại nhiệm vụ Cấp 5** — endpoint này KHÔNG đặt nhiệm vụ nào là xong; nó chỉ chạy recompute.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + provider giá (qua nhánh chấm đứng-ngoài trong recompute) |
| **Side-effect** | Cập nhật 3 chỉ số + có thể dập `task_N_done_at`; chấm các nước đứng ngoài tới hạn |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
/** app/schemas/cap5.py::TaskRequest — CHỈ 1 field, không có gì khác.
 *  ★ `task_no` KHÔNG quyết định nhiệm vụ nào được đánh dấu — xem Ghi chú. */
interface Cap5TaskRequest {
  task_no: number;   // bắt buộc; chỉ nhận 1 | 2 | 3
}
~~~

~~~json
{ "task_no": 3 }
~~~

**Response 200** — `Cap5ProgressOut` (không bao giờ `null`).

~~~json
{
  "id": "3f7a91c2-5d84-4e16-9b03-7c2e8a4f1d60",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-07-28T02:14:33.512088+00:00",
  "task_1_done_at": "2026-08-03T07:41:02.118934+00:00",
  "task_2_done_at": "2026-08-05T03:22:47.905611+00:00",
  "task_3_done_at": null,
  "so_lenh_phan_loai": 14,
  "so_lan_dung_ngoai_da_cham": 6,
  "ty_le_quyet_dinh_dung": 78.57142857142857,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `task_no` không thuộc `{1, 2, 3}` | `task_no không hợp lệ` |
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 (không có hàng `cap5_progress`) | `Không tìm thấy tiến trình Cấp 5` |
| 422 | — (FastAPI validation) | `task_no` không phải số nguyên, hoặc thiếu field | Vỏ `HTTPValidationError` (`detail: ValidationError[]`), **không** phải `ErrorEnvelope` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Provider giá lỗi → nước đứng ngoài giữ nguyên chưa chấm, endpoint vẫn 200 (giống `GET /cap5/progress`).

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap5/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: b93f5c17-4e80-42da-91b6-c05e738a2f4d' \
  -d '{"task_no":3}'
~~~

**Ghi chú khi viết lại**

- ★★ **`task_no` gần như là trang trí.** Cả 3 nhiệm vụ đều suy ra từ `order_ketso` / `standby_decision`. Handler chỉ validate `task_no ∈ {1,2,3}` rồi gọi recompute — gửi `task_no = 2` **không** đặt xong nhiệm vụ 2. **KHÔNG được** implement thành `UPDATE cap5_progress SET task_{n}_done_at = now()`; đó chính là lỗ hổng gian lận tốt nghiệp.
- **Thứ tự kiểm tra: validate `task_no` TRƯỚC, `_require_progress` SAU.** User chưa vào cấp mà gửi `task_no = 9` sẽ nhận **400**, không phải 404. Đảo thứ tự là đổi hành vi.
- **Hai lớp lỗi cho cùng một field**: `task_no: "ba"` → **422** (Pydantic); `task_no: 9` → **400** (service). Vỏ body khác nhau.
- Method là `PATCH`, không phải `POST`. Body bắt buộc.

---

### GET /api/v1/cap5/verdict/{order_id}

> **Verdict hệ GỢI Ý cho một lệnh** — trả đánh giá đúng/sai của hệ cho một lệnh BÁN đã kết sổ, **luôn kèm đủ 4 tín hiệu** đã dẫn tới nó.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — tính toán thuần từ `order_ketso` (lệnh BÁN) + `order_kehoach` (lệnh MUA khớp) + `cap3_progress.khau_vi` |
| **Side-effect** | **KHÔNG GHI GÌ** (endpoint Cấp 5 duy nhất không recompute) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | `string` (uuid) | Bắt buộc, format uuid | ID lệnh **BÁN** (`virtual_orders.id`). ★ Là **khoá của lệnh BÁN**, cùng khoá mà Kết sổ Cấp 1/2 dùng (`order_ketso.order_id`) — KHÔNG phải lệnh mua |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** app/schemas/cap5.py::VerdictOut */
interface VerdictOut {
  order_id: string;                  // uuid, echo lại
  /** Verdict HỆ GỢI Ý. ★ Suy từ QUY TRÌNH, pnl_pct KHÔNG tham gia. */
  verdict: Verdict;
  /** §C12c — hiện NGUYÊN VĂN. Chỉ có 2 câu cố định (xem Ghi chú). */
  giai_thich: string;
  /** ★ LUÔN đúng 4 phần tử, thứ tự CỐ ĐỊNH:
   *  co_so → ky_luat_thoat → khong_nhoi → khoi_luong_khop.
   *  §C12c: KHÔNG BAO GIỜ trả verdict trơ — luôn kèm provenance. */
  signals: VerdictSignal[];
  /** % lãi/lỗ của lệnh, echo để hiển thị + giải thích o_4_du_kien.
   *  ★ KHÔNG ảnh hưởng `verdict`. */
  pnl_pct: number;
  /** pnl_pct > 0 (đi ngang = false). */
  thang: boolean;
  /** Ô mà lệnh SẼ vào nếu user Đồng ý với verdict hệ. «Dự kiến» — ô THẬT được
   *  chốt bởi POST /cap5/ketso theo verdict_user. */
  o_4_du_kien: O4;
}
~~~

~~~json
{
  "order_id": "d5b81e93-6c04-4f27-a1b8-93e50c7d264f",
  "verdict": "sai",
  "giai_thich": "Quyết định SAI: lệnh này phá ít nhất một điều bạn đã tự cam kết — đánh giá này đo QUY TRÌNH, hoàn toàn độc lập với lãi/lỗ.",
  "signals": [
    {
      "ma": "co_so",
      "ten": "Có cơ sở lúc đặt",
      "dat": true,
      "giai_thich": "4/5 lớp bạn đọc là Ủng hộ lúc đặt (từ 3/5 trở lên là đủ cơ sở)."
    },
    {
      "ma": "ky_luat_thoat",
      "ten": "Tôn trọng cắt lỗ / chốt lời đã cam kết",
      "dat": true,
      "giai_thich": "Bạn thoát lệnh theo đúng ngưỡng cắt lỗ / chốt lời đã cam kết lúc đặt."
    },
    {
      "ma": "khong_nhoi",
      "ten": "Không nhồi lệnh khi lỗ",
      "dat": false,
      "giai_thich": "Vi phạm ghi nhận: bạn mua thêm mã này trong lúc đang lỗ (nhồi lệnh)."
    },
    {
      "ma": "khoi_luong_khop",
      "ten": "Khối lượng khớp khẩu vị",
      "dat": null,
      "giai_thich": "Chưa có dữ liệu: lệnh này chưa ghi %vốn hoặc khẩu vị rủi ro, nên hệ không kết luận được về khối lượng."
    }
  ],
  "pnl_pct": 6.42,
  "thang": true,
  "o_4_du_kien": "sai_thang"
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 — **kiểm TRƯỚC TIÊN** | `Không tìm thấy tiến trình Cấp 5` |
| 404 | `NOT_FOUND` | `order_id` không tồn tại **HOẶC** là lệnh của người khác | `Không tìm thấy lệnh` |
| 400 | `BAD_REQUEST` | Lệnh không phải `side == SELL` | `Phân loại 4 ô chỉ áp dụng cho lệnh BÁN` |
| 404 | `NOT_FOUND` | Lệnh BÁN chưa có hàng `order_ketso` (chưa kết sổ ở Cấp 1) | `Không tìm thấy kết sổ Cấp 1 — cần kết sổ (Cấp 1) trước` |
| 422 | — (FastAPI) | `order_id` không phải UUID hợp lệ | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Không gọi provider ngoài → không suy giảm theo giờ hay theo nguồn. Suy giảm duy nhất là **theo dữ liệu**:

- Không tìm được lệnh MUA khớp, hoặc lệnh MUA đó không có `order_kehoach` → tín hiệu `co_so` trả `dat = null` với câu *"Chưa có dữ liệu: lệnh này không tìm thấy kế hoạch mua đã ghi, nên hệ không kết luận được về cơ sở lúc đặt."*, và `khoi_luong_khop` cũng `null`. Hai tín hiệu còn lại vẫn đo được → vẫn có verdict.
- `pct_von IS NULL` hoặc không xác định được khẩu vị (cả snapshot lệnh lẫn `Cap3Progress.khau_vi` đều `NULL`) → `khoi_luong_khop` `dat = null`.
- Tín hiệu `null` **bị loại** khỏi phép tính, **không** bị tính là trượt. Đây là điểm chống "phạt user vì dữ liệu hệ không có".

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap5/verdict/d5b81e93-6c04-4f27-a1b8-93e50c7d264f' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 71d0a6b8-3f24-4e59-8c17-b60e4d982c31'
~~~

**Ghi chú khi viết lại**

- ★ **THỨ TỰ KIỂM TRA (4 bước, không đảo)**: `_require_progress` (404 tiến trình) → lệnh + quyền sở hữu (404 lệnh) → `side != SELL` (400) → `order_ketso` (404 kết sổ). Bốn `detail` khác nhau; FE dựa vào đó để chỉ đường.
- **Lệnh của người khác → 404, KHÔNG PHẢI 403** (gộp chung với "không tồn tại" — cố ý không tiết lộ).
- `giai_thich` cấp cao chỉ có **đúng 2 giá trị cố định** (`_VERDICT_GIAI_THICH_DUNG` / `_VERDICT_GIAI_THICH_SAI`), cả hai đều kết thúc bằng *"…đo QUY TRÌNH, hoàn toàn độc lập với lãi/lỗ."* — **phải copy nguyên văn**.
- `signals` **luôn 4 phần tử, thứ tự cố định** ngay cả khi có phần tử `dat = null`. Đừng lọc bỏ tín hiệu unknown khỏi response — FE cần hiện khoảng trống dữ liệu (§C12c).
- Quy tắc verdict: `all(dat của các tín hiệu có dat != null)`. Cẩn thận `all([])` trong JS: `[].every(x => x) === true` — giống Python, nên không cần xử lý riêng, nhưng đừng viết `signals.every(s => s.dat)` (sẽ tính `null` là falsy → luôn "sai").
- `o_4_du_kien` dùng **verdict HỆ**; `POST /cap5/ketso` dùng **verdict USER**. Hai giá trị có thể khác nhau — không cache lẫn nhau.
- Dung sai khẩu vị `+0.5` điểm phần trăm là **cộng vào trần** (`pct_von <= tran + 0.5`), không phải nhân.
- Đơn vị: `pnl_pct` và `pct_von` là **phần trăm** (`20.0` = 20%), không phải tỷ lệ `0.2`.

---

### POST /api/v1/cap5/ketso

> **Chốt phân loại «4 ô»** — user Đồng ý hoặc Sửa verdict hệ cho một lệnh; server ghi cả hai verdict + provenance + ô lên hàng `order_ketso` đã có.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — verdict hệ **tính lại** từ dữ liệu quy trình đã lưu |
| **Side-effect** | UPDATE `order_ketso`: `verdict_he`, `verdict_user`, `verdict_provenance` (JSON), `o_4`, `ly_do_sua`. Sau đó recompute `cap5_progress` (có thể dập `task_1_done_at` / `task_3_done_at`) + chấm đứng-ngoài tới hạn |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
/** app/schemas/cap5.py::KetsoRequest
 *  ★ KHÔNG có `verdict_he`, KHÔNG có `o_4` — server tính lại cả hai. */
interface Cap5KetsoRequest {
  /** uuid lệnh BÁN đã có order_ketso. */
  order_id: string;
  /** Chốt của user. Khai báo là `str` ở Pydantic → sai giá trị bị service chặn
   *  bằng 400 (KHÔNG phải 422). Chỉ nhận "dung" | "sai". */
  verdict_user: "dung" | "sai";
  /** BẮT BUỘC khi verdict_user KHÁC verdict hệ (422 nếu thiếu).
   *  Gửi `null`/không gửi khi đồng ý. ★ Gửi chuỗi rỗng/toàn khoảng trắng → 400. */
  ly_do_sua?: string | null;
}
~~~

~~~json
{
  "order_id": "d5b81e93-6c04-4f27-a1b8-93e50c7d264f",
  "verdict_user": "dung",
  "ly_do_sua": "Tôi có mua thêm nhưng là theo kế hoạch chia 2 lần đã ghi từ đầu, không phải nhồi lệnh cứu giá."
}
~~~

**Response 200**

~~~ts
/** app/schemas/cap5.py::KetsoCap5Out — góc nhìn Cấp 5 của order_ketso.
 *  ★ Đây là SUBSET: các cột Cấp 1/2 (cam_xuc, so_phien_giu, 4 cờ kỷ luật…)
 *  KHÔNG có trong response này dù vẫn nằm trên cùng một hàng DB. */
interface KetsoCap5Out {
  id: string;                                 // uuid hàng order_ketso
  order_id: string;                           // uuid lệnh BÁN
  pnl_pct: number;                            // đọc từ DB, không nhận từ client
  verdict_he: Verdict | null;                 // null chỉ khi hàng chưa từng qua Cấp 5
  verdict_user: Verdict | null;
  verdict_provenance: VerdictProvenance | null;
  o_4: O4 | null;
  /** CHỈ có giá trị khi user sửa khác hệ; server tự set null khi đồng ý. */
  ly_do_sua: string | null;
}
~~~

~~~json
{
  "id": "6e2c74a0-8d31-4b95-9f60-1a83c5e70d42",
  "order_id": "d5b81e93-6c04-4f27-a1b8-93e50c7d264f",
  "pnl_pct": 6.42,
  "verdict_he": "sai",
  "verdict_user": "dung",
  "verdict_provenance": {
    "verdict_he": "sai",
    "giai_thich": "Quyết định SAI: lệnh này phá ít nhất một điều bạn đã tự cam kết — đánh giá này đo QUY TRÌNH, hoàn toàn độc lập với lãi/lỗ.",
    "signals": [
      { "ma": "co_so", "ten": "Có cơ sở lúc đặt", "dat": true, "giai_thich": "4/5 lớp bạn đọc là Ủng hộ lúc đặt (từ 3/5 trở lên là đủ cơ sở)." },
      { "ma": "ky_luat_thoat", "ten": "Tôn trọng cắt lỗ / chốt lời đã cam kết", "dat": true, "giai_thich": "Bạn thoát lệnh theo đúng ngưỡng cắt lỗ / chốt lời đã cam kết lúc đặt." },
      { "ma": "khong_nhoi", "ten": "Không nhồi lệnh khi lỗ", "dat": false, "giai_thich": "Vi phạm ghi nhận: bạn mua thêm mã này trong lúc đang lỗ (nhồi lệnh)." },
      { "ma": "khoi_luong_khop", "ten": "Khối lượng khớp khẩu vị", "dat": true, "giai_thich": "Khối lượng dùng 18.5% vốn, trong trần 20% của khẩu vị Cân bằng." }
    ],
    "computed_at": "2026-08-17T04:12:58.331067+00:00"
  },
  "o_4": "dung_thang",
  "ly_do_sua": "Tôi có mua thêm nhưng là theo kế hoạch chia 2 lần đã ghi từ đầu, không phải nhồi lệnh cứu giá."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 — kiểm **đầu tiên** | `Không tìm thấy tiến trình Cấp 5` |
| 400 | `BAD_REQUEST` | `verdict_user` không phải `"dung"` / `"sai"` | `verdict_user phải là 'dung' hoặc 'sai'` |
| 400 | `BAD_REQUEST` | `ly_do_sua` **được gửi** nhưng rỗng / toàn khoảng trắng | `Lý do sửa không được để trống` |
| 404 | `NOT_FOUND` | `order_id` không tồn tại hoặc của người khác | `Không tìm thấy lệnh` |
| 400 | `BAD_REQUEST` | Lệnh không phải `SELL` | `Phân loại 4 ô chỉ áp dụng cho lệnh BÁN` |
| 404 | `NOT_FOUND` | Chưa có `order_ketso` cho lệnh này | `Không tìm thấy kết sổ Cấp 1 — cần kết sổ (Cấp 1) trước` |
| 422 | `UNPROCESSABLE_ENTITY` | `verdict_user != verdict_he` mà **không** có `ly_do_sua` | `Bạn thấy khác hệ — cần ghi 1 dòng lý do vì sao bạn đánh giá khác.` |
| 422 | — (FastAPI) | Thiếu `order_id` / `verdict_user`, hoặc `order_id` không phải UUID | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Không gọi provider ngoài cho phần ghi. Tín hiệu thiếu dữ liệu → `dat = null` và bị loại khỏi verdict (giống `GET /cap5/verdict`); **vẫn ghi thành công**, `verdict_provenance` lưu nguyên trạng thái thiếu đó để về sau còn giải thích được. Phần recompute cuối có gọi provider giá cho đứng-ngoài tới hạn; lỗi ở đó **không** làm hỏng việc ghi kết sổ (nước đó chỉ giữ nguyên chưa chấm).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap5/ketso' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2a95c3e6-70b1-4d48-9f52-8e14b7c0d693' \
  -d '{"order_id":"d5b81e93-6c04-4f27-a1b8-93e50c7d264f","verdict_user":"dung","ly_do_sua":"Tôi có mua thêm nhưng là theo kế hoạch chia 2 lần đã ghi từ đầu, không phải nhồi lệnh cứu giá."}'
~~~

**Ghi chú khi viết lại**

- ★★ **THỨ TỰ KIỂM TRA (7 bước)**: tiến trình (404) → `verdict_user` hợp lệ (400) → `ly_do_sua` gửi-mà-rỗng (400) → lệnh + quyền (404) → `side == SELL` (400) → `order_ketso` (404) → override thiếu lý do (422). Hai lớp lỗi cho `ly_do_sua` **rất dễ nhầm**: gửi `"   "` → **400** `Lý do sửa không được để trống`; **không gửi** mà lại sửa khác hệ → **422** `Bạn thấy khác hệ…`.
- ★ **`verdict_he` LUÔN được tính lại**, không nhận từ client. Signature service có tham số `verdict_he` nhưng đánh `# noqa: ARG002 — advisory` và **bỏ qua**; schema request không có field đó. Đừng thêm vào.
- `o_4 = derive(verdict_user, pnl_pct)` — **theo chốt của USER**, không theo hệ. Nhưng `verdict_he` vẫn được lưu để sau này đối chiếu.
- `ly_do_sua` được **server tự ép `null`** khi `verdict_user == verdict_he`, kể cả client có gửi. Đừng lưu nguyên.
- **Ghi lại cùng `order_id` = GHI ĐÈ, KHÔNG 409.** Đây là chủ ý (user lùi bước trong UI, retry mạng). An toàn vì `verdict_he` + `o_4` luôn suy lại, và không gì ghi được sang lệnh khác. **KHÁC hoàn toàn** `POST /cap6/kehoach` (có freeze khi FILLED).
- `verdict_provenance` là **blob JSON đóng băng** kèm `computed_at` (ISO-8601 UTC). Nó là ảnh chụp verdict tại thời điểm ghi — **đừng** tính lại khi đọc ra.
- Response là **subset** của hàng `order_ketso`, không phải cả hàng. Nếu FE cần `cam_xuc` / cờ kỷ luật thì phải gọi endpoint Cấp 1/2.
- `pnl_pct` là `float` **NOT NULL** trên `order_ketso` → luôn có số, không nullable.

---

### POST /api/v1/cap5/dung-ngoai

> **Ghi một nước «đứng ngoài có chủ đích»** — ghi nhận quyết định KHÔNG vào lệnh với một mã, kèm snapshot giá do server tự lấy.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không (nhánh `resolve_price` có thể dùng cache của provider) |
| **Nguồn dữ liệu** | provider ngoài: `resolve_price()` → VCI intraday (trong phiên) → fallback VNDIRECT OHLCV close → VCI OHLCV close |
| **Side-effect** | INSERT `standby_decision`; recompute `cap5_progress` (dập `task_2_done_at` ở lần đầu) + chấm các nước tới hạn. ★ **KHÔNG** tạo `VirtualOrder`, **KHÔNG** đổi số dư / vị thế |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
/** app/schemas/cap5.py::DungNgoaiRequest — CHỈ 2 field.
 *  ★ KHÔNG có giá: snapshot do SERVER lấy (chống tự tạo nước "né đúng"). */
interface DungNgoaiRequest {
  /** Mã cổ phiếu. Server tự `.trim().toUpperCase()`. Rỗng → 400. */
  symbol: string;
  /** ĐÚNG 1 trong 5 lý do. Khai báo là `str` ở Pydantic → giá trị lạ bị service
   *  chặn bằng 400 (KHÔNG phải 422). */
  reason: LyDoDungNgoai;
}
~~~

~~~json
{ "symbol": "VNM", "reason": "dinh_gia_dat" }
~~~

**Response 200** — `DungNgoaiItem` (xem «Kiểu dữ liệu dùng chung»). Ngay sau khi ghi, `ket_qua` **luôn `null`** và `da_toi_han` **luôn `false`** (vừa quyết định thì không thể đã đủ 5 phiên).

~~~json
{
  "id": "9c60f284-3a17-4e5b-8d92-64c07b1fa835",
  "symbol": "VNM",
  "decided_at": "2026-08-17T02:47:11.408592+00:00",
  "reason": "dinh_gia_dat",
  "ly_do_ten": "Định giá đang đắt",
  "gia_luc_dung_ngoai": 61500.0,
  "han_cham_date": "2026-08-24",
  "da_toi_han": false,
  "cham_at": null,
  "gia_sau_5_phien": null,
  "ket_qua": null,
  "ket_qua_ten": null,
  "pct_thay_doi": null,
  "giai_thich": "Chưa tới hạn — hệ sẽ chấm sau phiên 24/08/2026 (5 phiên giao dịch kể từ lúc bạn đứng ngoài)."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 — kiểm **đầu tiên** | `Không tìm thấy tiến trình Cấp 5` |
| 400 | `BAD_REQUEST` | `symbol` rỗng / toàn khoảng trắng | `Thiếu mã cổ phiếu` |
| 400 | `BAD_REQUEST` | `reason` không thuộc 5 giá trị `LyDoDungNgoai` | `Lý do đứng ngoài không hợp lệ` |
| 503 | `SERVICE_UNAVAILABLE` | **Mọi** nguồn giá đều thất bại | `Chưa lấy được giá hiện tại của VNM — thử lại sau.` (chèn symbol đã upper) |
| 422 | — (FastAPI) | Thiếu `symbol` hoặc `reason` | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — ★ **FAIL CLOSED, không fail soft.** `resolve_price` thử lần lượt: (a) trong phiên → VCI intraday; (b) luôn có → OHLCV close (VNDIRECT kVND ×1000, rồi VCI VND ×1). Nếu **tất cả** thất bại → service bắt mọi exception và ném **503**, **KHÔNG ghi hàng nào**. Lý do cố ý: một hàng không có snapshot so sánh được thì **không bao giờ chấm được** né đúng/hụt — mất luôn ý nghĩa của việc ghi. Đây là điểm **khác** với nhánh chấm (chấm thì fail soft, để chưa chấm). **Ngoài giờ giao dịch**: không lỗi — dùng nhánh close, `PriceResult.source == "close"`.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap5/dung-ngoai' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c47e8b02-5d93-41af-b076-2e5849c1f3d7' \
  -d '{"symbol":"VNM","reason":"dinh_gia_dat"}'
~~~

**Ghi chú khi viết lại**

- ★ **THỨ TỰ**: tiến trình (404) → symbol rỗng (400) → reason không hợp lệ (400) → lấy giá (503) → INSERT → recompute. Validate **trước** khi gọi provider (đừng đốt request mạng cho input rác).
- `symbol` được **`.strip().upper()`** trước khi lưu và trước khi lấy giá. Cột `String(20)`; **không** kiểm mã có tồn tại trong bảng `symbols` — mã lạ vẫn ghi được nếu provider trả giá.
- `gia_luc_dung_ngoai` là `float(price.price_vnd)`. `price_vnd` là **`int` VND** (ví dụ `61500`, không phải `61.5`). Cột `Numeric(18,4)` với `asdecimal=False` → JSON ra `61500.0`, không phải `"61500.0000"`. **Đừng để Decimal lọt vào JSON.**
- **Không có ràng buộc chống trùng**: cùng `symbol` + cùng ngày ghi được nhiều lần. Cố ý (không có unique constraint nào trên `standby_decision` ngoài PK).
- **`decided_at` dùng `now(UTC)`, nhưng `han_cham_date` tính theo NGÀY LỊCH VIỆT NAM** (`UTC+7`). Một quyết định lúc 23:30 UTC = 06:30 hôm sau giờ VN → hạn chấm lệch một ngày so với tính theo UTC. `_VN_TZ = timezone(timedelta(hours=7))`, **hằng số cứng, không đọc từ config**.
- Service gọi `refresh(decision)` **hai lần** (trước và sau recompute) vì recompute có thể chấm chính nước vừa ghi trong tình huống lạ. Giữ nguyên để không trả dữ liệu cũ.
- Nhiệm vụ ② xong ngay lần đầu — **không cần** chờ chấm.

---

### GET /api/v1/cap5/dung-ngoai

> **Nhật ký đứng ngoài** — toàn bộ các nước đứng ngoài + thống kê tổng hợp, chấm luôn các lần đã tới hạn.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không (nhánh lấy giá dùng cache provider `ta:ohlcv:…`, TTL 1800s) |
| **Nguồn dữ liệu** | DB (`standby_decision`) + provider giá cho các nước tới hạn |
| **Side-effect** | ★ **CÓ GHI DB** — chấm các nước tới hạn + recompute `cap5_progress` |

**Path params** — —

**Query params** — — (★ **KHÔNG có phân trang, KHÔNG có filter, KHÔNG có limit** — trả **toàn bộ** lịch sử)

**Request body** — —

**Response 200**

~~~ts
/** app/schemas/cap5.py::DungNgoaiListOut */
interface DungNgoaiListOut {
  so_lan: number;              // tổng số nước đã ghi
  so_ne_dung: number;
  so_ne_hut: number;
  so_trung_tinh: number;
  /** ★ TÊN GÂY NHẦM: đây là "số lần CHƯA CHẤM" = so_lan − đã chấm.
   *  Nó gộp CẢ "chưa tới hạn" LẪN "tới hạn nhưng chưa lấy được giá". */
  so_chua_toi_han: number;
  so_lan_da_cham: number;      // = so_ne_dung + so_ne_hut + so_trung_tinh
  /** so_lan_da_cham >= so_lan_toi_thieu_phan_tich. FE ẩn thống kê khi false. */
  du_de_phan_tich: boolean;
  so_lan_toi_thieu_phan_tich: number;   // luôn = 3 (MIN_DA_CHAM_PHAN_TICH)
  /** Lý do dùng nhiều nhất. null khi chưa có nước nào. */
  ly_do_hay_dung: LyDoHayDung | null;
  so_phien_cham: number;       // luôn = 5
  nguong_ne_dung_pct: number;  // luôn = 2.0
  nguong_ne_hut_pct: number;   // luôn = 5.0
  /** Câu giải thích luật chấm, CỐ ĐỊNH — hiện nguyên văn (§C12c). */
  giai_thich: string;
  /** ★ Sắp xếp: decided_at GIẢM DẦN (mới nhất trước). */
  items: DungNgoaiItem[];
}

interface LyDoHayDung {
  ma: LyDoDungNgoai;
  ten: string;
  so_lan: number;
}
~~~

~~~json
{
  "so_lan": 4,
  "so_ne_dung": 2,
  "so_ne_hut": 1,
  "so_trung_tinh": 0,
  "so_chua_toi_han": 1,
  "so_lan_da_cham": 3,
  "du_de_phan_tich": true,
  "so_lan_toi_thieu_phan_tich": 3,
  "ly_do_hay_dung": { "ma": "dinh_gia_dat", "ten": "Định giá đang đắt", "so_lan": 2 },
  "so_phien_cham": 5,
  "nguong_ne_dung_pct": 2.0,
  "nguong_ne_hut_pct": 5.0,
  "giai_thich": "Sau 5 phiên giao dịch, hệ so giá với lúc bạn đứng ngoài: tăng không quá 2% (hoặc giảm) là né đúng, tăng từ 5% trở lên là né hụt, khoảng giữa là trung tính — không tính đúng cũng không tính hụt. Đứng ngoài nhiều hơn KHÔNG phải là tốt hơn; mục tiêu là biết vì sao mình không mua.",
  "items": [
    {
      "id": "9c60f284-3a17-4e5b-8d92-64c07b1fa835",
      "symbol": "VNM",
      "decided_at": "2026-08-17T02:47:11.408592+00:00",
      "reason": "dinh_gia_dat",
      "ly_do_ten": "Định giá đang đắt",
      "gia_luc_dung_ngoai": 61500.0,
      "han_cham_date": "2026-08-24",
      "da_toi_han": false,
      "cham_at": null,
      "gia_sau_5_phien": null,
      "ket_qua": null,
      "ket_qua_ten": null,
      "pct_thay_doi": null,
      "giai_thich": "Chưa tới hạn — hệ sẽ chấm sau phiên 24/08/2026 (5 phiên giao dịch kể từ lúc bạn đứng ngoài)."
    },
    {
      "id": "2b1d47ce-90f3-4a86-b5e1-7c48d092e6af",
      "symbol": "HPG",
      "decided_at": "2026-08-04T06:12:55.201338+00:00",
      "reason": "du_lieu_nguoc_chieu",
      "ly_do_ten": "Dữ liệu ngược chiều — rủi ro cao",
      "gia_luc_dung_ngoai": 28400.0,
      "han_cham_date": "2026-08-11",
      "da_toi_han": true,
      "cham_at": "2026-08-11T09:03:41.667012+00:00",
      "gia_sau_5_phien": 27200.0,
      "ket_qua": "ne_dung",
      "ket_qua_ten": "Né đúng",
      "pct_thay_doi": -4.225352112676056,
      "giai_thich": "Bạn đứng ngoài HPG ngày 04/08/2026 ở giá 28,400đ — sau 5 phiên giá giảm 4.2%. Nước đứng ngoài hợp lý."
    },
    {
      "id": "7f35e8a1-4c62-4d09-91b7-05a3f7c48be2",
      "symbol": "FPT",
      "decided_at": "2026-07-29T03:31:08.774450+00:00",
      "reason": "dinh_gia_dat",
      "ly_do_ten": "Định giá đang đắt",
      "gia_luc_dung_ngoai": 132000.0,
      "han_cham_date": "2026-08-05",
      "da_toi_han": true,
      "cham_at": "2026-08-05T08:47:22.109883+00:00",
      "gia_sau_5_phien": 141500.0,
      "ket_qua": "ne_hut",
      "ket_qua_ten": "Né hụt",
      "pct_thay_doi": 7.196969696969697,
      "giai_thich": "Bạn đứng ngoài FPT ngày 29/07/2026 ở giá 132,000đ — sau 5 phiên giá tăng 7.2%. Lần này bạn đã bỏ lỡ."
    },
    {
      "id": "e0947b52-6d38-4f71-ac95-3b28e1d06754",
      "symbol": "VCB",
      "decided_at": "2026-07-24T07:05:44.930118+00:00",
      "reason": "cho_vung_mua_tot_hon",
      "ly_do_ten": "Chờ vùng mua tốt hơn",
      "gia_luc_dung_ngoai": 92500.0,
      "han_cham_date": "2026-07-31",
      "da_toi_han": true,
      "cham_at": "2026-07-31T09:15:03.442776+00:00",
      "gia_sau_5_phien": 91800.0,
      "ket_qua": "ne_dung",
      "ket_qua_ten": "Né đúng",
      "pct_thay_doi": -0.7567567567567568,
      "giai_thich": "Bạn đứng ngoài VCB ngày 24/07/2026 ở giá 92,500đ — sau 5 phiên giá giảm 0.8%. Nước đứng ngoài hợp lý."
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 | `Không tìm thấy tiến trình Cấp 5` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

★ Chưa có nước nào **không phải lỗi**: trả 200 với `so_lan = 0`, `items = []`, `ly_do_hay_dung = null`.

**Fallback / suy giảm** — Provider giá lỗi cho một nước → nước đó giữ `ket_qua = null` và `giai_thich` chuyển sang câu *"Đã tới hạn chấm (phiên DD/MM/YYYY) nhưng chưa lấy được giá phiên đó — hệ sẽ chấm lại khi có dữ liệu, không đoán."* — endpoint **vẫn 200**, các nước khác vẫn chấm bình thường. Dưới 3 nước đã chấm → `du_de_phan_tich = false`, FE **ẩn** thống kê thay vì kết luận trên 1-2 mẫu.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap5/dung-ngoai' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4d81f60b-27ce-4593-a0d8-9b7e5312cf4a'
~~~

**Ghi chú khi viết lại**

- ★ **`so_chua_toi_han` là TÊN SAI so với ngữ nghĩa**: công thức là `len(decisions) - so_lan_da_cham`, tức **"chưa chấm"**, gộp cả "tới hạn mà thiếu giá". Muốn biết đúng "chưa tới hạn" thì phải đếm `items` có `da_toi_han == false`. **Giữ nguyên tên và công thức** để tương thích FE.
- **Sắp xếp `items`: `decided_at DESC`** (`ORDER BY decided_at DESC` trong `_all_decisions`). Không có tiêu chí phá thế hoà thứ hai.
- **`da_toi_han` so bằng ngày VN của "bây giờ"**: `target <= datetime.now(_VN_TZ).date()`. Cùng một hàng DB đọc ở hai múi giờ có thể ra khác nhau — luôn dùng `UTC+7`.
- `pct_thay_doi` được **tính lại khi serialize** (từ `gia_luc` và `gia_sau`), không lưu cột. `null` khi chưa có `gia_sau_5_phien`. Chia cho 0 được chặn bằng `if gia_luc` (kết quả `null`).
- `giai_thich` **từng item** có **5 nhánh** (né đúng / né hụt / trung tính / tới hạn-thiếu-giá / chưa tới hạn), format ngày **`DD/MM/YYYY`**, giá format **`{:,.0f}đ`** (dấu phẩy nghìn, không thập phân, ví dụ `28,400đ`), phần trăm **1 chữ số thập phân**. Nhánh né đúng còn phân biệt `giảm X%` (khi `pct < 0`) vs `chỉ tăng X%` (khi `pct >= 0`). **Copy nguyên văn cả 5 nhánh.**
- Bốn hằng số `so_phien_cham`, `nguong_*`, `so_lan_toi_thieu_phan_tich` được **trả trong response** để FE không hard-code. Giữ đúng cách này.
- Phá thế hoà `ly_do_hay_dung`: `min(counts, key=(-so_lan, index trong LY_DO_DUNG_NGOAI_LABELS))`, khoá lạ → index `99`. Phải **xác định**, đừng dùng thứ tự Map ngẫu nhiên.

---

### POST /api/v1/cap5/dung-ngoai/cham

> **Chấm tường minh các nước đứng ngoài đã tới hạn** — phơi ra chính routine mà mọi endpoint đọc tự chạy, kèm số lần vừa chấm được.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không (nhánh giá dùng cache provider `ta:ohlcv:…`, TTL 1800s) |
| **Nguồn dữ liệu** | DB (`standby_decision`) + provider giá (`get_adjusted_ohlcv`) |
| **Side-effect** | UPDATE `standby_decision` (`gia_sau_5_phien`, `ket_qua`, `cham_at`) cho các nước đủ 5 phiên; recompute `cap5_progress` |

**Path params** — —

**Query params** — —

**Request body** — ★ **KHÔNG CÓ BODY.** Không nhận `ket_qua`, không nhận `decision_id`, không nhận gì cả — client không thể chỉ định chấm cái nào hay chấm ra kết quả gì.

**Response 200**

~~~ts
/** app/schemas/cap5.py::ChamDungNgoaiOut — 5 field, ÍT HƠN DungNgoaiListOut. */
interface ChamDungNgoaiOut {
  /** Số nước VỪA được chấm trong LẦN GỌI NÀY. 0 là bình thường (đã chấm hết,
   *  hoặc chưa nước nào tới hạn, hoặc tới hạn mà chưa có giá). */
  so_moi_cham: number;
  so_lan_da_cham: number;      // tổng tích luỹ
  /** Cùng công thức (và cùng tên gây nhầm) như DungNgoaiListOut. */
  so_chua_toi_han: number;
  giai_thich: string;          // CÙNG câu cố định như GET /cap5/dung-ngoai
  items: DungNgoaiItem[];      // TOÀN BỘ nhật ký, decided_at DESC
}
~~~

~~~json
{
  "so_moi_cham": 1,
  "so_lan_da_cham": 3,
  "so_chua_toi_han": 1,
  "giai_thich": "Sau 5 phiên giao dịch, hệ so giá với lúc bạn đứng ngoài: tăng không quá 2% (hoặc giảm) là né đúng, tăng từ 5% trở lên là né hụt, khoảng giữa là trung tính — không tính đúng cũng không tính hụt. Đứng ngoài nhiều hơn KHÔNG phải là tốt hơn; mục tiêu là biết vì sao mình không mua.",
  "items": [
    {
      "id": "2b1d47ce-90f3-4a86-b5e1-7c48d092e6af",
      "symbol": "HPG",
      "decided_at": "2026-08-04T06:12:55.201338+00:00",
      "reason": "du_lieu_nguoc_chieu",
      "ly_do_ten": "Dữ liệu ngược chiều — rủi ro cao",
      "gia_luc_dung_ngoai": 28400.0,
      "han_cham_date": "2026-08-11",
      "da_toi_han": true,
      "cham_at": "2026-08-17T04:31:09.882145+00:00",
      "gia_sau_5_phien": 27200.0,
      "ket_qua": "ne_dung",
      "ket_qua_ten": "Né đúng",
      "pct_thay_doi": -4.225352112676056,
      "giai_thich": "Bạn đứng ngoài HPG ngày 04/08/2026 ở giá 28,400đ — sau 5 phiên giá giảm 4.2%. Nước đứng ngoài hợp lý."
    }
  ]
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 | `Không tìm thấy tiến trình Cấp 5` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

★ **KHÔNG có lỗi nào cho "không có gì để chấm"** — trả 200 với `so_moi_cham = 0`.

**Fallback / suy giảm** — Đây là nhánh **FAIL SOFT** (ngược với `POST /cap5/dung-ngoai`). Với mỗi nước tới hạn: không lấy được giá phiên đích → **bỏ qua, để chưa chấm, thử lại lần sau**, `so_moi_cham` không tăng. Ngày lễ ở phiên đích → dùng luật fallback "phiên cuối trong cửa sổ" (xem §9). Provider chết hoàn toàn → `so_moi_cham = 0`, endpoint **vẫn 200**, không nước nào bị chấm sai.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap5/dung-ngoai/cham' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6b0c94e7-8f31-4a2d-95b0-e7d4126af583'
~~~

**Ghi chú khi viết lại**

- ★ **IDEMPOTENT**: hàng đã có `ket_qua != null` bị bỏ qua (`if decision.ket_qua is not None: continue`). Gọi 10 lần liên tiếp → lần đầu `so_moi_cham = N`, các lần sau `= 0`. Test `test_dung_ngoai_scoring_is_idempotent`.
- ★ **Đây là routine y hệt** mà `GET /cap5/progress`, `GET /cap5/dung-ngoai`, `PATCH /cap5/task`, `POST /cap5/ketso`, `GET /cap5/thach-thuc`, `POST /cap5/graduate` đều đã chạy. Endpoint này tồn tại **chỉ để phơi `so_moi_cham` ra** cho FE. **Đừng viết hai bản logic chấm** — một hàm dùng chung.
- **Không có cron/scheduler nào cho Cấp 5.** Nếu bản viết lại muốn thêm cron thì phải giữ nguyên luật idempotent + "không đoán khi thiếu giá".
- `cham_at = now(UTC)` là **thời điểm CHẤM**, không phải phiên đích — nên có thể muộn hơn `han_cham_date` rất nhiều (ví dụ hạn 11/08 nhưng chấm 17/08 vì user không mở app). Đúng như vậy, đừng "sửa".
- **Cửa sổ lấy giá**: `get_adjusted_ohlcv(symbol, decided_on, target + 7 ngày)`. Cộng 7 **ngày lịch** (không phải phiên) để chuỗi chắc chắn chạy vượt `target` — cần thiết cho luật dung sai ngày lễ.
- `_fetch_close_vnd` bắt **mọi** exception (`except Exception`) → không exception nào từ provider được nổi lên thành 5xx.
- Dùng **giá đóng cửa ĐIỀU CHỈNH** (adjusted close), không phải giá thô — nên chia/thưởng cổ phiếu không tạo ra "né đúng" giả.
- `items` trả **toàn bộ** nhật ký, không chỉ các nước vừa chấm.

---

### GET /api/v1/cap5/thach-thuc

> **3 điều kiện Thách thức Lão luyện** — giá trị hiện tại + mục tiêu + đạt/chưa + giải thích cho từng chân của nhiệm vụ ③.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (tính lại toàn bộ) + provider giá qua nhánh chấm |
| **Side-effect** | ★ **CÓ GHI DB** — recompute + chấm đứng-ngoài tới hạn (có thể dập `task_3_done_at` ngay trong lần gọi này) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** app/schemas/cap5.py::ThachThucOut — ★ 3 chân là 3 FIELD CÓ TÊN,
 *  KHÔNG phải array. Đừng đổi thành list. */
interface Cap5ThachThucOut {
  /** = AND của 3 chân. Đây là điều kiện dập task_3_done_at. */
  dat_ca_3: boolean;
  so_lenh_phan_loai: Cap5ThachThucDieuKien;          // mục tiêu 20
  so_lan_dung_ngoai_da_cham: Cap5ThachThucDieuKien;  // mục tiêu 5
  ty_le_quyet_dinh_dung: Cap5ThachThucDieuKien;      // mục tiêu 70.0
}
~~~

~~~json
{
  "dat_ca_3": false,
  "so_lenh_phan_loai": {
    "ten": "Phân loại 4 ô cho ≥ 20 lệnh",
    "gia_tri_hien_tai": 14.0,
    "muc_tieu": 20.0,
    "dat": false,
    "giai_thich": "Đã có 14/20 lệnh bạn nhìn lại qua 4 ô — mỗi lệnh được xếp theo quyết định đúng/sai × thắng/thua."
  },
  "so_lan_dung_ngoai_da_cham": {
    "ten": "≥ 5 lần đứng ngoài đã tới hạn chấm",
    "gia_tri_hien_tai": 6.0,
    "muc_tieu": 5.0,
    "dat": true,
    "giai_thich": "Đã chấm 6/5 nước đứng ngoài (trên tổng 8 lần đã ghi) — chỉ tính các lần đã đủ 5 phiên để biết né đúng hay hụt. Đứng ngoài nhiều hơn KHÔNG được thưởng thêm."
  },
  "ty_le_quyet_dinh_dung": {
    "ten": "Tỷ lệ quyết định đúng ≥ 70%",
    "gia_tri_hien_tai": 78.57142857142857,
    "muc_tieu": 70.0,
    "dat": true,
    "giai_thich": "79% (11/14 lệnh) làm đúng quy trình — bất kể lãi/lỗ. Đây là thước đo CHẤT LƯỢNG QUYẾT ĐỊNH, không phải tỷ lệ thắng."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 | `Không tìm thấy tiến trình Cấp 5` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Chưa có lệnh nào: `so_lenh_phan_loai.gia_tri_hien_tai = 0.0`, `ty_le_quyet_dinh_dung.gia_tri_hien_tai = 0.0` (chia cho 0 được chặn: `ty_le = 0.0` khi `so_lenh_phan_loai == 0`). ★ Ở Cấp 5 **không có `du_du_lieu`** — `0.0` khi chưa có lệnh là hành vi chấp nhận (khác Cấp 6). Provider giá lỗi → chân đứng-ngoài chỉ đơn giản chưa tăng.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap5/thach-thuc' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: a3e79f14-6b28-4d05-91cf-72b0e6845d39'
~~~

**Ghi chú khi viết lại**

- ★ **`gia_tri_hien_tai` là `float` cho CẢ 3 chân**, kể cả hai chân đếm số nguyên: `float(progress.so_lenh_phan_loai)` → JSON ra `14.0`, không phải `14`. Cùng lý do với `muc_tieu` (`20.0`, `5.0`). Giữ nguyên kiểu để FE không phải phân nhánh.
- `ten` chứa **ngưỡng đã nội suy** (`"Phân loại 4 ô cho ≥ 20 lệnh"`, `"Tỷ lệ quyết định đúng ≥ 70%"`) — FE không tự ghép chuỗi. Format `muc_tieu` trong `ten`: `{:.0f}` (không thập phân).
- `giai_thich` chân thứ 3 làm tròn `{:.0f}` (`78.57…` → `"79%"`) **nhưng `gia_tri_hien_tai` giữ nguyên full precision**. Hai con số **cố ý khác nhau** — đừng "đồng bộ".
- Chân đứng-ngoài có nhắc **tổng đã ghi** (`metrics['so_lan_dung_ngoai']`) trong `giai_thich` — con số này **KHÔNG** xuất hiện ở field nào khác của response này. Muốn có nó thì gọi `GET /cap5/dung-ngoai`.
- Câu *"Đứng ngoài nhiều hơn KHÔNG được thưởng thêm."* là **thông điệp sản phẩm bắt buộc** — copy nguyên văn.
- `dat_ca_3` phải tính từ **3 chân vừa recompute**, không đọc `task_3_done_at` (vì cờ đó không bao giờ bị xoá → sẽ nói dối nếu chỉ số tụt).

---

### POST /api/v1/cap5/graduate

> **Tốt nghiệp Cấp 5** — dập `graduated_at` khi và chỉ khi đủ 3/3 nhiệm vụ, sau khi tính lại toàn bộ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (tính lại toàn bộ) + provider giá qua nhánh chấm |
| **Side-effect** | recompute + chấm đứng-ngoài; UPDATE `cap5_progress` SET `graduated_at`, `time_to_graduate_hours` — **chỉ lần đầu**. ★ **KHÔNG** tạo hàng Cấp 6, **KHÔNG** gửi email / Telegram, **KHÔNG** ghi audit log |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap5ProgressOut`.

~~~json
{
  "id": "3f7a91c2-5d84-4e16-9b03-7c2e8a4f1d60",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-07-28T02:14:33.512088+00:00",
  "task_1_done_at": "2026-08-03T07:41:02.118934+00:00",
  "task_2_done_at": "2026-08-05T03:22:47.905611+00:00",
  "task_3_done_at": "2026-08-17T05:02:14.660391+00:00",
  "so_lenh_phan_loai": 21,
  "so_lan_dung_ngoai_da_cham": 6,
  "ty_le_quyet_dinh_dung": 76.19047619047619,
  "graduated_at": "2026-08-17T05:02:14.712805+00:00",
  "time_to_graduate_hours": 482.7947778611111
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 5 | `Không tìm thấy tiến trình Cấp 5` |
| 409 | `CONFLICT` | Thiếu bất kỳ nhiệm vụ nào trong 3 (sau khi đã recompute) | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 5` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

★ `409` **không nói thiếu cái gì** — FE phải gọi `GET /cap5/thach-thuc` để hiện chi tiết.

**Fallback / suy giảm** — Provider giá lỗi ngay trước khi tốt nghiệp: nước đứng ngoài tới hạn không chấm được → `so_lan_dung_ngoai_da_cham` không tăng → nếu user đang đứng đúng ranh 5 lần thì sẽ **409 tạm thời**, và tự hết khi có dữ liệu giá. Đây là hệ quả có ý thức của luật "không đoán".

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap5/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: f28b5d43-1c96-4e07-b8a5-3d70c14e9f62'
~~~

**Ghi chú khi viết lại**

- ★★ **THỨ TỰ BẮT BUỘC**: `_require_progress` → **`_recompute_progress` (tính lại + dập nhiệm vụ)** → kiểm 3/3 → ghi. Đọc cờ nhiệm vụ **trước** khi recompute là chính lỗ hổng gian lận tốt nghiệp.
- **IDEMPOTENT**: gọi lần 2 → 200, `graduated_at` **giữ nguyên giá trị lần đầu**, `time_to_graduate_hours` **không tính lại** (`if progress.graduated_at is None`). Test `assert again.graduated_at == first`.
- `time_to_graduate_hours = (now − entered_at).total_seconds() / 3600.0` — **đơn vị GIỜ**, `float`, không làm tròn. `entered_at` naive được `replace(tzinfo=UTC)` trước khi trừ.
- **KHÔNG cascade sang Cấp 6.** FE phải gọi `POST /cap6/enter` riêng (và theo `capFlags.ts` chỉ gọi khi `CAP_MAX_ENABLED >= 6`; hiện là 3 → **không gọi**).
- Không có huy hiệu / badge nào được ghi ở endpoint này. **CHƯA XÁC ĐỊNH** trong phạm vi chương này: huy hiệu Cấp 5 được cấp ở đâu — không có mã nào trong `cap5.py` / `services/cap5/service.py` làm việc đó; xem `app/models/cap0.py` và các chương Cấp 0 nếu hệ badge nằm ở đó.
- Endpoint là `POST` không body — đừng đòi `Content-Type` bắt buộc ở tầng framework (client vẫn nên gửi).

---

## Cấp 6 «Đối chiếu»

8 endpoint. Prefix router `/cap6`, tag OpenAPI `Cấp 6`. Toàn bộ dùng `CurrentUser` (Bearer, **không** Premium).

### GET /api/v1/cap6/progress

> **Tiến độ Cấp 6** — trạng thái Cấp 6 của user hiện tại, hoặc `null` nếu chưa vào cấp. Đây là payload FE phụ thuộc nhiều nhất.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap6_progress`, `order_kehoach`, `order_ketso`, `virtual_orders`) — **không** provider ngoài |
| **Side-effect** | ★ **CÓ GHI DB** — cập nhật 4 chỉ số + dập `task_N_done_at` |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** null = user CHƯA vào Cấp 6. Body đúng là chữ `null`. */
type Cap6ProgressResponse = Cap6ProgressOut | null;

/** app/schemas/cap6.py::Cap6ProgressOut — TS interface ĐẦY ĐỦ. */
interface Cap6ProgressOut {
  id: string;                          // uuid hàng cap6_progress
  user_id: string;                     // uuid
  entered_at: string;                  // ISO-8601, có timezone

  /** ① Lệnh đầu tiên đi qua bước Đối chiếu (so_lenh_doi_chieu >= 1). */
  task_1_done_at: string | null;
  /** ② Kết sổ đầu tiên của Cấp 6 = lệnh CÓ ĐỐI CHIẾU đầu tiên ĐÃ ĐÓNG
   *  (so_lenh_da_ket_so >= 1). ★ Xong nhờ POST /cap1/ketso, KHÔNG phải
   *  endpoint Cấp 6 nào. */
  task_2_done_at: string | null;
  /** ③ Thách thức Đối chiếu — 3 chân AND (≥15 lệnh, ≥3 kiểu, khớp ≥ lệch). */
  task_3_done_at: string | null;

  /** Số hàng order_kehoach Thực chiến có lop_quyet_dinh != null.
   *  NOT NULL, mặc định 0 — `0` ở đây là 0 THẬT. */
  so_lenh_doi_chieu: number;
  /** COUNT(DISTINCT kieu_co_phieu) KHÁC NULL trong các hàng trên. NOT NULL.
   *  ★ Lệnh có kieu_co_phieu = null KHÔNG được đếm vào đây. */
  so_kieu_da_gap: number;

  /** ★★ NULLABLE — migration 7b3c1e5a9d24.
   *  null  = nhóm KHỚP gợi ý CHƯA CÓ lệnh đã đóng nào → thuộc trạng thái
   *          "chưa đủ dữ liệu", KHÔNG BAO GIỜ được vẽ thành một con số.
   *  0     = có lệnh đã đóng, KHÔNG thắng lệnh nào (kết quả THẬT).
   *  Đơn vị: PHẦN TRĂM (75.0 = 75%), không phải tỷ lệ 0.75. */
  ty_le_thang_khop: number | null;
  /** ★★ NULLABLE — cùng ngữ nghĩa, cho nhóm LỆCH gợi ý.
   *  ★ ty_le_thang_lech thấp KHÔNG phải lời phán xét về user (spec §5/§10). */
  ty_le_thang_lech: number | null;

  graduated_at: string | null;
  /** Giờ từ entered_at tới graduated_at. null khi chưa tốt nghiệp. */
  time_to_graduate_hours: number | null;
}
~~~

~~~json
{
  "id": "8b4e17f0-92c5-4d63-a018-5f7c3e29b746",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-08-06T01:33:20.884517+00:00",
  "task_1_done_at": "2026-08-07T04:19:55.203841+00:00",
  "task_2_done_at": "2026-08-12T08:40:11.762094+00:00",
  "task_3_done_at": null,
  "so_lenh_doi_chieu": 11,
  "so_kieu_da_gap": 3,
  "ty_le_thang_khop": 66.66666666666666,
  "ty_le_thang_lech": null,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

Ví dụ hai trạng thái **cực dễ nhầm** — cùng một FE, hai ý nghĩa ngược nhau:

~~~json
{
  "so_lenh_doi_chieu": 4,
  "so_kieu_da_gap": 2,
  "ty_le_thang_khop": null,
  "ty_le_thang_lech": 0.0
}
~~~

`ty_le_thang_khop: null` → *"Nhóm khớp gợi ý chưa có lệnh đã đóng nào"* (FE hiện «chưa đủ dữ liệu»). `ty_le_thang_lech: 0.0` → *"Nhóm lệch đã đóng lệnh và không thắng lệnh nào"* (FE hiện «0%»). **KHÔNG được** render cả hai thành `0%`.

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | Thiếu / sai / hết hạn Bearer | `Thông tin xác thực không hợp lệ` |
| 403 | `FORBIDDEN` | Tài khoản bị vô hiệu hoá | `Không đủ quyền truy cập` |

**KHÔNG có 404** — chưa vào cấp thì 200 + `null`.

**Fallback / suy giảm** — Không phụ thuộc provider ngoài → không suy giảm theo giờ hay theo nguồn. Suy giảm theo dữ liệu: chưa có lệnh đối chiếu nào → `so_lenh_doi_chieu = 0`, `so_kieu_da_gap = 0`, **cả hai `ty_le_thang_*` = `null`** (không phải 0).

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap6/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3c58a0d7-4e91-42b6-bd03-8f7e51c9a264'
~~~

**Ghi chú khi viết lại**

- `GET` nhưng **GHI DB** → transaction ghi + commit.
- ★★ **`ty_le_thang_khop` / `ty_le_thang_lech` PHẢI nullable ở cả DB, ORM, DTO và client type.** Cột trong migration gốc `1df8155bcd7c` là `NOT NULL server_default "0"`; migration `7b3c1e5a9d24` (2026-08-01) đã sửa thành nullable. **Bản viết lại phải tạo cột nullable ngay từ đầu** — đừng lặp lại lỗi.
- ★ Trong code tính: **KHÔNG dùng `or`**. `nhom["ty_le_thang"] or 0.0` sẽ gộp `None` và `0.0`. TypeScript: dùng `??` chỉ khi thực sự muốn default, và ở đây **không muốn**.
- `so_kieu_da_gap` đếm `DISTINCT` trên **giá trị không NULL**. Trong JS: `new Set(rows.map(r => r.kieu_co_phieu).filter(Boolean)).size` — `filter(Boolean)` là cần thiết, `Set` sẽ giữ `null` như một phần tử.
- `so_lenh_doi_chieu` và `so_kieu_da_gap` là **`int` NOT NULL** — khác hai tỷ lệ. Đừng làm nullable cho "nhất quán".
- Không có filter `entered_at` (xem §15) — cố ý.
- 4 chỉ số này được tính bằng **3 truy vấn cho `_closed_pairs`** cộng 1 truy vấn `_doi_chieu_rows`. Với user nhiều lệnh, đây là điểm nóng; code hiện tại ghép cặp trong Python (vòng lặp lồng) chứ không bằng SQL — giữ **kết quả** giống nhau nếu tối ưu bằng SQL.

---

### POST /api/v1/cap6/enter

> **Vào Cấp 6** — tạo hàng tiến trình Cấp 6 (idempotent), yêu cầu đã tốt nghiệp Cấp 5; **luôn tính lại chỉ số trước khi trả**.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap6_progress`, `cap5_progress`, + nguồn của recompute) |
| **Side-effect** | INSERT `cap6_progress` (`entered_at = now(UTC)`) ở lần đầu; **và recompute Ở CẢ HAI NHÁNH** (mới tạo lẫn đã tồn tại) |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap6ProgressOut` (không bao giờ `null`).

~~~json
{
  "id": "8b4e17f0-92c5-4d63-a018-5f7c3e29b746",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-08-17T01:22:04.339715+00:00",
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_doi_chieu": 0,
  "so_kieu_da_gap": 0,
  "ty_le_thang_khop": null,
  "ty_le_thang_lech": null,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa có hàng `cap5_progress` | `Không tìm thấy tiến trình Cấp 5` |
| 409 | `CONFLICT` | Có hàng Cấp 5 nhưng `graduated_at IS NULL` | `Chưa tốt nghiệp Cấp 5` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài. Gọi lại nhiều lần: `entered_at` **giữ nguyên lần đầu**, nhưng **các chỉ số được cập nhật mới** (khác `POST /cap5/enter`).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap6/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: d90b6c31-7f45-4e82-a1d6-53c08b7e924f'
~~~

**Ghi chú khi viết lại**

- ★★ **KHÁC `POST /cap5/enter`: endpoint này LUÔN recompute**, kể cả khi hàng đã tồn tại. Docstring giải thích: endpoint idempotent và FE hiện đúng thứ nó trả, nên user quay lại **không được** thấy số cũ cho tới lần gọi `/cap6/progress` sau. Cùng cách với `/cap7/enter` và `/cap8/enter`. **Đừng copy y nguyên logic Cấp 5.**
- Cấu trúc code cũng khác: Cấp 5 `return progress` sớm; Cấp 6 dùng `if progress is None: …tạo…` rồi **chảy tiếp** xuống `_recompute_progress` chung cho cả hai nhánh.
- **Thứ tự kiểm tra**: hàng Cấp 6 → (nếu chưa có) hàng Cấp 5 → `graduated_at`. Rồi mới recompute.
- `UniqueConstraint("user_id", name="uq_cap6_progress_user_id")` → hai request đồng thời có thể đụng unique (hiện không bắt riêng → 500).
- Lần đầu tiên vào cấp, hai `ty_le_thang_*` là **`null`**, không phải `0` — vì recompute chạy ngay và không nhóm nào có lệnh đã đóng.

---

### PATCH /api/v1/cap6/task

> **Kích hoạt tính lại nhiệm vụ Cấp 6** — endpoint này KHÔNG đặt nhiệm vụ nào là xong; nó chỉ chạy recompute.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB |
| **Side-effect** | Cập nhật 4 chỉ số + có thể dập `task_N_done_at` |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
/** app/schemas/cap6.py::TaskRequest — cùng hình dạng schema Cấp 5 nhưng là
 *  CLASS KHÁC (OpenAPI: app__schemas__cap6__TaskRequest). */
interface Cap6TaskRequest {
  task_no: number;   // bắt buộc; chỉ nhận 1 | 2 | 3
}
~~~

~~~json
{ "task_no": 2 }
~~~

**Response 200** — `Cap6ProgressOut` (không bao giờ `null`).

~~~json
{
  "id": "8b4e17f0-92c5-4d63-a018-5f7c3e29b746",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-08-06T01:33:20.884517+00:00",
  "task_1_done_at": "2026-08-07T04:19:55.203841+00:00",
  "task_2_done_at": "2026-08-12T08:40:11.762094+00:00",
  "task_3_done_at": null,
  "so_lenh_doi_chieu": 11,
  "so_kieu_da_gap": 3,
  "ty_le_thang_khop": 66.66666666666666,
  "ty_le_thang_lech": null,
  "graduated_at": null,
  "time_to_graduate_hours": null
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `task_no` không thuộc `{1, 2, 3}` | `task_no không hợp lệ` |
| 404 | `NOT_FOUND` | Chưa vào Cấp 6 | `Không tìm thấy tiến trình Cấp 6` |
| 422 | — (FastAPI) | `task_no` không phải số nguyên / thiếu field | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Không phụ thuộc provider ngoài → không có nhánh suy giảm.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap6/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 0f7a3d92-6c15-4b48-90e7-e2851d6b47c3' \
  -d '{"task_no":2}'
~~~

**Ghi chú khi viết lại**

- ★★ Y như Cấp 5: **`task_no` gần như trang trí**. Cả 3 nhiệm vụ suy từ `order_kehoach` / `order_ketso`. **KHÔNG được** implement thành `UPDATE cap6_progress SET task_{n}_done_at = now()`.
- **Thứ tự: validate `task_no` TRƯỚC, `_require_progress` SAU** → chưa vào cấp + `task_no = 7` cho **400**, không phải 404.
- Nhiệm vụ ② **không thể** hoàn thành qua endpoint này hay bất kỳ endpoint Cấp 6 nào — nó cần một vòng tròn đã đóng, tức phải gọi `POST /api/v1/cap1/ketso` cho lệnh BÁN. Nếu FE hiện "bấm để hoàn thành nhiệm vụ 2" thì UX sẽ sai.
- Schema **trùng tên** với Cấp 5 → TS phải đặt tên khác (`Cap6TaskRequest`).

---

### GET /api/v1/cap6/goi-y

> **Gợi ý trọng số lớp theo kiểu cổ phiếu** — kiểu của mã (hệ suy từ NGÀNH) + lớp nên ưu tiên / lớp ít tin + câu «vì sao».

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không (`SymbolRepository.get_by_symbol` đọc trực tiếp DB) |
| **Nguồn dữ liệu** | DB bảng `symbols` (`icb_lv2` → fallback `icb_lv1`) + bảng tĩnh `KIEU_CO_PHIEU` trong code |
| **Side-effect** | **KHÔNG GHI GÌ** (endpoint Cấp 6 duy nhất cùng `GET /cap6/kehoach/{id}` không recompute) |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbol` | `string` | **Có** | — | Không rỗng sau `.trim()`; server tự `.upper()` | Mã cổ phiếu, ví dụ `VCB`. Mã không có trong bảng `symbols` **không** phải lỗi → trả `kieu = null` |

**Request body** — —

**Response 200**

~~~ts
/** app/schemas/cap6.py::GoiYOut
 *  ★ Đây là GỢI Ý, KHÔNG phải LUẬT (spec §5/§10) — user được chọn lệch. */
interface GoiYOut {
  symbol: string;                    // đã .trim().toUpperCase()
  /** Ngành ICB mà kiểu được suy RA TỪ (provenance). null khi không xác định.
   *  Là icb_lv2 nếu có, ngược lại icb_lv1. */
  nganh: string | null;
  /** null = "CHƯA PHÂN LOẠI" (ngành thiếu hoặc cố ý không map).
   *  KHÔNG phải lỗi — FE vẫn cho user chọn lớp quyết định. */
  kieu: KieuCoPhieu | null;
  kieu_ten: string | null;           // "Ngân hàng", "Tăng trưởng / công nghệ", …
  /** Lớp nên ƯU TIÊN tin khi các lớp mâu thuẫn. [] khi kieu = null.
   *  ★ Thứ tự có ý nghĩa (thứ tự trong bảng trọng số). */
  lop_uu_tien: Lop[];
  lop_uu_tien_ten: string[];         // nhãn tương ứng, cùng thứ tự
  /** Lớp ÍT TIN CẬY cho kiểu này. [] khi kieu = null.
   *  ★ KHÔNG tham gia phép so khop_goi_y — chỉ để hiển thị. */
  lop_it_tin: Lop[];
  lop_it_tin_ten: string[];
  /** §C12c — FE hiện NGUYÊN VĂN, không bao giờ gợi ý trơ. Luôn có giá trị,
   *  kể cả khi kieu = null (khi đó là câu "chưa phân loại"). */
  giai_thich: string;
}
~~~

Trường hợp phân loại được (`GET /api/v1/cap6/goi-y?symbol=VCB`):

~~~json
{
  "symbol": "VCB",
  "nganh": "Ngân hàng",
  "kieu": "ngan_hang",
  "kieu_ten": "Ngân hàng",
  "lop_uu_tien": ["dinh_gia", "noi_bo"],
  "lop_uu_tien_ten": ["Định giá", "Nội bộ"],
  "lop_it_tin": ["ky_thuat"],
  "lop_it_tin_ten": ["Kỹ thuật"],
  "giai_thich": "Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ thuật ngắn hạn ít tin cậy hơn cho nhóm này."
}
~~~

Trường hợp **chưa phân loại** (`?symbol=ABCD` — không có hàng `symbols`, hoặc ngành là `"Tài chính"` cấp 1 cố ý không map):

~~~json
{
  "symbol": "ABCD",
  "nganh": null,
  "kieu": null,
  "kieu_ten": null,
  "lop_uu_tien": [],
  "lop_uu_tien_ten": [],
  "lop_it_tin": [],
  "lop_it_tin_ten": [],
  "giai_thich": "Chưa phân loại được kiểu cổ phiếu cho ABCD (hệ chưa có dữ liệu ngành cho mã này), nên lần này IQX không gợi ý trọng số lớp. Bước Đối chiếu vẫn hoạt động bình thường: bạn tự chọn lớp quyết định và ghi vì sao."
}
~~~

★ **Lưu ý cạnh biên:** khi ngành có nhưng **không map được** (ví dụ `icb_lv1 = "Tài chính"`), `nganh` trả về **`"Tài chính"`** (không null) trong khi `kieu` vẫn `null` — vì `kieu_payload` nhận `nganh` riêng. Câu `giai_thich` vẫn là câu "chưa phân loại" nói *"hệ chưa có dữ liệu ngành cho mã này"*, tuy ngành thực ra có. **Đây là hành vi hiện tại, giữ nguyên nguyên văn.**

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 6 — kiểm **TRƯỚC** khi đọc symbol | `Không tìm thấy tiến trình Cấp 6` |
| 400 | `BAD_REQUEST` | `symbol` rỗng / toàn khoảng trắng | `Thiếu mã cổ phiếu` |
| 422 | — (FastAPI) | **Thiếu hẳn** query param `symbol` | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

★ Mã không tồn tại → **200**, KHÔNG 404.

**Fallback / suy giảm** — ★ **FAIL SOFT tuyệt đối ở nhánh tra ngành.** `_nganh_of` bọc `SymbolRepository.get_by_symbol` trong `try/except Exception` và trả `None` khi lỗi → **DB lỗi hay bảng `symbols` chưa seed đều biến thành "chưa phân loại", KHÔNG BAO GIỜ thành lỗi chặn panel mua.** Bốn nhánh dẫn tới `kieu = null`: (1) không có hàng `symbols`; (2) cả `icb_lv2` và `icb_lv1` đều rỗng/NULL; (3) ngành có nhưng cố ý không map (`"Tài chính"` lv1); (4) exception khi tra. Cả 4 đều trả cùng một `giai_thich`, và FE **vẫn** cho user chọn lớp quyết định (spec §4/§10).

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap6/goi-y?symbol=VCB' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 5a1e94c8-3b70-4d26-8f95-c1740b6ed283'
~~~

**Ghi chú khi viết lại**

- ★ **THỨ TỰ**: `_require_progress` (404) **TRƯỚC** khi validate symbol (400). Chưa vào cấp + `?symbol=` rỗng → **404**, không phải 400.
- **Ưu tiên `icb_lv2`, fallback `icb_lv1`**: `(row.icb_lv2 or None) or (row.icb_lv1 or None)` — chuỗi rỗng cũng bị coi là thiếu. Test `test_goi_y_falls_back_from_icb_lv2_to_lv1`.
- ★ **Chuẩn hoá khoá ngành `_norm_nganh`**: NFKD → bỏ ký tự combining → `đ→d`, `Đ→D` → gom khoảng trắng (`\s+` → 1 space) → `trim()` → `toLowerCase()`. **Phải copy chính xác** — nếu không, nhãn ICB lệch dấu/hoa-thường sẽ tuột khỏi map và mọi mã thành "chưa phân loại". TS: `str.normalize("NFKD").replace(/\p{M}/gu, "")` rồi thay `đ`/`Đ` (chúng **không** bị NFKD tách).
- `lop_uu_tien` / `lop_it_tin` là **bản sao** (`list(row[...])`) — bảng `KIEU_CO_PHIEU` là hằng, đừng để caller mutate.
- `lop_*_ten` do **server** map qua `LOP_LABELS`, client không tự dịch.
- **Kiểm tra lúc khởi động bắt buộc giữ**: `_assert_lop_keys()` chạy khi import `app/models/cap6.py`, `raise RuntimeError` nếu bảng nhắc lớp lạ / một lớp vừa ưu tiên vừa ít tin / thiếu bảng cho một kiểu trong 6 kiểu.
- `dau_co_nho` **không bao giờ** ra từ endpoint này (không map từ ngành nào) — nhưng bảng trọng số của nó vẫn phải có, vì `POST /cap6/kehoach` dùng khi client fallback.
- Endpoint này **KHÔNG dùng được cho màn Kết sổ** — xem `GET /cap6/kehoach/{order_id}` và §4.

---

### POST /api/v1/cap6/kehoach

> **Ghi bước «Đối chiếu»** — cộng khối Đối chiếu vào kế hoạch Cấp 1 đã có của một lệnh MUA; server tự suy kiểu, trọng số và khớp/lệch.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`order_kehoach`, `virtual_orders`, `symbols`) + bảng tĩnh `KIEU_CO_PHIEU` |
| **Side-effect** | UPDATE `order_kehoach`: `kieu_co_phieu`, `lop_mau_thuan` (JSON), `trong_so_goi_y` (JSON), `lop_quyet_dinh`, `khop_goi_y`, `ly_do_doi_chieu`. Sau đó recompute `cap6_progress`. ★ **Cộng dồn** — không ghi đè khối Cấp 1/2/3/4/5 trên cùng hàng |

**Path params** — —

**Query params** — —

**Request body**

~~~ts
/** app/schemas/cap6.py::KehoachRequest
 *  ★ KHÔNG có `trong_so_goi_y`, KHÔNG có `khop_goi_y` — server suy cả hai. */
interface Cap6KehoachRequest {
  /** uuid lệnh MUA đã có hàng order_kehoach (Cấp 1). */
  order_id: string;
  /** Lớp user chọn TIN. Khai `str` ở Pydantic → giá trị lạ bị service chặn 400. */
  lop_quyet_dinh: Lop;
  /** BẮT BUỘC. Rỗng / toàn khoảng trắng / không gửi → 422. */
  ly_do_doi_chieu?: string | null;
  /** CHỈ dùng khi server không xác định được ngành. Server suy từ ngành và
   *  giá trị SERVER THẮNG. Nếu server bó tay mà client gửi giá trị ngoài enum
   *  6 kiểu → 400. Đây là ĐƯỜNG DUY NHẤT tới `dau_co_nho`. */
  kieu_co_phieu?: KieuCoPhieu | null;
  /** DỰ PHÒNG. Server ưu tiên `order_kehoach.doc_5_lop` (Cấp 4). Map
   *  {lop: "ok"|"neu"|"bad"}; khoá/giá trị lạ bị LOẠI IM LẶNG, không 400. */
  lop_mau_thuan?: Record<string, NhanDinhLop> | null;
}
~~~

~~~json
{
  "order_id": "b7c34e91-2f68-4a05-9d17-8e60c5b3f724",
  "lop_quyet_dinh": "dinh_gia",
  "ly_do_doi_chieu": "P/B 1.4 thấp hơn trung bình ngành ngân hàng, nợ xấu đã tạo đỉnh — tôi tin lớp định giá hơn tín hiệu kỹ thuật đang xấu.",
  "kieu_co_phieu": null,
  "lop_mau_thuan": {
    "ky_thuat": "bad",
    "dong_tien": "neu",
    "noi_bo": "ok",
    "tin_tuc": "neu",
    "dinh_gia": "ok"
  }
}
~~~

**Response 200**

~~~ts
/** app/schemas/cap6.py::KehoachCap6Out — góc nhìn Cấp 6 của order_kehoach.
 *  ★ SUBSET: các cột Cấp 1/2/3/4 (vung_mua, cat_lo, pct_von, doc_5_lop…)
 *  KHÔNG có trong response này dù vẫn nằm trên cùng hàng DB. */
interface KehoachCap6Out {
  id: string;                              // uuid hàng order_kehoach
  order_id: string;                        // uuid lệnh MUA
  /** Kiểu SERVER đã chốt (từ ngành, hoặc từ client khi server bó tay).
   *  null = chưa phân loại được và client cũng không cung cấp. */
  kieu_co_phieu: KieuCoPhieu | null;
  kieu_ten: string | null;
  lop_mau_thuan: LopMauThuan | null;       // null khi không có nguồn nào
  trong_so_goi_y: TrongSoGoiY | null;      // null khi kieu_co_phieu = null
  lop_quyet_dinh: Lop | null;
  lop_quyet_dinh_ten: string | null;
  /** ★ true = khớp · false = LỆCH (SỰ THẬT TRUNG TÍNH, KHÔNG PHẢI "sai")
   *  · null = kiểu chưa phân loại → không có gợi ý nào để khớp. */
  khop_goi_y: boolean | null;
  ly_do_doi_chieu: string | null;          // đã .trim()
}
~~~

~~~json
{
  "id": "c1f80b47-53d9-4e62-a708-269be4c15d30",
  "order_id": "b7c34e91-2f68-4a05-9d17-8e60c5b3f724",
  "kieu_co_phieu": "ngan_hang",
  "kieu_ten": "Ngân hàng",
  "lop_mau_thuan": {
    "ung_ho": ["noi_bo", "dinh_gia"],
    "ung_ho_ten": ["Nội bộ", "Định giá"],
    "nguoc_chieu": ["ky_thuat"],
    "nguoc_chieu_ten": ["Kỹ thuật"],
    "trung_tinh": ["dong_tien", "tin_tuc"],
    "co_mau_thuan": true,
    "nguon": "doc_5_lop"
  },
  "trong_so_goi_y": {
    "kieu": "ngan_hang",
    "kieu_ten": "Ngân hàng",
    "nganh": "Ngân hàng",
    "nguon": "nganh",
    "lop_uu_tien": ["dinh_gia", "noi_bo"],
    "lop_it_tin": ["ky_thuat"],
    "giai_thich": "Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ thuật ngắn hạn ít tin cậy hơn cho nhóm này."
  },
  "lop_quyet_dinh": "dinh_gia",
  "lop_quyet_dinh_ten": "Định giá",
  "khop_goi_y": true,
  "ly_do_doi_chieu": "P/B 1.4 thấp hơn trung bình ngành ngân hàng, nợ xấu đã tạo đỉnh — tôi tin lớp định giá hơn tín hiệu kỹ thuật đang xấu."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 6 — kiểm **đầu tiên** | `Không tìm thấy tiến trình Cấp 6` |
| 404 | `NOT_FOUND` | `order_id` không tồn tại **HOẶC** của người khác | `Không tìm thấy lệnh` |
| 400 | `BAD_REQUEST` | Lệnh không phải `side == BUY` | `Bước Đối chiếu chỉ ghi cho lệnh MUA` |
| 400 | `BAD_REQUEST` | `lop_quyet_dinh` không thuộc 5 lớp | `lop_quyet_dinh phải là 1 trong 5 lớp` |
| 422 | `UNPROCESSABLE_ENTITY` | `ly_do_doi_chieu` thiếu / rỗng / toàn khoảng trắng | `Cần ghi 1 dòng vì sao bạn tin lớp này — đối chiếu không bao giờ là một lựa chọn trơ.` |
| 400 | `BAD_REQUEST` | Server **không** phân loại được kiểu **VÀ** client gửi `kieu_co_phieu` ngoài enum 6 kiểu | `kieu_co_phieu không hợp lệ` |
| 404 | `NOT_FOUND` | Lệnh MUA chưa có hàng `order_kehoach` (chưa ghi vùng mua Cấp 1) | `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` |
| 409 | `CONFLICT` | ★ **FREEZE**: đã có `lop_quyet_dinh`, nội dung mới KHÁC, và lệnh `status == FILLED` | `Lệnh này đã khớp — phần Đối chiếu không sửa được nữa. Lớp bạn chọn tin phải được chốt TRƯỚC khi biết lệnh lãi hay lỗ, đó là điều làm so sánh khớp/lệch gợi ý có nghĩa.` |
| 422 | — (FastAPI) | Thiếu `order_id` / `lop_quyet_dinh`, `order_id` không phải UUID | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Ba nhánh suy giảm, tất cả đều **200**:

1. **Không xác định được ngành** → thử `kieu_co_phieu` của client (validate enum). Nếu client cũng không gửi → `kieu_co_phieu = null`, `trong_so_goi_y = null`, **`khop_goi_y = null`** (KHÔNG phải `false`). Bước đối chiếu **vẫn ghi thành công**: `lop_quyet_dinh` + `ly_do_doi_chieu` được lưu, và lệnh **không vào nhóm khớp lẫn nhóm lệch**.
2. **Không có `doc_5_lop`** (lệnh chưa qua Cấp 4) → dùng `lop_mau_thuan` client (`nguon: "client"`). Cả hai đều thiếu → `lop_mau_thuan = null`, vẫn ghi bình thường.
3. **`co_mau_thuan = false`** (5 lớp không mâu thuẫn) → **KHÔNG PHẢI LỖI**, vẫn ghi. Cò này là luật UI, không phải cổng server.

DB lỗi khi tra `symbols` → `_nganh_of` trả `None` → rơi về nhánh (1), không thành 5xx.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap6/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e64c2a08-9d51-4f37-b1a6-70e38c5b492d' \
  -d '{"order_id":"b7c34e91-2f68-4a05-9d17-8e60c5b3f724","lop_quyet_dinh":"dinh_gia","ly_do_doi_chieu":"P/B 1.4 thấp hơn trung bình ngành ngân hàng, nợ xấu đã tạo đỉnh — tôi tin lớp định giá hơn tín hiệu kỹ thuật đang xấu.","kieu_co_phieu":null,"lop_mau_thuan":{"ky_thuat":"bad","dong_tien":"neu","noi_bo":"ok","tin_tuc":"neu","dinh_gia":"ok"}}'
~~~

**Ghi chú khi viết lại**

- ★★ **THỨ TỰ KIỂM TRA (8 bước, KHÔNG đảo)**: tiến trình (404) → lệnh + quyền (404) → `side == BUY` (400) → `lop_quyet_dinh` hợp lệ (400) → `ly_do_doi_chieu` không rỗng (422) → suy kiểu, validate kiểu client (400) → hàng `order_kehoach` (404) → FREEZE (409/no-op). **Chú ý bước 6 nằm TRƯỚC bước 7**: `kieu_co_phieu` rác trên một lệnh **chưa có** kế hoạch Cấp 1 trả **400**, không phải 404.
- ★★ **FREEZE (chi tiết ở §13C)**: đã có `lop_quyet_dinh` → so `lop_quyet_dinh` **và** `ly_do_doi_chieu` (đã trim) với giá trị mới. Trùng cả hai → **`return` hàng cũ ngay, KHÔNG recompute, KHÔNG 409**. Khác → nếu `status == FILLED` thì **409**, chưa FILLED thì cho sửa. **Chỉ so 2 field đó** — `lop_mau_thuan` / `kieu_co_phieu` khác nhau **không** làm nó thành "khác".
- ★ `khop_goi_y` = `lop_quyet_dinh ∈ trong_so_goi_y.lop_uu_tien`. **`lop_it_tin` KHÔNG tham gia.** Chọn một lớp nằm trong `lop_it_tin` → `false`, giống như chọn lớp không nằm trong cả hai.
- ★ **`khop_goi_y = null` khi `kieu = null`** — đừng để mặc định `false`. Đây là bảo vệ trực tiếp: user không bị dán nhãn "lệch" trước một gợi ý chưa từng được đưa ra.
- `trong_so_goi_y` là **ảnh chụp đóng băng** kèm `nguon` (`"nganh"` / `"client"`) và `nganh`. Nếu bảng ngành sau này đổi, hàng cũ **giữ nguyên** — đó là lý do `GET /cap6/kehoach/{order_id}` đọc được đúng.
- `lop_mau_thuan.ung_ho` / `nguoc_chieu` / `trung_tinh` sắp theo **thứ tự chuẩn `LOP_KEYS`** (`ky_thuat, dong_tien, noi_bo, tin_tuc, dinh_gia`), **không** theo thứ tự khoá trong JSON client gửi.
- Validate map lớp **cố ý dễ tính**: khoá không thuộc 5 lớp hoặc giá trị không thuộc `{ok, neu, bad}` bị **loại im lặng**; sau khi lọc mà rỗng → `null`. **Đừng** đổi thành 400.
- `ly_do_doi_chieu` lưu bản **đã `.trim()`**.
- Lỗi rỗng `ly_do_doi_chieu` là **422**, còn lỗi `lop_quyet_dinh` sai là **400** — hai status khác nhau cho hai lỗi validate cạnh nhau. Cố ý (422 = "hiểu nhưng không xử lý được", cùng quy ước với `POST /cap5/ketso`).
- Service nhận `trong_so_goi_y` và `khop_goi_y` trong signature (`# noqa: ARG002 — advisory`) và **bỏ qua hoàn toàn**. Schema request không có. Đừng thêm.

---

### GET /api/v1/cap6/kehoach/{order_id}

> **Đọc lại bước Đối chiếu đã ghi trên một lệnh** — cho màn Kết sổ; đọc từ cột đã lưu, KHÔNG tính lại, KHÔNG ghi đè.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB — **chỉ đọc** `order_kehoach` + `virtual_orders` (lấy `symbol`). ★ **KHÔNG** tra bảng `symbols`, **KHÔNG** suy lại kiểu |
| **Side-effect** | **KHÔNG GHI GÌ** — bất biến có test bảo vệ (`test_get_kehoach_never_rewrites_what_was_recorded`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | `string` (uuid) | Bắt buộc, format uuid | ID lệnh **MUA** (`virtual_orders.id`) — lệnh mang khối Đối chiếu |

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** app/schemas/cap6.py::KehoachCap6DetailOut — KẾ THỪA KehoachCap6Out
 *  và thêm 8 field. Hình dạng phần hiển thị CỐ Ý giống GoiYOut để FE dùng
 *  lại đúng một component — nhưng dữ liệu lấy TỪ BẢN GHI, không suy lại. */
interface KehoachCap6DetailOut extends KehoachCap6Out {
  /** ★ Ghi đè: null khi lệnh KHÔNG có hàng order_kehoach nào. */
  id: string | null;
  /** Lấy từ virtual_orders.symbol (không phải từ order_kehoach). */
  symbol: string;
  /** Đọc RA TỪ trong_so_goi_y đã lưu. null khi kiểu unknown hoặc do client. */
  nganh: string | null;
  /** Đọc RA TỪ trong_so_goi_y đã lưu, đã lọc lại theo 5 lớp hợp lệ.
   *  KHÔNG suy lại từ bảng KIEU_CO_PHIEU hiện tại. */
  lop_uu_tien: Lop[];
  lop_uu_tien_ten: string[];
  lop_it_tin: Lop[];
  lop_it_tin_ten: string[];
  /** "Khớp gợi ý" | "Lệch gợi ý" | null.
   *  ★ Không nhãn nào nói đúng/sai. */
  khop_goi_y_ten: string | null;
  /** ★ false = lệnh này KHÔNG có dữ liệu Cấp 6 — KHÔNG PHẢI LỖI.
   *  Vẫn là 200, để FE phân biệt "lệnh có trước Cấp 6" với "gọi hỏng". */
  co_du_lieu: boolean;
  /** §C12c — hiện NGUYÊN VĂN. Luôn có giá trị, cả khi co_du_lieu = false. */
  giai_thich: string;
}
~~~

Trường hợp **có dữ liệu, khớp gợi ý**:

~~~json
{
  "id": "c1f80b47-53d9-4e62-a708-269be4c15d30",
  "order_id": "b7c34e91-2f68-4a05-9d17-8e60c5b3f724",
  "symbol": "VCB",
  "kieu_co_phieu": "ngan_hang",
  "kieu_ten": "Ngân hàng",
  "nganh": "Ngân hàng",
  "lop_mau_thuan": {
    "ung_ho": ["noi_bo", "dinh_gia"],
    "ung_ho_ten": ["Nội bộ", "Định giá"],
    "nguoc_chieu": ["ky_thuat"],
    "nguoc_chieu_ten": ["Kỹ thuật"],
    "trung_tinh": ["dong_tien", "tin_tuc"],
    "co_mau_thuan": true,
    "nguon": "doc_5_lop"
  },
  "trong_so_goi_y": {
    "kieu": "ngan_hang",
    "kieu_ten": "Ngân hàng",
    "nganh": "Ngân hàng",
    "nguon": "nganh",
    "lop_uu_tien": ["dinh_gia", "noi_bo"],
    "lop_it_tin": ["ky_thuat"],
    "giai_thich": "Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ thuật ngắn hạn ít tin cậy hơn cho nhóm này."
  },
  "lop_uu_tien": ["dinh_gia", "noi_bo"],
  "lop_uu_tien_ten": ["Định giá", "Nội bộ"],
  "lop_it_tin": ["ky_thuat"],
  "lop_it_tin_ten": ["Kỹ thuật"],
  "lop_quyet_dinh": "dinh_gia",
  "lop_quyet_dinh_ten": "Định giá",
  "khop_goi_y": true,
  "khop_goi_y_ten": "Khớp gợi ý",
  "ly_do_doi_chieu": "P/B 1.4 thấp hơn trung bình ngành ngân hàng, nợ xấu đã tạo đỉnh — tôi tin lớp định giá hơn tín hiệu kỹ thuật đang xấu.",
  "co_du_lieu": true,
  "giai_thich": "VCB thuộc kiểu Ngân hàng (suy từ ngành Ngân hàng). Ngân hàng định giá theo P/B và chất lượng tài sản — tín hiệu kỹ thuật ngắn hạn ít tin cậy hơn cho nhóm này. Bạn chọn tin lớp \"Định giá\" — KHỚP lớp IQX gợi ý ưu tiên cho kiểu này (Định giá, Nội bộ)."
}
~~~

Trường hợp **lệch gợi ý** (chỉ khác hai field cuối, `khop_goi_y: false`):

~~~json
{
  "symbol": "FPT",
  "kieu_co_phieu": "tang_truong",
  "kieu_ten": "Tăng trưởng / công nghệ",
  "lop_quyet_dinh": "dinh_gia",
  "lop_quyet_dinh_ten": "Định giá",
  "khop_goi_y": false,
  "khop_goi_y_ten": "Lệch gợi ý",
  "co_du_lieu": true,
  "giai_thich": "FPT thuộc kiểu Tăng trưởng / công nghệ (suy từ ngành Công nghệ Thông tin). Với nhóm tăng trưởng, P/E cao là bình thường; đà giá và câu chuyện dẫn dắt — định giá đơn thuần ít tin cậy hơn. Bạn chọn tin lớp \"Định giá\" — LỆCH gợi ý ưu tiên (Kỹ thuật, Tin tức, Dòng tiền). Lệch gợi ý KHÔNG bị tính là sai: đó chỉ là nhóm thứ hai để so, và trọng tài là kết quả thật."
}
~~~

Trường hợp **KHÔNG có dữ liệu Cấp 6** (lệnh đặt trước Cấp 6, hoặc 5 lớp không mâu thuẫn nên bước không hiện) — **vẫn 200**:

~~~json
{
  "id": null,
  "order_id": "4e91b208-7c53-4d0f-a86b-1f27d90e3654",
  "symbol": "HPG",
  "kieu_co_phieu": null,
  "kieu_ten": null,
  "nganh": null,
  "lop_mau_thuan": null,
  "trong_so_goi_y": null,
  "lop_uu_tien": [],
  "lop_uu_tien_ten": [],
  "lop_it_tin": [],
  "lop_it_tin_ten": [],
  "lop_quyet_dinh": null,
  "lop_quyet_dinh_ten": null,
  "khop_goi_y": null,
  "khop_goi_y_ten": null,
  "ly_do_doi_chieu": null,
  "co_du_lieu": false,
  "giai_thich": "Lệnh này chưa đi qua bước Đối chiếu — hoặc nó được đặt trước khi bạn vào Cấp 6, hoặc 5 lớp lúc đó không mâu thuẫn nên bước Đối chiếu không hiện. Không có gì để đối chiếu lại, và điều đó không bị tính là thiếu sót."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 6 — kiểm **đầu tiên** | `Không tìm thấy tiến trình Cấp 6` |
| 404 | `NOT_FOUND` | `order_id` không tồn tại **HOẶC** của người khác | `Không tìm thấy lệnh` |
| 422 | — (FastAPI) | `order_id` không phải UUID hợp lệ | Vỏ `HTTPValidationError` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

★ **KHÔNG có 404 cho "lệnh không có dữ liệu Cấp 6"** — đó là 200 + `co_du_lieu: false`. Đây là điểm cố ý: FE phải phân biệt được "lệnh có trước Cấp 6" với "endpoint hỏng".

★ **KHÔNG kiểm `side == BUY`** ở endpoint này (khác `POST /cap6/kehoach`). Truyền id một lệnh BÁN của chính mình → **200** với `co_du_lieu: false` (lệnh bán không có hàng `order_kehoach`).

**Fallback / suy giảm** — Ba nhánh, tất cả 200:

1. Không có hàng `order_kehoach` → khối `empty`, `co_du_lieu: false`.
2. Có hàng nhưng `lop_quyet_dinh IS NULL` (chưa qua bước Đối chiếu) → **cũng** khối `empty`, `co_du_lieu: false`. `lop_quyet_dinh` là cột duy nhất mà chỉ bước này ghi → dùng làm cờ.
3. Có đối chiếu nhưng `trong_so_goi_y` không phải dict (kiểu unknown lúc ghi) → `lop_uu_tien` / `lop_it_tin` = `[]`, `nganh = null`, và `giai_thich` dùng nhánh "chưa phân loại" + câu *"không có gợi ý nào để đối chiếu, nên lệnh này không nằm trong nhóm khớp lẫn nhóm lệch."*

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap6/kehoach/b7c34e91-2f68-4a05-9d17-8e60c5b3f724' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7b25e9c4-08f3-4a61-9d57-c3e0b846f172'
~~~

**Ghi chú khi viết lại**

- ★★ **VÌ SAO ENDPOINT NÀY TỒN TẠI** (đọc kỹ, đừng "gộp cho gọn"): `GET /cap6/goi-y` suy lại kiểu từ ngành **ở thời điểm hiện tại**. Với mã server không phân loại được, kiểu đến **từ client** và chỉ sống trên hàng này → `/goi-y` vẫn trả "chưa phân loại", và màn Kết sổ dựng trên nó sẽ hiện "không xét" **dù server ĐÃ ghi `khop_goi_y`**. Test `test_get_kehoach_serves_a_client_picked_kieu_that_goi_y_cannot`.
- ★ **CHỈ ĐỌC.** Không recompute, không ghi, không tra `symbols`. Test `test_get_kehoach_never_rewrites_what_was_recorded` chốt việc này. **Đừng "tối ưu" bằng cách suy lại kiểu.**
- **Cờ `co_du_lieu` dựa vào `lop_quyet_dinh IS NULL`**, không dựa vào `kieu_co_phieu` hay `trong_so_goi_y` (hai cột đó `null` một cách hợp lệ ngay cả khi ĐÃ đối chiếu).
- Payload dựng bằng `{...empty, ...kehoach_out(kehoach), ...overrides}` — nên **mọi** field đều có mặt trong cả hai trạng thái, không có field bị thiếu. TS: đừng khai optional cho các field này.
- `lop_uu_tien` / `lop_it_tin` được **lọc lại** theo 5 lớp hợp lệ khi đọc ra khỏi JSON (`if lop in _LOP_VALUES`) — phòng blob cũ có khoá lạ.
- `khop_goi_y_ten`: `null` khi `khop_goi_y == null`, ngược lại `KHOP_GOI_Y_LABELS[bool(khop)]`. **Ba trạng thái, không phải hai.**
- `giai_thich` có **4 nhánh**: (a) `trong_so_goi_y` không có kiểu → câu "chưa phân loại" + *"không nằm trong nhóm khớp lẫn nhóm lệch"*; (b) `khop_goi_y == null` nhưng có kiểu → chỉ nói lớp đã chọn; (c) `true` → *"KHỚP lớp IQX gợi ý ưu tiên cho kiểu này (…)"*; (d) `false` → *"LỆCH gợi ý ưu tiên (…). Lệch gợi ý KHÔNG bị tính là sai: đó chỉ là nhóm thứ hai để so, và trọng tài là kết quả thật."* **Copy nguyên văn cả 4.**
- Câu provenance có 3 dạng theo `trong_so_goi_y.nguon`: `"suy từ ngành {nganh}"` (khi `nguon == "nganh"` và có `nganh`) · `"bạn tự chọn vì hệ chưa có dữ liệu ngành cho mã này"` (khi `"client"`) · `"đã ghi lúc đối chiếu"` (mặc định).
- `uu_tien_ten` trong `giai_thich` join bằng `", "`, rỗng thì thay bằng `"—"`.
- Lệnh của người khác → **404, không 403** (cùng quy ước `POST /cap6/kehoach`).

---

### GET /api/v1/cap6/thach-thuc

> **3 điều kiện Thách thức Đối chiếu** — giá trị hiện tại + đạt/chưa + giải thích, kèm hai nhóm khớp/lệch để so % thắng.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (tính lại toàn bộ từ `order_kehoach` ⋈ `order_ketso`) |
| **Side-effect** | ★ **CÓ GHI DB** — recompute (có thể dập `task_3_done_at` ngay trong lần gọi này) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200**

~~~ts
/** app/schemas/cap6.py::ThachThucOut — ★ 3 chân là 3 FIELD CÓ TÊN + 2 nhóm. */
interface Cap6ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_doi_chieu: Cap6ThachThucDieuKien;   // mục tiêu 15, du_du_lieu LUÔN true
  so_kieu_da_gap: Cap6ThachThucDieuKien;      // mục tiêu 3, du_du_lieu LUÔN true
  /** ★ Chân duy nhất có du_du_lieu ĐỘNG.
   *  gia_tri_hien_tai = ty_le_thang_khop (null → BỊ ÉP thành 0.0)
   *  muc_tieu        = ty_le_thang_lech (null → BỊ ÉP thành 0.0)
   *  ★★ HAI SỐ NÀY CHỈ CÓ NGHĨA KHI du_du_lieu === true. */
  doi_chieu_giup_ich: Cap6ThachThucDieuKien;
  /** Tỷ lệ NULLABLE thật nằm ở đây, không ở khối điều kiện trên. */
  nhom_khop: NhomDoiChieu;
  nhom_lech: NhomDoiChieu;
}
~~~

Trường hợp **đủ dữ liệu cả 2 nhóm**:

~~~json
{
  "dat_ca_3": false,
  "so_lenh_doi_chieu": {
    "ten": "Đối chiếu ≥ 15 lệnh có mâu thuẫn",
    "gia_tri_hien_tai": 11.0,
    "muc_tieu": 15.0,
    "dat": false,
    "du_du_lieu": true,
    "giai_thich": "Đã có 11/15 lệnh bạn đi qua bước Đối chiếu — mỗi lệnh là một lần bạn chọn có ý thức lớp nào đáng tin khi các lớp nói ngược nhau."
  },
  "so_kieu_da_gap": {
    "ten": "Gặp ≥ 3 kiểu cổ phiếu khác nhau",
    "gia_tri_hien_tai": 3.0,
    "muc_tieu": 3.0,
    "dat": true,
    "du_du_lieu": true,
    "giai_thich": "Đã đối chiếu trên 3/3 kiểu cổ phiếu (Bất động sản, Ngân hàng, Tăng trưởng / công nghệ) — trọng số lớp khác nhau theo từng kiểu, nên cần làm quen nhiều kiểu mới thấy được sự khác biệt."
  },
  "doi_chieu_giup_ich": {
    "ten": "Nhóm khớp gợi ý thắng ≥ nhóm lệch (mỗi nhóm ≥ 3 lệnh)",
    "gia_tri_hien_tai": 66.66666666666666,
    "muc_tieu": 50.0,
    "dat": true,
    "du_du_lieu": true,
    "giai_thich": "Nhóm khớp gợi ý thắng 67% (4/6 lệnh) vs nhóm lệch 50% (2/4 lệnh) — đối chiếu theo kiểu đang giúp bạn chọn đúng lớp."
  },
  "nhom_khop": {
    "khop": true,
    "ten": "Nhóm khớp gợi ý",
    "so_lenh": 6,
    "so_thang": 4,
    "ty_le_thang": 66.66666666666666,
    "du_du_lieu": true,
    "so_lenh_toi_thieu": 3,
    "giai_thich": "Nhóm khớp gợi ý: 4/6 lệnh đã đóng thắng (67%) — đây là các lệnh bạn tin đúng lớp mà IQX gợi ý ưu tiên cho kiểu cổ phiếu đó."
  },
  "nhom_lech": {
    "khop": false,
    "ten": "Nhóm lệch gợi ý",
    "so_lenh": 4,
    "so_thang": 2,
    "ty_le_thang": 50.0,
    "du_du_lieu": true,
    "so_lenh_toi_thieu": 3,
    "giai_thich": "Nhóm lệch gợi ý: 2/4 lệnh đã đóng thắng (50%) — đây là các lệnh bạn tin lớp khác gợi ý. Lệch gợi ý KHÔNG bị tính là kém; đó chỉ là nhóm thứ hai để so, và trọng tài là kết quả thật."
  }
}
~~~

Trường hợp **CHƯA đủ dữ liệu** — chú ý `gia_tri_hien_tai`/`muc_tieu` bị ép `0.0` trong khi `ty_le_thang` thật là `null`:

~~~json
{
  "dat_ca_3": false,
  "doi_chieu_giup_ich": {
    "ten": "Nhóm khớp gợi ý thắng ≥ nhóm lệch (mỗi nhóm ≥ 3 lệnh)",
    "gia_tri_hien_tai": 0.0,
    "muc_tieu": 0.0,
    "dat": false,
    "du_du_lieu": false,
    "giai_thich": "Chưa so sánh được: nhóm khớp gợi ý có 2 lệnh đã đóng, nhóm lệch có 0 — mỗi nhóm cần ít nhất 3 lệnh mới kết luận. Trên 1-2 lệnh thì con số không nói được gì, nên IQX không so."
  },
  "nhom_khop": {
    "khop": true,
    "ten": "Nhóm khớp gợi ý",
    "so_lenh": 2,
    "so_thang": 1,
    "ty_le_thang": 50.0,
    "du_du_lieu": false,
    "so_lenh_toi_thieu": 3,
    "giai_thich": "Nhóm khớp gợi ý: 1/2 lệnh đã đóng thắng. Chưa đủ dữ liệu — cần ít nhất 3 lệnh đã đóng mỗi nhóm mới kết luận, 2 lệnh thì chưa nói được gì."
  },
  "nhom_lech": {
    "khop": false,
    "ten": "Nhóm lệch gợi ý",
    "so_lenh": 0,
    "so_thang": 0,
    "ty_le_thang": null,
    "du_du_lieu": false,
    "so_lenh_toi_thieu": 3,
    "giai_thich": "Chưa có lệnh đã đóng nào ở nhóm lệch gợi ý — cần ít nhất 3 lệnh mỗi nhóm mới so sánh được."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 6 | `Không tìm thấy tiến trình Cấp 6` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

**Fallback / suy giảm** — Chưa có lệnh nào: hai chân đầu `gia_tri_hien_tai = 0.0` (`0` THẬT, `du_du_lieu` vẫn `true`); chân ba `du_du_lieu = false`, cả hai nhóm `so_lenh = 0` và `ty_le_thang = null`. **Nhóm dưới 3 lệnh đã đóng vẫn trả `ty_le_thang` là một số** (ví dụ `50.0` với 1/2) nhưng `du_du_lieu = false` → FE **không được** vẽ con số đó thành kết luận. Nhóm 0 lệnh → `ty_le_thang = null`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap6/thach-thuc' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 92c7b0e5-1d64-4f38-a5b7-40e6c85917d3'
~~~

**Ghi chú khi viết lại**

- ★★ **BẪY NULL→0 quan trọng nhất của chương**: `doi_chieu_giup_ich.gia_tri_hien_tai` và `.muc_tieu` **KHÔNG nullable** (schema đòi `number`), nên service ép `null → 0.0` đúng ở hai chỗ đó. Con số ấy **chỉ có nghĩa khi `du_du_lieu === true`**. FE phải đọc `du_du_lieu` trước. Tỷ lệ nullable **thật** nằm ở `nhom_khop.ty_le_thang` / `nhom_lech.ty_le_thang`.
- ★ `muc_tieu` của chân ba **KHÔNG phải hằng số** — nó là `ty_le_thang_lech` (mục tiêu động: "thắng ≥ nhóm lệch"). Hai chân đầu mới có `muc_tieu` hằng (`15.0`, `3.0`).
- ★ **Hoà tính là ĐẠT**: `nhom_khop.ty_le_thang >= nhom_lech.ty_le_thang`. Dùng `>=`, không `>`.
- `du_du_lieu` của hai chân đầu **hard-code `True`** trong service — hai chỉ số đó luôn đo được. Giữ nguyên (đừng suy ra động).
- `gia_tri_hien_tai` hai chân đầu là **`float`** (`11.0`, `3.0`) dù đếm số nguyên. Y như Cấp 5.
- `giai_thich` chân hai **nội suy danh sách tên kiểu**, sắp theo `sorted(kieu_da_gap)` — tức **thứ tự alphabet của KHOÁ** (`bat_dong_san` < `ngan_hang` < `tang_truong`) rồi mới map sang nhãn → nhãn hiện ra **không** theo alphabet tiếng Việt. Ví dụ trên: `Bất động sản, Ngân hàng, Tăng trưởng / công nghệ`. Giữ nguyên cách sắp. Danh sách rỗng → **bỏ hẳn** phần trong ngoặc (không in `()`).
- `giai_thich` chân ba có **3 nhánh** (chưa đủ dữ liệu / khớp ≥ lệch / khớp < lệch). Nhánh thứ ba có câu *"Với bạn, gợi ý theo kiểu chưa đúng — cách bạn tự chọn lớp đang cho kết quả tốt hơn; xem khối ⑭ để tìm mẫu riêng của bạn."* — **trung thực, không bảo vệ gợi ý của hệ**. Test `test_win_rate_comparison_reports_khop_below_lech_honestly`.
- `giai_thich` mỗi nhóm có **3 nhánh** (`so_lenh == 0` / `< 3` / `>= 3`, nhánh cuối tách riêng cho khớp và lệch → tổng 4 chuỗi). Nhánh lệch có câu *"Lệch gợi ý KHÔNG bị tính là kém; đó chỉ là nhóm thứ hai để so, và trọng tài là kết quả thật."* Format %: `{:.0f}` (làm tròn 0 thập phân) trong câu, nhưng field `ty_le_thang` giữ full precision.
- Lệnh có `khop_goi_y = null` **không vào nhóm nào** — nên `nhom_khop.so_lenh + nhom_lech.so_lenh` có thể **nhỏ hơn** tổng số cặp đã đóng. Đây không phải bug.
- `dat_ca_3` tính từ metrics vừa recompute, **không** đọc `task_3_done_at`.

---

### POST /api/v1/cap6/graduate

> **Tốt nghiệp Cấp 6** — dập `graduated_at` khi và chỉ khi đủ 3/3 nhiệm vụ, sau khi tính lại toàn bộ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định (60/phút) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (tính lại toàn bộ) |
| **Side-effect** | recompute; UPDATE `cap6_progress` SET `graduated_at`, `time_to_graduate_hours` — **chỉ lần đầu**. ★ **KHÔNG** tạo hàng Cấp 7, **KHÔNG** gửi email / Telegram, **KHÔNG** ghi audit log |

**Path params** — —

**Query params** — —

**Request body** — Không có body.

**Response 200** — `Cap6ProgressOut`.

~~~json
{
  "id": "8b4e17f0-92c5-4d63-a018-5f7c3e29b746",
  "user_id": "a1c93e07-6b28-4f5d-8e91-2d47b6c03fa8",
  "entered_at": "2026-08-06T01:33:20.884517+00:00",
  "task_1_done_at": "2026-08-07T04:19:55.203841+00:00",
  "task_2_done_at": "2026-08-12T08:40:11.762094+00:00",
  "task_3_done_at": "2026-08-17T06:11:37.428106+00:00",
  "so_lenh_doi_chieu": 16,
  "so_kieu_da_gap": 4,
  "ty_le_thang_khop": 66.66666666666666,
  "ty_le_thang_lech": 50.0,
  "graduated_at": "2026-08-17T06:11:37.489233+00:00",
  "time_to_graduate_hours": 268.6379457777778
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 404 | `NOT_FOUND` | Chưa vào Cấp 6 | `Không tìm thấy tiến trình Cấp 6` |
| 409 | `CONFLICT` | Thiếu bất kỳ nhiệm vụ nào trong 3 (sau khi đã recompute) | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 6` |
| 401 | `UNAUTHORIZED` | Thiếu / sai Bearer | `Thông tin xác thực không hợp lệ` |

★ `409` **không nói thiếu cái gì** — FE gọi `GET /cap6/thach-thuc` để hiện chi tiết.

**Fallback / suy giảm** — Không phụ thuộc provider ngoài → không suy giảm theo nguồn. Suy giảm theo dữ liệu: chân ③ cần **cả hai** nhóm ≥3 lệnh đã đóng; một user có 20 lệnh đối chiếu mà **toàn bộ đều khớp gợi ý** (nhóm lệch = 0 lệnh) sẽ **không bao giờ** qua chân ③ → 409 vĩnh viễn cho tới khi có ≥3 lệnh lệch đã đóng. Đây là hệ quả có ý thức của luật "không kết luận trên 1-2 lệnh", **không phải bug**.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap6/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 1e46d80b-52c7-4f93-a6d1-b90e37c485f2'
~~~

**Ghi chú khi viết lại**

- ★★ **THỨ TỰ BẮT BUỘC**: `_require_progress` → **`_recompute_progress`** → kiểm 3/3 → ghi. Giống Cấp 5, cùng lý do chống gian lận.
- **IDEMPOTENT**: gọi lần 2 → 200, `graduated_at` giữ nguyên lần đầu, `time_to_graduate_hours` không tính lại.
- `time_to_graduate_hours` đơn vị **GIỜ**, `float`, `entered_at` naive được `replace(tzinfo=UTC)` trước khi trừ.
- **KHÔNG cascade sang Cấp 7.** FE phải gọi `POST /cap7/enter` riêng.
- Không ghi huy hiệu ở endpoint này. **CHƯA XÁC ĐỊNH**: nơi cấp huy hiệu Cấp 6 — không có mã nào trong `cap6.py` / `services/cap6/service.py` làm việc đó.
- ★ **Điểm khác biệt so với Cấp 5 về khả năng tốt nghiệp**: chân ③ Cấp 6 phụ thuộc **kết quả thị trường** (% thắng hai nhóm), còn cả 3 chân Cấp 5 chỉ phụ thuộc hành vi của user. Nghĩa là Cấp 6 có thể **không tốt nghiệp được vì thị trường**, và bản viết lại **không được** "sửa" điều đó thành pass mặc định.

---

## Ghi chú tổng hợp khi viết lại

1. **18 endpoint, 10 Cấp 5 + 8 Cấp 6.** Không cấp nào có bộ endpoint giống cấp khác: Cấp 5 có `ketso` mà **không** có `kehoach`; Cấp 6 có `kehoach` (2 endpoint: POST + GET theo id) mà **không** có `ketso`. Xem §4.

2. **Mọi endpoint (kể cả GET) đều ghi DB, trừ 3 ngoại lệ**: `GET /cap5/verdict/{order_id}`, `GET /cap6/goi-y`, `GET /cap6/kehoach/{order_id}`. Ba cái đó phải **thuần đọc**. 15 cái còn lại phải nằm trong transaction ghi + commit.

3. **`POST /cap5/enter` KHÔNG recompute ở nhánh idempotent; `POST /cap6/enter` CÓ.** Đừng "đồng bộ hoá" hai cái này.

4. **`PATCH /capN/task` KHÔNG BAO GIỜ đặt `task_N_done_at` theo `task_no`.** Nó chỉ validate `task_no ∈ {1,2,3}` (400 nếu sai) rồi chạy recompute. Implement thành `UPDATE … SET task_{n}_done_at = now()` là mở lại lỗ hổng gian lận tốt nghiệp.

5. **`graduate` phải recompute TRƯỚC khi kiểm 3/3**, và idempotent (`graduated_at` giữ giá trị lần đầu). Xem §13B.

6. **Client không bao giờ được tin cho các field suy diễn**: `verdict_he`, `o_4`, `trong_so_goi_y`, `khop_goi_y`, `kieu_co_phieu` (khi server suy được), `lop_mau_thuan` (khi có `doc_5_lop`), `gia_luc_dung_ngoai`, `ket_qua`, và mọi bộ đếm. Xem §13A cho bảng đầy đủ đường tấn công + chốt.

7. **FREEZE của Cấp 6** (`POST /cap6/kehoach` khi lệnh đã `FILLED`) là khoá chống gian lận riêng của chương này — post lại y nguyên = no-op, khác đi = 409. Còn `POST /cap5/ketso` thì **cho ghi đè tự do** (và vẫn an toàn vì mọi thứ suy lại). Hai luật ngược nhau, đừng nhầm.

8. **NULL ≠ 0.** `ty_le_thang_khop` / `ty_le_thang_lech` / `NhomDoiChieu.ty_le_thang` / `VerdictSignal.dat` / `khop_goi_y` / `standby_decision.ket_qua` / `gia_sau_5_phien` / `pct_thay_doi` đều nullable với nghĩa "CHƯA BIẾT". Migration `7b3c1e5a9d24` tồn tại **chỉ để sửa đúng bug này** — bản viết lại phải tạo cột nullable **ngay từ đầu**. Trong code: **không dùng `or`/`??` để đổi `null` thành `0`**. Ngoại lệ duy nhất được phép: hai field `gia_tri_hien_tai`/`muc_tieu` của `doi_chieu_giup_ich`, và ở đó **phải** kèm `du_du_lieu`.

9. **`ty_le_quyet_dinh_dung` (Cấp 5) là NOT NULL DEFAULT 0** — **khác** hai tỷ lệ của Cấp 6. Đừng làm nullable cho "nhất quán"; đó là hành vi hiện tại.

10. **Ngưỡng, thuộc lòng:** Cấp 5 → 20 lệnh phân loại · 5 lần đứng ngoài đã chấm · 70% quyết định đúng · 5 phiên chấm · né đúng ≤ +2% · né hụt ≥ +5% · ẩn thống kê dưới 3 lần đã chấm · dung sai khẩu vị 0.5 điểm phần trăm · đồng thuận ≥ 3/5 lớp. Cấp 6 → 15 lệnh đối chiếu · 3 kiểu · mỗi nhóm ≥ 3 lệnh đã đóng · trần khẩu vị 10/20/30%.

11. **Biên là ĐƯỢC TÍNH VÀO** ở khắp nơi: `pct <= 2.0` → né đúng; `pct >= 5.0` → né hụt; `so_lop_dong_thuan >= 3`; `so_lenh >= 3`; `ty_le_khop >= ty_le_lech`; `pct_von <= tran + 0.5`. Nhưng **`pnl_pct > 0`** cho "thắng" — đi ngang là **thua** (`>=` là sai).

12. **Đơn vị:** giá **VND nguyên** (`61500`, không `61.5`); `pnl_pct` / `pct_von` / `ty_le_*` / `pct_thay_doi` là **phần trăm** (`75.0` = 75%, không `0.75`); `time_to_graduate_hours` là **giờ**; `so_phien_cham` là **phiên giao dịch**, không phải ngày lịch.

13. **Múi giờ:** mọi timestamp ghi bằng `now(UTC)`; nhưng **`han_cham_date` và `da_toi_han` tính theo ngày lịch Việt Nam** (`UTC+7`, hằng số cứng `_VN_TZ`, không đọc từ config). Trộn hai cái này làm lệch hạn chấm một ngày.

14. **Sắp xếp:** `standby_decision` → `decided_at DESC` (mới nhất trước). `_doi_chieu_rows` → `VirtualOrder.created_at ASC`. `_closed_pairs` → buys `created_at ASC` (giữ **match cuối cùng** = gần nhất), ketso `closed_at ASC`. `lop_mau_thuan.*` → thứ tự chuẩn `LOP_KEYS`. `so_kieu_da_gap` trong `giai_thich` → alphabet của **khoá**, không của nhãn.

15. **Ghép lệnh BÁN ↔ MUA phải sao y luật Cấp 1**: lệnh MUA `FILLED` gần nhất cùng `account_id` + `symbol`, `created_at <= sell.created_at`. Cấp 5 làm bằng 1 truy vấn `ORDER BY DESC LIMIT 1`; Cấp 6 làm bằng vòng lặp Python giữ match cuối. Hai cách, **cùng một kết quả** — giữ kết quả, không cần giữ cách.

16. **Mọi truy vấn đếm lọc `VirtualOrder.mode == "thuc_chien"`** (§5). Không lọc `entered_at` (§15). Cả hai đều cố ý.

17. **Lệnh của người khác → 404, KHÔNG 403**, ở cả 4 endpoint nhận `order_id`.

18. **Hai lớp lỗi cho cùng một field.** Pydantic khai `str`/`int` rồi service validate enum → sai giá trị cho **400** (`ErrorEnvelope`), sai kiểu cho **422** (`HTTPValidationError`). Body hai vỏ khác nhau. Danh sách 400-do-service: `verdict_user`, `reason`, `symbol` rỗng, `lop_quyet_dinh`, `kieu_co_phieu`, `task_no`, `ly_do_sua` rỗng-nhưng-gửi. Danh sách 422-do-service: `ly_do_sua` thiếu khi override (Cấp 5), `ly_do_doi_chieu` rỗng (Cấp 6).

19. **`giai_thich` là hợp đồng API, không phải trang trí** (§C12c: không bao giờ hiện số/verdict/gợi ý trơ). Tổng cộng phải copy nguyên văn: 2 câu verdict, 4 câu tín hiệu × các nhánh, 5 nhánh `giai_thich` của `DungNgoaiItem`, 1 câu luật chấm đứng ngoài, 3 câu chân Thách thức Cấp 5, 3 nhánh chân ③ Cấp 6, 4 chuỗi nhóm khớp/lệch, 4 nhánh `giai_thich` của `GET /cap6/kehoach/{id}`, câu "chưa phân loại", câu `COPY_CHUA_DOI_CHIEU`, và câu 409 của FREEZE. Format số trong các câu này: `{:.0f}` cho %, `{:,.0f}đ` cho giá, `DD/MM/YYYY` cho ngày, `{:.1f}` cho `pct_thay_doi`.

20. **Từ vựng trung tính là bắt buộc.** «Lệch gợi ý» **KHÔNG BAO GIỜ** được gọi là "sai" hay "kém" ở bất kỳ nhãn, câu, hay tên field nào — `KHOP_GOI_Y_LABELS` chỉ có `"Khớp gợi ý"` / `"Lệch gợi ý"`. Tương tự, `trung_tinh` của đứng-ngoài **không** tính đúng cũng **không** tính hụt, và câu *"Đứng ngoài nhiều hơn KHÔNG phải là tốt hơn"* phải còn nguyên.

21. **Kiểm tra lúc khởi động**: `_assert_lop_keys()` (`app/models/cap6.py`) chạy khi import và `raise` nếu bảng trọng số nhắc lớp lạ / một lớp vừa ưu tiên vừa ít tin / thiếu bảng cho một trong 6 kiểu. **Phải giữ** — nó là cái chặn bảng trọng số trôi khỏi từ vựng Cấp 4.

22. **`_norm_nganh` phải copy chính xác** (NFKD → bỏ combining → `đ→d`/`Đ→D` → gom whitespace → lower). Sai bước nào cũng làm toàn bộ mã tuột thành "chưa phân loại". `đ` **không** bị NFKD tách nên phải thay tay.

23. **`dau_co_nho` chỉ tới được qua nhánh client fallback**; `icb_lv1 = "Tài chính"` **cố ý không map**. Đừng "hoàn thiện" bảng map.

24. **Fail closed vs fail soft, phân biệt rõ**: `POST /cap5/dung-ngoai` **fail closed** (503, không ghi) khi không lấy được giá; nhánh **chấm** (`_score_due_decisions`, `_fetch_close_vnd`) **fail soft** (để chưa chấm, không đoán); nhánh **tra ngành** (`_nganh_of`) **fail soft** (→ "chưa phân loại"). Ba hành vi khác nhau cho ba tình huống provider lỗi.

25. **`CAP_MAX_ENABLED = 3`, chỉ tồn tại ở FE** (`dashboard/src/features/cap1/capFlags.ts`). Backend không có cổng cấp → `POST /cap5/enter` và `POST /cap6/enter` **vẫn 200** và tạo hàng thật. Toàn bộ 18 endpoint chương này **hiện chưa được FE gọi**, nhưng vẫn phải implement đủ. Xem §3.

26. **Không có cron/scheduler, không có cache Redis riêng, không có webhook, không có email/Telegram, không có audit log** cho cả hai cấp. Cache duy nhất dính vào là của provider giá (`ta:ohlcv:{SYMBOL}:{start}:{end}`, TTL 1800s) trong nhánh chấm đứng-ngoài.

27. **Tên schema trùng nhau giữa các cấp** (`TaskRequest`, `ThachThucDieuKien`, `ThachThucOut`, `KehoachRequest`) → OpenAPI phân biệt bằng tiền tố module. TypeScript **phải** đặt tên riêng theo cấp.
