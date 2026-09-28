export function normalizeReferralCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? ""
  return /^[A-Z0-9_-]{3,32}$/.test(normalized) ? normalized : null
}
