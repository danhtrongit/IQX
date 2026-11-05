# Spec Flashback · v2.4 bổ sung · Chú giải, lợi nhuận, chat, sẵn sàng, kết quả

> Ngày: 04/11/2026
>
> **Bổ sung cho:** `IQX-Flashback-SPEC-v2.md`, `v2.1-BoSung`, `v2.2-DuLieu`, `v2.3-BieuDo`.
>
> **HTML mẫu:** `IQX-Flashback-v2.4-MAU.html`. Mở ra là **phòng chờ**. Thanh vàng trên cùng chỉ có ở bản mẫu:
> - Nút **Sáng / Tối** để xem 2 giao diện.
> - Nút **Chủ phòng / Người chơi** để xem phòng chờ theo vai.
> - Nút **Tới phiên cuối** để xem nhanh cửa sổ kết quả.
> - Trong phòng chờ, bấm nhãn trạng thái của người khác để giả lập họ bấm Sẵn sàng.
>
> **Quy ước:** **[MỚI]** chức năng mới · **[THAY ĐỔI]** khác spec cũ. Phần nào không nhắc tới thì giữ nguyên.

---

## 0. Tóm tắt

| # | Hạng mục | Loại | Thay phần nào của spec cũ |
|---|---|---|---|
| 1 | Chú giải chỉ báo không có ô nền | [THAY ĐỔI] | v2.3 §1.1 (câu "nền tối trong suốt nhẹ") |
| 2 | Khung **Lợi nhuận** của mình (chỉ %) | [THAY ĐỔI] | v2 §6.2 (bỏ ô Lợi nhuận), v2.1 §6.2 (ẩn % cả của mình) |
| 3 | **Chat** trong phòng chờ, trong ván, ở cửa sổ kết quả | [MỚI] | — |
| 4 | Cửa sổ kết quả: **Về sảnh** và **Chơi lại** khoá 5 giây | [THAY ĐỔI] | v2 §7.3 |
| 5 | Phòng chờ: nút **Sẵn sàng**; chủ phòng chỉ bắt đầu khi mọi người sẵn sàng | [THAY ĐỔI] | v2 §4 ("bắt đầu lúc nào cũng được") |

---

## 1. Chú giải chỉ báo không có ô nền [THAY ĐỔI]

Giữ toàn bộ v2.3 §1 (chú giải nổi, mỗi chỉ báo một dòng, nút Ẩn · Cài đặt · Xóa). Chỉ đổi cách hiển thị chữ:

- **Không có ô nền** sau dòng chú giải (bỏ ô xám/đen đang có). Chữ nằm thẳng trên biểu đồ.
- **Tên và tham số** (ví dụ "MA Cross 20 50", "Bollinger Bands 20 2", "RSI 14", dòng "Phiên 15"): màu chữ chính của giao diện. **Nền sáng: chữ đen. Nền tối: chữ trắng.**
- **Con số:** giữ màu của đường vẽ tương ứng, để biết số nào của đường nào. Dòng O/H/L/C và % thay đổi: xanh nếu nến tăng, đỏ nếu nến giảm (như hiện tại).
- **Đọc được khi đè lên nến:** chữ có viền mảnh cùng màu nền của khung biểu đồ (`text-shadow`), không tạo thành ô.
- Cỡ chữ 12,5 px, đậm 700. Nút Ẩn · Cài đặt · Xóa cùng màu chữ chính.

---

## 2. Lợi nhuận của mình [THAY ĐỔI]

- Thêm **khung thứ 4 "Lợi nhuận"** sau Phiên · Tổng tài sản · Tiền mặt.
  - Chỉ hiện **%**: `Tổng tài sản / 10.000.000 − 1`, 2 chữ số thập phân, dấu + hoặc −.
  - Xanh khi dương, đỏ khi âm, chữ thường khi 0,00%. Không hiện −0,00%.
  - Cập nhật khi mua bán và khi sang phiên.
- **Thanh người chơi:** giữ như v2.1 §6.2. **Không** hiện % ở avatar của ai, kể cả của mình.
- **Không lộ của người khác:** API trạng thái ván vẫn không trả tài sản hay % của người khác (v2.1 §6.2). % của mình tính từ dữ liệu của chính mình.
- **Điện thoại:** 4 khung xếp 2 × 2.
- Kết thúc ván: cửa sổ kết quả hiện % của mọi người như cũ.

---

## 3. Chat phòng [MỚI]

### 3.1 Một luồng chat cho mỗi phòng
- Mỗi phòng có **một luồng chat**, dùng chung cho phòng chờ, trong ván và cửa sổ kết quả.
- "Chơi lại" về phòng chờ của chính phòng đó: luồng chat vẫn giữ.
- Rời phòng thì không thấy chat của phòng nữa.

### 3.2 Vị trí

| Màn | Máy tính | Điện thoại |
|---|---|---|
| **Phòng chờ** | Khung chat **luôn mở** ở cột phải (rộng 360 px, cao 600 px) | Khung chat nằm **dưới** các nút Rời phòng / Sẵn sàng / Bắt đầu, cao 440 px |
| **Trong ván** | Nút **"💬 Chat"** ở cuối thanh người chơi, có **số tin chưa đọc**. Bấm thì khung chat (rộng 340 px) trượt ra **đè lên panel Đặt lệnh**; bấm lại hoặc × thì đóng | Thanh nút đáy thành **Mua · Bán · Chat · Phiên tiếp**; nút Chat có số tin chưa đọc. Bấm thì mở khung kéo từ dưới lên (72% chiều cao màn) |
| **Cửa sổ kết quả** | Nút **"💬 Chat với phòng"**: đóng cửa sổ, mở khung chat; nút đáy đổi thành "Xem kết quả" để mở lại cửa sổ | Như máy tính |

### 3.3 Tin nhắn
- Đầu khung: "Chat phòng" và dòng "Tin của người đi trước hiện khi bạn tới cùng phiên" (chỉ trong ván).
- Mỗi tin: **tên người gửi** · **nhãn** "Phòng chờ" hoặc "Phiên N" · bong bóng chữ. Tin của mình bên phải, nền xanh.
- Chữ tối đa **200 ký tự**; khi đang gõ hiện "n/200".
- Gửi bằng nút **Gửi** hoặc **Enter**.
- **Câu nhanh** (một hàng, cuộn ngang): Chơi đẹp! · Gồng thôi 💪 · Cẩn thận nhé · Ngon! · GG 🤝 · 😂 · 🚀 · 📉. Bấm là gửi luôn.
- Nút biểu cảm 😊 ở thanh người chơi (v2.1 §6.4) **giữ nguyên**, tách khỏi chat.

### 3.4 Chống lộ giá tương lai (bắt buộc)
Mỗi người tự bấm Phiên tiếp nên đi nhanh chậm khác nhau. Người đi trước không được làm lộ diễn biến cho người đi sau.

- Mỗi tin lưu **`phien`** = phiên người gửi đang ở lúc gửi. Gửi ở phòng chờ: `phien = 0`.
- **Server chỉ giao tin cho người nhận khi `phiên của người nhận ≥ phien của tin`.** Tin chưa tới lượt được server giữ lại, **không gửi xuống trình duyệt**. Không hiện gì báo hiệu, kể cả chữ "có tin đang chờ".
  - Ví dụ: A ở phiên 22 nhắn "Bollinger thắt lại rồi kìa"; B đang ở phiên 14 chưa nhận; B bấm tới phiên 22 thì tin hiện, nhãn "Phiên 22".
- Tin gửi ở **phòng chờ** (`phien = 0`): giao cho mọi người ngay.
- Người đã bấm **Hoàn thành**: tin của họ mang `phien` = phiên cuối, nên chỉ người cũng đã xong mới thấy.
- **Ván kết thúc** (mọi người xong hoặc hết giờ): mọi tin giao cho tất cả.
- Thứ tự hiện: theo `phien`, cùng phiên thì theo giờ gửi.

### 3.5 Kiểm soát
- **Tốc độ:** mỗi người tối đa **1 tin mỗi 2 giây**. Gửi nhanh hơn: báo "Từ từ thôi 😄 Mỗi 2 giây một tin." và không gửi.
- **Lọc từ thô tục:** danh sách từ cấm do admin quản lý trong Quản trị; từ cấm thay bằng `***` trước khi lưu.
- **Bấm vào tên người gửi** mở menu:
  - **Tắt tiếng {tên} / Bỏ tắt tiếng:** chỉ mình không thấy tin của người đó; người kia không biết. Giữ trong cả phòng (kể cả khi chơi lại).
  - **Báo cáo tin nhắn:** gửi tin đó (kèm 10 tin trước) vào Quản trị để xử lý.
- **Chủ phòng bật/tắt chat** khi tạo phòng: thêm ô "Chat trong phòng: Bật / Tắt", mặc định **Bật**. Tắt thì không có khung chat và nút Chat ở mọi màn của phòng đó.

### 3.6 Dữ liệu và realtime
- Bảng `fb_chat_messages`: `id`, `room_id`, `match_id` (null nếu ở phòng chờ), `user_id`, `phien`, `text` (đã lọc), `created_at`, `reported` (bool).
- Gửi tin: realtime `fb.chat.send {room_id, text}`; server tự gắn `phien` theo trạng thái của người gửi (không tin số phiên từ trình duyệt).
- Mỗi lần một người bấm Phiên tiếp, server giao kèm các tin đã tới lượt của người đó.
- Vào lại phòng hoặc tải lại trang: nhận lại các tin đã tới lượt.
- Lưu **7 ngày** rồi xoá. Không có lịch sử chat trong Lịch sử đấu.

---

## 4. Cửa sổ kết quả: khoá 5 giây [THAY ĐỔI]

Giữ v2 §7.3. Thêm:

- Khi cửa sổ kết quả **hiện lần đầu**, hai nút **Về sảnh** và **Chơi lại** bị khoá **5 giây**:
  - Nút mờ, ghi đếm lùi: "Về sảnh (5)", "Chơi lại (5)" … "(1)".
  - Dưới nút: "Xem kết quả và chat với cả phòng. Sau {n} giây mới về sảnh hoặc chơi lại được."
  - Hết 5 giây: nút trở lại bình thường, dòng chữ ẩn.
- **Xem lại biểu đồ** và **Chat với phòng** bấm được ngay.
- Chỉ khoá **một lần**: đóng rồi mở lại cửa sổ (nút "Xem kết quả") không bắt chờ thêm.
- Áp dụng cả khi ván kết thúc do hết giờ.
- **Chơi lại** đưa cả phòng về phòng chờ (v2 §7.3); trạng thái Sẵn sàng của mọi người **về "Chưa sẵn sàng"** (§5).

---

## 5. Phòng chờ: Sẵn sàng [THAY ĐỔI]

Giữ v2 §4 (ID phòng, 4 ô thông số, ô người chơi, Rời phòng). Thay quy tắc Bắt đầu:

### 5.1 Nhãn trạng thái trên ô người chơi
- Chủ phòng: "👑 Chủ phòng".
- Người khác: **"Chưa sẵn sàng"** (nền đỏ nhạt) hoặc **"✓ Sẵn sàng"** (nền xanh nhạt, ô người chơi có viền xanh).
- Góc phải ô ID phòng: "{số người}/{tối đa} người · {số sẵn sàng}/{số người không phải chủ phòng} sẵn sàng".

### 5.2 Người không phải chủ phòng
- Nút **Sẵn sàng** (xanh lá) cạnh Rời phòng.
- Bấm thì chuyển sang "✓ Đã sẵn sàng · Huỷ" (viền xanh). Bấm lại để huỷ.
- Dòng gợi ý cạnh nút:
  - Chưa sẵn sàng: "Bấm Sẵn sàng để chủ phòng bắt đầu được."
  - Đã sẵn sàng, còn người chưa: "Chờ {n} người khác sẵn sàng, rồi chủ phòng bắt đầu."
  - Tất cả sẵn sàng: "Chờ chủ phòng bắt đầu."
- **Không đủ xu cược** thì không bấm Sẵn sàng được: báo "Không đủ {n} xu để chơi phòng này".

### 5.3 Chủ phòng
- Không có nút Sẵn sàng (chủ phòng luôn coi là sẵn sàng).
- Nút **Bắt đầu**:
  - **Khoá** khi còn người chưa sẵn sàng, ghi "Bắt đầu (chờ {n} người)", dòng gợi ý "Mọi người sẵn sàng thì mới bắt đầu được."
  - **Mở** khi tất cả người khác đã sẵn sàng: "Bắt đầu", gợi ý "Tất cả đã sẵn sàng."
  - Phòng **chỉ có chủ phòng**: mở ngay, gợi ý "Chỉ có bạn: ván chơi một mình, không cược." (giữ quy tắc chơi một mình của v2 §4).

### 5.4 Khi nào trạng thái đổi
- Người mới vào phòng: "Chưa sẵn sàng". Nút Bắt đầu khoá lại nếu đang mở.
- Người rời phòng: tính lại; nếu những người còn lại đều sẵn sàng thì nút Bắt đầu mở.
- Sau **Chơi lại**: mọi người về "Chưa sẵn sàng".
- **Chủ phòng rời phòng** (v2 §4, chuyển quyền cho người vào sớm nhất): người nhận quyền thành chủ phòng; trạng thái của những người khác giữ nguyên.
- Mọi thay đổi đẩy realtime tới cả phòng, kèm thông báo ngắn "{tên} đã sẵn sàng".

### 5.5 Server
- Lưu `ready` (bool) cho từng người trong phòng.
- Lệnh Bắt đầu: server kiểm tra **mọi người không phải chủ phòng đều `ready`**; sai thì từ chối, báo "Còn người chưa sẵn sàng".
- Giữ kiểm tra xu lúc bắt đầu (v2 §8).

---

## 6. Tiêu chí nghiệm thu
1. **Chú giải:** không có ô nền; tên chỉ báo đen ở giao diện sáng, trắng ở giao diện tối; con số đúng màu đường; đọc được khi đè lên nến.
2. **Lợi nhuận:** khung thứ 4 chỉ có %; mua bán, sang phiên thì đổi đúng; avatar không có %; API không trả % người khác.
3. **Chat trong ván:**
   - A đi trước B 8 phiên. A gửi ở phiên 22 thì B chỉ nhận khi B tới phiên 22; trước đó không gói tin nào xuống trình duyệt của B chứa tin này.
   - Số tin chưa đọc đúng; mở khung thì về 0.
   - Gửi 2 tin trong 2 giây thì tin thứ hai bị chặn. Tin trên 200 ký tự không gửi được.
   - Từ cấm thành `***`. Tắt tiếng một người thì chỉ mình không thấy tin của họ.
   - Chủ phòng tắt chat khi tạo phòng thì không có chat ở mọi màn.
4. **Chat phòng chờ:** máy tính luôn mở ở cột phải; điện thoại nằm dưới các nút; tin phòng chờ vẫn còn khi vào ván, nhãn "Phòng chờ".
5. **Kết quả:** Về sảnh, Chơi lại khoá đúng 5 giây có đếm lùi; Xem lại biểu đồ, Chat bấm được ngay; mở lại cửa sổ không khoá lại.
6. **Sẵn sàng:**
   - 3 người, chủ phòng + 2 người chưa sẵn sàng: Bắt đầu khoá, ghi "chờ 2 người".
   - Cả 2 bấm Sẵn sàng: Bắt đầu mở. Một người huỷ: khoá lại.
   - Người mới vào: khoá lại.
   - Gọi API Bắt đầu khi còn người chưa sẵn sàng: bị từ chối.
   - Chơi lại: mọi người về "Chưa sẵn sàng".
7. **Hiển thị:** đúng ở 1.366 px và 390 px, không tràn ngang, không có chữ xám.

---

## 7. Điểm cần chốt

| # | Điểm | Đề xuất |
|---|---|---|
| 1 | Chủ phòng mời người ra khỏi phòng (ví dụ người không bấm Sẵn sàng) | Chưa làm (giữ v2) |
| 2 | Người không bấm Sẵn sàng quá lâu | Không tự đuổi; phòng chờ vẫn tự đóng sau 30 phút (v2) |
| 3 | Tắt tiếng có giữ sang phòng khác không | Không, chỉ trong phòng hiện tại |
