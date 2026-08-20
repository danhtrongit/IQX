import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { RE_FAKE_ZERO_MA, RE_LENH_GIA } from "./textGuards"

/**
 * BÀI META — canh đúng LỚP lỗi, không canh từng chỗ.
 *
 * `\b` của JS chỉ biết ASCII, nên `\b` đứng cạnh một chữ tiếng Việt có dấu là
 * một điều kiện KHÔNG BAO GIỜ đúng (hoặc chỉ đúng ở giữa từ — còn tệ hơn). Repo
 * này đã ăn đúng lớp lỗi đó bốn chỗ một lúc: ba bài canh «0 mã» của Cấp 5 và
 * bài «NEVER claims IQX detects fake orders» của Cấp 7 đều xanh vĩnh viễn, cộng
 * hai regex chuẩn hoá `hỗ trợ` / `áp lực` trong mã sản phẩm chưa từng khớp.
 *
 * Bài này quét toàn bộ `src/` nên chỗ thứ năm không cần ai nhớ nữa.
 */

/** `import.meta.url` KHÔNG phải `file:` dưới jsdom, nên đi từ cwd của vitest. */
const SRC = join(process.cwd(), "src")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

function isNonAscii(ch: string): boolean {
  return ch.length > 0 && ch.charCodeAt(0) > 127
}

/** Mọi `\b` có láng giềng non-ASCII trong `src/`, dạng "đường/file:dòng: nội dung". */
function findAsciiBoundaryNextToUnicode(): string[] {
  const hits: string[] = []
  for (const file of walk(SRC)) {
    const rel = file.slice(SRC.length)
    const lines = readFileSync(file, "utf8").split("\n")
    lines.forEach((line, i) => {
      let idx = -1
      while ((idx = line.indexOf("\\b", idx + 1)) !== -1) {
        const before = line.slice(Math.max(0, idx - 1), idx)
        const after = line.slice(idx + 2, idx + 3)
        if (isNonAscii(before) || isNonAscii(after)) {
          hits.push(`${rel}:${i + 1}: ${line.trim()}`)
        }
      }
    })
  }
  return hits
}

describe("meta — `\\b` không bao giờ được đứng cạnh chữ tiếng Việt", () => {
  it("bộ quét thật sự đang đọc cây `src/` (cwd sai ⇒ quét 0 file ⇒ xanh giả)", () => {
    expect(existsSync(join(SRC, "test-setup.ts"))).toBe(true)
    expect(walk(SRC).length).toBeGreaterThan(200)
  })

  it("★ không còn một `\\b` nào láng giềng non-ASCII trong src/", () => {
    // Nếu bài này đỏ: đừng nới nó ra. Đổi `\b` thành lookaround unicode
    // `(?<!\p{L})` / `(?!\p{L})` (nhớ cờ `u`), hoặc lookaround theo đúng thứ
    // bạn muốn loại. Xem `textGuards.ts` để biết vì sao.
    expect(findAsciiBoundaryNextToUnicode()).toEqual([])
  })

  it("★ bản thân bộ quét có cắn (nếu không thì nó chỉ là trang trí)", () => {
    // Chính file này chứa `\\b` cạnh chữ ASCII (`\\bfoo`) và các mô tả — bộ quét
    // phải bỏ qua chúng nhưng bắt được mẫu vi phạm khi có.
    const sample = ["const re = /\\b0 mã\\b/", "const ok = /\\bfoo\\b/"]
    const flagged = sample.filter((line) => {
      let idx = -1
      while ((idx = line.indexOf("\\b", idx + 1)) !== -1) {
        if (isNonAscii(line.slice(Math.max(0, idx - 1), idx))) return true
        if (isNonAscii(line.slice(idx + 2, idx + 3))) return true
      }
      return false
    })
    expect(flagged).toEqual(["const re = /\\b0 mã\\b/"])
  })
})

describe("meta — chứng minh cái bẫy, và chứng minh bản thay thế cắn", () => {
  // ★ Regex dựng bằng `RegExp(...)` CỐ Ý: viết dạng literal ở đây thì chính bài
  // meta trên lại bắt file này. Hành vi runtime y hệt.
  it("★ ranh giới ASCII KHÔNG khớp «có 0 mã» (đây là lý do 4 bài canh xanh giả)", () => {
    expect(new RegExp("\\b0 mã\\b").test("có 0 mã")).toBe(false)
    expect(new RegExp("lệnh giả\\b", "i").test("IQX chỉ ra lệnh giả trên bảng")).toBe(false)
    expect(new RegExp("\\bhỗ\\s*trợ\\b").test("hỗ trợ")).toBe(false)
    // Nối chuỗi CỐ Ý: "\\b" dán liền chữ á thì chính bài meta trên bắt file này.
    expect(new RegExp("\\b" + "áp\\s*lực\\b").test("áp lực")).toBe(false)
  })

  it("★ RE_FAKE_ZERO_MA khớp đúng cái phải cấm", () => {
    for (const s of [
      "có 0 mã",
      "Tìm thấy 0 mã",
      "— hiện 0 mã",
      "hôm nay 0 mã thỏa điều kiện",
      "0 mã",
    ]) {
      expect(RE_FAKE_ZERO_MA.test(s), s).toBe(true)
    }
  })

  it("★ RE_FAKE_ZERO_MA KHÔNG bắt oan số thật có chữ số 0 ở cuối", () => {
    for (const s of ["10 mã", "20 mã", "1,000 mã", "hiện 30 mã", "100 mã HOSE"]) {
      expect(RE_FAKE_ZERO_MA.test(s), s).toBe(false)
    }
  })

  it("★ RE_LENH_GIA cấm «lệnh giả» nhưng tha «lệnh giải ngân»", () => {
    expect(RE_LENH_GIA.test("IQX chỉ ra lệnh giả trên bảng")).toBe(true)
    expect(RE_LENH_GIA.test("phát hiện Lệnh Giả")).toBe(true)
    expect(RE_LENH_GIA.test("lệnh giải ngân đã xong")).toBe(false)
  })
})
