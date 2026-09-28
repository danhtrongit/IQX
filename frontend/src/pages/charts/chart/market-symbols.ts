/**
 * Index tickers that are charted as INDEX rather than equities. Membership is
 * tested on the upper-cased ticker (`INDEX_SYMBOLS[symbol] === true`).
 */
export const INDEX_SYMBOLS: Record<string, true> = {
  VNINDEX: true,
  VN30: true,
  HNX: true,
  HNX30: true,
  UPCOM: true,
  VN100: true,
  VNMID: true,
  VNSMALL: true,
  VNALL: true,
  VN30F1M: true,
  VN30F2M: true,
}
