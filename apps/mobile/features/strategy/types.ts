export type StrategyStatus = 'loading' | 'ready' | 'empty' | 'error' | 'premium';
export type IndicatorKind = 'trend' | 'momentum' | 'volatility' | 'volume';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export interface StrategyIndicator { id: string; name: string; kind: IndicatorKind; value?: string | number; description?: string; }
export interface StrategyAlert { id: string; title: string; message?: string; severity: AlertSeverity; createdAt?: string; read?: boolean; }
export interface BacktestResult { id?: string; symbol: string; returnPct: number; winRate: number; maxDrawdown: number; trades: number; period?: string; }
export interface StrategySnapshot { title: string; summary?: string; indicators?: StrategyIndicator[]; alerts?: StrategyAlert[]; backtest?: BacktestResult; }
