/**
 * Nội dung “NHÌN LẠI” của Kết sổ Cấp 0 (spec §5).
 *
 * Cấp 0 chưa có cắt lỗ/chốt lời, vì vậy coach chỉ dựa vào kết quả lãi hay
 * không lãi. Chuỗi giữ marker `**...**`; modal chuyển marker thành <strong>.
 */
export interface CoachSituation {
  pnlPositive: boolean
}

function profitable(orderNo: number): string {
  return `Lệnh ${orderNo} khép trọn vòng đời: mua — nắm giữ — theo dõi — bán — và giờ là nhìn lại. Lệnh lãi. Điều đáng giá hơn con số: **bạn đã đi đủ một vòng giao dịch hoàn chỉnh** — nhiều người mua cổ phiếu còn không biết mình đang nắm gì. Chú ý dòng thuế bán 0,1% — bán luôn tốn thêm một khoản, mua bán liên tục là phí + thuế ăn dần tài khoản.`
}

function unprofitable(orderNo: number): string {
  return `Lệnh ${orderNo} lỗ nhẹ — nhưng đây là Sân tập, tiền không thật, và bạn vừa đi trọn một vòng giao dịch. **Cái bạn thu được là kinh nghiệm, không phải con số.** Ở Cấp 1 bạn sẽ học chọn lý do mua có cơ sở; Cấp 2 học đặt cắt lỗ/chốt lời để biết khi nào nên thoát. Chú ý dòng thuế bán 0,1%.`
}

export function coachTemplate(situation: CoachSituation, orderNo = 1): string {
  return situation.pnlPositive ? profitable(orderNo) : unprofitable(orderNo)
}
