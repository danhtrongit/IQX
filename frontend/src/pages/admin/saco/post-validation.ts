/** Kiểm tra bài khi đăng và ảnh khi chèn, đúng câu báo của spec "Trình soạn bài trong quản trị". */

export const HEADLINE_MAX = 90
export const HEADLINE_PLACEHOLDER = "Một nhận xét cụ thể, có số liệu càng tốt"
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export const POST_ERRORS = {
  headlineMissing: "Cần nhập câu tiêu điểm",
  headlineTooLong: "Câu tiêu điểm tối đa 90 ký tự",
  bodyEmpty: "Nội dung bài đang trống",
  imageType: "Ảnh phải là JPG, PNG hoặc WebP",
  imageTooLarge: "Ảnh tối đa 5 MB",
} as const

/** Số ký tự của câu tiêu điểm (sau khi bỏ khoảng trắng đầu cuối, đếm theo ký tự Unicode). */
export function headlineLength(headline: string): number {
  return [...headline.trim().normalize("NFC")].length
}

export function headlineCounter(headline: string): { label: string; over: boolean } {
  const length = headlineLength(headline)
  return { label: `${length}/${HEADLINE_MAX}`, over: length > HEADLINE_MAX }
}

/** Thân bài trống khi không có chữ nào và không có ảnh nào. */
export function isBodyEmpty(bodyHtml: string): boolean {
  if (!bodyHtml.trim()) return true
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html")
  if (doc.body.querySelector("img[src]")) return false
  return (doc.body.textContent ?? "").trim().length === 0
}

/** Lỗi đầu tiên khi bấm Đăng bài, hoặc `null` khi hợp lệ. */
export function validatePost(input: { headline: string; bodyHtml: string }): string | null {
  const length = headlineLength(input.headline)
  if (length === 0) return POST_ERRORS.headlineMissing
  if (length > HEADLINE_MAX) return POST_ERRORS.headlineTooLong
  if (isBodyEmpty(input.bodyHtml)) return POST_ERRORS.bodyEmpty
  return null
}

/** Kiểm tra phía máy trước khi tải ảnh lên; máy chủ vẫn kiểm tra lại theo nội dung tệp. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return POST_ERRORS.imageType
  if (file.size > IMAGE_MAX_BYTES) return POST_ERRORS.imageTooLarge
  return null
}
