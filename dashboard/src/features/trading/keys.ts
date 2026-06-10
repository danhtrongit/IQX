/**
 * Virtual-trading query keys. All entries are user-scoped server state that the
 * order mutations invalidate after a fill. Kept feature-local (not in
 * `sharedKeys`) since no other feature needs to invalidate them.
 */
export const tradingKeys = {
  all: ["trading"] as const,
  account: ["trading", "account"] as const,
  portfolio: ["trading", "portfolio"] as const,
  orders: (status?: string) => ["trading", "orders", status ?? "all"] as const,
  pendingOrders: ["trading", "orders", "pending"] as const,
} as const
