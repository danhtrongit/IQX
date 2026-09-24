/**
 * Query keys for the market workspace's session briefs. Namespaced per domain
 * so they never collide with the demo terminal's market keys.
 */
export const marketWorkspaceKeys = {
  all: ["market-workspace"] as const,
  analysis: {
    all: ["market-workspace", "analysis"] as const,
    /** `today` is part of the key so a cache entry from yesterday can't be reused. */
    latest: (report: "premarket" | "midday" | "daily", today: string) =>
      ["market-workspace", "analysis", report, "latest", today] as const,
  },
} as const
