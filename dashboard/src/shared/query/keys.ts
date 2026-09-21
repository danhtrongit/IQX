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

/** Private query prefixes must be removed, not merely marked stale, on auth changes. */
export const userScopedKeys: readonly (readonly string[])[] = [
  sharedKeys.auth.me,
  sharedKeys.premium.me,
  sharedKeys.watchlist.all,
  ["trading"],
  ["bot"],
  ["cap0"], ["cap1"], ["cap2"], ["cap3"], ["cap4"],
  ["cap5"], ["cap6"], ["cap7"], ["cap8"],
  ["journey-identity"], ["journey-reading"], ["journey-reveal"],
  ["settings"], ["alerts"], ["lessons"], ["backtest"],
  ["stock"], ["portfolio-manager"],
]
