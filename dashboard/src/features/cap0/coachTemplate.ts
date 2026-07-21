/**
 * Cấp 0 debrief ("Kết sổ") coach block (spec §5) — rule-based, NOT AI: picks
 * exactly 1 of 4 verbatim templates from the situation of the just-closed
 * order. `**...**` marks the spec's own emphasis; `DebriefModal` renders it
 * bold via a tiny inline splitter rather than stripping it.
 */

export interface CoachSituation {
  /** Lệnh lãi (giá ra > giá vào). */
  pnlPositive: boolean
  /** Giá ra chạm/vượt ngưỡng cắt lỗ kế hoạch. */
  hitSL: boolean
  /** Giá ra chạm/vượt mục tiêu chốt lời kế hoạch. */
  hitTP: boolean
}

/** A. Lệnh lãi, không chạm SL, không chạm TP (bán tay khi đang lãi). */
function templateA(orderNo: number): string {
  return `Lệnh ${orderNo} khép trọn vòng đời: vào có kế hoạch — theo dõi — thoát — và giờ là nhìn lại. Lệnh lãi nhẹ. Điều đáng giá hơn: **bạn đã đi đủ quy trình mà phần lớn người mua cổ phiếu bỏ qua.** Chú ý dòng thuế bán 0,1% — bán luôn tốn thêm một khoản, mua bán liên tục là phí + thuế ăn dần tài khoản.`
}

/** B. Lệnh lãi, chạm TP. */
function templateB(): string {
  return `Kế hoạch chốt lời chạm đúng mục tiêu — đây là dạng lệnh sạch nhất: bạn đặt ra một đích, thị trường trả đúng đích đó. **Không phải lúc nào cũng vậy, nhưng khi vậy, hãy ghi lại như một mẫu chuẩn để nhớ.** Chú ý dòng thuế bán 0,1%.`
}

/** C. Lệnh lỗ, chạm SL. */
function templateC(): string {
  return `Cắt lỗ đúng kế hoạch — **đây không phải thất bại, đây là kỷ luật.** Người mới hay giữ lệnh lỗ chờ hòa vốn, để lỗ 5% thành lỗ 20%. Bạn đã làm ngược lại: bảo toàn vốn để đánh trận sau. Chú ý dòng thuế bán 0,1%.`
}

/** D. Lệnh lỗ, không chạm SL (bán tay khi đang lỗ). */
function templateD(): string {
  return `Bán khi chưa chạm cắt lỗ — có thể là quyết định đúng (thấy thông tin mới), có thể là hoảng loạn. **Cấp 2 «Kỷ luật» sẽ dạy bạn phân biệt hai điều này.** Hiện tại, ghi nhớ: mỗi lần bán trước kế hoạch nên có lý do rõ ràng.`
}

/**
 * Chọn 1 trong 4 đoạn coach (spec §5) theo tình huống lệnh vừa Kết sổ.
 * `orderNo` (mặc định 1) chỉ được dùng trong template A ("Lệnh {số} khép trọn
 * vòng đời...") — 3 template còn lại không tham chiếu số lệnh.
 */
export function coachTemplate(situation: CoachSituation, orderNo = 1): string {
  const { pnlPositive, hitTP, hitSL } = situation
  if (pnlPositive) return hitTP ? templateB() : templateA(orderNo)
  return hitSL ? templateC() : templateD()
}
