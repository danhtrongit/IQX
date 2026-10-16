/**
 * Quy tắc định danh của khung đăng ký (admin spec v1.1 §2.1, §2.2), khớp backend
 * `src/modules/auth/user-identity.ts`, cùng các lượt kiểm tra trực tiếp khi đang nhập.
 */
import { requestOperation } from "@/lib/contract-client"

export const USERNAME_MIN_LENGTH = 4
export const USERNAME_MAX_LENGTH = 30
const USERNAME_PATTERN = /^[a-z0-9._]{4,30}$/
/** Dạng mã cũ LS_/CTV_ bị cấm làm tên đăng nhập để không trùng với mã giới thiệu cũ. */
const RESERVED_USERNAME_PATTERN = /^(ls|ctv)_[0-9a-f]{10}$/
const VIETNAM_MOBILE = /^(?:0|\+?84)([35789]\d{8})$/

export const USERNAME_FORMAT_MESSAGE =
  "Tên đăng nhập gồm 4 đến 30 ký tự: chữ thường không dấu, số, dấu chấm hoặc gạch dưới."
export const USERNAME_RESERVED_MESSAGE = "Tên đăng nhập này không dùng được."
export const USERNAME_AVAILABLE_MESSAGE = "Tên đăng nhập dùng được."
export const USERNAME_TAKEN_MESSAGE = "Tên đăng nhập đã được sử dụng."
export const PHONE_INVALID_MESSAGE = "Số điện thoại chưa đúng, ví dụ 0912 345 678."
export const REFERRAL_INVALID_MESSAGE = "Mã giới thiệu không tồn tại hoặc đã ngừng sử dụng."

/** Tên đăng nhập luôn lưu chữ thường: ô nhập tự chuyển về chữ thường và bỏ khoảng trắng. */
export function normalizeUsernameInput(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase()
}

/** Lỗi định dạng của tên đăng nhập đã chuẩn hoá, hoặc `null` khi hợp lệ. */
export function usernameFormatProblem(value: string): string | null {
  if (!USERNAME_PATTERN.test(value)) return USERNAME_FORMAT_MESSAGE
  if (RESERVED_USERNAME_PATTERN.test(value)) return USERNAME_RESERVED_MESSAGE
  return null
}

/**
 * Chỉ nhận số di động Việt Nam, như `normalizePhone` của backend: bỏ khoảng trắng, dấu chấm,
 * gạch ngang và ngoặc rồi khớp `^(0|\+?84)(3|5|7|8|9)\d{8}$`. Trả dạng +84XXXXXXXXX.
 */
export function normalizeVietnamMobile(value: string): string | null {
  const match = VIETNAM_MOBILE.exec(value.trim().replace(/[\s().-]/g, ""))
  return match?.[1] ? `+84${match[1]}` : null
}

export type ReferralOffer = { offerType: "none" | "days" | "lifetime"; offerDays: number | null }

/** Câu báo khi mã hợp lệ, đúng văn bản §2.2. Không bao giờ nêu tên trưởng nhóm. */
export function referralValidMessage(offer: ReferralOffer): string {
  if (offer.offerType === "lifetime") return "Mã giới thiệu hợp lệ. Bạn được miễn phí Premium trọn đời."
  if (offer.offerType === "days" && offer.offerDays) {
    return `Mã giới thiệu hợp lệ. Bạn được miễn phí Premium ${offer.offerDays} ngày.`
  }
  return "Mã giới thiệu hợp lệ."
}

/** `GET auth/username-available?u=` — public, có giới hạn tần suất. */
export async function checkUsernameAvailable(username: string, signal?: AbortSignal): Promise<boolean> {
  const result = await requestOperation("GET /api/v2/auth/username-available", { query: { u: username } }, { signal })
  return result.available === true
}

/** `GET auth/referral-codes/:code` — `null` khi mã không dùng được. */
export async function checkReferralCode(code: string, signal?: AbortSignal): Promise<ReferralOffer | null> {
  const result = await requestOperation("GET /api/v2/auth/referral-codes/{code}", { path: { code } }, { signal })
  if (!result.valid) return null
  const offerType = result.offer_type === "days" || result.offer_type === "lifetime" ? result.offer_type : "none"
  return { offerType, offerDays: offerType === "days" ? result.offer_days ?? null : null }
}
