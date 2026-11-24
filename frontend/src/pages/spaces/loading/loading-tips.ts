import type { SpaceRoom } from "./loading-helpers.ts"

export const DEFAULT_STAGE_TEXT: Record<SpaceRoom, string> = {
  floor: "Đang dựng sàn giao dịch",
  office: "Đang chuẩn bị văn phòng nhóm",
}

export const FLOOR_TIPS: readonly string[] = [
  "Nhấn E để tương tác với Thần Tài, bảng điện hoặc tượng vinh danh",
  "Khấn Thần Tài trước 11:30 mỗi ngày để gieo quẻ đón lộc đầu phiên",
  "Nhấn chuột vào sàn để đi hoặc dùng phím WASD và mũi tên",
  "Cuộn chuột để phóng to, thu nhỏ góc nhìn toàn Khu Giao Dịch",
  "Dùng nút Gáy hoặc Tán lộc ở thanh trái để khuấy động không khí sàn",
  "Đi qua cửa Văn phòng khi muốn ghé thăm không gian làm việc của nhóm",
]

export const OFFICE_TIPS: readonly string[] = [
  "Chạm vào bàn của bạn hoặc nhấn E để xem nhiệm vụ hôm nay",
  "Điểm danh đúng giờ trước 08:30 từ Thứ Hai đến Thứ Sáu",
  "Cuộn chuột để phóng to, thu nhỏ và nhấn chuột để di chuyển trong phòng",
  "Ghé bàn Phòng Họp để xem lịch họp và biên bản thảo luận của nhóm",
  "Hoàn thành nhiệm vụ đều đặn để tích luỹ điểm thưởng mỗi tháng",
  "Đi qua cửa chính bất cứ lúc nào để quay lại Khu Giao Dịch",
]

export function getRoomTips(room: SpaceRoom): readonly string[] {
  return room === "office" ? OFFICE_TIPS : FLOOR_TIPS
}

export type FloorTickerTone = "up" | "ref" | "gold"

export interface FloorTickerItem {
  code: string
  label: string
  tone: FloorTickerTone
}

/**
 * Decorative ticker labels inspired by BẢNG ĐIỆN VN30 on the trading floor.
 * Uses real index/blue-chip symbols without fabricated prices.
 */
export const FLOOR_TICKER_ITEMS: readonly FloorTickerItem[] = [
  { code: "VN-INDEX", label: "SÀN CHÍNH", tone: "up" },
  { code: "VN30", label: "BẢNG ĐIỆN", tone: "gold" },
  { code: "FPT", label: "CÔNG NGHỆ", tone: "up" },
  { code: "VCB", label: "NGÂN HÀNG", tone: "up" },
  { code: "HPG", label: "VẬT LIỆU", tone: "ref" },
  { code: "MWG", label: "BÁN LẺ", tone: "up" },
  { code: "TCB", label: "TÀI CHÍNH", tone: "up" },
  { code: "VNM", label: "TIÊU DÙNG", tone: "ref" },
  { code: "SSI", label: "CHỨNG KHOÁN", tone: "gold" },
  { code: "VIC", label: "BẤT ĐỘNG SẢN", tone: "up" },
]
