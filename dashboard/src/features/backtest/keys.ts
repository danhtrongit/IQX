/** Query keys for the backtester feature. */
export const backtestKeys = {
  all: ["backtest"] as const,
  catalog: ["backtest", "catalog"] as const,
  strategies: ["backtest", "strategies"] as const,
} as const
