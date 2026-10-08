/**
 * Marketing copy for the retired seven-level "Hành trình" path. The workspace no
 * longer reads or enforces levels; the introduction page is the only consumer.
 */
export const LEVELS = [
  { name: "Nhập môn", skill: "Làm quen với một vòng mua, theo dõi và bán cổ phiếu.", tasks: [{ no: 1, label: "Lệnh đầu tiên, nắm giữ và theo dõi", panel: "trading" }, { no: 5, label: "Bán và hoàn thành kết sổ đầu tiên", panel: "portfolio" }] },
  { name: "Học việc", skill: "Mỗi quyết định mua đều bắt đầu từ một kế hoạch.", tasks: [{ no: 1, label: "Lệnh đầu tiên có kế hoạch", panel: "trading" }, { no: 2, label: "Kết sổ đầu tiên", panel: "portfolio" }, { no: 3, label: "Trải nghiệm đủ 4 lý do mua", panel: "trading" }, { no: 4, label: "3 lệnh được AI ủng hộ", panel: "trading" }, { no: 5, label: "10 lệnh thực chiến", panel: "trading" }] },
  { name: "Kỷ luật", skill: "Xác định cắt lỗ và chốt lời trước khi đặt lệnh.", tasks: [{ no: 1, label: "10 lệnh có cắt lỗ và chốt lời", panel: "trading" }] },
  { name: "Bản lĩnh", skill: "Phân bổ vốn theo khẩu vị rủi ro và mức độ tự tin.", tasks: [{ no: 1, label: "Thực hành quản lý vốn qua 10 lệnh", panel: "trading" }, { no: 2, label: "Trải nghiệm đủ 3 mức tự tin", panel: "trading" }] },
  { name: "Thuần thục", skill: "Đọc đủ bốn lớp thông tin trước khi quyết định.", tasks: [{ no: 1, label: "10 lệnh đọc đủ 4 lớp", panel: "trading" }] },
  { name: "Lão luyện", skill: "Chủ động tìm cơ hội và theo dõi trước khi mua.", tasks: [{ no: 1, label: "Săn 10 mã vào danh sách theo dõi", panel: "hunt" }, { no: 2, label: "Mua 5 mã từ danh sách đã săn", panel: "trading" }] },
  { name: "Bậc thầy", skill: "Nhận diện mâu thuẫn và hành động nhất quán.", tasks: [{ no: 1, label: "3 lần xử lý mâu thuẫn nhất quán", panel: "trading" }] },
] as const
