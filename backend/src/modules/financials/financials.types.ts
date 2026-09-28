export type Numeric = number | null;

export interface FinancialRow {
  [field: string]: unknown;
}

export interface FinancialStatements {
  balance_sheet: FinancialRow[];
  income_statement: FinancialRow[];
  cash_flow: FinancialRow[];
}

export interface FinancialSourceResult<T> {
  data: T;
  source: string;
  sourceUrl: string;
}

export interface FinancialsMarketProvider {
  fetchBctcStatements(
    symbol: string,
    termType: 1 | 2,
  ): Promise<FinancialSourceResult<FinancialStatements>>;
  fetchFinancialReport(
    symbol: string,
    reportType: 'ratio',
    options: { period: 'Y'; termType: 1 | 2 },
  ): Promise<FinancialSourceResult<FinancialRow[]>>;
  fetchCompanyOverview(symbol: string): Promise<FinancialSourceResult<FinancialRow>>;
  fetchSectorPeers?(sector: string, limit: number): Promise<Array<{ ticker: string }>>;
}

export interface Period {
  year: number;
  length: number;
  values: Record<string, number>;
}

export const FINANCIALS_MARKET_PROVIDER = Symbol('FINANCIALS_MARKET_PROVIDER');
