export const cap8Keys = {
  all: ["cap8"] as const,
  progress: () => ["cap8", "progress"] as const,
  exitContext: (symbol: string) => ["cap8", "exit-context", symbol.toUpperCase()] as const,
} as const
