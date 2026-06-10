import { sharedKeys } from "@/shared/query/keys"

/**
 * Premium query keys. `me` and `plans` are cross-feature (AuthProvider
 * invalidates `premium.me` on login/logout) so they re-use the shared factory.
 */
export const premiumKeys = {
  me: sharedKeys.premium.me,
  plans: sharedKeys.premium.plans,
} as const
