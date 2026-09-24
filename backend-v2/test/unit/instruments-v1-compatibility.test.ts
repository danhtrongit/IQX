import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InstrumentsV1Controller } from '../../src/compatibility/v1/instruments.controller.js';
import { LegacyInstrumentQueryPipe } from '../../src/compatibility/v1/legacy-instrument-query.pipe.js';
import type { InstrumentsService } from '../../src/modules/market/instruments/index.js';
import { makeSymbolRow } from '../helpers/symbols.js';

const queryMetadata = { type: 'query' } as ArgumentMetadata;

function validationDetail(
  pipe: LegacyInstrumentQueryPipe,
  query: Record<string, unknown>,
): unknown {
  try {
    pipe.transform(query, queryMetadata);
    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return (error as UnprocessableEntityException).getResponse();
  }
}

describe('LegacyInstrumentQueryPipe', () => {
  const pipe = new LegacyInstrumentQueryPipe();

  it('reproduces FastAPI defaults and preserves legacy string values', () => {
    expect(pipe.transform({ q: '   ', exchange: '', asset_type: 'STOCK' }, queryMetadata)).toEqual({
      q: '   ',
      exchange: '',
      asset_type: 'STOCK',
      include_indices: false,
      page: 1,
      page_size: 20,
    });
  });

  it('uses the last repeated query value like Starlette QueryParams', () => {
    expect(
      pipe.transform(
        {
          q: ['FPT', 'VCB'],
          exchange: ['HNX', 'HOSE'],
          asset_type: ['etf', 'stock'],
          include_indices: ['true', 'false'],
          page: ['1', '2'],
          page_size: ['10', '25'],
        },
        queryMetadata,
      ),
    ).toEqual({
      q: 'VCB',
      exchange: 'HOSE',
      asset_type: 'stock',
      include_indices: false,
      page: 2,
      page_size: 25,
    });
  });

  it('matches Pydantic boolean parsing, including rejection of padded values', () => {
    expect(pipe.transform({ include_indices: 'off' }, queryMetadata).include_indices).toBe(false);
    expect(pipe.transform({ include_indices: 'YES' }, queryMetadata).include_indices).toBe(true);
    expect(validationDetail(pipe, { include_indices: ' true ' })).toEqual({
      detail: [
        {
          type: 'bool_parsing',
          loc: ['query', 'include_indices'],
          msg: 'Input should be a valid boolean, unable to interpret input',
          input: ' true ',
        },
      ],
    });
  });

  it('returns the exact ordered FastAPI issue list for multiple invalid values', () => {
    expect(
      validationDetail(pipe, {
        include_indices: 'maybe',
        page: '0',
        page_size: '101',
      }),
    ).toEqual({
      detail: [
        {
          type: 'bool_parsing',
          loc: ['query', 'include_indices'],
          msg: 'Input should be a valid boolean, unable to interpret input',
          input: 'maybe',
        },
        {
          type: 'greater_than_equal',
          loc: ['query', 'page'],
          msg: 'Input should be greater than or equal to 1',
          input: '0',
          ctx: { ge: 1 },
        },
        {
          type: 'less_than_equal',
          loc: ['query', 'page_size'],
          msg: 'Input should be less than or equal to 100',
          input: '101',
          ctx: { le: 100 },
        },
      ],
    });
  });

  it('matches Pydantic integer parsing errors', () => {
    expect(validationDetail(pipe, { page: '' })).toEqual({
      detail: [
        {
          type: 'int_parsing',
          loc: ['query', 'page'],
          msg: 'Input should be a valid integer, unable to parse string as an integer',
          input: '',
        },
      ],
    });
  });
});

describe('InstrumentsV1Controller detail compatibility', () => {
  it('uses jsonable_encoder UTC offsets and preserves six fractional digits', async () => {
    const service = {
      getBySymbol: vi.fn().mockResolvedValue(
        makeSymbolRow({
          lastSyncedAt: '2026-09-23 01:02:03.123+00',
          createdAt: '2026-09-23 01:02:03.123',
          updatedAt: '2026-09-23 01:02:03',
        }),
      ),
    } as unknown as InstrumentsService;

    const result = await new InstrumentsV1Controller(service).detail('vcb');
    expect(result.last_synced_at).toBe('2026-09-23T01:02:03.123000+00:00');
    expect(result.created_at).toBe('2026-09-23T01:02:03.123000');
    expect(result.updated_at).toBe('2026-09-23T01:02:03');
  });

  it('maps the shared not-found exception to the exact bare legacy detail', async () => {
    const service = {
      getBySymbol: vi.fn().mockRejectedValue(
        new NotFoundException({
          code: 'INSTRUMENT_NOT_FOUND',
          message: 'Không tìm thấy mã chứng khoán: MISSING',
        }),
      ),
    } as unknown as InstrumentsService;

    await expect(new InstrumentsV1Controller(service).detail('missing')).rejects.toMatchObject({
      response: { detail: 'Không tìm thấy mã chứng khoán: MISSING' },
      status: 404,
    });
  });
});
