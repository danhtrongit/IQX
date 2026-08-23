import type { TourConfig } from "../tourTypes"

/**
 * **Tour «Xử lý mâu thuẫn» — tour thứ NĂM của hệ** (spec `demo-trading/LEVEL 6/
 * IQX-Tour-MauThuan.md`, `IQX-Cap6-Spec.md` §10). 7 bước, đúng thứ tự và đúng
 * chữ của file tour: giới thiệu → bảng 2 phe → lớp phủ quyết → tự nhận định →
 * hành động tương xứng → nút không mua → nhìn lại.
 *
 * Chạy trên engine `features/tour/` có sẵn (`useTour` + `TourOverlay`), gắn vào
 * `features/cap6/MauThuanBlock.tsx` (nơi có nút "?" và cờ tự-bật-một-lần).
 *
 * ─── NEO TỪNG BƯỚC VÀO ĐÚNG PHẦN TỬ CÓ THẬT ─────────────────────────────────
 * Bước 1/2/4 neo vào phần tử của chính khối mâu thuẫn. Bước 3 neo vào tag
 * `PHỦ QUYẾT` — nó CHỈ tồn tại khi lệnh đang xét thật sự có lớp phủ quyết xấu;
 * file tour ghi nhận đúng điều này ("Bước 2-3 chỉ hiện được khi lệnh đang xét CÓ
 * mâu thuẫn thật"), và engine đã có đường lùi target-không-thấy → bong bóng giữa
 * màn (`TourOverlay.resolveTarget`), nên chữ của bước đó được viết để đọc trôi
 * cả khi tag vắng (mô tả khung phân loại, không nói "cái đang hiện đây").
 *
 * Bước 5 neo vào khối Quản lý vốn của Cấp 3 (`tour-cap6-khoiluong`) và bước 6
 * vào nút «Không mua lần này» — cả hai nằm NGOÀI khối này nhưng trong cùng panel;
 * engine tìm theo `data-tour-id` trên toàn document nên không cần truyền gì.
 *
 * Bước 7 neo vào nút «Hành trình» của thanh công cụ phải qua `targetSelector`
 * `#toolbar-journey` — `RightToolbar` tự đặt `id={`toolbar-${item.id}`}` cho mọi
 * nút, nên KHÔNG phải sửa một component dùng chung chỉ để thêm thuộc tính tour.
 * ★ Chữ của bước 7 nói về Kết sổ + Phân tích danh mục ở dạng QUY TRÌNH ("sau mỗi
 * lệnh…"), không trỏ vào một nút cụ thể — vì màn Phân tích danh mục là một panel
 * khác, không có mặt trong DOM lúc tour chạy.
 *
 * ★ Tour này KHÔNG phải cổng tốt nghiệp (spec §10: "tour là công cụ học, KHÔNG
 * phải điều kiện lên cấp"). Cổng Cấp 6 là hai con số hành vi
 * (`so_lan_xu_ly_nhat_quan` / `so_lan_xu_ly_veto_nhat_quan`), nên lỗ gian lận
 * "Bỏ qua tour = đạt nhiệm vụ" (engine `useTour.skip()` gọi thẳng `onComplete`)
 * không thể xảy ra ở đây. `MauThuanBlock` vẫn phân biệt hai đường: chỉ đi HẾT 7
 * bước mới `POST /cap6/tour-mauthuan`, "Bỏ qua" thì không.
 */
export const mauThuanTour: TourConfig = {
  name: "mauthuan",
  steps: [
    {
      targetId: "tour-cap6-toancanh",
      tang: "MÂU THUẪN",
      title: "Khi các lớp không cùng chiều",
      body: "Đến giờ bạn quen với những mã mà các lớp đồng thuận. Thực tế khó hơn: nhiều mã có lớp tốt lẫn lớp xấu. Cấp 6 dạy bạn xử lý khi 5 lớp mâu thuẫn nhau.",
      placement: "below",
    },
    {
      targetId: "tour-cap6-bang",
      tang: "HAI PHE",
      title: "Nhìn rõ hai phe",
      body: "Khi có lớp ủng hộ mạnh và lớp ngược chiều cùng lúc, IQX tách rõ hai phe để bạn thấy mâu thuẫn nằm ở đâu — thay vì chỉ một con số đồng thuận chung chung.",
      placement: "below",
    },
    {
      targetId: "tour-cap6-phuquyet",
      tang: "PHỦ QUYẾT",
      title: "Không phải lớp nào cũng ngang nhau",
      body: "Một số lớp có 'quyền phủ quyết': 📰 Tin tức và 👤 Nội bộ. Khi chúng ở mức rất xấu (hủy niêm yết, gian lận, lãnh đạo bán tháo), chúng có thể phủ định cả tín hiệu kỹ thuật đẹp nhất. Các lớp còn lại chỉ là điểm trừ — xấu thì bớt hấp dẫn, không phủ định.",
      placement: "below",
    },
    {
      targetId: "tour-cap6-nhandinh",
      tang: "TỰ ĐỌC",
      title: "Tự đọc trước",
      body: "Bạn tự đánh giá mức độ mâu thuẫn: nhẹ, đáng ngại, nghiêm trọng, hay chưa rõ. Đây là nhận định của riêng bạn — IQX ghi lại để sau này bạn nhìn lại xem mình đọc có chuẩn không.",
      placement: "below",
    },
    {
      targetId: "tour-cap6-khoiluong",
      tang: "TƯƠNG XỨNG",
      title: "Để hành động khớp với nhận định",
      body: "Điều quan trọng nhất của Cấp 6: nếu bạn thấy mâu thuẫn nghiêm trọng, hãy để khối lượng phản ánh điều đó — mua ít lại, hoặc không mua. Đắn đo trong đầu mà tay vẫn mua lớn là cái bẫy tâm lý phổ biến nhất.",
      placement: "below",
    },
    {
      targetId: "tour-cap6-khongmua",
      tang: "ĐỨNG NGOÀI",
      title: "Đôi khi không mua là nước đi tốt nhất",
      body: "Nếu lớp phủ quyết quá xấu, bạn có thể chọn 'Không mua lần này'. IQX ghi nhận quyết định đứng ngoài của bạn như một hành động có kỷ luật — và Phân tích danh mục sẽ cho thấy bạn tôn trọng nhận định của mình đến đâu.",
      placement: "below",
    },
    {
      targetSelector: "#toolbar-journey",
      tang: "NHÌN LẠI",
      title: "Nhìn lại để trưởng thành",
      body: "Sau mỗi lệnh, Kết sổ và Phân tích danh mục sẽ soi: nhận định của bạn có khớp hành động không, và bản năng đọc mâu thuẫn của bạn có chuẩn không. Đó là cách bạn thành nhà đầu tư bậc thầy.",
      placement: "left",
    },
  ],
}
