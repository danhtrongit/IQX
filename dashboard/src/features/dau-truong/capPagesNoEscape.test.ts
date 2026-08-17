import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * ★★ MỘT BÀI CANH CHUNG CHO CẢ CHÍN SHELL CẤP.
 *
 * Chín `Cap*TradingPage.tsx` là bản sao chép nguyên khối của nhau: cùng
 * `TrialBanner`/`Header`/`MarketBar`, cùng modal «AI Phân tích» của
 * `RightToolbar`. Nên một lối thoát tìm thấy ở một file gần như chắc chắn có
 * mặt ở tám file kia — và một bản vá chỉ ở file đang mở sẽ để nguyên tám lỗ.
 *
 * Bài này đọc THẲNG mã nguồn thay vì render (mỗi trang kéo theo cả một cây
 * provider + query + TradingView), và nó là thứ giữ lời hứa "mở cấp sau không
 * phải nhớ lại": thêm `Cap9TradingPage` mà quên hai prop là đỏ ngay.
 *
 * ★★ **KHÔNG có danh sách miễn trừ.** Bản trước có `KNOWN_UNPATCHED = new
 * Set([3])` loại Cấp 3 khỏi cả năm bài, kèm một bài khẳng định NGƯỢC
 * (`expect(stillBroken).toBe(true)`) — nên suite xanh CHÍNH VÌ lỗ hổng còn đó,
 * và người vá đúng sẽ làm CI đỏ. Một bài canh không bao giờ được thưởng cho
 * việc lỗi vẫn còn: nếu một cấp chưa vá được, để bài ĐỎ.
 */

const ROOT = `${process.cwd()}/src/features`

/** Chín shell cấp, theo đúng thứ tự cấp — TẤT CẢ đều bị canh, không trừ cấp nào. */
const CAP_PAGES = [
  { cap: 0, path: `${ROOT}/cap0/Cap0TradingPage.tsx` },
  { cap: 1, path: `${ROOT}/cap1/Cap1TradingPage.tsx` },
  { cap: 2, path: `${ROOT}/cap2/Cap2TradingPage.tsx` },
  { cap: 3, path: `${ROOT}/cap3/Cap3TradingPage.tsx` },
  { cap: 4, path: `${ROOT}/cap4/Cap4TradingPage.tsx` },
  { cap: 5, path: `${ROOT}/cap5/Cap5TradingPage.tsx` },
  { cap: 6, path: `${ROOT}/cap6/Cap6TradingPage.tsx` },
  { cap: 7, path: `${ROOT}/cap7/Cap7TradingPage.tsx` },
  { cap: 8, path: `${ROOT}/cap8/Cap8TradingPage.tsx` },
]

function read(path: string): string {
  return readFileSync(path, "utf8")
}

describe.each(CAP_PAGES)("Cấp $cap — trang cấp không còn lối ném user ra ngoài", ({ path }) => {
  it("★★ không còn navigate('/co-phieu/…') ở bất kỳ đâu trong trang", () => {
    expect(read(path)).not.toMatch(/navigate\(\s*[`'"]\/co-phieu/)
  })

  it("★★ truyền onSymbolSelect cho Header — gõ mã trong ô tìm kiếm đổi mã tại chỗ", () => {
    expect(read(path)).toMatch(/<Header\s+onSymbolSelect=\{setSymbol\}/)
  })

  it("★★ truyền onSymbolClick cho MarketBar — bấm cụm giá không rời trang", () => {
    expect(read(path)).toMatch(/<MarketBar\s+onSymbolClick=\{setSymbol\}/)
  })

  it("★★ modal «AI Phân tích» mở trong shell (AiInsightSymbolModal), không đổi route", () => {
    expect(read(path)).toMatch(/<AiInsightSymbolModal\b/)
  })

  it("KHÔNG dò đường dẫn để đổi hành vi", () => {
    expect(read(path)).not.toMatch(/useLocation|window\.location\.pathname/)
  })
})
