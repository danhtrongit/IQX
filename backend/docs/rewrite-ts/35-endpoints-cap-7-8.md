# Endpoint — Đấu trường Cấp 7, 8

Chương này đặc tả **16 endpoint** của hai cấp CUỐI chương trình «Đấu trường»: Cấp 7 «Đọc sổ lệnh» (9 endpoint — chỉ số Lực từ sổ dư 3 mức, cờ cảnh giác lệnh treo lớn, chấm «đọc lực đúng» bằng giá thật) và Cấp 8 «Quản trị rủi ro danh mục» (7 endpoint — dồn ngành · tương quan · tổng vốn ở rủi ro, và là cấp CAO NHẤT hiện có).

**Cả hai cấp đều CÓ `kehoach` nhưng KHÔNG CÓ `ketso`** — đã đối chiếu bản cắt OpenAPI: trong 16 operation không có `/cap7/ketso` hay `/cap8/ketso`. Dữ liệu kết sổ của cả hai cấp đến từ `POST /api/v1/cap1/ketso` (+ `POST /api/v1/cap2/ketso`); Cấp 7 bù lại bằng `GET /cap7/kehoach/{order_id}` để màn Kết sổ đọc lại khối Cấp 7 của MỘT lệnh, Cấp 8 không có endpoint đọc-lại riêng (khối Cấp 8 hiện trong payload Kết sổ Cấp 1).

Nguồn: `app/api/v1/endpoints/cap7.py`, `cap8.py`; `app/schemas/cap7.py`, `cap8.py`; `app/services/cap7/service.py`, `cap8/service.py`; `app/models/cap7.py`, `cap8.py`; `app/models/cap1.py` (bảng dùng chung `order_kehoach` / `order_ketso`); `tests/test_cap7.py`, `tests/test_cap8.py`.

---

## Bảng tra nhanh

| Method | Path | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/v1/cap7/progress` | Bearer | Tiến độ Cấp 7 (hoặc `null` nếu chưa vào) — **chấm lười + ghi DB** mỗi lần gọi |
| POST | `/api/v1/cap7/enter` | Bearer | Vào Cấp 7 (idempotent) — bắt buộc đã tốt nghiệp Cấp 6 |
| PATCH | `/api/v1/cap7/task` | Bearer | Kích hoạt tính lại 3 nhiệm vụ (KHÔNG tự đặt xong nhiệm vụ) |
| GET | `/api/v1/cap7/phien` | Bearer | Đang trong giờ giao dịch? + TOÀN BỘ hằng số khối đọc sổ lệnh (`quy_tac`) |
| POST | `/api/v1/cap7/kehoach` | Bearer | Ghi bước «đọc lực» vào kế hoạch Cấp 1 của một lệnh MUA (có **time-lock**) |
| GET | `/api/v1/cap7/kehoach/{order_id}` | Bearer | Đọc lại khối Cấp 7 của MỘT lệnh cho màn Kết sổ (chạy luôn vòng chấm) |
| POST | `/api/v1/cap7/cham` | Bearer | **HỆ** chấm «đọc lực đúng» cho các lệnh đã tới hạn (idempotent) |
| GET | `/api/v1/cap7/thach-thuc` | Bearer | 3 điều kiện Thách thức Đọc sổ lệnh + giá trị hiện tại + giải thích |
| POST | `/api/v1/cap7/graduate` | Bearer | Tốt nghiệp Cấp 7 — chỉ khi đủ 3/3 nhiệm vụ |
| GET | `/api/v1/cap8/progress` | Bearer | Tiến độ Cấp 8 (hoặc `null`) — **KHÔNG** định giá lại danh mục |
| POST | `/api/v1/cap8/enter` | Bearer | Vào Cấp 8 (idempotent) — bắt buộc đã tốt nghiệp Cấp 7 |
| PATCH | `/api/v1/cap8/task` | Bearer | Kích hoạt tính lại 3 nhiệm vụ (KHÔNG tự đặt xong nhiệm vụ) |
| GET | `/api/v1/cap8/kiem-tra` | Bearer | Bước «Kiểm tra danh mục» trước xác nhận MUA — 3 thước đo trong 1 response |
| POST | `/api/v1/cap8/kehoach` | Bearer | Ghi khối «Kiểm tra danh mục» vào kế hoạch Cấp 1 (**ghi một lần**) |
| GET | `/api/v1/cap8/thach-thuc` | Bearer | 3 điều kiện Thách thức + khối ⑱ «Bản đồ rủi ro danh mục» |
| POST | `/api/v1/cap8/graduate` | Bearer | Tốt nghiệp Cấp 8 — cấp CUỐI, không có cấp sau để vào |

**Không endpoint nào của hai cấp này yêu cầu Premium** — cả 16 đều dùng `CurrentUser` (docstring đầu file: *"Cấp 7 is FREE"*, *"Cấp 8 is FREE"*). Nhưng xem mục «Thực chiến vs sân tập»: FREE **về HTTP** không có nghĩa FREE **về tiến độ**.

---

## Kiểu dữ liệu dùng chung

~~~ts
/** Cấp 7 — user tự đọc sổ lệnh (enum `LucDocUser`, app/models/cap7.py).
 *  Hệ KHÔNG bao giờ tự chọn giá trị này. */
type LucDocUser = "manh" | "can" | "yeu";
const LUC_DOC_LABELS: Record<LucDocUser, string> = {
  manh: "Cầu mạnh", can: "Cân bằng", yeu: "Cầu yếu",
};

/** Cấp 7 — band của chỉ số Lực (enum `BandLuc`). DERIVED từ `luc_chi_so`,
 *  KHÔNG lưu cột nào. */
type BandLuc = "cau_ap_dao" | "can_bang" | "cung_ap_dao";
const BAND_LUC_LABELS: Record<BandLuc, string> = {
  cau_ap_dao: "Cầu áp đảo", can_bang: "Cân bằng", cung_ap_dao: "Cung áp đảo",
};

/** Cấp 7 — user làm gì khi cờ cảnh giác hiện (enum `HanhViCo`).
 *  `mua_duoi_theo` KHÔNG bị phạt — chỉ không được đếm vào ô kỷ luật. */
type HanhViCo = "cho_xac_nhan" | "mua_duoi_theo";
const HANH_VI_CO_LABELS: Record<HanhViCo, string> = {
  cho_xac_nhan: "Chờ xác nhận (chờ khớp thật)",
  mua_duoi_theo: "Mua đuổi vào lệnh treo lớn",
};

/** Cấp 8 — 3 loại cảnh báo (enum `LoaiCanhBao`). Nằm trong JSON list
 *  `order_kehoach.danh_muc_canh_bao`, một lệnh có thể mang bất kỳ tổ hợp. */
type LoaiCanhBao = "don_nganh" | "tuong_quan" | "tong_rui_ro";
const LOAI_CANH_BAO_LABELS: Record<LoaiCanhBao, string> = {
  don_nganh: "Dồn ngành",
  tuong_quan: "Tương quan cao",
  tong_rui_ro: "Tổng vốn ở rủi ro vượt trần khẩu vị",
};

/** Cấp 8 — user làm gì ở bước Kiểm tra danh mục (enum `HanhViCanhBao`).
 *  `van_mua` KHÔNG là vi phạm; `khong_canh_bao` = đã kiểm tra và KHÔNG có
 *  cảnh báo nào (khác với NULL = lệnh chưa qua bước kiểm tra). */
type HanhViCanhBao = "van_mua" | "giam_kl" | "chon_ma_khac" | "khong_canh_bao";
const HANH_VI_CANH_BAO_LABELS: Record<HanhViCanhBao, string> = {
  van_mua: "Vẫn mua", giam_kl: "Giảm khối lượng",
  chon_ma_khac: "Chọn mã khác", khong_canh_bao: "Không có cảnh báo",
};

/** Khẩu vị rủi ro đặt ở Cấp 3 (`Cap3Progress.khau_vi`) — Cấp 8 MƯỢN trần này
 *  làm trần cho CẢ danh mục (xem «Hai nghĩa của trần khẩu vị»). */
type KhauVi = "than_trong" | "can_bang" | "tan_cong";
const KHAU_VI_TRAN_PCT: Record<KhauVi, number> = {
  than_trong: 10.0, can_bang: 20.0, tan_cong: 30.0,
};
const KHAU_VI_LABELS: Record<KhauVi, string> = {
  than_trong: "Thận trọng", can_bang: "Cân bằng", tan_cong: "Tấn công",
};

/** Một điều kiện con của nhiệm vụ ③ — DÙNG CHUNG cho cả 2 cấp
 *  (`ThachThucDieuKien` trong app/schemas/cap7.py và cap8.py, cùng shape).
 *  `du_du_lieu = false` = CHƯA CHẤM ĐƯỢC: không tính đạt, cũng không tính
 *  ngược lại cho user. `dat` khi đó luôn false — ĐỪNG hiểu là "không đạt". */
interface ThachThucDieuKien {
  ten: string;
  gia_tri_hien_tai: number;
  muc_tieu: number;
  dat: boolean;
  du_du_lieu: boolean;   // default true
  giai_thich: string;    // §C12c — hiện NGUYÊN VĂN
}

/** Cấp 7 — một band trong `quy_tac.bands`. */
interface BandOut {
  ma: BandLuc;
  ten: string;
  dieu_kien_text: string;  // vd "Lực ≥ 1.50 : 1"
  giai_thich: string;
}

/** Cấp 7 — toàn bộ hằng số server công bố (`QuyTacOut` trong schemas/cap7.py).
 *  FE PHẢI render đúng các số này, KHÔNG tự đặt ngưỡng. */
interface QuyTacCap7 {
  nguong_cau_ap_dao: number;    // 1.5
  nguong_cung_ap_dao: number;   // 1/1.5 = 0.6666666666666666
  bands: BandOut[];             // luôn đúng 3 phần tử, thứ tự enum BandLuc
  co_canh_giac_he_so: number;   // 3.0
  co_canh_giac_min_muc: number; // 3
  co_canh_giac_copy: string;
  so_phien_cham: number;        // 2
  dead_band_pct: number;        // 1.0
  cham_giai_thich: string;
}

/** Cấp 8 — toàn bộ hằng số server công bố (`QuyTacOut` trong schemas/cap8.py). */
interface QuyTacCap8 {
  nguong_don_nganh_pct: number;        // 40.0
  nguong_tuong_quan: number;           // 0.7
  tuong_quan_min_ty_trong_pct: number; // 5.0
  tuong_quan_min_phien: number;        // 60
  so_phien_lich_su: number;            // 120 (= RISK_LOOKBACK_DAYS)
  khau_vi_tran_pct: Record<string, number>; // {than_trong:10, can_bang:20, tan_cong:30}
  cua_so_bat_chap: number;             // 15
  bat_chap_toi_da: number;             // 2
  so_lenh_kiem_tra_min: number;        // 15
  cross_ref_pm: string;
}

/** Cấp 8 — đối tác tương quan cao nhất. `null` ở chỗ nào cũng nghĩa là
 *  "CHƯA TÍNH ĐƯỢC", TUYỆT ĐỐI không phải "hệ số = 0". */
interface TuongQuanOut { symbol: string; he_so: number; }

/** Cấp 8 — một cảnh báo THẬT SỰ đã bật. */
interface CanhBaoOut { ma: LoaiCanhBao; ten: string; text: string; }

/** Vỏ lỗi chuẩn toàn app (handler cho AppException trong app/main.py). */
interface ErrorEnvelope {
  detail: string;
  code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN"
      | "UNPROCESSABLE_ENTITY" | "SERVICE_UNAVAILABLE" | null;
  errors?: Array<Record<string, unknown>> | null;
}
~~~

---

## Nghiệp vụ nền

#### Vị trí trong mạch 0 → 8 và `CAP_MAX_ENABLED`

- **Backend KHÔNG có `CAP_MAX_ENABLED`.** Đã grep toàn bộ `app/`: không khớp. Backend chỉ kiểm tra **tiên quyết theo chuỗi**: vào Cấp 7 cần `cap6_progress.graduated_at IS NOT NULL`; vào Cấp 8 cần `cap7_progress.graduated_at IS NOT NULL`.
- Trần cấp là **cờ FRONTEND**: `CAP_MAX_ENABLED` trong `/Users/danhtrongit/Projects/IQX/dashboard/src/features/cap1/capFlags.ts`, **giá trị HIỆN TẠI = `3`**. Nghĩa là hôm nay FE không render nhánh Cấp 7/8 và không bắn `GET /cap7/progress` / `POST /cap7/enter`.
- **Hành vi khi gọi cấp “chưa mở”**: server vẫn phục vụ bình thường — không có 403 “cấp chưa mở”. `GET /capN/progress` trả `null`; `POST /capN/enter` tạo thật hàng progress nếu tiên quyết đủ, hoặc 404/409 theo tiên quyết. Khi viết lại bằng NestJS: **giữ nguyên** thiết kế này (trần cấp là chuyện của client), và nếu muốn thêm cổng server thì phải là quyết định mới, có tài liệu riêng.

#### Thực chiến vs sân tập — FREE về HTTP, KHÔNG free về tiến độ

- Cả hai cấp là **Thực chiến-only**: mọi truy vấn đếm chỉ lấy hàng có `VirtualOrder.mode == "thuc_chien"` (`_doc_luc_rows`, `_kiem_tra_rows`, `_closed_pairs`).
- `VirtualTradingService.place_order` gắn `mode = "thuc_chien" if is_premium else "san_tap"` (fail-closed, mặc định `False`). ⇒ **User FREE (không Premium) không bao giờ sinh được lệnh `thuc_chien`**, nên mọi chỉ số Cấp 7/8 đứng ở 0 và không thể xong nhiệm vụ ①②③, dù endpoint không chặn 403.
- Cấp 0 là cấp duy nhất chạy trên `san_tap`; Cấp 1-8 đọc `thuc_chien`.
- Lệnh của Cấp 7/8 luôn là **lệnh MUA** (`side != BUY` → 400).

#### Bảng dùng chung `order_kehoach` (Cấp 1) — hai cấp chỉ THÊM cột

Cấp 7 thêm 6 cột: `luc_chi_so` `Numeric(18,6)` · `luc_doc_user` `String` · `doc_luc_dung` `Boolean` · `dien_bien_pct` · `co_canh_giac_lenh_gia` `Boolean` · `hanh_vi_co` `String`.
Cấp 8 thêm 5 cột: `don_nganh_pct` `Numeric(9,4)` · `tuong_quan_cao_voi` `JSON` · `tong_rui_ro_pct` `Numeric(9,4)` · `danh_muc_canh_bao` `JSON list` · `hanh_vi_canh_bao` `String`.
**Tất cả nullable.** Cả hai cấp 404 `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` nếu lệnh chưa có hàng `order_kehoach` (phải gọi `POST /cap1/kehoach` trước).

#### Cấp 7 — chỉ số Lực: dữ liệu nào, công thức, thang giá trị

| Hạng mục | Sự thật trong source |
|---|---|
| **Dữ liệu vào** | **Sổ lệnh bậc giá (bid/ask ladder) realtime, 3 mức** — KHÔNG phải bảng cung/cầu tổng hợp, KHÔNG phải khối lượng khớp. |
| **Công thức** | `luc_chi_so = tổng dư MUA (3 mức) / tổng dư BÁN (3 mức)` tại đúng thời điểm user bấm MUA. |
| **Ai tính** | **CLIENT tính, server nhận và tin** (HONESTY NOTE 1). Server không giữ snapshot ladder theo tick nên **không thể suy lại** — tài liệu ghi thẳng, không giả vờ có kiểm tra. |
| **Thang giá trị** | Tỷ số dương, không chặn trên. `≥ 1.5` → `cau_ap_dao`; `≤ 0.6666…` (nghịch đảo của 1.5, chọn đối xứng để gauge không nghiêng bull) → `cung_ap_dao`; ở giữa → `can_bang`. |
| **Giá trị KHÔNG đọc được** | `null`, không hữu hạn (`Infinity`/`NaN`), hoặc `≤ 0` ⇒ `band_luc()` trả `null` (“sổ lệnh quá mỏng để đọc”), TUYỆT ĐỐI không bịa band. Ở `POST /cap7/kehoach` các giá trị đó bị **400**. |
| **Ví dụ spec §4** | `1 240 000 / 640 000 ≈ 1.94` → `cau_ap_dao`. |

**Cờ cảnh giác lệnh treo lớn** (`co_canh_giac()`, thuần hàm): tính trên **bid + ask gộp lại**. Một mức có khối lượng `> CO_CANH_GIAC_HE_SO (= 3.0) × trung bình các mức CÒN LẠI` ⇒ cờ, và chỉ mức lớn nhất mới có thể bật. **Im lặng** (trả `null`, không đoán) khi: số mức `< CO_CANH_GIAC_MIN_MUC (= 3)`, hoặc trung bình các mức còn lại `≤ 0`. Copy `COPY_CO_CANH_GIAC` là **heuristic, không phải phát hiện lệnh giả** — có test `test_api_copy_never_claims_fake_order_detection` quét mọi chuỗi API; khi viết lại, **không được** thêm câu nào nói IQX “phát hiện lệnh giả”.

**Chấm «đọc lực đúng»** (`doc_luc_dung_rule`): `SO_PHIEN_CHAM_LUC = 2` phiên giao dịch sau ngày mua, lấy **giá đóng cửa điều chỉnh THẬT** so với `filled_price_vnd`:
`dien_bien_pct = (gia_sau − gia_mua) / gia_mua × 100`. Dead band `NGUONG_DEAD_BAND_PCT = 1.0` điểm %:
`manh` đúng ⇔ `pct > 1.0` · `yeu` đúng ⇔ `pct < −1.0` · `can` đúng ⇔ `|pct| ≤ 1.0` (biên INCLUSIVE cho `can`, exclusive cho hai vế kia ⇒ ba phán quyết vừa loại trừ nhau vừa phủ hết trục số).
Hạn chấm: `han_cham_luc_date(trading_date) = add_trading_days(trading_date, 2, set())` — **chỉ biết Thứ 2-6, KHÔNG có lịch nghỉ lễ**; bù lại `_fetch_close_vnd` khoan dung ngày lễ (nếu lịch sử chạy VƯỢT ngày tới hạn thì dùng bar cuối trong khoảng, còn không thì để trống). Ví dụ: mua Thứ Hai `2026-08-17` → hạn chấm Thứ Tư `2026-08-19`.

#### Cấp 7 — NHIỆM VỤ

| Mã task | Tên hiển thị (nghĩa) | Điều kiện hoàn thành (server) | Ai đặt |
|---|---|---|---|
| `task_1_done_at` | ① Lệnh đầu có ghi đọc lực | `so_lenh_doc_luc >= 1` | **Tự động** theo hành vi giao dịch (đếm hàng `order_kehoach.luc_doc_user IS NOT NULL`) |
| `task_2_done_at` | ② Kết sổ đầu Cấp 7 | `so_lenh_da_ket_so >= 1` — có ≥1 vòng mua-bán ĐÃ ĐÓNG mà lệnh MUA mang đọc lực | **Tự động** (ghép `order_ketso` với BUY FILLED gần nhất cùng account+symbol, `created_at <= sell.created_at`) |
| `task_3_done_at` | ③ Thách thức Đọc sổ lệnh | đủ **cả 3** vế (bảng dưới) | **Tự động** |

`PATCH /cap7/task` **không** đặt nhiệm vụ — chỉ kích hoạt `_recompute_progress`. Đã stamp thì **không bao giờ** bị xoá (kể cả khi chỉ số tụt xuống dưới ngưỡng).

#### Cấp 7 — ĐIỀU KIỆN TỐT NGHIỆP

| Vế | Ngưỡng | Hằng số | Ghi chú |
|---|---|---|---|
| ① Số lệnh đã đọc lực | `so_lenh_doc_luc >= 15` | `_TASK3_SO_LENH_MIN = 15` | Đếm lệnh THẬT |
| ② Không đuổi theo cờ | `so_lan_khong_duoi_theo_co >= 3` | `_TASK3_KHONG_DUOI_THEO_MIN = 3` | = số hàng có cờ VÀ `hanh_vi_co == "cho_xac_nhan"` |
| ③ Tỷ lệ đọc lực đúng | `ty_le_doc_luc_dung >= 55.0` **VÀ** `so_lenh_da_cham >= 3` | `_TASK3_TY_LE_MIN = 55.0`, `MIN_DA_CHAM_THONG_KE = 3` | Dưới 3 lệnh đã chấm ⇒ `du_du_lieu = false`, `dat = false` (chưa đủ dữ liệu, KHÔNG phải “không đạt”) |

`POST /cap7/graduate` khi thiếu: **409 `CONFLICT`**, detail nguyên văn `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 7`. Chưa vào cấp: **404** `Không tìm thấy tiến trình Cấp 7`.

#### Cấp 7 — KHOÁ CHỐNG GIAN LẬN (đọc kỹ: đã từng có lỗ hổng “graduation fraud”)

Server **không tin client** và **tính lại mọi điều kiện** trong chính transaction của request (`_recompute_progress` chạy trước khi so điều kiện ở `graduate`). Cụ thể:

1. **TIME-LOCK ở `POST /cap7/kehoach`** — nếu `han_cham_luc_date(order.trading_date) <= hôm_nay_VN` thì **MỌI** lần ghi bị **409**, kể cả **lần ghi ĐẦU TIÊN**, không chỉ ghi đè. Lý do: bỏ qua bước đọc lực là hợp lệ (mềm), nên khoá chỉ chặn ghi-đè sẽ để hở đúng đường gian lận: đặt lệnh → chờ hết cửa sổ → xem giá đã đi đâu → ghi «đoán» khớp kết quả. Post lại **y hệt** (so `luc_chi_so` với `abs_tol = 1e-6`, cùng `luc_doc_user`/cờ/hành vi) là **no-op 200**, trước và sau hạn.
2. **`doc_luc_dung` do SERVER chấm** từ lịch sử giá thật; client không bao giờ gửi phán quyết, chỉ gửi phần đoán. ⇒ `luc_chi_so` sai chỉ làm **band hiện lại cho user** sai, **không** tạo ra được tỷ lệ đạt.
3. **Vế ② là CLIENT-ASSERTED và server KHÔNG kiểm được** (ghi thẳng trong HONESTY NOTE 1): `co_canh_giac_lenh_gia` và `hanh_vi_co` đều tính trong browser từ ladder mà server không giữ. `_validate_reading` chỉ từ chối **tổ hợp tự mâu thuẫn**; một client gửi `co_canh_giac_lenh_gia=true` + `hanh_vi_co="cho_xac_nhan"` 3 lần là qua vế ②. **Đừng “vá” bằng cách bịa kiểm tra khi viết lại** — hoặc đưa dữ liệu ladder về server (thay đổi kiến trúc, cần spec mới), hoặc giữ nguyên và giữ luôn time-lock (thứ duy nhất buộc lời khai phải nói trước khi biết kết quả, và không sửa được sau đó).
4. **Vòng chấm lười có TRẦN**: mỗi lượt chạy tối đa `MAX_CHAM_MOI_LAN = 20` lần lấy giá; một `(mã, phiên)` hỏng `CHAM_MISS_MAX_LAN = 3` lần liên tiếp bị “park” trong `CHAM_MISS_TTL = 6h` (memo process-local, key theo mã+phiên **không theo user**). Park **không** làm lệnh thành “đọc sai”, chỉ hoãn.

#### Cấp 7 — Ý NGHĨA NULL (đã có bug “unknown hiện thành 0”)

| Trường | `null` nghĩa là | KHÔNG được hiểu là |
|---|---|---|
| `doc_luc_dung` | Chưa chấm — **hoặc** chưa tới hạn (`da_toi_han_cham = false`) **hoặc** tới hạn nhưng chưa lấy được giá phiên đó (`da_toi_han_cham = true`) | “đọc sai” |
| `dien_bien_pct` | Chưa chấm được | 0% (không đổi giá) |
| `luc_band` / `luc_band_ten` | Tỷ số thiếu/không đọc được | `can_bang` |
| `co_canh_giac_lenh_gia` | Lệnh chưa qua bước đọc lực (hàng Cấp 1-6) | `false` |
| `time_to_graduate_hours` | Chưa tốt nghiệp | 0 giờ |

`ty_le_doc_luc_dung` là số **KHÔNG nullable** và bằng `0.0` khi chưa chấm được gì — nên **luôn** phải đọc kèm `so_lenh_da_cham` / `so_lenh_chua_cham`; mẫu số chỉ gồm lệnh ĐÃ CHẤM.

#### Cấp 8 — ba thước đo rủi ro cấp danh mục: công thức + ngưỡng

Cấp 8 có **đúng 3** thước đo. **KHÔNG có** chỉ số “tỷ trọng tối đa 1 mã” riêng và **KHÔNG có** drawdown (max drawdown chỉ tồn tại ở báo cáo Người quản lý danh mục, spec §9 nói rõ Cấp 8 không dựng lại báo cáo đó — xem `CROSS_REF_PM`).

| # | Thước đo | Công thức | Ngưỡng cảnh báo |
|---|---|---|---|
| ① | **Dồn ngành** (tập trung ngành, theo ICB) | `don_nganh_pct_truoc = MV(ngành) / NAV × 100`; `don_nganh_pct_sau = (MV(ngành) + khối_lượng × giá) / NAV × 100`. **NAV KHÔNG đổi khi lệnh khớp** (tiền thành giá trị vị thế); phí bỏ qua. Ngành = `symbols.icb_lv2` ưu tiên, fallback `icb_lv1` | `don_nganh_pct_sau > 40.0` (`NGUONG_DON_NGANH_PCT`) |
| ② | **Tương quan với vị thế đang giữ** | Pearson `correlation()` trên **daily returns** của các giá đóng cửa **khớp theo NGÀY** (`set(a) & set(b)`), 120 phiên gần nhất (`SO_PHIEN_LICH_SU = RISK_LOOKBACK_DAYS = 120`, request `120×1.8+30 = 246` ngày lịch). Chỉ so với vị thế **ĐÁNG KỂ** (`ty_trong_pct >= 5.0`), tối đa `TUONG_QUAN_MAX_VI_THE = 8` mã theo tỷ trọng giảm dần; lấy cặp có hệ số CAO NHẤT | `he_so > 0.7` (`NGUONG_TUONG_QUAN`) |
| ③ | **Tổng vốn ở rủi ro** | `tong_rui_ro_pct = Σ (ty_trong_pct × khoang_toi_cat_lo_pct / 100)` với `khoang_toi_cat_lo_pct = max(0, (giá − cắt_lỗ) / giá × 100)`. Phần lệnh mới: `(giá_trị_lệnh / NAV × 100) × khoảng_tới_cắt_lỗ / 100` | `tong_rui_ro_pct_sau > tran_khau_vi_pct` (10/20/30 theo khẩu vị Cấp 3) |

**Điều kiện “chưa tính được” của từng thước đo** (mỗi trạng thái có `null` + cờ riêng, KHÔNG BAO GIỜ trả 0):
`nav_vnd <= 0` ⇒ ① và ③ đều “chưa tính được”. `nganh = null` ⇒ ① chưa tính được (không đoán ngành). ② `tuong_quan_du_lieu = false` khi: không có vị thế nào khác · không vị thế nào `>= 5%` NAV · số phiên khớp ngày `< TUONG_QUAN_MIN_PHIEN + 1 = 61` closes · một trong hai chuỗi có `stdev = 0`. ③ `tong_rui_ro_pct_sau = null` khi lệnh chưa có cắt lỗ.
`tuong_quan_an_toan()` là lớp bọc bắt buộc: `correlation()` gốc trả `0.0` cho input suy biến, và `0.0` hiện lên UI đọc thành “hai mã không đi cùng nhịp” — một khẳng định sai. Lớp bọc trả `None`.

**Cắt lỗ của một vị thế** (`_cat_lo_of_position`): lấy **lệnh MUA FILLED gần nhất** của cặp account+symbol (không chặn thời gian), rồi `OrderKehoach.cat_lo` của lệnh đó — xấp xỉ **một-lô** vì tài khoản ảo tính **giá vốn bình quân**, không theo lô. `null` = CHƯA BIẾT ⇒ vị thế bị **LOẠI khỏi tổng** và đếm vào `so_vi_the_thieu_cat_lo`, không cộng 0.

**Hai nghĩa của trần khẩu vị** (HONESTY NOTE 3): `KHAU_VI_TRAN_PCT` gốc là **trần % vốn cho MỘT lệnh** (Cấp 3); Cấp 8 mượn lại làm **trần cho CẢ danh mục**. Copy `giai_thich.tran_khau_vi` luôn nói rõ hai nghĩa — FE hiện nguyên văn. Với khoảng cắt lỗ thông thường, trần này **ít khi vượt**: đó là chủ ý — vế ③ là **chốt an toàn, không phải núm điều chỉnh độ khó** (độ khó nằm ở vế ① và ②).

#### Cấp 8 — NHIỆM VỤ

| Mã task | Tên hiển thị (nghĩa) | Điều kiện hoàn thành (server) | Ai đặt |
|---|---|---|---|
| `task_1_done_at` | ① Lệnh đầu qua bước Kiểm tra danh mục | `so_lenh_kiem_tra >= 1` (đếm `order_kehoach.hanh_vi_canh_bao IS NOT NULL`) | **Tự động** theo hành vi giao dịch |
| `task_2_done_at` | ② Kết sổ đầu Cấp 8 | `so_lenh_da_ket_so >= 1` — vòng mua-bán ĐÃ ĐÓNG mà lệnh MUA mang khối Cấp 8 | **Tự động** |
| `task_3_done_at` | ③ Thách thức Quản trị rủi ro danh mục | đủ **cả 3** vế (bảng dưới) | **Tự động**, **và chỉ khi request đó có snapshot danh mục** |

★ Bẫy: `_recompute_progress(snapshot=None)` (đường đi của `/progress`, `/task`) **không thể** stamp `task_3_done_at` vì vế ③ cần danh mục đã định giá. Chỉ `/kiem-tra`, `/thach-thuc`, `/graduate`, `POST /kehoach` truyền snapshot.

#### Cấp 8 — ĐIỀU KIỆN TỐT NGHIỆP

| Vế | Ngưỡng | Hằng số | Ghi chú |
|---|---|---|---|
| ① Số lệnh qua kiểm tra | `so_lenh_kiem_tra >= 15` | `_TASK3_SO_LENH_MIN = 15` | Cả đời tài khoản |
| ② Mua bất chấp cảnh báo | `bat_chap_gan_day <= 2` trong **15 lệnh GẦN NHẤT** | `_TASK3_CUA_SO = 15`, `_TASK3_BAT_CHAP_MAX = 2` | **CỬA SỔ TRƯỢT**, KHÔNG phải tổng cả đời. “Bất chấp” = `danh_muc_canh_bao` không rỗng **VÀ** `hanh_vi_canh_bao == "van_mua"` |
| ③ Danh mục an toàn | `don_nganh_max_pct <= 40.0` **VÀ** `tong_rui_ro_pct <= tran_khau_vi_pct` | `NGUONG_DON_NGANH_PCT = 40.0` | `du_du_lieu = false` (không đạt, cũng không tính ngược) khi: chưa định giá được danh mục · `nav_vnd <= 0` · **chưa đặt khẩu vị ở Cấp 3** (`tran = null`) |

`POST /cap8/graduate` khi thiếu: **409**, detail `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 8`.

#### Cấp 8 — KHOÁ CHỐNG GIAN LẬN

1. **SERVER TỰ SUY LẠI** (`del don_nganh_pct, tuong_quan_cao_voi, tong_rui_ro_pct, danh_muc_canh_bao` — dòng đầu `record_kehoach`): 4 trường đó trong body **bị xoá ngay**, server tính lại từ danh mục thật. Không có khoá này, client chỉ cần gửi `danh_muc_canh_bao: []` là ô “mua bất chấp cảnh báo” sạch mãi mãi.
2. **Kiểm tra chéo `hanh_vi_canh_bao`** (giá trị duy nhất lấy từ client — chỉ user biết mình bấm nút nào): `khong_canh_bao` khi CÓ cảnh báo → **400**; `van_mua`/`giam_kl`/`chon_ma_khac` khi KHÔNG có cảnh báo → **400** (trừ ngoại lệ compliance ở mục 4). Không tự sửa im lặng — chuẩn hoá kiểu nào cũng làm sai lệch ô kỷ luật, theo hai hướng ngược nhau.
3. **GHI MỘT LẦN** (write-once): đã có `hanh_vi_canh_bao` thì post **y hệt** = no-op 200, khác đi = **409**. Kiểm tra này đặt **TRƯỚC** khi định giá danh mục — retry không được phép đo lại. Không có nó, user bán bớt ngành đang dồn rồi ghi đè “không có cảnh báo” là xoá sạch vế ②, và `kehoach_out` sẽ hiện “Lúc mua: ⚠ …” của một danh mục chưa từng tồn tại. Áp dụng bất kể trạng thái lệnh (lệnh chưa khớp vẫn tính trong `_kiem_tra_rows`).
4. **`canh_bao_da_hien` bị giam đúng chỗ không gian lận được**: chỉ dùng để **cho phép ghi COMPLIANCE** `giam_kl`/`chon_ma_khac` khi cảnh báo đã tắt vì user đã điều chỉnh. **Bị BỎ QUA** cho `van_mua` (giá trị duy nhất vế ② đếm) và `khong_canh_bao`. ⇒ Khai cảnh báo không tồn tại không tạo được hồ sơ sạch; che cảnh báo thật không xoá được lần bất chấp. Danh sách được **làm sạch mềm** (`_validate_canh_bao_da_hien`: bỏ mã lạ, gộp trùng, sắp theo thứ tự enum `LoaiCanhBao`) chứ không 400.
5. `graduate` gọi `_danh_muc_snapshot` + `_recompute_progress` **trước** khi so 3 nhiệm vụ ⇒ mọi điều kiện được tính lại trong transaction; client không gửi được cờ “đã xong”.

#### Cấp 8 — Ý NGHĨA NULL

| Trường | `null` nghĩa là | KHÔNG được hiểu là |
|---|---|---|
| `don_nganh_max_pct`, `tong_rui_ro_pct` (trên `cap8_progress`) | **Chưa định giá danh mục lần nào** (mặc định sau `enter`) | 0% — mà 0% là giá trị **ĐẠT** cho cả hai vế, nên bịa 0 là tự động cho tốt nghiệp |
| `nganh` | Không tra được ICB của mã | “ngành khác” hay 0% |
| `tuong_quan` (+ `tuong_quan_du_lieu = false`) | Chưa tính được / không có vị thế đáng kể | “hệ số 0” / “không tương quan” |
| `tong_rui_ro_pct_sau` | Lệnh này chưa đặt cắt lỗ ⇒ phần góp CHƯA BIẾT | 0 |
| `khau_vi`, `tran_khau_vi_pct` | Chưa đặt khẩu vị ở Cấp 3 | mặc định `can_bang` / 20% |
| `danh_muc` (ở `/thach-thuc`) | Không định giá được danh mục | danh mục rỗng |
| `danh_muc_canh_bao` | Lệnh **chưa qua** bước kiểm tra | `[]` (= đã kiểm tra và KHÔNG có cảnh báo) |

Trong `_danh_muc_snapshot`, vị thế thiếu giá vào `so_vi_the_thieu_gia` và vị thế thiếu cắt lỗ vào `so_vi_the_thieu_cat_lo`; cả hai **bị loại khỏi tổng**, và mọi payload có `tong_rui_ro_pct` phải kèm câu `caveat` (“{N} vị thế chưa có cắt lỗ — …”).

#### Cấp 8 là cấp CAO NHẤT — sau khi tốt nghiệp thì sao?

`POST /cap8/graduate` chỉ ghi `graduated_at` + `time_to_graduate_hours` vào `cap8_progress`. **Không có cấp 9 để vào**, không có endpoint `enter` nào được gọi sau đó, và **không có bảng huy hiệu riêng trong hai cấp này** — huy hiệu là dải rail 0-8 do FE dựng từ `graduated_at` của từng `capN_progress`. Docstring endpoint ghi rõ: màn tốt nghiệp **mở tab Hành trình** thay cho nút “vào cấp sau”; Cấp 9+ chỉ là văn bản. ⚠ Luật bất di bất dịch của mọi màn tốt nghiệp ở đúng trần cấp: CTA **vẫn phải bấm được và vẫn ghi tốt nghiệp về server** — modal `closable={false}` + chỉ unmount khi có `graduated_at`, nên nút `disabled` kiểu “sắp ra mắt” sẽ **nhốt vĩnh viễn** user đã xong nhiệm vụ (lỗi đã phải sửa hai lần trên codebase này).

---

## Cấp 7 «Đọc sổ lệnh»

### GET /api/v1/cap7/progress

> **Tiến độ Cấp 7** — trạng thái cấp của user hiện tại, kèm 6 trường suy ra mà cột không giữ.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `RATE_LIMIT_DEFAULT = "60/minute"` per-IP (slowapi, `key_func=get_remote_address`) |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap7_progress`, `order_kehoach`, `order_ketso`, `virtual_orders`) + provider giá qua `get_adjusted_ohlcv` (vòng chấm lười) |
| **Side-effect** | **CÓ GHI**: chấm các lệnh tới hạn (`order_kehoach.doc_luc_dung`, `dien_bien_pct`), cập nhật `cap7_progress.so_lenh_doc_luc` / `so_lan_khong_duoi_theo_co` / `ty_le_doc_luc_dung`, có thể stamp `task_1..3_done_at`. Không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `Cap7ProgressOut | null` (`null` = chưa vào cấp; slice OpenAPI: `anyOf[Cap7ProgressOut, null]`)

~~~ts
interface Cap7ProgressOut {
  id: string;                          // uuid hàng cap7_progress
  user_id: string;                     // uuid
  entered_at: string;                  // ISO datetime UTC
  task_1_done_at: string | null;       // null = chưa xong; đã stamp thì không bao giờ xoá
  task_2_done_at: string | null;
  task_3_done_at: string | null;
  so_lenh_doc_luc: number;             // int — số lệnh MUA đã ghi đọc lực (mọi trạng thái chấm)
  so_lan_khong_duoi_theo_co: number;   // int — có cờ VÀ hanh_vi_co = "cho_xac_nhan"
  ty_le_doc_luc_dung: number;          // % (0-100), mẫu số CHỈ gồm lệnh ĐÃ CHẤM; 0.0 khi chưa chấm gì
  graduated_at: string | null;
  time_to_graduate_hours: number | null;

  // ── suy ra, KHÔNG lưu cột ──
  trong_phien: boolean;                // ĐỒNG HỒ SERVER (is_trading_session()) — FE cấm tự tính
  so_lenh_da_cham: number;             // int — mẫu số của ty_le_doc_luc_dung
  so_lenh_chua_cham: number;           // int — PHẦN CỦA HỢP ĐỒNG, không phải trang trí
  so_lan_gap_co: number;               // int — số lần cờ cảnh giác đã hiện
  so_lan_mua_duoi_theo: number;        // int — KHÔNG bị phạt, chỉ để đối chiếu
  so_phien_cham: number;               // 2 — hằng số SO_PHIEN_CHAM_LUC
}
~~~

~~~json
{
  "id": "b41e7c92-5a38-4f6d-9c17-2d80ea53b7f1",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-03T02:14:09.442817Z",
  "task_1_done_at": "2026-08-04T02:41:55.108233Z",
  "task_2_done_at": "2026-08-11T07:20:03.775410Z",
  "task_3_done_at": null,
  "so_lenh_doc_luc": 12,
  "so_lan_khong_duoi_theo_co": 2,
  "ty_le_doc_luc_dung": 62.5,
  "graduated_at": null,
  "time_to_graduate_hours": null,
  "trong_phien": true,
  "so_lenh_da_cham": 8,
  "so_lenh_chua_cham": 4,
  "so_lan_gap_co": 3,
  "so_lan_mua_duoi_theo": 1,
  "so_phien_cham": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu/sai Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `user.is_active = false` | `Tài khoản chưa được kích hoạt` |

Chưa vào cấp **không** phải lỗi: trả `200` với body `null`.

**Fallback / suy giảm**

- Provider giá lỗi / thiếu bar phiên tới hạn ⇒ lệnh đó **giữ `doc_luc_dung = null`**, vào `so_lenh_chua_cham`, **không bao giờ** bị tính là đọc sai; `(mã, phiên)` hỏng 3 lần bị park 6h.
- Quá `MAX_CHAM_MOI_LAN = 20` lần lấy giá trong một lượt ⇒ phần còn lại để lượt đọc sau (chấm là idempotent, không mất gì).
- Ngoài giờ giao dịch: `trong_phien = false`, mọi số khác vẫn trả đủ.
- `ty_le_doc_luc_dung = 0.0` khi `so_lenh_da_cham = 0` — **đừng render như “0% đọc đúng”**, phải hiện “chưa đủ dữ liệu” (ngưỡng hiện thống kê là `so_lenh_da_cham >= 3`, xem `/cap7/thach-thuc`).

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap7/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7f1c2a48-9d33-4b71-8e05-6a2fbc90d514'
~~~

**Ghi chú khi viết lại**

- Endpoint **GET nhưng có ghi DB** — trong NestJS phải chạy trong transaction và commit; đừng đặt sau một interceptor read-only.
- `trong_phien` = 09:00-11:30 và 13:00-14:45, Thứ 2-6, giờ VN (UTC+7), biên `<` cho giờ đóng. Hàm `is_trading_session()` nhận `holidays` nhưng Cấp 7 gọi **không truyền lịch nghỉ** ⇒ ngày lễ vẫn có thể trả `true`.
- Thứ tự: lấy hàng progress → `null` thì return ngay (KHÔNG chấm gì) → có hàng thì chấm → tính metrics → stamp task → flush → build payload.
- `so_phien_cham` là hằng số phẳng trong payload; đừng để FE hard-code 2.

---

### POST /api/v1/cap7/enter

> **Vào Cấp 7** — tạo hàng tiến độ Cấp 7 (idempotent), chỉ khi đã tốt nghiệp Cấp 6.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap7_progress`, `cap6_progress`) |
| **Side-effect** | `INSERT cap7_progress` (`entered_at = now(UTC)`, các chỉ số = 0) **rồi chạy `_recompute_progress` (có chấm)** — khác Cấp 3 ở chỗ này. Không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body** — không có body (gửi cũng bị bỏ qua)

**Response 200** — `Cap7ProgressOut` (như `GET /cap7/progress`, ở đây **không bao giờ** `null`)

~~~json
{
  "id": "b41e7c92-5a38-4f6d-9c17-2d80ea53b7f1",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-17T01:32:18.004512Z",
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_doc_luc": 0,
  "so_lan_khong_duoi_theo_co": 0,
  "ty_le_doc_luc_dung": 0.0,
  "graduated_at": null,
  "time_to_graduate_hours": null,
  "trong_phien": true,
  "so_lenh_da_cham": 0,
  "so_lenh_chua_cham": 0,
  "so_lan_gap_co": 0,
  "so_lan_mua_duoi_theo": 0,
  "so_phien_cham": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | **chưa có hàng `cap6_progress`** | `Không tìm thấy tiến trình Cấp 6` |
| 409 | `CONFLICT` | có hàng Cấp 6 nhưng `graduated_at IS NULL` | `Chưa tốt nghiệp Cấp 6` |

**Fallback / suy giảm**

- **Idempotent**: đã có hàng ⇒ **không** kiểm Cấp 6, **không** đổi `entered_at`, chỉ recompute rồi trả về. Kể cả hàng Cấp 6 bị xoá sau đó, `enter` vẫn 200.
- Không kiểm `CAP_MAX_ENABLED` (không tồn tại ở backend).
- Provider giá lỗi trong recompute ⇒ như `/progress` (để trống, không lỗi).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap7/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 4b90e1d7-32c5-4a68-b0f1-97ad3e5c8226'
~~~

**Ghi chú khi viết lại**

- Thứ tự kiểm tra: hàng Cấp 7 → (nếu chưa có) hàng Cấp 6 → `graduated_at`. Đảo thứ tự sẽ làm user đã vào Cấp 7 bị 409 khi hàng Cấp 6 bị can thiệp.
- Race hai `enter` song song đụng `uq_cap7_progress_user_id` → bắt lỗi unique và trả hàng đã tồn tại (giữ idempotent), đừng để 500 lọt ra.
- 404 vs 409 là hai tín hiệu khác nhau cho FE: 404 = “chưa từng vào Cấp 6”, 409 = “đang ở Cấp 6 nhưng chưa xong”.

---

### PATCH /api/v1/cap7/task

> **Kích hoạt tính lại nhiệm vụ** — endpoint này KHÔNG đặt xong nhiệm vụ, chỉ chạy lại vòng suy ra.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + provider giá (vòng chấm lười) |
| **Side-effect** | như `GET /cap7/progress` (chấm + cập nhật chỉ số + có thể stamp task) |

**Path params** — —

**Query params** — —

**Request body** — `TaskRequest`

~~~ts
interface TaskRequest {
  task_no: number; // int, CHỈ nhận 1 | 2 | 3 (_TASK_NOS)
}
~~~

~~~json
{ "task_no": 3 }
~~~

**Response 200** — `Cap7ProgressOut` (giống `GET /cap7/progress`, không bao giờ `null`)

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `task_no` không thuộc {1,2,3} | `task_no không hợp lệ` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |
| 422 | — | `task_no` thiếu hoặc không phải số nguyên | body validation của FastAPI (`detail` là mảng `errors`) |

**Fallback / suy giảm**

- **`task_no` bị bỏ qua hoàn toàn** sau khi validate: cả 3 nhiệm vụ đều được tính lại, không có nhánh riêng theo số.
- Nhiệm vụ mà lịch sử không đỡ ⇒ vẫn `null`. Không có đường nào để client tự đặt xong nhiệm vụ.
- Thứ tự: validate `task_no` **TRƯỚC** khi tìm hàng progress ⇒ user chưa vào cấp + `task_no = 9` nhận **400**, không phải 404.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap7/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 51a7b3c8-6e94-4d20-a8f7-13cd05be9247' \
  -d '{"task_no": 3}'
~~~

**Ghi chú khi viết lại**

- Giữ nguyên nghĩa “trigger recompute”, đừng biến thành `PATCH` thật sự đặt cờ — đó chính là lỗ hổng graduation fraud.
- Trả về **toàn bộ** progress để FE không cần gọi thêm `/progress`.

---

### GET /api/v1/cap7/phien

> **Trạng thái phiên + hằng số khối đọc sổ lệnh** — rẻ, gọi lại được, là nguồn DUY NHẤT của mọi ngưỡng Cấp 7.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không (nhưng **không** truy vấn giá — rẻ, gọi lại tự do) |
| **Nguồn dữ liệu** | Tính toán: đồng hồ SERVER (`is_trading_session()`) + hằng số module |
| **Side-effect** | không ghi gì (chỉ `_require_progress`) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `PhienOut`

~~~ts
interface PhienOut {
  trong_phien: boolean;      // ĐỒNG HỒ SERVER — FE cấm tự tính từ đồng hồ browser
  gio_giao_dich_text: string;
  giai_thich: string;        // COPY_TRONG_GIO nếu trong phiên, COPY_NGOAI_GIO nếu ngoài giờ
  quy_tac: QuyTacCap7;       // xem «Kiểu dữ liệu dùng chung»
}
~~~

~~~json
{
  "trong_phien": true,
  "gio_giao_dich_text": "Giờ giao dịch: 09:00–11:30 (phiên sáng) và 13:00–14:45 (phiên chiều), các ngày trong tuần.",
  "giai_thich": "Sổ lệnh đang sống: chỉ số Lực là ảnh chụp 3 mức dư mua / dư bán ngay lúc bạn nhìn, và nó đổi liên tục trong phiên — đọc để chọn thời điểm, đừng coi là dự báo.",
  "quy_tac": {
    "nguong_cau_ap_dao": 1.5,
    "nguong_cung_ap_dao": 0.6666666666666666,
    "bands": [
      { "ma": "cau_ap_dao", "ten": "Cầu áp đảo", "dieu_kien_text": "Lực ≥ 1.50 : 1",
        "giai_thich": "Tổng dư MUA 3 mức đang lớn hơn tổng dư BÁN ít nhất 1.5 lần — bên mua xếp hàng dày hơn hẳn ngay lúc này. Đây là ảnh chụp tức thời của sổ lệnh, không phải dự báo giá." },
      { "ma": "can_bang", "ten": "Cân bằng", "dieu_kien_text": "0.67 : 1 < Lực < 1.50 : 1",
        "giai_thich": "Dư mua và dư bán 3 mức xấp xỉ nhau — sổ lệnh không nghiêng về bên nào đủ rõ để đọc thành tín hiệu. Chênh lệch nhỏ trong khoảng này phần lớn là dao động bình thường." },
      { "ma": "cung_ap_dao", "ten": "Cung áp đảo", "dieu_kien_text": "Lực ≤ 0.67 : 1",
        "giai_thich": "Tổng dư BÁN 3 mức đang lớn hơn tổng dư MUA ít nhất 1.5 lần — bên bán xếp hàng dày hơn hẳn ngay lúc này. Vẫn là ảnh chụp tức thời, không phải dự báo giá." }
    ],
    "co_canh_giac_he_so": 3.0,
    "co_canh_giac_min_muc": 3,
    "co_canh_giac_copy": "Lệnh treo to chưa chắc là cầu/cung thật — đôi khi là 'kê giá' rồi rút. Chờ nó KHỚP THẬT rồi hãy tin.",
    "so_phien_cham": 2,
    "dead_band_pct": 1.0,
    "cham_giai_thich": "Sau 2 phiên giao dịch kể từ ngày bạn mua, hệ lấy giá đóng cửa THẬT của phiên đó và so với giá bạn khớp: tăng quá 1.0% thì đọc \"Cầu mạnh\" là đúng, giảm quá 1.0% thì \"Cầu yếu\" là đúng, nằm trong ±1.0% thì \"Cân bằng\" là đúng. Lệnh nào chưa lấy được giá phiên đó thì để trống — không bao giờ bị tính là đọc sai."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |

**Fallback / suy giảm**

- Ngoài giờ: `trong_phien = false` và `giai_thich = COPY_NGOAI_GIO` = *"Sổ lệnh chỉ sống trong giờ giao dịch — quay lại lúc thị trường mở để đọc lực."* → FE hiện copy này **thay cho UI đoán lực** (sổ tĩnh không đọc lực được). `quy_tac` vẫn trả đủ.
- Không phụ thuộc provider ngoài ⇒ không có nhánh suy giảm nào khác.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap7/phien' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 2e6f8a13-7b45-49c0-91d2-84fe0c37ba95'
~~~

**Ghi chú khi viết lại**

- **Vì sao tách khỏi `/progress`**: panel mở xuyên mốc 11:30, `trong_phien` phải làm mới độc lập mà không kéo theo vòng chấm giá.
- `nguong_cung_ap_dao` là **số thực nghịch đảo** `1/1.5`, phải trả đúng `0.6666666666666666` (đừng round thành `0.67` trong payload — `dieu_kien_text` mới là chỗ đã format 2 chữ số).
- `bands` luôn 3 phần tử theo thứ tự `cau_ap_dao, can_bang, cung_ap_dao` (thứ tự enum) — FE dựng gauge theo thứ tự này.
- Có `_require_progress` ⇒ **404 nếu chưa `enter`**. Đừng cho nó thành endpoint công khai “hằng số” khi viết lại: FE gọi nó trong shell cấp, sau `enter`.

---

### POST /api/v1/cap7/kehoach

> **Ghi bước đọc lực** — thêm khối Cấp 7 vào kế hoạch Cấp 1 của một lệnh MUA đã tồn tại; có TIME-LOCK.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`order_kehoach`, `virtual_orders`, `cap7_progress`) — client cấp `luc_chi_so` |
| **Side-effect** | `UPDATE order_kehoach` 4 cột (`luc_chi_so`, `luc_doc_user`, `co_canh_giac_lenh_gia`, `hanh_vi_co`) + recompute progress **với `score=False`** (không lấy giá — đây là đường tối hậu của panel mua) |

**Path params** — —

**Query params** — —

**Request body** — `KehoachRequest`

~~~ts
interface Cap7KehoachRequest {
  order_id: string;                  // uuid lệnh MUA của CHÍNH user
  luc_chi_so: number;                // tổng dư MUA / tổng dư BÁN (3 mức) lúc mua; PHẢI hữu hạn và > 0
  luc_doc_user: LucDocUser;          // "manh" | "can" | "yeu" — user tự chọn
  co_canh_giac_lenh_gia?: boolean;   // default false
  hanh_vi_co?: HanhViCo | null;      // BẮT BUỘC ⇔ co_canh_giac_lenh_gia = true
}
~~~

~~~json
{
  "order_id": "e2a91b73-4c05-4f8d-9a16-7b3d0ce85f24",
  "luc_chi_so": 1.9375,
  "luc_doc_user": "manh",
  "co_canh_giac_lenh_gia": true,
  "hanh_vi_co": "cho_xac_nhan"
}
~~~

**Response 200** — `KehoachCap7Out`

~~~ts
interface KehoachCap7Out {
  id: string;                        // uuid hàng order_kehoach
  order_id: string;
  luc_chi_so: number | null;
  luc_band: BandLuc | null;          // suy ra; null = tỷ số không đọc được
  luc_band_ten: string | null;
  luc_doc_user: LucDocUser | null;
  luc_doc_user_ten: string | null;
  doc_luc_dung: boolean | null;      // null = CHƯA CHẤM, không phải "sai"
  dien_bien_pct: number | null;
  co_canh_giac_lenh_gia: boolean | null;
  hanh_vi_co: HanhViCo | null;
  hanh_vi_co_ten: string | null;
  so_phien_cham: number;             // 2
  giai_thich: string;                // §C12c — hiện NGUYÊN VĂN
}
~~~

~~~json
{
  "id": "8d5f0b21-9e47-4c3a-b016-52ae7fd39c84",
  "order_id": "e2a91b73-4c05-4f8d-9a16-7b3d0ce85f24",
  "luc_chi_so": 1.9375,
  "luc_band": "cau_ap_dao",
  "luc_band_ten": "Cầu áp đảo",
  "luc_doc_user": "manh",
  "luc_doc_user_ten": "Cầu mạnh",
  "doc_luc_dung": null,
  "dien_bien_pct": null,
  "co_canh_giac_lenh_gia": true,
  "hanh_vi_co": "cho_xac_nhan",
  "hanh_vi_co_ten": "Chờ xác nhận (chờ khớp thật)",
  "so_phien_cham": 2,
  "giai_thich": "Lúc mua: Lực = 1.94 : 1 (Cầu áp đảo) · bạn đọc \"Cầu mạnh\". Sẽ chấm sau 2 phiên giao dịch bằng giá đóng cửa thật — hiện chưa có kết luận. Có cờ cảnh giác lệnh treo lớn — bạn chọn: Chờ xác nhận (chờ khớp thật). Cờ chỉ nhắc nhìn kỹ, không kết luận gì về lệnh treo đó."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | lệnh không phải MUA | `Bước đọc lực chỉ ghi cho lệnh MUA` |
| 400 | `BAD_REQUEST` | `luc_chi_so` không cast được số | `luc_chi_so phải là một số` |
| 400 | `BAD_REQUEST` | `luc_chi_so` không hữu hạn hoặc `<= 0` | `luc_chi_so phải là số hữu hạn và lớn hơn 0 (sổ lệnh không đọc được thì bỏ qua bước đọc lực, đừng gửi 0 hay vô cực)` |
| 400 | `BAD_REQUEST` | `luc_doc_user` sai giá trị | `luc_doc_user phải là 'manh', 'can' hoặc 'yeu'` |
| 400 | `BAD_REQUEST` | `hanh_vi_co` sai giá trị | `hanh_vi_co phải là 'cho_xac_nhan' hoặc 'mua_duoi_theo'` |
| 400 | `BAD_REQUEST` | có cờ nhưng thiếu `hanh_vi_co` | `Có cờ cảnh giác thì phải ghi bạn đã làm gì (hanh_vi_co)` |
| 400 | `BAD_REQUEST` | không cờ nhưng gửi `hanh_vi_co` | `Không có cờ cảnh giác thì không được ghi hanh_vi_co` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |
| 404 | `NOT_FOUND` | lệnh không tồn tại **hoặc của user khác** (KHÔNG phải 403) | `Không tìm thấy lệnh` |
| 404 | `NOT_FOUND` | lệnh chưa có hàng `order_kehoach` | `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` |
| 409 | `CONFLICT` | **đã qua hạn chấm** (kể cả lần ghi đầu) và payload KHÁC cái đã lưu | `Lệnh này đã qua hạn chấm đọc lực — không ghi hay sửa đọc lực được nữa. Chỉ số Lực và phần bạn đọc phải được chốt TRƯỚC khi biết giá đi đâu, đó là điều làm thống kê đọc lực có nghĩa.` |
| 422 | — | thiếu field / `order_id` không phải uuid | body validation FastAPI |

**Fallback / suy giảm**

- **Post lại y hệt = no-op 200** (so `luc_chi_so` với `abs_tol = 1e-6` — khớp đúng độ chính xác `Numeric(18,6)` của cột), trước và sau hạn chấm.
- Chưa tới hạn: ghi mới **và** sửa lại đều được (panel là form user quay lại được).
- **Không** lấy giá trong request này (`score=False`) — lệnh vừa ghi không thể tới hạn, và panel mua không được cộng thêm latency mạng.
- Ngoài giờ giao dịch: server **không chặn**; FE mới là nơi ẩn UI đoán lực (dựa `/cap7/phien`). Lệnh không ghi đọc lực là **hợp lệ**, không phải thiếu sót (đọc lực chưa bao giờ là điều kiện để mua).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap7/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9c4d7e28-1b36-4af5-8027-e5b1c93fd460' \
  -d '{
    "order_id": "e2a91b73-4c05-4f8d-9a16-7b3d0ce85f24",
    "luc_chi_so": 1.9375,
    "luc_doc_user": "manh",
    "co_canh_giac_lenh_gia": true,
    "hanh_vi_co": "cho_xac_nhan"
  }'
~~~

**Ghi chú khi viết lại**

- **THỨ TỰ KIỂM TRA (quan trọng, có test)**: `_require_progress` → tìm lệnh + kiểm chủ sở hữu → `side == BUY` → **validate payload** → tìm hàng `order_kehoach` → so “đã ghi y hệt?” → **TIME-LOCK**. Hệ quả cụ thể: payload sai trên một lệnh CHƯA có kế hoạch Cấp 1 trả **400**, không phải 404.
- **TIME-LOCK nằm NGOÀI nhánh “đã có đọc lực”** — đây là điểm dễ viết sai nhất và là chính lỗ hổng đã vá.
- Lệnh của người khác trả **404 chứ không 403** (không tiết lộ sự tồn tại của lệnh).
- `hanh_vi_co = "mua_duoi_theo"` được ghi nhận, **không bị phạt**: hệ quả duy nhất là không được đếm vào `so_lan_khong_duoi_theo_co`.
- Đơn vị: `luc_chi_so` là **tỷ số không đơn vị** (không phải %); `dien_bien_pct` là **điểm %**; dấu trừ trong copy là **U+2212** (`−`), không phải hyphen.
- `giai_thich` do SERVER dựng (`kehoach_out`) và FE hiện nguyên văn — đừng để FE tự ghép câu.

---

### GET /api/v1/cap7/kehoach/{order_id}

> **Đọc lại đọc lực của MỘT lệnh** — cho màn Kết sổ, và lượt đọc này CHẠY LUÔN vòng chấm lười.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + provider giá (vòng chấm lười) |
| **Side-effect** | **CÓ GHI**: chấm các lệnh tới hạn + cập nhật `cap7_progress` + có thể stamp task (giống `/progress`) |

**Path params**

| Tên | Kiểu | Ràng buộc | Mô tả |
|---|---|---|---|
| `order_id` | `string` (uuid) | bắt buộc, format uuid | Lệnh cần đọc lại; phải thuộc chính user |

**Query params** — —

**Request body** — —

**Response 200** — `KehoachCap7DetailOut` = `KehoachCap7Out` + 5 trường bối cảnh chấm

~~~ts
interface KehoachCap7DetailOut extends KehoachCap7Out {
  id: string | null;            // null CHỈ khi lệnh không có hàng order_kehoach nào
  symbol: string;               // từ virtual_orders.symbol
  co_du_lieu: boolean;          // false = lệnh KHÔNG có dữ liệu Cấp 7 (bình thường, không phải lỗi)
  dead_band_pct: number;        // 1.0 — ngưỡng của SERVER, Kết sổ giải thích bằng số này
  han_cham_ngay: string | null; // "YYYY-MM-DD" — phiên dùng để chấm
  da_toi_han_cham: boolean;     // phân biệt HAI kiểu doc_luc_dung = null
}
~~~

~~~json
{
  "id": "8d5f0b21-9e47-4c3a-b016-52ae7fd39c84",
  "order_id": "e2a91b73-4c05-4f8d-9a16-7b3d0ce85f24",
  "luc_chi_so": 1.9375,
  "luc_band": "cau_ap_dao",
  "luc_band_ten": "Cầu áp đảo",
  "luc_doc_user": "manh",
  "luc_doc_user_ten": "Cầu mạnh",
  "doc_luc_dung": true,
  "dien_bien_pct": 2.6,
  "co_canh_giac_lenh_gia": false,
  "hanh_vi_co": null,
  "hanh_vi_co_ten": null,
  "so_phien_cham": 2,
  "giai_thich": "Lúc mua: Lực = 1.94 : 1 (Cầu áp đảo) · bạn đọc \"Cầu mạnh\". Diễn biến 2 phiên sau: +2.6% → đọc lực ĐÚNG (ngoài ±1.0% mới tính là có hướng).",
  "symbol": "FPT",
  "co_du_lieu": true,
  "dead_band_pct": 1.0,
  "han_cham_ngay": "2026-08-19",
  "da_toi_han_cham": true
}
~~~

Lệnh **không có** dữ liệu Cấp 7 (đặt trước khi có cấp, hoặc user bỏ qua bước đọc lực) — vẫn **200**:

~~~json
{
  "id": null,
  "order_id": "a17c4e60-8b92-4d35-9f08-3c6e15da72b1",
  "luc_chi_so": null,
  "luc_band": null,
  "luc_band_ten": null,
  "luc_doc_user": null,
  "luc_doc_user_ten": null,
  "doc_luc_dung": null,
  "dien_bien_pct": null,
  "co_canh_giac_lenh_gia": null,
  "hanh_vi_co": null,
  "hanh_vi_co_ten": null,
  "so_phien_cham": 2,
  "giai_thich": "Lệnh này chưa ghi bước đọc lực — sổ lệnh chỉ đọc được trong giờ giao dịch, và đọc lực không bao giờ là điều kiện bắt buộc để mua.",
  "symbol": "VNM",
  "co_du_lieu": false,
  "dead_band_pct": 1.0,
  "han_cham_ngay": "2026-08-19",
  "da_toi_han_cham": true
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |
| 404 | `NOT_FOUND` | lệnh không tồn tại **hoặc của user khác** | `Không tìm thấy lệnh` |
| 422 | — | `order_id` không phải uuid | path validation FastAPI |

**Fallback / suy giảm**

- **Ba trạng thái phải giữ nguyên**: `doc_luc_dung = true` (đọc đúng) · `false` (đọc sai) · `null` (chưa chấm). Với `null`, đọc `da_toi_han_cham`: `false` = chưa tới hạn; `true` = tới hạn nhưng **chưa lấy được giá phiên đó** (sẽ chấm lại lần sau).
- Lệnh không có `order_kehoach` và lệnh có hàng nhưng không có đọc lực trả **cùng một `giai_thich`** (`COPY_CHUA_DOC_LUC`); khác nhau ở `id` (`null` vs uuid).
- `han_cham_ngay` luôn tính được (`virtual_orders.trading_date` là NOT NULL) — kể cả khi `co_du_lieu = false`.
- Provider giá lỗi ⇒ như `/progress` (để trống, không lỗi, không đoán).

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap7/kehoach/e2a91b73-4c05-4f8d-9a16-7b3d0ce85f24' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 6d18f5b4-27ca-4903-88e1-70bf3ce4a915'
~~~

**Ghi chú khi viết lại**

- **KHÔNG BỎ endpoint này**: nếu Kết sổ chỉ đọc cột đã lưu thì khối Cấp 7 mãi mãi báo “chưa tới hạn chấm” (chấm là compute-on-read, không có cron).
- `co_du_lieu` được suy từ **`luc_doc_user is not None`** — đúng vị từ mà `_doc_luc_rows` lọc. Đừng suy từ `luc_chi_so`.
- `han_cham_ngay`/`da_toi_han_cham` là **suy ra để hiển thị**, FE không tính được (cần số học ngày giao dịch + đồng hồ server); `da_toi_han_cham` so với **ngày theo giờ VN**.
- Vẫn là **GET có ghi** — như `/progress`, cần transaction + commit.

---

### POST /api/v1/cap7/cham

> **HỆ chấm đọc lực** — chạy tường minh đúng vòng chấm lười mà mọi lượt đọc vẫn chạy (idempotent).

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không (có memo âm process-local `_cham_miss`, TTL 6h — không phải Redis) |
| **Nguồn dữ liệu** | DB + provider giá `get_adjusted_ohlcv` (giá đóng cửa **điều chỉnh**) |
| **Side-effect** | `UPDATE order_kehoach.doc_luc_dung / dien_bien_pct` cho các lệnh tới hạn + cập nhật `cap7_progress` + có thể stamp task |

**Path params** — —

**Query params** — —

**Request body** — không có body. **Người dùng KHÔNG tự chấm**: user chỉ gửi phần đoán ở `POST /cap7/kehoach`; endpoint này để **hệ** đối chiếu đoán đó với giá thật. Không có input nào chọn lệnh hay áp phán quyết.

**Response 200** — `ChamOut`

~~~ts
interface ChamOut {
  so_moi_cham: number;         // int — số lệnh VỪA được chấm trong lượt này (0 nếu không còn gì tới hạn)
  so_lenh_doc_luc: number;     // int
  so_lenh_da_cham: number;     // int — mẫu số
  so_lenh_chua_cham: number;   // int
  ty_le_doc_luc_dung: number;  // % (0-100)
  so_phien_cham: number;       // 2
  giai_thich: string;          // = quy_tac.cham_giai_thich (CHAM_GIAI_THICH), nguyên văn
}
~~~

~~~json
{
  "so_moi_cham": 3,
  "so_lenh_doc_luc": 12,
  "so_lenh_da_cham": 8,
  "so_lenh_chua_cham": 4,
  "ty_le_doc_luc_dung": 62.5,
  "so_phien_cham": 2,
  "giai_thich": "Sau 2 phiên giao dịch kể từ ngày bạn mua, hệ lấy giá đóng cửa THẬT của phiên đó và so với giá bạn khớp: tăng quá 1.0% thì đọc \"Cầu mạnh\" là đúng, giảm quá 1.0% thì \"Cầu yếu\" là đúng, nằm trong ±1.0% thì \"Cân bằng\" là đúng. Lệnh nào chưa lấy được giá phiên đó thì để trống — không bao giờ bị tính là đọc sai."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |

**Fallback / suy giảm**

- **5 cách một lệnh bị BỎ QUA (không bao giờ tính là đọc sai)**: lệnh chưa khớp (`status != FILLED` hoặc `filled_price_vnd` rỗng/≤0) · chưa tới hạn (`han_cham > hôm_nay_VN`) · không lấy được giá phiên tới hạn · `(mã, phiên)` đang bị park · lượt này đã dùng hết 20 lần lấy giá (`break`).
- Gọi lần hai ngay sau: `so_moi_cham = 0` (hàng đã chấm bị `continue`).
- Ngày lễ: `han_cham` có thể là ngày không có bar; nếu lịch sử chạy **vượt** ngày đó thì dùng bar cuối nằm giữa `(ngày_mua, han_cham)`, còn không thì để trống.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap7/cham' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 3f8b26d1-95e0-4c47-a2b8-1de07cf5936a'
~~~

**Ghi chú khi viết lại**

- Endpoint này chạy vòng chấm **một lần** rồi recompute với `score=False`. Chạy hai lần sẽ **nhân đôi ngân sách lấy giá** và làm `so_moi_cham` lệch với các counter trả kèm.
- Lấy giá là **tuần tự**; cache của `get_adjusted_ohlcv` key theo `symbol:start:end` nên **không** tái dùng giữa các lệnh, và **thất bại không được cache** ⇒ memo âm là thứ duy nhất chặn retry vô hạn. Bản NestJS phải có cơ chế tương đương (Redis với TTL 6h là hợp lý, key `cap7:cham-miss:<mã>:<phiên>`) — memo trong process sẽ mất khi scale nhiều instance, hệ quả tối đa là thêm một vòng retry.
- Trần 20 và TTL 6h phải là **hằng số công bố trong code**, không rải rác magic number.

---

### GET /api/v1/cap7/thach-thuc

> **Thách thức Đọc sổ lệnh** — 3 điều kiện của nhiệm vụ ③ kèm giá trị hiện tại, đạt/chưa và giải thích.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + provider giá (vòng chấm lười); **tính lại server-side mỗi lượt đọc**, không tin cột tổng hợp |
| **Side-effect** | như `/progress` (chấm + cập nhật + có thể stamp task) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `ThachThucOut` (Cấp 7)

~~~ts
interface Cap7ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_doc_luc: ThachThucDieuKien;            // vế ① — muc_tieu 15
  so_lan_khong_duoi_theo_co: ThachThucDieuKien;  // vế ② — muc_tieu 3
  ty_le_doc_luc_dung: ThachThucDieuKien;         // vế ③ — muc_tieu 55, du_du_lieu có thể false
  so_lenh_da_cham: number;
  so_lenh_chua_cham: number;
  so_lan_gap_co: number;
  so_lan_mua_duoi_theo: number;
  so_phien_cham: number;                         // 2
}
~~~

~~~json
{
  "dat_ca_3": false,
  "so_lenh_doc_luc": {
    "ten": "Đọc lực cho ≥ 15 lệnh",
    "gia_tri_hien_tai": 12.0,
    "muc_tieu": 15.0,
    "dat": false,
    "du_du_lieu": true,
    "giai_thich": "Đã đọc lực cho 12/15 lệnh mua — mỗi lần là một lần bạn tự nhìn sổ dư mua/dư bán rồi tự chốt câu trả lời, thay vì mua theo cảm giác."
  },
  "so_lan_khong_duoi_theo_co": {
    "ten": "Không đuổi theo ≥ 3 cờ cảnh giác",
    "gia_tri_hien_tai": 2.0,
    "muc_tieu": 3.0,
    "dat": false,
    "du_du_lieu": true,
    "giai_thich": "Gặp cờ 3 lần, chờ xác nhận 2/3 lần (mua đuổi 1 lần). Mua đuổi KHÔNG bị phạt — nó chỉ không được tính vào ô kỷ luật này."
  },
  "ty_le_doc_luc_dung": {
    "ten": "Tỷ lệ đọc lực đúng ≥ 55%",
    "gia_tri_hien_tai": 62.5,
    "muc_tieu": 55.0,
    "dat": true,
    "du_du_lieu": true,
    "giai_thich": "Đọc lực đúng: 63% (đoán khớp diễn biến 5/8 lệnh đã chấm sau 2 phiên; mục tiêu ≥ 55%). Còn 4 lệnh chưa chấm được (chưa tới hạn hoặc chưa lấy được giá phiên đó) — những lệnh đó không nằm trong mẫu số và không bị tính là đọc sai."
  },
  "so_lenh_da_cham": 8,
  "so_lenh_chua_cham": 4,
  "so_lan_gap_co": 3,
  "so_lan_mua_duoi_theo": 1,
  "so_phien_cham": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |

**Fallback / suy giảm**

- `so_lenh_da_cham < 3` ⇒ vế ③ có `du_du_lieu = false`, `dat = false`, và `giai_thich` = *"Mới có {N} lệnh đọc lực đã chấm — cần ít nhất 3 lệnh đã chấm thì tỷ lệ mới nói được gì, nên IQX chỉ đếm và chưa hiện thống kê."* (+ câu về số lệnh chưa chấm nếu có). FE phải hiện “chưa đủ dữ liệu”, **không** hiện “0%” và **không** hiện “không đạt”.
- Vế ① và ② luôn `du_du_lieu = true` (đếm thuần).
- `gia_tri_hien_tai` là `number` (float) kể cả với vế đếm — vế ①/② ép `float(int)`.
- Tỷ lệ trong `giai_thich` được format `:.0f` (làm tròn) còn `gia_tri_hien_tai` là số đầy đủ — hai chỗ có thể lệch nhau (63 vs 62.5), đúng như source.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap7/thach-thuc' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 0a5c7e39-4d81-42b6-9137-fe20b6c85d47'
~~~

**Ghi chú khi viết lại**

- `dat_ca_3` là **AND của 3 vế**, và `ty_le_dat` **đã bao gồm** điều kiện `du_du_lieu` ⇒ không đủ dữ liệu là không tốt nghiệp được (không phải “bỏ qua vế đó”).
- `du_du_lieu = false` **KHÁC** `dat = false`. Đã có bug UI hiểu lẫn hai cái; giữ cả hai cờ trong DTO.
- Mọi `giai_thich` do server sinh — hiện nguyên văn, FE không tự ghép.

---

### POST /api/v1/cap7/graduate

> **Tốt nghiệp Cấp 7** — chỉ khi đủ 3/3 nhiệm vụ, và mọi điều kiện được tính lại trước khi so.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + provider giá (vòng chấm lười) |
| **Side-effect** | recompute (như `/progress`) rồi `UPDATE cap7_progress.graduated_at = now(UTC)`, `time_to_graduate_hours = (now − entered_at)/3600`. Không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body** — không có body

**Response 200** — `Cap7ProgressOut` (như `/progress`; `graduated_at` và `time_to_graduate_hours` đã có giá trị)

~~~json
{
  "id": "b41e7c92-5a38-4f6d-9c17-2d80ea53b7f1",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-03T02:14:09.442817Z",
  "task_1_done_at": "2026-08-04T02:41:55.108233Z",
  "task_2_done_at": "2026-08-11T07:20:03.775410Z",
  "task_3_done_at": "2026-08-17T04:02:31.669204Z",
  "so_lenh_doc_luc": 16,
  "so_lan_khong_duoi_theo_co": 4,
  "ty_le_doc_luc_dung": 58.3,
  "graduated_at": "2026-08-17T04:02:31.669204Z",
  "time_to_graduate_hours": 337.8,
  "trong_phien": false,
  "so_lenh_da_cham": 12,
  "so_lenh_chua_cham": 4,
  "so_lan_gap_co": 5,
  "so_lan_mua_duoi_theo": 1,
  "so_phien_cham": 2
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 7 | `Không tìm thấy tiến trình Cấp 7` |
| 409 | `CONFLICT` | thiếu bất kỳ nhiệm vụ nào trong 3 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 7` |

**Fallback / suy giảm**

- **Idempotent**: đã có `graduated_at` ⇒ giữ nguyên mốc cũ, **không** ghi lại `time_to_graduate_hours`, trả 200.
- Điều kiện được xét trên **`task_N_done_at`** (đã stamp) chứ không trên chỉ số hiện tại ⇒ đã stamp thì chỉ số tụt sau đó không làm mất tốt nghiệp.
- Provider giá lỗi ngay lúc gọi ⇒ vế ③ có thể chưa stamp được ⇒ 409 (chưa đủ nhiệm vụ), không 500. Gọi lại sau khi giá về là xong.
- `entered_at` naive (thiếu tzinfo) được coi là **UTC** trước khi trừ.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap7/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 8b3e1f57-46da-4c92-b70a-25cf9d81e603'
~~~

**Ghi chú khi viết lại**

- **KHOÁ CHỐNG GIAN LẬN**: `_recompute_progress` phải chạy **trước** khi so 3 nhiệm vụ, và toàn bộ (recompute + so + ghi `graduated_at`) phải nằm trong **MỘT transaction** — nếu không, hai request song song có thể ghi tốt nghiệp trên trạng thái cũ.
- Không nhận bất kỳ field nào từ client. Không có “force graduate” cho admin trong hai cấp này.
- Sau khi tốt nghiệp Cấp 7, FE mới được gọi `POST /cap8/enter` (nếu trần cấp cho phép). Backend không tự tạo hàng Cấp 8.

---

## Cấp 8 «Quản trị rủi ro danh mục»

### GET /api/v1/cap8/progress

> **Tiến độ Cấp 8** — trạng thái cấp, cố ý KHÔNG định giá lại danh mục.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap8_progress`, `order_kehoach`, `order_ketso`, `virtual_orders`) — **không** gọi provider giá |
| **Side-effect** | `UPDATE cap8_progress.so_lenh_kiem_tra / so_lan_mua_bat_chap_canh_bao`, có thể stamp `task_1/task_2`. **Không** cập nhật `don_nganh_max_pct` / `tong_rui_ro_pct` và **không thể** stamp `task_3` (thiếu snapshot). |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `Cap8ProgressOut | null` (`null` = chưa vào cấp)

~~~ts
interface Cap8ProgressOut {
  id: string;                            // uuid
  user_id: string;                       // uuid
  entered_at: string;                    // ISO datetime UTC
  task_1_done_at: string | null;
  task_2_done_at: string | null;
  task_3_done_at: string | null;
  so_lenh_kiem_tra: number;              // int — số lệnh đã qua bước Kiểm tra danh mục
  so_lan_mua_bat_chap_canh_bao: number;  // int — CẢ ĐỜI tài khoản (KHÔNG phải chỉ số của vế ②)
  don_nganh_max_pct: number | null;      // ẢNH CHỤP gần nhất; null = CHƯA TÍNH ĐƯỢC, không phải 0
  tong_rui_ro_pct: number | null;        // ẢNH CHỤP gần nhất; null = CHƯA TÍNH ĐƯỢC, không phải 0
  graduated_at: string | null;
  time_to_graduate_hours: number | null;

  // ── suy ra, KHÔNG lưu cột ──
  so_lan_co_canh_bao: number;            // int — số lệnh có ≥1 cảnh báo
  bat_chap_gan_day: number;              // int — CHỈ SỐ CỦA VẾ ② (cửa sổ trượt)
  cua_so_gan_day: number;                // int — độ dài cửa sổ THỰC TẾ (= min(số lệnh, 15))
  so_lenh_da_ket_so: number;             // int — vòng mua-bán đã đóng có khối Cấp 8
}
~~~

~~~json
{
  "id": "5c0a7e14-63b9-4d82-8f31-9e47ab205cd6",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-12T01:58:44.230119Z",
  "task_1_done_at": "2026-08-12T03:11:07.884562Z",
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_kiem_tra": 9,
  "so_lan_mua_bat_chap_canh_bao": 4,
  "don_nganh_max_pct": 43.7,
  "tong_rui_ro_pct": 11.2,
  "graduated_at": null,
  "time_to_graduate_hours": null,
  "so_lan_co_canh_bao": 6,
  "bat_chap_gan_day": 2,
  "cua_so_gan_day": 9,
  "so_lenh_da_ket_so": 0
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active = false` | `Tài khoản chưa được kích hoạt` |

Chưa vào cấp ⇒ `200` + body `null`.

**Fallback / suy giảm**

- **Cố ý không định giá danh mục** (mỗi vị thế là một lần lấy giá, panel gọi endpoint này mỗi lần mount) ⇒ `don_nganh_max_pct` / `tong_rui_ro_pct` giữ **ảnh chụp gần nhất** của `/kiem-tra` hoặc `/thach-thuc`, và là `null` cho tới lần đầu tiên có snapshot.
- Vì không có snapshot: `task_3_done_at` **không thể** được stamp ở endpoint này, dù điều kiện có thể đang đủ.
- Không có tài khoản giao dịch ảo vẫn **200** (endpoint này không gọi `get_portfolio`) — khác `/kiem-tra`, `/thach-thuc`, `/graduate`.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap8/progress' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: c92f4a07-58d6-4b13-90ea-7f2635cd814b'
~~~

**Ghi chú khi viết lại**

- **`so_lan_mua_bat_chap_canh_bao` (cả đời) và `bat_chap_gan_day` (cửa sổ 15 lệnh) phải cùng xuất hiện** và **không được nhầm lẫn**: vế ② tốt nghiệp đo `bat_chap_gan_day`. Đọc cột DB như thể nó là chỉ số vế ② là lỗi phân loại nghiêm trọng.
- `cua_so_gan_day` là **độ dài cửa sổ thực tế** (`len(rows[-15:])`), không phải hằng số 15 — dùng để dựng câu “trong {N} lệnh gần nhất”.
- Vẫn là **GET có ghi** (cập nhật 2 counter + stamp task) ⇒ cần transaction + commit.

---

### POST /api/v1/cap8/enter

> **Vào Cấp 8** — tạo hàng tiến độ Cấp 8 (idempotent), chỉ khi đã tốt nghiệp Cấp 7.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (`cap8_progress`, `cap7_progress`) |
| **Side-effect** | `INSERT cap8_progress` (`entered_at = now(UTC)`, chỉ số = 0, `don_nganh_max_pct = NULL`, `tong_rui_ro_pct = NULL`) rồi `_recompute_progress(snapshot=None)` |

**Path params** — —

**Query params** — —

**Request body** — không có body

**Response 200** — `Cap8ProgressOut` (không bao giờ `null`)

~~~json
{
  "id": "5c0a7e14-63b9-4d82-8f31-9e47ab205cd6",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-17T02:07:52.611903Z",
  "task_1_done_at": null,
  "task_2_done_at": null,
  "task_3_done_at": null,
  "so_lenh_kiem_tra": 0,
  "so_lan_mua_bat_chap_canh_bao": 0,
  "don_nganh_max_pct": null,
  "tong_rui_ro_pct": null,
  "graduated_at": null,
  "time_to_graduate_hours": null,
  "so_lan_co_canh_bao": 0,
  "bat_chap_gan_day": 0,
  "cua_so_gan_day": 0,
  "so_lenh_da_ket_so": 0
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 403 | `FORBIDDEN` | `is_active = false` | `Tài khoản chưa được kích hoạt` |
| 404 | `NOT_FOUND` | chưa có hàng `cap7_progress` | `Không tìm thấy tiến trình Cấp 7` |
| 409 | `CONFLICT` | có hàng Cấp 7 nhưng `graduated_at IS NULL` | `Chưa tốt nghiệp Cấp 7` |

**Fallback / suy giảm**

- **Idempotent**: đã có hàng ⇒ không kiểm Cấp 7, không đổi `entered_at`, chỉ recompute rồi trả về.
- `don_nganh_max_pct` / `tong_rui_ro_pct` **phải là `null`** ngay sau `enter` (có test pin: *"NULL, not 0.0 — nothing has been priced yet"*).
- Không kiểm `CAP_MAX_ENABLED` (không tồn tại ở backend).

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap8/enter' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 7d0be495-1c62-4a38-85f0-c3a91e7d2b56'
~~~

**Ghi chú khi viết lại**

- Thứ tự: hàng Cấp 8 → (nếu chưa có) hàng Cấp 7 → `graduated_at`.
- Race song song đụng `uq_cap8_progress_user_id` ⇒ bắt unique, trả hàng đã có.
- Đây là cấp cuối: **không** có endpoint `enter` nào sau nó — đừng thiết kế FE trông chờ `POST /cap9/enter`.

---

### PATCH /api/v1/cap8/task

> **Kích hoạt tính lại nhiệm vụ** — không đặt xong nhiệm vụ, và KHÔNG định giá danh mục.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB (không gọi provider giá) |
| **Side-effect** | như `GET /cap8/progress` (2 counter + có thể stamp `task_1`/`task_2`; **không** `task_3`) |

**Path params** — —

**Query params** — —

**Request body** — `TaskRequest`

~~~ts
interface TaskRequest { task_no: number; } // CHỈ 1 | 2 | 3
~~~

~~~json
{ "task_no": 1 }
~~~

**Response 200** — `Cap8ProgressOut`

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `task_no` không thuộc {1,2,3} | `task_no không hợp lệ` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 8 | `Không tìm thấy tiến trình Cấp 8` |
| 422 | — | `task_no` thiếu / không phải int | body validation FastAPI |

**Fallback / suy giảm**

- `task_no` bị bỏ qua sau validate; cả 3 nhiệm vụ đều được tính lại từ `order_kehoach`/`order_ketso`.
- **`task_3` không bao giờ được stamp qua endpoint này** (không truyền snapshot). Muốn nhiệm vụ ③ được stamp, FE phải gọi `GET /cap8/thach-thuc` (hoặc `/kiem-tra`, hoặc `POST /cap8/graduate`).
- Validate `task_no` **trước** `_require_progress` ⇒ `task_no` sai + chưa vào cấp = **400**.

**curl**

~~~bash
curl -sS -X PATCH 'https://iqx.vn/api/v1/cap8/task' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 41e8b076-2d95-4c31-a7f8-06be2d3915ca' \
  -d '{"task_no": 1}'
~~~

**Ghi chú khi viết lại**

- Giữ nguyên bất đối xứng “task_3 cần snabshot”: đó là chủ ý — *"we never invent a portfolio state just to be able to stamp a task"*.
- Đừng “tối ưu” bằng cách cho `/task` định giá danh mục: nó bị gọi mỗi lần mount panel.

---

### GET /api/v1/cap8/kiem-tra

> **Kiểm tra danh mục trước xác nhận MUA** — 3 thước đo rủi ro cấp danh mục trong MỘT response; là ĐỌC và CẢNH BÁO MỀM.

⚠ **Đính chính một ngộ nhận thường gặp**: `/cap8/kiem-tra` **KHÔNG phải bài kiểm tra cuối / bài thi**. Nó là bước kiểm tra **trước mỗi lệnh mua**, không có điểm, không có đỗ/không đỗ, và **không bao giờ chặn nút MUA** (spec §9, §C8). “Bài thi” của Cấp 8 là **Thách thức 3 vế** ở `GET /cap8/thach-thuc` (đỗ = `dat_ca_3 = true` ⇒ stamp nhiệm vụ ③ ⇒ đủ điều kiện `graduate`). Nếu bản viết lại biến `/kiem-tra` thành cổng chặn hay thành bài thi tính điểm là **sai nghiệp vụ**.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không (chỉ memo per-request `_lich_su_cache` cho lịch sử giá từng mã) |
| **Nguồn dữ liệu** | DB (`cap3_progress.khau_vi`, `order_kehoach.cat_lo`, `symbols.icb_lv2/icb_lv1`) + `VirtualTradingService.get_portfolio` (giá vị thế qua `resolve_price`) + `get_adjusted_ohlcv` (tương quan) |
| **Side-effect** | **CÓ GHI**: `_recompute_progress(snapshot=…)` ⇒ cập nhật `so_lenh_kiem_tra`, `so_lan_mua_bat_chap_canh_bao`, **`don_nganh_max_pct`, `tong_rui_ro_pct`**, có thể stamp cả 3 task. (Endpoint tên là “kiểm tra” nhưng nó làm mới ảnh chụp danh mục.) |

**Path params** — —

**Query params**

| Tên | Kiểu | Bắt buộc | Default | Ràng buộc | Mô tả |
|---|---|---|---|---|---|
| `symbol` | `string` | ✅ | — | không rỗng sau `strip()`; server `upper()` | Mã cổ phiếu định mua |
| `khoi_luong` | `integer` | ✅ | — | `> 0` (`exclusiveMinimum: 0` ⇒ ≤0 là **422**) | Khối lượng định mua (cổ phiếu) |
| `gia` | `integer` | ✅ | — | `> 0` | Giá định mua, **đơn vị đồng VND** (không phải nghìn đồng) |
| `cat_lo` | `integer \| null` | ❌ | `null` | không có ràng buộc `gt` | Cắt lỗ của **chính lệnh này** (Cấp 2), đơn vị đồng. **Thiếu ⇒ phần đóng góp của lệnh vào tổng vốn ở rủi ro là CHƯA BIẾT, không phải 0** |

**Request body** — —

**Response 200** — `KiemTraOut`

~~~ts
interface KiemTraOut {
  symbol: string;                      // đã upper()
  khoi_luong: number;                  // int
  gia: number;                         // int, VND
  cat_lo: number | null;               // int, VND
  gia_tri_lenh_vnd: number;            // = khoi_luong × gia
  nav_vnd: number;                     // NAV tài khoản ảo

  so_vi_the: number;                   // int — tổng vị thế đang giữ
  so_vi_the_thieu_cat_lo: number;      // int — BỊ LOẠI khỏi tổng rủi ro
  so_vi_the_thieu_gia: number;         // int — BỊ LOẠI khỏi mọi tổng (tỷ trọng chưa biết)

  nganh: string | null;                // null = chưa xác định được ngành ICB
  don_nganh_pct_truoc: number | null;
  don_nganh_pct_sau: number | null;
  don_nganh_canh_bao: boolean;

  tuong_quan: TuongQuanOut | null;     // cặp có hệ số CAO NHẤT với vị thế đáng kể
  tuong_quan_canh_bao: boolean;
  tuong_quan_du_lieu: boolean;         // false = CHƯA TÍNH ĐƯỢC (không phải "hệ số 0")

  tong_rui_ro_pct_truoc: number | null;
  tong_rui_ro_pct_sau: number | null;  // null = lệnh này chưa có cắt lỗ
  tong_rui_ro_canh_bao: boolean;

  khau_vi: KhauVi | null;              // từ Cap3Progress (giá trị SỐNG, không lấy từ lệnh cũ)
  khau_vi_ten: string | null;
  tran_khau_vi_pct: number | null;     // 10 | 20 | 30; null = chưa đặt khẩu vị

  canh_bao: CanhBaoOut[];              // CHỈ các cảnh báo THẬT SỰ bật; [] = không có
  giai_thich: {
    don_nganh: string;
    tuong_quan: string;
    tong_rui_ro: string;
    tran_khau_vi: string;              // nói rõ trần có HAI nghĩa
  };
  cross_ref_pm: string;
  quy_tac: QuyTacCap8;
}
~~~

~~~json
{
  "symbol": "HPG",
  "khoi_luong": 2000,
  "gia": 27500,
  "cat_lo": 25000,
  "gia_tri_lenh_vnd": 55000000.0,
  "nav_vnd": 412350000.0,
  "so_vi_the": 4,
  "so_vi_the_thieu_cat_lo": 1,
  "so_vi_the_thieu_gia": 0,
  "nganh": "Tài nguyên cơ bản",
  "don_nganh_pct_truoc": 31.4,
  "don_nganh_pct_sau": 44.7,
  "don_nganh_canh_bao": true,
  "tuong_quan": { "symbol": "VCB", "he_so": 0.74 },
  "tuong_quan_canh_bao": true,
  "tuong_quan_du_lieu": true,
  "tong_rui_ro_pct_truoc": 9.8,
  "tong_rui_ro_pct_sau": 11.0,
  "tong_rui_ro_canh_bao": false,
  "khau_vi": "can_bang",
  "khau_vi_ten": "Cân bằng",
  "tran_khau_vi_pct": 20.0,
  "canh_bao": [
    { "ma": "don_nganh", "ten": "Dồn ngành",
      "text": "Dồn ngành Tài nguyên cơ bản: 44.7% danh mục sau lệnh này (ngưỡng 40%)." },
    { "ma": "tuong_quan", "ten": "Tương quan cao",
      "text": "HPG đi cùng nhịp với VCB bạn đang giữ (hệ số 0.74) — mua thêm không thật sự phân tán rủi ro." }
  ],
  "giai_thich": {
    "don_nganh": "Ngành Tài nguyên cơ bản: 31.4% danh mục hiện tại → 44.7% sau lệnh này (tính trên NAV 412,350,000đ, theo ngành ICB của từng mã). Ngưỡng cảnh báo: trên 40%. Một cú sốc của ngành này sẽ chạm phần lớn danh mục cùng lúc.",
    "tuong_quan": "HPG đi cùng nhịp với VCB bạn đang giữ (hệ số 0.74, tính trên 120 phiên gần nhất; ngưỡng cảnh báo 0.7) — mua thêm không thật sự phân tán rủi ro.",
    "tong_rui_ro": "Tổng vốn ở rủi ro: 9.8% → 11.0% sau lệnh này — tổng phần vốn sẽ mất nếu mọi cắt lỗ bị chạm (cộng tỷ trọng từng vị thế × khoảng cách tới cắt lỗ của chính nó). 1 vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này, nên con số trên là phần ĐÃ BIẾT, không phải toàn bộ.",
    "tran_khau_vi": "Trần khẩu vị Cân bằng: 20%. Lưu ý hai con số này KHÔNG cùng một nghĩa: 20% vốn là trần cho một lệnh (cách bạn đặt ở Cấp 3), còn tổng vốn ở rủi ro là phần vốn mất nếu mọi cắt lỗ bị chạm trên cả danh mục. Cấp 8 mượn lại chính con số đó làm mức trần cho cả danh mục."
  },
  "cross_ref_pm": "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh mục' (Người quản lý danh mục).",
  "quy_tac": {
    "nguong_don_nganh_pct": 40.0,
    "nguong_tuong_quan": 0.7,
    "tuong_quan_min_ty_trong_pct": 5.0,
    "tuong_quan_min_phien": 60,
    "so_phien_lich_su": 120,
    "khau_vi_tran_pct": { "than_trong": 10.0, "can_bang": 20.0, "tan_cong": 30.0 },
    "cua_so_bat_chap": 15,
    "bat_chap_toi_da": 2,
    "so_lenh_kiem_tra_min": 15,
    "cross_ref_pm": "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh mục' (Người quản lý danh mục)."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `symbol` chỉ có khoảng trắng | `Thiếu mã cổ phiếu` |
| 400 | `BAD_REQUEST` | `khoi_luong <= 0` (nếu lọt qua validation) | `Khối lượng phải lớn hơn 0` |
| 400 | `BAD_REQUEST` | `gia <= 0` (nếu lọt qua validation) | `Giá phải lớn hơn 0` |
| 400 | `BAD_REQUEST` | **không định giá được danh mục** (provider giá lỗi) | `Chưa lấy được danh mục để kiểm tra — thử lại sau. Bước kiểm tra này không bao giờ chặn lệnh mua của bạn.` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 8 | `Không tìm thấy tiến trình Cấp 8` |
| 404 | `NOT_FOUND` | user **chưa có tài khoản giao dịch ảo** (`get_portfolio` raise, được re-raise nguyên vẹn) | `Không tìm thấy tài khoản giao dịch ảo` |
| 422 | — | thiếu query bắt buộc, `khoi_luong`/`gia` ≤ 0 hoặc không phải int | query validation FastAPI |

**Fallback / suy giảm** — NÊU RÕ từng thước đo:

- `nav_vnd <= 0` ⇒ `giai_thich.don_nganh` = *"Chưa tính được tỷ trọng ngành: danh mục chưa định giá được (NAV bằng 0)."*, `don_nganh_pct_truoc/sau = null`; `tong_rui_ro_pct_truoc = null` ⇒ `giai_thich.tong_rui_ro` = *"Chưa tính được tổng vốn ở rủi ro: danh mục chưa định giá được."*
- Không tra được ngành (`symbols` không có mã, hoặc lookup lỗi — **fail-soft, không 500**) ⇒ `nganh = null` + copy nói rõ *"IQX không đoán ngành — không có dữ liệu thì báo là chưa có, chứ không hiện 0%"*.
- Tương quan có **ba** trạng thái “không có số”, mỗi trạng thái một câu riêng: (a) không còn vị thế nào khác (*"cần ít nhất 2 mã"*); (b) mọi vị thế `< 5%` NAV (*"…có cùng nhịp cũng không ảnh hưởng đáng kể…"*); (c) không đủ phiên khớp ngày (*"cần ít nhất 60 phiên có cả hai mã… IQX để trống chỗ này thay vì hiện 0"*). Cả ba: `tuong_quan = null`, `tuong_quan_du_lieu = false`, `tuong_quan_canh_bao = false`.
- Thiếu `cat_lo` ⇒ `tong_rui_ro_pct_sau = null` và copy nói *"một vị thế không có cắt lỗ có rủi ro CHƯA BIẾT, không phải bằng 0"* (con số “trước” **không** được trình bày như thể là đáp án).
- Chưa đặt khẩu vị Cấp 3 ⇒ `khau_vi = null`, `tran_khau_vi_pct = null`, `tong_rui_ro_canh_bao = false` (không có trần ⇒ không có gì để vượt), và `giai_thich.tran_khau_vi` hướng dẫn đi đặt khẩu vị.
- Ngoài giờ giao dịch: `resolve_price` dùng giá đóng cửa ⇒ endpoint vẫn chạy bình thường (không có nhánh riêng theo giờ).
- **Dù trả về gì, cả ba lựa chọn Vẫn mua / Giảm khối lượng / Chọn mã khác đều hợp lệ như nhau.**

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap8/kiem-tra?symbol=HPG&khoi_luong=2000&gia=27500&cat_lo=25000' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: bd47029e-6c15-4a83-91f7-2e05cb63da84'
~~~

**Ghi chú khi viết lại**

- **Đơn vị**: `gia`, `cat_lo`, `gia_tri_lenh_vnd`, `nav_vnd` đều là **VND**; mọi `*_pct` là **điểm %** (0-100), không phải tỷ lệ 0-1; `he_so` tương quan là 0-1 (có thể âm).
- **NAV không đổi khi lệnh khớp** ⇒ “sau lệnh” dùng **cùng** NAV với “trước lệnh”. Phí/thuế bỏ qua (dưới độ phân giải của ngưỡng cảnh báo).
- Sắp xếp: đối tác tương quan xét theo **tỷ trọng giảm dần**, cắt còn 8 mã, rồi chọn **hệ số cao nhất** trong số tính được — không phải “mã lớn nhất”.
- Tương quan **khớp theo NGÀY** (`set & set`), không tail-align hai list khác độ dài: mã mới lên sàn / bị tạm ngừng có lưới phiên khác nhau, ghép phiên thứ *k* với phiên thứ *k* là correlate hai ngày khác nhau.
- `_closes_by_date` dùng `date.today()` của **máy chủ** (không quy đổi giờ VN) — bẫy lệch múi giờ nếu container chạy UTC; giữ nguyên hay sửa thì phải là quyết định có ý thức.
- `khau_vi` lấy từ `Cap3Progress` (giá trị **sống**, sửa được), không suy từ ảnh chụp của lệnh gần nhất.
- Endpoint là **GET nhưng ghi DB** (làm mới 2 ảnh chụp + có thể stamp task) — đừng đặt sau read-only guard.
- Có `so_vi_the_thieu_cat_lo`/`so_vi_the_thieu_gia > 0` thì **bắt buộc** hiện câu `caveat` kèm mọi chỗ hiện tổng rủi ro (đã có sẵn ở cuối `giai_thich.tong_rui_ro`).

---

### POST /api/v1/cap8/kehoach

> **Ghi khối Kiểm tra danh mục** — thêm khối Cấp 8 vào kế hoạch Cấp 1 của một lệnh MUA; server tự suy lại, GHI MỘT LẦN.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + `get_portfolio` + `get_adjusted_ohlcv` (server tự tính lại 4 thước đo) |
| **Side-effect** | `UPDATE order_kehoach` 5 cột (`don_nganh_pct`, `tuong_quan_cao_voi`, `tong_rui_ro_pct`, `danh_muc_canh_bao`, `hanh_vi_canh_bao`) + `_recompute_progress(snapshot=…)` (cập nhật counter + 2 ảnh chụp + có thể stamp cả 3 task) |

**Path params** — —

**Query params** — —

**Request body** — `KehoachRequest`

~~~ts
interface Cap8KehoachRequest {
  order_id: string;                        // uuid lệnh MUA của CHÍNH user
  hanh_vi_canh_bao: HanhViCanhBao;         // giá trị DUY NHẤT server lấy từ client
  /** Các `canh_bao[].ma` của CHÍNH lần GET /cap8/kiem-tra mà user đã phản hồi.
   *  BẮT BUỘC khi hanh_vi_canh_bao là "giam_kl" | "chon_ma_khac" (vì điều chỉnh
   *  chính là thứ làm cảnh báo tắt). BỊ BỎ QUA với "van_mua" và "khong_canh_bao". */
  canh_bao_da_hien?: string[] | null;
  /** ⛔ 4 trường dưới đây BỊ BỎ (server tự tính). Nhận vào chỉ để tương thích
   *  payload FE vừa hiện — gửi hay không gửi đều không đổi kết quả. */
  don_nganh_pct?: number | null;
  tuong_quan_cao_voi?: Record<string, unknown> | null;
  tong_rui_ro_pct?: number | null;
  danh_muc_canh_bao?: string[] | null;
}
~~~

~~~json
{
  "order_id": "f30b6c85-2a94-4de1-9038-7c15be24af07",
  "hanh_vi_canh_bao": "giam_kl",
  "canh_bao_da_hien": ["don_nganh", "tuong_quan"]
}
~~~

**Response 200** — `KehoachCap8Out`

~~~ts
interface KehoachCap8Out {
  id: string;                                // uuid hàng order_kehoach
  order_id: string;
  don_nganh_pct: number | null;              // = don_nganh_pct_sau server tính
  tuong_quan_cao_voi: TuongQuanOut | null;   // CHỈ lưu khi cảnh báo tương quan bật; null = không tính được HOẶC không vượt ngưỡng
  tong_rui_ro_pct: number | null;            // = tong_rui_ro_pct_sau server tính
  danh_muc_canh_bao: string[] | null;        // [] = đã kiểm tra, KHÔNG cảnh báo; null = chưa qua bước kiểm tra
  danh_muc_canh_bao_ten: string[] | null;
  canh_bao_text: string;                     // các nhãn nối bằng " · "; "" khi không có
  hanh_vi_canh_bao: HanhViCanhBao | null;
  hanh_vi_canh_bao_ten: string | null;
  giai_thich: string;                        // §C12c
}
~~~

~~~json
{
  "id": "1e94c7a0-58bd-4362-9f7a-0d63be18cf25",
  "order_id": "f30b6c85-2a94-4de1-9038-7c15be24af07",
  "don_nganh_pct": 37.2,
  "tuong_quan_cao_voi": null,
  "tong_rui_ro_pct": 10.4,
  "danh_muc_canh_bao": ["don_nganh", "tuong_quan"],
  "danh_muc_canh_bao_ten": ["Dồn ngành", "Tương quan cao"],
  "canh_bao_text": "Dồn ngành · Tương quan cao",
  "hanh_vi_canh_bao": "giam_kl",
  "hanh_vi_canh_bao_ten": "Giảm khối lượng",
  "giai_thich": "Lúc kiểm tra: ⚠ Dồn ngành · Tương quan cao. Dồn ngành sau lệnh: 37.2%. Tổng vốn ở rủi ro sau lệnh: 10.4% (nếu mọi cắt lỗ bị chạm). Bạn chọn: Giảm khối lượng. Các con số trên là ảnh chụp danh mục SAU khi bạn điều chỉnh, nên chúng có thể đã nằm trong ngưỡng — đó chính là tác dụng của việc bạn nghe cảnh báo."
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `hanh_vi_canh_bao` không thuộc 4 giá trị | `hanh_vi_canh_bao phải là 'van_mua', 'giam_kl', 'chon_ma_khac' hoặc 'khong_canh_bao'` |
| 400 | `BAD_REQUEST` | lệnh không phải MUA | `Bước Kiểm tra danh mục chỉ ghi cho lệnh MUA` |
| 400 | `BAD_REQUEST` | không định giá được danh mục | `Chưa lấy được danh mục để kiểm tra — thử lại sau` |
| 400 | `BAD_REQUEST` | lệnh không có giá nào dùng được (`filled_price_vnd`, `limit_price_vnd`, `kehoach.vung_mua` đều rỗng/≤0) | `Lệnh chưa có giá để tính tác động lên danh mục` |
| 400 | `BAD_REQUEST` | **CÓ cảnh báo** nhưng gửi `khong_canh_bao` | `Lệnh này CÓ cảnh báo danh mục (<các nhãn nối bằng ", ">) nên không ghi được 'không có cảnh báo'.` |
| 400 | `BAD_REQUEST` | **KHÔNG có cảnh báo** nhưng gửi `van_mua` / `giam_kl` / `chon_ma_khac` mà không kèm `canh_bao_da_hien` hợp lệ | `Lệnh này KHÔNG có cảnh báo danh mục nào nên chỉ ghi được 'khong_canh_bao' — trừ khi bạn gửi kèm canh_bao_da_hien (các cảnh báo của chính lần kiểm tra bạn đã phản hồi).` |
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 8 | `Không tìm thấy tiến trình Cấp 8` |
| 404 | `NOT_FOUND` | lệnh không tồn tại **hoặc của user khác** | `Không tìm thấy lệnh` |
| 404 | `NOT_FOUND` | chưa có hàng `order_kehoach` | `Không tìm thấy kế hoạch Cấp 1 — cần ghi vùng mua trước` |
| 404 | `NOT_FOUND` | chưa có tài khoản giao dịch ảo | `Không tìm thấy tài khoản giao dịch ảo` |
| 409 | `CONFLICT` | đã ghi khối Cấp 8 với `hanh_vi_canh_bao` **khác** | `Lệnh này đã ghi bước Kiểm tra danh mục rồi — ảnh chụp danh mục LÚC MUA không sửa lại được. Đó là điều làm ô "mua bất chấp cảnh báo" có nghĩa: nó ghi lại điều đã xảy ra, không phải điều danh mục trông như thế nào hôm nay.` |
| 422 | — | thiếu field / `order_id` không phải uuid | body validation FastAPI |

**Fallback / suy giảm**

- **Post lại y hệt `hanh_vi_canh_bao` = no-op 200**, trả hàng đã lưu **không đo lại gì** (không định giá lại danh mục ⇒ ảnh chụp không bị “trôi” theo danh mục mới).
- `van_mua` khi KHÔNG có cảnh báo → **400** kể cả khi có `canh_bao_da_hien` (chỉ `giam_kl`/`chon_ma_khac` được dùng ngoại lệ compliance).
- `canh_bao_da_hien` sai định dạng / mã lạ ⇒ **làm sạch mềm**, không 400; hậu quả tối đa là một `giam_kl` bị từ chối, không bao giờ làm sai lệch ô kỷ luật.
- Giá dùng để tính: `filled_price_vnd` → `limit_price_vnd` → `kehoach.vung_mua` (lệnh MARKET chưa khớp không có giá riêng; vùng mua Cấp 1 là giá user dự định trả — thay bằng 400 sẽ làm khối Cấp 8 im lặng biến mất với loại lệnh này).
- `them_lenh = order.status != FILLED`: lệnh **đã khớp** nằm sẵn trong danh mục đã định giá ⇒ “sau lệnh” chính là hiện tại (`gia_tri_lenh_vnd = 0`, không cộng thêm slice); lệnh **chưa khớp** thì cộng slice riêng.
- Provider giá lỗi ⇒ 400 (không ghi gì) — bước này chạy **SAU** khi lệnh đã tồn tại nên không chặn việc mua.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap8/kehoach' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 58cd0e73-9a41-4b26-8fd0-31e7ab962c4f' \
  -d '{
    "order_id": "f30b6c85-2a94-4de1-9038-7c15be24af07",
    "hanh_vi_canh_bao": "giam_kl",
    "canh_bao_da_hien": ["don_nganh", "tuong_quan"]
  }'
~~~

**Ghi chú khi viết lại**

- **THỨ TỰ KIỂM TRA (bắt buộc giữ)**: `_require_progress` → validate `hanh_vi_canh_bao` → tìm lệnh + chủ sở hữu → `side == BUY` → hàng `order_kehoach` → **WRITE-ONCE** (no-op / 409) → định giá danh mục → giá lệnh → `_do_kiem_tra` → kiểm tra chéo mâu thuẫn → ghi → recompute. **WRITE-ONCE đứng TRƯỚC khi định giá** — retry không được phép đo lại.
- 4 trường thước đo trong body phải bị **xoá ngay đầu hàm** (`del`), đừng “dùng nếu client gửi”.
- `tuong_quan_cao_voi` chỉ lưu khi `tuong_quan_canh_bao = true`; ngược lại `null` ⇒ trong Kết sổ, `null` ở đây nghĩa **“không có cặp vượt ngưỡng HOẶC không tính được”**, tuyệt đối không phải “hệ số 0”.
- `danh_muc_canh_bao = []` (đã kiểm tra, sạch) **khác** `null` (chưa qua bước kiểm tra) — `danh_muc_canh_bao_ten` cũng phải `null` khi mảng gốc `null`.
- Câu mở đầu `giai_thich` khác nhau theo hành vi: `giam_kl`/`chon_ma_khac` → *"Lúc kiểm tra: ⚠ …"* (số liệu là danh mục **SAU** điều chỉnh); còn lại → *"Lúc mua: ⚠ …"*. Viết sai câu mở đầu là mô tả một danh mục chưa từng tồn tại.
- `van_mua` **KHÔNG bị phạt** ở bất cứ đâu ngoài vế ②; UI không được style nó như “đáp án sai”.

---

### GET /api/v1/cap8/thach-thuc

> **Thách thức Quản trị rủi ro danh mục** — 3 điều kiện của nhiệm vụ ③ + khối ⑱ «Bản đồ rủi ro danh mục». Đây là “bài thi” thật của Cấp 8.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không (memo per-request cho lịch sử giá) |
| **Nguồn dữ liệu** | DB + `get_portfolio` + `get_adjusted_ohlcv` (ma trận tương quan O(n²) trên tối đa 8 vị thế) |
| **Side-effect** | **CÓ GHI**: cập nhật counter + `don_nganh_max_pct` + `tong_rui_ro_pct` + có thể stamp cả 3 task (kể cả `task_3`) |

**Path params** — —

**Query params** — —

**Request body** — —

**Response 200** — `ThachThucOut` (Cấp 8)

~~~ts
interface Cap8ThachThucOut {
  dat_ca_3: boolean;
  so_lenh_kiem_tra: ThachThucDieuKien;   // vế ① — muc_tieu 15
  mua_bat_chap: ThachThucDieuKien;       // vế ② — gia_tri_hien_tai = bat_chap_gan_day, muc_tieu 2 (TRẦN, đạt khi ≤)
  danh_muc_an_toan: ThachThucDieuKien;   // vế ③ — gia_tri_hien_tai = don_nganh_max_pct (0.0 khi null), muc_tieu 40
  so_lenh_da_ket_so: number;
  so_lan_co_canh_bao: number;
  so_lan_mua_bat_chap_canh_bao: number;  // CẢ ĐỜI — đứng cạnh cửa sổ trượt để không lẫn
  cua_so_gan_day: number;                // độ dài cửa sổ thực tế
  danh_muc: DanhMucOut | null;           // null = KHÔNG định giá được danh mục
}

interface DanhMucOut {
  nav_vnd: number;
  so_vi_the: number;
  so_vi_the_thieu_cat_lo: number;
  so_vi_the_thieu_gia: number;
  phan_bo_nganh: Array<{ nganh: string; pct: number }>;  // giảm dần theo MV, "Tiền mặt" là MỘT rổ riêng ở cuối
  don_nganh_max: { nganh: string; pct: number } | null;
  tong_rui_ro_pct: number | null;
  khau_vi: KhauVi | null;
  khau_vi_ten: string | null;
  tran_khau_vi_pct: number | null;
  cap_tuong_quan_cao: Array<{ a: string; b: string; he_so: number }>; // giảm dần theo he_so
  tuong_quan_du_lieu: boolean;   // false ⇒ FE hiện "chưa đủ dữ liệu", KHÔNG phải "không có cặp nào tương quan cao"
  caveat: string;                // "{N} vị thế chưa có cắt lỗ — …"; "" khi không thiếu gì
  cross_ref_pm: string;
}
~~~

~~~json
{
  "dat_ca_3": false,
  "so_lenh_kiem_tra": {
    "ten": "Kiểm tra danh mục cho ≥ 15 lệnh",
    "gia_tri_hien_tai": 11.0,
    "muc_tieu": 15.0,
    "dat": false,
    "du_du_lieu": true,
    "giai_thich": "Đã qua bước Kiểm tra danh mục 11/15 lệnh — mỗi lần là một lần bạn nhìn lệnh mới trong bối cảnh CẢ danh mục, chứ không chỉ nhìn riêng mã đó."
  },
  "mua_bat_chap": {
    "ten": "≤ 2 lần mua bất chấp cảnh báo trong 15 lệnh gần nhất",
    "gia_tri_hien_tai": 2.0,
    "muc_tieu": 2.0,
    "dat": true,
    "du_du_lieu": true,
    "giai_thich": "Trong 11 lệnh gần nhất (cửa sổ trượt 15 lệnh gần nhất), bạn mua bất chấp cảnh báo 2/2 lần. Cả đời tài khoản là 4 lần — cửa sổ chỉ tính các lệnh gần đây, nên một giai đoạn cũ không theo bạn mãi. Vẫn mua KHÔNG bị phạt: nó chỉ được đếm ở ô kỷ luật này."
  },
  "danh_muc_an_toan": {
    "ten": "Không ngành nào > 40% và tổng vốn ở rủi ro ≤ trần khẩu vị",
    "gia_tri_hien_tai": 36.5,
    "muc_tieu": 40.0,
    "dat": true,
    "du_du_lieu": true,
    "giai_thich": "Ngành lớn nhất: Tài nguyên cơ bản 36.5% (ngưỡng 40%). Tổng vốn ở rủi ro: 11.0% (nếu mọi cắt lỗ bị chạm) · trần khẩu vị Cân bằng: 20% (trần này vốn đặt cho một lệnh; Cấp 8 dùng lại làm mức trần cho cả danh mục). 1 vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này, nên con số trên là phần ĐÃ BIẾT, không phải toàn bộ."
  },
  "so_lenh_da_ket_so": 3,
  "so_lan_co_canh_bao": 6,
  "so_lan_mua_bat_chap_canh_bao": 4,
  "cua_so_gan_day": 11,
  "danh_muc": {
    "nav_vnd": 412350000.0,
    "so_vi_the": 4,
    "so_vi_the_thieu_cat_lo": 1,
    "so_vi_the_thieu_gia": 0,
    "phan_bo_nganh": [
      { "nganh": "Tài nguyên cơ bản", "pct": 36.5 },
      { "nganh": "Ngân hàng", "pct": 24.1 },
      { "nganh": "Công nghệ", "pct": 18.3 },
      { "nganh": "Tiền mặt", "pct": 21.1 }
    ],
    "don_nganh_max": { "nganh": "Tài nguyên cơ bản", "pct": 36.5 },
    "tong_rui_ro_pct": 11.0,
    "khau_vi": "can_bang",
    "khau_vi_ten": "Cân bằng",
    "tran_khau_vi_pct": 20.0,
    "cap_tuong_quan_cao": [
      { "a": "HPG", "b": "VCB", "he_so": 0.74 }
    ],
    "tuong_quan_du_lieu": true,
    "caveat": "1 vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này, nên con số trên là phần ĐÃ BIẾT, không phải toàn bộ.",
    "cross_ref_pm": "Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh mục' (Người quản lý danh mục)."
  }
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 8 | `Không tìm thấy tiến trình Cấp 8` |
| 404 | `NOT_FOUND` | chưa có tài khoản giao dịch ảo | `Không tìm thấy tài khoản giao dịch ảo` |

**Fallback / suy giảm**

- Provider giá lỗi ⇒ `snapshot = None` ⇒ **`danh_muc = null`** (không phải payload rỗng “tự tin”), vế ③ `du_du_lieu = false` + copy *"Chưa định giá được danh mục nên chưa chấm được điều kiện này — IQX để trống thay vì coi như đạt."*, và 2 ảnh chụp trên `cap8_progress` **giữ giá trị cũ** (không bị ghi `null` lên giá trị đã biết).
- Chưa đặt khẩu vị Cấp 3 (`tran_khau_vi_pct = null`) ⇒ vế ③ `du_du_lieu = false` với copy riêng *"Bạn chưa đặt khẩu vị rủi ro ở Cấp 3 nên chưa có trần nào để đối chiếu…"*.
- `nav_vnd <= 0` ⇒ `du_du_lieu = false`, `phan_bo_nganh = []`, `don_nganh_max = null`.
- Danh mục không còn vị thế nào ⇒ `du_du_lieu = true`, `don_nganh_max_pct = 0.0` (đây là **0 thật**, không phải “chưa biết”), copy *"Danh mục hiện không còn vị thế nào, nên không có ngành nào dồn."*
- `< 2` vị thế đáng kể (`>= 5%` NAV) hoặc không cặp nào tính được ⇒ `cap_tuong_quan_cao = []` + `tuong_quan_du_lieu = false`.
- `danh_muc_an_toan.gia_tri_hien_tai` bị **ép `0.0` khi `don_nganh_max_pct` là `null`** — đây chính là nguồn bug “unknown hiện thành 0”: phải đọc `du_du_lieu` trước, và **không** hiện `0.0%` như một con số thật.

**curl**

~~~bash
curl -sS -X GET 'https://iqx.vn/api/v1/cap8/thach-thuc' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: e70b4c39-1d82-4a56-93cf-08a2be71d645'
~~~

**Ghi chú khi viết lại**

- Vế ② `muc_tieu = 2` là **TRẦN** (đạt khi `gia_tri_hien_tai <= muc_tieu`), khác vế ①/③ — UI dạng progress bar phải biết chiều so sánh, `2.0/2.0` là **ĐẠT**.
- Vế ③ có **hai** điều kiện con nhưng chỉ **một** `gia_tri_hien_tai` (`don_nganh_max_pct`); phần tổng-rủi-ro-vs-trần chỉ xuất hiện trong `giai_thich` và trong `danh_muc`. Đừng suy `dat` từ `gia_tri_hien_tai` một mình.
- Chi phí: O(n²) cặp × 1 lần lấy lịch sử/mã, chặn bởi `TUONG_QUAN_MAX_VI_THE = 8` (tối đa 28 cặp) + memo per-request. Bản NestJS nên cache lịch sử giá theo mã (TTL ngắn) vì memo hiện tại chỉ sống trong một request.
- `phan_bo_nganh` **có rổ "Tiền mặt"** (`tien_mat_vnd / nav × 100`, gồm `cash_available + cash_reserved + cash_pending`) — nó là một rổ thật, không phải phần dư làm tròn; và nó được **append sau cùng**, không tham gia sắp xếp giảm dần.
- `caveat` là chuỗi đã `strip()`, `""` khi không thiếu gì — FE chỉ hiện khi khác rỗng, nhưng **phải** hiện ở mọi nơi có `tong_rui_ro_pct`.

---

### POST /api/v1/cap8/graduate

> **Tốt nghiệp Cấp 8** — cấp CAO NHẤT: đóng trọn mạch 0-8, không có cấp sau để vào.

| | |
|---|---|
| **Quyền** | Bearer |
| **Rate limit** | mặc định `60/minute` |
| **Cache** | không |
| **Nguồn dữ liệu** | DB + `get_portfolio` + `get_adjusted_ohlcv` (định giá danh mục để vế ③ chấm được) |
| **Side-effect** | recompute **có snapshot** (counter + 2 ảnh chụp + có thể stamp cả 3 task) rồi `UPDATE cap8_progress.graduated_at = now(UTC)`, `time_to_graduate_hours`. **Không** tạo hàng cấp 9, **không** ghi bảng huy hiệu riêng, không email/Telegram/audit. |

**Path params** — —

**Query params** — —

**Request body** — không có body

**Response 200** — `Cap8ProgressOut`

~~~json
{
  "id": "5c0a7e14-63b9-4d82-8f31-9e47ab205cd6",
  "user_id": "3c8e5d10-4a72-49b8-9f61-0b7d2c6e1a53",
  "entered_at": "2026-08-12T01:58:44.230119Z",
  "task_1_done_at": "2026-08-12T03:11:07.884562Z",
  "task_2_done_at": "2026-08-14T06:45:20.331097Z",
  "task_3_done_at": "2026-08-17T04:18:56.702884Z",
  "so_lenh_kiem_tra": 16,
  "so_lan_mua_bat_chap_canh_bao": 4,
  "don_nganh_max_pct": 36.5,
  "tong_rui_ro_pct": 11.0,
  "graduated_at": "2026-08-17T04:18:56.702884Z",
  "time_to_graduate_hours": 122.3,
  "so_lan_co_canh_bao": 9,
  "bat_chap_gan_day": 1,
  "cua_so_gan_day": 15,
  "so_lenh_da_ket_so": 5
}
~~~

**Lỗi**

| Status | code | Khi nào | detail |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | thiếu Bearer | `Yêu cầu xác thực` |
| 404 | `NOT_FOUND` | chưa vào Cấp 8 | `Không tìm thấy tiến trình Cấp 8` |
| 404 | `NOT_FOUND` | chưa có tài khoản giao dịch ảo (`_danh_muc_snapshot` re-raise) | `Không tìm thấy tài khoản giao dịch ảo` |
| 409 | `CONFLICT` | thiếu bất kỳ nhiệm vụ nào trong 3 | `Chưa hoàn thành đủ 3 nhiệm vụ Cấp 8` |

**Fallback / suy giảm**

- **Idempotent**: đã có `graduated_at` ⇒ giữ mốc cũ, không ghi lại `time_to_graduate_hours`, trả 200.
- Provider giá lỗi ⇒ `snapshot = None` ⇒ vế ③ không chấm được ⇒ nếu `task_3_done_at` chưa từng được stamp thì **409**, không 500. Gọi lại khi giá về là xong (đã stamp trước đó thì vẫn tốt nghiệp được, vì điều kiện xét trên `task_N_done_at`).
- **Sau khi tốt nghiệp**: không có `POST /cap9/enter`; FE mở tab **Hành trình** (rail huy hiệu 0-8 dựng từ `graduated_at` của từng cấp). Cấp 9+ chỉ là văn bản.

**curl**

~~~bash
curl -sS -X POST 'https://iqx.vn/api/v1/cap8/graduate' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Request-ID: 9a2c56e8-4b70-41d3-8f19-cd6035ba7e12'
~~~

**Ghi chú khi viết lại**

- **KHOÁ CHỐNG GIAN LẬN**: định giá danh mục + recompute **trước** khi so 3 nhiệm vụ, tất cả trong **MỘT transaction**. Không nhận field nào từ client, không có “force graduate”.
- Đây là endpoint duy nhất trong hai cấp mà **404 có thể đến từ tài khoản giao dịch ảo** — FE phải phân biệt được với 404 “chưa vào Cấp 8”; nên dùng `detail` để hiển thị.
- Vì là cấp cuối: CTA màn tốt nghiệp **vẫn phải bấm được và vẫn ghi tốt nghiệp**. Nút `disabled` kiểu “sắp ra mắt” sẽ nhốt vĩnh viễn user đã xong nhiệm vụ (modal `closable={false}`, chỉ unmount khi có `graduated_at`).

---

## Ghi chú tổng hợp khi viết lại

1. **16 endpoint, không ai có `ketso`.** Đã đối chiếu slice OpenAPI: Cấp 7 có 9 (thêm `/phien`, `/cham`, `GET /kehoach/{order_id}` so với bộ điển hình), Cấp 8 có 7 (thêm `/kiem-tra`). Kết sổ đi qua `POST /cap1/ketso`; khối Cấp 7 của một lệnh đọc lại bằng `GET /cap7/kehoach/{order_id}`, khối Cấp 8 không có endpoint đọc-lại riêng.
2. **Nhiều GET có ghi DB**: `/cap7/progress`, `/cap7/kehoach/{order_id}`, `/cap7/thach-thuc`, `/cap8/progress`, `/cap8/kiem-tra`, `/cap8/thach-thuc`. Trong NestJS/TypeORM/Prisma phải bọc transaction và commit; đừng gắn read-replica cho các route này.
3. **Không tin client — tính lại trong transaction.** Chỉ có đúng **hai** giá trị được lấy từ client trong cả hai cấp: `luc_chi_so` + `luc_doc_user`/cờ/hành vi ở Cấp 7 (được bảo vệ bằng TIME-LOCK) và `hanh_vi_canh_bao` + `canh_bao_da_hien` ở Cấp 8 (được kiểm tra chéo + write-once). Mọi thứ khác server tự suy lại. Tài liệu source ghi rõ **cái gì KHÔNG kiểm được** (vế ② Cấp 7) — giữ nguyên sự thật đó, đừng bịa kiểm tra.
4. **NULL = CHƯA BIẾT, không phải 0.** Đây là chủ đề trung tâm của Cấp 8 và là bug đã từng xảy ra. Mỗi trạng thái “chưa tính được” phải có `null` + cờ `*_du_lieu` đi kèm; đặc biệt `don_nganh_max_pct = 0` và `tong_rui_ro_pct = 0` là giá trị **ĐẠT**, nên bịa 0 = tự động cho tốt nghiệp.
5. **`du_du_lieu = false` ≠ `dat = false`.** Không đủ dữ liệu thì không đạt, nhưng cũng không được trình bày là “không đạt”. `dat_ca_3` là AND của 3 vế và `du_du_lieu` đã nằm trong vế tương ứng.
6. **Cửa sổ trượt vs cả đời (Cấp 8)**: vế ② đo `bat_chap_gan_day` trong `cua_so_gan_day` (tối đa 15 lệnh gần nhất); cột `so_lan_mua_bat_chap_canh_bao` là cả đời. Hai số phải cùng hiện, không được lẫn.
7. **Đơn vị**: tiền VND (int); `*_pct` là điểm % 0-100; `luc_chi_so` là tỷ số không đơn vị; `he_so` tương quan −1…1; `dien_bien_pct` điểm %; `time_to_graduate_hours` giờ (float). Số hiển thị theo **en-US** (`412,350,000đ`), ngày theo vi-VN, dấu trừ trong copy là **U+2212**.
8. **Sắp xếp**: `_doc_luc_rows` / `_kiem_tra_rows` theo `VirtualOrder.created_at ASC` (cửa sổ 15 lệnh gần nhất = `rows[-15:]`, phụ thuộc thứ tự này); ghép Kết sổ = BUY FILLED **gần nhất** cùng account+symbol có `created_at <= sell.created_at`; `phan_bo_nganh` giảm dần theo MV + rổ “Tiền mặt” cuối; `cap_tuong_quan_cao` giảm dần theo `he_so`; đối tác tương quan chọn theo tỷ trọng giảm dần rồi lấy hệ số cao nhất.
9. **404 chứ không 403** cho lệnh của người khác (cả hai cấp). Và `Không tìm thấy tài khoản giao dịch ảo` (404) có thể xuất hiện ở `/cap8/kiem-tra`, `/cap8/kehoach`, `/cap8/thach-thuc`, `/cap8/graduate` — Cấp 7 không có nhánh này.
10. **Copy do SERVER sinh, FE hiện NGUYÊN VĂN.** Mọi ngưỡng đều công bố qua `quy_tac` (`/cap7/phien`, `/cap8/kiem-tra`) — FE cấm tự đặt ngưỡng. Có test quét mọi chuỗi API để chặn câu nào nói IQX “phát hiện lệnh giả”; giữ test tương đương khi viết lại.
11. **Không cron.** Cả hai cấp là compute-on-read. Cấp 7 có trần chi phí (20 lần lấy giá/lượt, park `(mã, phiên)` 3 lần hỏng trong 6h); Cấp 8 chặn O(n²) ở 8 vị thế. Nếu bản mới thêm cron, phải giữ được tính idempotent và không được biến “chưa lấy được giá” thành “đọc sai”.
12. **`CAP_MAX_ENABLED` không tồn tại ở backend** (hiện `= 3` ở frontend `dashboard/src/features/cap1/capFlags.ts`). Backend chỉ gác theo chuỗi tốt nghiệp Cấp 6 → 7 → 8. Cấp 8 là cấp cuối: không có `enter` nào sau nó, và CTA màn tốt nghiệp phải luôn bấm được.
13. **Thực chiến-only**: mọi truy vấn lọc `mode = "thuc_chien"`, và user không Premium chỉ sinh được lệnh `san_tap` ⇒ FREE về HTTP nhưng không thể tiến độ. Đây là ràng buộc ẩn dễ bỏ sót nhất khi viết lại.
