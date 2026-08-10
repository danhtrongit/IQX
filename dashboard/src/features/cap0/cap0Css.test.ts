import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Luật CSS mà jsdom KHÔNG kiểm được: vitest stub mọi `import "./cap0.css"`
 * (`css: false`), nên `toHaveStyle` không bao giờ thấy các luật này. Đọc thẳng
 * file từ đĩa — cùng cách `cap6/KetsoModalCap6.test.tsx` đã dùng.
 * `process.cwd()` là root của vitest (`dashboard/`).
 */
const CSS = readFileSync(resolve(process.cwd(), "src/features/cap0/cap0.css"), "utf8")

/**
 * Thân của luật có selector CHÍNH XÁC là `selector`. `\s*\{` ngay sau tên class
 * là thứ tách nó khỏi các luật con (`.cap0-debrief-table th { … }` không khớp).
 */
function rule(selector: string): string {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`)
  const m = re.exec(CSS)
  expect(m, `không tìm thấy luật cho \`${selector}\``).not.toBeNull()
  return m![1]
}

/**
 * Vị trí (index) của luật có selector CHÍNH XÁC là `selector`, neo ở ĐẦU DÒNG —
 * nếu không, `.cap0-checklist-item` sẽ khớp nhầm vào `.cap0-journey-rest
 * .cap0-checklist-item` (luật con, specificity khác hẳn) và phép so thứ tự
 * dưới đây thành vô nghĩa.
 */
function ruleIndex(selector: string): number {
  const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m")
  const m = re.exec(CSS)
  expect(m, `không tìm thấy luật cho \`${selector}\``).not.toBeNull()
  return m!.index
}

describe("cap0.css — biến thể phải THẮNG luật gốc (cùng specificity → thứ tự quyết định)", () => {
  /**
   * ★ `.cap0-checklist-golink--quiet` (lối tắt của nhiệm vụ đã mở nhưng chưa
   * tới lượt) và `.cap0-checklist-golink` (viên nút brand) có CÙNG specificity
   * (0,1,0). Đứng trước luật gốc là biến thể thua sạch: `background`, `color`,
   * `padding`, `margin-top`, `font-size` đều bị luật gốc đè, và "lối tắt chữ"
   * lại hiện ra thành một viên nút xanh đầy đặn thứ hai tranh chú ý với nút
   * của ô tập trung — đúng thứ bản dẫn-từng-nhiệm-vụ-một đi sửa.
   *
   * jsdom KHÔNG bắt được lỗi này (vitest stub CSS), nên luật thứ tự phải được
   * chốt ở đây.
   */
  it("★ .cap0-checklist-golink--quiet comes after the base .cap0-checklist-golink", () => {
    expect(ruleIndex(".cap0-checklist-golink--quiet")).toBeGreaterThan(
      ruleIndex(".cap0-checklist-golink"),
    )
  })

  /** Cùng lý do: `--current` phải đứng sau `.cap0-checklist-item`. */
  it("★ .cap0-checklist-item--current comes after the base .cap0-checklist-item", () => {
    expect(ruleIndex(".cap0-checklist-item--current")).toBeGreaterThan(
      ruleIndex(".cap0-checklist-item"),
    )
  })
})

describe("cap0.css — .cap0-debrief-table (thẻ đối chiếu bo tròn của mockup)", () => {
  /**
   * `border-radius` bị BỎ QUA khi `border-collapse: collapse` (CSS 2.1 §17.6.2:
   * mô hình collapsed borders không vẽ bo góc), nên thẻ đối chiếu đang khai báo
   * `border-radius: 8px` mà render ra góc vuông. Bảng này dùng chung cho Kết sổ
   * của Cấp 0-8 nên một luật sửa được cả chín màn.
   */
  it("★ never pairs a border-radius with collapsed borders (radius would be ignored)", () => {
    const decl = rule(".cap0-debrief-table")
    if (!/border-radius/.test(decl)) return // hợp lệ: bỏ hẳn bo góc cũng là một lựa chọn
    expect(decl).not.toMatch(/border-collapse:\s*collapse/)
    expect(decl).toMatch(/border-collapse:\s*separate/)
    expect(decl).toMatch(/border-spacing:\s*0/)
  })

  /**
   * `overflow: hidden` trên chính `<table>` là cách clip góc KHÔNG đáng tin
   * (`display: table` + overflow là vùng xám giữa các engine), và ở đây không
   * có wrapper để bọc — `DebriefModal`/`KetsoModalCap1…8` đều render `<table>`
   * trần. Nên 4 ô góc phải TỰ bo, nếu không góc trên vẫn lòi 2 mẩu vuông của
   * nền `th` (`--bg3`) ra ngoài đường bo.
   */
  it("★ rounds all four corner cells itself instead of trusting overflow clipping", () => {
    const decl = rule(".cap0-debrief-table")
    if (!/border-radius/.test(decl)) return

    for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const re = new RegExp(`\\.cap0-debrief-table[^{}]*\\{[^}]*border-${corner}-radius`)
      expect(CSS, `thiếu luật bo góc ${corner} cho .cap0-debrief-table`).toMatch(re)
    }
  })
})
