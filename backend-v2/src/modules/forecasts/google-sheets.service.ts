import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../platform/config/environment.js';
import { MarketHttpClient } from '../market-extended/market-http.client.js';

const DEFAULT_SHEET_ID = '1ekb2bYAQJZbtmqMUzsagb4uWBdtkAzTq3kuIMHQ22RI';
export type SheetRow = Record<string, string>;

function parseCsv(text: string): SheetRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((value) => value.replace(/^\uFEFF/, '').trim());
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()])),
  );
}

@Injectable()
export class GoogleSheetsService {
  private readonly cache = new Map<string, { expiresAt: number; rows: SheetRow[] }>();

  constructor(
    private readonly http: MarketHttpClient,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async read(sheet: string): Promise<SheetRow[]> {
    const cacheKey = sheet.trim();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    const id =
      this.config.get('GOOGLE_SHEETS_SPREADSHEET_ID', { infer: true })?.trim() || DEFAULT_SHEET_ID;
    if (!id)
      throw new ServiceUnavailableException({
        code: 'SHEETS_NOT_CONFIGURED',
        message: 'Google Sheets chưa được cấu hình',
      });
    const apiKey = this.config.get('GOOGLE_SHEETS_API_KEY', { infer: true })?.trim();
    let rows: SheetRow[];
    if (apiKey) {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(sheet)}`;
      const value = await this.http.json<{ values?: string[][] }>(url, 'GET', {
        headers: { 'x-goog-api-key': apiKey },
        timeoutMs: 15_000,
      });
      rows = this.fromValues(value.values ?? []);
    } else {
      const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/gviz/tq`;
      const result = await this.http.text(url, {
        query: { tqx: 'out:csv', sheet },
        timeoutMs: 15_000,
      });
      if (!result.contentType.toLowerCase().includes('text/csv'))
        throw new ServiceUnavailableException({
          code: 'SHEETS_UNAVAILABLE',
          message: 'Google Sheets không trả về CSV',
        });
      rows = parseCsv(result.text);
    }
    this.cache.set(cacheKey, { rows, expiresAt: Date.now() + 300_000 });
    return rows;
  }

  private fromValues(values: string[][]): SheetRow[] {
    if (!values.length) return [];
    const headers = (values[0] ?? []).map((value) => String(value).trim());
    return values
      .slice(1)
      .filter((row) => row.some((value) => String(value).trim()))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header, String(row[index] ?? '').trim()]),
        ),
      );
  }
}

export function parseSheetNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let text = String(value).trim().replace(/%$/, '');
  if (!text || text === '-') return null;
  if (text.includes(',') && text.includes('.'))
    text =
      text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replaceAll('.', '').replace(',', '.')
        : text.replaceAll(',', '');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  return String(value).includes('%') || Math.abs(number) > 1
    ? String(value).includes('%')
      ? number / 100
      : number
    : number;
}

export function normalizedColumn(row: SheetRow, ...names: string[]): string {
  const entries = Object.entries(row).map(
    ([key, value]) => [key.toLowerCase().replace(/[ _+-]/g, ''), value] as const,
  );
  for (const name of names) {
    const found = entries.find(([key]) => key === name.toLowerCase().replace(/[ _+-]/g, ''));
    if (found) return found[1];
  }
  return '';
}
