/**
 * Bộ canh CHUỖI CẤM dùng chung — và bài học đắt nhất của repo này về regex.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ★★ `\b` TRONG JS CHỈ TÍNH ASCII. "word char" = `[A-Za-z0-9_]`, HẾT.
 * ══════════════════════════════════════════════════════════════════════════
 * Mọi chữ tiếng Việt có dấu (ã, ả, ợ, á…) là NON-word với `\b`. Hệ quả (viết ở
 * dạng `RegExp(...)` để chính file này không vướng bài meta bên dưới):
 *
 *   RegExp("\\b0 mã\\b").test("có 0 mã")        === false  ← KHÔNG BAO GIỜ khớp
 *   RegExp("lệnh giả\\b", "i").test("lệnh giả") === false  ← KHÔNG BAO GIỜ khớp
 *   RegExp("\\bhỗ\\s*trợ\\b").test("hỗ trợ")    === false  ← KHÔNG BAO GIỜ khớp
 *
 * Vì một ranh giới ở SAU chữ ã đòi ký tự KẾ TIẾP phải thuộc `[A-Za-z0-9_]`, còn
 * ranh giới ở TRƯỚC chữ á đòi ký tự LIỀN TRƯỚC phải là word char.
 *
 * Một `expect(text).not.toMatch(...)` như vậy là bài canh XANH VĨNH VIỄN: nó
 * thưởng cho việc lỗi vẫn còn. Ba bài canh «0 mã» của Cấp 5 và bài
 * «NEVER claims IQX detects fake orders» của Cấp 7 đều đã bị chứng minh xanh giả
 * bằng đột biến (chèn đúng chuỗi cấm vào DOM → test vẫn xanh).
 *
 * ⇒ LUẬT: với chuỗi tiếng Việt, KHÔNG dùng ranh giới ASCII. Dùng lookaround
 *   unicode `(?<!\p{L})` / `(?!\p{L})` (cờ `u`), hoặc lookaround theo đúng thứ
 *   mình cần loại (VD `(?<![\d.,])` để "10 mã" không bị tính là "0 mã").
 * Bài meta canh đúng lớp lỗi này: `regexWordBoundary.test.ts`.
 */

/**
 * «0 mã» — con số 0 BỊA ra khi thật ra chưa đếm/chưa lọc gì (luật số 1).
 *
 * · `(?<![\d.,])` — "10 mã", "1,000 mã", "20 mã" KHÔNG phải vi phạm.
 * · `(?!\p{L})`   — "0 mãi" không bị tính; đây đúng là thứ ranh giới ASCII định
 *   làm mà không làm được.
 */
export const RE_FAKE_ZERO_MA = /(?<![\d.,])0\s+mã(?!\p{L})/u

/**
 * «lệnh giả» — IQX KHÔNG phát hiện lệnh giả/lệnh mồi (Cấp 7 spec §9), nên KHÔNG
 * màn nào được nói câu đó dưới bất kỳ dạng nào.
 *
 * `(?!\p{L})` loại đúng thứ ranh giới ASCII từng định loại: "lệnh giải ngân" và
 * "lệnh giải thích" không phải vi phạm.
 */
export const RE_LENH_GIA = /lệnh giả(?!\p{L})/iu

/**
 * Toàn bộ chữ NGƯỜI DÙNG đọc được sau một `render()`.
 *
 * ★★ `document.body`, KHÔNG phải `container` của `render()`: Arco `Modal` /
 * `Popover` / `Tooltip` vẽ vào một portal treo THẲNG vào `document.body`, nằm
 * NGOÀI container. Với một component chỉ gồm `Modal`, `container.textContent` là
 * chuỗi RỖNG — mọi `not.toMatch`/`not.toContain` trên nó xanh vô điều kiện.
 *
 * ★★ Và KHÔNG dùng thẳng `textContent`: nó DÁN LIỀN hai text node cạnh nhau,
 * không một khoảng trắng. Một hộp `<div>… 0 mã</div><div>chưa có dữ liệu</div>`
 * ra chuỗi `… 0 mãchưa có dữ liệu`, nên mọi lookahead "hết từ" đều trượt và bài
 * canh lại xanh giả (đã kiểm chứng bằng đột biến, không phải suy đoán). Hàm này
 * nối các text node bằng MỘT khoảng trắng rồi co whitespace — đúng thứ người
 * dùng đọc, và câu văn liền mạch vẫn khớp như cũ.
 *
 * Đi kèm quy ước: bài canh phủ định PHẢI có một `getByTestId`/`getByText` DƯƠNG
 * TÍNH bên cạnh, chứng minh màn thật sự đã render. Không có neo dương tính thì
 * "không tìm thấy chuỗi cấm" và "không render gì cả" là một.
 */
export function visibleText(root: HTMLElement = document.body): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  let node = walker.nextNode()
  while (node != null) {
    parts.push(node.textContent ?? "")
    node = walker.nextNode()
  }
  return parts.join(" ").replace(/\s+/gu, " ").trim()
}
