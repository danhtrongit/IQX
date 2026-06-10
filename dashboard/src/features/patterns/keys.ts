import type { PatternKind } from "./api"

/** Feature-local query keys for the AI patterns feature. */
export const patternsKeys = {
  all: ["patterns"] as const,
  list: (kind: PatternKind, symbol: string) =>
    ["patterns", kind, symbol] as const,
} as const
