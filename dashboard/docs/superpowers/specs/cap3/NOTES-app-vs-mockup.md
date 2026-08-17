# Cấp 3 — lệch giữa mockup/spec và app (đọc TRƯỚC khi nghiệm thu)

Bộ file trong thư mục này là bản founder gửi, **giống hệt** bản đã dùng để build
Cấp 3. Nhưng Cấp 2 đã được **viết lại** sau đó (mô hình 2 nhiệm vụ), nên vài chỗ
trong mockup Cấp 3 không còn là chuẩn nghiệm thu. Bốn chỗ sau là **cố ý lệch** —
app đúng, mockup cũ:

| # | Mockup / spec Cấp 3 nói | App làm | Vì sao |
|---|---|---|---|
| 1 | `iqx-cap3-phantich-danhmuc.html`: "② Thắng/thua theo **6 lý do**", "③ Độ phủ **6 lý do** + Cơ sở" | **5 lý do** | App chỉ có 5 (`LY_DO_OPTIONS`, `cap1/types.ts`); Cấp 2 cũng render 5. Lệch có sẵn từ trước, không phải nợ mới. |
| 2 | Cùng file: hai khối mới của Cấp 3 đánh số **⑦⑧** (vì lúc vẽ, Cấp 2 có 6 khối, trong đó ④ = "Điểm kỷ luật 30 ngày", ⑤ = "Phân loại vi phạm theo tuần", ⑥ = "Phát hiện từ ghi chú") | **⑤⑥** | Cả ba khối ④⑤⑥ đó đã bị gỡ khỏi Cấp 2; giữ ⑦⑧ thì trang in ①②③④ rồi nhảy sang ⑦⑧. Tầng compute vẫn giữ tên theo spec (`khoi7TuTin`/`khoi8KhoiLuong`, `computeCap3Khoi7TuTin`) vì Cấp 4-8 đọc lại. Ánh xạ: **⑦ (spec) = ⑤ (UI)**, **⑧ (spec) = ⑥ (UI)**. |
| 3 | `IQX-Cap3-Spec.md` §8 dòng 227: "các khối Cấp 1-2 **GIỮ NGUYÊN**"; §… bảng "GIỮ NGUYÊN" còn liệt kê **chuỗi kỷ luật** | Khối Cấp 2 kế thừa = **4 khối hiện có** (① hồ sơ · ② 5 lý do · ③ độ phủ · ④ cơ chế CL/CL). **Không có** chuỗi kỷ luật ở bất kỳ đâu | `chuoi_current`/`chuoi_record`/`last_chuoi_reset_at` đã bị DROP khỏi `cap2_progress` (migration `8f1a5c7d2e64`) — không nguồn nào cấp số cho nó. Kết sổ Cấp 3 cũng đã gỡ dòng đó (mockup `iqx-cap3-ketso.html` vốn không vẽ nó). |
| 4 | `iqx-cap3-hanhtrinh.html` vẽ checklist phẳng, không có ô "NHIỆM VỤ ĐANG LÀM" | Có ô **"NHIỆM VỤ ĐANG LÀM"** (`cap0/JourneyFocus.tsx`) + checklist thu gọn | Quy ước app thêm sau mockup, đã áp cho Cấp 0/1/2; không mockup cấp nào vẽ nó. |

Ngoài ra, khi các khối Cấp 2 được render lại trong trang Cấp 3, chúng nhận prop
`host` (`Cap2AnalysisHost`) nên: khối ① mang nhãn **"Cấp 3 «Bản lĩnh»"** + ngày
vào Cấp 3 (chứ không phải nhãn/ngày Cấp 2), ô tiến độ "Đã đặt CL/CL n/10" (mốc
tốt nghiệp **Cấp 2**) bị ẩn, khối ④ đổi cờ "mới ở Cấp 2" → "(giữ từ Cấp 2)".

## Trần cấp

Cấp 3 mở khi `CAP_MAX_ENABLED >= 3` (`dashboard/src/features/cap1/capFlags.ts`).
Với Cấp 4 **chưa mở**, hai màn sau cố tình KHÔNG theo nguyên văn spec §3 và sẽ
tự quay về nguyên văn khi trần lên 4 (có test cả hai phía):
`GraduationModalCap3` (Khối 3 + dòng dưới CTA + không gọi `POST /cap4/enter`) và
ô mục tiêu của `JourneyPanelCap3` (`data-testid="cap3-journey-goal"`).
