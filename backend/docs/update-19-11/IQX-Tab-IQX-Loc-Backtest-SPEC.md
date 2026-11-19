# IQX · SPEC: Tab IQX cho Bộ lọc và Backtest (bộ lọc và chiến lược dựng sẵn)

**Phiên bản:** 1.1 · 06/11/2026
**Thay đổi so với 1.0:** quản trị viên thêm, sửa, ẩn/hiện, sắp xếp và xuất bản Bộ lọc IQX, Chiến lược IQX trong trang Quản trị (§5). Bỏ phương án khai báo cố định trong code.
**Dành cho:** AI Dev triển khai trên codebase iqx.vn.
**HTML mẫu đi kèm:** `IQX-Bo-Loc-Backtest-IQX-MAU.html`.
- File HTML là chuẩn **nội dung và hành vi**. Không chép CSS hay layout.
- Dữ liệu cổ phiếu và kết quả Backtest trong file mẫu là **minh họa**.

**Liên quan:**
- `IQX-Bo-Loc-SPEC-v1.1.md`: Bộ lọc (định nghĩa 4.0, Thị trường, Cơ bản, Kỹ thuật).
- `IQX-Bo-Bot-SPEC-v1.2.md`: Backtest bản nháp, Lưu cho Bot, T+2, Giữ tối đa.
- `IQX_CHI_BAO_SPEC_v3.md`: định nghĩa dòng điều kiện 15 chỉ báo và Khối lượng.
- `spec-admin.md` v1.0 và `IQX-Quan-Tri-SPEC-v1.1-BoSung.md`: khung trang Quản trị, mức xác nhận, nhật ký kiểm toán.

> **Tóm tắt**
> 1. Thêm tab **IQX** vào thư viện của **Bộ lọc** và **Backtest**. Tab này liệt kê bộ lọc và chiến lược do IQX dựng sẵn.
> 2. Bấm **Dùng** thì **điền sẵn vào đúng form thiết lập hiện có**. Màn hình sau khi điền **giống hệt** khi người dùng tự thêm từng mục: chip, ô nhập, thẻ chỉ tiêu, thẻ chỉ báo đủ dòng và công tắc. Không có giao diện riêng cho mẫu.
> 3. Bộ lọc IQX và Chiến lược IQX là **bản gốc chỉ đọc**. Người dùng sửa trên bản của mình.
> 4. Backtest thêm phần so sánh **"Mua và giữ {mã}"**.
> 5. **Quản trị viên** quản lý toàn bộ danh sách trong trang Quản trị → **Mẫu IQX**. Soạn bằng **đúng form** Bộ lọc và Backtest, có lưu nháp, xuất bản theo phiên bản, ẩn/hiện, sắp xếp, lịch sử và khôi phục.
> 6. Không đổi hàm tính, quyền truy cập, quy tắc lưu và quy tắc Lưu cho Bot.

---

## 0. Nguyên tắc

### 0.1 Điền sẵn, không làm giao diện riêng

- Bộ lọc IQX và Chiến lược IQX chỉ là **một bộ giá trị** cho form có sẵn.
- Sau khi bấm **Dùng**:
  - mọi trường hiển thị và thao tác **y như người dùng tự nhập**;
  - người dùng thêm, bỏ, sửa bất kỳ mục nào bằng các thao tác hiện có;
  - không có chế độ "xem mẫu" chỉ đọc, không khóa trường nào.
- Dòng chỉ báo nào mẫu không dùng thì **vẫn hiện trong thẻ**, ở trạng thái **tắt**, với giá trị mặc định của phía tương ứng (Mua/Bán theo spec Chỉ báo v3). Giống hệt khi người dùng tự thêm thẻ rồi tắt dòng.

### 0.2 Không đổi những gì không nêu ở đây

- Hàm tính chỉ tiêu, chỉ báo, khối lượng: dùng **đúng** hàm hiện có (Bộ lọc v1.1 §0.2).
- Quyền truy cập: giữ cổng Premium và cờ tính năng hiện có của trang Chiến lược. Tab IQX **không** mở thêm quyền.
- Lưu bộ lọc, lưu danh mục, lưu kết quả, áp dụng cho Bot: giữ nguyên.
- Backtest bản nháp, Chạy, Lưu cho Bot, các trường hợp khóa nút: giữ nguyên Bot v1.2 §4.

### 0.3 Rà code trước khi làm: khóa theo bài học

Dev rà xem web hiện tại **còn khóa** công cụ theo bài học Học viện không:
- chỉ tiêu cơ bản trong Bộ lọc (`metric:<id>`, lỗi `CAPABILITY_LOCKED`);
- chỉ báo trong Backtest (Bot v1.2 §4.2, dòng 6 "Bản nháp dùng chỉ báo chưa mở").

| Kết quả rà | Cách làm |
|---|---|
| **Không còn khóa** | Phần IQX **không có bất kỳ nội dung nào** liên quan học bài: không nhãn khóa, không liên kết bài học, không câu "cần học". |
| **Vẫn còn khóa** | **Không tự quyết.** Báo chủ sản phẩm kèm danh sách chỉ tiêu, chỉ báo bị khóa trong các mẫu ở §2.4 và §3.4, rồi chờ chốt. |

### 0.4 Nội dung và pháp lý

- Mỗi mẫu có dòng: **"Tham khảo để học, không phải khuyến nghị đầu tư."**
- **Không hiện** lợi nhuận, tỷ lệ thắng hay bất kỳ kết quả Backtest nào **trên thẻ mẫu**. Người dùng tự chạy để thấy kết quả.

---

## 1. Tên gọi

| Chỗ | Chữ hiển thị |
|---|---|
| Tab trong thư viện | **IQX** |
| Bộ lọc dựng sẵn | `Bộ lọc IQX · {tên}`. Ví dụ: `Bộ lọc IQX · Giá trị` |
| Chiến lược dựng sẵn | `Chiến lược IQX · {tên}`. Ví dụ: `Chiến lược IQX · Phá đỉnh` |
| Nhãn nhỏ trên thẻ | Huy hiệu chữ `IQX` trước tên |

Không dùng chữ "mẫu", "template", "preset" trên giao diện.

---

## 2. Bộ lọc: tab IQX

### 2.1 Vị trí

- Thư viện cột trái có **3 tab**: `IQX` · `Cơ bản` · `Kỹ thuật`.
- Tab mặc định khi vào trang **giữ như hiện tại** (Cơ bản).
- Ô tìm kiếm của thư viện **chỉ áp dụng** cho tab Cơ bản và Kỹ thuật. Tab IQX không cần tìm (6 thẻ).
- Màn hình < 1024 px: tab IQX nằm trong ngăn kéo Thư viện như hai tab còn lại.

### 2.2 Thẻ Bộ lọc IQX

Mỗi thẻ gồm:

| Phần | Nội dung |
|---|---|
| Tiêu đề | Huy hiệu `IQX` + tên |
| Nút | **Dùng** |
| Ý tưởng | 1 câu (§2.4) |
| Số điều kiện | Nhãn đếm theo nhóm, chỉ hiện nhóm có điều kiện: `Thị trường N` · `Cơ bản N` · `Kỹ thuật N` |

- Thẻ của bộ lọc IQX **đang được dùng** (§2.3) có viền nhấn.
- Chân thư viện ở tab IQX: `Bộ lọc dựng sẵn bởi IQX. Bấm Dùng để điền sẵn vào form, rồi sửa như tự thiết lập. Tham khảo để học, không phải khuyến nghị.`

### 2.3 Bấm "Dùng"

1. **Bộ lọc đang soạn còn trống** thì điền ngay. "Trống" nghĩa là:
   - không có chỉ tiêu và chỉ báo;
   - Sàn, Rổ, Ngành chưa chọn;
   - các ô Vốn hóa, GTGD tối thiểu, Giá đều trống.
2. **Đang có điều kiện** thì hỏi xác nhận trước:
   - Tiêu đề: `Thay bộ lọc đang soạn?`
   - Nội dung: `Điều kiện hiện tại sẽ được thay bằng Bộ lọc IQX · {tên}. Bộ lọc đã lưu (nếu có) không bị ảnh hưởng.`
   - Nút: `Hủy` · `Thay bằng bộ lọc IQX`
3. **Khi điền:**
   - Thay toàn bộ phần Thị trường, chỉ tiêu tài chính và kỹ thuật bằng định nghĩa của bộ lọc IQX (§2.4).
   - Mục Thị trường mẫu không dùng thì để **trống hoặc không chọn**. GTGD giữ `N = 20` khi mẫu không đặt.
   - Bộ lọc thành **bộ lọc chưa lưu** (như bấm tạo mới): dòng phiên bản hiện `Bộ lọc chưa lưu`.
   - Xóa kết quả lần chạy trước khỏi màn hình. **Không tự chạy.**
   - Thư viện tab Cơ bản và Kỹ thuật hiện ✓ cho các mục đã có, đúng như khi tự thêm.
   - Toast: `Đã điền sẵn Bộ lọc IQX · {tên}. Sửa từng điều kiện như tự thiết lập, rồi bấm Chạy bộ lọc.`
4. **Dải thông tin** ở đầu khu chính, trên khối Cơ bản:
   - Dòng chính: `[IQX] Bắt đầu từ Bộ lọc IQX · {tên}. {ý tưởng}` và nút `Xem thêm` / `Thu gọn`.
   - Mở rộng thì hiện:
     - **Nguồn gốc**
     - **Khi nào dễ sai**
     - **Đi cặp với:** `Chiến lược IQX · {tên}. Bấm một mã trong kết quả để Backtest mã đó với chiến lược này.`
     - Dòng `Tham khảo để học, không phải khuyến nghị đầu tư.`
   - Dải này **ẩn** khi người dùng mở một bộ lọc đã lưu khác, hoặc điền một bộ lọc IQX khác (khi đó hiện dải của bộ lọc mới).
   - Người dùng sửa điều kiện thì dải **vẫn giữ**: nó chỉ cho biết điểm xuất phát.
5. **Lưu bộ lọc:** như hiện tại. Tên gợi ý trong hộp lưu: `{tên} (từ Bộ lọc IQX)`.
   - Lưu thêm trường nguồn gốc `origin = { type: "iqx_filter", id, version }` trong định nghĩa đã lưu.
   - `origin` **không** đưa vào `criteriaSignature`, `criteriaHash`.
   - `origin` **có** trong `definition_hash`, như các trường khác của định nghĩa.
6. **Bấm mã trong bảng kết quả** (liên kết Backtest một mã hiện có):
   - Nếu bộ lọc đang có dải "Bắt đầu từ Bộ lọc IQX" thì mở Backtest mã đó **và** điền sẵn Chiến lược IQX đi cặp, theo §3.3 (có hỏi xác nhận nếu bản nháp đang khác cấu hình đã lưu).
   - Không có dải thì giữ hành vi hiện tại.

### 2.4 Danh sách 6 Bộ lọc IQX ban đầu

Đây là dữ liệu **khởi tạo** (phiên bản 1, đang hiện). Sau đó quản trị viên chỉnh trong trang Quản trị (§5).


**Quy ước:**
- Giá trị ghi theo **đơn vị hiển thị**. Dev lưu theo đơn vị registry hiện có, ví dụ `ROE > 15%` lưu `0.15` với `api_unit: ratio`.
- Kỳ tính: `ttm` = Bốn quý gần nhất, `quarter` = Quý gần nhất, `year` = Năm tài chính gần nhất, `three_year` = Ba năm tài chính gần nhất.
- Kỹ thuật: dòng **không liệt kê** thì **tắt**, giữ giá trị mặc định Mua của spec Chỉ báo v3.

#### 2.4.1 `giatri` · Giá trị

| Mục | Nội dung |
|---|---|
| Ý tưởng | Doanh nghiệp có lãi đều, ít nợ, đang được định giá thấp. |
| Nguồn gốc | Benjamin Graham; Basu (1977); Fama và French (1992) |
| Khi nào dễ sai | Cổ phiếu rẻ có thể rẻ vì doanh nghiệp đang gặp vấn đề thật. Có thể mất nhiều năm thị trường mới nhìn nhận lại. |
| Đi cặp | Chiến lược IQX · Theo dòng tiền |
| Thị trường | Sàn: HOSE · Ngành: Thường · GTGD TB 20 phiên ≥ 3 tỷ |
| Cơ bản | P/E (`ttm`) < 12 · P/B (`ttm`) < 1,5 · D/E (`quarter`) < 1 · Profit Positive Streak (`year`) > 4 năm · FCF Margin (`ttm`) > 0% |
| Kỹ thuật | Không có |

#### 2.4.2 `chatluong` · Chất lượng

| Mục | Nội dung |
|---|---|
| Ý tưởng | Sinh lời cao trên vốn, biên tốt, nợ thấp, dòng tiền thật. |
| Nguồn gốc | Novy-Marx (2013) |
| Khi nào dễ sai | Doanh nghiệp tốt thường đã được định giá cao. Mua đắt vẫn có thể lỗ trong thời gian dài. |
| Đi cặp | Chiến lược IQX · Theo xu hướng |
| Thị trường | Ngành: Thường · Vốn hóa từ 5.000 tỷ |
| Cơ bản | ROIC (`ttm`) > 15% · ROE (`ttm`) > 15% · Biên lợi nhuận gộp (`ttm`) > 25% · Net Debt / EBITDA (`ttm`) < 2 · CFO / LNST (`ttm`) > 0,8 |
| Kỹ thuật | Không có |

#### 2.4.3 `garp` · Tăng trưởng giá hợp lý

| Mục | Nội dung |
|---|---|
| Ý tưởng | Lợi nhuận tăng đều mà giá chưa quá đắt so với tốc độ tăng. |
| Nguồn gốc | Peter Lynch |
| Khi nào dễ sai | Tăng trưởng quá khứ có thể không lặp lại. PEG dựa trên tốc độ tăng đã qua. |
| Đi cặp | Chiến lược IQX · Theo xu hướng |
| Thị trường | Ngành: Thường · GTGD TB 20 phiên ≥ 3 tỷ |
| Cơ bản | Tăng trưởng EPS (`ttm`) > 15% · ROE (`ttm`) > 15% · PEG (`ttm`) < 1 · D/E (`quarter`) < 1 |
| Kỹ thuật | Không có |

#### 2.4.4 `canslim` · CANSLIM

| Mục | Nội dung |
|---|---|
| Ý tưởng | Lợi nhuận tăng mạnh, giá đang dẫn dắt, dòng tiền xác nhận. |
| Nguồn gốc | William O'Neil; Ball và Brown (1968) |
| Khi nào dễ sai | Kém hiệu quả khi thị trường chung đi xuống. Cần cắt lỗ kỷ luật. |
| Đi cặp | Chiến lược IQX · Động lượng MACD |
| Thị trường | GTGD TB 20 phiên ≥ 5 tỷ |
| Cơ bản | Tăng trưởng EPS (`quarter`) > 25% · EPS CAGR 3Y (`three_year`) > 20% · ROE (`ttm`) > 17% |
| Kỹ thuật | **MA / SMA:** dòng 3 bật `SMA 50 xu hướng lên`; dòng 1, 2 tắt · **Khối lượng:** N = 20, k = 1,5, `Giá >`, `KL >` |

#### 2.4.5 `phadinh` · Phá đỉnh có thanh khoản

| Mục | Nội dung |
|---|---|
| Ý tưởng | Mã thanh khoản tốt vượt đỉnh 20 phiên, có dòng tiền xác nhận. |
| Nguồn gốc | Động lượng giá: Jegadeesh và Titman (1993) |
| Khi nào dễ sai | Hay thua khi thị trường đi ngang, vì có nhiều cú phá đỉnh giả. |
| Đi cặp | Chiến lược IQX · Phá đỉnh |
| Thị trường | Rổ: VN100 · GTGD TB 20 phiên ≥ 10 tỷ |
| Cơ bản | Không có |
| Kỹ thuật | **Donchian:** dòng 1 bật `Giá đóng cửa > dải trên Donchian 20` · **OBV:** dòng 1 bật `OBV cắt lên SMA 20 của OBV`, dòng 2 tắt · **Bollinger Bands:** dòng 3 bật `Độ rộng Bollinger 20 hệ số 2 mở rộng`; dòng 1, 2 tắt |

#### 2.4.6 `hoiphuc` · Hồi phục từ quá bán

| Mục | Nội dung |
|---|---|
| Ý tưởng | Mã thanh khoản tốt vừa giảm quá mức và bắt đầu quay lại. |
| Nguồn gốc | Hiệu ứng đảo chiều ngắn hạn |
| Khi nào dễ sai | Trong xu hướng giảm mạnh, mã quá bán có thể tiếp tục giảm sâu hơn. |
| Đi cặp | Chiến lược IQX · Hồi phục quá bán |
| Thị trường | Rổ: VN100 · GTGD TB 20 phiên ≥ 5 tỷ |
| Cơ bản | Không có |
| Kỹ thuật | **Bollinger Bands:** dòng 1 bật `Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2`; dòng 2, 3 tắt · **RSI:** dòng 1 bật `RSI 14 < 35`, dòng 2 tắt · **Khối lượng:** N = 20, k = 1,1, `Giá >`, `KL >` |

**Ghi chú:** hiện chưa có bộ lọc IQX riêng cho ngân hàng, chứng khoán, bảo hiểm vì registry Bộ lọc chưa có chỉ tiêu riêng của ba nhóm này (Bộ lọc v1.1 §2.5). Bổ sung khi registry có.

---

## 3. Backtest: tab IQX

### 3.1 Vị trí

- Cột trái của Backtest (hiện là danh sách **Chỉ báo 16**, mỗi chỉ báo có nút `+ Mua` / `+ Bán`) thêm **2 tab** ở đầu: `IQX` · `Chỉ báo 16`.
- Tab mặc định: **Chỉ báo** (giữ như hiện tại).
- Tab Chỉ báo **giữ nguyên** nội dung và hành vi hiện tại.
- Ô "Tìm chỉ báo…" chỉ hiện ở tab Chỉ báo.

### 3.2 Thẻ Chiến lược IQX

| Phần | Nội dung |
|---|---|
| Tiêu đề | Huy hiệu `IQX` + tên |
| Nút | **Dùng** |
| Ý tưởng | 1 câu (§3.4) |
| Tóm tắt | `Mua: {tên các chỉ báo, nối bằng +}` · `Bán: {tên các chỉ báo} · giữ tối đa {N} phiên` |

- Thẻ đang được dùng (§3.3) có viền nhấn.
- Chân tab: `Chiến lược dựng sẵn bởi IQX. Bấm Dùng để điền sẵn các thẻ chỉ báo vào Điều kiện Mua và Bán của bản nháp. Bot không đổi.`

### 3.3 Bấm "Dùng"

1. **Bản nháp đang giống cấu hình đã lưu** thì điền ngay.
2. **Bản nháp đang khác** thì hỏi xác nhận trước:
   - Tiêu đề: `Thay bản nháp đang chỉnh?`
   - Nội dung: `Điều kiện Mua, Bán và Giữ tối đa của bản nháp sẽ được thay bằng Chiến lược IQX · {tên}. Cấu hình Bot đang dùng không đổi.`
   - Nút: `Hủy` · `Thay bằng chiến lược IQX`
3. **Khi điền:**
   - Thay toàn bộ thẻ trong **Điều kiện Mua**, **Điều kiện Bán** và ô **Giữ tối đa** của **bản nháp** bằng §3.4.
   - Mỗi chỉ báo là **một thẻ thật** như khi bấm `+ Mua` / `+ Bán`: tên, nút `Chỉnh`, nút ✕, các dòng đang bật. Bấm `Chỉnh` mở form đủ dòng, ô nhập và công tắc theo spec Chỉ báo v3.
   - Danh sách Chỉ báo bên trái hiện `✓ Mua` / `✓ Bán` cho chỉ báo đã có, như hiện tại.
   - **Không đổi:** Cổ phiếu, Từ ngày, Đến ngày, Vốn ban đầu.
   - **Không ghi** cấu hình Bot, không tạo revision. Chỉ đổi bản nháp (Bot v1.2 §4.1).
   - Kết quả lần chạy trước (nếu có) bị coi là cũ theo quy tắc hiện có: nút Lưu cho Bot khóa với câu `Bản nháp đã sửa sau lần chạy. Bấm Chạy trước khi Lưu cho Bot.`
   - Toast: `Đã điền sẵn Chiến lược IQX · {tên} vào bản nháp. Bot chưa thay đổi.`
4. **Dải thông tin** dưới hàng "Cấu hình chung":
   - Dòng chính: `[IQX] Bản nháp bắt đầu từ Chiến lược IQX · {tên}. {ý tưởng} Bot chưa thay đổi.` và nút `Xem thêm` / `Thu gọn`.
   - Mở rộng thì hiện **Nguồn gốc**, **Khi nào dễ sai**, và dòng `Tham khảo để học, không phải khuyến nghị đầu tư.`
   - Dải ẩn khi bấm **Về cấu hình đã lưu**.
5. **Snapshot lần chạy:** nhãn nguồn (Bot v1.2 §4.1) thêm giá trị `Bản nháp · từ Chiến lược IQX {tên} (v{version})` khi bản nháp bắt đầu từ chiến lược IQX.
6. **Lưu cho Bot:**
   - Quy tắc, các trường hợp khóa và modal giữ nguyên Bot v1.2 §4.2.
   - Modal thêm vào dòng "Cấu hình" chữ ` · từ Chiến lược IQX · {tên}`.
   - Lịch sử cấu hình ghi nguồn: `Backtest · lần chạy {id} · từ Chiến lược IQX {tên}`.

### 3.4 Danh sách 5 Chiến lược IQX ban đầu

Đây là dữ liệu **khởi tạo** (phiên bản 1, đang hiện). Sau đó quản trị viên chỉnh trong trang Quản trị (§5).


**Quy ước:** dòng **không liệt kê** thì **tắt**, giữ giá trị mặc định của **phía tương ứng** (tab Mua dùng mặc định Mua, tab Bán dùng mặc định Bán) theo spec Chỉ báo v3.

| id | Tên | Điều kiện Mua (AND) | Điều kiện Bán (AND) | Giữ tối đa |
|---|---|---|---|---|
| `xuhuong` | Theo xu hướng | **MA Cross** dòng 1: `SMA 20 cắt lên SMA 50` | **MA Cross** dòng 1: `SMA 20 cắt xuống SMA 50` | 60 |
| `phadinh` | Phá đỉnh | **Donchian** dòng 1: `Giá đóng cửa > dải trên Donchian 20` · **Khối lượng**: N = 20, k = 1,5, `Giá >`, `KL >` | **Donchian** dòng 1: `Giá đóng cửa < dải dưới Donchian 10` | 30 |
| `macd` | Động lượng MACD | **MACD** dòng 1: `MACD 12/26 cắt lên Signal 9`; dòng 2: `MACD 12/26 > 0` | **MACD** dòng 1: `MACD 12/26 cắt xuống Signal 9` | 40 |
| `hoiphuc` | Hồi phục quá bán | **Bollinger Bands** dòng 1: `Giá đóng cửa quay vào dải từ dưới Bollinger 20 hệ số 2` · **RSI** dòng 2: `RSI 14 xu hướng lên` | **RSI** dòng 1: `RSI 14 > 70` | 10 |
| `dongtien` | Theo dòng tiền | **OBV** dòng 1: `OBV cắt lên SMA 20 của OBV` · **Chaikin Money Flow**: `CMF 20 cắt lên 0` | **Chaikin Money Flow**: `CMF 20 cắt xuống 0` | 30 |

| id | Ý tưởng | Nguồn gốc | Khi nào dễ sai |
|---|---|---|---|
| `xuhuong` | Đi theo xu hướng trung hạn bằng giao cắt hai đường trung bình. | Theo xu hướng (trend following) | Thị trường đi ngang tạo nhiều tín hiệu giả, vào lệnh trễ ở đầu xu hướng. |
| `phadinh` | Mua khi giá vượt đỉnh 20 phiên có khối lượng xác nhận. | Kênh Donchian; động lượng giá | Hay thua khi thị trường đi ngang, vì có nhiều cú phá đỉnh giả. |
| `macd` | Mua khi động lượng chuyển dương và MACD đang ở vùng tích cực. | Gerald Appel (MACD) | Tín hiệu đến chậm; thị trường giật mạnh dễ mua đỉnh, bán đáy. |
| `hoiphuc` | Mua nhịp hồi ngắn sau khi giá rơi ra ngoài dải dưới Bollinger. | Hiệu ứng đảo chiều ngắn hạn | Trong xu hướng giảm mạnh, quá bán có thể còn quá bán hơn. |
| `dongtien` | Mua khi dòng tiền tích lũy chuyển sang tích cực. | OBV (Granville); Chaikin Money Flow | Khối lượng bất thường (thỏa thuận, sự kiện) có thể làm sai tín hiệu dòng tiền. |

**Khối lượng ở phía Bán:** mặc định phía Bán theo đúng form Bot hiện có. Không chiến lược IQX nào dùng Khối lượng ở phía Bán.

### 3.5 So sánh "Mua và giữ {mã}" (mới)

Thêm vào kết quả **mọi lần chạy** Backtest, không chỉ khi dùng chiến lược IQX.

| Phần | Nội dung |
|---|---|
| Chỉ số mới | Ô `Mua và giữ {mã}`: % thay đổi tài sản, đặt cạnh ô lợi nhuận của chiến lược |
| Biểu đồ | Thêm đường "Mua và giữ {mã}" cùng trục với đường tài sản của chiến lược, có chú giải. Màu khác hẳn đường chiến lược. Không dùng xanh/đỏ để tránh nhầm với lãi/lỗ |

**Cách tính:** cùng mã, cùng khoảng thời gian, cùng vốn ban đầu, cùng chế độ khớp của lần chạy.
- Mua ở phiên khớp hợp lệ **đầu tiên** của khoảng thời gian: số cổ phiếu tối đa theo lô và phí hiện có. Tiền dư giữ nguyên.
- Không bán trong suốt khoảng thời gian.
- Giá trị mỗi phiên = tiền dư + số cổ phiếu × giá đóng cửa phiên đó.
- Cuối khoảng thời gian: **không trừ phí bán**, giống cách hiển thị "Tạm tính" của vị thế chiến lược còn mở (Bot v1.2 §4.3).
- Giá dùng **cùng loại giá** (điều chỉnh hay chưa điều chỉnh) với phần tính chiến lược.

Lưu kết quả "Mua và giữ" trong snapshot lần chạy. Kết quả cũ chưa có thì ô hiện `—` và không vẽ đường, **không tính lại**.

---

## 4. Dữ liệu và API

### 4.1 Nơi lưu Bộ lọc IQX và Chiến lược IQX

Lưu trong **cơ sở dữ liệu**, quản trị viên chỉnh trong trang Quản trị (§5). Tên bảng là tên logic, dev map vào schema thật.

| Bảng | Cột chính |
|---|---|
| `iqx_templates` | `id`, `kind` (`filter` \| `strategy`), `slug` (ví dụ `giatri`), `sort_order`, `visibility` (`shown` \| `hidden`), `current_version` (null khi chưa xuất bản lần nào), `draft` (JSON, nullable: nội dung đang soạn chưa xuất bản), `draft_updated_at`, `draft_updated_by`, `created_at`, `created_by` |
| `iqx_template_versions` | `template_id`, `version` (1, 2, 3…), `content` (JSON), `published_at`, `published_by`, `reason`. **Bất biến:** không sửa, không xóa |

**`content` của một phiên bản:**
- `name`, `idea`, `origin`, `when_wrong`;
- Bộ lọc: `pair_slug` (Chiến lược IQX đi cặp, có thể rỗng) và `definition` là định nghĩa 4.0 đầy đủ (`market`, `rules`, `technical`, `columns` rỗng);
- Chiến lược: `definition` gồm cấu hình Mua/Bán đúng **định dạng lưu điều kiện của Bot** (Chỉ báo v3 §1.4) và `max_holding`.

**Quy tắc:**
- Người dùng chỉ thấy mục có `visibility = shown` **và** đã có `current_version`. Nội dung lấy từ phiên bản `current_version`, xếp theo `sort_order`.
- Bản nháp (`draft`) **không bao giờ** tới người dùng.
- Bộ lọc, bản nháp Backtest, snapshot, cấu hình Bot đã tạo từ một phiên bản **không đổi theo** khi có phiên bản mới.
- Dữ liệu khởi tạo: 6 Bộ lọc IQX (§2.4) và 5 Chiến lược IQX (§3.4), mỗi mục phiên bản 1, `shown`, thứ tự như bảng. Ghi `reason = "Khởi tạo"`.

### 4.2 API

- **Cho người dùng:** dev chọn cách ít trùng lặp nhất, ví dụ `GET /strategy/iqx?kind=filter|strategy` hoặc đưa vào endpoint metadata đang có của Bộ lọc/Backtest. Chỉ trả mục đang hiện, nội dung phiên bản hiện hành, kèm `version`.
- **Cho quản trị viên:** §5.6.
- Máy chủ **kiểm tra** định nghĩa bằng đúng bộ kiểm tra hiện có của Bộ lọc 4.0 và cấu hình Bot **lúc xuất bản** (§5.4). Lúc trả cho người dùng, mục nào không còn hợp lệ (ví dụ registry đổi) thì không trả ra và ghi log lỗi.
- Điền sẵn diễn ra ở **giao diện**: nạp `definition` vào state form giống như mở một bộ lọc đã lưu hay nạp bản nháp. **Không** tạo bản ghi mới trên máy chủ cho tới khi người dùng Lưu.

### 4.3 Nguồn gốc

| Nơi | Trường thêm |
|---|---|
| Bộ lọc đã lưu (định nghĩa 4.0) | `origin: { type: "iqx_filter", id, version }` (tùy chọn) |
| Snapshot lần chạy Backtest | `origin: { type: "iqx_strategy", id, version }` (tùy chọn) |
| Lịch sử cấu hình Bot | Nguồn ghi như §3.3 mục 6 |

Trường `origin` chỉ để hiển thị và thống kê. Không ảnh hưởng tính toán, so khớp tiêu chí hay khóa nút.

---

## 5. Quản trị: Mẫu IQX (mới)

### 5.1 Quyền và vị trí

- **Chỉ `admin`.** `team_lead` và người dùng khác không thấy mục này. API dưới `admin/*`, theo quy tắc phân quyền hiện có.
- Menu trang Quản trị thêm mục **"Mẫu IQX"** (`/admin/iqx-templates`). Đặt trong nhóm menu nội dung nếu đã có (cùng chỗ quản lý Bản tin); chưa có thì đặt trong nhóm **Quản lý**. Dev chọn theo cấu trúc menu hiện tại.

### 5.2 Danh sách

- Hai tab: **Bộ lọc IQX** · **Chiến lược IQX**.
- Nút **"+ Thêm bộ lọc IQX"** / **"+ Thêm chiến lược IQX"** theo tab đang mở.
- Bảng, xếp theo `sort_order`:

| Cột | Nội dung |
|---|---|
| Thứ tự | Hai nút ↑ ↓ để đổi chỗ với mục liền kề. Đổi có hiệu lực với người dùng **ngay**, không cần xuất bản |
| Tên | Huy hiệu `IQX` + tên, dòng dưới là ý tưởng |
| Trạng thái | `Đang hiện` / `Đã ẩn` / `Chưa xuất bản`. Thêm nhãn `Có bản nháp` khi `draft` khác rỗng |
| Phiên bản | `v{current_version}`, hoặc `—` khi chưa xuất bản |
| Cập nhật | Thời điểm và người thực hiện thao tác gần nhất |
| Người dùng bấm Dùng · 30 ngày | Số lần người dùng bấm **Dùng** mục này trong 30 ngày (đếm theo sự kiện, §5.7) |
| Thao tác | **Sửa** · **Ẩn** / **Hiện** (chỉ khi đã xuất bản) · **Xóa nháp** (chỉ khi chưa xuất bản lần nào) · **Lịch sử** |

### 5.3 Soạn: dùng đúng form của người dùng

Bấm **Sửa** hoặc **Thêm** thì mở **chế độ soạn mẫu** trên **chính trang Bộ lọc** (với Bộ lọc IQX) hoặc **chính trang Backtest** (với Chiến lược IQX):
- Phần thiết lập là **đúng component form** người dùng thấy: Thị trường, chỉ tiêu, thẻ kỹ thuật, thư viện; hoặc thư viện Chỉ báo, Điều kiện Mua/Bán, thẻ có Chỉnh và ✕, Giữ tối đa. **Không** làm form riêng cho quản trị.
- Nội dung nạp vào form: **bản nháp** nếu có, không thì **phiên bản hiện hành**, không thì form trống (mục mới).
- **Ẩn** trong chế độ soạn: các nút lưu của người dùng (Lưu bộ lọc, Bộ lọc đã lưu, Danh mục, Lưu cho Bot, Về cấu hình đã lưu), thẻ Danh mục mua mới của Bot, dải "Bắt đầu từ…", tab IQX trong thư viện.
- **Giữ** để thử: Chạy bộ lọc (Bộ lọc); chọn Cổ phiếu, ngày, Chạy (Backtest). Kết quả thử **không lưu** và không ảnh hưởng dữ liệu người dùng của chính quản trị viên.
- Thoát chế độ soạn thì form trở lại trạng thái trước khi vào.

**Khung thông tin** ở đầu trang, có nhãn `QUẢN TRỊ` và tiêu đề `Soạn {Bộ lọc IQX | Chiến lược IQX} · {tên}`:

| Trường | Quy tắc |
|---|---|
| Tên | Bắt buộc, tối đa 40 ký tự. Không trùng (không phân biệt hoa thường) với mục đã xuất bản khác **cùng loại** |
| Ý tưởng | Bắt buộc, 1 câu, tối đa 140 ký tự |
| Nguồn gốc | Bắt buộc, tối đa 120 ký tự |
| Khi nào dễ sai | Bắt buộc, tối đa 200 ký tự |
| Đi cặp với Chiến lược IQX | Chỉ với Bộ lọc IQX. Chọn từ các Chiến lược IQX đã xuất bản, hoặc "Không đi cặp". Chiến lược đang ẩn vẫn chọn được, có ghi "(đã ẩn)" |

- Dòng `Tham khảo để học, không phải khuyến nghị đầu tư.` **luôn tự thêm** khi hiển thị cho người dùng. Không có ô nhập.
- Khung ghi trạng thái: `Mục mới · chưa xuất bản` / `Đang hiện với người dùng · v{n}` / `Đang ẩn với người dùng · v{n}`, thêm `· đang mở bản nháp` khi nạp từ bản nháp.
- Nút: **Hủy** · **Lưu nháp** · **Xuất bản…**

### 5.4 Lưu nháp, xuất bản

| Thao tác | Điều kiện | Kết quả | Xác nhận |
|---|---|---|---|
| **Hủy** | (không) | Bỏ mọi thay đổi đang soạn, về danh sách | Không |
| **Lưu nháp** | Có Tên | Ghi `draft` = thông tin + định nghĩa đang soạn. **Người dùng không thấy gì thay đổi.** Mục mới được tạo với trạng thái `Chưa xuất bản` | Không. Toast: `Đã lưu nháp. Người dùng chưa thấy thay đổi.` |
| **Xuất bản…** | Mọi trường thông tin hợp lệ (§5.3) **và** định nghĩa qua bộ kiểm tra hiện có. Bộ lọc: có ít nhất một điều kiện. Chiến lược: có ít nhất một dòng Mua và một dòng Bán đang bật, Giữ tối đa 3–250 | Tạo phiên bản mới (`current_version + 1`), ghi `reason`, xóa `draft`. Mục mới: `shown`, đứng cuối danh sách. Mục đang ẩn: vẫn ẩn | Mức **Vừa**, bắt buộc lý do |

- **Lỗi kiểm tra** hiện ngay trong khung thông tin, dùng đúng câu lỗi của form (ví dụ `RSI · Dòng 1: Chu kỳ RSI phải từ 2 đến 200, số nguyên.`). Nút xuất bản không gửi khi còn lỗi. Máy chủ kiểm tra lại toàn bộ.
- **Hộp xác nhận xuất bản:**
  - Tiêu đề: `Xuất bản {loại} · {tên} (v{n})?`
  - Nội dung theo trường hợp:
    - đang hiện: `Người dùng thấy phiên bản mới ngay trong tab IQX.`
    - đang ẩn: `Mục đang ẩn: phiên bản mới được lưu, người dùng chỉ thấy khi bạn bấm Hiện.`
    - mục mới: `Mục mới hiện ngay trong tab IQX, ở cuối danh sách.`
  - Luôn thêm: `Bộ lọc, bản nháp và cấu hình Bot người dùng đã tạo từ phiên bản cũ không đổi theo.`
  - Ô **Lý do thay đổi** bắt buộc.
- **Hai quản trị viên cùng sửa:** gửi kèm `expected_version` và `draft_updated_at`. Lệch thì trả 409 `IQX_TEMPLATE_CONFLICT`, giao diện báo `Mục này vừa được người khác thay đổi. Tải lại để xem bản mới nhất.` và không ghi.

### 5.5 Ẩn, hiện, sắp xếp, xóa, lịch sử

| Thao tác | Điều kiện | Kết quả | Xác nhận |
|---|---|---|---|
| **Ẩn** | Đã xuất bản, đang hiện | Biến mất khỏi tab IQX của người dùng ngay. Không ảnh hưởng thứ người dùng đã tạo từ mục này | Vừa, bắt buộc lý do. Nội dung: `Mục này biến mất khỏi tab IQX của người dùng. Bộ lọc, bản nháp và cấu hình Bot người dùng đã tạo từ mục này không bị ảnh hưởng.` |
| **Hiện** | Đang ẩn | Hiện lại với phiên bản hiện hành | Vừa, bắt buộc lý do |
| **↑ / ↓** | Có mục liền kề | Đổi `sort_order` hai mục | Không |
| **Xóa nháp** | Chưa xuất bản lần nào | Xóa hẳn mục | Thấp |
| **Lịch sử** | (không) | Hộp liệt kê mọi thao tác: xuất bản v{n}, lưu nháp, ẩn, hiện, đổi thứ tự, kèm thời điểm, người làm, lý do. Mỗi phiên bản có nút **"Khôi phục làm bản nháp"**: chép nội dung phiên bản đó vào `draft`. Muốn dùng thì Sửa rồi Xuất bản như thường | Không |

- **Không có xóa** với mục đã xuất bản, vì bộ lọc, snapshot và lịch sử Bot của người dùng còn tham chiếu `origin`. Muốn bỏ thì **Ẩn**.
- **Ảnh hưởng tới người dùng:**
  - Bộ lọc IQX ẩn: dải "Bắt đầu từ Bộ lọc IQX" của bộ lọc người dùng đang soạn vẫn hiện tên theo phiên bản đã dùng.
  - Chiến lược IQX đi cặp bị ẩn: dải của Bộ lọc IQX **không** hiện dòng "Đi cặp với", và bấm mã trong kết quả giữ hành vi thường (§2.3 mục 6).

### 5.6 API quản trị

| Endpoint | Request | Hành vi | Audit |
|---|---|---|---|
| `GET admin/iqx-templates` | `kind` | Danh sách đủ cột §5.2, gồm cả mục ẩn và chưa xuất bản | (không) |
| `GET admin/iqx-templates/:id` | (không) | Thông tin, `draft`, phiên bản hiện hành, lịch sử | (không) |
| `POST admin/iqx-templates` | `kind`, `draft` | Tạo mục mới chưa xuất bản | `iqx_template.create` |
| `PUT admin/iqx-templates/:id/draft` | `draft`, `draft_updated_at` | Lưu nháp | `iqx_template.draft_save` |
| `POST admin/iqx-templates/:id/publish` | `content`, `reason`, `expected_version` | Kiểm tra, tạo phiên bản mới | `iqx_template.publish` |
| `POST admin/iqx-templates/:id/hide` · `/show` | `reason` | Ẩn hoặc hiện | `iqx_template.hide` / `iqx_template.show` |
| `PUT admin/iqx-templates/order` | `kind`, danh sách `id` theo thứ tự | Ghi `sort_order` | `iqx_template.reorder` |
| `DELETE admin/iqx-templates/:id` | (không) | Chỉ khi chưa xuất bản; còn lại trả 409 `IQX_TEMPLATE_PUBLISHED` | `iqx_template.delete_draft` |
| `POST admin/iqx-templates/:id/restore` | `version` | Chép phiên bản vào `draft` | `iqx_template.restore` |

- Audit ghi vào `admin_audit_log` như quy ước hiện có. `payload_before` / `payload_after` của `publish` chứa **đủ** `content` cũ và mới.
- Lỗi: `IQX_TEMPLATE_INVALID` (422, kèm danh sách lỗi theo trường), `IQX_TEMPLATE_NAME_TAKEN` (409), `IQX_TEMPLATE_CONFLICT` (409), `IQX_TEMPLATE_PUBLISHED` (409).

### 5.7 Đếm "Người dùng bấm Dùng"

- Mỗi lần người dùng bấm **Dùng** và form được điền (sau xác nhận nếu có), ghi một sự kiện `iqx_template_used` với `template_id`, `version`, `user_id`, thời điểm.
- Cột §5.2 đếm sự kiện trong 30 ngày gần nhất. Không hiện danh sách người dùng.

---

## 6. Thông điệp

| Chỗ | Chữ |
|---|---|
| Chân tab IQX · Bộ lọc | `Bộ lọc dựng sẵn bởi IQX. Bấm Dùng để điền sẵn vào form, rồi sửa như tự thiết lập. Tham khảo để học, không phải khuyến nghị.` |
| Chân tab IQX · Backtest | `Chiến lược dựng sẵn bởi IQX. Bấm Dùng để điền sẵn các thẻ chỉ báo vào Điều kiện Mua và Bán của bản nháp. Bot không đổi.` |
| Xác nhận · Bộ lọc | `Thay bộ lọc đang soạn?` / `Điều kiện hiện tại sẽ được thay bằng Bộ lọc IQX · {tên}. Bộ lọc đã lưu (nếu có) không bị ảnh hưởng.` |
| Xác nhận · Backtest | `Thay bản nháp đang chỉnh?` / `Điều kiện Mua, Bán và Giữ tối đa của bản nháp sẽ được thay bằng Chiến lược IQX · {tên}. Cấu hình Bot đang dùng không đổi.` |
| Toast · Bộ lọc | `Đã điền sẵn Bộ lọc IQX · {tên}. Sửa từng điều kiện như tự thiết lập, rồi bấm Chạy bộ lọc.` |
| Toast · Backtest | `Đã điền sẵn Chiến lược IQX · {tên} vào bản nháp. Bot chưa thay đổi.` |
| Dải · Bộ lọc | `Bắt đầu từ Bộ lọc IQX · {tên}. {ý tưởng}` |
| Dải · Backtest | `Bản nháp bắt đầu từ Chiến lược IQX · {tên}. {ý tưởng} Bot chưa thay đổi.` |
| Miễn trừ | `Tham khảo để học, không phải khuyến nghị đầu tư.` |
| Kết quả Backtest | `Kết quả quá khứ không bảo đảm kết quả tương lai.` (giữ nếu đã có) |

---

## 7. Nghiệm thu

### 7.1 Bộ lọc

1. Thư viện có 3 tab `IQX · Cơ bản · Kỹ thuật`. Tab IQX có 6 thẻ đúng tên, ý tưởng và số điều kiện.
2. Bấm **Dùng** trên bộ lọc trống thì điền ngay. Trên bộ lọc đang có điều kiện thì hỏi xác nhận; bấm Hủy thì không đổi gì.
3. **Kiểm tra "giống tự thiết lập":** với từng bộ lọc IQX, tự thêm tay đúng các mục và giá trị ở §2.4. So hai trạng thái:
   - định nghĩa 4.0 **giống hệt**, trừ `origin`;
   - `criteriaSignature` **giống hệt**;
   - giao diện (chip, ô nhập, thẻ, dòng bật/tắt, ✓ trong thư viện) **giống hệt**.
4. Sửa, thêm, bỏ bất kỳ điều kiện nào sau khi điền: hoạt động như bình thường.
5. Chạy bộ lọc IQX cho kết quả **giống hệt** khi chạy bộ lọc tự thiết lập tương đương.
6. Lưu bộ lọc: tên gợi ý đúng, có `origin`. Mở lại đúng mọi giá trị.
7. Bấm mã trong kết quả khi đang có dải IQX: mở Backtest mã đó và điền Chiến lược IQX đi cặp, có xác nhận nếu bản nháp đang khác.
8. Không có nhãn, nút hay câu nào liên quan học bài (khi §0.3 cho kết quả "không còn khóa").

### 7.2 Backtest

9. Cột trái có 2 tab `IQX · Chỉ báo 16`. Tab Chỉ báo giữ nguyên như hiện tại.
10. Bấm **Dùng** điền đúng thẻ Mua, Bán, Giữ tối đa theo §3.4. `Chỉnh` mở form đủ dòng, đúng dòng bật/tắt và giá trị.
11. **Kiểm tra "giống tự thiết lập":** với từng chiến lược IQX, tự cấu hình tay tương đương rồi chạy. Kết quả và snapshot (trừ `origin` và nhãn nguồn) **giống hệt**.
12. Điền chiến lược IQX không đổi Cổ phiếu, ngày, vốn, và **không** đổi revision cấu hình Bot.
13. Lưu cho Bot: khóa và mở đúng quy tắc v1.2. Modal và lịch sử cấu hình có nguồn "từ Chiến lược IQX".
14. Về cấu hình đã lưu: bản nháp trở lại cấu hình Bot, dải IQX ẩn.

### 7.3 Mua và giữ

15. Mọi lần chạy mới có ô và đường "Mua và giữ {mã}".
16. Tính tay 2 lần chạy (một mã có chia cổ tức hoặc chia tách trong khoảng thời gian, nếu có): khớp số máy chủ.
17. Kết quả cũ: ô hiện `—`, không vẽ đường, không tính lại.

### 7.4 Quản trị

18. Chỉ `admin` vào được trang Mẫu IQX và gọi được `admin/iqx-templates*`. `team_lead` nhận 403.
19. **Sửa một Bộ lọc IQX đang hiện rồi Lưu nháp:** người dùng vẫn thấy phiên bản cũ, danh sách quản trị hiện `Có bản nháp`.
20. **Xuất bản:** người dùng thấy phiên bản mới ngay. Một bộ lọc người dùng đã lưu từ phiên bản cũ mở lại vẫn đúng giá trị cũ, `origin.version` cũ.
21. **Chế độ soạn dùng đúng form:** định nghĩa mà quản trị viên soạn rồi xuất bản, khi người dùng bấm Dùng, cho ra màn hình và định nghĩa **giống hệt** lúc quản trị viên soạn.
22. **Kiểm tra khi xuất bản:** thiếu trường thông tin, trùng tên, form có lỗi, không có điều kiện, Chiến lược không có dòng Bán bật: đều chặn, báo đúng chỗ. Máy chủ chặn cả khi gọi API thẳng.
23. **Ẩn / Hiện:** mục biến mất / hiện lại ở tab IQX ngay. Bắt buộc lý do. Không có nút xóa với mục đã xuất bản.
24. **Đổi thứ tự:** tab IQX của người dùng đổi thứ tự ngay.
25. **Khôi phục:** từ phiên bản v1 tạo bản nháp đúng nội dung v1; xuất bản thành v{n+1}, không sửa v1.
26. **Hai quản trị viên cùng sửa:** người lưu sau nhận 409 và không ghi đè.
27. **Audit:** mỗi thao tác ở §5.6 ghi đúng 1 dòng, `publish` có đủ nội dung trước và sau.
28. Chiến lược IQX đi cặp bị ẩn: dải Bộ lọc IQX không còn dòng "Đi cặp với", bấm mã giữ hành vi thường.

### 7.5 Màn hình nhỏ

29. Ở 390 px: tab IQX nằm trong ngăn kéo hoặc cột trái xếp chồng như hiện tại. Trang quản trị dùng được ở màn hình hẹp theo khung quản trị hiện có. Không cuộn ngang cả trang.

---

## 8. Điểm dev cần xác nhận

| # | Nội dung |
|---|---|
| 1 | Kết quả rà khóa theo bài học (§0.3) |
| 2 | Bảng dữ liệu, endpoint cho người dùng và vị trí mục Mẫu IQX trong menu quản trị (§4, §5.1) |
| 3 | Cách điền sẵn tái dùng hàm nào của "mở bộ lọc đã lưu" và "nạp bản nháp Backtest" |
| 4 | Chế độ khớp và loại giá đang dùng của Backtest, để tính "Mua và giữ" cùng cơ sở (§3.5) |
| 5 | Các mục trong §2.4 và §3.4 qua được bộ kiểm tra hiện có (đơn vị, kỳ tính, miền giá trị). Mục nào lỗi thì báo, không tự sửa giá trị |
| 6 | Cách đưa form Bộ lọc và Backtest vào chế độ soạn mẫu mà không chạm dữ liệu người dùng của quản trị viên (§5.3) |

Bàn giao:
- trả lời bảng trên;
- danh sách file đã sửa;
- kết quả test §7, đặc biệt bảng so sánh "giống tự thiết lập" (7.1.3, 7.2.11) và test quản trị 7.4.

Không báo "đã test" nếu chưa chạy test.

---

### Câu giao việc ngắn cho AI Dev

> Thêm tab **IQX** vào thư viện Bộ lọc (`IQX · Cơ bản · Kỹ thuật`) và cột trái Backtest (`IQX · Chỉ báo`), theo spec này và `IQX-Bo-Loc-Backtest-IQX-MAU.html`.
> - Bấm **Dùng** thì **điền sẵn vào đúng form hiện có**, giống hệt khi người dùng tự thêm từng mục. Không làm giao diện riêng.
> - 6 Bộ lọc IQX (§2.4) và 5 Chiến lược IQX (§3.4) là dữ liệu khởi tạo, lưu trong cơ sở dữ liệu theo phiên bản.
> - Trang Quản trị thêm **Mẫu IQX** (§5): quản trị viên soạn bằng **đúng form** Bộ lọc/Backtest, lưu nháp, xuất bản (bắt buộc lý do), ẩn/hiện, sắp xếp, xem lịch sử và khôi phục.
> - Backtest thêm ô và đường **"Mua và giữ {mã}"** (§3.5).
>
> Giữ nguyên hàm tính, quyền truy cập, quy tắc lưu và Lưu cho Bot. Trước khi làm, rà xem web còn khóa công cụ theo bài học không (§0.3). Không còn khóa thì bỏ mọi nội dung liên quan học bài; còn khóa thì báo lại, không tự quyết.
