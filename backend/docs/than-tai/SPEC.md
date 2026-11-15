# Spec · Lắc quẻ Thần Tài: gieo quẻ, dự đoán VNINDEX, cầu mã (IQX web)

Nov 14, 2026 · @IQX

## Mục tiêu và phạm vi

Trên web IQX, mỗi người được khấn Thần Tài một lượt mỗi ngày, trước 11:30, gồm 4 bước theo đúng thứ tự: lắc ống xăm gieo quẻ, dự đoán VNINDEX, cầu tối đa 3 mã, rồi xem kết quả cả sàn. Quẻ viết theo lối thầy phong thủy: một quẻ Kinh Dịch kèm hào động, lời thầy luận về cách giao dịch, và ngành hợp, ngành kiêng theo ngũ hành của ngày.

Giao diện bám theo HTML mẫu IQX-Gieo-Que-Kinh-Dich-MAU.html gửi kèm, phong cách điện thờ sơn son thếp vàng.

**Đã bỏ:** mọi hiệu ứng theo giá mã đã cầu (mã +3% "Thần Tài kề bên", chạm trần "Thần Tài giáng lâm").

## Luồng người dùng

1. Người dùng mở **Tượng Thần Tài** trong Khu giao dịch, thấy điện thờ và nút **🙏 Thành tâm khấn**.
2. **Bước 1 · Gieo quẻ:** bấm **Lắc ống xăm**, ống rung khoảng 1,5 giây, một que bay ra, lá quẻ Kinh Dịch lật mở và ấn hạng đóng xuống; bấm "🔮 Xin thầy luận" để đọc phần luận và ngành hợp, ngành kiêng. Bấm **Tiếp: Dự đoán VNINDEX**.
3. **Bước 2 · Dự đoán VNINDEX:** chọn Tăng, Đi ngang hoặc Giảm rồi bấm **Xác nhận dự đoán**.
4. **Bước 3 · Cầu mã:** tìm và dâng 1–3 mã vào 3 ô nén vàng rồi bấm **Dâng lễ cầu N mã**, hoặc bấm **Bỏ qua**.
5. **Bước 4 · Kết quả:** mưa đồng xu, hào quang tượng sáng hơn, hiện kết quả dự đoán và top 5 mã được cầu của cả sàn. Bấm **Hoàn tất**.
6. Trong cùng ngày, bấm **Xem quẻ và kết quả hôm nay** để xem lại quẻ và kết quả, không chạy lại hiệu ứng.

Đóng cửa sổ giữa chừng thì những bước đã xác nhận được giữ; mở lại sẽ vào thẳng bước còn dở (nút đổi thành **🙏 Khấn tiếp**).

## Quy tắc chung và bước 1 · Gieo quẻ

Mỗi tài khoản được một lượt khấn mỗi ngày, trước 11:30. Các bước đi đúng thứ tự, không gieo lại quẻ và không đổi lựa chọn sau khi xác nhận.

- **Một lượt mỗi ngày:** ngày tính theo giờ Việt Nam (UTC+7), qua 00:00 thì được khấn lại.
- **Hạn 11:30:** mọi bước phải xác nhận trước 11:30. Qua 11:30, lượt đang dở dàng khép lại: bước đã xác nhận vẫn được tính, bước chưa làm thì bỏ. Server kiểm tra giờ, không tin giờ máy.
- **Thứ tự cố định:** gieo quẻ → dự đoán VNINDEX → cầu mã → kết quả. Không bỏ qua bước 1 và 2; chỉ bước 3 được bỏ qua.
- **Không gieo lại, không đổi:** quẻ, dự đoán và mã cầu chốt ngay khi server nhận, kể cả khi người dùng đóng cửa sổ, tải lại trang hay đổi thiết bị.
- **Server quyết định quẻ:** trình duyệt chỉ chạy hiệu ứng, không tự random. Bấm nhanh nhiều lần hay gọi API song song vẫn chỉ ra một quẻ.
- **Không tính điểm:** không chấm đúng sai dự đoán, không xếp hạng người dùng.

**Tỷ lệ hạng quẻ** (random theo trọng số, rồi rút một lá trong hạng đó):

| Hạng | Tỷ lệ | Màu ấn |
| --- | --- | --- |
| Đại cát | 35% | Đỏ son #C81E1E |
| Thượng cát | 30% | Cam đất #C2410C |
| Trung cát | 20% | Xanh lá #15803D |
| Tiểu cát | 10% | Xanh ngọc #0E7490 |
| Thận trọng | 5% | Tím #6B5B95 |

- **Một lá = một quẻ + một hào động.** Hạng gán cho từng lá chứ không gán cho cả quẻ, vì cùng một quẻ có hào tốt, hào xấu. Ban đầu xếp hạng theo tính cát hung của quẻ và lời hào, nội dung có thể sửa trong quản trị.
- **Hạng thiếu lá:** nếu hạng vừa rút chưa có lá nào đang bật, rút lại hạng khác theo cùng tỷ lệ.
- **Không lặp lá:** với mỗi người, một lá không ra lại cho tới khi mọi lá cùng hạng đã ra hết; hết vòng thì xóa danh sách đã ra của hạng đó và bắt đầu lại.
- **Không còn bộ quẻ riêng ngày Vía Thần Tài.**

## Bước 2 · Dự đoán VNINDEX

Người dùng chọn một trong ba hướng cho giá đóng cửa VNINDEX hôm nay so với tham chiếu.

| Lựa chọn | Định nghĩa | Màu |
| --- | --- | --- |
| Tăng | Đóng cửa cao hơn tham chiếu | Xanh #16A34A |
| Đi ngang | Thay đổi đúng bằng 0 | Vàng #CA8A04 |
| Giảm | Đóng cửa thấp hơn tham chiếu | Đỏ #DC2626 |

- Hiển thị giá tham chiếu VNINDEX của phiên (ví dụ "Tham chiếu 1.746,90").
- Bấm một ô là chọn (ô phát sáng theo màu), bấm ô khác để đổi; chỉ chốt khi bấm **Xác nhận dự đoán**. Dòng nhắc: "Xác nhận xong thì không đổi được."

## Bước 3 · Cầu mã

Người dùng dâng tối đa 3 mã bất kỳ để cầu, hoặc bỏ qua bước này.

- Ô tìm kiếm theo mã hoặc tên công ty, gợi ý tối đa 8 kết quả, mỗi dòng có mã, tên và sàn. Mã đã chọn không hiện lại trong gợi ý.
- Phạm vi mã: mọi cổ phiếu trên HOSE, HNX và UPCoM.
- Mã chọn rơi vào 3 ô hình nén vàng (ô trống viền nét đứt). Trước khi dâng có thể bỏ mã bằng ✕; đủ 3 mã thì ô tìm bị khoá.
- Nút **Dâng lễ cầu N mã** mờ khi chưa có mã; nút **Bỏ qua** luôn bấm được. Dâng xong không đổi được.

## Bước 4 · Kết quả

Kết quả cho biết cả sàn đang nghĩ gì, tính tới thời điểm xem.

- **Thẻ quẻ thu nhỏ** của người dùng ở đầu, bấm để xem lại lá quẻ.
- **Dự đoán VNINDEX:** tổng số người đã dự đoán, thanh chia 3 màu theo %, chú thích số người từng hướng; hướng người dùng chọn được tô vàng kèm "· bạn". Phần trăm dưới 10% không in số trong thanh.
- **Top 5 mã được cầu nhiều nhất:** hạng 1–3 có huy chương vàng, bạc, đồng; mỗi dòng có thanh độ dài theo số người và số người cầu. Mã người dùng đã cầu được tô vàng. Dưới bảng ghi "Bạn đã cầu: …" hoặc "không cầu mã".
- Người chưa khấn chỉ xem được kết quả sau 11:30 (nút **Xem kết quả cả sàn**).

## Nội dung một lá quẻ

Mỗi lá gồm phần theo quẻ (64 quẻ), phần theo hào động (384 lá) và phần máy tự điền theo ngày. Đội content chỉ viết hai phần đầu.

| Phần | Nguồn | Quy định | Ví dụ |
| --- | --- | --- | --- |
| Dòng ngày | Máy | Can chi ngày âm lịch + hành nạp âm, nhãn màu theo hành | Thủy · Ngày Bính Ngọ · Thiên Hà Thủy |
| Hạng | Theo lá | Ấn son góc phải | Thận trọng |
| Chữ Hán + tên quẻ | Theo quẻ | Tên Hán Việt đầy đủ của quẻ kép | 水雷屯 · Thủy Lôi Truân |
| Hình 6 hào | Theo quẻ | Vẽ từ dưới lên; hào động tô đỏ có vòng tròn; ghi quẻ đơn trên và dưới | ☵ Khảm trên · ☳ Chấn dưới |
| Tượng | Theo quẻ | 1 câu, tối đa 20 từ, in nghiêng | Sấm động dưới mây dày, mầm cây đội đất mà chưa lên được. |
| Thoán | Theo quẻ | Kinh văn Hán Việt + nghĩa 1 câu | "Truân, nguyên hanh lợi trinh…" |
| Hào động | Theo lá | Tên hào + kinh văn + nghĩa 1 câu | Lục Tam · "Tức lộc vô ngu…" |
| Thầy luận | Theo lá | 50–80 từ, nối ý quẻ và hào với cách giao dịch | Đuổi theo con hươu mình không hiểu đường đi… |
| Ngành hợp, ngành kiêng | Máy | Theo hành ngày, xem mục Ngũ hành ngày và ngành | Hợp: Thổ, Kim · Kiêng: Thủy, Mộc |
| Màu hợp, hướng | Máy | Theo hành ngày | Vàng đất, Nâu · Đông Bắc |
| Lời thầy chốt | Theo lá | Tối đa 12 chữ, dùng được làm caption | Không hiểu đường rừng, chớ đuổi hươu. |

- **Hiển thị hai lớp:** lật quẻ ra thấy từ dòng ngày tới hào động. Bấm **🔮 Xin thầy luận** mới hiện thầy luận, ngành hợp, ngành kiêng, màu, hướng và lời chốt. Xem lại trong ngày thì hiện đủ ngay.
- **Giới hạn nội dung:** thầy luận và lời chốt không nêu mã, không dự báo giá hay chỉ số, chỉ nói về cách giao dịch và tâm thế.
- **Kinh văn:** câu Thoán và lời hào phải đối chiếu với một bản dịch Kinh Dịch chuẩn trước khi lên web.

## Ngũ hành ngày và ngành

Mỗi ngày có một hành, lấy theo nạp âm của can chi ngày âm lịch (giờ Việt Nam). Từ hành ngày, máy tự tính ngành hợp, ngành kiêng, màu và hướng, giống nhau cho mọi người trong ngày.

**Ngành theo hành** (cấu hình trong quản trị):

| Hành | Ngành |
| --- | --- |
| Kim | Ngân hàng, chứng khoán, bảo hiểm, thép và kim loại, vàng bạc, ô tô và máy móc |
| Mộc | Gỗ, giấy, cao su, nông nghiệp và phân bón, dệt may, dược phẩm, giáo dục |
| Thủy | Thủy sản, cảng biển và vận tải biển, logistics, nước sạch, đồ uống, du lịch |
| Hỏa | Điện, dầu khí, xăng dầu, công nghệ và viễn thông, truyền thông, hàng điện tử |
| Thổ | Bất động sản, khu công nghiệp, xây dựng, xi măng và vật liệu, khoáng sản |

**Hợp, kiêng, màu và hướng theo hành ngày.** Hợp = cùng hành với ngày và hành được ngày sinh ra; kiêng = hành bị ngày khắc và hành khắc ngày.

| Ngày hành | Ngành hợp | Ngành kiêng | Màu hợp | Hướng |
| --- | --- | --- | --- | --- |
| Kim | Kim, Thủy | Mộc, Hỏa | Trắng, Vàng ánh kim | Tây |
| Mộc | Mộc, Hỏa | Thổ, Kim | Xanh lá, Xanh rêu | Đông |
| Thủy | Thủy, Mộc | Hỏa, Thổ | Đen huyền, Xanh lam | Bắc |
| Hỏa | Hỏa, Thổ | Kim, Thủy | Đỏ, Tím | Nam |
| Thổ | Thổ, Kim | Thủy, Mộc | Vàng đất, Nâu | Đông Bắc |

- Trên lá quẻ, mỗi hành hiện tối đa 4 ngành tiêu biểu. Chỉ ghi tên ngành, không bao giờ ghi mã.
- Ngay dưới khối ngành luôn có dòng: "Luận theo ngũ hành, mang tính tham khảo vui."

## Giao diện và hiệu ứng

Phong cách bàn thờ sơn son thếp vàng trên nền tối; mọi chi tiết bám theo HTML mẫu. Font: Be Vietnam Pro cho chữ thường, Noto Serif cho tên quẻ, thơ và hoành phi.

**Điện thờ (màn chính)**

- Nền đỏ sẫm với hoạ tiết mây chìm, độ mờ 7%.
- Hai đèn lồng 福 và 祿 đung đưa chậm (chu kỳ 4 giây).
- Hoành phi "THẦN TÀI · LỘC ĐẾN · TÀI VƯỢNG".
- Tượng Thần Tài vẽ SVG, hào quang phía sau "thở" theo chu kỳ 4,5 giây; sau khi gieo, hào quang sáng hơn.
- Bàn thờ khắc 福 祿 壽, hai cây nến lập lòe, bát hương ba nén tỏa khói, thỏi vàng.
- Dưới bàn thờ: dòng trạng thái, nút chính (vàng, có ánh sáng lướt qua) và chip quẻ hôm nay khi đã gieo.

**Cửa sổ gieo quẻ**

- Khung sơn mài viền vàng, rộng tối đa 600 px, trên cùng là 4 ấn son hình thoi đánh số bước (bước đang làm đỏ sáng, bước xong viền vàng); đóng bằng ✕, phím Esc hoặc bấm ra ngoài.
- **Ống xăm:** ống tre chữ "XĂM", 8 que đầu đỏ. Khi lắc: ống rung qua lại ±10° trong 1,5 giây, một que bay vọt lên rồi mờ đi (\~1 giây).
- **Lá quẻ:** mặt sau đỏ có chữ 卦, lật 3D sang mặt giấy (0,9 giây). Ấn hạng đóng xuống sau khi lật xong, màu ấn theo hạng.
- **Quẻ Đại cát:** lá quẻ có viền sáng vàng, ánh sáng lướt qua 2 lần, kèm mưa đồng xu khoảng 3 giây.
- Các hạng khác chỉ có lật quẻ và đóng ấn.

**Hoàn tất lượt khấn**

- Sau bước 3 (dâng lễ hoặc bỏ qua): mưa đồng xu khoảng 3 giây, hào quang tượng chuyển sáng và giữ sáng tới hết ngày.
- Không có hiệu ứng nào theo giá của mã đã cầu.

**Hiển thị**

- Máy tính và điện thoại từ 360 px trở lên, không cuộn ngang.
- Người dùng bật "giảm chuyển động" trong hệ điều hành: tắt mọi hiệu ứng, quẻ hiện ngay.

## Trạng thái màn hình

Điện thờ có bốn trạng thái, quyết định bởi việc đã gieo hôm nay chưa và giờ hiện tại.

| Trạng thái | Dòng trạng thái | Nút | Bấm nút |
| --- | --- | --- | --- |
| Chưa khấn, trước 11:30 | Mỗi ngày một lần, trước 11:30. | 🙏 Thành tâm khấn | Mở bước 1 |
| Đang khấn dở, trước 11:30 | Bạn đang khấn dở. Thành tâm làm tiếp nhé. | 🙏 Khấn tiếp | Mở bước còn dở |
| Đã khấn xong | Lễ đã dâng. Lộc hôm nay đã về với bạn. + chip quẻ, dự đoán, mã đã cầu | Xem quẻ và kết quả hôm nay | Mở lá quẻ (đủ phần luận), xem tiếp kết quả |
| Chưa khấn hoặc dở, sau 11:30 | Đã qua giờ khấn hôm nay. Hẹn bạn sáng mai. / Đã qua 11:30, lượt khấn dở dang khép lại. | Xem kết quả cả sàn | Mở bước 4 |

Đồng hồ trên điện thờ luôn hiện giờ, hạn 11:30, can chi và hành của ngày.

**Trường hợp biên**

- Đang mở cửa sổ lúc qua 11:30: bấm lắc hoặc xác nhận báo "Đã qua 11:30, không khấn tiếp được" và đóng cửa sổ.
- Đã bấm lắc trước 11:30 nhưng hiệu ứng chạy qua mốc: quẻ vẫn hợp lệ.
- Đóng cửa sổ hoặc tải lại trang giữa chừng: bước đã xác nhận giữ nguyên, mở lại vào thẳng bước còn dở.
- Lỗi mạng khi gửi một bước: dừng hiệu ứng, báo "Chưa gửi được, bạn thử lại nhé" và cho bấm lại (server chưa ghi bước đó).

## Dữ liệu và API

Bốn API theo bốn bước, một bảng lưu lượt khấn trong ngày và một thư viện quẻ do quản trị sửa.

**API**

| API | Việc | Trả về |
| --- | --- | --- |
| `GET /than-tai/today` | Trạng thái hôm nay khi mở điện thờ | `status` (chua\_khan · dang\_do · da\_xong · het\_gio), `step` còn dở, `server_time`, `ngay` (can chi, nạp âm, hành), `vnindex_ref`, các phần đã chốt |
| `POST /than-tai/que/draw` | Bước 1: gieo quẻ | `la` (hạng, quẻ: tên, chữ Hán, 6 hào, quẻ đơn trên/dưới, tượng, thoán + nghĩa; hào động: số, tên, kinh văn, nghĩa; thầy luận; lời chốt) + `ngay` (hành, ngành hợp, ngành kiêng, màu, hướng). Gọi lần 2 trong ngày trả lại đúng lá đã gieo |
| `POST /than-tai/predict` | Bước 2: gửi `up` · `flat` · `down` | OK, hoặc lỗi `CHUA_GIEO_QUE`, `DA_DU_DOAN` |
| `POST /than-tai/cau` | Bước 3: gửi 0–3 mã (mảng rỗng = bỏ qua) | OK, hoặc lỗi `CHUA_DU_DOAN`, `DA_CAU`, `MA_KHONG_HOP_LE`, `QUA_3_MA` |
| `GET /than-tai/results` | Bước 4: kết quả cả sàn | `total`, số người `up`/`flat`/`down`, `top5` \[{mã, số người}\], `as_of` |
| `GET /stocks/search?q=` | Gợi ý mã cho bước 3 | Tối đa 8 mã: mã, tên, sàn |

Mọi API ghi dữ liệu trả lỗi `HET_GIO` nếu server nhận sau 11:30.

**Lưu trữ**

| Bảng | Trường chính | Ghi chú |
| --- | --- | --- |
| kd\_que | id (1–64), ten, chu\_han, hao (6 ký tự 0/1, từ dưới lên), que\_tren, que\_duoi, tuong, thoan, thoan\_nghia | 64 quẻ, nội dung cố định |
| kd\_la | id, que\_id, hao\_dong (1–6), ten\_hao, hao\_van, hao\_nghia, hang, luan, chot, active | 384 lá; sửa trong quản trị; chỉ lá `active` mới được rút |
| hanh\_cau\_hinh | hanh, nganh (danh sách), mau (tên + hex), huong | 5 dòng; quy tắc hợp/kiêng cố định theo sinh khắc |
| khan\_daily | user\_id, ngay, la\_id, hang, du\_doan, ma\_cau (0–3), step, updated\_at | Khóa duy nhất (user\_id, ngay) chặn khấn hai lượt |
| la\_seen | user\_id, hang, la\_id | Vòng không lặp; xóa theo hạng khi đã ra hết |
| khan\_tally | ngay, up, flat, down, ma → số người cầu | Bộ đếm cho kết quả |

Can chi và nạp âm của ngày tính bằng thư viện lịch âm trên server, theo giờ Việt Nam.

- Quẻ bị tắt (`active = false`) không được rút nữa, nhưng quẻ đã gieo trước đó vẫn hiển thị đủ nội dung trong ngày.
- Không lưu lịch sử quẻ cho người dùng xem (không có sổ quẻ); `que_daily` chỉ dùng cho luật một lần/ngày và đối soát.

## Thư viện quẻ

Thư viện đủ gồm 64 quẻ và 384 lá. Có thể ra mắt khi mới có 64 lá (mỗi quẻ một hào), rồi bật thêm dần cho đủ 384. Thư viện 120 quẻ thơ lục bát và bộ quẻ Vía cũ không dùng nữa.

| Giai đoạn | Số lá | Nội dung cần viết |
| --- | --- | --- |
| Ra mắt | 64 | 64 phần đầu quẻ + 64 lời luận, mỗi quẻ một hào động |
| Đủ bộ | 384 | Thêm 320 lời luận cho các hào còn lại |

**6 lá mẫu đã viết** (có trong HTML mẫu; kinh văn cần đối chiếu trước khi dùng):

| Hạng | Quẻ | Hào động | Lời thầy chốt |
| --- | --- | --- | --- |
| Đại cát | Hỏa Thiên Đại Hữu 火天大有 | Sơ Cửu | Giàu chớ quên nghèo, thắng chớ quên thua. |
| Đại cát | Địa Thiên Thái 地天泰 | Thượng Lục | Thịnh chớ quên suy, lãi chớ quên giữ. |
| Thượng cát | Thủy Thiên Nhu 水天需 | Sơ Cửu | Mây đã lên, mưa sẽ tới. |
| Trung cát | Phong Sơn Tiệm 風山漸 | Sơ Lục | Chim hồng bay xa nhờ từng chặng. |
| Tiểu cát | Sơn Thiên Đại Súc 山天大畜 | Sơ Cửu | Núi chưa mở, chớ húc núi. |
| Thận trọng | Thủy Lôi Truân 水雷屯 | Lục Tam | Không hiểu đường rừng, chớ đuổi hươu. |

## Ngoài phạm vi và câu hỏi mở

**Ngoài phạm vi:** hiệu ứng mã cầu +3% và chạm trần, chấm đúng sai dự đoán, tính điểm, thông báo toàn sàn, sổ quẻ, chia sẻ quẻ ra ngoài.

**Câu hỏi mở**

- [ ] Pháp chế SACO/DNSE duyệt việc hiện ngành hợp, ngành kiêng trước khi lên web.
- [ ] Chốt bảng xếp ngành theo ngũ hành (có chuyển ngành nào sang hành khác không).
- [ ] Chọn bản dịch Kinh Dịch dùng để đối chiếu kinh văn, và ai duyệt nội dung 384 lá.
- [ ] Ngày không giao dịch (thứ Bảy, Chủ nhật, nghỉ lễ) có cho khấn không? Dự đoán VNINDEX khi đó áp cho phiên nào?
- [ ] Cầu mã có gồm chứng quyền, ETF không, hay chỉ cổ phiếu?
- [ ] Người khác có xem được quẻ của mình không?
- [ ] Người chưa đăng nhập thấy điện thờ, bấm nút thì được yêu cầu đăng nhập?
