import type { TeamLeadOfferDays, TeamLeadOfferType, TeamLeadPolicyValue } from "./api"

/** Bản nháp của biểu mẫu: % là chuỗi để giữ đúng những gì quản trị viên gõ. */
export type PolicyDraft = {
  commission: string
  offerType: TeamLeadOfferType
  offerDays: TeamLeadOfferDays
}

export const DEFAULT_OFFER_DAYS: TeamLeadOfferDays = 30

export function draftFromPolicy(policy: TeamLeadPolicyValue | null): PolicyDraft {
  return {
    commission: policy ? String(policy.commissionPct) : "",
    offerType: policy?.offerType ?? "none",
    offerDays: policy?.offerDays ?? DEFAULT_OFFER_DAYS,
  }
}

/** Hoa hồng trực tiếp là số nguyên 0–100 (§3.1). */
export function parseCommission(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return null
  const pct = Number(trimmed)
  return pct >= 0 && pct <= 100 ? pct : null
}

/** `null` khi % hoa hồng chưa hợp lệ. */
export function policyFromDraft(draft: PolicyDraft): TeamLeadPolicyValue | null {
  const commissionPct = parseCommission(draft.commission)
  if (commissionPct === null) return null
  return {
    commissionPct,
    offerType: draft.offerType,
    offerDays: draft.offerType === "days" ? draft.offerDays : null,
  }
}
