export const REPORT_TYPES = ['daily', 'midday', 'premarket'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
/** JSON object at API boundaries; nested validation is performed by Zod schemas. */
export type JsonObject = Record<string, unknown>;

export type MarketReport = {
  id: string;
  sessionDate: string;
  sessionType: string;
  reportType: ReportType;
  generatedAt: string;
  headline: string;
  tagline: JsonObject;
  paragraphs: JsonObject;
  scenarios: JsonValue[];
  watchlist: JsonValue[] | null;
  unexplained: string | null;
  meta: JsonObject | null;
  published: boolean;
  generationStatus: 'generating' | 'published' | 'failed';
  generationError: string | null;
};

export type MarketReportOutput = {
  headline: string;
  tagline: JsonObject;
  paragraphs: JsonObject;
  scenarios: JsonValue[];
  watchlist?: JsonValue[] | null;
  unexplained?: string | null;
  meta?: JsonObject | null;
};

export type MarketReportPayload = JsonObject & {
  meta: JsonObject & {
    report_type: ReportType;
    generated_for_date: string;
    generated_at: string;
  };
};

export type MarketReportGenerationResult = {
  session_date: string;
  session_type: string;
  valid: boolean;
  persisted: boolean;
  memory_loaded: boolean;
  attempts: number;
  errors: string[];
  model: string;
  generation_time_ms: number;
};

export interface MarketReportInputPort {
  buildPayload(type: ReportType, sessionDate: string): Promise<MarketReportPayload>;
}

export interface MarketAiPort {
  complete(input: {
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    responseFormat: 'json';
  }): Promise<{ content: string; model: string }>;
}

export const MARKET_REPORT_INPUT = Symbol('MARKET_REPORT_INPUT');
export const MARKET_REPORT_AI = Symbol('MARKET_REPORT_AI');
