import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * ★★ MỘT BÀI CANH CHUNG CHO CẢ CHUỖI «PHÂN TÍCH DANH MỤC».
 *
 * `CapNPortfolioAnalysis` của mỗi cấp render lại component của cấp DƯỚI để
 * cộng dồn các khối cũ, và truyền vào đó nhật ký lệnh của CHÍNH CẤP MÌNH. Khối
 * ① in nhãn cấp + ngày vào cấp, nên nếu quên `host`, nó ghép "số lệnh của cấp
 * trên" với "nhãn + ngày vào cấp dưới" trong đúng một câu — user Cấp 4 đọc
 * «Cấp 3 «Bản lĩnh» · N lệnh · từ {ngày vào Cấp 3}» với N là số lệnh Cấp 4.
 *
 * `host` được thêm để diệt đúng lỗi đó ở Cấp 3, nhưng Cấp 4 quên truyền → lỗi
 * tái sinh nguyên vẹn một tầng cao hơn, và Cấp 5-8 kế thừa theo. Bài này đọc
 * thẳng mã nguồn (mỗi trang kéo theo cả cây provider + query) và bắt buộc MỌI
 * mắt xích khai báo `host` và truyền `host` xuống — thêm Cấp 9 mà quên là đỏ.
 */

const ROOT = `${process.cwd()}/src/features`

/** Mỗi cấp N ≥ 3 render lại component Phân tích danh mục của cấp N−1. */
const CHAIN = [3, 4, 5, 6, 7, 8].map((cap) => ({
  cap,
  path: `${ROOT}/cap${cap}/Cap${cap}PortfolioAnalysis.tsx`,
  child: `Cap${cap - 1}PortfolioAnalysis`,
}))

function read(path: string): string {
  return readFileSync(path, "utf8")
}

describe.each(CHAIN)("Cấp $cap — Phân tích danh mục không ghép nhãn hai cấp", ({ cap, path, child }) => {
  it("★★ khai báo prop `host` để cấp trên ghi đè được nhãn/ngày cấp", () => {
    expect(read(path)).toMatch(/host\?: Cap2AnalysisHost/)
  })

  it(`★★ truyền \`host\` xuống <${child}> — nếu không, khối ① tự xưng cấp dưới`, () => {
    const src = read(path)
    const block = src.slice(src.indexOf(`<${child}`))
    const close = block.indexOf("/>")
    expect(block.slice(0, close)).toMatch(/host=\{/)
  })

  it("★★ mặc định `host` là CHÍNH cấp này (nhãn + `entered_at` của nó)", () => {
    const src = read(path)
    const block = src.slice(src.indexOf(`<${child}`))
    const close = block.indexOf("/>")
    const passed = block.slice(0, close)
    expect(passed).toContain(`levelLabel: "Cấp ${cap} «`)
    expect(passed).toContain(`sinceIso: cap${cap}Progress?.entered_at`)
  })
})
