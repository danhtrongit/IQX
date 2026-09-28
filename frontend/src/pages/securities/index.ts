/**
 * Securities surfaces: the stock directory (/co-phieu) and the live price board
 * (/bang-gia). Both pages own their market transport (see `./market`), so the
 * shell only registers routes.
 */
export { StockDirectoryPage } from "./stock-directory/stock-directory-page"
export { PriceBoardPage } from "./price-board/price-board-page"

/** Cache root for everything these pages fetch (public market data). */
export { securitiesKeys } from "./keys"

export { GROUP_OPTIONS, industryOf } from "./stock-directory/types"
export type { DirectorySymbol, StockGroup } from "./stock-directory/types"
export type { IndexIntraday, MarketIndexQuote, PriceBoardRow } from "./market/types"
