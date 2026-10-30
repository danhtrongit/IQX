# Spec Flashback · v2 · Phòng chơi

> Ngày: 29/10/2026 · Không làm chống tài khoản phụ. Pháp lý cược xu đã được xác nhận.
>
> **Bản mẫu:** `IQX-Flashback-Phong-MAU.html`. Mở bằng trình duyệt là chơi được.
> - Dữ liệu giá là số tự sinh.
> - Danh sách phòng và người chơi khác là giả lập: bạn bè tự vào phòng, tự mua bán, tự hoàn thành.
> - Phòng có khoá trong bản mẫu dùng mật khẩu `1234`.
> - Ví xu lưu trên trình duyệt (khoá `iqx_fb_room_wallet`).
>
> **Thay thế:**
> - Toàn bộ phần Flashback (§2, §3, §4 phần Flashback) của `IQX-Flashback-SPEC-v1.md` (v1.1).
> - Toàn bộ `IQX-Flashback-SPEC-v1.2-BoSung.md` (đề tự động 2 ngày).
>
> **Giữ nguyên từ v1.1:** phần Kinh tế xu (§1: Shop, Premium, linh thú, đổi xu với tiền Demo), trừ các dòng liên quan phí tham gia và thưởng Flashback cũ.
>
> **Quy ước:**
> - **[THAY ĐỔI]** là điểm khác v1.1.
> - **[DECISION]** là điểm chủ sản phẩm cần chốt. Mỗi điểm đã có giá trị đề xuất; dev làm theo đề xuất cho tới khi có quyết định khác.

---

## 0. Tóm tắt thay đổi

| v1.1 (bỏ) | v2 (mới) |
|---|---|
| Cả hệ thống chung một đề, đổi đề 2 ngày một lần | **Người dùng tạo phòng**, 1–4 người, chơi với bạn bè hoặc một mình |
| Phí tham gia 100 xu, lần đầu miễn phí | **Cược xu giữa người chơi** trong phòng, người thắng nhận hết. Không có phí, không có lần đầu miễn phí |
| Bảng xếp hạng toàn IQX và nhóm, thưởng theo hạng | **Bỏ.** Chỉ xếp hạng trong phòng |
| 60 phiên lịch sử + 60 phiên chơi cố định | **Chủ phòng chọn** số phiên xem và số phiên chơi, mỗi loại tối thiểu 30 |
| Không bao giờ tiết lộ mã và giai đoạn | **Hiện mã và thời gian** ở màn kết quả |
| Chỉ báo mở theo tiến độ Học viện | **Mở đủ 16 chỉ báo**, không cần học |

---

## 1. Vị trí và luồng

- Mục **Flashback** ở thanh công cụ bên phải của HỌC VIỆN, giữ vị trí như v1.1.
- Luồng màn hình: **Sảnh → Phòng chờ → Màn chơi → Cửa sổ kết quả → Chơi lại / Về sảnh**.
- Ở sảnh và phòng chờ, vùng chính rộng hết cỡ, không có panel phải. Ở màn chơi thì panel phải là khung đặt lệnh.

---

## 2. Sảnh [THAY ĐỔI]

Bấm Flashback thì mở sảnh.

### 2.1 Thanh trên

| Thành phần | Hành vi |
|---|---|
| Ô **"Nhập ID phòng"** + nút **Vào phòng** | Nhập ID 6 chữ số bạn bè gửi. Enter cũng được. Sai định dạng: "ID phòng gồm 6 chữ số". Không có phòng: "Không tìm thấy phòng {ID}" |
| Nút **Chơi phòng bất kỳ** | Vào ngẫu nhiên một phòng thoả cả 4 điều kiện: đang chờ, không khoá, còn chỗ, mức cược không vượt số xu của người dùng. Không có phòng nào: "Chưa có phòng mở phù hợp, hãy tạo phòng" |
| Nút **＋ Tạo phòng** | Mở hộp tạo phòng (§3) |

### 2.2 Danh sách phòng

- Bộ lọc: **Tất cả · Đang chờ · Đang chơi**.
- Mỗi dòng gồm:
  - ID phòng, có biểu tượng ổ khoá nếu phòng có mật khẩu.
  - Avatar và tên chủ phòng.
  - "{phiên xem} / {phiên chơi} phiên · {thời gian} phút".
  - "{số người}/{tối đa} người".
  - Mức cược, hoặc "Không cược".
  - Cột cuối:
    - Phòng đang chờ còn chỗ: nút **Vào**.
    - Phòng đang chơi: nhãn "Đang chơi".
    - Phòng đã đủ người: nhãn "Đủ người".
- Thứ tự: phòng mới tạo lên trên.
- Danh sách tự cập nhật (realtime hoặc làm mới mỗi vài giây).
- Phòng đã kết thúc không hiện.

### 2.3 Vào phòng

Kiểm tra theo thứ tự:

1. Phòng đang chơi: báo "Phòng đang chơi, chưa vào được". Không vào xem được.
2. Phòng đủ người: "Phòng đã đủ người".
3. Không đủ xu cho mức cược: "Không đủ xu để vào phòng cược {n} xu".
4. Phòng có mật khẩu: mở hộp nhập mật khẩu. Sai thì báo "Mật khẩu không đúng".
5. Đạt cả 4 bước trên: vào phòng chờ.

**[DECISION] Mỗi tài khoản chỉ ở một phòng tại một thời điểm.** Đề xuất: có. Đang ở phòng khác thì phải rời phòng đó trước.

---

## 3. Tạo phòng [THAY ĐỔI]

| Trường | Kiểu | Mặc định | Ràng buộc |
|---|---|---|---|
| Số phiên xem | Số nguyên | 60 | 30–120 |
| Số phiên chơi | Số nguyên | 30 | 30–120 |
| Thời gian chơi | Ô chọn | 10 phút | 5, 10, 15, 20, 30, 45, 60 phút |
| Số người tối đa | Ô chọn | 4 người | 1, 2, 3, 4 |
| Xu cược mỗi người | Số nguyên | 100 | Tối thiểu 10, là bội số của 10, không vượt số xu chủ phòng đang có. Chọn 1 người thì ô bị khoá, không cược |
| Mật khẩu phòng | Chữ | Trống | Không bắt buộc. Có nhập thì dài 4–12 ký tự |

- Báo lỗi một dòng ngay trong hộp, ví dụ "Số phiên xem phải từ 30 đến 120". Không có chữ hướng dẫn phụ dưới các ô.
- Tạo xong:
  - Hệ thống cấp **ID phòng 6 chữ số**, duy nhất trong các phòng đang mở.
  - Người tạo là **chủ phòng** và vào phòng chờ ngay.
- Không giới hạn mức cược tối đa, chỉ cần không vượt số xu đang có.

---

## 4. Phòng chờ [THAY ĐỔI]

- **Trên cùng:**
  - ID phòng cỡ chữ lớn, kèm biểu tượng ổ khoá nếu có mật khẩu.
  - Nút **Sao chép ID**.
- **4 ô thông số:** Phiên xem, Phiên chơi, Thời gian, Cược.
- **4 ô người chơi:**
  - Ô có người: avatar và tên. Chủ phòng có thêm nhãn "Chủ phòng".
  - Ô trống trong giới hạn số người: "Đang chờ người chơi".
  - Ô vượt số người tối đa: mờ.
- **Nút:**
  - **Rời phòng**: ai cũng có.
  - **Bắt đầu**: chỉ chủ phòng thấy.
- **Bắt đầu:**
  - Chỉ chủ phòng bắt đầu được, lúc nào cũng được, kể cả khi chưa đủ số người tối đa.
  - Bắt đầu khi trong phòng chỉ có chủ phòng: ván **chơi một mình, không cược**, không trừ xu.
- Không có khung hướng dẫn hay chữ giải thích trong phòng chờ.
- Có người vào hoặc rời phòng: hiện thông báo ngắn, ví dụ "minhkhoa đã vào phòng".

**[DECISION] Chủ phòng rời phòng chờ.** Đề xuất: chuyển quyền chủ phòng cho người vào sớm nhất. Không còn ai thì đóng phòng.

**[DECISION] Phòng chờ quá lâu.** Đề xuất: tự đóng sau 30 phút nếu chưa bắt đầu.

**[DECISION] Chủ phòng mời người ra khỏi phòng chờ.** Đề xuất: chưa làm ở bản này.

---

## 5. Dữ liệu ván chơi [THAY ĐỔI]

- Khi chủ phòng bấm Bắt đầu, server chọn:
  - **Ngẫu nhiên một mã trong rổ VN30 hiện hành.**
  - **Ngẫu nhiên một giai đoạn** có đủ số phiên xem + số phiên chơi liên tục, cộng 252 phiên khởi tạo chỉ báo (chỉ dùng để tính, không vẽ).
- Điều kiện giai đoạn: dùng lại §4.2 và §4.3 của spec v1.2-BoSung.
  - Từ 2012 trở đi, cách hiện tại ít nhất 12 tháng.
  - Liên tục, có thanh khoản, đủ dao động, dữ liệu sạch.
  - Bỏ điều kiện "không trùng giai đoạn với đề cũ".
- Giá đã điều chỉnh theo cổ tức và chia tách. Mọi người trong phòng nhận **đúng một bộ dữ liệu**.
- **Trong lúc chơi không gửi tên mã, ngày thật hay giá chưa điều chỉnh xuống trình duyệt.** Trục thời gian không có ngày.
- Mã và thời gian chỉ gửi xuống **sau khi ván kết thúc**, để hiện ở cửa sổ kết quả.

---

## 6. Màn chơi [THAY ĐỔI]

### 6.1 Thanh người chơi (trên cùng)

- Mỗi người chơi một cụm: **avatar, tên, dưới tên là % lợi nhuận**.
  - % có nền xanh khi dương, đỏ khi âm.
  - Người đang dẫn đầu có viền vàng quanh avatar.
  - Dòng của chính mình có nền xanh nhạt.
- **Đồng hồ chung của phòng** đặt ở giữa thanh, dạng `mm:ss`.
  - Còn dưới 1 phút thì chuyển màu đỏ.
  - Hết ván thì ghi "Kết thúc".
- **% lợi nhuận** = tổng tài sản / 10.000.000 − 1.
  - Thay đổi khi người đó mua bán (vì phí, thuế) và khi giá đổi theo phiên.
- **% của người khác chỉ tính tới phiên mình đang xem.** Ví dụ mình ở phiên 10, người kia ở phiên 20: hiện % của người kia tại phiên 10. Như vậy người đi trước không làm lộ giá các phiên mình chưa mở.
  - Server trả lịch sử tài sản từng phiên của mỗi người, client hiện giá trị tại `min(phiên của họ, phiên của mình)`.
  - **[DECISION]** Chủ sản phẩm xác nhận cách này. Phương án khác: hiện % theo phiên của chính họ (có thể lộ giá tương lai).

### 6.2 Phần còn lại

- **3 ô số liệu:**
  - Phiên x / {số phiên chơi}, kèm thanh tiến độ.
  - Tổng tài sản.
  - Tiền mặt.
  - **Bỏ ô Lợi nhuận**, vì % đã hiện dưới tên ở thanh người chơi.
- **Biểu đồ nến, khối lượng, chú giải, điểm mua bán, phím tắt, thanh nút đáy trên điện thoại:** như v1.1 §2.5.
  - Trục ngang đủ số phiên xem + số phiên chơi.
  - Nhãn trục: "Lịch sử {n} phiên", "Phiên 1", phiên giữa, "Phiên {số phiên chơi}".
- **Nhịp chơi:** mỗi người **tự bấm "Phiên tiếp"**, không chờ người khác.
- **Ở phiên cuối**, nút đổi thành **"Hoàn thành"**. Bấm thì:
  - Biểu đồ phủ khung "Chờ người chơi khác · Còn n người đang chơi".
  - Nút đáy ghi "Đã hoàn thành".
  - Không đặt lệnh được nữa.
- Không có nhãn phòng, nhãn mã ẩn hay chữ giải thích nào khác trên màn chơi.

### 6.3 Đặt lệnh

Giữ nguyên v1.1 §2.6:
- Giá khớp là giá đóng cửa phiên đang hiện.
- Nhập số cổ phiếu, cho mua bán lẻ.
- Phí 0,15% mỗi chiều, thuế bán 0,1%.
- T+2.
- Đặt lệnh được từ Phiên 0 tới phiên cuối.
- Vốn mỗi người mỗi ván: **10.000.000**.

Panel phải gồm:
- Khung đặt lệnh.
- Cổ phiếu đang giữ.
- Lệnh đã khớp.

Không có tab Xếp hạng.

### 6.4 Chỉ báo [THAY ĐỔI]

- **Mở đủ 16 chỉ báo cho mọi người**, không phụ thuộc tiến độ Học viện. Bỏ liên kết `academy_grants` của Flashback.
- Bỏ ô "Bản mẫu · giả lập tiến độ Học viện".
- Hộp "Các chỉ báo", thêm nhiều lần cùng một chỉ báo, nút ẩn/cài đặt/xóa, hộp cài đặt, bảng tham số: giữ nguyên v1.1 §2.7.
- **Chiều cao khung [THAY ĐỔI]:**

  | Khung | Máy tính | Điện thoại |
  |---|---|---|
  | Ô chỉ báo riêng (RSI, MACD, Stochastic…) | 130px | 110px |
  | Ô giá | 300px | 240px |
  | Ô khối lượng | 90px | 70px |

  - Thêm chỉ báo thì **biểu đồ dài thêm** và trang cuộn được. Không ép các khung nhỏ lại.
- **Chú giải không bị che [THAY ĐỔI]:**
  - Mỗi khung có **dải đầu riêng** cho dòng chú giải (tên, thông số, giá trị, nút ẩn/cài đặt/xóa). Đường vẽ nằm bên dưới dải này, không đè lên chữ.
  - Ô giá chừa một dòng cho O/H/L/C (hai dòng trên điện thoại), cộng một dòng cho mỗi chỉ báo vẽ trên ô giá.
  - Ô khối lượng chừa một dòng, cộng một dòng nếu bật chỉ báo Khối lượng.

---

## 7. Kết thúc ván [THAY ĐỔI]

### 7.1 Khi nào kết thúc

Ván kết thúc khi **mọi người đã bấm Hoàn thành**, hoặc **hết giờ**, tuỳ điều nào đến trước.

**Hết giờ:**
- Ai chưa tới phiên cuối thì **tự kéo tới phiên cuối**. Giữ nguyên tiền mặt và cổ phiếu đang có, không tự bán.
- Lợi nhuận tính tại giá đóng cửa **phiên cuối**.
  - Ví dụ chơi 30 phiên, mua ở phiên 10, mới bấm tới phiên 20 thì hết giờ: tính tài sản với giá phiên 30.
- Cổ phiếu chưa về (chưa đủ T+2) vẫn tính vào tài sản.
- Hiện thông báo ngắn "Hết giờ".

**[DECISION] Người thoát hoặc mất mạng giữa ván.** Đề xuất:
- Vẫn tính như người còn chơi: giữ nguyên vị thế, tính tại phiên cuối.
- Xu cược không hoàn.
- Vào lại trong giờ thì chơi tiếp từ phiên đang dở.

### 7.2 Xếp hạng và xu

- Xếp theo % lợi nhuận cuối ván, cao xếp trên.
- **Hoà:** cùng % sau khi làm tròn 2 chữ số thập phân. Người hoà cùng hạng.
- **Người thắng** là tất cả người cùng hạng 1.
- **Xu:**
  - Tổng cược = mức cược × số người chơi.
  - Người thắng nhận toàn bộ.
  - Hoà thì chia đều, làm tròn xuống. Phần lẻ còn dư không trả cho ai.
- **IQX không thu phí phòng.**
- Ván chơi một mình: không cược, không xu.

**[DECISION] Hoà khi không ai giao dịch.** Mọi người cùng 0%, ai cũng nhận lại đúng số đã cược. Đề xuất: ghi "Hoàn xu cược" thay cho "+n xu". Bản mẫu đang ghi "+n xu".

### 7.3 Cửa sổ kết quả

| Phần | Nội dung |
|---|---|
| Tiêu đề | "{tên} thắng", "Bạn thắng", "Hoà", hoặc "Kết quả" khi chơi một mình |
| Bảng xếp hạng | Mỗi dòng: hạng, avatar, tên, % lợi nhuận. **Chỉ dòng người thắng có thêm "+{xu nhận} xu"**. Không ghi xu mất của người thua, không ghi phép tính cược. Dòng của mình có viền xanh |
| Mở mã | **Mã cổ phiếu** và **Thời gian** (ngày phiên xem đầu tiên – ngày phiên chơi cuối cùng) |
| Nút | **Xem lại biểu đồ · Về sảnh · Chơi lại** |

- **Xem lại biểu đồ:**
  - Đóng cửa sổ, xem toàn bộ biểu đồ.
  - Nút đáy đổi thành **"Xem kết quả"** để mở lại cửa sổ.
- **Về sảnh:** rời phòng, về sảnh.
- **Chơi lại:**
  - Quay về phòng chờ của **chính phòng đó**: giữ ID, thiết lập và người chơi.
  - Chủ phòng bấm Bắt đầu thì server chọn **mã và giai đoạn mới**.
  - Không đủ xu cược thì báo "Không đủ {n} xu để chơi lại" và về sảnh.
  - **[DECISION]** Ai không muốn chơi tiếp thì bấm Rời phòng ở phòng chờ. Người mới vẫn vào được bằng ID nếu còn chỗ.

---

## 8. Xu cược và ví

- **Trừ xu cược khi chủ phòng bấm Bắt đầu**, không trừ lúc vào phòng.
  - Rời phòng chờ không mất xu.
  - Lúc bắt đầu, server kiểm tra lại số xu từng người. Ai không đủ thì bị đưa ra khỏi phòng trước khi bắt đầu, kèm thông báo cho người đó.
- Cộng xu cho người thắng ngay khi ván kết thúc.
- Mọi thay đổi xu ghi vào `xu_ledger`, `reason` thuộc `{flashback_stake, flashback_win, flashback_refund}`.
- Mỗi người chỉ bị trừ cược **một lần** mỗi ván, nhận thưởng **một lần**. Dùng khoá duy nhất `(match_id, user_id, reason)`.

---

## 9. Chống gian lận

1. **Server là nguồn chuẩn:**
   - Server chỉ gửi nến kế tiếp sau khi ghi nhận lệnh "Phiên tiếp" của người đó.
   - Mọi lệnh mua bán kiểm tra trên server: đủ tiền, đủ cổ phiếu đã về, đúng phiên, giá lấy từ server.
   - Đồng hồ tính trên server.
2. **Không lộ dữ liệu:** không gửi mã, ngày, giá chưa điều chỉnh hay nến tương lai trước khi ván kết thúc. % người khác theo §6.1.

---

## 10. Dữ liệu và API gợi ý

### 10.1 Bảng

| Bảng | Trường chính |
|---|---|
| `fb_rooms` | `id` (6 chữ số), `owner_id`, `view_bars` (30–120), `play_bars` (30–120), `minutes`, `max_players` (1–4), `stake_xu`, `password_hash`, `status` ∈ {waiting, playing, closed}, `created_at` |
| `fb_room_members` | `room_id`, `user_id`, `joined_at`, `left_at` |
| `fb_matches` | `id`, `room_id`, `symbol` (chỉ server), `start_date` (chỉ server), `warmup_bars`, `bars`, `started_at`, `ends_at`, `status` ∈ {playing, finished, paid}, `pot_xu` |
| `fb_entries` | `match_id`, `user_id`, `stake_xu`, `step`, `cash`, `nav_by_step[]`, `finished_at`, `final_nav`, `pnl_pct`, `rank`, `win_xu` |
| `fb_lots`, `fb_orders` | Như `flashback_lots`, `flashback_orders` của v1.1, đổi `entry_id` sang `fb_entries` |
| `xu_ledger` | Như v1.1, thêm `reason` mới ở §8 |

Bảng của bản cũ (`flashback_rounds`, bảng xếp hạng toàn IQX, tác vụ đổi đề 2 ngày): ngừng dùng, giữ dữ liệu lịch sử.

### 10.2 API

| Endpoint | Hành vi |
|---|---|
| `GET fb/rooms?status=` | Danh sách phòng cho sảnh |
| `POST fb/rooms` | Tạo phòng theo §3, trả ID |
| `POST fb/rooms/random-join` | Vào ngẫu nhiên theo §2.1 |
| `POST fb/rooms/:id/join` | Kèm `password` nếu có. Lỗi: `ROOM_PLAYING`, `ROOM_FULL`, `XU_INSUFFICIENT`, `WRONG_PASSWORD`, `ALREADY_IN_ROOM` |
| `POST fb/rooms/:id/leave` | Rời phòng chờ |
| `POST fb/rooms/:id/start` | Chỉ chủ phòng. Trừ cược, chọn mã và giai đoạn, tạo ván, trả nến lịch sử và dữ liệu khởi tạo chỉ báo |
| `POST fb/matches/:id/next` | Tăng `step` của người gọi, trả nến kế tiếp |
| `POST fb/matches/:id/orders` | `side`, `qty`. Kiểm tra và khớp như v1.1 |
| `POST fb/matches/:id/finish` | Người gọi bấm Hoàn thành |
| `GET fb/matches/:id/state` | Đồng hồ, % từng người theo §6.1, ai đã hoàn thành |
| `GET fb/matches/:id/result` | Chỉ sau khi kết thúc: xếp hạng, xu, **mã và thời gian** |
| `POST fb/rooms/:id/replay` | Đưa phòng về trạng thái chờ để chơi lại |

- Cập nhật phòng chờ và thanh người chơi qua realtime (WebSocket hoặc tương đương).
- **Tác vụ kết thúc ván** chạy khi hết giờ hoặc khi người cuối cùng hoàn thành:
  1. Kéo người chưa xong tới phiên cuối.
  2. Xếp hạng.
  3. Cộng xu.
  4. Đổi trạng thái ván sang `paid`.
- Tác vụ chạy lại nhiều lần vẫn không cộng xu hai lần.

---

## 11. Tiêu chí nghiệm thu

1. **Sảnh:**
   - Lọc đúng.
   - Vào bằng ID đúng, báo lỗi đúng với phòng không có, đang chơi, đủ người, sai mật khẩu, thiếu xu.
   - "Chơi phòng bất kỳ" chỉ vào phòng không khoá, còn chỗ, đủ xu.
2. **Tạo phòng:**
   - Chặn phiên xem hoặc phiên chơi dưới 30 hoặc trên 120.
   - Chặn cược không phải bội số 10, hoặc vượt số xu đang có.
   - Chọn 1 người thì khoá ô cược.
3. **Phòng chờ:**
   - Chỉ chủ phòng thấy nút Bắt đầu.
   - Bắt đầu khi chỉ có một người thì không trừ xu.
4. **Dữ liệu:**
   - Mã thuộc VN30.
   - Đủ phiên theo thiết lập.
   - Mọi người cùng một bộ nến.
   - Không có mã, ngày hay nến tương lai trong phản hồi API trước khi ván kết thúc.
5. **Thanh người chơi:**
   - % đổi khi mua bán và khi sang phiên.
   - % người khác không vượt quá phiên mình đang xem.
   - Đồng hồ giống nhau ở mọi người.
6. **Hết giờ:** chơi 30 phiên, mua ở phiên 10, dừng ở phiên 20 khi hết giờ: kết quả tính theo giá phiên 30, giữ nguyên số cổ phiếu.
7. **Xu:**
   - Phòng 4 người cược 100: người thắng +400.
   - Hai người hoà hạng 1: mỗi người +200.
   - Không cộng hai lần khi tác vụ chạy lại.
8. **Kết quả:**
   - Đúng tiêu đề.
   - Chỉ dòng người thắng có xu.
   - Hiện mã và thời gian.
   - Ba nút hoạt động đúng. Chơi lại giữ ID và người chơi, ra mã mới.
9. **Chỉ báo:**
   - Đủ 16 chỉ báo khi chưa học bài nào.
   - Bật cùng lúc MA, Bollinger, RSI, MACD, Stochastic: mỗi khung chỉ báo cao đúng §6.4, chữ chú giải không bị đường vẽ che, biểu đồ dài thêm và cuộn được.
10. **Hiển thị:** đúng ở màn hình 390px, không tràn ngang. Không có chữ xám.

---

## 12. Điểm cần chốt

| # | Điểm | Đề xuất |
|---|---|---|
| 1 | Một tài khoản chỉ ở một phòng (§2.3) | Có |
| 2 | Chủ phòng rời phòng chờ (§4) | Chuyển cho người vào sớm nhất |
| 3 | Phòng chờ quá lâu (§4) | Tự đóng sau 30 phút |
| 4 | Mời người ra khỏi phòng (§4) | Chưa làm |
| 5 | % người khác (§6.1) | Tính tới phiên mình đang xem |
| 6 | Thoát giữa ván (§7.1) | Tính tại phiên cuối, không hoàn cược |
| 7 | Hoà cả phòng ở 0% (§7.2) | Ghi "Hoàn xu cược" |
| 8 | Ai không chơi lại (§7.3) | Tự bấm Rời phòng |
