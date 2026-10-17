import { requestOperation } from "@/lib/contract-client"

/**
 * Mã giới thiệu của trưởng nhóm (admin spec v1.1 §3.1): mã chính là tên đăng nhập.
 * Mã cũ LS_/CTV_ không còn hiển thị (§3.6); chỉ trưởng nhóm đang hoạt động có mã.
 */
export type TeamLeadOfferType = "none" | "days" | "lifetime"

export type TeamReferralCode = {
  code: string
  commissionPct: number | null
  offerType: TeamLeadOfferType
  offerDays: number | null
  memberCount: number
  appointedAt: string
}

export const referralKeys = {
  teamCode: (userId: string | null | undefined) => ["referral", "team-code", userId ?? "guest"] as const,
}

/** `GET team/me` — chỉ trưởng nhóm đang hoạt động gọi được (403 với vai trò khác). */
export async function fetchTeamReferralCode(signal?: AbortSignal): Promise<TeamReferralCode> {
  const raw = await requestOperation("GET /api/v2/team/me", {}, { signal })
  return {
    code: raw.code,
    commissionPct: raw.commission_pct,
    offerType: raw.offer_type,
    offerDays: raw.offer_type === "days" ? raw.offer_days : null,
    memberCount: raw.member_count,
    appointedAt: raw.appointed_at,
  }
}

/** Nhãn ưu đãi cho người dùng mới nhập mã. */
export function referralOfferLabel(offerType: TeamLeadOfferType, offerDays: number | null): string {
  if (offerType === "lifetime") return "Premium miễn phí trọn đời"
  if (offerType === "days" && offerDays) return `Premium miễn phí ${offerDays} ngày`
  return "Không có ưu đãi"
}

/** Đường dẫn đăng ký mở sẵn mã: `/?ref=<mã>` trên origin hiện tại. */
export function referralLink(code: string): string {
  const url = new URL("/", window.location.origin)
  url.searchParams.set("ref", code)
  return url.toString()
}
