import { api } from "@/lib/api"

export type ReferralPartnerKind = "ctv" | "lead_sale"

export type ReferralInfo = {
  referralCode: string | null
  referralPartnerKind: ReferralPartnerKind | null
  referralLeadUserId: string | null
  referredByUserId: string | null
  referralUrl: string | null
}

export const referralKeys = {
  me: (userId: string | null | undefined) => ["referral", "me", userId ?? "guest"] as const,
  admin: (userId: string | null | undefined, targetUserId: string) =>
    ["referral", "admin", userId ?? "guest", targetUserId] as const,
}

type ReferralWire = {
  referral_code: string | null
  referral_partner_kind: ReferralPartnerKind | null
  referral_lead_user_id: string | null
  referred_by_user_id: string | null
  referral_url: string | null
}

function adaptReferral(raw: ReferralWire): ReferralInfo {
  return {
    referralCode: raw.referral_code,
    referralPartnerKind: raw.referral_partner_kind,
    referralLeadUserId: raw.referral_lead_user_id,
    referredByUserId: raw.referred_by_user_id,
    referralUrl: raw.referral_url,
  }
}

export async function fetchMyReferral(signal?: AbortSignal): Promise<ReferralInfo> {
  return adaptReferral(await api<ReferralWire>("/referrals/me", { signal }))
}

export async function fetchAdminReferral(userId: string, signal?: AbortSignal): Promise<ReferralInfo> {
  return adaptReferral(await api<ReferralWire>(`/admin/referrals/${userId}`, { signal }))
}

export async function enrollReferral(
  userId: string,
  input: { kind: ReferralPartnerKind; leadUserId?: string },
): Promise<ReferralInfo> {
  return adaptReferral(
    await api<ReferralWire>(`/admin/referrals/${userId}/enroll`, {
      method: "POST",
      body: JSON.stringify({ kind: input.kind, lead_user_id: input.leadUserId ?? undefined }),
    }),
  )
}

export function absoluteReferralUrl(referralUrl: string | null): string | null {
  if (!referralUrl) return null
  try {
    return new URL(referralUrl, window.location.origin).toString()
  } catch {
    return referralUrl
  }
}
