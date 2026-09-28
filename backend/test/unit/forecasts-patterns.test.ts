import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ForecastsService } from '../../src/modules/forecasts/forecasts.service.js';
import {
  GoogleSheetsService,
  normalizedColumn,
  parseSheetNumber,
} from '../../src/modules/forecasts/google-sheets.service.js';
import { PatternsService } from '../../src/modules/patterns/patterns.service.js';
import type { Environment } from '../../src/platform/config/environment.js';

describe('Google Sheets forecast/pattern adapters', () => {
  it('parses Vietnamese numbers and percentages', () => {
    expect(parseSheetNumber('6,50%')).toBeCloseTo(0.065);
    expect(parseSheetNumber('1.234,5')).toBe(1234.5);
    expect(parseSheetNumber('-')).toBeNull();
    expect(normalizedColumn({ ' TIN HIEU ': 'Tăng' }, 'tin hieu')).toBe('Tăng');
  });

  it('returns horizon-specific forecasts from one sheet read', async () => {
    const sheets = {
      read: async () => [
        {
          ticker: 'VCB',
          priceT3: '110',
          returnT3: '5%',
          priceT5: '120',
          returnT5: '10%',
          priceT10: '130',
          returnT10: '20%',
        },
      ],
    };
    const service = new ForecastsService(sheets as never);
    await expect(service.ranking('5', 20)).resolves.toMatchObject({
      items: [{ symbol: 'VCB', expectedReturn: 0.1, projectedPrice: 120 }],
    });
    await expect(service.symbol('vcb')).resolves.toMatchObject({
      forecasts: [
        { horizon: 'T+3', expectedReturn: 0.05 },
        { horizon: 'T+5', expectedReturn: 0.1 },
        { horizon: 'T+10', expectedReturn: 0.2 },
      ],
    });
  });

  it('maps pattern signals and never fabricates illustrations', async () => {
    const sheets = {
      read: async () => [
        {
          SYMBOL: 'FPT',
          NAME: 'Doji',
          'TIN HIEU': 'Tăng',
          'MUC DO': 'Cao',
          'Y NGHIA': 'x',
          'HANH DONG': 'y',
        },
      ],
    };
    const service = new PatternsService(sheets as never);
    await expect(service.bySymbol('candles', 'fpt')).resolves.toMatchObject({
      count: 1,
      items: [{ symbol: 'FPT', signal: 'bullish', illustration: null }],
    });
  });

  it('uses injected Sheets configuration and ignores ambient credentials', async () => {
    process.env.GOOGLE_SHEETS_API_KEY = 'ambient-secret';
    const http = {
      json: async () => {
        throw new Error('must not use ambient API key');
      },
      text: async () => ({
        text: 'ticker,return\nVCB,5%',
        contentType: 'text/csv',
        url: 'https://docs.google.com/',
      }),
    };
    const config = {
      get: (key: keyof Environment) =>
        key === 'GOOGLE_SHEETS_SPREADSHEET_ID' ? undefined : undefined,
    } as unknown as ConfigService<Environment, true>;
    const service = new GoogleSheetsService(http as never, config);
    await expect(service.read('Du_Bao')).resolves.toEqual([{ ticker: 'VCB', return: '5%' }]);
    delete process.env.GOOGLE_SHEETS_API_KEY;
  });
});
