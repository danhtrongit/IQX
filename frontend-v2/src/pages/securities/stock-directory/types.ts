/**
 * Types for the stock directory (/co-phieu), adapted from the backend's
 * snake_case symbol rows to camelCase.
 */

/** One directory row — a tradable stock (indices are excluded by the query). */
export interface DirectorySymbol {
  symbol: string
  name: string | null
  shortName: string | null
  exchange: string | null
  assetType: string | null
  isIndex: boolean
  icbLv1: string | null
  icbLv2: string | null
  logoUrl: string | null
}

/** Index group identifiers accepted by `reference/groups/{group}/symbols`. */
export type StockGroup =
  | "HOSE"
  | "HNX"
  | "UPCOM"
  | "VN30"
  | "VN100"
  | "VNMidCap"
  | "VNSmallCap"
  | "VNAllShare"
  | "HNX30"
  | "ETF"

/** Index groups offered in the directory's group filter (mirrors backend VALID_GROUPS). */
export const GROUP_OPTIONS: { label: string; value: StockGroup }[] = [
  { label: "VN30", value: "VN30" },
  { label: "VN100", value: "VN100" },
  { label: "HOSE", value: "HOSE" },
  { label: "HNX", value: "HNX" },
  { label: "HNX30", value: "HNX30" },
  { label: "UPCOM", value: "UPCOM" },
  { label: "VNMidCap", value: "VNMidCap" },
  { label: "VNSmallCap", value: "VNSmallCap" },
  { label: "VNAllShare", value: "VNAllShare" },
  { label: "ETF", value: "ETF" },
]

/** Bucket name used when a symbol has no ICB classification. */
const UNCLASSIFIED_INDUSTRY = "Chưa phân ngành"

/** Resolve the industry bucket of a row: icb_lv2 → icb_lv1 → "Chưa phân ngành". */
export function industryOf(item: DirectorySymbol): string {
  return item.icbLv2 || item.icbLv1 || UNCLASSIFIED_INDUSTRY
}
