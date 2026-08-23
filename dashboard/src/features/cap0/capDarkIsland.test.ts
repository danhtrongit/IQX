import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ★★ VỎ CẤP LÀ MỘT HÒN ĐẢO TỐI — VÀ NÓ PHẢI TỰ NHẤT QUÁN Ở CẢ HAI THEME ★★
 *
 * `.cap0` (wrapper của mọi `CapNTradingPage`) vẽ nền/chữ/viền bằng bảng màu tối
 * CỐ ĐỊNH: `--bg1/--bg2/--bd/--t1…`. Không cấp nào có nhánh sáng, và điều đó là
 * cố ý — comment đầu `cap0.css` nói rõ không cho token tối rò ra phần còn lại
 * của app.
 *
 * Nhưng gần 200 chỗ BÊN TRONG vỏ (TradingPanel, SlTpBlock, các Kết sổ…) lại vẽ
 * bằng token của Arco (`--color-text-1`, `--color-border-2`, …), mà token Arco
 * đi theo `body[arco-theme]` của CẢ APP. User bật giao diện SÁNG là nền vẫn tối
 * còn chữ nhảy sang gần-đen ⇒ cả khu Demo Trading không đọc được. Đó chính là
 * lỗi user báo, và nó im lặng suốt nhiều đợt deploy vì mặc định app là tối nên
 * không ai thấy.
 *
 * Bài canh này đọc VĂN BẢN NGUỒN (như `capPagesNoEscape.test.ts`): mọi token
 * Arco được dùng bên trong vỏ cấp đều PHẢI được `cap0.css` ánh xạ lại. Cấp thứ
 * mười thêm một token mới mà quên ánh xạ thì test đỏ, thay vì đợi user báo.
 *
 * ★ Vì sao không dùng `toHaveStyle`: vitest chạy `css: false` nên jsdom không
 * bao giờ thấy một luật nào trong file CSS — mọi assert kiểu đó sẽ xanh vô điều
 * kiện, đúng lớp "test xanh giả" mà repo này đã dọn một đợt lớn.
 */

const FEATURES = join(__dirname, "..")
const CAP0_CSS = readFileSync(join(FEATURES, "cap0/cap0.css"), "utf8")

/** Thư mục có vỏ `.cap0` bọc ngoài: 9 cấp + panel đặt lệnh dùng chung. */
const THU_MUC_TRONG_VO = [
  ...Array.from({ length: 9 }, (_, n) => `cap${n}`),
  "trading",
]

function docFileNguon(dir: string): string[] {
  const abs = join(FEATURES, dir)
  let names: string[]
  try {
    names = readdirSync(abs)
  } catch {
    return []
  }
  return names
    .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."))
    .map((f) => readFileSync(join(abs, f), "utf8"))
}

/** Mọi `var(--color-…)` xuất hiện trong mã nguồn bên trong vỏ cấp. */
function tokenArcoDangDung(): Set<string> {
  const found = new Set<string>()
  for (const dir of THU_MUC_TRONG_VO) {
    for (const src of docFileNguon(dir)) {
      for (const m of src.matchAll(/var\((--color-[a-z0-9-]+)/g)) {
        found.add(m[1])
      }
    }
  }
  return found
}

describe("Vỏ cấp `.cap0` — token Arco phải được ánh xạ về bảng màu tối", () => {
  it("★★★ mọi token Arco dùng bên trong vỏ cấp đều được `cap0.css` ánh xạ lại", () => {
    const dangDung = [...tokenArcoDangDung()].sort()

    // Neo dương tính: nếu regex hỏng hoặc thư mục đổi tên, danh sách rỗng sẽ
    // làm vòng lặp dưới xanh vô điều kiện — đúng cái bẫy "không tìm thấy gì" bị
    // đọc nhầm thành "không có vi phạm".
    expect(dangDung.length).toBeGreaterThan(5)

    const chuaAnhXa = dangDung.filter((token) => {
      // Ánh xạ nằm trong khối `.cap0 { … }` dưới dạng `--color-x: var(--y);`
      return !new RegExp(`\\n\\s*${token}\\s*:`).test(CAP0_CSS)
    })

    expect(
      chuaAnhXa,
      `Các token Arco này được dùng bên trong vỏ cấp nhưng cap0.css KHÔNG ánh xạ, ` +
        `nên chúng sẽ đi theo theme của app và vỡ khi user bật giao diện sáng: ` +
        chuaAnhXa.join(", "),
    ).toEqual([])
  })

  it("★ ánh xạ trỏ về bảng màu của vỏ, không phải màu sáng hard-code", () => {
    const khoiCap0 = CAP0_CSS.slice(CAP0_CSS.indexOf(".cap0 {"))
    for (const [token, mongDoi] of [
      ["--color-text-1", "--t1"],
      ["--color-text-2", "--t2"],
      ["--color-text-3", "--t3"],
      ["--color-bg-1", "--bg1"],
      ["--color-bg-2", "--bg2"],
      ["--color-border-2", "--bd"],
    ] as const) {
      expect(khoiCap0, `${token} phải trỏ về ${mongDoi}`).toMatch(
        new RegExp(`${token}\\s*:\\s*var\\(${mongDoi}\\)`),
      )
    }
  })

  it("★ ánh xạ nằm TRONG `.cap0`, KHÔNG rò ra `:root` (sẽ nhuộm tối cả app)", () => {
    const truocCap0 = CAP0_CSS.slice(0, CAP0_CSS.indexOf(".cap0 {"))
    expect(truocCap0).not.toMatch(/:root\s*\{/)
    expect(CAP0_CSS).not.toMatch(/:root\s*\{[^}]*--color-text-1/)
  })
})
