import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * ★★ BỀ RỘNG CỘT PHẢI LÀ MỘT SỐ CHO CẢ DỰ ÁN ★★
 *
 * `RightSidebar` dùng chung cho trang chủ, cả chín shell cấp `/dau-truong`,
 * `/bieu-do` và `/co-phieu`. Bề rộng của nó từng là `md:w-[280px]` hard-code
 * trong component; đổi con số đó là đổi mọi trang, nên nó phải là một token có
 * tên (`--right-sidebar-w` trong `index.css`) chứ không phải một literal nằm lẫn
 * giữa 12 class khác.
 *
 * Bài này canh đúng hai điều:
 *   1. component KHÔNG hard-code lại bề rộng — nếu ai đó gõ `md:w-[400px]` thì
 *      token thành vô nghĩa và cả dự án lệch nhau âm thầm;
 *   2. token thật sự được KHAI, nếu không `md:w-[var(--right-sidebar-w)]` sẽ
 *      resolve về rỗng và cột co lại theo nội dung.
 *
 * ★ Vì sao đọc VĂN BẢN NGUỒN chứ không `toHaveStyle`: vitest chạy `css: false`
 * nên jsdom không bao giờ thấy luật nào trong `index.css` — `toHaveStyle` ở đây
 * sẽ xanh vô điều kiện, đúng lớp "test xanh giả" mà repo này đã dọn một đợt lớn.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SIDEBAR_SRC = readFileSync(join(HERE, "RightSidebar.tsx"), "utf8")
const INDEX_CSS = readFileSync(join(HERE, "..", "..", "..", "index.css"), "utf8")

describe("RightSidebar — bề rộng đi qua token, không hard-code", () => {
  it("★ component đọc `--right-sidebar-w`", () => {
    expect(SIDEBAR_SRC).toContain("md:w-[var(--right-sidebar-w)]")
  })

  it("★★ KHÔNG có bề rộng md hard-code nào lọt lại", () => {
    // Neo dương tính: nếu regex hỏng thì `matchAll` trả rỗng và bài xanh vô
    // điều kiện — đọc được file và thấy ít nhất một class `md:` mới tin được.
    expect(SIDEBAR_SRC).toMatch(/md:/)

    const hardcode = [...SIDEBAR_SRC.matchAll(/md:w-\[(\d+)px\]/g)].map((m) => m[0])
    expect(
      hardcode,
      "Bề rộng cột phải phải khai ở `--right-sidebar-w` trong index.css, " +
        "không hard-code trong component: " + hardcode.join(", "),
    ).toEqual([])
  })

  it("★ token được khai trong `index.css` với đơn vị px", () => {
    const m = INDEX_CSS.match(/--right-sidebar-w:\s*(\d+)px/)
    expect(m, "thiếu khai báo `--right-sidebar-w` trong index.css").not.toBeNull()
    // Chặn ngưỡng thô: hẹp hơn 240 là cột không chứa nổi panel đặt lệnh, rộng
    // hơn 560 là lấn mất vùng chart. Không ghim con số chính xác — founder còn
    // đổi — nhưng ghim là nó phải có nghĩa.
    const px = Number(m![1])
    expect(px).toBeGreaterThanOrEqual(240)
    expect(px).toBeLessThanOrEqual(560)
  })
})
