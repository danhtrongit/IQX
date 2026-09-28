import { marketReportOutputSchema } from './reports.schemas.js';
import type { JsonObject, MarketReportOutput, ReportType } from './reports.types.js';

const FORBIDDEN = [
  'không có sẵn',
  'không có dữ liệu',
  'thiếu thông tin',
  'dữ liệu không đầy đủ',
  'khuyến nghị mua',
  'khuyến nghị bán',
  'chắc chắn tăng',
  'chắc chắn giảm',
];

// A malformed model response can contain thousands of array items. Keep the
// retry prompt useful and bounded instead of echoing the entire response.
const MAX_ERRORS = 24;

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredStrings(value: unknown, fields: string[], path: string): string[] {
  const row = object(value);
  return fields.flatMap((field) =>
    typeof row[field] === 'string' && row[field].trim()
      ? []
      : [`STRUCT: ${path}.${field}: phải là chuỗi không rỗng`],
  );
}

function oneOf(value: unknown, choices: string[], path: string): string[] {
  return choices.includes(String(value)) ? [] : [`STRUCT: ${path}: phải là ${choices.join(' | ')}`];
}

function validateNarrativeContract(output: MarketReportOutput, type: ReportType): string[] {
  const errors: string[] = [];
  const tagline = object(output.tagline);
  const paragraphs = object(output.paragraphs);
  if (type === 'daily') {
    errors.push(...requiredStrings(tagline, ['direction', 'marker', 'text'], 'tagline'));
    errors.push(
      ...oneOf(tagline.direction, ['up', 'down', 'flat', 'anomaly'], 'tagline.direction'),
    );
    errors.push(
      ...requiredStrings(paragraphs, ['structure', 'smart_money', 'market_health'], 'paragraphs'),
    );
    output.scenarios.forEach((scenario, index) => {
      const path = `scenarios.${index}`;
      errors.push(
        ...requiredStrings(scenario, ['direction', 'condition_html', 'outcome_html'], path),
      );
      errors.push(...oneOf(object(scenario).direction, ['up', 'down'], `${path}.direction`));
    });
    (output.watchlist ?? []).forEach((item, index) => {
      const path = `watchlist.${index}`;
      errors.push(...requiredStrings(item, ['ticker', 'reason_html'], path));
      if (typeof object(item).alert !== 'boolean')
        errors.push(`STRUCT: ${path}.alert: phải là boolean`);
    });
  } else if (type === 'midday') {
    errors.push(...requiredStrings(tagline, ['text', 'color'], 'tagline'));
    errors.push(...oneOf(tagline.color, ['up', 'down', 'neutral'], 'tagline.color'));
    for (const field of ['session_structure', 'money_flow'] as const) {
      errors.push(
        ...requiredStrings(paragraphs[field], ['status', 'content'], `paragraphs.${field}`),
      );
      errors.push(
        ...oneOf(object(paragraphs[field]).status, ['published'], `paragraphs.${field}.status`),
      );
    }
    errors.push(
      ...requiredStrings(
        paragraphs.market_health,
        ['status', 'pending_message', 'pending_until'],
        'paragraphs.market_health',
      ),
    );
    errors.push(
      ...oneOf(
        object(paragraphs.market_health).status,
        ['pending'],
        'paragraphs.market_health.status',
      ),
    );
    output.scenarios.forEach((scenario, index) => {
      const path = `scenarios.${index}`;
      errors.push(...requiredStrings(scenario, ['type', 'condition', 'outcome', 'scope'], path));
      errors.push(...oneOf(object(scenario).type, ['up', 'down'], `${path}.type`));
      errors.push(...oneOf(object(scenario).scope, ['afternoon_session'], `${path}.scope`));
    });
    (output.watchlist ?? []).forEach((item, index) => {
      const path = `watchlist.${index}`;
      errors.push(...requiredStrings(item, ['key', 'alert_level', 'reason'], path));
      errors.push(
        ...oneOf(object(item).alert_level, ['normal', 'alert', 'warn'], `${path}.alert_level`),
      );
    });
  } else {
    errors.push(...requiredStrings(tagline, ['text'], 'tagline'));
    if (paragraphs.world_paragraph !== undefined && typeof paragraphs.world_paragraph !== 'string')
      errors.push('STRUCT: paragraphs.world_paragraph: phải là chuỗi');
    (output.watchlist ?? []).forEach((item, index) => {
      const path = `watchlist.${index}`;
      errors.push(...requiredStrings(item, ['level', 'content'], path));
      errors.push(...oneOf(object(item).level, ['normal', 'alert', 'warn'], `${path}.level`));
    });
  }
  return errors;
}

export function validateMarketReport(
  value: unknown,
  payload: JsonObject,
  type: ReportType,
): { output: MarketReportOutput | null; errors: string[] } {
  const parsed = marketReportOutputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      output: null,
      errors: parsed.error.issues
        .slice(0, MAX_ERRORS)
        .map((issue) => `STRUCT: ${issue.path.join('.')}: ${issue.message}`),
    };
  }
  const output = parsed.data as MarketReportOutput;
  const errors: string[] = validateNarrativeContract(output, type);
  const text = strings(output).join(' ').toLocaleLowerCase('vi');
  for (const term of FORBIDDEN) if (text.includes(term)) errors.push(`FORBIDDEN: chứa '${term}'`);
  const marketHealth = String(
    output.paragraphs.market_health ?? output.paragraphs.marketHealth ?? '',
  );
  if (type === 'daily' && marketHealth.trim().split(/\s+/).length < 25) {
    errors.push('MARKET_HEALTH: nội dung quá ngắn');
  }
  if (!payload.vnindex && type !== 'premarket') errors.push('INPUT: thiếu vnindex');
  if (!payload.data_quality) errors.push('INPUT: thiếu data_quality');
  return { output, errors: errors.slice(0, MAX_ERRORS) };
}

export function parseAiJson(content: string): unknown {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    throw new Error('AI output is not valid JSON');
  }
}
