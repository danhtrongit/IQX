# IQX — BỘ CHIẾN LƯỢC
## Cảnh báo · Backtest · Bộ lọc · Liên kết Bot và Học viện mới

**Phiên bản bàn giao:** 1.0 · bộ Chiến lược mới  
**Ngày biên soạn:** 07/10/2026  
**Phạm vi:** Bố cục, cấu trúc, nguyên tắc vận hành và hợp đồng tích hợp ba tab vào IQX hiện có.  
**Spec:** `IQX-Bo-Chien-Luoc-SPEC-v1.0.md`
**HTML đi kèm:** `IQX-Bo-Chien-Luoc-MAU-v1.0.html`. Bản mới kế thừa hình thức ba tab đã duyệt, cập nhật đúng Bộ Bot/Học viện v1.0; không phải bản sao nguyên byte.
**Giáo trình:** không biên soạn hay ghép nội dung từng bài trong đợt này.
**Trạng thái:** yêu cầu triển khai trên IQX hiện có; không xác nhận production đã được cập nhật.  
**Bộ đầu vào:** Đúng hai file: spec này và HTML mẫu. Không có README, prompt, JSON kiểm thử hoặc ZIP bắt buộc khác.  
**Đối tượng:** AI dev, frontend, backend và QA có quyền truy cập repository IQX.

> **Chỉ thị triển khai:** Đọc toàn bộ spec, mở cả ba tab của HTML, xác minh đúng nhánh code và các service đang dùng, rồi nâng cấp trực tiếp trang Chiến lược hiện có. Không xây ứng dụng Strategy Lab/Company Lab độc lập; không lấy engine, dữ liệu giả lập hay localStorage của HTML thay cho backend thật. Bảo toàn tài khoản, cấu hình và lịch sử. Phần đã đủ hợp đồng thì triển khai và kiểm thử; chỉ báo đúng điểm thiếu khi thật sự thiếu nguồn dữ liệu, hợp đồng hoặc quyền truy cập. Không dựng phiên bản trứng/stop L1/Săn mã nguồn Bot cũ trước rồi mới sửa. Không thực thi bút toán hay lệnh giao dịch chỉ từ việc mở trang, học, lọc hoặc xem kết quả.

---

## 0. Cách đọc, căn cứ và giới hạn

### 0.1. Thứ tự nội dung

| Cần tìm | Mục |
|---|---|
| Phạm vi, navigation, quyền và cấu hình dùng chung | 1–3 |
| Cảnh báo: tạo, nguồn cấu hình, tín hiệu mới, lịch sử | 4 |
| Backtest: giao diện, mô phỏng, kết quả và lịch sử | 5–6 |
| Bộ lọc: giao diện, kỳ tính, số liệu và lưu danh mục | 7–8 |
| Liên kết Học viện/Bot và dữ liệu/API | 9–10 |
| Chuyển đổi hệ thống hiện có | 11 |
| Mẫu HTML và các điểm không được sao chép vào production | 12 |
| Ca nghiệm thu nằm ngay trong spec | 13 |
| Phụ thuộc cần xác minh, trình tự triển khai và bàn giao | 14 |
| Catalog 16 chỉ báo/42 bài cơ bản và mapping | Phụ lục A |
| Form, params, toán tử 16 chỉ báo | Phụ lục B |
| Biến thể tính chuỗi tham chiếu chung với Bot | Phụ lục C |

### 0.2. Căn cứ và thứ tự ưu tiên hiện tại

1. Những quyết định mới của chủ sản phẩm được hợp nhất trong spec này: ba tab trên trang Chiến lược hiện có; đúng 16 chỉ báo; quyền theo bài; Bot/Backtest cùng cấu hình đã lưu; Cảnh báo ghim bản riêng; Bộ lọc chọn danh mục mua mới của Bot; không stop Bot; không cổng trứng.
2. Bộ Bot v1.0 và Bộ Học viện v1.0 đã được duyệt: 13 chương/71 bài; Học viện chỉ Xem bài/Đã học; VN30 mặc định hoặc snapshot danh mục được áp; giữ xét Bán mọi vị thế. Các hợp đồng cần thiết được ghi đầy đủ tại mục 3, 8 và 9, không yêu cầu dev đọc chéo spec cũ để giải mã bản đích.
3. HTML mới đi kèm kế thừa CSS/bố cục ba tab từ `IQX-Chien-Luoc.html` (mẫu kỳ tính riêng v2), **có cập nhật chức năng**, không phải bản sao nguyên byte của mẫu cũ. Registry 16 chỉ báo và catalog lấy đúng bộ Bot đã duyệt.
4. Các phần còn phù hợp của spec Chiến lược trước: phạm vi một mã, chart lợi nhuận %, toàn bộ lịch sử, cảnh báo theo trạng thái cuối phiên, kỳ riêng và nguồn báo cáo. Phần cũ còn ghi chờ nở/V1/V2/stop L1/Săn mã nguồn Bot/Học viện ghi cấu hình không còn hiệu lực ở bản đích này.
5. Repository, nguồn quyền, lịch, phí, dữ liệu và service thật là nơi xác minh tích hợp. Commit nền `6418db3` trong tài liệu tham chiếu cũ không xác nhận đó là production hiện tại.

**Ba lớp thông tin phải phân biệt:** quyết định sản phẩm; hình thức/tương tác mẫu; giả định hoặc nguồn chưa được xác minh. Những điểm còn thiếu được nêu rõ tại mục 14, không được điền bằng công thức hay quy định thị trường suy đoán.

**Không âm thầm sửa hoặc hòa giải các nguồn mâu thuẫn:** những thay đổi nghiệp vụ được chỉ rõ trong bảng sau. Những khác biệt về công thức, khớp/thanh toán hoặc dữ liệu chưa có quyết định vẫn phải báo đúng chỗ thiếu.

| Phần từng có trong tài liệu cũ | Bản đích của bộ Chiến lược này |
|---|---|
| Cấu hình tại Học viện | Chỉ Bot và Backtest có quyền ghi cấu hình chung; Học viện đọc bài/tiến độ và cấp năng lực |
| 35 chỉ báo; 18 chương/125 bài | 16 chỉ báo; cùng catalog 13 chương/71 bài của bộ mới |
| Bot V1 sau nở, V2 học viện | Một Bot có linh thú từ đầu, không điều kiện trứng/nở |
| Giữ stop L1 của Bot | Bot không stop/chốt lời/trailing/max holding ngầm |
| Săn mã cung cấp ứng viên Bot | Săn mã độc lập; Bot lấy VN30 hoặc danh mục Bộ lọc đã áp |
| Bộ lọc chỉ lưu danh mục, không được thay nguồn Bot | Bổ sung Áp dụng cho Bot/Về VN30 với phiên hiệu lực |
| Cấm mọi nút Áp dụng cho Bot | Chỉ không tạo nút Apply **cấu hình kỹ thuật** thứ hai; cho phép Apply **tập mã** |
| Mẫu chỉ năm chỉ báo | HTML mới cấu hình/tính thử đủ 16 trên dữ liệu giả; phải đối chiếu engine thật |
| Tên của 42 bài cơ bản | Giữ metadata 42; sáu Chương 3 có contract mẫu; các mục còn lại cần registry/nguồn thực xác minh |

### 0.3. Những việc không giao trong đợt này

Không viết nội dung, biểu đồ giảng dạy hay câu kiểm tra của 13 chương/71 bài. Không xây lại panel Học viện trong bộ mới đã bàn giao. Không thay thuật toán giao dịch Bot hoặc tài khoản tự giao dịch của người dùng. Không bổ sung AI tự tạo chiến lược, chỉ báo ngoài 16 hoặc chỉ tiêu chưa có định nghĩa được xác minh, tối ưu tham số, Walk-Forward, danh mục nhiều mã dùng chung vốn, xếp hạng, đa khung thời gian, trailing, chốt lời hoặc quản trị danh mục nâng cao.

Đây không phải yêu cầu chỉ làm hình tĩnh: các thao tác trong phạm vi phải nối dữ liệu, quyền, lưu trữ và service thật. Nhưng nếu một năng lực chưa có hợp đồng tính toán thì phải báo đúng phần thiếu, không sáng tác công thức để làm cho nút hoạt động.

---

## 1. Navigation và vai trò

```text
CHIẾN LƯỢC
├─ Cảnh báo
├─ Backtest
└─ Bộ lọc
```

| Tab | Mục đích | Không được hiểu thành |
|---|---|---|
| Cảnh báo | Theo dõi khi mã trong phạm vi chọn thỏa điều kiện kỹ thuật | Bot đã mua/bán hoặc một lệnh được đặt |
| Backtest | Kiểm thử điều kiện và giả định trên dữ liệu lịch sử | Bản sao đầy đủ tài khoản/luật nền của Bot |
| Bộ lọc | Tìm doanh nghiệp theo tiêu chí, lưu và chủ động áp dụng danh mục mua mới cho Bot | Khuyến nghị mua, xếp hạng chắc chắn tốt hoặc danh mục đang nắm giữ |

### 1.1. Route và điều hướng

- Giữ trang `/chien-luoc` và routing hiện có. Dùng các tab tương ứng; tên query/ID nội bộ được ánh xạ vào router thật.
- Không tạo navigation cấp cao mang tên “Strategy Lab”, “Company Lab” hoặc “Sàng lọc doanh nghiệp”. Nhãn tab là **Bộ lọc**.
- Link đang dùng tới Backtest phải tiếp tục mở đúng tab/mã; không tạo redirect làm mất tham số.
- Khi không có lựa chọn tab hợp lệ, giữ mặc định hiện có của trang Chiến lược; tài liệu cũ mô tả mặc định là Cảnh báo. HTML lần này mở Bộ lọc trước chỉ để xem thay đổi kỳ tính, không phải yêu cầu đổi mặc định production.
- Chuyển tab giữ trạng thái đã xác nhận, bản đang chỉnh và kết quả đang xem theo cơ chế hiện tại. Rời modal có thay đổi chưa lưu phải có xác nhận; không lưu nhầm khi chuyển tab.
- Không copy nút giả “ngoài phạm vi” từ mẫu vào những tính năng website thật đang hoạt động.

### 1.2. Bố cục chung

Giữ header, hệ màu tối/sáng, tab, kiểu nút, khoảng cách, bảng và modal của mẫu đã duyệt, tích hợp vào khung IQX hiện có. Backtest và Bộ lọc có thư viện bên trái, vùng nội dung bên phải. Cảnh báo ưu tiên bảng theo dõi và lịch sử, không cần dựng thư viện ở cạnh bảng.

Màn hình nhỏ mở thư viện bằng nút “Chỉ báo” hoặc “Chỉ tiêu”; các nhóm nội dung xếp dọc. Chỉ bảng cần cuộn ngang nội bộ; không tràn ngang toàn trang. Modal cấu hình và các nút Đặt lại/Hủy/Lưu phải dùng được ở 390 px và 360 px.

Không có cards tiếp thị, mascot mới, bảng điểm chất lượng chiến lược, diễn giải dài ở từng dòng, hoặc các khối đã bị yêu cầu bỏ. Các thông tin nghiệp vụ cần thiết như kỳ, đơn vị, nguồn, trạng thái dữ liệu, saved/effective và lỗi vẫn phải xem được.

---

## 2. Quyền Học viện và danh mục công cụ

### 2.1. Quyền dùng khác với bật sử dụng

- Catalog Học viện có thể hiển thị tất cả tên chương/bài; **thư viện Backtest/Cảnh báo/Bộ lọc chỉ dùng các năng lực đã được server cấp quyền**.
- Đạt bài kiểm tra chỉ mở quyền, không tự bật Mua/Bán, không tạo cảnh báo và không tự chạy Backtest/Bot.
- Điều kiện truy cập gói, đăng nhập, trạng thái tài khoản được kế thừa từ guard thật. Không thay chính sách Premium hoặc bypass bằng trạng thái demo.
- Kiểm tra quyền ở server cho đọc dữ liệu, lưu cấu hình, chạy, tạo/chỉnh/bật cảnh báo và lọc. Việc client không vẽ một nút không phải kiểm tra quyền.
- Khi mất quyền, không tự xóa cấu hình hay lịch sử. Chặn thao tác không còn được phép và ghi đúng lý do theo chính sách tài khoản hiện hành.

### 2.2. Catalog hiện tại, tên và năng lực sẵn sàng

Dùng cùng `catalog_version = iqx-academy-outline-13ch-71lessons-v1` với Học viện. ID capability ổn định, không dùng tên tiếng Việt hoặc chỉ vị trí chương làm khóa. Học viện có 13 chương/71 bài: 16 kỹ thuật, 42 cơ bản, 12 hướng dẫn và 1 Hợp lưu. Thư viện công cụ không phải mục lục bài học.

| Nhóm kỹ thuật | Các chỉ báo giữ |
|---|---|
| Chương 1 | RSI; MACD; MA / SMA; Bollinger Bands; Khối lượng |
| Chương 5 | EMA; MA Cross; DMI; Stochastic; CCI |
| Chương 7 | OBV; MFI; Chaikin Money Flow — CMF |
| Chương 10 | Donchian Channel; ROC; Williams %R |

Chỉ báo chỉ sử dụng khi có grant và contract tính toán hợp lệ. Không coi ADX/ATR/cấu trúc giá/nhóm thị trường đã bỏ là nút khóa sẽ mở lại. Hợp lưu là logic AND, không phải chỉ báo thứ 17.

**Nguồn công thức kỹ thuật:** Phụ lục B/C và registry trong HTML lấy từ bộ Bot đã duyệt. Không sao RSI sang 15 chỉ báo khác; không thay trạng thái MACD bằng giao cắt hoặc thêm ADX vào DMI. Các định nghĩa cần được đối chiếu engine thật, giữ version và bằng chứng sai khác.

**42 chỉ tiêu cơ bản:** giữ đúng tên/binding ở Phụ lục A. Bộ khung hỗ trợ registry có đơn vị, kiểu, toán tử, kỳ mặc định/kỳ cho phép, công thức/nguồn/calculation version, applicability và readiness. Sáu chỉ tiêu Chương 3 có bảng kỳ/cơ sở mẫu tại mục 7; không phải sự xác nhận 36 chỉ tiêu khác đã có định nghĩa. Tìm định nghĩa đã duyệt trong repo trước; thiếu thật thì ghi `definition_pending/data_unavailable`, không tự dịch tên thành công thức.

Thư viện chính chỉ hiển thị công cụ đã mở và có khả năng sử dụng hợp lệ. Trạng thái lỗi đồng bộ quyền/readiness cần giải thích đúng chỗ, không bắt học lại hoặc silently bỏ điều kiện đang lưu. HTML có “Danh mục 42 chỉ tiêu” để dev xem metadata/những mục chưa có mẫu; đây không là cổng mở quyền hoặc thêm 36 công cụ giả.

Tên trong Bộ lọc và Học viện phải khớp; giữ **Tăng trưởng LNST YoY** trên giao diện. Không vòng tròn/badge viết tắt “DT YoY”, không công tắc Mua/Bán ở Bộ lọc. Cách phân loại loại bài trong metadata chỉ dành cho tích hợp, không thêm thẻ marketing/viết tắt ở thư viện.

Grant theo đúng bài/capability chứ không chờ cả chương. Ví dụ Chương 7 mới bài 1 là OBV, legacy cùng vị trí là ATR: không cấp nhầm OBV từ ATR. Các trường `new_lesson_id/new_chapter` của registry Bot là nguồn mapping bản mới; giữ các trường gốc chỉ để chuyển dữ liệu có chứng cứ.

---

## 3. Cấu hình kỹ thuật dùng chung

### 3.1. Một nguồn dữ liệu đã lưu

**Bot và Backtest** đọc/ghi **cùng cấu hình chỉ báo đã lưu**. **Học viện không ghi cấu hình**; chỉ cung cấp nội dung, tiến độ và grants. Mini có draft/snapshot riêng; Cảnh báo ghim snapshot đã được chọn. Không tạo nhiều record vận hành độc lập vì ở nhiều màn khác nhau.

Lưu trong Backtest có tác động tới cấu hình chung mà Bot sẽ dùng ở phiên hiệu lực. UI phải nêu rõ điều này trong modal và thể hiện saved/effective/pending; không quảng bá Backtest là nơi chỉnh cấu hình hoàn toàn không tác động Bot. Chỉ chạy/lưu kết quả không ghi cấu hình.

Hình dạng logic dưới đây là ví dụ, không bắt buộc đổi tên bảng/route thật:

```json
{
  "indicator_id": "rsi",
  "master_enabled": false,
  "buy": {
    "enabled": false,
    "params": {"period": 14, "level": 30},
    "rules": [
      {"id": "r1", "lhs": {"series": "rsi", "offset": -1}, "op": "<", "rhs": {"param": "level"}},
      {"id": "r2", "lhs": {"series": "rsi", "offset": 0}, "op": ">", "rhs": {"series": "rsi", "offset": -1}}
    ]
  },
  "sell": {
    "enabled": false,
    "params": {"period": 10, "level": 75},
    "rules": [
      {"id": "r1", "lhs": {"series": "rsi", "offset": -1}, "op": ">", "rhs": {"param": "level"}},
      {"id": "r2", "lhs": {"series": "rsi", "offset": 0}, "op": "<", "rhs": {"series": "rsi", "offset": -1}}
    ]
  }
}
```

Đây là minh họa trạng thái OFF và cấu trúc hai phía; không phải lệnh cấp quyền hoặc cấu hình tự chạy mặc định. Server cấp revision, xác minh owner, quyền, schema và registry. Không nhận `allowed_ops` hay quyền học do client tự khai như nguồn chuẩn. Không dùng `eval()` để thực thi chuỗi người dùng nhập.

### 3.2. Form và thao tác

Modal giữ hai tab **MUA / BÁN**, công tắc mỗi phía, thông số, dòng điều kiện, **Đặt lại · Hủy · Lưu**. Chỉ dùng ký hiệu toán tử; không cần chữ “lớn hơn/nhỏ hơn” dưới dấu. Thông báo lỗi phải rõ và ở đúng field.

| Thao tác | Hành vi |
|---|---|
| Thêm vào Mua/Bán từ thư viện | Mở đúng phía để xem/chỉnh; chỉ commit khi người dùng lưu. Hủy không thêm điều kiện. |
| Chỉnh một phía | Giữ nguyên phía còn lại, kể cả khác chu kỳ/ngưỡng/dấu. |
| Đặt lại | Chỉ đặt params/rules của tab đang chỉnh về mặc định registry; không tự bật phía, không đổi phía kia. Vẫn cần Lưu. |
| Hủy/Esc/rời modal | Có thay đổi thì xác nhận bỏ; không ghi cấu hình. |
| Lưu | Validate cả dữ liệu cần commit, kiểm tra revision; thành công mới cập nhật nguồn chung. Lỗi giữ draft. |
| Bỏ chỉ báo khỏi một panel Backtest | Tắt đúng phía trong cấu hình chung, giữ tham số; không xóa chỉ báo phía kia. Đây là thao tác lưu có ảnh hưởng dùng chung, không phải chỉ ẩn card. |
| Hai phía cùng OFF | Master OFF; không tự sinh tín hiệu từ tập rỗng. |
| Master OFF | Loại chỉ báo khỏi cả hai phía nhưng giữ lựa chọn con. Bật lại không tự đổi các lựa chọn con. |

Mẫu không vẽ thêm master switch ở Backtest: việc thêm một phía đã lưu phải làm phía đó thực sự tham gia thông qua cấu hình master hợp lệ. Không có card trông đang hoạt động nhưng engine bỏ qua vì master còn OFF mà không hiển thị đúng trạng thái.

### 3.3. Logic điều kiện

```text
E_buy  = chỉ báo có quyền, master ON, buy.enabled ON
E_sell = chỉ báo có quyền, master ON, sell.enabled ON

buy_signal  = E_buy không rỗng  VÀ tất cả điều kiện Mua đúng
sell_signal = E_sell không rỗng VÀ tất cả điều kiện Bán đúng
```

Các dòng trong mỗi mẫu chỉ báo và các chỉ báo cùng phía đều AND trong phạm vi cơ bản. Không dùng đa số, điểm tổng hợp hoặc OR để bù một điều kiện không đạt. Mẫu so sánh `>`/`<` là nghiêm ngặt; bằng ngưỡng không đạt. Với `∈`/`∉`, dùng định nghĩa biên có version trong registry; bản đích tham chiếu Bot đang dùng khoảng mở `(lower, upper)` và chỉ phủ định trên dữ liệu hợp lệ. Mục B/C ghi biến thể phải đối chiếu trước production, không đổi biên âm thầm.

Hai phía có thể cùng đúng. Không ép một chỉ báo chỉ có một nhãn loại trừ nhau mua/bán/không có. Dữ liệu thiếu khác điều kiện sai; không biến `NOT(missing)` thành true, không bỏ điều kiện thiếu rồi AND phần còn lại.

Cùng một phía tính T và T−1 theo cùng tham số của snapshot. Không lấy RSI14 của phiên trước ghép RSI10 hôm nay để làm một điều kiện sau khi đổi cấu hình. Không dùng tín hiệu từ phiên trước để bù hợp lưu phiên đang xét.

### 3.4. Draft, saved, effective và snapshot

| Trạng thái/đối tượng | Quy tắc |
|---|---|
| Draft | Chưa lưu, không thay Bot. |
| Saved revision | Bản được server xác nhận. Có thể chọn làm đầu vào Backtest hoặc tạo cảnh báo. |
| Effective revision của Bot | Phiên hợp lệ đầu tiên có ngày lớn hơn ngày nhận lưu, theo `Asia/Ho_Chi_Minh` và lịch IQX. |
| Snapshot Backtest | Bộ cấu hình, dữ liệu, phiên bản thuật toán và giả định cố định cho một lần chạy. |
| Snapshot Cảnh báo | Bộ điều kiện/phiên bản người dùng chủ động chọn khi lưu cảnh báo; không tự chạy theo thay đổi cấu hình chung sau đó. |

Không thêm “Từ Bot”, “Từ Học viện” như hai bộ cấu hình khác nhau. Không có “Mô phỏng Bot” hoặc nút Apply cấu hình kỹ thuật thứ hai. Nút **Áp dụng cho Bot tại Bộ lọc** chỉ đổi tập mã nguồn mua, theo mục 8.4–8.7. UI phải báo đúng saved/pending/effective; không nói Bot đã dùng bản mới trước phiên áp dụng.

Mở lịch sử, tải kết quả cũ, chạy kiểm thử, lưu kết quả hoặc tạo/tắt cảnh báo **không tự lưu lại cấu hình vận hành**. Lưu params từ màn Cấu hình chung thì có tác động chung và phải được thông báo đúng. Hai thiết bị dùng `expected_revision`; không âm thầm ghi đè bản mới bằng tab cũ.

---

## 4. Tab Cảnh báo

### 4.1. Vai trò và bố cục

Theo dõi điều kiện kỹ thuật, không đặt lệnh. Không yêu cầu mã đang có vị thế để được báo tín hiệu Bán. Không giới hạn phạm vi vào Săn mã của Bot. Không kiểm tra ngân sách, tỷ lệ NAV hoặc stop L1 trong cảnh báo tín hiệu này.

| Vùng | Nội dung theo mẫu |
|---|---|
| Thanh hành động | Tạo cảnh báo; trạng thái/lần kiểm tra. “Kiểm tra mẫu” chỉ là nút chạy dữ liệu mẫu, không thay worker thật. |
| Bảng đang theo dõi | Tên; phạm vi mã/danh mục; phía Mua/Bán; phiên bản cấu hình; bật/tạm dừng; lần kiểm tra gần nhất; Chỉnh/Xóa. |
| Lịch sử tín hiệu | Phiên; mã; Mua/Bán; tên cảnh báo; bản cấu hình; Xem điều kiện. Có lọc phía tín hiệu. |
| Chi tiết tín hiệu | Giá trị vế trái/phải, dấu, tên chỉ báo và snapshot lúc tín hiệu được ghi nhận. |

Dùng thông điệp **“Thỏa điều kiện Mua/Bán”**. Không dùng “Bot đã mua/bán” hoặc “Lệnh đã khớp”. Mã thỏa tín hiệu vẫn có thể không được Bot mua do các luật nền khác.

### 4.2. Tạo/chỉnh cảnh báo

Form giữ đúng mẫu: tên; nguồn cấu hình; phạm vi; phía theo dõi; bật/tạm dừng.

Nguồn cấu hình:
1. **Cấu hình chung đã lưu:** lấy revision và nội dung đã xác nhận, ghim tại thời điểm lưu cảnh báo.
2. **Cấu hình của kết quả kiểm thử:** từ một kết quả cụ thể; không lấy form đang chỉnh nếu khác kết quả.
3. **Giữ cấu hình đang theo dõi:** khi chỉnh cảnh báo hiện hữu; đổi tên không tự chuyển sang bản mới nhất.

Chọn một mã, nhiều mã hoặc một danh mục nghiên cứu đã lưu. Nếu chọn danh mục, lưu ID/phiên bản tham chiếu và tập mã thực tế được chọn. Bộ lọc động thay đổi hoặc danh mục nguồn bị xóa không tự làm tập mã của cảnh báo đã lưu biến đổi; chỉ cập nhật sau thao tác có xác nhận.

Phía Mua/Bán chỉ có thể chọn nếu nguồn snapshot có tập điều kiện hợp lệ không rỗng của phía đó. Cho phép chỉ Mua, chỉ Bán hoặc cả hai. Không tự bật cấu hình chung khi bật ô theo dõi. Không có phía nào hợp lệ thì không tạo cảnh báo hoạt động.

Tên không trắng; mã hợp lệ thuộc catalog thật; quyền và ownership kiểm tra ở server. Hạn mức và tên trùng theo quy tắc có sẵn của dự án; không tự lấy giới hạn 20 mục của mẫu làm hạn mức gói thật. Không ghi đè cảnh báo khác để giải quyết tên trùng.

### 4.3. Cảnh báo ghim phiên bản, không đồng bộ trực tiếp

- Lưu cảnh báo giữ bộ điều kiện bất biến tới lần người dùng cập nhật chính cảnh báo đó.
- Sửa RSI/MA ở Bot hoặc Backtest không tự đổi cảnh báo đã lưu.
- Cập nhật cảnh báo sang nguồn mới tạo phiên bản cảnh báo có thể truy vết; không thay bằng chứng của tín hiệu cũ.
- Tắt cảnh báo chỉ dừng theo dõi của nó; không tắt chỉ báo hoặc tạo/hủy giao dịch Bot.
- Xóa cảnh báo dừng phát sinh mới, giữ lịch sử theo chính sách lưu trữ; không để lịch sử bị mất tên/điều kiện chỉ vì bản hiện hành bị xóa.
- Đổi tên hoặc bật/tạm dừng không tự nhân bản giao dịch, danh mục hoặc tài khoản.

### 4.4. Kiểm tra cuối phiên và chuyển trạng thái

Giai đoạn này dùng dữ liệu ngày đã hoàn tất. Kiểm tra sau khi nguồn dữ liệu xác nhận hoàn tất phiên, không gán một giờ cụ thể tùy ý và không chạy trên nến ngày còn hình thành rồi gọi là tín hiệu cuối phiên.

Mỗi tổ hợp `(cảnh báo, phiên bản điều kiện, mã, phía)` theo dõi trạng thái hợp lệ gần nhất. `alert_definition_version` tách khỏi `shared_config_revision`: đổi bộ điều kiện/phạm vi/phía tạo version định nghĩa mới, chỉ đổi tên không thay snapshot hay reset trạng thái. Bật lại sau tạm dừng khởi quan sát hiện tại nhưng vẫn chống trùng event cùng phiên/version/mã/phía. Kết quả có ba trạng thái: **đúng / sai / chưa đánh giá được**.

| Trạng thái hợp lệ trước | Kết quả hiện tại | Hành vi |
|---|---|---|
| Chưa có lần kiểm tra hợp lệ | Đúng | Ghi “Đang thỏa ở lần kiểm tra đầu”; không khẳng định vừa giao cắt. |
| Sai | Đúng | Ghi tín hiệu mới thỏa điều kiện. |
| Đúng | Đúng | Tiếp tục thỏa; không gửi lặp mỗi phiên. |
| Đúng hoặc Sai | Sai | Cập nhật trạng thái; không phát Mua/Bán chỉ vì điều kiện vừa mất. |
| Bất kỳ | Thiếu dữ liệu | Ghi chưa đánh giá được; không thay trạng thái hợp lệ trước bằng sai/đúng. |

Sau khoảng thiếu dữ liệu, nội dung không được khẳng định chính xác một giao cắt đã xảy ra trong ngày thiếu. Giữ dấu vết phiên có dữ liệu trước và phiên hiện tại. Ví dụ đúng → thiếu → đúng không tạo tín hiệu mới chỉ vì nguồn được phục hồi.

Chống thông báo lặp không được biến `MACD > đường tín hiệu` thành một chỉ báo giao cắt khác. Logic chỉ báo và logic phát thông báo là hai lớp riêng.

### 4.5. Chống trùng, tạm dừng và vận hành

- Cùng phiên và cùng bản điều kiện, retry hoặc nhiều worker không được ghi/phát trùng một sự kiện cho cùng mã/phía. Dùng khóa bền vững hoặc cơ chế tương đương trong backend, không chỉ kiểm tra mảng client.
- Một phiên có Mua và Bán cùng đúng được ghi hai loại tín hiệu độc lập nếu cả hai phía được theo dõi; đây không phải hai giao dịch.
- Lưu `signal_session`, `evaluated_at`, `data_version`, giá trị điều kiện và ID phiên bản cảnh báo. Không sửa thời gian ghi thật để giả rằng hệ thống đã biết tín hiệu sớm hơn.
- Khi tạm dừng, không phát sự kiện mới. Khi bật lại, mẫu kiểm tra trạng thái hiện tại như lần bắt đầu theo dõi; không tự gửi toàn bộ tín hiệu của thời gian người dùng đã tạm dừng. Cùng phiên/bản/mã/phía đã ghi thì vẫn phải chống trùng.
- Bù phiên do worker lỗi khác với bật lại sau khi người dùng tạm dừng. Mẫu có vòng lặp xử lý phiên chưa kiểm tra, nhưng không có chính sách thông báo bù production. Cần xác minh mục 14; không tự gửi dồn lịch sử cũ như thông báo thời gian thực.
- Thiếu dữ liệu ở một mã/phía không làm hỏng các tổ hợp đủ dữ liệu. Lần quét toàn bộ thành công không có nghĩa mọi mã đều đã được đánh giá.
- Chỉ hiển thị thông báo/lịch sử trên web trong phạm vi này. Không tự triển khai email, Telegram, SMS hoặc push ngoài web.

### 4.6. Trạng thái giao diện

Phân biệt “Đang theo dõi”, “Tạm dừng”, “Chưa kiểm tra”, “Chờ dữ liệu”, “Lỗi cấu hình/quyền”. Trạng thái user bật cảnh báo không được dùng thay trạng thái worker chạy thành công.

Bằng chứng lịch sử lấy từ dữ liệu đã ghi tại phiên đó, không tính lại bằng giá/cấu hình hôm nay. Lịch sử phải truy cập đầy đủ. Nhấn refresh không tạo tín hiệu giả hoặc đổi cấu hình ghim.

---

## 5. Tab Backtest — cấu trúc và thao tác

### 5.1. Nâng cấp nền hiện có

Giữ Backtest trong trang Chiến lược, tái sử dụng dữ liệu, engine, API, quyền và lưu trữ phù hợp. Phạm vi cơ bản là **một mã, dữ liệu ngày, mua rồi bán, tối đa một vị thế đang mở**. Không bán khống, không margin, không mua thêm, không bán từng phần hoặc chạy cả danh mục dùng chung vốn.

Không khẳng định engine cũ đã có lựa chọn “Mở cửa phiên kế tiếp” chỉ vì HTML có. Nếu chưa có, phải triển khai và kiểm thử mode này theo hợp đồng mục 6, hoặc phản hồi rõ phần chưa đáp ứng; không để lựa chọn chạy cùng một logic giả.

### 5.2. Bố cục cần giữ

| Khối | Nội dung |
|---|---|
| Thư viện | Chỉ báo đã mở, tìm kiếm, nút thêm Mua/Bán riêng. |
| Thanh hành động | Cấu hình chung/bản đã lưu; Đã lưu; Lưu phiên bản; Tạo cảnh báo từ kết quả khi hợp lệ. |
| Thông tin | Mã; từ ngày; đến ngày; vốn ban đầu; tên/sàn/ngành/giá tham khảo có nguồn. |
| Điều kiện Mua | Các card phía Mua, thông số, dấu, Chỉnh/Bỏ và nhãn AND. |
| Điều kiện Bán | Tương tự nhưng độc lập phía Bán. |
| Giả định Backtest | Khớp lệnh, phí; nút Chạy backtest. |
| Kết quả | Sáu KPI, Lợi nhuận danh mục (%), giả định lần chạy, toàn bộ giao dịch và vị thế còn mở/lệnh cuối kỳ chưa khớp nếu có. |

Giữ **không có**: Mô phỏng Bot; Từ Bot/Từ Học viện như nguồn riêng; Áp dụng cho Bot; khối thống kê số phiên từng chỉ báo đúng/tất cả cùng đúng; khối quản trị vị thế chưa học. Không đưa ATR stop, chốt lời, trailing, thời gian giữ hoặc một ô hợp lưu thứ hai vào dưới hai panel.

### 5.3. Đầu vào và chạy

- Mã lấy từ catalog thật; tìm/nhập được ngoài 9 mã giả của mẫu. Ngày phải hợp lệ, từ ngày không sau đến ngày; dữ liệu thực và warmup phải đủ cho chỉ báo tương ứng.
- Vốn hữu hạn, dương và nằm trong giới hạn API đã được xác minh. Phân biệt định dạng Việt Nam và giá trị số; không làm 100.000.000 thành 100.
- Không tự giới hạn dữ liệu thật vào 2024–2025 như HTML, không dùng lịch giả loại cuối tuần làm lịch giao dịch IQX.
- Không có điều kiện Mua đang dùng thì nút chạy không được thực thi. Có Mua nhưng không có Bán vẫn được chạy.
- Mặc định dùng cấu hình chung đã lưu. Nhấn Chạy chụp input/revision; không tự lưu một draft trong modal chưa xác nhận.
- Không tự chạy lại mỗi khi gõ số, tải cấu hình hoặc đổi mã. Cho nút chạy lại chủ động; lần chạy đang chờ không gửi trùng do bấm nhiều lần.
- Loading, lỗi validation, không có dữ liệu, chưa đủ warmup, timeout và kết quả thành công phải tách biệt. Không dùng spinner/thông báo thành công giả do timer của HTML.
- Nếu backend hiện đồng bộ, có thể giữ API đó; không dựng progress/polling/cancel giả. Nếu chuyển sang job thì cần hợp đồng job thực, không lấy phần trăm đếm thời gian làm tiến độ.

### 5.4. Kết quả bất biến

Mỗi kết quả giữ cấu hình, params, mã, ngày thực/requested, vốn, phí, kiểu khớp, dữ liệu và phiên bản thuật toán đã dùng. Sửa form không sửa kết quả cũ hoặc lý do giao dịch. Hiển thị **“Cấu hình đã đổi · cần chạy lại”** khi kết quả không thuộc cấu hình/giả định đang chỉnh.

Lưu phiên bản chỉ lưu kết quả vừa chạy cùng đầu vào tương ứng, không gắn kết quả cũ với form mới. Mở một phiên bản cũ không ghi đè cấu hình chung. Chỉ sau run mới thành công mới thay vùng kết quả; lỗi không biến số cũ thành kết quả mới.

Tạo cảnh báo từ kết quả phải lấy **snapshot của chính kết quả**, đúng Mua/Bán, toán tử, tham chiếu chỉ báo và mã được chọn. Không chỉ chuyển phía Mua hoặc biến vế phải kiểu series thành null như adapter cũ.

---

## 6. Backtest — hợp đồng mô phỏng và kết quả

### 6.1. Profile cơ bản và phần chưa xác minh

| Thuộc tính | Quy tắc của phạm vi mới |
|---|---|
| Vị thế | Một mã, một vị thế; chỉ mua rồi bán toàn bộ. |
| Khớp lệnh | Có hai mode đúng nhãn: đóng cửa cùng phiên; mở cửa phiên kế tiếp. |
| Stop/target/trailing/max holding | Không áp dụng trong profile kiểm thử chỉ báo cơ bản. Gửi tường minh để không kế thừa default cũ. |
| Ngân sách cơ bản | Mô hình mẫu dùng tối đa tiền khả dụng gồm phí. Không lấy 12% NAV của Bot áp vào Backtest. Ánh xạ vào sizing nền được xác minh của profile thật. |
| Phí và lô | Lấy service/profile mô phỏng của dự án, công bố và lưu cùng kết quả. Không coi phí mẫu/lô mẫu là quy định môi giới. |
| Thanh toán/đủ điều kiện bán | Mẫu không có khóa; code cũ được mô tả có khóa hai bar. Đây là khác biệt chưa được chủ sản phẩm chốt chi tiết cho profile mới: phải xác minh/hỏi đúng điểm thiếu, không tự bỏ hoặc thêm khóa. |
| Thanh khoản/trượt giá | Mẫu không mô phỏng; không tuyên bố đã tính nếu chưa có engine và hợp đồng. Không tự thêm ô chỉnh trong đợt này. |
| Cuối kỳ | Định giá vị thế còn mở; không ép bán để làm đầy lịch sử. |

**Backtest này và Bot hiện tại đều không có stop/target/max holding ngầm, nhưng vẫn là hai profile thực thi riêng.** Không copy max holding 60 phiên từ mini, ngân sách 12% của Bot hoặc thanh toán thủ công vào profile Backtest. Khi backend cũ có risk default, request mới phải tắt tường minh, không chỉ bỏ controls trên UI.

### 6.2. Đóng cửa cùng phiên

Dùng dữ liệu đã hoàn tất tới đóng cửa T để tính tín hiệu; giao dịch mô phỏng tại close T. Nếu trống đầu bước thì xét Mua; nếu đang giữ thì xét Bán. Không vừa mua vừa bán vị thế mới trong cùng bước, không bán rồi mua lại trong cùng phiên ở mode này.

Đây là quy ước mô phỏng, không chứng minh có thể biết đầy đủ close/volume rồi đặt lệnh thật và được khớp chính close đó. Ghi đúng mô hình trong metadata và phần giả định; không bỏ cảnh báo ý nghĩa này khỏi tài liệu kết quả.

### 6.3. Mở cửa phiên kế tiếp

Tín hiệu sau đóng cửa T tạo lệnh chờ; giá khớp là open của phiên kế tiếp hợp lệ. Không lấy open T để khớp một tín hiệu cần close T. Giá mở cửa khác giá tín hiệu thì ngân sách/khối lượng phải được kiểm tra tại giá khớp.

Ở một phiên: xử lý lệnh chờ đã biết trước ở mở cửa; cuối phiên mới tính tín hiệu tiếp theo theo trạng thái vị thế thực. Bán tại mở cửa rồi có tín hiệu Mua cuối phiên chỉ được tạo lệnh cho phiên sau, không khớp vòng lại cùng giá mở cửa đã qua.

Tín hiệu tại phiên cuối kỳ mà chưa có phiên khớp trong khoảng được giữ là chưa khớp, không kéo dữ liệu ngoài khoảng để giả hoàn tất. Thiếu open/phiên trong nguồn không được tùy ý dùng close hoặc trượt sang một ngày khác mà không hợp đồng; trả trạng thái thiếu dữ liệu/không thể mô phỏng đúng.

### 6.4. Trạng thái và dữ liệu

| Tình huống | Xử lý |
|---|---|
| Mua rỗng | Không mở mua; không fallback chiến lược V1. |
| Bán rỗng | Không tạo bán theo tín hiệu; profile không có stop nên có thể giữ tới cuối kỳ. |
| Mua/Bán cùng đúng, chưa có vị thế | Chỉ xét mở mua theo mode, không bán khống hoặc đóng ngay vị thế vừa tạo. |
| Mua/Bán cùng đúng, đã có vị thế | Xét bán vị thế; không mua thêm. |
| Thiếu một điều kiện đang dùng | Không coi phía đó là đạt; không tự bỏ condition. |
| Chưa đủ lịch sử khởi tạo | Không tạo giá trị bằng 0 để tạo tín hiệu; trả độ đầy đủ. |
| Không đủ một lô sau phí | Không mua; không làm tròn lên, không tiền âm. |
| Mã/benchmark thiếu dữ liệu | Không bịa; benchmark thiếu không làm mất kết quả chiến lược đủ dữ liệu. |

Giá, đơn vị, loại điều chỉnh, số lượng và sự kiện doanh nghiệp phải thống nhất. Không vừa dùng giá đã điều chỉnh vừa cộng lại quyền lợi làm tính hai lần. Không trộn close nghìn đồng với vốn đơn vị đồng. Không lấy quote hiện tại trên UI làm giá khớp lịch sử.

### 6.5. Sổ vốn và phí

Mô hình cơ bản không nạp/rút vốn trong khoảng kiểm thử:

```text
cash_after_buy  = cash_before_buy − qty × entry_price − buy_fee
sell_net        = qty × exit_price − sell_fee − sell_tax
cash_after_sell = cash_before_sell + sell_net
entry_total     = qty × entry_price + buy_fee
trade_pnl_net   = sell_net − entry_total
NAV_t           = cash_t + qty_open_t × close_t
```

Không trừ thuế hai lần nếu service trả phí/thuế bán đã gộp. Khối lượng theo lô/service, phí có thể không tuyến tính; không chỉ chia theo tỷ lệ giả nếu biểu phí thật có cách tính khác. Tiền/giá dùng precision phù hợp, không so ngân sách bằng float sai rồi vượt vốn.

Vị thế chưa đóng không trừ trước một lệnh bán chưa xảy ra rồi gọi là P/L đã thực hiện. Có thể hiển thị lãi/lỗ tạm tính riêng, rõ cách tính phí.

### 6.6. Sáu KPI

| Nhãn | Định nghĩa |
|---|---|
| Tổng lợi nhuận | `NAV_end / capital_initial − 1`, gồm tiền mặt và vị thế cuối kỳ. |
| Lợi nhuận năm hóa | CAGR theo quy ước thời gian được ghi trong profile. Mẫu dùng `(NAV_end / capital_initial)^(252/n_sessions) − 1`; 252 là tham số mô phỏng, không lịch thật. Không đổi âm thầm công thức giữa các lần chạy. |
| Sụt giảm lớn nhất | Mức thấp nhất của `NAV_t / peak_NAV_to_t − 1`; đỉnh bắt đầu từ vốn ban đầu trước phí. |
| Số giao dịch | Số vòng mua–bán đã đóng. |
| Tỷ lệ thắng | Số giao dịch lãi thuần > 0 / số giao dịch đã đóng. Không có giao dịch đóng thì null/“—”. Hòa vốn không tính thắng. |
| Lợi nhuận mua và giữ | Return từ giá đầu kỳ tới giá cuối kỳ của cùng khoảng kiểm thử; không lấy giá cao nhất. Cơ sở phí/cổ tức/điều chỉnh phải được công bố. |

Giao diện hiển thị %, API phải xác định rõ ratio hay percentage points. Không nhân 100 hai lần. Không biến dữ liệu không xác định thành 0 chỉ để có một KPI. Kỳ không có phiên hợp lệ phải trả lỗi hoặc empty-state có nghĩa, không có số tăng trưởng giả.

Mua và giữ trong HTML là tỷ số giá, chưa trừ phí hoặc mô phỏng lô/vốn dư; VN-Index cũng là tỷ số chỉ số. Đây là cách minh họa nguồn, không được gọi là tổng lợi nhuận gồm cổ tức. Profile thật phải ghi rõ cơ sở so sánh và dùng thống nhất ở chart/KPI.

### 6.7. Chart “Lợi nhuận danh mục (%)”

- Nhãn cố định: **LỢI NHUẬN DANH MỤC (%)**, không gọi “Đường vốn” trên UI.
- Ba series theo thứ tự: Danh mục chiến lược; Mua và giữ {mã}; VN-Index nếu đủ dữ liệu.
- Trục dọc là % theo thang tuyến tính đúng; âm/dương đều hiển thị khi cần. Trục ngang ngày, tooltip cùng phiên.
- Công thức chiến lược: `(NAV_t / vốn ban đầu − 1) × 100%`. Không cộng % từng lệnh.
- Mốc 0% là vốn trước chi phí đầu tiên. Không rebase theo giá trị sau phí rồi làm mất phí phiên đầu.
- Điểm cuối khớp KPI tương ứng. Khoảng mua và giữ kết thúc ở phiên hợp lệ cuối của khoảng chọn, không tự lấy hôm nay.
- Nếu giảm số điểm hiển thị, giữ điểm đầu/cuối và những cực trị quan trọng; KPI phải tính trên dữ liệu đầy đủ, không trên chuỗi đã giảm mẫu.
- Thiếu benchmark: không vẽ chuỗi 0% hoặc một ngày gốc không phù hợp; thể hiện chưa đủ dữ liệu cho benchmark đó.
- Không sao chép path SVG/giá mẫu làm chart production. Màu, legend, tooltip và kiểu nét bám HTML.

### 6.8. Toàn bộ lịch sử giao dịch

Giữ cột: số thứ tự; ngày Mua; điều kiện Mua; giá Mua; số cổ phiếu; ngày Bán; điều kiện Bán; giá Bán; số phiên giữ; lãi/lỗ; chi tiết.

Không chỉ trả/hiện 3 hoặc 12 dòng cố định. Được phân trang hoặc ảo hóa để hiệu năng nhưng tổng số, từng dòng và chức năng xem toàn bộ không được mất. “Toàn bộ” phải là toàn bộ lần chạy, không chỉ trang API đầu tiên.

Chi tiết giữ ngày tín hiệu khác ngày khớp, giá, phí, số lượng, tiền thuần, các giá trị và dấu của điều kiện tại thời điểm đó. Vị thế mở và lệnh cuối kỳ chưa khớp thể hiện riêng; không thêm chúng vào tỷ lệ thắng hay số vòng đã đóng.

---

## 7. Tab Bộ lọc — cấu trúc và kỳ tính riêng

### 7.1. Phạm vi và bố cục

Chỉ sàng lọc doanh nghiệp, không tạo tab Phân tích/So sánh/Luận điểm. Bấm số liệu mở chi tiết nguồn/kỳ ngay trong modal, không biến thành sản phẩm phân tích doanh nghiệp mới.

| Vùng | Nội dung theo HTML v2 |
|---|---|
| Thư viện trái | Chỉ tiêu cơ bản đã mở; tìm kiếm; nút thêm. |
| Phạm vi đầu trang | Thị trường; ngành. **Không còn ô Kỳ dữ liệu áp chung.** |
| Mỗi điều kiện | Tên chỉ tiêu; **Kỳ tính**; **Dấu**; **Ngưỡng** và đơn vị; bỏ điều kiện. |
| Kết quả | Mã, doanh nghiệp, ngành, số liệu các chỉ tiêu và kỳ thực tế dưới số liệu; chọn mã; chi tiết. |
| Lưu | Lưu bộ lọc; Bộ lọc đã lưu; Lưu danh mục; Danh mục đã lưu. |
| Chất lượng dữ liệu | Số doanh nghiệp thiếu dữ liệu/không áp dụng ở các điều kiện đang chọn và chi tiết lý do. |

Tên trong Bộ lọc khớp Học viện. Không badge tròn “DT YoY”. Bộ lọc không chia Mua/Bán. Màu nhấn cột đang dùng chỉ để nhận diện, không là xếp hạng doanh nghiệp tốt/xấu.

### 7.2. Một chỉ tiêu — một kỳ trong bộ điều kiện cơ bản

Dạng logic của điều kiện:

```json
{
  "factor_id": "profit",
  "period": "quarter",
  "op": ">",
  "threshold": 15,
  "threshold_unit": "percentage_points"
}
```

ID là ví dụ cần map catalog thật; `15 percentage_points` trong ví dụ nghĩa là ngưỡng hiển thị 15%. Nếu API thật dùng tỷ lệ 0,15, adapter phải chuyển đúng một lần và khai báo đơn vị.

Trong mẫu mỗi chỉ tiêu được thêm một lần, không tự nhân bản cùng chỉ tiêu với nhiều kỳ hoặc thêm toán tử khoảng/OR chưa được yêu cầu. Bộ lọc hợp lưu AND. Không có điều kiện thì có thể xem toàn bộ doanh nghiệp trong phạm vi được phép và ghi rõ chưa áp tiêu chí; không tạo tín hiệu mua từ tập rỗng.

### 7.3. Kỳ mặc định và kỳ được chọn

| ID mẫu | Tên chỉ tiêu | Mặc định | Các lựa chọn cho phép |
|---|---|---|---|
| rev | Tăng trưởng doanh thu YoY | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| profit | Tăng trưởng LNST YoY | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| eps | Tăng trưởng EPS YoY | Quý gần nhất | Quý gần nhất; Bốn quý gần nhất; Năm tài chính gần nhất |
| gm | Biên lợi nhuận gộp | Bốn quý gần nhất | Bốn quý gần nhất; Quý gần nhất; Năm tài chính gần nhất |
| nm | Biên lợi nhuận ròng | Bốn quý gần nhất | Bốn quý gần nhất; Quý gần nhất; Năm tài chính gần nhất |
| roe | ROE | Bốn quý gần nhất | Bốn quý gần nhất; Năm tài chính gần nhất |

Không cho chọn ROE quý trong phạm vi hiện tại. Đổi kỳ ở LNST không đổi kỳ của ROE hoặc các điều kiện khác. Đổi kỳ phải tính/lấy lại đúng số liệu và kết quả lọc, không chỉ sửa nhãn.

Các chỉ tiêu mở về sau lấy period policy từ registry: số dư tài chính theo ngày cuối kỳ, chỉ tiêu 3Y giữ đúng cửa sổ 3 năm… Không tự gắn ba lựa chọn trên cho mọi chỉ tiêu hoặc mở thêm 42 chỉ tiêu chưa có định nghĩa chỉ vì có tên trong roadmap.

### 7.4. Ý nghĩa các kỳ

| Lựa chọn | Nghĩa |
|---|---|
| Quý gần nhất | Quý riêng mới nhất đã công bố và tiếp nhận hợp lệ cho doanh nghiệp đó; không phải số lũy kế 6/9 tháng. |
| Bốn quý gần nhất | Bốn quý liên tiếp kết thúc tại quý báo cáo mới nhất đủ điều kiện thời điểm; không phải bốn báo cáo bất kỳ hoặc một quý nhân bốn. |
| Năm tài chính gần nhất | Năm tài chính đầy đủ mới nhất đã có báo cáo hợp lệ; không mặc định trùng năm dương. |
| YoY theo quý | So quý đang xét với đúng cùng quý năm trước. |
| YoY theo bốn quý | So tổng/basis bốn quý hiện tại với bốn quý tương ứng lùi một năm; không so với tổng TTM lùi một quý. |
| YoY theo năm | So năm tài chính đầy đủ đang xét với năm tài chính đầy đủ trước đó. |

Quý liền trước không phải YoY. Không thêm lựa chọn QoQ dưới một tên bài/chỉ tiêu YoY.

### 7.5. “Mới nhất đã công bố” và kỳ thực tế

Một lần lọc dùng một mốc `as_of` xác định cho toàn bộ kết quả. Giải quyết “mới nhất” riêng theo mỗi doanh nghiệp nhưng không để mốc thời gian thay đổi giữa các trang của cùng một kết quả đang xem/lưu.

Phân biệt:
- Ngày bắt đầu/kết thúc kỳ kế toán.
- Ngày báo cáo được công bố.
- Thời điểm hệ thống tiếp nhận dữ liệu hợp lệ.
- Thời điểm lọc/cutoff và phiên bản dữ liệu.

Nguồn số liệu phải đã có trước hoặc tại cutoff theo chính sách hệ thống. Không dùng báo cáo chưa công bố chỉ vì kỳ đã kết thúc. Không giả ngày công bố từ ngày import hoặc ngược lại; thiếu provenance thì ghi đúng trạng thái và không khẳng định khả năng tái lập lịch sử mà không có.

Các doanh nghiệp có thể khác kỳ mới nhất. Ví dụ giả lập một mã Q2, một mã Q3: hiển thị đúng kỳ dưới từng số, không đặt nhãn Q3 chung cho cả bảng. Với cùng nhóm chỉ tiêu/basis, các đầu vào phải cùng một phạm vi báo cáo phù hợp; không lấy lợi nhuận từ bản hợp nhất rồi vốn chủ từ bản riêng một cách ngầm định.

Đổi sang năm mới trên lịch không tự đổi `year` khi chưa có báo cáo năm. Không quay lui sang một TTM cũ hơn chỉ để tránh quý bị thiếu sau khi đã xác định anchor mới nhất.

### 7.6. Dữ liệu thiếu, không áp dụng và lỗi cơ sở tính

| Trạng thái | Hiển thị | Tác động nếu là điều kiện bắt buộc |
|---|---|---|
| Có giá trị hợp lệ | Số và kỳ thực tế | So dấu/ngưỡng theo giá trị chưa làm tròn. |
| Thiếu báo cáo/thành phần | — / Chưa đủ dữ liệu | Không được coi là đạt. |
| Chỉ tiêu không áp dụng cho loại doanh nghiệp | — / Không áp dụng | Không được coi là đạt; có lý do riêng. |
| Mẫu số/kỳ gốc không hợp lệ theo định nghĩa chỉ tiêu | — / Không tính được | Không được coi là đạt. |
| Kỳ tính không được hỗ trợ | Lỗi điều kiện | Chặn request, không fallback kỳ khác. |

Một số liệu thiếu ở cột tham khảo **không được tự loại doanh nghiệp** nếu cột đó không phải điều kiện đang dùng. Ngược lại, điều kiện bắt buộc thiếu thì không AND phần còn lại để cho qua.

Không thay null bằng 0, không lấy trị tuyệt đối kỳ gốc âm để tạo tăng trưởng dương, không gán vô cực vào bộ lọc. Giá trị âm có thể hợp lệ ở một số chỉ tiêu: ví dụ LNST hiện tại âm khi kỳ gốc dương tạo tăng trưởng âm. Kiểm tra theo từng định nghĩa, không cấm mọi số âm chung.

Nguồn lỗi khác với không có doanh nghiệp thỏa tiêu chí. Thống kê ngoại lệ đếm đúng doanh nghiệp và cung cấp danh sách chỉ tiêu có vấn đề, không chỉ báo “0 kết quả” cho cả hai trường hợp.

### 7.7. Tính chỉ tiêu và giới hạn của dữ liệu mẫu

Các nguyên tắc đã được dùng để xây mẫu và phải giữ nhất quán khi ánh xạ vào dữ liệu thật:

| Chỉ tiêu | Cơ sở trong mẫu và điều cần xác minh |
|---|---|
| Tăng trưởng doanh thu YoY | `(doanh thu kỳ này / doanh thu cùng kỳ − 1) × 100%`; mẫu yêu cầu kỳ gốc dương. Kỳ riêng/TTM/năm phải đúng nhóm dữ liệu. |
| Tăng trưởng LNST YoY | Mẫu dùng LNST thuộc cổ đông công ty mẹ; không đánh tráo sang tổng LNST hợp nhất mà không đổi định nghĩa/version. |
| Tăng trưởng EPS YoY | So hai EPS cùng basis. Mẫu giữ số cổ phiếu không đổi; đây không phải cách xử lý mọi doanh nghiệp thật. Phải dùng EPS/cổ phiếu bình quân và điều chỉnh theo contract nguồn. |
| Biên lợi nhuận gộp | Lợi nhuận gộp / doanh thu cùng kỳ. TTM cộng số gốc, không cộng/trung bình đơn giản bốn biên. |
| Biên lợi nhuận ròng | Mẫu dùng LNST hợp nhất / doanh thu hợp nhất; khác tử số tăng trưởng LNST công ty mẹ. Phải phân biệt hai định nghĩa. |
| ROE | Mẫu dùng LNST thuộc cổ đông công ty mẹ / vốn chủ cùng phạm vi bình quân. TTM lấy lợi nhuận 4 quý, vốn đầu/cuối tương ứng; mẫu bình quân hai đầu. Công thức thực phải thống nhất registry, nguồn và bài học, có version. |

Đây không phải đặc tả thay toàn bộ công thức tài chính/chỉ báo của dự án. Nếu nguồn thật có biến thể khác với Học viện hoặc không đủ thành phần, AI dev phải chỉ ra khác biệt và không âm thầm sửa/ước tính. Chủ sản phẩm đã yêu cầu tên bài/tên chỉ tiêu chỉ dùng “LNST”, không giảng thêm phân biệt phạm vi lợi nhuận ở bài học. Việc rút gọn nhãn không đổi nguồn/tử số kỹ thuật; metadata chi tiết vẫn lưu đúng basis để đối soát. Không lấy tính đơn giản của fixture thành quy tắc sản phẩm.

Lũy kế 6/9 tháng không cộng như quý riêng. Có thể tách quý từ lũy kế khi nguồn và phạm vi cho phép, nhưng phải kiểm tra cùng năm tài chính, cùng loại báo cáo và phiên bản phù hợp. Không trộn các bản điều chỉnh khác nhau để tạo quý giả. Năm = bốn quý cũng không được mặc định nếu doanh nghiệp có kỳ chuyển tiếp hoặc năm tài chính khác.

Số dư nợ/tài sản/vốn chủ không được cộng bốn lần như doanh thu. ROE không dùng vốn cuối kỳ thay bình quân khi thiếu vốn đầu. EPS không tự cộng bốn EPS quý hoặc nhân quý mới nhất lên bốn mà không hợp đồng.

Ví dụ tính để QA, không phải số doanh nghiệp thật: bốn quý có doanh thu `[100, 200, 300, 400]`, lợi nhuận gộp `[10, 40, 90, 160]` thì biên gộp TTM = `300/1000 = 30%`, không phải trung bình `[10%,20%,30%,40%] = 25%`.

### 7.8. Bảng và chi tiết số liệu

Kỳ mặc định của cột chưa dùng làm điều kiện lấy từ catalog. Nếu cột đang được dùng làm điều kiện, kỳ ở header, giá trị và phần chi tiết phải đúng kỳ đã chọn. Không lọc bằng Q3 nhưng hiển thị giá trị TTM ở cùng cột.

Bấm số liệu mở: chỉ tiêu, giá trị/đơn vị, kỳ thực tế, khoảng đang tính, kỳ so sánh nếu YoY, ngày công bố và tiếp nhận, cutoff, loại/phạm vi báo cáo, thành phần tính và danh sách kỳ/nguồn đã sử dụng. Không ghi “đã kiểm toán” nếu nguồn không cung cấp.

So sánh lọc/xếp thứ tự dùng precision gốc; làm tròn chỉ để hiển thị. Giá trị 8,164965… vẫn thỏa `> 8,16` dù UI hiện 8,16. Tên/ngành/note phải escape HTML, dấu `<` không làm mất câu hoặc tạo markup ngoài ý muốn.

Hiển thị thị trường/ngành từ catalog thật, không chỉ bốn ngành và chín mã fixture. Bộ lọc theo ngành không tự làm thay đổi công thức chỉ tiêu mà không định nghĩa; phân biệt không áp dụng với thiếu dữ liệu.

---

## 8. Lưu bộ lọc, danh mục và kết quả

### 8.1. Ba đối tượng lưu khác nhau

| Đối tượng | Dữ liệu lưu | Khi mở lại |
|---|---|---|
| Phiên bản Backtest | Snapshot cấu hình + giả định + nguồn dữ liệu/phiên bản + toàn bộ kết quả/bằng chứng hoặc tham chiếu bất biến tương đương | Xem đúng lần chạy cũ, không cập nhật cấu hình chung hoặc tính lại ngầm bằng dữ liệu mới. |
| Bộ lọc | Tiêu chí, dấu, ngưỡng/đơn vị, **kỳ tính từng điều kiện**, thị trường/ngành; kiểu mới nhất đã công bố | Chạy lại sẽ resolve “gần nhất” tại cutoff mới; không khóa thành Q3/2025 chỉ vì lưu ở thời điểm đó. |
| Danh mục nghiên cứu | Tập mã được chọn, snapshot tiêu chí/cột/kỳ, giá trị và trạng thái số liệu, kỳ thực tế, cutoff, phiên bản dữ liệu | Giữ bằng chứng lúc lưu, không cập nhật bằng bảng/form đang chỉnh. |

`created_at` là lúc lưu thật, `as_of` là mốc dữ liệu; chúng không phải một trường. Số liệu không cần sao chép trùng nếu có tham chiếu bất biến bảo đảm truy xuất đúng về sau, nhưng không chỉ trỏ vào dữ liệu “latest” có thể đổi.

### 8.2. Chọn mã và phạm vi lưu

Có checkbox từng mã và chọn tất cả. Có mã được chọn thì lưu các mã đang được chọn hợp lệ; chưa chọn riêng thì lưu toàn bộ kết quả như mẫu và hiển thị rõ số lượng trước xác nhận.

Nếu kết quả có phân trang, “toàn bộ” không được chỉ là trang hiện tại. Dùng ID kết quả/cutoff và lựa chọn có thể tái lập ở backend. Khi thay điều kiện, bỏ các lựa chọn không còn trong tập hợp lệ hoặc yêu cầu xác nhận rõ; không lưu mã ẩn ngoài kết quả mà user không biết.

Lưu danh mục không mua cổ phiếu, không tạo tài khoản/tiền và không viết vào bảng vị thế. Xóa bộ lọc không xóa danh mục snapshot đã lưu từ nó. Xóa danh mục không xóa lịch sử cảnh báo đã lưu đúng bằng chứng.

### 8.3. Tính bền vững và quyền

Tất cả lưu/load/delete theo tài khoản. Lỗi lưu phải giữ draft và báo lỗi; không toast “đã lưu” khi server thất bại. Request retry có idempotency; ghi đè nếu có phải có version và xác nhận, không dùng trùng tên để xóa mục cũ.

Mẫu chỉ lưu trong trình duyệt và tối đa 20 mục/mỗi loại; đây không phải hạn mức production. Không nhập localStorage của mẫu vào dữ liệu thật để cấp quyền hoặc tạo cảnh báo/chiến lược.

---

### 8.4. Áp dụng danh mục từ Bộ lọc cho Bot

**Bộ lọc chọn mã; điều kiện kỹ thuật chọn thời điểm.** Đây là điểm nối tới nghiệp vụ nguồn mua mới đã được giao trong bộ Bot, không tạo một Bot thứ hai hoặc service nguồn độc lập.

Luồng trực tiếp: Bộ lọc có kết quả hợp lệ → chọn mã → **Áp dụng cho Bot** → xác nhận tên, số mã và tập mã → backend nhận yêu cầu → chờ phiên hiệu lực. Có thể đi từ một danh mục đã lưu thay vì kết quả hiện tại.

**Không bắt buộc bấm Lưu danh mục trước:** nguồn là một kết quả lọc bất biến hoặc một danh mục đã lưu hợp lệ. Server phải tạo/giữ tham chiếu snapshot để truy lại nguồn; không chỉ nhận danh sách mã do client tự khai. Việc lưu nội bộ snapshot để áp dụng không đồng nghĩa tự thêm một mục vào “Danh mục đã lưu” nếu người dùng chưa chọn thao tác đó.

| Thao tác | Hệ quả |
|---|---|
| Lọc, sắp xếp, xem chi tiết số liệu | Không đổi nguồn mua Bot |
| Lưu bộ lọc | Lưu tiêu chí để dùng lại, không đổi Bot |
| Lưu danh mục | Lưu tập mã/số liệu/kỳ/cutoff, không đổi Bot |
| Áp dụng cho Bot | Tạo bản nguồn mua mới chờ hiệu lực |
| Ngừng dùng danh mục riêng / Về VN30 | Tạo yêu cầu về VN30 chờ hiệu lực; không xóa danh mục hoặc bán cổ phiếu |

**Phạm vi lựa chọn:** có chọn riêng thì áp dụng đúng tập được chọn; chưa chọn riêng thì form xác nhận toàn bộ kết quả. “Toàn bộ” bao gồm mọi trang của cùng result ID/cutoff, không phải chỉ trang đang hiển thị. Form cho bỏ bớt mã trước xác nhận. Bỏ hết thì vô hiệu nút xác nhận. Không có kết quả hoặc dữ liệu không hợp lệ thì không áp dụng.

Tên có ý nghĩa để nhận diện nguồn; không dùng tên làm khóa hay ghi đè một danh mục trùng tên. Server xác minh chủ sở hữu result/list, quyền chỉ tiêu đã dùng, phiên bản nguồn và các mã giao dịch được hỗ trợ. Nếu một mã không hợp lệ thì trả đúng danh sách lỗi và yêu cầu xác nhận lại; không âm thầm loại rồi áp một số mã khác.

Danh mục riêng **thay thế** VN30: không cộng VN30 và không lấy giao với VN30. Danh mục được phép có mã ngoài VN30 khi mã thuộc phạm vi giao dịch hỗ trợ. Không tự thêm các ngưỡng hoặc xếp hạng Săn mã vào danh mục này. Thứ tự sắp xếp bảng Bộ lọc không là chỉ thị thứ tự Bot mua.

### 8.5. Danh mục cố định; trạng thái saved, pending và effective

Ảnh chụp danh mục gồm tập mã thực sự đã xác nhận. Bộ lọc mở lại có báo cáo mới, người dùng đổi kỳ hoặc giá trị chỉ tiêu đổi **không tự thay nguồn Bot**. Muốn thay tập mã phải lọc/chọn và áp dụng lại. Một Bot có một nguồn hiệu lực, dù người dùng lưu nhiều danh mục.

| Trường logic | Ý nghĩa |
|---|---|
| `source_kind` | `vn30`, `filter_result` hoặc `saved_list`, ánh xạ vào schema thật |
| `source_id/source_version` | Tham chiếu bất biến tới kết quả/danh mục; không là ID client tùy ý |
| `selected_symbols` | Tập mã đã khử trùng và xác nhận |
| `source_name` | Tên người dùng nhận diện |
| `criteria_snapshot`, `data_as_of`, `data_version` | Dấu vết tiêu chí và dữ liệu, hoặc tham chiếu bất biến tương đương |
| `requested_at`, `source_revision` | Server ghi thời điểm nhận và phiên bản yêu cầu |
| `effective_session`, `effective_revision` | Phiên và bản đã thật sự có hiệu lực |
| `entry_source_snapshot` | Nguồn tại lúc mở vị thế, chỉ để lịch sử; không thay nguồn xét Mua hiện tại |

Theo hợp đồng Bot: lưu vào ngày D có hiệu lực ở phiên giao dịch hợp lệ đầu tiên **có ngày lớn hơn D**, theo `Asia/Ho_Chi_Minh` và lịch đã xác minh; áp dụng cả trường hợp bấm trước giờ mở cửa ngày D. Không dùng +24h hoặc lịch loại cuối tuần của HTML làm production.

Bot chụp nguồn mua và cấu hình cùng lúc cho một lượt xử lý; mỗi nguồn có revision riêng, không thay giữa các mã trong một phiên. Retry dùng cùng snapshot. Những yêu cầu trước khi phiên hiệu lực đến được xử lý theo revision để không chạy đồng thời hai nguồn.

**UI:** phía trên phạm vi Thị trường/Ngành có khối “DANH MỤC MUA MỚI CỦA BOT”, tên/số mã đang hiệu lực, Xem danh sách, Xem Bot và Về VN30 khi dùng nguồn riêng. Nếu có yêu cầu mới thì dòng dưới ghi tên/số mã, phiên chờ hiệu lực và Hủy thay đổi. Không ghi nguồn pending thành đang dùng.

“Xem Bot” mở công cụ Bot thật trong workspace đã có khi tích hợp. Trong HTML nó chỉ mở modal đọc trạng thái để duyệt luồng; không thay routing production bằng modal mô phỏng. Bộ Chiến lược không tạo thêm một trang tài khoản Bot.

Danh mục đã lưu được đánh dấu đang dùng/chờ theo **ID và phiên bản**, không theo tên. Nếu người dùng áp một phần tập mã thì chi tiết nguồn phải hiển thị đúng phần đã áp, không nhầm toàn bộ danh mục gốc.

### 8.6. Về VN30 và các vị thế đang giữ

| Trạng thái | Mua mới | Bán |
|---|---|---|
| Không có danh mục riêng | VN30 có hiệu lực tại phiên xét | Toàn bộ vị thế Bot đang giữ |
| Danh mục A có hiệu lực | Chỉ mã trong A | Toàn bộ vị thế, kể cả mã ngoài A |
| Đang chờ đổi A → B | Vẫn A trước phiên hiệu lực | Không đổi phạm vi Bán |
| B có hiệu lực | Chỉ B | Tiếp tục xét mọi vị thế |
| Về VN30 có hiệu lực | Chỉ VN30 | Mã từ danh mục cũ vẫn xét Bán |

Ví dụ Bot giữ CMG từ danh mục riêng; người dùng về VN30 và CMG không thuộc nguồn VN30 tại phiên đó. Không mua thêm hoặc mua lại CMG, nhưng vẫn xét điều kiện Bán hiện hành. Không ép bán CMG vì đổi danh mục, không chờ mã quay lại VN30 mới cho bán, không tự bán khi chỉ tiêu cơ bản không còn đạt.

Cấu hình Bán dùng bản **đang hiệu lực**, không khóa mã cũ vào tham số tại lúc mua. Nguồn lúc mua là bằng chứng lịch sử. Không đặt lại giá vốn, số lượng, tiền, phí hoặc quyền lợi khi thay nguồn.

Nếu chưa có điều kiện Bán hiệu lực thì vị thế tiếp tục giữ. Không đưa cắt lỗ cũ hoặc max holding 60 phiên của mini vào Bot.

### 8.7. Lỗi, hủy và xóa danh mục đang dùng

| Tình huống | Kết quả bắt buộc |
|---|---|
| Chọn rỗng/không có mã thỏa | Không áp dụng, không tự về VN30 |
| Lỗi gửi/lưu hoặc revision xung đột | Giữ bản nháp; không thông báo đã áp dụng hoặc đổi nguồn hiệu lực |
| Nhấn Hủy trong xác nhận áp dụng/Về VN30 | Không tạo yêu cầu |
| Hủy thay đổi pending | Chỉ hủy bản chưa hiệu lực; nguồn hiện tại không đổi; kiểm tra tranh chấp với job |
| Nguồn mua thật tải lỗi | Không fallback sang VN30/Săn mã/tất cả mã; không mua mới trên nguồn không xác minh; Bot vẫn xét Bán vị thế đủ dữ liệu |
| Một mã thiếu dữ liệu Mua | Bỏ qua có lý do; không bỏ một điều kiện để mua |
| Xóa danh mục đang được áp hoặc đang chờ | Yêu cầu chuyển nguồn/hủy pending phù hợp trước; không xóa nguồn đang tham chiếu hoặc âm thầm về VN30 |
| Sửa/xóa bộ lọc nguồn | Snapshot Bot/cảnh báo/danh mục đã lưu không đổi |
| Mã rời VN30 theo kỳ thành phần | Không mua mới từ lúc nguồn đổi; vị thế cũ vẫn xét Bán; không viết lại lịch sử |

Trong HTML, xóa một danh mục đang dùng bị chặn cho tới khi nguồn khác đã có hiệu lực. Production có thể dùng transaction xác nhận chuyển nguồn trước khi xóa theo service thật, nhưng phải bảo đảm snapshot và lịch sử không mất và không ngầm bán/đổi nguồn.

---

## 9. Liên kết với hai bộ mới và các phần không thay

| Nguồn → đích | Hành vi đúng | Không được làm |
|---|---|---|
| Học viện → thư viện kỹ thuật | Cùng grant của 16 chỉ báo, tên/công thức/ID đúng | Cấp lại quyền riêng hoặc tự ON khi học xong |
| Học viện → Bộ lọc | 42 binding bài cơ bản; chỉ công cụ đã sẵn sàng và có quyền mới dùng | Bịa 36 công thức hoặc cấp đủ 42 vì có tên |
| Bot ↔ Backtest | Một cấu hình kỹ thuật đã lưu dùng chung, có revision | Tạo hai cấu hình vận hành độc lập |
| Mini → cấu hình chung | Không ghi từ luyện tập | Tự dùng tham số/lãi lỗ mini để thay Bot |
| Backtest → Cảnh báo | Snapshot đúng kết quả người dùng chọn; Mua/Bán đầy đủ | Dùng form hiện tại thay cấu hình của kết quả cũ |
| Bộ lọc → Danh mục | Giữ tập mã/tiêu chí/kỳ/số liệu/cutoff | Ghi vị thế hoặc đặt lệnh |
| Kết quả/danh mục → Bot | Người dùng xác nhận Áp dụng, chỉ đổi nguồn mua mới | Tự cập nhật động, tái cân bằng hoặc bán mã ngoài nguồn |
| Danh mục → Backtest | Chọn một mã; dùng giá lịch sử của mã đó | Báo backtest cả danh mục dùng chung vốn |
| Danh mục → Cảnh báo | Người dùng chọn; ghim tập mã của cảnh báo | Phạm vi cảnh báo tự đi theo nguồn mua Bot |
| Săn mã → Theo dõi | Tiếp tục công cụ độc lập ở Demo Trading | Lấy watchlist làm nguồn Bot khi chưa áp danh mục hợp lệ |

### 9.1. Ranh giới với Bot và nền giao dịch mới

Bỏ hành trình trứng/cấp 0–6 và giai đoạn Bot V1 khỏi mô hình đã chốt. Học viện và Bot nằm ở thanh công cụ bên phải của Demo Trading; trang Chiến lược vẫn là trang riêng hiện có, không chuyển thư viện của nó sang panel phải. Bộ này không tạo linh thú hoặc tài khoản mới.

Tài khoản tự giao dịch có 100 triệu ban đầu một lần, độc lập tiền Bot; các lệnh, vốn, vị thế, lịch sử và quyền lợi đang có không reset. Săn mã vẫn có năm bộ lọc và thao tác Theo dõi vào Danh mục theo dõi; không phụ thuộc học/nở/Bot và không là nguồn ứng viên Bot mới.

Bot vận hành: một tài khoản riêng 100 triệu cấp một lần; xét Bán mọi vị thế theo AND các điều kiện Bán hiệu lực; chỉ mua khi tập Mua không rỗng và đạt, trong VN30 hoặc danh mục đã áp. Không cổng năm lớp, 3/5 lớp, phủ quyết AI, stop L1, target %, trailing hoặc thời gian giữ ngầm. Các giới hạn vốn Bot giữ theo bộ Bot: 12% NAV tham chiếu gồm phí/lệnh, hai mua thành công/phiên, trần 30%/mã khi xét mua, không mua thêm hoặc mua lại cùng phiên. Bộ Chiến lược **không viết lại worker hoặc profile tài khoản Bot**.

Khi chỉ bật Mua mà chưa có Bán, Bot không có lối thoát cắt lỗ dự phòng. Đừng khôi phục luật cũ khi đọc từ tài liệu legacy. Các cột stop/target cũ vẫn có thể giữ để xem lịch sử, không phải trigger hoạt động.

### 9.2. Backtest đầy đủ khác mini luyện tập

| Thuộc tính | Backtest trong Chiến lược | Mini ở Bot |
|---|---|---|
| Mã/ngày | Hiện và được chọn | Giấu mã/ngày |
| Khoảng | Theo request/dữ liệu hỗ trợ | 24 tháng cố định cho bộ bài |
| Chỉ báo | Kết hợp các chỉ báo đã mở | Một chỉ báo/lượt |
| Chạy lại | Chủ động chỉnh và chạy lại | Không chạy lại cùng mã trong bộ 30 của chỉ báo |
| Điều kiện thoát | Bán kỹ thuật; không stop/target/time ngầm | Bán kỹ thuật hoặc max holding mặc định 60 phiên có thể chỉnh |
| Cấu hình | Chung với Bot sau Lưu | Bản riêng theo lượt |
| KPI | Sáu chỉ số | Hai: Tổng lợi nhuận/Số lần Mua |
| Số giao dịch | Vòng Mua–Bán đã đóng | Lần Mua đã khớp |

Các field cần phân biệt `buy_count`, `closed_trade_count`, `open_position_count`. Không dùng field `trade_count` mơ hồ để gộp mini và Backtest. Giới hạn giữ 60 phiên chỉ là quy tắc mini đã được duyệt, **không đưa vào form hoặc request profile Backtest này**.

### 9.3. Danh mục hiện tại không chứng minh bộ lọc lịch sử

Danh mục được lọc hôm nay dùng để chọn mã nghiên cứu hoặc nguồn mua mới tương lai của Bot; nó không chứng minh các mã đã thỏa tiêu chí tài chính tại thời điểm quá khứ. Backtest một mã mở từ danh mục không trở thành backtest lựa chọn doanh nghiệp theo lịch sử. Phạm vi này không xây engine tái lọc cơ bản point-in-time hoặc danh mục nhiều mã dùng chung vốn.

### 9.4. Điểm nối nội dung Chương 2 và Chương 4

Không biên soạn bài trong bộ này. Chuẩn bị đúng route/điểm nhấn để nội dung hướng dẫn sau ghép được:

| Chương 2 — Sử dụng Backtest | Chương 4 — Sử dụng Bộ lọc |
|---|---|
| Bắt đầu với Backtest | Bắt đầu với Bộ lọc |
| Thiết lập điều kiện Mua | Thiết lập điều kiện lọc |
| Thiết lập điều kiện Bán | Chọn kỳ tính cho từng chỉ tiêu |
| Chọn giả định và chạy kiểm thử | Đọc và kiểm tra kết quả |
| Đọc kết quả và lịch sử giao dịch | Điều chỉnh và lưu bộ lọc |
| Điều chỉnh, so sánh và lưu kết quả | Lưu và áp dụng danh mục cho Bot |

Đổi UI không tự đánh dấu các bài này đã hoàn thành. Cả hai chương hoàn thành bằng nút theo bộ Học viện, không có cổng 8/8 hoặc yêu cầu chạy công cụ trước khi ghi hoàn thành. Không thêm nội dung bài hoặc quiz giả vào HTML Chiến lược.

---

## 10. Hợp đồng dữ liệu/API tối thiểu

### 10.1. Ánh xạ vào repository, không bắt tên endpoint mới

Tái sử dụng service có sẵn, giữ backward compatibility. AI dev phải tự tìm route/component/table và nêu bằng chứng. Không tạo kho config thứ hai vì mẫu dùng một biến JavaScript. Các tên dưới là hợp đồng logic, không khẳng định chúng đã có trong IQX.

| Nguồn/đối tượng | Dữ liệu cần có |
|---|---|
| Catalog/grants | Tool/lesson/capability ID, tên, loại, quyền, supported params/operators/periods, version tính toán. |
| Shared config | Hai phía độc lập, master, saved/effective revision, actor, thời điểm nhận, effective session, version schema/rule/calculation. |
| Backtest request | Mã, khoảng, vốn, config revision/snapshot, profile khớp/phí/khối lượng/thanh toán có version. |
| Backtest result | Metadata đầu vào/dữ liệu, KPI, curve, giao dịch, vị thế mở/lệnh chờ, trạng thái chất lượng, bằng chứng điều kiện. |
| Alert definition | Owner, ID, tên, enabled, snapshot nguồn/phiên bản, tập mã, phía, thời điểm bắt đầu/kiểm tra, trạng thái dữ liệu. |
| Alert event | ID chống trùng, phiên/ngày tín hiệu, thời điểm đánh giá/phát, config/alert version, mã/phía, first-observation, bằng chứng. |
| Filter definition | Market/sector, logical period riêng mỗi condition, threshold có unit, op, ID/version chỉ tiêu. |
| Filter result | ID/cutoff, scope, định nghĩa đã dùng, tổng số/pagination, records, giá trị và provenance từng chỉ tiêu, ngoại lệ. |
| Saved list | ID, owner, mã, created_at, as_of, criteria/columns và snapshot metrics/provenance hoặc tham chiếu bất biến. |

### 10.2. Ví dụ filter definition

```json
{
  "schema_version": 1,
  "scope": {"market": "all", "sector": "all"},
  "data_mode": "latest_disclosed",
  "logic": "AND",
  "conditions": [
    {"factor_id": "profit", "period": "quarter", "op": ">", "threshold": 15, "threshold_unit": "percentage_points"},
    {"factor_id": "roe", "period": "ttm", "op": ">", "threshold": 15, "threshold_unit": "percentage_points"}
  ]
}
```

Đây chỉ là hình dạng ví dụ theo điều kiện mẫu; không tự seed bộ lọc này cho mọi tài khoản. Trường date/as_of không được client tùy ý gửi để vượt chính sách dữ liệu; giai đoạn đầu UI không có lịch lọc quá khứ.

### 10.3. Provenance cho một ô chỉ tiêu

Tối thiểu có: `factor_id`, `period_mode`, `status`, `value`, `unit`, `period_start`, `period_end`, `actual_period_label`, kỳ so sánh nếu có, `published_at`, `available_at`, `as_of`, `source_id`, report IDs/versions, `report_scope`, `calculation_version`, thành phần hoặc tham chiếu giải trình.

Nếu một ô dùng nhiều báo cáo, ngày công bố “gần nhất” không thay danh sách từng nguồn đã dùng. Phải có cách truy lại đầu vào chính xác, nhất là ROE dùng vốn đầu kỳ hoặc TTM cần nhiều quý. Không yêu cầu mọi metadata hiển thị thành cột chính; modal chi tiết là nơi tra cứu.

### 10.4. An toàn, cache và đồng thời

- Xác thực owner ở từng thao tác; không nhận user ID từ client để truy cập dữ liệu người khác.
- Server validate registry/version, enabled, quyền, kiểu số, step, dấu, kỳ, mã, range và giới hạn hợp lệ. Không chỉ tin min/max HTML.
- Client loại response cũ trả chậm sau response của kỳ/điều kiện mới. Không hiển thị giá trị quý trong cột vừa chọn TTM do đua request.
- Cache kỹ thuật có key đủ mã/khung/params/version/dữ liệu. RSI14 và RSI10 không dùng chung một giá trị.
- Cache cơ bản có factor/period/cutoff/phạm vi báo cáo/phiên bản nguồn và tính toán; không dùng cùng key cho quý/năm/TTM.
- Cấu hình có kiểm soát version; saved list và event lưu nguyên tử hoặc cơ chế đối soát tương đương. Không lưu nửa tiêu chí cũ và nửa số liệu mới.
- Không thực thi HTML/script từ tên cảnh báo/danh mục/nhãn báo cáo. Render an toàn các dấu `<`, `>` và nội dung nguồn.
- Không log token, mật khẩu hoặc quyền riêng tư vào phần chi tiết cho người dùng; có phân quyền truy cập metadata nguồn.

---

### 10.5. Hợp đồng nguồn mua Bot dùng lại dịch vụ hiện hữu

Tên route dưới dạng nghiệp vụ, không phải endpoint đã xác nhận tồn tại:

| Nghiệp vụ | Request/response tối thiểu | Hiệu lực |
|---|---|---|
| Đọc nguồn mua Bot | owner từ session, effective source/revision, pending, metadata lịch | Chỉ đọc |
| Áp kết quả/danh mục | `source_kind/id/version`, `result_id` hoặc `saved_list_id`, lựa chọn toàn bộ hoặc tập con, tên, `expected_source_revision`, `idempotency_key` | Tạo bản chờ phiên hợp lệ |
| Về VN30 | `expected_source_revision`, `idempotency_key` | Tạo nguồn VN30 chờ |
| Hủy nguồn chờ | ID/revision pending, expected revision | Hủy đúng bản chưa hiệu lực |
| Xem vị thế/điểm mở Bot | Tham chiếu workspace Bot thật | Không sao chép sổ sách vào module Chiến lược |

Ví dụ hình dạng để ánh xạ, không dùng làm bằng chứng endpoint có sẵn:

```json
{
  "source_kind": "saved_list",
  "source_id": "server-owned-list-id",
  "source_version": 3,
  "selection": {"mode": "subset", "symbols": ["FPT", "CMG"]},
  "display_name": "Danh mục của tôi",
  "expected_source_revision": 7,
  "idempotency_key": "unique-request-key"
}
```

Server tự resolve quyền, tập mã nguồn, ngày/phiên hiệu lực và snapshot. Client không truyền trường `passed`, số vốn, vị thế, config Bot hay ngày hiệu lực để được tin. Không chấp nhận mã ngoài kết quả chỉ vì client gửi cùng ID result có quyền.

Response trả `source_revision`, `status=pending`, nguồn hiện đang dùng, nguồn chờ và phiên hiệu lực hoặc trạng thái lỗi lịch đã được xác minh. Không gọi API ghi lệnh, reset vị thế hay cấp tiền trong chuỗi này. Các lần yêu cầu lặp cùng key trả đúng kết quả đã commit, không nhân nguồn/lịch sử hoặc kích hoạt lại.

Phân trang: sử dụng result ID/cutoff/selection trên server, không yêu cầu browser giữ toàn bộ dữ liệu cơ bản để chọn toàn bộ. Trường source-id được kiểm tra ownership giống saved run/alert. Chọn tập mã ở snapshot cũ hợp lệ không tự gắn giá trị số liệu latest vào nguồn cũ.

---

## 11. Nâng cấp và chuyển đổi dữ liệu cũ

### 11.1. Các khác biệt cần audit

Đặc tả cũ là tài liệu tham chiếu, không tự coi mọi endpoint/code path còn đang chạy. Tìm đúng stack và ghi commit/build thực tế.

| Nội dung được tài liệu cũ/mẫu mô tả | Việc cần làm |
|---|---|
| Backtest nhận factor ID + value | Bổ sung/adapter cho params và rule có kiểu hai phía. Không chỉ đổi label UI. |
| Hai phía có thể OR, một số factor là giao cắt | Bảo toàn chiến lược legacy với version; không ép sang AND/trạng thái để giống mẫu. |
| Stop mặc định ATR, giữ tối đa 60 phiên | Profile mới tắt tường minh; legacy lịch sử không bị sửa lại. |
| Cùng close, khóa bán hai bar trong engine tham chiếu | Xác minh và đặc tả profile khi thêm next-open; không coi mock không khóa là được bỏ khóa cũ. |
| RSI/ATR/công thức có thể khác registry Học viện | Ghi biến thể/version, đối chiếu bằng test; không tự đổi toàn bộ calculation. |
| Chỉ lưu chiến lược, chưa lưu lịch sử run | Bổ sung khả năng lưu phiên bản kết quả, không giả history bằng form mới. |
| Nút tạo cảnh báo chỉ copy Mua, chưa copy mã/tham chiếu đầy đủ | Map snapshot có Mua/Bán/params/operators/series đúng; test parity biểu thức. |
| 12 dòng giao dịch, null win rate thành 0%, rebase che phí | Sửa hiển thị, nguồn response và contract kết quả theo mục 6. |
| Cấu hình Học viện/35 chỉ báo/các chương cũ | Map theo catalog/version/capability mới; Học viện bỏ quyền ghi config; các mục đã loại không tự chuyển thành bài/chỉ báo mới. |
| Danh mục trước đây chỉ để nghiên cứu | Giữ snapshot/lịch sử; chưa có ý định Apply thì không tự gán thành nguồn Bot. |
| Bộ lọc cũ có một period toàn cục | Khi chuyển, preserve period của từng condition nếu hợp lệ; không áp default mới làm đổi nghĩa bộ lọc đã lưu. |

### 11.2. Những điều không được làm trong migration

Không xóa chiến lược/cảnh báo cũ, không tự bật chỉ báo từ việc học xong, không chuyển template default thành ý định người dùng. Không reset vốn hoặc xóa giao dịch Bot.

Một factor cũ không map an toàn sang registry mới thì đánh dấu cần kiểm tra và giữ bản cũ; không âm thầm bỏ factor rồi chạy phần còn lại. Filter kỳ toàn cục cũ nếu map sang một kỳ không được hỗ trợ, ví dụ ROE quý, phải báo cần xem lại; không tự đổi sang TTM rồi gọi là bảo toàn.

Cảnh báo cũ đang chạy không được nhân đôi scheduler khi thêm service mới. Migration cần mapping ID/version, cutover, kiểm tra không phát trùng; giữ bằng chứng lịch sử theo version cũ. Cấu hình thừa quyền hoặc nguồn kích hoạt không rõ không tự được coi là đã bật hợp lệ.

Nếu hệ thống cũ chỉ có danh sách mã mà không lưu metrics/provenance, hiển thị là danh sách legacy không có bằng chứng kỳ đã lưu; không lấy số mới và gán ngày cũ để lấp dữ liệu thiếu.

### 11.3. Khả năng rollback

Có backup/dry-run, thống kê số lượng và đối chiếu trước/sau. Rollback không xóa bút toán/lịch sử, không đưa cảnh báo về chạy hai worker, không khôi phục cổng trứng, mua V1, stop L1, target ×4 hoặc Săn mã nguồn Bot như một tác dụng phụ. Không triển khai production hoặc gửi thông báo thật ngoài quyền được cấp.

---

## 12. HTML mới đi kèm và giới hạn xem thử

### 12.1. Nhận diện

- File: `IQX-Bo-Chien-Luoc-MAU-v1.0.html`.
- Đây là **bản mới cập nhật từ** mẫu kỳ tính riêng v2 đã duyệt, không khẳng định giữ nguyên byte.
- Giữ CSS/hệ màu, ba tab, thư viện trái, hai panel Mua/Bán, sáu KPI, chart lợi nhuận và bảng kết quả của mẫu trước.
- Bổ sung registry đúng 16 chỉ báo từ Bot; catalog 13 chương/71 bài và metadata 42 bài cơ bản; chỉ sáu chỉ tiêu Chương 3 có dữ liệu/thuật toán mẫu.
- Bổ sung áp danh mục từ kết quả hoặc saved list, pending/effective/Về VN30, kiểm tra không xóa nguồn đang dùng, và modal đọc trạng thái liên kết Bot.
- HTML nhúng CSS, JavaScript và fixture; không cần ảnh, font, CDN hoặc file JSON đi kèm. Không có fetch hoặc gửi lệnh thật.
- Nhận diện kích thước/SHA-256 và kết quả kiểm tra cục bộ được ghi cuối mục này sau khi tạo file.

### 12.2. Cách thử

File mở **Bộ lọc** để duyệt luồng mới. Mặc định production vẫn theo route hiện tại, không đổi chỉ vì file mẫu mở tab này.

1. Giữ bộ tiêu chí mẫu Chương 3 hoặc thay ngưỡng/kỳ; chọn một vài mã rồi bấm Áp dụng cho Bot.
2. Xác nhận danh sách; khối nguồn vẫn hiển thị VN30 đang hiệu lực và danh mục mới đang chờ.
3. Bấm **Phiên tiếp theo · Mẫu** ở footer để áp trạng thái chờ. Nút này không chạy giao dịch Bot.
4. Xem Bot để đối chiếu hai vị thế minh họa; Về VN30 rồi chuyển phiên tiếp để thấy vị thế không bị bán.
5. Sang Backtest; chọn trạng thái **Đã học toàn bộ · Mẫu** để xem đủ 16 chỉ báo, chỉnh hai phía rồi chạy lại.
6. Tạo cảnh báo từ kết quả, sửa cấu hình chung và kiểm tra snapshot cảnh báo không tự đổi.

Các bài chưa được học không được dùng; footer chỉ chuyển quyền minh họa, không ghi completion/grant của IQX. Trạng thái mẫu có cấu hình MA/MACD và cảnh báo minh họa kế thừa để có hình kết quả; người mới trên production mặc định không có cấu hình tự bật.

### 12.3. Những phần không đưa sang production

| Có trong HTML | Khi tích hợp |
|---|---|
| `S.access`, core/all/rsi/new | Grants thật theo tài khoản; học xong không auto ON |
| `freshConfig`, `seedExamples`, snapshot lúc mở file | Không seed cấu hình/cảnh báo/kết quả cho mọi người dùng |
| `REGISTRY` và `calcSeries` tham chiếu | Cùng definition với Bot; đối chiếu nguồn/version theo Phụ lục C, không coi mẫu là engine đã chứng nhận |
| 42 tên trong `fundCatalogData` | Không có 42 công thức hoàn chỉnh; 36 thiếu vẫn nêu readiness đúng |
| Nến/VN-Index 2022–2025, chín doanh nghiệp và lịch weekdays | Dữ liệu/catalog/lịch thật có nguồn; phạm vi sản phẩm không bị giới hạn vào fixture |
| Báo cáo và ngày công bố/cutoff 31/12/2025 | Provenance thật từng doanh nghiệp; không lấy lịch/năm dương mẫu làm thật |
| EPS cổ phiếu bình quân bất biến, ROE bình quân hai đầu | Chỉ biến thể fixture; kiểm tra contract nguồn trước khi tích hợp |
| Phí mua 0,15%, bán gộp 0,25%, lô 100, năm hóa 252 phiên | Giả định mô phỏng, không xác nhận quy định hay biểu phí thị trường |
| Backtest mẫu không khóa thanh toán/thanh khoản/trượt giá | Không suy ra sản phẩm đã mô phỏng các phần đó hoặc đã được phép bỏ khóa hiện có |
| `botLink`, `previewVN30`, hai vị thế CMG/FPT | Chỉ để minh họa nguồn/giữ vị thế; dùng Bot service thật, không nạp hai vị thế hoặc tạo tài khoản mới |
| Đồng hồ mock từ 07/10/2026 | Dùng ngày server và lịch phiên thật; không liên quan việc backtest/nguồn báo cáo mẫu kết thúc năm 2025 |
| “Phiên tiếp theo · Mẫu” | Bỏ khỏi production; scheduler/apply service đúng phiên |
| Nút Xem Bot mở modal tại file độc lập | Điều hướng tới Bot hiện có; không dựng module sổ sách thứ hai |
| `localStorage`, giới hạn 20 mục, JSON stringify | Không là authorization/database/limit gói/chữ ký hoặc khóa idempotency server |
| Các nút header ngoài phạm vi, Thông tin mẫu, Đặt lại | Giữ routing thật; bỏ control xem thử khỏi production |
| `IQX_PREVIEW` | Hook kiểm tra cục bộ, không public production authorization |

HTML không đồng bộ storage với HTML Bot hoặc Học viện đã bàn giao. “Cấu hình chung” trong mẫu là một record cục bộ để diễn tả quan hệ; production phải dùng một service chung thật. Xóa nhãn giả lập không biến dữ liệu mẫu thành dữ liệu thị trường.

### 12.4. Thực thi kiểm tra cục bộ

HTML đã được kiểm tra cục bộ bằng Chromium với **83/83 kiểm tra tự động đạt** trong phạm vi kịch bản của lần bàn giao này. Các nhóm đã thử: catalog 16/42/13/71; sáu kỳ/giá trị tài chính mẫu; chọn tập mã và apply/pending/effective/Về VN30; không đổi vị thế/config/alert khi đổi nguồn; lưu/xóa danh mục đang dùng; Mua/Bán độc lập; Đặt lại/bỏ đúng phía; snapshot run và Cảnh báo giữ nguyên; 16 chỉ báo trên hai mode; MA Cross không biến thành trạng thái; missing/∉; chống trùng scan; sáu chiều rộng 1440/1024/870/600/390/360 px, theme sáng/tối và modal nhỏ. Đã kiểm tra cú pháp JavaScript bằng Node.

**Giới hạn bằng chứng:** trình duyệt môi trường này chặn `file://` theo chính sách quản trị. HTML được nạp bằng `set_content`; trường hợp localStorage bị chặn có thông báo chỉ giữ trong lượt xem. Chưa kiểm thử persistence thật sau reload file origin, đồng bộ nhiều thiết bị, quyền/backend, worker, calendar, nguồn giá/BCTC hoặc giao dịch IQX. Không dùng số kiểm tra mẫu này để đánh dấu các ca nghiệm thu mục 13 đã đạt trên production.

Kích thước HTML: **244,159 byte**. SHA-256: `53e0d805afe62cce40674b655aa28c4cab2aefb5cfa51782cabb9a1df6b7970f`.

HTML nguồn bố cục cũ có SHA-256 `3d288ba469cd373f71c6193561bdbab6574d4725af1bc116c8cb0af833070a74`; bản mới khác byte do các thay đổi được mô tả ở trên. Chỉ giao hai file của bộ mới, không yêu cầu chuyển thêm file nguồn cũ để xem.

---

## 13. Ca kiểm thử nghiệm thu

**Tất cả ca trong mục này là yêu cầu AI dev phải thực hiện trên repository/môi trường được cấp quyền, không phải báo cáo production đã đạt.** Dữ liệu số trong các ca là fixture ghi rõ. Bằng chứng cần có input, expected/actual, file/hàm test, lệnh đã chạy và môi trường. Không cần một file JSON test riêng từ chủ sản phẩm.

### G. Navigation, quyền và phạm vi

| ID | Đầu vào / điều kiện | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| G01 | Trang Chiến lược đang có, có link tab/mã cũ. | Mở ba tab và link trực tiếp. | Đúng Cảnh báo · Backtest · Bộ lọc; link cũ giữ tham số, không tạo ứng dụng riêng. |
| G02 | Người dùng chưa đăng nhập hoặc chưa có quyền gói theo guard thật. | Mở UI và gọi API trực tiếp. | Guard kiểm tra trên server; không lấy quyền demo/localStorage để cho qua. |
| G03 | Catalog có nhiều chỉ báo/chỉ tiêu nhưng chỉ một phần được cấp quyền. | Mở thư viện và gửi condition chưa có quyền. | Chỉ hiện công cụ đã mở; server từ chối condition không được phép, không tự grant. |
| G04 | Bài học vừa đạt; chưa có ý định bật chỉ báo của người dùng. | Mở Backtest/Cảnh báo/Bộ lọc. | Chỉ mở quyền tương ứng, không tự bật Mua/Bán hoặc seed cảnh báo/chiến lược mẫu. |
| G05 | Có dữ liệu và một kết quả đã chạy. | Chuyển ba tab, quay lại. | Giữ input/kết quả hợp lệ; không tự chạy, không thay config, không làm mất trạng thái đã lưu. |
| G06 | Đang tải quyền hoặc catalog bị lỗi. | Mở trang và thử lại. | Có loading/lỗi đúng phần; không coi thiếu response là quyền 0 rồi ghi đè cấu hình. |
| G07 | Viewport 1440, 1024, 870, 600, 390, 360 px. | Mở các tab, thư viện, modal và bảng. | Không tràn ngang toàn trang; bảng cuộn nội bộ; form và nút hành động đều truy cập được. |
| G08 | Người dùng chọn giao diện sáng/tối theo cơ chế hiện có. | Chuyển theme và tab. | Giữ bố cục, tương phản đọc được, tooltip/chart không mất nhãn hoặc số. |
| G09 | Người dùng thao tác bằng bàn phím. | Tab tới controls, đổi tab, mở/đóng modal. | Có label, focus, role switch/tab đúng; modal trả focus, không thao tác nhầm nền bị che. |
| G10 | Tài khoản mới thật không có dữ liệu mẫu. | GET trang, refresh, mở nhiều tab trình duyệt. | Không tạo 9 doanh nghiệp fixture/cảnh báo mẫu, không cấp tiền hoặc thay trạng thái Bot. |

### C. Cấu hình dùng chung

| ID | Đầu vào / điều kiện | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| C01 | RSI Mua chu kỳ 14/ngưỡng 30, Bán chu kỳ 10/ngưỡng 75. | Đổi Mua sang 12 và Lưu. | Bán giữ 10/75; server lưu đúng patch; chuỗi tính/cache hai phía không ghi đè. |
| C02 | Một chỉ báo đã mở quyền nhưng chưa được dùng. | Bấm thêm Mua, sửa draft rồi Hủy. | Không thêm phía Mua vào config đã lưu, không đổi Bot/cảnh báo. |
| C03 | Tham số đã thay so mặc định registry. | Đặt lại tại tab Mua rồi chưa Lưu. | Chỉ draft params/rules Mua về mặc định; Bán và công tắc không tự đổi; nguồn chung chưa ghi. |
| C04 | Có draft chưa lưu. | Chuyển Mua/Bán, rồi đóng/Esc và chọn không bỏ. | Draft hai phía được giữ; hủy rời màn không commit hoặc mất lựa chọn. |
| C05 | Master OFF; child Mua ON đã lưu từ trước. | Bật master qua nơi có thao tác hợp lệ. | Giữ params và lựa chọn child; không bật Bán hoặc reset mặc định. |
| C06 | Cả hai child đang OFF. | Lưu; sau đó yêu cầu bật master. | Master OFF; mở cấu hình/chọn phía, không all([])=true và không tự ON cả hai. |
| C07 | RSI đang dùng ở Mua và Bán. | Bỏ RSI khỏi panel Mua Backtest. | Chỉ tắt Mua và lưu theo contract chung; params và phía Bán giữ nguyên, không chỉ ẩn card. |
| C08 | Mua cấu hình dấu < thay vì dấu > mặc định. | Lưu và tính trên dữ liệu có giá trị thỏa <. | Dùng đúng toán tử đã lưu, không ép theo nhãn tab Mua. |
| C09 | Điều kiện dùng ∉ nhưng giá hoặc biên bị thiếu. | Đánh giá. | Trả chưa đánh giá được, không NOT(missing)=true; phía không dùng dữ liệu đó không bị chặn sai. |
| C10 | Hai chỉ báo Mua; một đúng, một sai/thiếu. | Đánh giá cùng phiên. | AND không đạt; không dùng đa số, không bỏ chỉ báo thiếu để mua. |
| C11 | Condition ON có rules rỗng, toán tử ngoài whitelist hoặc vi phạm params. | Gửi API. | Server từ chối; không chấp nhận theo allowed_ops client hoặc tạo cổng đúng từ tập rỗng. |
| C12 | Hai thiết bị chỉnh cùng expected_revision. | Lưu lần lượt rồi retry request đầu. | Lần ghi cũ bị conflict đúng; retry idempotent không nhân revision hoặc ghi đè lựa chọn mới. |
| C13 | Lưu thành công vào ngày T trước hoặc sau đóng cửa. | Đọc Bot, Backtest và nguồn quyền Học viện. | Saved revision thống nhất; Bot hiệu lực từ phiên hợp lệ có ngày > T; không giao dịch ngay vì lưu. |
| C14 | Cấu hình mới đang pending, hoặc API lưu/calendar lỗi. | Đọc trạng thái/nhấn lưu lại. | Không báo Bot đã áp dụng; lỗi giữ draft; cấu hình effective, tiền và vị thế giữ nguyên; không khôi phục stop nền cũ. |

### A. Cảnh báo

| ID | Đầu vào / điều kiện | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| A01 | Snapshot cấu hình có Mua và Bán; chưa tạo cảnh báo. | Chọn mã, chỉ theo dõi Bán, Lưu. | Tạo được cảnh báo Bán độc lập, không bắt có vị thế hoặc bật Mua trong cảnh báo. |
| A02 | Nguồn snapshot không có điều kiện Bán. | Cố chọn Bán hoặc giả request Bán. | Không cho theo dõi phía rỗng; không tự bật Bán trong config chung. |
| A03 | Run cũ dùng RSI; form hiện tại đã đổi sang MA. | Tạo cảnh báo từ run cũ. | Ghim RSI/params/dấu/version của run cũ, không lấy form hiện tại. |
| A04 | Có một cảnh báo đã ghim bản N. | Lưu config chung thành N+1. | Cảnh báo vẫn bản N tới khi được cập nhật chủ động; lịch sử không viết lại. |
| A05 | Danh mục nghiên cứu có A/B tại lúc chọn. | Tạo cảnh báo rồi đổi bộ lọc hoặc xóa danh mục nguồn. | Cảnh báo đã lưu vẫn có tập A/B và tham chiếu cũ, không tự đổi phạm vi hoặc mất bằng chứng. |
| A06 | Cảnh báo hoạt động, Bot có cấu hình và vị thế. | Tạm dừng/xóa cảnh báo. | Chỉ dừng theo dõi cảnh báo đó; không tắt chỉ báo, không ảnh hưởng cấu hình Bot hoặc tạo lệnh. |
| A07 | Lần kiểm tra hợp lệ đầu tiên; condition đúng. | Quét. | Ghi “Đang thỏa ở lần kiểm tra đầu”, không khẳng định vừa giao cắt. |
| A08 | Condition sai ở phiên hợp lệ trước, đúng ở phiên hiện tại. | Quét cuối phiên hoàn tất. | Một sự kiện mới cho đúng mã/phía/phiên/bản điều kiện. |
| A09 | Condition đúng liên tiếp ba phiên. | Quét từng phiên. | Không phát ba thông báo lặp; trạng thái tiếp tục đúng được giữ. |
| A10 | Chuỗi đúng → thiếu dữ liệu → đúng. | Quét liên tiếp. | Thiếu dữ liệu không làm reset về sai; không tạo tín hiệu mới giả khi feed trở lại. |
| A11 | Mã không được nắm giữ và không có trong Săn mã Bot; snapshot cảnh báo Bán đúng. | Quét phạm vi cảnh báo. | Vẫn ghi tín hiệu Bán; không gắn nhãn Bot đã bán hoặc yêu cầu top 50. |
| A12 | Mua và Bán cùng đúng; cảnh báo theo dõi cả hai. | Quét một mã. | Hai loại tín hiệu độc lập theo trạng thái trước; không tạo hai giao dịch hoặc ép chỉ một phía. |
| A13 | Một sự kiện cùng phiên/bản/mã/phía đã tồn tại. | Retry hoặc hai worker xử lý đồng thời. | Chỉ một bản ghi/phát thông báo; khóa chống trùng ở backend, không dựa mảng client. |
| A14 | Cảnh báo tạm dừng nhiều phiên. | Bật lại và kiểm tra phiên mới nhất. | Theo trạng thái bắt đầu lại đã mô tả; không tự phát toàn bộ tín hiệu thời gian tạm dừng; cùng phiên đã ghi vẫn chống trùng. |
| A15 | Chỉ đổi tên cảnh báo, không đổi điều kiện/phạm vi. | Lưu rồi quét tiếp. | Không reset toàn bộ lịch sử hoặc tự đổi snapshot sang config mới nhất. |
| A16 | Đã có tín hiệu với bằng chứng, sau đó condition được cập nhật/xóa. | Mở lịch sử tín hiệu cũ. | Hiện đúng giá trị/dấu/phiên bản lúc ghi; không tính lại bằng cấu hình hiện tại. |
| A17 | Nến ngày đang hình thành hoặc một mã thiếu đầu vào. | Worker được gọi/tải lại màn. | Không gọi dữ liệu tạm là tín hiệu cuối phiên; lỗi đúng mã/phía, không báo mọi mã đã kiểm tra thành công. |
| A18 | Có yêu cầu cảnh báo web, không có cấu hình kênh ngoài. | Tạo/chỉnh/quét. | Không gửi email/SMS/Telegram, không chạy lệnh, không gọi AI để chọn điều kiện thay người dùng. |

### B. Backtest

| ID | Đầu vào / điều kiện | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| B01 | Cấu hình không có điều kiện Mua. | Bấm Chạy hoặc gửi request. | Chặn chạy chiến lược mua–bán; không V1 fallback hoặc lấy điều kiện Bán làm Mua. |
| B02 | Có điều kiện Mua hợp lệ, không có Bán và không cơ chế thoát. | Chạy tới cuối kỳ. | Có thể còn vị thế mở; không stop ngầm, không chốt lời, không bán 60 phiên hoặc ép bán cuối kỳ. |
| B03 | Engine cũ default ATR/max_holding=60. | Chạy profile cơ bản mới với UI không có risk. | Metadata và engine tắt tường minh cơ chế bị bỏ; không chỉ xóa controls. |
| B04 | Mode same-close; dữ liệu đầy đủ. | Condition Mua đúng cuối T. | Mua mô phỏng close T, ghi ngày tín hiệu/ngày khớp đúng; nêu giả định, không claim khớp thực. |
| B05 | Mode next-open; tín hiệu đúng ở close T. | Mở vị thế phiên kế tiếp. | Khớp open phiên kế tiếp, không open T; số lượng/chi phí kiểm tra trên giá khớp. |
| B06 | Tín hiệu mới xuất hiện ở phiên cuối khoảng, mode next-open. | Kết thúc run. | Giữ trạng thái chưa khớp; không lấy phiên ngoài khoảng để tạo giao dịch hoàn tất. |
| B07 | Có lệnh chờ, open/phiên cần thiết bị thiếu. | Mô phỏng. | Không thay bằng close/giá trước hoặc nhảy ngày ngầm; thể hiện lỗi/thiếu theo contract thực thi. |
| B08 | Mua và Bán cùng đúng, đang trống. | Xử lý same-close/next-open theo trạng thái. | Chỉ xét mua hợp lệ; không mở bán khống hoặc đóng vị thế mới trong cùng bước. |
| B09 | Mua và Bán cùng đúng, đang có vị thế. | Xử lý nhánh vị thế. | Xét Bán; không mua thêm; không vừa bán vừa khớp mua lại cùng phiên. |
| B10 | Mua bị chặn vì thiếu một chỉ báo/warmup. | Chạy. | Không dùng 0 thay missing; báo độ đầy đủ, không xóa điều kiện bắt buộc để tạo lệnh. |
| B11 | Fixture: vốn 12.000.000; giá 20.000; lô 100; phí mua 0,15%. | Tính khối lượng theo tiền khả dụng gồm phí. | Mua tối đa 500 CP, chi 10.015.000, còn 1.985.000; 600 CP vượt vốn, không làm tròn lên. |
| B12 | Fixture: mua 100 CP giá 10.000, phí mua 0,15%; bán 11.000, tổng phí/thuế bán 0,25%. | Ghi và tính P/L. | Entry 1.001.500; bán thuần 1.097.250; lãi thuần 95.750; không trừ thuế gộp lần nữa. |
| B13 | NAV có cả tiền mặt và cổ phiếu chưa bán. | Tính tổng lợi nhuận cuối kỳ. | Dùng NAV_end/vốn đầu−1; không cộng % lệnh hoặc bỏ lãi/lỗ chưa thực hiện. |
| B14 | Chưa có vòng mua–bán hoàn tất. | Render KPI. | Số giao dịch đóng 0; tỷ lệ thắng null/—, không 0% như đã có lệnh thua. |
| B15 | Fixture NAV: vốn 100 → 120 → 90 → 110. | Tính drawdown. | Mức sụt giảm lớn nhất −25%; vốn trước phí được đưa vào đỉnh tham chiếu. |
| B16 | Fixture NAV từ 100 lên 121 trong 504 phiên, profile năm hóa 252 phiên. | Tính CAGR. | CAGR 10%; metadata ghi đúng quy ước, không chia total return đơn giản cho năm. |
| B17 | Fixture mua/giữ giá: đầu 100, giữa kỳ đỉnh 200, cuối 130. | Render benchmark. | Lợi nhuận mua và giữ +30%, không +100%; cuối chart khớp KPI. |
| B18 | Có phí mua ở phiên đầu. | Vẽ chart và tính return. | Mốc trước phí 0%; phần giảm do phí không bị rebase mất; điểm cuối khớp tổng lợi nhuận. |
| B19 | Curve có giá trị âm, dương và nhiều mốc chênh không đều. | Vẽ/trỏ tooltip. | Trục tuyến tính đúng tỷ lệ, cùng ngày so sánh; nhãn % chính xác, không path tĩnh. |
| B20 | Có 85 giao dịch đóng và một vị thế mở. | Xem bảng/phân trang/chi tiết. | Truy cập đủ 85 giao dịch, vị thế mở tách riêng, bằng chứng và tổng số không chỉ là trang đầu. |
| B21 | Run đã xong; người dùng đổi params/dấu/phí hoặc mã. | Xem rồi lưu phiên bản cũ. | Kết quả cũ giữ nguyên, có nhãn cần chạy lại; saved run giữ input của run, không gắn form mới. |
| B22 | Mở một run cũ trong Đã lưu. | Xem kết quả, rồi tạo cảnh báo từ đó. | Không ghi đè config chung; cảnh báo lấy đúng snapshot run. |
| B23 | Dữ liệu chiến lược đủ nhưng VN-Index thiếu ngày gốc/hỏng nguồn. | Chạy và render. | Giữ kết quả chiến lược; không benchmark giả 0% hoặc lấy gốc ngoài kỳ không công bố. |
| B24 | Khoảng/mã/vốn sai, job lỗi hoặc thiếu profile thanh toán xác minh. | Chạy/retry. | Lỗi có nghĩa, không thành công giả, không đổi profile âm thầm và không ghi giao dịch vào Bot. |

### F. Bộ lọc và kỳ dữ liệu

| ID | Đầu vào / điều kiện | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| F01 | Mở Bộ lọc mới. | Quan sát scope và thêm các chỉ tiêu. | Đầu trang chỉ thị trường/ngành; mỗi điều kiện có Kỳ tính/Dấu/Ngưỡng, không period chung. |
| F02 | Thêm tăng trưởng doanh thu/LNST/EPS. | Đọc lựa chọn mặc định và đổi kỳ. | Mặc định quarter; chỉ các kỳ quarter/ttm/year hợp lệ theo catalog. |
| F03 | Thêm biên gộp/biên ròng/ROE. | Đọc mặc định, gửi ROE quarter trực tiếp. | Mặc định ttm; ROE chỉ ttm/year, backend từ chối quarter, không tự đổi ngầm. |
| F04 | LNST đang quarter, ROE ttm. | Chuyển LNST sang year. | Chỉ kỳ LNST đổi; số liệu, điều kiện và header tương ứng đổi thật; ROE giữ ttm. |
| F05 | Fixture cùng kỳ: hiện 150, cùng quý năm trước 100, quý trước 125. | Tính tăng trưởng YoY quý. | Kết quả +50%, không +20% QoQ. |
| F06 | Fixture bốn quý hiện tổng 600; bốn quý lùi một năm tổng 400. | Tính YoY TTM. | Kết quả +50%; không so với tổng lùi một quý hoặc năm lịch không tương ứng. |
| F07 | Doanh nghiệp có năm tài chính khác năm dương. | Chọn year. | Dùng đúng năm tài chính đầy đủ và kỳ so sánh của nguồn; không hardcode 01/01–31/12. |
| F08 | Báo cáo kết thúc 30/06, công bố 25/07, tiếp nhận 26/07 trong fixture. | Lọc với cutoff nội bộ 10/07 hoặc 25/07 trước lúc sẵn sàng. | Không dùng báo cáo chưa được công bố/tiếp nhận theo chính sách; không giả ngày metadata. |
| F09 | Một doanh nghiệp mới nhất Q2, một doanh nghiệp Q3. | Lọc mới nhất. | Hiển thị kỳ thực tế mỗi ô/mã; không ghi cả bảng Q3 hoặc âm thầm loại Q2 chỉ vì khác kỳ. |
| F10 | Anchor mới nhất Q3 nhưng thiếu Q1 trong bốn quý cần thiết. | Chọn ttm. | Chưa đủ dữ liệu; không quay về TTM cũ, không dùng năm trước, không lấy ba quý hay nhân bốn. |
| F11 | Fixture doanh thu [100,200,300,400], lãi gộp [10,40,90,160]. | Tính biên gộp ttm. | 30%; không trung bình 25% hoặc cộng các tỷ lệ. |
| F12 | Fixture nguồn cho số lũy kế 6/9 tháng. | Lập số quý/TTM. | Phân tách đúng theo contract cùng phạm vi/version; không cộng lũy kế như quý riêng. |
| F13 | ROE TTM có lợi nhuận 4 quý nhưng thiếu vốn đầu kỳ. | Tính và lọc. | Không tính được theo phương pháp bình quân đang dùng; không thay vốn cuối kỳ hoặc cộng vốn 4 quý. |
| F14 | EPS có số cổ phiếu thay đổi/chia tách. | Tính YoY theo contract nguồn. | Không áp giả định cổ phiếu bất biến của HTML; dùng basis EPS đã xác minh hoặc báo thiếu. |
| F15 | LNST YoY công ty mẹ và biên ròng hợp nhất cùng xuất hiện. | Đọc dữ liệu/chi tiết. | Dùng đúng tử số mỗi định nghĩa, không gộp hai field chỉ vì cùng tên lợi nhuận. |
| F16 | Kỳ gốc tăng trưởng bằng 0/âm theo registry mẫu không cho ratio. | Tính và so ngưỡng. | Trạng thái invalid base; không trị tuyệt đối, vô cực hoặc 0 để cho qua. |
| F17 | Một cột tham khảo không áp dụng, nhưng mọi điều kiện bắt buộc đều đủ. | Lọc. | Không loại mã chỉ vì cột không dùng; ô tham khảo hiện —/lý do. |
| F18 | Một điều kiện bắt buộc thiếu/không áp dụng. | Lọc. | Không cho qua bằng AND phần còn lại; thống kê ngoại lệ phân biệt với không đạt ngưỡng. |
| F19 | Fixture giá trị chính xác 8,164965…, hiển thị 8,16. | Lọc >8,16 và xếp hạng số. | Điều kiện đạt trên giá trị chính xác; không so số đã làm tròn. |
| F20 | Có kết quả một chỉ tiêu. | Bấm giá trị. | Xem đúng kỳ/khoảng/so sánh/công bố/tiếp nhận/cutoff/phạm vi/thành phần; không dùng số từ kỳ khác. |
| F21 | Request quarter đang chờ; user đổi nhanh sang ttm. | Cho response quarter trả sau ttm. | Không ghi đè cột/criteria mới bằng response cũ; cache và request identity phân biệt kỳ. |
| F22 | Bộ lọc đã lưu các lựa chọn quarter/ttm. | Mở lại sau khi có báo cáo mới. | Resolve kỳ mới theo lựa chọn động; không giữ Q3/2025 hoặc reset mọi kỳ về default. |
| F23 | Danh mục đã lưu kèm số liệu/kỳ tại cutoff A. | Đổi ngưỡng/kỳ hoặc có báo cáo mới, mở danh mục. | Giữ đúng bằng chứng A; không tính lại snapshot từ bảng hiện tại. |
| F24 | Có nhiều trang kết quả, chọn tất cả hoặc chọn một tập mã. | Lưu danh mục. | Lưu đúng toàn bộ/tập được xác nhận, không chỉ trang đầu; ownership và cutoff nhất quán. |

### I. Tích hợp, migration và hồi quy

| ID | Đầu vào / điều kiện | Thao tác | Kết quả bắt buộc |
|---|---|---|---|
| I01 | Danh mục nghiên cứu đã lưu. | Chọn một mã để Backtest hoặc tạo cảnh báo với danh mục. | Truy xuất đúng snapshot/quyền; Backtest vẫn một mã, cảnh báo ghim đúng tập mã. |
| I02 | Bot mới đang giữ vị thế, không stop/target. | Chạy Backtest; lưu/tắt cảnh báo và filter. | Tiền/vị thế/policy Bot không đổi; không tạo lệnh, không reset vốn hoặc khôi phục stop/target cũ. |
| I03 | Tài khoản A và B có config/run/list/alert riêng. | B dùng ID của A qua API. | Bị từ chối; không lộ snapshot, dữ liệu riêng hoặc cho chỉnh của người khác. |
| I04 | Chiến lược legacy dùng OR hoặc sự kiện giao cắt. | Migration sang editor mới. | Giữ ý nghĩa/version; không ép AND/trạng thái, không âm thầm bỏ condition không map được. |
| I05 | Filter legacy period chung hợp lệ cho từng chỉ tiêu. | Migration. | Gán period đó cho từng condition để bảo toàn nghĩa, không dùng default mới thay lựa chọn cũ. |
| I06 | Filter legacy có period không hỗ trợ, ví dụ ROE quý. | Migration/load. | Giữ bằng chứng cũ và báo cần xem lại; không tự chuyển thành TTM rồi báo bảo toàn. |
| I07 | Cảnh báo cũ và worker mới đang chuẩn bị cutover. | Chuyển rồi retry một phiên. | Không hai worker gửi trùng; đúng ID/version/history và không ghi lại tín hiệu cũ bằng rule mới. |
| I08 | Tên cảnh báo/danh mục hoặc nhãn chứa <, >, dấu nháy và markup. | Lưu/hiển thị/chi tiết. | Render đúng văn bản; không mất chữ, không thực thi script, validate server đúng. |
| I09 | Lỗi lưu một phần/timeout; user retry; nguồn catalog hoặc quyền thay đổi. | Lưu config/list/alert và phục hồi. | Không toast thành công giả, không snapshot trộn phiên bản, không nhân bản; giữ draft và bằng chứng lỗi. |
| I10 | Có phiên bản mẫu, code thật và tài liệu được bàn giao. | Nghiệm thu và báo cáo. | Tách test mock với production; nêu chính xác nguồn/profile đã xác minh, test chưa chạy và phần bị chặn; không nghiệm thu chỉ bằng UI. |

### U. Áp dụng danh mục và đồng bộ nguồn Bot mới

| ID | Đầu vào / thao tác | Kết quả bắt buộc |
|---|---|---|
| U01 | Chưa dùng danh mục riêng; đọc trang Bộ lọc/nguồn Bot | VN30 hiệu lực; không gọi filter tự áp hoặc tạo lệnh |
| U02 | Kết quả A có năm mã; chỉ chọn hai, trong đó một mã ngoài VN30; xác nhận | Áp đúng hai mã, không lấy giao/cộng với VN30 |
| U03 | Không chọn riêng; kết quả có nhiều trang | Form nêu tổng đầy đủ; server áp mọi mã đã xác nhận cùng result/cutoff |
| U04 | Bỏ chọn hết trong form; gọi API tập rỗng | Chặn áp dụng, không fallback VN30 |
| U05 | Lưu bộ lọc và Lưu danh mục khi Bot đang dùng nguồn A | Chỉ lưu đối tượng, Bot vẫn A |
| U06 | Áp từ kết quả chưa từng Lưu danh mục | Giữ nguồn result snapshot tin cậy; không bắt thêm thao tác lưu hoặc nhận mã tự khai |
| U07 | Áp từ danh mục đã lưu, chọn một phần | Giữ ID/version, đúng subset và bằng chứng nguồn cũ |
| U08 | Sau áp, thay ngưỡng/kỳ/sort và có báo cáo mới | Tập mã Bot không tự thay; không viết lại snapshot |
| U09 | Áp danh mục vào trước/sau mở cửa ngày D | Pending; hiệu lực phiên có ngày > D theo lịch, không tạo lệnh ngay |
| U10 | Nguồn A đang hiệu lực; B đang chờ | UI thể hiện A/B khác nhau; worker trước mốc vẫn dùng A |
| U11 | Hai yêu cầu nguồn cạnh tranh hoặc retry cùng key | Revision/idempotency đúng, không trộn hai tập hoặc nhân lần mua |
| U12 | Hủy form áp/Về VN30; hoặc hủy pending chưa hiệu lực | Không đổi nguồn hiệu lực; kiểm tra tranh chấp nếu pending đã được áp |
| U13 | Giữ mã cũ ngoài B sau thay nguồn; điều kiện Bán đạt | Vẫn xét/bán theo Bot; không cần mã thuộc B |
| U14 | Giữ mã ngoài B nhưng chưa đạt Bán hoặc Bán OFF | Giữ nguyên, không stop/time/cơ bản hoặc ép bán do thay nguồn |
| U15 | Mã ngoài B có tín hiệu Mua; đã bán ở phiên trước | Không mua lại trừ khi mã thuộc nguồn hiệu lực mới |
| U16 | Về VN30 có hiệu lực; đang giữ mã từ danh mục cũ | Chỉ Mua trong VN30; Bán quét mọi vị thế, không reset giá vốn/vốn/lịch sử |
| U17 | Danh mục hiệu lực/pending đang bị xóa | Chặn/transaction xác nhận theo mục 8.7; không làm mất snapshot hoặc tự bán |
| U18 | API nguồn mua lỗi hoặc thiếu calendar | Không mở rộng nguồn sang VN30/Săn mã; không báo effective giả; Bot vẫn xét Bán đủ dữ liệu |
| U19 | Client gửi source ID của tài khoản khác hoặc mã ngoài kết quả | Server từ chối; không lấy owner/selection từ client làm bằng chứng |
| U20 | VN30 đổi thành phần; mã đang giữ bị loại | Không Mua mới mã bị loại; vẫn Bán, lịch sử cũ giữ thành phần tại thời điểm cũ |
| U21 | Bot đổi nguồn A→VN30; cảnh báo đang ghim A | Cảnh báo vẫn đúng snapshot phạm vi A cho tới cập nhật riêng |
| U22 | Săn mã tích/bỏ Theo dõi; hoặc đọc bài cơ bản | Không đổi nguồn Bot; không phát sinh lệnh hoặc áp danh mục |

### N. Đồng bộ 16 chỉ báo, 42 binding và ranh giới ba bộ

| ID | Đầu vào / thao tác | Kết quả bắt buộc |
|---|---|---|
| N01 | Đủ grants cho 16 chỉ báo; mở thư viện | Đúng 16 IDs/tên/chương 1/5/7/10; không có 19 mục đã bỏ |
| N02 | Đã có tên 42 bài cơ bản nhưng thiếu definition của 36 mục | Không tạo phép tính/period policy giả; ghi readiness/điểm thiếu; 6 mục đủ nguồn tiếp tục dùng |
| N03 | RSI Mua/Bán khác chu kỳ, đổi dấu theo từng phía | Giữ exact registry, tham số độc lập; không đổi công thức khi gắn qua Backtest/Cảnh báo |
| N04 | MA Cross nhanh ở trên chậm hai phiên liên tiếp | Không là giao cắt lần mới; ngưỡng giữa T−1/T đúng theo Phụ lục B |
| N05 | Donchian phá biên trên của N phiên trước | Cửa sổ không gồm T, tín hiệu có thể đạt hợp lệ; không lấy max gồm high T làm điều kiện bất khả thi |
| N06 | DMI/Stochastic/OBV nhiều series; copy từ Backtest sang Cảnh báo | Giữ +DI/−DI, %K/%D, OBV/SMA đúng tham chiếu, không chuyển rhs series thành null |
| N07 | RSI/CCI/MFI/CMF/Williams có mẫu số 0/thiếu | Null/unknown theo definition, không 0 hoặc ∉ true để tạo tín hiệu |
| N08 | Bộ lọc chứa chỉ tiêu chưa có grant nhưng client tự gửi request | Chặn đúng quyền; không loại condition rồi lọc các phần còn lại |
| N09 | Bài ATR legacy và OBV mới cùng vị trí ch07-l01 | Mapping theo capability/version, không cấp OBV từ completion ATR |
| N10 | Snapshot cũ chứa OR hoặc chỉ báo bị loại | Giữ lịch sử; chặn chạy/cập nhật cần kiểm tra, không âm thầm chuyển AND/bỏ indicator |
| N11 | Mở Học viện từ thư viện hoặc học đủ bài | Không Cấu hình ở sidebar Học viện, không auto ON/apply/run |
| N12 | Mini có 30 mã/24 tháng/60 phiên và số lần Mua | Backtest không nhận hạn mức đó, count closed khác buy_count; không cùng profile thoát |
| N13 | Nạp mẫu mới khi tài khoản Demo/Bot có vốn/vị thế | Không cấp lại 100 triệu, không tạo Bot V1 hoặc ghi fixture account |
| N14 | Chỉnh alert qua form từ OFF→ON; giữ nguồn/đổi tên | Resume khởi quan sát hiện tại, không phát dồn các phiên tạm dừng; event key cùng phiên không trùng |
| N15 | Chỉ đổi tên alert, sau đó mở event trước đó | Tên/bằng chứng lúc phát vẫn snapshot cũ; config/definition revision không viết ngược |
| N16 | Các chỉ báo N01 chạy same-close/next-open trên cùng input profile | Tính đúng thuật toán riêng, chart/KPI/bằng chứng khớp snapshot; không dùng RSI thay các bộ khác |

**Tổng: 138 ca nghiệm thu tích hợp.** Đây là yêu cầu AI dev thực hiện trên repository/môi trường được cấp quyền. Không dùng các kiểm tra HTML cục bộ ở mục 12 để xác nhận 138 ca này đã đạt.

---

## 14. Phụ thuộc cần xác minh và tiêu chí bàn giao

### 14.1. AI dev phải tự tìm trong repository

| Phụ thuộc | Cần xác minh | Không được làm khi chưa có bằng chứng |
|---|---|---|
| Nhánh/build/route thật | Stack đang chạy, component trang Chiến lược, API/service đang dùng | Chỉ sửa nhánh mẫu không được sử dụng rồi báo hoàn thành. |
| Shared config và grants | Nguồn duy nhất, quy tắc revision, quyền học, phiên hiệu lực | Tạo một config khác để UI chạy; tự bật từ trạng thái pass/demo. |
| Kỹ thuật | Registry, công thức, khởi tạo, biên, warmup, đơn vị và version | Tự sao chép công thức HTML thay hệ thống hoặc cho missing=0. |
| Backtest thực thi | Lịch, next-open, chế độ same-close, phí, lô, dữ liệu thanh toán/khóa bán | Tự bỏ khóa hai bar/đặt khóa mới; chọn một giả định rồi giấu trong engine. |
| Giá và sự kiện doanh nghiệp | Raw/adjusted, corporate actions, quote vs lịch sử, benchmark | Nhân chia sai đơn vị hoặc tính quyền lợi hai lần. |
| Báo cáo tài chính | Báo cáo riêng/hợp nhất, năm tài chính, kỳ riêng/lũy kế, ngày công bố/tiếp nhận, bản điều chỉnh | Dựng ngày công bố, áp năm dương cho mọi mã, lấy dữ liệu tương lai hoặc hồi cứu giả. |
| EPS và ROE | Cổ phiếu bình quân/điều chỉnh, loại EPS, phạm vi lợi nhuận/vốn, cách bình quân | Mặc định mọi mã có cổ phiếu cố định hoặc tự đổi phương pháp để khớp số mẫu. |
| Cảnh báo hiện tại | Scheduler, readiness dữ liệu, inbox/history, dedupe, phạm vi/phiên bản, catch-up khi worker lỗi | Coi nút scan cục bộ là đã có cảnh báo nền; gửi dồn tín hiệu quá khứ không được xác nhận. |
| Liên kết nguồn Bot | Service VN30, nguồn riêng, result/list snapshot, effective session và quyền chọn mã | Gửi mã client tự khai hoặc fallback nguồn khi lỗi; xóa/bán vị thế do thay nguồn. |
| 36 chỉ tiêu chưa có contract trong bộ này | Tìm registry đã duyệt, công thức, đơn vị, period policy, nguồn và readiness từng binding Phụ lục A | Tự điền công thức/period từ tên bài hoặc gắn 0/giá mẫu thành số liệu thật. |
| Lưu trữ | Saved runs, filters, list snapshot, pagination, owner, retention | Ghi kết quả chỉ ở client, lưu trang đầu thành toàn bộ, viết lại bằng dữ liệu latest. |
| Giới hạn/quyền | Chính sách gói, số mục lưu, khung ngày/khối lượng dữ liệu API, quyền deploy | Lấy các giới hạn minh họa 20 mục/9 mã/ngày mẫu làm chính sách sản phẩm thật. |

**Những điểm tài liệu chưa hỗ trợ chốt bằng số/hành vi production:** mô hình thanh toán của Backtest mới, exact fee/lot profile, biến thể tính/cơ sở báo cáo chưa có registry, chính sách job cảnh báo bù sau gián đoạn và mức bảo đảm provenance lịch sử. Giữ chúng là điểm cần xác minh. Nếu dự án không có hợp đồng tương ứng, báo đúng câu hỏi hẹp cần chủ sản phẩm quyết định; không mở lại các nguyên tắc đã chốt như kỳ riêng, không risk ẩn, snapshot và Bot độc lập.

Không yêu cầu chủ sản phẩm tự chỉ file/hàm/endpoint mà AI dev có thể tìm trong repository. Không yêu cầu thêm một bộ ZIP/README/spec cũ như điều kiện mặc định để bắt đầu. Phần đã đủ dữ liệu triển khai trước; phần thiếu cụ thể có trạng thái chặn nghiệm thu rõ ràng.

### 14.2. Trình tự thực hiện

1. Xác định đúng nguồn đang dùng; lập ma trận giữ/sửa/bổ sung/không nằm trong đợt này với bằng chứng đường dẫn/hàm.
2. Đối chiếu bố cục ba tab với HTML, tách hoàn toàn code/dữ liệu demo khỏi service thật.
3. Nối quyền/catalog/shared config; kiểm tra ON/OFF, draft/save/revision và dữ liệu hai phía độc lập.
4. Nâng cấp Backtest input/profile, kết quả snapshot, full history, chart/KPI, source chuyển sang Cảnh báo.
5. Triển khai/ánh xạ Bộ lọc với kỳ riêng, resolver báo cáo, provenance, thiếu dữ liệu/cache; nối Áp dụng danh mục/Về VN30 vào đúng service Bot với snapshot/pending/effective.
6. Nâng cấp Cảnh báo theo phiên bản ghim, phạm vi chọn, hai phía, trạng thái cuối phiên, lịch sử và chống trùng thực sự.
7. Migration/dry-run/backup; đối chiếu dữ liệu legacy và ảnh hưởng quyền. Không xóa hoặc đổi ý nghĩa cấu hình không map được.
8. Chạy test unit, integration và hồi quy; kiểm tra responsive bằng UI thật. Tách phần mock khỏi nguồn/feed/worker/database.
9. Chỉ deploy/bật job gửi thông báo ở môi trường đã được cấp quyền; báo rõ các cổng chưa qua.

### 14.3. Kết quả AI dev phải trả lại

**Code, migration và test trong repository**, kèm một báo cáo triển khai (có thể ngay trong câu trả lời) gồm:

- Hiện trạng: commit/build, component/service/bảng đã xác minh, những phần cũ có thể tái sử dụng.
- Thay đổi: file/hàm đã sửa, ma trận yêu cầu spec, cơ sở dữ liệu/profile/catalog và điều kiện hiệu lực.
- Bảo toàn dữ liệu: mapping legacy, số lượng đối chiếu, ngoại lệ, cutover và rollback.
- Kiểm thử: từng nhóm/ID ở mục 13, input, expected/actual, lệnh/môi trường, đã đạt/chưa chạy/bị chặn. Không chỉ đưa tỷ lệ pass không có bằng chứng.
- Phụ thuộc còn thiếu: nguồn báo cáo, profile thanh toán/phí/lô, quyền/job hoặc điểm chưa hỗ trợ; nói rõ cái gì chưa vận hành thật.

Đây là kết quả AI dev phải tạo khi làm, **không phải những file đầu vào bổ sung mà chủ sản phẩm phải chuẩn bị**.

### 14.4. Định nghĩa hoàn thành

Hoàn thành phần tích hợp khi ba tab chạy trên nền IQX thật với nguồn, quyền và lưu trữ đã xác minh; cấu hình Mua/Bán độc lập và dùng chung đúng; Cảnh báo ghim đúng phiên bản và không đặt lệnh/phát trùng; Backtest không có cơ chế thoát ẩn, chart/KPI/lịch sử khớp snapshot; Bộ lọc có kỳ riêng đúng công thức/nguồn, xử lý thiếu dữ liệu trung thực, lưu filter động khác list snapshot; áp nguồn mua/Về VN30 đúng phiên, không bán vị thế cũ hoặc tự cập nhật danh mục; dữ liệu cũ và Bot không bị thay đổi ngoài phạm vi. Readiness 36 chỉ tiêu chưa có contract phải được công khai, không nghiệm thu chúng như đã hoàn thiện.

**Không hoàn thành nếu chỉ đổi giao diện, xóa nhãn “giả lập”, bấm mẫu có kết quả hoặc đã đọc spec. Không được tuyên bố hiệu quả đầu tư từ số liệu giả lập.**

---

### 14.5. Các cổng nghiệm thu chưa được hai file tự chứng minh

| Cổng | Trách nhiệm dev | Trạng thái từ bộ bàn giao |
|---|---|---|
| Nguồn chung thật của Bot/Backtest | Tìm service và nối chung cùng registry/version | Chưa kết nối bởi HTML độc lập |
| Danh mục Bot/VN30 đúng phiên | Nối snapshot/apply/pending/effective và nguồn thành phần | Mẫu chỉ có fixture |
| Toàn bộ 16 thuật toán | Đối chiếu math/rule với Phụ lục B/C, engine/provider và lịch sử | Đã có mẫu tính cục bộ, chưa chứng nhận production |
| Chỉ tiêu Chương 3 | Nguồn báo cáo, EPS, ROE, kỳ/cutoff và provenance | Có contract/fixture, cần đối chiếu nguồn thật |
| 36 chỉ tiêu còn lại | Tìm registry/định nghĩa đã duyệt trong repo; thiếu thì nêu theo binding Phụ lục A | Chỉ tên/điểm mở, không tự lấp công thức |
| Lịch/thuế/phí/lô/thanh toán | Dùng profile thật có version, xác định khác biệt với simulator | Chưa xác minh giá trị thực |
| Worker Cảnh báo | Scheduler, readiness, dedupe, resume, catch-up và quyền kênh | Chỉ scan cục bộ minh họa |
| Sổ sách và quyền | Integration trên tài khoản có xác thực, nhiều thiết bị, migration | Không kiểm thử production bằng file này |

Không cần chờ biên soạn cả 71 bài để nối phần khung và những capability đã có nguồn. Nhưng không được đánh dấu một năng lực đã hoạt động chỉ vì đã dựng nút. Báo cáo cuối tách phần đã nối thật, phần mock đã thử, phần chưa kiểm thử và phần bị chặn cụ thể; không quay lại yêu cầu gửi nhiều spec cũ để hiểu quyết định đã được hợp nhất.

---

# Phụ lục A — Catalog công cụ và mapping Học viện

Catalog version: `iqx-academy-outline-13ch-71lessons-v1`. Hai bộ Bot/Học viện giữ toàn bộ 13 chương/71 bài; phụ lục này chỉ liệt kê các bài mở công cụ để nối Chiến lược, không viết giáo trình. IDs là nguồn mapping; tên hiện đúng catalog, không dùng tên làm khóa.

## A.1. 16 chỉ báo kỹ thuật

| Capability | Tên hiển thị | Bài mới | Bài legacy trong registry |
|---|---|---|---|
| `rsi` | RSI | `ch01-l01` | `ch01-l01` |
| `macd` | MACD | `ch01-l02` | `ch01-l02` |
| `ma` | MA / SMA | `ch01-l03` | `ch01-l03` |
| `bollinger` | Bollinger Bands | `ch01-l04` | `ch01-l04` |
| `volume` | Khối lượng | `ch01-l05` | `ch01-l05` |
| `ema` | EMA | `ch05-l01` | `ch05-l01` |
| `ma_cross` | MA Cross | `ch05-l02` | `ch05-l02` |
| `dmi` | DMI | `ch05-l03` | `ch05-l03` |
| `stochastic` | Stochastic | `ch05-l04` | `ch05-l05` |
| `cci` | CCI | `ch05-l05` | `ch05-l06` |
| `obv` | OBV | `ch07-l01` | `ch07-l04` |
| `mfi` | MFI | `ch07-l02` | `ch07-l05` |
| `cmf` | Chaikin Money Flow | `ch07-l03` | `ch07-l06` |
| `donchian` | Donchian Channel | `ch10-l01` | `ch11-l01` |
| `roc` | ROC | `ch10-l02` | `ch11-l04` |
| `williams_r` | Williams %R | `ch10-l03` | `ch11-l05` |

Riêng Stochastic, CCI, OBV, MFI, CMF, Donchian, ROC, Williams %R đã đổi vị trí. Không đồng nhất hai bài chỉ vì cùng `chXX-lYY`. Hợp lưu (`ch01-l06`) không có capability thứ 17. Các bài hướng dẫn Chương 2/4 không mở thêm chỉ báo/chỉ tiêu.

## A.2. 42 bài cơ bản và phạm vi định nghĩa

**Đây là metadata, không là 42 công thức mới.** Đối với 36 bài ngoài Chương 3, bộ này không tự chốt công thức, đơn vị, kỳ hoặc ngưỡng mặc định. Nguồn đã được duyệt trong repository có thể đã tồn tại: kiểm tra và nối khi đủ; nếu chưa có thì ghi rõ phần chờ và không cho condition không có contract chạy. Không mặc định toàn bộ 36 đã có hoặc đều chưa có trên IQX.

| Bài mới | Tên giữ nguyên | ID mẫu / mức đặc tả trong bộ này |
|---|---|---|
| `ch03-l01` | Tăng trưởng doanh thu YoY | `rev` — kỳ và cơ sở mẫu tại mục 7 |
| `ch03-l02` | Tăng trưởng LNST YoY | `profit` — kỳ và cơ sở mẫu tại mục 7 |
| `ch03-l03` | Tăng trưởng EPS YoY | `eps` — kỳ và cơ sở mẫu tại mục 7 |
| `ch03-l04` | Biên lợi nhuận gộp | `gm` — kỳ và cơ sở mẫu tại mục 7 |
| `ch03-l05` | Biên lợi nhuận ròng | `nm` — kỳ và cơ sở mẫu tại mục 7 |
| `ch03-l06` | ROE | `roe` — kỳ và cơ sở mẫu tại mục 7 |
| `ch06-l01` | ROA | Binding bài; definition/unit/period/source cần xác minh |
| `ch06-l02` | ROIC | Binding bài; definition/unit/period/source cần xác minh |
| `ch06-l03` | D/E — Nợ vay / Vốn chủ sở hữu | Binding bài; definition/unit/period/source cần xác minh |
| `ch06-l04` | Net Debt / EBITDA | Binding bài; definition/unit/period/source cần xác minh |
| `ch06-l05` | Current Ratio | Binding bài; definition/unit/period/source cần xác minh |
| `ch06-l06` | Interest Coverage | Binding bài; definition/unit/period/source cần xác minh |
| `ch08-l01` | CFO Margin | Binding bài; definition/unit/period/source cần xác minh |
| `ch08-l02` | CFO / LNST | Binding bài; definition/unit/period/source cần xác minh |
| `ch08-l03` | FCF Margin | Binding bài; definition/unit/period/source cần xác minh |
| `ch08-l04` | FCF Growth YoY | Binding bài; definition/unit/period/source cần xác minh |
| `ch08-l05` | Capex / Revenue | Binding bài; definition/unit/period/source cần xác minh |
| `ch08-l06` | Accrual Ratio | Binding bài; definition/unit/period/source cần xác minh |
| `ch09-l01` | P/E | Binding bài; definition/unit/period/source cần xác minh |
| `ch09-l02` | P/B | Binding bài; definition/unit/period/source cần xác minh |
| `ch09-l03` | P/S | Binding bài; definition/unit/period/source cần xác minh |
| `ch09-l04` | EV / EBITDA | Binding bài; definition/unit/period/source cần xác minh |
| `ch09-l05` | PEG | Binding bài; definition/unit/period/source cần xác minh |
| `ch09-l06` | FCF Yield | Binding bài; definition/unit/period/source cần xác minh |
| `ch11-l01` | Revenue CAGR 3Y | Binding bài; definition/unit/period/source cần xác minh |
| `ch11-l02` | Net Profit CAGR 3Y | Binding bài; definition/unit/period/source cần xác minh |
| `ch11-l03` | EPS CAGR 3Y | Binding bài; definition/unit/period/source cần xác minh |
| `ch11-l04` | Asset Turnover | Binding bài; definition/unit/period/source cần xác minh |
| `ch11-l05` | Cash Conversion Cycle | Binding bài; definition/unit/period/source cần xác minh |
| `ch11-l06` | Working Capital Turnover | Binding bài; definition/unit/period/source cần xác minh |
| `ch12-l01` | Revenue Growth Stability | Binding bài; definition/unit/period/source cần xác minh |
| `ch12-l02` | EPS Stability | Binding bài; definition/unit/period/source cần xác minh |
| `ch12-l03` | Margin Stability | Binding bài; definition/unit/period/source cần xác minh |
| `ch12-l04` | ROIC Stability | Binding bài; definition/unit/period/source cần xác minh |
| `ch12-l05` | FCF Positive Streak | Binding bài; definition/unit/period/source cần xác minh |
| `ch12-l06` | Profit Positive Streak | Binding bài; definition/unit/period/source cần xác minh |
| `ch13-l01` | Dividend Yield | Binding bài; definition/unit/period/source cần xác minh |
| `ch13-l02` | Payout Ratio | Binding bài; definition/unit/period/source cần xác minh |
| `ch13-l03` | Dividend Growth | Binding bài; definition/unit/period/source cần xác minh |
| `ch13-l04` | Share Count Growth | Binding bài; definition/unit/period/source cần xác minh |
| `ch13-l05` | Buyback Yield | Binding bài; definition/unit/period/source cần xác minh |
| `ch13-l06` | Shareholder Yield | Binding bài; definition/unit/period/source cần xác minh |

42 binding gồm bảy nhóm, mỗi nhóm sáu chỉ tiêu: Chương 3, 6, 8, 9, 11, 12, 13. Mapping chương cơ bản legacy: Chương 3→3, 6→6, 8→8, Định giá cũ10→9, tăng trưởng cũ12→11, ổn định cũ14→12, cổ đông cũ15→13. Chuyển theo nội dung/capability có chứng cứ, không chỉ thay số.

## A.3. Hợp đồng registry cơ bản tối thiểu

Mỗi factor khả dụng phải có ID/capability/bài, tên, unit và API scale, allowed operators, kiểu số/miền/bước, default/allowed periods, report scope/applicability, field mapping, công thức/calculation version, status của mẫu số/thiếu dữ liệu, provenance/cache và khả năng truy lại snapshot. Không có đơn vị thì không hiện dấu `%` mặc định cho mọi chỉ tiêu. Số dư cuối kỳ, tỷ số, số ngày, năm/streak và cửa sổ 3 năm không được gán chung policy quarter/ttm/year.

Renderer phải theo registry động; không hardcode đúng sáu để hạn chế sản phẩm sau khi gói chỉ tiêu khác được ghép, cũng không tạo 42 nút giả lúc contract chưa có.

---

# Phụ lục B — 16 bộ điều kiện và miền tham số

**Giữ cấu trúc của Bộ Bot v1.0, lấy từ `#registryData` của HTML đã duyệt; HTML Chiến lược mới nhúng cùng registry. Không phải giáo trình.** Mua/Bán dùng tham số riêng; mọi dòng của một phía kết hợp AND. Các dấu dưới là mẫu khởi đầu, đều thay được trong tập cho phép của dòng. Bật và chọn dấu là ý định người dùng, không tự bật từ mẫu.

Ký hiệu: `T` là phiên đang xét, `T−1` là phiên liền trước trong chuỗi hợp lệ. Nguồn series và seeding tại Phụ lục C dưới đây. Một giá trị thiếu không đạt phép so sánh hoặc phủ định. Tham số có kiểm tra miền/bước và ràng buộc liên trường từ registry; server tự giữ whitelist. Kiểu và field dưới đúng mẫu, không mở arbitrary expression editor.

## B01. RSI — `rsi`

Bài mới: `ch01-l01`, Chương 1. ID bài gốc trong registry: `ch01-l01` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ RSI | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |
| `level` | Ngưỡng RSI | 30 | 70 | Số; Mua 10–49; Bán 51–90; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | RSI_T−1 < level (= 30) | `>` / `<` |
| Mua / `r2` | RSI_T > RSI_T−1 | `>` / `<` |
| Bán / `r1` | RSI_T−1 > level (= 70) | `>` / `<` |
| Bán / `r2` | RSI_T < RSI_T−1 | `>` / `<` |

Ngưỡng của Mua/Bán trong mẫu có miền khác nhau. Giữ đúng form tham chiếu; việc đổi dấu không tự nới miền thành 0–100. Hai rule AND, không tự đổi thành RSI cắt qua ngưỡng.

## B02. MACD — `macd`

Bài mới: `ch01-l02`, Chương 1. ID bài gốc trong registry: `ch01-l02` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `fast` | Chu kỳ EMA nhanh | 12 | 12 | Số nguyên; 2–50; bước 1; đơn vị phiên |
| `slow` | Chu kỳ EMA chậm | 26 | 26 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `signal` | Chu kỳ đường tín hiệu | 9 | 9 | Số nguyên; 2–30; bước 1; đơn vị phiên |

Ràng buộc: `fast < slow`.

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | MACD_T > Signal_T | `>` / `<` |
| Bán / `r1` | MACD_T < Signal_T | `>` / `<` |

Điều kiện mặc định là MACD đang >/< Signal. Không đổi thành sự kiện cắt chỉ để giảm lặp tín hiệu; trạng thái vị thế xử lý tần suất lệnh.

## B03. MA / SMA — `ma`

Bài mới: `ch01-l03`, Chương 1. ID bài gốc trong registry: `ch01-l03` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ SMA | 20 | 20 | Số nguyên; 5–200; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > SMA_T | `>` / `<` |
| Bán / `r1` | Close_T < SMA_T | `>` / `<` |

## B04. Bollinger Bands — `bollinger`

Bài mới: `ch01-l04`, Chương 1. ID bài gốc trong registry: `ch01-l04` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ Bollinger | 20 | 20 | Số nguyên; 10–100; bước 1; đơn vị phiên |
| `k` | Hệ số dải | 2 | 2 | Số; 1–3.5; bước 0.1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T−1 < Lower_T−1 | `>` / `<` |
| Mua / `r2` | Close_T ∈ (Lower_T, Upper_T) — khoảng mở | `∈` / `∉` |
| Mua / `r3` | Close_T > Close_T−1 | `>` / `<` |
| Bán / `r1` | Close_T−1 > Upper_T−1 | `>` / `<` |
| Bán / `r2` | Close_T ∈ (Lower_T, Upper_T) — khoảng mở | `∈` / `∉` |
| Bán / `r3` | Close_T < Close_T−1 | `>` / `<` |

Mua so close trước với dải dưới trước; Bán với dải trên trước; close hiện tại ∈/∉ khoảng mở của cùng phía. Giữ đủ ba dòng, không rút còn chạm dải. Cấu hình dấu ít/không sinh lệnh không được engine tự sửa.

## B05. Khối lượng — `volume`

Bài mới: `ch01-l05`, Chương 1. ID bài gốc trong registry: `ch01-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `lookback` | Số phiên tham chiếu | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `mult` | Hệ số khối lượng | 1 | 1 | Số; 0.5–3; bước 0.1; đơn vị lần |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > Close_T−1 | `>` / `<` |
| Mua / `r2` | Volume_T > Ngưỡng_khối_lượng_T | `>` / `<` |
| Bán / `r1` | Close_T < Close_T−1 | `>` / `<` |
| Bán / `r2` | Volume_T > Ngưỡng_khối_lượng_T | `>` / `<` |

Ngưỡng mẫu = mult × trung bình lookback volume trước T; cả hai phía cùng dùng volume lớn hơn mẫu nhưng rule chiều giá khác nhau. Không chỉ dùng khối lượng để phân biệt hướng.

## B06. EMA — `ema`

Bài mới: `ch05-l01`, Chương 5. ID bài gốc trong registry: `ch05-l01` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ EMA | 20 | 20 | Số nguyên; 5–200; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > EMA_T | `>` / `<` |
| Bán / `r1` | Close_T < EMA_T | `>` / `<` |

## B07. MA Cross — `ma_cross`

Bài mới: `ch05-l02`, Chương 5. ID bài gốc trong registry: `ch05-l02` (chỉ dùng mapping legacy). Loại điều kiện: **sự kiện giao cắt**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `fast` | Chu kỳ SMA nhanh | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `slow` | Chu kỳ SMA chậm | 50 | 50 | Số nguyên; 10–250; bước 1; đơn vị phiên |

Ràng buộc: `fast < slow`.

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | SMA_fast_T > SMA_slow_T — giao cắt giữa T−1/T, không chỉ so sánh hiện tại | `>` / `<` |
| Bán / `r1` | SMA_fast_T < SMA_slow_T — giao cắt giữa T−1/T, không chỉ so sánh hiện tại | `>` / `<` |

`>`: fast_(T−1)≤slow_(T−1) và fast_T>slow_T; `<`: fast_(T−1)≥slow_(T−1) và fast_T<slow_T. Dùng cùng tham số phía đang xét; cả bốn giá trị phải hợp lệ.

## B08. DMI — `dmi`

Bài mới: `ch05-l03`, Chương 5. ID bài gốc trong registry: `ch05-l03` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ DMI | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | +DI_T > −DI_T | `>` / `<` |
| Bán / `r1` | +DI_T < −DI_T | `>` / `<` |

Chỉ +DI/−DI; công thức nội bộ dùng True Range không có nghĩa mở capability ATR/ADX hoặc tạo cắt lỗ.

## B09. Stochastic — `stochastic`

Bài mới: `ch05-l04`, Chương 5. ID bài gốc trong registry: `ch05-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `k` | Chu kỳ %K | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |
| `d` | Chu kỳ %D | 3 | 3 | Số nguyên; 2–20; bước 1; đơn vị phiên |
| `smooth` | Chu kỳ trung bình %K | 3 | 3 | Số nguyên; 1–10; bước 1; đơn vị phiên |
| `level` | Ngưỡng %K | 20 | 80 | Số; 0–100; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | %K_T < level (= 20) | `>` / `<` |
| Mua / `r2` | %K_T > %D_T | `>` / `<` |
| Bán / `r1` | %K_T > level (= 80) | `>` / `<` |
| Bán / `r2` | %K_T < %D_T | `>` / `<` |

%K sau smoothing, %D là trung bình của %K; hai dòng là trạng thái tại T. Ngưỡng người dùng khác mốc tham chiếu20/80 phải được nhận diện đúng.

## B10. CCI — `cci`

Bài mới: `ch05-l05`, Chương 5. ID bài gốc trong registry: `ch05-l06` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ CCI | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `level` | Ngưỡng CCI | -100 | 100 | Số; -300–300; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | CCI_T−1 < level (= -100) | `>` / `<` |
| Mua / `r2` | CCI_T > CCI_T−1 | `>` / `<` |
| Bán / `r1` | CCI_T−1 > level (= 100) | `>` / `<` |
| Bán / `r2` | CCI_T < CCI_T−1 | `>` / `<` |

## B11. OBV — `obv`

Bài mới: `ch07-l01`, Chương 7. ID bài gốc trong registry: `ch07-l04` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `baseline` | Chu kỳ SMA của OBV | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | OBV_T > SMA_OBV_T | `>` / `<` |
| Bán / `r1` | OBV_T < SMA_OBV_T | `>` / `<` |

Đường SMA là tham chiếu của chính OBV, không thêm một chiến lược SMA giá vào bài.

## B12. MFI — `mfi`

Bài mới: `ch07-l02`, Chương 7. ID bài gốc trong registry: `ch07-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ MFI | 14 | 14 | Số nguyên; 5–50; bước 1; đơn vị phiên |
| `level` | Ngưỡng MFI | 20 | 80 | Số; 0–100; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | MFI_T−1 < level (= 20) | `>` / `<` |
| Mua / `r2` | MFI_T > MFI_T−1 | `>` / `<` |
| Bán / `r1` | MFI_T−1 > level (= 80) | `>` / `<` |
| Bán / `r2` | MFI_T < MFI_T−1 | `>` / `<` |

## B13. Chaikin Money Flow — `cmf`

Bài mới: `ch07-l03`, Chương 7. ID bài gốc trong registry: `ch07-l06` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ CMF | 20 | 20 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `level` | Ngưỡng CMF | 0 | 0 | Số; -1–1; bước 0.01 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | CMF_T > level (= 0) | `>` / `<` |
| Bán / `r1` | CMF_T < level (= 0) | `>` / `<` |

Giá trị/level là tỷ số −1..1 trong form, không nhân100 khi so rule; step0,01.

## B14. Donchian Channel — `donchian`

Bài mới: `ch10-l01`, Chương 10. ID bài gốc trong registry: `ch11-l01` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ Donchian | 20 | 20 | Số nguyên; 5–252; bước 1; đơn vị phiên |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Close_T > Upper_T | `>` / `<` |
| Bán / `r1` | Close_T < Lower_T | `>` / `<` |

Mỗi phía dùng kênh N phiên trước T, không gồm T; không vô tình lấy max(high_T) rồi yêu cầu close_T>max đó.

## B15. ROC — `roc`

Bài mới: `ch10-l02`, Chương 10. ID bài gốc trong registry: `ch11-l04` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ ROC | 20 | 20 | Số nguyên; 2–252; bước 1; đơn vị phiên |
| `level` | Ngưỡng ROC | 5 | -5 | Số; -100–100; bước 0.1; đơn vị % |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | ROC_T > level (= 5) | `>` / `<` |
| Bán / `r1` | ROC_T < level (= -5) | `>` / `<` |

ROC và level đều dùng đơn vị phần trăm: level5 nghĩa5%, không0,05. Chu kỳ2 là miền thấp nhất của mẫu.

## B16. Williams %R — `williams_r`

Bài mới: `ch10-l03`, Chương 10. ID bài gốc trong registry: `ch11-l05` (chỉ dùng mapping legacy). Loại điều kiện: **trạng thái/so sánh**.

| Tham số | Nhãn | Mua mẫu | Bán mẫu | Kiểu, miền và bước |
|---|---|---:|---:|---|
| `period` | Chu kỳ Williams %R | 14 | 14 | Số nguyên; 5–100; bước 1; đơn vị phiên |
| `level` | Ngưỡng Williams %R | -80 | -20 | Số; -100–0; bước 1 |

| Phía / rule | Điều kiện mẫu | Dấu cho phép |
|---|---|---|
| Mua / `r1` | Williams%R_T−1 < level (= -80) | `>` / `<` |
| Mua / `r2` | Williams%R_T > Williams%R_T−1 | `>` / `<` |
| Bán / `r1` | Williams%R_T−1 > level (= -20) | `>` / `<` |
| Bán / `r2` | Williams%R_T < Williams%R_T−1 | `>` / `<` |

Thang giá trị/level −100..0; không dùng ngưỡng30/70 của RSI.

Không thêm Hợp lưu thành capability thứ17. Các năng lực kỹ thuật đã bỏ khỏi phạm vi mới: ADX; ATR; ATR Percent; Relative Volume; Bollinger BandWidth; N-day High; N-day Low; Khoảng cách tới đỉnh52 tuần; Gap; Keltner Channel; Parabolic SAR; Khoảng cách tới hỗ trợ; Khoảng cách tới kháng cự; Relative Strength vs VN-Index; Relative Strength vs ngành; Advance/Decline Line; % cổ phiếu trên MA50; New High–New Low; VN-Index vs MA200. Dữ liệu legacy chỉ để đọc/mapping, không dựng lại các nút khóa tương ứng trong catalog mới.

---

# Phụ lục C — Chuỗi chỉ báo, tương đương tính toán và điểm tìm trong HTML

Phần này giữ biến thể tham chiếu của bộ Bot mới để tránh ba engine dùng ba cách khác nhau. **Chưa khẳng định tương đương provider/engine IQX**; dev phải đối chiếu input, seed, warmup, đơn vị, adjustment và result với repository. Khác biệt chưa có quyết định không được âm thầm sửa bài giảng hoặc lịch sử để cho số trùng.

## C.1. Quy ước tham chiếu tính chuỗi trong mẫu

C = close, H/L = high/low, V = volume, TP = (H+L+C)/3; N là chu kỳ; cửa sổ có/không T phải đúng từng dòng.

| Chỉ báo | Biến thể được dùng trong HTML, cần đối chiếu trước production |
|---|---|
| SMA | Trung bình N close, gồm T; đủ N số hợp lệ mới có giá trị. |
| EMA | Hạt giống là SMA của N quan sát đầu liên tục; sau đó alpha=2/(N+1). Mẫu reset seed khi thiếu dữ liệu. |
| RSI | Wilder: trung bình N mức tăng/giảm đầu, rồi smoothing 1/N; `100 × avg_gain/(avg_gain+avg_loss)`. Tổng hai trung bình bằng 0 → null. |
| MACD | EMA nhanh − EMA chậm; Signal là EMA của MACD; Histogram=MACD−Signal. |
| Bollinger | SMA_N(close) ± k × độ lệch chuẩn; mẫu chia phương sai cho N, gồm T. |
| Khối lượng | Ngưỡng `mult × trung bình V của N phiên trước T`, không gồm V_T; thêm rule chiều giá đã ghi. |
| MA Cross | Hai SMA riêng; đánh giá sự kiện giữa T−1/T, không chỉ vị trí hiện tại. |
| DMI | +DM/−DM theo thay đổi high/low, chọn phần dương lớn hơn, bằng nhau cho 0; True Range dùng close trước; làm mượt Wilder 1/N; +DI/−DI = 100 × DM đã mượt/TR đã mượt. Không thêm ADX. |
| Stochastic | Raw %K=100×(C−Low_N)/(High_N−Low_N), gồm T; SMA theo smooth tạo %K; SMA theo d tạo %D. Biên bằng nhau → null. |
| CCI | `(TP−SMA_N(TP))/(0.015×mean absolute deviation trong N TP)`, gồm T; độ lệch bằng 0 → null. |
| OBV | Bắt đầu 0; cộng V khi close tăng, trừ khi giảm, giữ khi bằng; baseline SMA của chuỗi OBV, gồm T. |
| MFI | Phân positive/negative TP×V theo TP tăng/giảm; tổng N dòng hợp lệ; `100×positive/(positive+negative)`; tổng bằng 0 → null. |
| CMF | Tổng `[(2C−H−L)/(H−L)]×V` trong N phiên / tổng V trong N phiên; mẫu H=L → null và cửa sổ có null không được cho qua. |
| Donchian | Upper=max high, Lower=min low của N phiên **trước T**, không gồm T; tính riêng cửa sổ Mua/Bán. |
| ROC | `(C_T/C_(T−N)−1)×100`, mẫu yêu cầu close gốc dương; unit giá trị là %. |
| Williams %R | `−100×(High_N−C)/(High_N−Low_N)`, cửa sổ gồm T; High_N=Low_N → null. |

Chuỗi có missing phải được xử lý theo contract đã được xác minh. Đặc biệt không sao `undefined` hoặc 0 của mock thành giá trị hợp lệ. Không dùng sáu tháng chart làm giới hạn dữ liệu khởi tạo; N tối đa 252 hoặc chuỗi EMA nhiều tầng có thể cần thêm dữ liệu. Cách lấy dữ liệu warmup phải được ghi version và đủ cho tham số mà form cho phép.

## C.2. Các điểm cần đối chiếu khi dùng bản mới

MACD chỉ so giá trị với Signal theo phép `>`/`<`, không tự giao cắt. MA Cross là sự kiện qua hai phiên. RSI giữ đúng hai rule về phiên trước/ngưỡng và chiều thay đổi; không chuyển thành RSI cắt 30/70. DMI chỉ +DI/−DI, không thêm ADX. OBV dùng SMA của chính OBV, không phải SMA giá. Donchian dùng N phiên trước T. Khoảng Bollinger mở; thiếu giá/biên thì ∉ không đạt. Các quy tắc này cùng phía phải dùng một bộ params của snapshot.

**Khác biệt source cũ cần nhìn thấy:** HTML Chiến lược cũ trả RSI=50 khi avg gain/loss cùng bằng 0; bản mới theo biến thể Bot giữ null. Không dùng việc cập nhật mẫu làm lý do tính lại các run lịch sử, và chưa coi thay đổi này tự xác nhận provider đang dùng null. Đối chiếu engine, quyết định version và lưu bằng chứng trước production.

HTML Chiến lược chỉ cần chart lợi nhuận danh mục đã duyệt, không bắt thêm nến và pane của cả 16 chỉ báo vào Backtest. Các bộ chuỗi vẫn cần để tín hiệu, lịch sử và bằng chứng đúng. Chart giảng dạy và chart mini thuộc các bộ khác.

## C.3. Điểm tìm trong HTML bàn giao

| Chức năng | Điểm tìm |
|---|---|
| Registry/catalog | `script#registryData`, `script#catalogData`, `script#fundCatalogData`, `FACTORS` |
| Khung ba tab | `.top-tabs`, `.workbench`, `.library`, `.main`, `setTab` |
| Quyền mẫu / render thư viện | `indicatorAllowed`, `factorAllowed`, `configAccess`, `renderTech`, `renderFundLibrary` |
| Cấu hình hai phía | `openConfig`, `renderConfigDialog`, `configCommit`, `removeTech`, `scheduleConfig` |
| Tính tín hiệu | `calcSeries`, `computeSeries`, `resolveOperand`, `ruleCheck`, `signal` |
| Backtest | `simulate`, `runBacktest`, `renderResult`, `drawChart`, `tradeDetails` |
| Kỳ dữ liệu, provenance | `resolveMetric`, `periodFor`, `companyView`, `metricDetailBody` |
| Filter và chọn mã | `renderFilterRows`, `matchedCompanies`, `renderCompanies`, `captureFilterSelection` |
| Lưu snapshot | `askName`, `confirmName`, `openSaved`, `loadSaved`, `deleteSaved` |
| Áp nguồn Bot | `openApply`, `commitApply`, `renderBotSource`, `viewBotSource` |
| Về VN30/hiệu lực | `requestVN30`, `confirmVN30`, `cancelPendingSource`, `advancePreviewSession` |
| Cảnh báo | `openAlert`, `saveAlert`, `scanAlerts`, `toggleAlert`, `eventDetails` |
| Chỉ minh họa, không backend | `freshState`, `seedExamples`, `MARKET`, `FINANCIAL_DEMO`, `freshBotLink`, `previewVN30`, `nextMockSession`, `localStorage`, `IQX_PREVIEW` |

Tên hàm chỉ giúp tìm trong HTML. Không bắt repository dùng đúng tên bảng, route hoặc framework đó. Schema sample `master_enabled` và `buy/sell.rules` là dạng adapter tương đương với `master`/`ops` của Bot HTML; production phải chuẩn hóa về **cùng record/AST có version**, không để mỗi frontend tạo một configuration store.

---

**HẾT SPEC BỘ CHIẾN LƯỢC — v1.0.** Gửi `IQX-Bo-Chien-Luoc-SPEC-v1.0.md` cùng `IQX-Bo-Chien-Luoc-MAU-v1.0.html` cho AI dev. Không cần README, ZIP, JSON hoặc nguồn cũ làm đầu vào bắt buộc. Bộ này không chứa toàn văn bài học và không thay thế quyền truy cập repository/dữ liệu/lịch thực.
