# IQX · SPEC V3: Điều kiện Mua/Bán của 15 chỉ báo

**Phiên bản:** 3.0 · 29/10/2026
**Dành cho:** AI Dev triển khai trên codebase iqx.vn hiện có.
**Thay thế:** toàn bộ SPEC V2 (28/10/2026).
**HTML mẫu đi kèm:** `IQX_CHI_BAO_MAU_v2.html`.
- File này là **chuẩn nội dung điều kiện**: số dòng, chữ, toán tử, ô nhập, giới hạn, mặc định.
- **Không** dùng file này thay giao diện web, không chép CSS hay layout.

> **3 thay đổi chính so với V2**
> 1. **Điều kiện phải đúng y như HTML mẫu.** Không giữ toán tử hay cấu hình kiểu cũ. Chỗ nào HTML dùng "cắt lên/cắt xuống" thì web dùng đúng như vậy.
> 2. **RSI dòng 2** đổi thành `RSI [N] xu hướng [lên/xuống]`, xét giống SMA. Bỏ "RSI so với phiên trước".
> 3. **Mọi chu kỳ và ngưỡng nằm trong từng dòng điều kiện.** Bỏ hết ô thông số đặt ngoài. Mỗi dòng có chu kỳ riêng, tính độc lập.

---

## 0. Phạm vi và nguyên tắc

### 0.1 Nơi phải áp dụng

Mọi nơi trên web có **chỉnh, lưu, đọc hoặc tính** điều kiện Mua/Bán của 15 chỉ báo:

- Bot
- Backtest
- Luyện tập
- Flashback, nếu có dùng điều kiện
- Mọi nơi khác tìm thấy khi rà code: preset, mẫu chiến lược, nhân bản Bot, nhập/xuất JSON, API, job chạy nền, test.

Dev phải **rà toàn bộ repository trước khi sửa**. Lập bảng kiểm kê ở mục 0.4. Không đoán tên file hay endpoint.

### 0.2 Giữ nguyên

- Giao diện ngoài form điều kiện: layout, màu, font, vị trí, điều hướng, tab Mua/Bán, các nút Lưu/Hủy/Đặt lại, công tắc chỉ báo.
- Cơ chế Bot: vốn, vị thế, đặt và khớp lệnh, lịch chạy, hiệu lực từ phiên kế tiếp.
- Backtest: công thức hiệu suất, phí, trượt giá, báo cáo.
- Luyện tập và Flashback: luật chơi, tính điểm, phần thưởng, cách tua dữ liệu.
- Cách kết hợp **nhiều chỉ báo** trong một chiến lược. Spec này chỉ quy định cách kết hợp **các dòng trong một chỉ báo**.
- Công thức tính chỉ báo đang dùng trên biểu đồ. Nếu biểu đồ và phần tính tín hiệu lệch nhau, báo lại và chỉ sửa đúng chỗ gây lệch tín hiệu.
- Việc cấu hình đang **dùng chung hay tách riêng** giữa các sản phẩm. Ví dụ hiện Bot và Backtest dùng chung thì giữ chung. Luyện tập lưu riêng thì giữ riêng.

### 0.3 Một bộ định nghĩa cho mọi nơi

- Mọi sản phẩm dùng **chung một bộ định nghĩa** cho 15 chỉ báo: dòng, toán tử, ô nhập, giới hạn, mặc định.
- Mọi sản phẩm dùng **chung một hàm tính** đúng/sai cho từng dòng.
- Không viết nhánh tính riêng cho từng sản phẩm.
- Cùng mã, cùng dữ liệu nến đã đóng tới phiên T và cùng cấu hình thì kết quả đúng/sai của **từng dòng** và **cả chỉ báo** phải giống nhau ở mọi sản phẩm.
- Kết quả "đúng" chỉ là điều kiện thoả, **không phải lệnh**. Mỗi sản phẩm xử lý tiếp theo cơ chế sẵn có của nó.

### 0.4 Bảng kiểm kê dev phải điền

| Sản phẩm / nơi tìm thấy | File form | Nơi lưu cấu hình | Hàm tính tín hiệu | Dùng chung với | Việc cần sửa |
|---|---|---|---|---|---|
| Bot | | | | | |
| Backtest | | | | | |
| Luyện tập | | | | | |
| Flashback | | | | | |
| Nơi khác | | | | | |

Nơi nào không có form hoặc không tính tín hiệu thì ghi "Không áp dụng" kèm bằng chứng trong code. Không tạo thêm form hay bộ tính chỉ để đủ bảng.

---

## 1. Cấu trúc điều kiện

### 1.1 Form điều kiện

Mỗi chỉ báo có hai tab **Mua** và **Bán**. Mỗi tab có:

- **Công tắc** "Sử dụng điều kiện Mua/Bán".
- Danh sách dòng điều kiện. Mỗi dòng là **một câu ngắn**, có công tắc bật/tắt riêng.
- Dòng tắt hiển thị mờ.
- **Không có** khu ô thông số chung đặt ngoài các dòng.

### 1.2 Mỗi dòng tự chứa chu kỳ và ngưỡng

- Mỗi dòng có **chu kỳ, ngưỡng và toán tử riêng** ngay trong câu.
  - Ví dụ: `MACD [12] / [26] cắt lên Signal [9]`.
  - Ví dụ: `RSI [14] < [30]`.
- Các dòng **tính độc lập**. Dòng 1 RSI 14 và dòng 2 RSI 9 là hợp lệ: hệ thống tính RSI 14 cho dòng 1, RSI 9 cho dòng 2.
- Sửa chu kỳ ở một dòng **không** tự đổi dòng khác.
- Tab Mua và tab Bán cũng độc lập.

### 1.3 Kết hợp các dòng

- Các dòng **đang bật** trong cùng một tab của một chỉ báo kết hợp bằng **AND**. Không có lựa chọn OR.
- Dòng tắt thì bỏ qua.
- Không có tín hiệu (`NO_SIGNAL`) khi:
  - Không bật dòng nào.
  - Công tắc Mua/Bán của tab tắt.
  - Chỉ báo tắt.
- Lưu tham số **không** tự bật chỉ báo.
- Không tự nới điều kiện khi tín hiệu hiếm.

### 1.4 Cấu trúc lưu gợi ý

Chỉ để minh hoạ. Ánh xạ vào cấu trúc lưu hiện có của dự án.

```json
{
  "rsi": {
    "active": true,
    "buy": {
      "enabled": true,
      "rules": [
        { "enabled": true, "period": 14, "op": "<", "threshold": 30 },
        { "enabled": true, "period": 14, "dir": "lên" }
      ]
    },
    "sell": { "enabled": true, "rules": [ ... ] }
  }
}
```

- Mỗi dòng nhận diện bằng **mã ổn định** (ví dụ `rsi.level`, `rsi.trend`), không dựa vào nhãn chữ.
- Số âm, số thập phân và phần trăm phải lưu và đọc lại chính xác:
  - CMF `-0.05` giữ nguyên `-0.05`.
  - ROC `5` nghĩa là 5%, không phải `0.05`.

---

## 2. Toán tử chuẩn

Ký hiệu:
- `X[t]` là giá trị tại phiên T đã đóng cửa.
- `X[t-1]` là phiên liền trước.
- `X[t-N]` là N phiên trước.

| Toán tử | Điều kiện |
|---|---|
| Cắt lên Y | `X[t-1] <= Y[t-1]` và `X[t] > Y[t]` |
| Cắt xuống Y | `X[t-1] >= Y[t-1]` và `X[t] < Y[t]` |
| `>` | `X[t] > Y[t]` |
| `<` | `X[t] < Y[t]` |
| Xu hướng lên (chu kỳ N) | `X[t] > X[t-N]` |
| Xu hướng xuống (chu kỳ N) | `X[t] < X[t-N]` |
| Tăng so với phiên trước | `X[t] > X[t-1]` |
| Giảm so với phiên trước | `X[t] < X[t-1]` |

- **Ngưỡng cố định:** `Y[t] = Y[t-1] =` ngưỡng.
- **Đường động** (SMA, EMA, Signal, −DI, %D…): dùng giá trị của **đúng từng phiên**. Không lấy `Y[t]` để so với `X[t-1]`.
- **Bằng ngưỡng** ở phiên T thì **chưa** tính là cắt.
- **Xu hướng:** N là chu kỳ của chính đường đó trong dòng. Không có ô nhập số phiên so sánh riêng.
- **Chưa đủ dữ liệu** để tính một giá trị cần dùng: dòng đó trả `NO_SIGNAL`, không coi là 0 hay sai mặc định. Ví dụ RSI 14 xu hướng cần RSI tại T−14.

---

## 3. Bảng điều kiện 15 chỉ báo

### Cách đọc

- `[…]` là ô người dùng chỉnh.
- **Ô chọn:** ghi các lựa chọn.
- **Ô số:** ghi `min–max` và bước.
- **"Chu kỳ chuẩn"** là ô chọn `5, 10, 20, 50, 100, 200`, chỉ dùng cho SMA và MA Cross.
- **"Chu kỳ số"** là ô nhập số nguyên `2–200`, trừ khi ghi khác.
- **Bật** là trạng thái mặc định của dòng khi tạo cấu hình mới.

Số dòng mỗi tab, theo thứ tự mục 3.1–3.15: **3 · 3 · 1 · 2 · 3 · 2 · 1 · 1 · 1 · 1 · 3 · 1 · 2 · 2 · 1**.

### 3.1 MA / SMA (3 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `Giá cắt [lên/xuống] SMA [N]` | N: chu kỳ chuẩn | lên, 20 | xuống, 20 | Có |
| 2 | `SMA [N1] cắt [lên/xuống] SMA [N2]` | N1, N2: chu kỳ chuẩn, N1 < N2 | 10 lên 20 | 10 xuống 20 | Không |
| 3 | `SMA [N] xu hướng [lên/xuống]` | N: chu kỳ chuẩn | 20, lên | 20, xuống | Không |

- Dòng 1 "Giá" là giá đóng cửa.
- Dòng 3: lên khi `SMA_N[t] > SMA_N[t-N]`, xuống khi `<`.

### 3.2 EMA (3 dòng)

Giống SMA nhưng là EMA, và chu kỳ là **ô nhập số** `2–200`.

| # | Câu điều kiện | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|
| 1 | `Giá cắt [lên/xuống] EMA [N]` | lên, 20 | xuống, 20 | Có |
| 2 | `EMA [N1] cắt [lên/xuống] EMA [N2]`, N1 < N2 | 10 lên 20 | 10 xuống 20 | Không |
| 3 | `EMA [N] xu hướng [lên/xuống]` | 20, lên | 20, xuống | Không |

### 3.3 MA Cross (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `SMA [N1] cắt [lên/xuống] SMA [N2]` | chu kỳ chuẩn, N1 < N2 | 20 lên 50 | 20 xuống 50 | Có |

Giữ MA Cross là **chỉ báo riêng** trong danh sách, cấu hình, Bot và Backtest. Không gộp vào SMA.

### 3.4 RSI (2 dòng) [THAY ĐỔI]

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `RSI [N] [>/<] [ngưỡng]` | N: chu kỳ số; ngưỡng `0–100`, số nguyên | 14, `<`, 30 | 14, `>`, 70 | Có |
| 2 | `RSI [N] xu hướng [lên/xuống]` | N: chu kỳ số | 14, lên | 14, xuống | Có |

- Dòng 1 chỉ có `>` và `<`, không có giao cắt ngưỡng.
- Dòng 2: lên khi `RSI_N[t] > RSI_N[t-N]`, xuống khi `<`. Giống cách xét xu hướng SMA.
- **Bỏ hẳn** dòng "RSI > hoặc < RSI phiên trước".

### 3.5 MACD (3 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `MACD [nhanh] / [chậm] [cắt lên/cắt xuống/>/<] Signal [S]` | 3 chu kỳ số | 12/26, cắt lên, 9 | 12/26, cắt xuống, 9 | Có |
| 2 | `MACD [nhanh] / [chậm] [>/<] 0` | 2 chu kỳ số | 12/26, `>` | 12/26, `<` | Không |
| 3 | `Histogram MACD [nhanh] / [chậm] / [S] [tăng/giảm] so với phiên trước` | 3 chu kỳ số | 12/26/9, tăng | 12/26/9, giảm | Không |

- Ở mọi dòng, nhanh phải nhỏ hơn chậm.
- `Histogram = MACD − Signal`.

### 3.6 Stochastic (2 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `%K [K] làm mượt [m] [>/<] [ngưỡng]` | K: chu kỳ số; m `1–10`; ngưỡng `0–100` | 14, 3, `<`, 20 | 14, 3, `>`, 80 | Có |
| 2 | `%K [K] làm mượt [m] [cắt lên/cắt xuống] %D [D]` | K: chu kỳ số; m `1–10`; D `1–20` | 14, 3, cắt lên, 3 | 14, 3, cắt xuống, 3 | Có |

- Dòng 1 chỉ có `>` và `<`.
- Dòng 2 chỉ có cắt lên và cắt xuống.
- Giữ kiểu Stochastic đang dùng trên web (Full/Slow).

### 3.7 CCI (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `CCI [N] [cắt lên/cắt xuống] [ngưỡng]` | N: chu kỳ số; ngưỡng `-300–300`, số nguyên | 20, cắt lên, −100 | 20, cắt xuống, +100 | Có |

### 3.8 MFI (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `MFI [N] [cắt lên/cắt xuống] [ngưỡng]` | N: chu kỳ số; ngưỡng `0–100` | 14, cắt lên, 20 | 14, cắt xuống, 80 | Có |

### 3.9 ROC (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `ROC [N] [cắt lên/cắt xuống] [ngưỡng] %` | N: số nguyên `2–252`; ngưỡng `-100–10000`, bước 0,1 | 20, cắt lên, +5% | 20, cắt xuống, −5% | Có |

`ROC = 100 × (Close[t] / Close[t-N] − 1)`. Ngưỡng lưu theo đơn vị **%**.

### 3.10 Williams %R (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `Williams %R [N] [cắt lên/cắt xuống] [ngưỡng]` | N: chu kỳ số; ngưỡng `-100–0` | 14, cắt lên, −80 | 14, cắt xuống, −20 | Có |

### 3.11 Bollinger Bands (3 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `Giá đóng cửa [hành động] Bollinger [N] hệ số [k]` | hành động: 6 lựa chọn bên dưới; N: chu kỳ số; k `1–3,5`, bước 0,1 | quay vào dải từ dưới, 20, 2 | quay vào dải từ trên, 20, 2 | Có |
| 2 | `Giá đóng cửa [tăng/giảm] so với phiên trước` | — | tăng | giảm | Có |
| 3 | `Độ rộng Bollinger [N] hệ số [k] [mở rộng/thu hẹp]` | N: chu kỳ số; k `1–3,5` | 20, 2, thu hẹp | 20, 2, mở rộng | Có |

**6 hành động của dòng 1:**

| Hành động | Điều kiện |
|---|---|
| Quay vào dải từ dưới | `Close[t-1] < Lower[t-1]` và `Lower[t] <= Close[t] <= Upper[t]` |
| Quay vào dải từ trên | `Close[t-1] > Upper[t-1]` và `Lower[t] <= Close[t] <= Upper[t]` |
| Vượt dải trên | `Close[t-1] <= Upper[t-1]` và `Close[t] > Upper[t]` |
| Phá dải dưới | `Close[t-1] >= Lower[t-1]` và `Close[t] < Lower[t]` |
| Cắt lên dải giữa | Theo toán tử cắt lên ở mục 2 |
| Cắt xuống dải giữa | Theo toán tử cắt xuống ở mục 2 |

**Dòng 3, độ rộng dải:**
- `BW = (Upper − Lower) / Middle`.
- Mở rộng khi `BW[t] > BW[t-1]`, thu hẹp khi `BW[t] < BW[t-1]`.
- Middle bằng 0 thì `NO_SIGNAL`.
- Không thêm "squeeze lịch sử".

### 3.12 Donchian Channel (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `Giá đóng cửa [>/<] dải [trên/dưới] Donchian [N]` | N: số nguyên `2–252` | `>`, trên, 20 | `<`, dưới, 20 | Có |

- Dải trên = `MAX(High[t-N] … High[t-1])`. Dải dưới = `MIN(Low[t-N] … Low[t-1])`.
- **Không tính phiên T** vào cực trị. Nếu code hiện tại có tính phiên T thì phải sửa.

### 3.13 DMI + ADX (2 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `DMI [N]: +DI [cắt lên/cắt xuống/>/<] −DI` | N: chu kỳ số | 14, cắt lên | 14, cắt xuống | Có |
| 2 | `ADX [N] [>/<] [ngưỡng]` | N: chu kỳ số; ngưỡng `0–100`, bước 0,1 | 14, `>`, 25 | 14, `>`, 25 | Không |

- **Không có** dòng "ADX xu hướng lên/xuống".
- ADX đo độ mạnh xu hướng, không cho biết hướng giá.

### 3.14 OBV (2 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `OBV [cắt lên/cắt xuống/>/<] SMA [N] của OBV` | N: chu kỳ số | cắt lên, 20 | cắt xuống, 20 | Có |
| 2 | `OBV [vượt đỉnh/phá đáy] [N] phiên` | N: số nguyên `2–252` | vượt đỉnh, 20 | phá đáy, 20 | Không |

- Vượt đỉnh: `OBV[t] > MAX(OBV[t-N] … OBV[t-1])`.
- Phá đáy: `OBV[t] < MIN(OBV[t-N] … OBV[t-1])`.
- Không tính phiên T vào cực trị.

### 3.15 Chaikin Money Flow (1 dòng)

| # | Câu điều kiện | Ô chỉnh | Mặc định Mua | Mặc định Bán | Bật |
|---|---|---|---|---|---|
| 1 | `CMF [N] [cắt lên/cắt xuống] [ngưỡng]` | N: chu kỳ số; ngưỡng `-1–1`, bước 0,01 | 20, cắt lên, 0 | 20, cắt xuống, 0 | Có |

**Không thay đổi** mục Khối lượng và các chỉ báo ngoài danh sách 15.

---

## 4. Kiểm tra khi lưu

Báo lỗi ngay trong form, dưới danh sách dòng. **Không tự sửa** giá trị người dùng nhập.

| Trường hợp | Thông báo |
|---|---|
| Ô số trống, ngoài giới hạn, hoặc là số lẻ ở ô số nguyên | `Mua · dòng 2: Chu kỳ RSI phải từ 2 đến 200, số nguyên.` |
| SMA hoặc MA Cross chọn chu kỳ ngoài danh sách chuẩn | `… chỉ chọn 5, 10, 20, 50, 100, 200.` |
| Chu kỳ nhanh lớn hơn hoặc bằng chậm (SMA dòng 2, EMA dòng 2, MA Cross, MACD) | `Mua · dòng 1: chu kỳ nhanh phải nhỏ hơn chu kỳ chậm.` |

Kiểm tra cả hai tab Mua và Bán trước khi lưu. Còn lỗi thì không lưu.

Server **kiểm tra lại đúng các quy tắc này**, không chỉ dựa vào form.

---

## 5. Dữ liệu và thời điểm

- Chỉ dùng **nến đã đóng** tới phiên T.
- Luyện tập và Flashback tua lịch sử: **cấm dùng nến sau phiên đang hiển thị**, kể cả khi đã tải sẵn cả bộ dữ liệu.
- Tín hiệu tính từ `Close[T]` chỉ được xử lý giao dịch sớm nhất ở T+1, theo cơ chế khớp lệnh hiện có của từng sản phẩm.
- Giữ nguyên cách xử lý giá điều chỉnh, phiên nghỉ, thiếu nến và giai đoạn khởi tạo chỉ báo.

---

## 6. Cấu hình cũ [THAY ĐỔI]

**Không chuyển đổi và không giữ cấu hình điều kiện kiểu cũ.** Toàn bộ cấu hình điều kiện của 15 chỉ báo chuyển sang định dạng mới bằng **mặc định của mục 3**.

### 6.1 Cách làm

1. **Sao lưu** toàn bộ cấu hình cũ trước khi chạy. Có cách khôi phục nếu phải quay lại bản cũ.
2. Ghi đè cấu hình điều kiện của 15 chỉ báo bằng mặc định mục 3, cho **cả tab Mua và tab Bán**.
3. **Giữ nguyên** trạng thái bật/tắt của từng chỉ báo và công tắc Mua/Bán của người dùng. Chỉ thay nội dung các dòng.
4. Việc chuyển đổi chạy lại nhiều lần vẫn cho cùng kết quả. Ghi nhật ký số cấu hình đã chuyển.
5. Nơi đọc cấu hình (form, API, nhập JSON, preset, nhân bản Bot) **từ chối định dạng cũ** và dùng mặc định mới. Không cố ánh xạ `>`/`<` cũ sang cắt lên/cắt xuống.

### 6.2 Bot đang chạy

- Bot đang chạy lúc nâng cấp thì **tự chuyển sang trạng thái tạm dừng**.
- **Không gửi thông báo** cho người dùng: không email, không thông báo trong app, không popup.
- Khi tạm dừng:
  - **Không phát tín hiệu mới**, không đặt lệnh mới.
  - **Giữ nguyên** vị thế và tiền đang có. Không tự bán.
  - Lệnh đang chờ khớp từ trước (nếu hệ thống có) xử lý theo cơ chế tạm dừng hiện có của Bot.
- Bot hiển thị trạng thái **"Tạm dừng"** ở chỗ đang hiện trạng thái Bot. Dùng nhãn và kiểu hiển thị tạm dừng sẵn có, không thêm giao diện mới.
- Người dùng vào cấu hình Bot thì form hiện **mặc định mới**. Bấm **Lưu** thì Bot chạy lại, hiệu lực **từ phiên giao dịch kế tiếp**, như quy tắc lưu cấu hình hiện có.
- Bot đang tắt sẵn từ trước thì vẫn tắt, chỉ đổi cấu hình sang mặc định mới.

### 6.3 Lịch sử

- Kết quả Backtest đã chạy, lượt Luyện tập và Flashback đã xong: **giữ nguyên kết quả đã lưu**. Không chạy lại bằng điều kiện mới, không xoá.
- Nếu có chức năng "chạy lại" một Backtest cũ thì chạy bằng **cấu hình hiện tại** (đã là mặc định mới) và coi là lần chạy mới.

---

## 7. Nghiệm thu

### 7.1 Form

1. Cả 15 chỉ báo có đúng số dòng `3,3,1,2,3,2,1,1,1,1,3,1,2,2,1`. Chữ, toán tử và ô nhập đúng mục 3 và đúng HTML mẫu.
2. Không còn ô thông số nào đặt ngoài các dòng điều kiện.
3. RSI dòng 2 là `RSI [N] xu hướng [lên/xuống]`. Không còn dòng "RSI phiên trước".
4. Toán tử không thừa:
   - RSI dòng 1 và Stochastic dòng 1 chỉ có `>`/`<`.
   - Stochastic dòng 2, CCI, MFI, ROC, Williams %R, CMF chỉ có cắt lên/cắt xuống.
5. Sửa chu kỳ dòng 1 không làm đổi dòng 2. Tab Mua và tab Bán độc lập.
6. Lưu xong tải lại, đúng từng giá trị, kể cả `-0.05`, `-100`, `-80`, `5%`.

### 7.2 Tính tín hiệu (unit test)

```text
Cắt lên ngưỡng:       trước=-130, nay=-85, ngưỡng=-100        => đúng
                      trước=-90,  nay=-70                     => sai
Bằng ngưỡng:          trước=0,Y=0 ; nay=1,Y=0                 => cắt lên đúng
                      trước=0,Y=0 ; nay=0,Y=0                 => sai
MFI cắt lên 20:       15 -> 23 đúng ; 23 -> 25 sai
CMF cắt lên 0:        -0.03 -> +0.02 đúng ; +0.01 -> +0.06 sai
ROC cắt xuống -5:     -3 -> -6 đúng
Williams cắt lên -80: -85 -> -75 đúng
RSI xu hướng N=14:    RSI14[t]=48, RSI14[t-14]=41                    => lên đúng
                      chưa có RSI14[t-14]                            => NO_SIGNAL
RSI 2 dòng khác chu kỳ: dòng 1 RSI14<30 dùng RSI14 ; dòng 2 dùng RSI9 ; AND đúng
SMA xu hướng N=50:    so SMA50[t] với SMA50[t-50]
Stochastic Mua (2 dòng bật): Kprev=15,Dprev=17,K=19,D=18 => đúng ; K=23 => sai (dòng 1)
DMI Mua: +DI 18->26, −DI 24->22 ; ADX=21 ; dòng ADX>25 tắt => đúng ; bật => sai
Bollinger độ rộng:    0.10 -> 0.09 thu hẹp ; 0.08 -> 0.09 mở rộng
Donchian 20:          max High 20 phiên trước=100, Close[T]=103, High[T]=105 => đúng
Không bật dòng nào / tab tắt / chỉ báo tắt => NO_SIGNAL
Không nhìn trước:     tín hiệu chỉ xuất hiện ở T+1 => tại T phải sai ở mọi sản phẩm
```

### 7.3 Đồng bộ giữa các sản phẩm

7. Cùng mã, cùng dữ liệu tới T, cùng cấu hình: kết quả đúng/sai của từng dòng ở Bot, Backtest, Luyện tập, Flashback (nếu có tính) **giống nhau**. Không yêu cầu lệnh hay lãi lỗ giống nhau.
8. Sửa điều kiện ở sản phẩm lưu riêng không làm đổi sản phẩm khác. Sản phẩm vốn dùng chung thì vẫn chung.

### 7.4 Chuyển đổi cấu hình cũ

9. Sau nâng cấp:
   - Mọi cấu hình điều kiện là mặc định mục 3.
   - Trạng thái bật/tắt chỉ báo và công tắc Mua/Bán giữ nguyên.
   - Có bản sao lưu.
10. Bot đang chạy chuyển sang "Tạm dừng":
    - Không có email, thông báo hay popup nào.
    - Vị thế giữ nguyên, không có lệnh mới.
    - Lưu cấu hình xong thì Bot chạy lại từ phiên kế tiếp.
11. Nhập JSON hoặc preset dạng cũ: không nhận định dạng cũ, form hiện mặc định mới.
12. Kết quả Backtest, Luyện tập, Flashback cũ vẫn xem được, không đổi.

### 7.5 Không ảnh hưởng ngoài phạm vi

13. Layout, điều hướng, biểu đồ, cách khớp lệnh, phí, tính điểm, phần thưởng, quyền truy cập không đổi.

---

## 8. Quy trình và bàn giao

1. **Rà code:** điền bảng mục 0.4.
2. **Thiết kế:** nêu cách dùng chung một bộ định nghĩa và một hàm tính cho mọi sản phẩm, tái dùng phần tính chỉ báo đã có.
3. **Làm:**
   - Sửa form ở từng nơi theo mục 3.
   - Sửa hàm tính theo mục 2 và mục 3.
   - Làm phần chuyển đổi cấu hình theo mục 6.
4. **Test:** unit cho từng dòng của 15 chỉ báo, test giữa các sản phẩm, test không nhìn trước, test chuyển đổi.
5. **Bàn giao:**
   - Danh sách file đã sửa và lý do.
   - Bảng kiểm kê đã điền.
   - Kết quả test.
   - Bảng đối chiếu tín hiệu giữa các sản phẩm.
   - Số cấu hình và số Bot đã chuyển đổi hoặc tạm dừng.
   - Cách khôi phục bản cũ.
   - Các điểm còn vướng.

Không báo "đã test" nếu chưa chạy test. Không chạy được thì ghi rõ lỗi.

### Câu giao việc ngắn cho AI Dev

> Thực hiện **SPEC V3** trên codebase iqx.vn hiện có. Điều kiện Mua/Bán của 15 chỉ báo phải **đúng y như `IQX_CHI_BAO_MAU_v2.html`**:
> - Mọi chu kỳ và ngưỡng nằm trong từng dòng, mỗi dòng tính độc lập.
> - RSI dòng 2 là "xu hướng lên/xuống" (so với N phiên trước).
> - Không giữ toán tử hay cấu hình kiểu cũ.
>
> Rà toàn repo để sửa đủ mọi nơi dùng điều kiện: Bot, Backtest, Luyện tập, Flashback và nơi khác. Dùng chung một bộ định nghĩa và một hàm tính.
>
> Chuyển mọi cấu hình cũ về mặc định mới, có sao lưu. Bot đang chạy thì tạm dừng, không thông báo người dùng, chạy lại khi người dùng lưu cấu hình.
>
> Không đổi giao diện ngoài form điều kiện, không đổi khớp lệnh, phí, tính điểm hay cách kết hợp nhiều chỉ báo. HTML mẫu chỉ là chuẩn nội dung, không chép làm giao diện.
