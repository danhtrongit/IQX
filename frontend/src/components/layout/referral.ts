/**
 * Mã giới thiệu (admin spec v1.1 §2.1): tên đăng nhập của một trưởng nhóm, so khớp không
 * phân biệt hoa thường, nên được chuẩn hoá về chữ thường. Mã cũ `LS_…`/`CTV_…` (10 ký tự
 * hex) vẫn nhận đăng ký trong thời gian chuyển đổi (DECISION 5) và giữ dạng chữ hoa gốc.
 */
const USERNAME_CODE = /^[a-z0-9._]{4,30}$/
const LEGACY_CODE = /^(ls|ctv)_[0-9a-f]{10}$/i

export function normalizeReferralCode(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  if (LEGACY_CODE.test(trimmed)) return trimmed.toUpperCase()
  const normalized = trimmed.toLowerCase()
  return USERNAME_CODE.test(normalized) ? normalized : null
}
