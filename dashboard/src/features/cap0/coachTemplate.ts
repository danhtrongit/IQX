/**
 * Cấp 0 debrief ("Kết sổ") coach block (spec v3.0 §5) — rule-based, NOT AI:
 * picks exactly 1 of **2** verbatim templates from the situation of the
 * just-closed order. `**...**` marks the spec's own emphasis; `DebriefModal`
 * renders it bold via a tiny inline splitter rather than stripping it.
 *
 * ## Why only two (was five)
 *
 * v2.2 had templates A-D keyed on whether the exit hit the user's cắt lỗ /
 * chốt lời, plus an "E" added later for the case where no ngưỡng was recorded.
 * v3.0 removes cắt lỗ/chốt lời from Cấp 0 **entirely** (preamble, §0, §8,
 * §13), so there is no threshold to compare against and every one of C/D/E
 * would now assert something about a plan the user was never asked for — E
 * even told them to "gõ ngưỡng cắt lỗ ngay trong màn đặt lệnh", a field Cấp 0
 * no longer has. §5 replaces all of it with one bit: lãi or không-lãi.
 */

export interface CoachSituation {
  /** Lệnh lãi (giá ra > giá vào). */
  pnlPositive: boolean
}

/** A. Lệnh lãi — verbatim spec §5. */
function templateA(orderNo: number): string {
  return `Lệnh ${orderNo} khép trọn vòng đời: mua — nắm giữ — theo dõi — bán — và giờ là nhìn lại. Lệnh lãi. Điều đáng giá hơn con số: **bạn đã đi đủ một vòng giao dịch hoàn chỉnh** — nhiều người mua cổ phiếu còn không biết mình đang nắm gì. Chú ý dòng thuế bán 0,1% — bán luôn tốn thêm một khoản, mua bán liên tục là phí + thuế ăn dần tài khoản.`
}

/**
 * B. Lệnh lỗ — verbatim spec §5.
 *
 * Also the branch for an exactly-break-even round trip: `pnlPositive` is
 * `pnlVnd > 0`, and §5 only gives two templates. B is the safe side of that
 * boundary — it makes no claim about the size of the loss beyond the spec's
 * own "lỗ nhẹ", and its point ("cái bạn thu được là kinh nghiệm") holds either
 * way, whereas A's "Lệnh lãi." would be a false statement at break-even.
 */
function templateB(orderNo: number): string {
  return `Lệnh ${orderNo} lỗ nhẹ — nhưng đây là Sân tập, tiền không thật, và bạn vừa đi trọn một vòng giao dịch. **Cái bạn thu được là kinh nghiệm, không phải con số.** Ở Cấp 1 bạn sẽ học chọn lý do mua có cơ sở; Cấp 2 học đặt cắt lỗ/chốt lời để biết khi nào nên thoát. Chú ý dòng thuế bán 0,1%.`
}

/**
 * Chọn 1 trong 2 đoạn coach (spec v3.0 §5) theo lãi/lỗ của lệnh vừa Kết sổ.
 * `orderNo` (mặc định 1) là số "{số}" trong cả hai template.
 */
export function coachTemplate(situation: CoachSituation, orderNo = 1): string {
  return situation.pnlPositive ? templateA(orderNo) : templateB(orderNo)
}
