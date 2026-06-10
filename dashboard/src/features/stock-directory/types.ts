/**
 * Types for the stock directory feature (camelCase, adapted from backend
 * snake_case). Ported from `dashboard-bak/src/pages/stock-directory-utils.ts`.
 */

/** A single directory row (one tradable symbol). */
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

/** A label/value option for the industry/group <Select>s. */
export interface DirectoryOption {
  label: string
  value: string
}

/** ICB industry classification row from `reference/industries`. */
export interface Industry {
  code: string
  name: string
  nameEn: string
  level: number | null
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
