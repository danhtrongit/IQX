export const INDEX_SYMBOLS = new Set([
  "VNINDEX",
  "VN30",
  "HNX",
  "HNX30",
  "UPCOM",
  "VN100",
  "VNMID",
  "VNSMALL",
  "VNALL",
  "VN30F1M",
  "VN30F2M",
])

export function isKnownIndexSymbol(symbol: string): boolean {
  return INDEX_SYMBOLS.has(symbol.toUpperCase())
}
