export interface StockDirectorySymbol {
  symbol: string
  name?: string | null
  short_name?: string | null
  exchange?: string | null
  asset_type?: string | null
  is_index?: boolean
  icb_lv1?: string | null
  icb_lv2?: string | null
  logo_url?: string | null
}

export interface StockIndustryGroup {
  name: string
  items: StockDirectorySymbol[]
}

export function groupSymbolsByIndustry(symbols: StockDirectorySymbol[]): StockIndustryGroup[] {
  const groups = new Map<string, StockDirectorySymbol[]>()

  for (const item of symbols) {
    const assetType = (item.asset_type || "stock").toLowerCase()
    if (item.is_index || assetType !== "stock") continue

    const industry = item.icb_lv2 || item.icb_lv1 || "Chưa phân ngành"
    const list = groups.get(industry) ?? []
    list.push(item)
    groups.set(industry, list)
  }

  return Array.from(groups.entries())
    .map(([industry, groupSymbols]) => ({
      name: industry,
      items: [...groupSymbols].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
}
