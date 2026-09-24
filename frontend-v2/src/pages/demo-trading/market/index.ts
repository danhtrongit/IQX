/**
 * Market slice of the demo-trading terminal: symbol search, live quote strip,
 * per-ticker news and premium AI patterns.
 */
export * from "./market-api"
export {
  QUOTE_POLL_MS,
  quoteChange,
  useQuote,
  type QuoteChange,
  type QuoteTone,
} from "./use-quote"
export { SymbolPicker, type SymbolPickerProps } from "./symbol-picker"
export { QuoteSummary, type QuoteSummaryProps } from "./quote-summary"
export { NewsPanel, type NewsPanelProps } from "./news-panel"
export { PatternsPanel, type PatternsPanelProps } from "./patterns-panel"
