/**
 * Feature-local query keys for Cấp 0. Leaves are `readonly` tuples per the
 * foundation key convention.
 */
export const cap0Keys = {
  all: ["cap0"] as const,
  progress: () => ["cap0", "progress"] as const,
} as const
