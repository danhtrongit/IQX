/** Every Demo account starts with 100.000.000đ of virtual cash (layout v1.3 §8.1). */
export const DEMO_BASE_CAPITAL_VND = 100_000_000

/** Demo profit in percent: (total equity − 100.000.000) / 100.000.000, never the net amount exchanged in. */
export function demoReturnPct(totalEquityVnd: number): number {
  return ((totalEquityVnd - DEMO_BASE_CAPITAL_VND) / DEMO_BASE_CAPITAL_VND) * 100
}
