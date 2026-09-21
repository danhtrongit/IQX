export const botKeys = {
  all: ["bot"] as const,
  overview: ["bot", "overview"] as const,
  positions: ["bot", "positions"] as const,
  journal: ["bot", "journal"] as const,
  performance: (from?: string, to?: string) => ["bot", "performance", from, to] as const,
}
