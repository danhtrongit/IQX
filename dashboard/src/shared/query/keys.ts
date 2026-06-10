/**
 * Cross-feature query keys that need to be referenced from more than one place
 * (e.g. AuthProvider invalidates premium + watchlist on login/logout).
 *
 * Feature-local keys live next to their feature (e.g. `features/news/keys.ts`)
 * and SHOULD follow this same factory shape: a `const` object whose leaves are
 * `readonly` tuples or functions returning `readonly` tuples.
 */
export const sharedKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  premium: {
    me: ["premium", "me"] as const,
    plans: ["premium", "plans"] as const,
  },
  watchlist: {
    all: ["watchlist"] as const,
  },
} as const

/** Keys whose data is scoped to the signed-in user — invalidated on login/logout. */
export const userScopedKeys: readonly (readonly string[])[] = [
  sharedKeys.auth.me,
  sharedKeys.premium.me,
  sharedKeys.watchlist.all,
]
