export const cap8Keys = {
  all: ["cap8"] as const,
  progress: () => ["cap8", "progress"] as const,
  exitContext: (symbol: string) => ["cap8", "exit-context", symbol.toUpperCase()] as const,
  exitImpact: (symbol: string, quantity: number) =>
    ["cap8", "exit-impact", symbol.toUpperCase(), quantity] as const,
} as const
