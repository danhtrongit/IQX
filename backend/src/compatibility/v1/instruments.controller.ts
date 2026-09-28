import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { LegacyInstrumentQueryPipe } from './legacy-instrument-query.pipe.js';
import { Public } from '../../modules/auth/index.js';

import {
  InstrumentsService,
  instrumentSymbolSchema,
  legacyErrorSchema,
  legacyInstrumentDetailSchema,
  legacyInstrumentSearchResponseSchema,
  toLegacyInstrumentDetail,
  toLegacyInstrumentSearchItem,
  type InstrumentSearchQuery,
  type LegacyInstrumentDetail,
  type LegacyInstrumentSearchItem,
} from '../../modules/market/instruments/index.js';

export interface LegacyInstrumentSearchResponse {
  items: LegacyInstrumentSearchItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const legacyValidationErrorSchema: SchemaObject = {
  type: 'object',
  properties: {
    detail: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          loc: { type: 'array', items: { type: 'string' } },
          msg: { type: 'string' },
          input: {},
          ctx: { type: 'object', additionalProperties: true },
        },
        required: ['type', 'loc', 'msg', 'input'],
      },
    },
  },
  required: ['detail'],
};

const legacyDetailErrorSchema: SchemaObject = {
  type: 'object',
  properties: { detail: { type: 'string' } },
  required: ['detail'],
};

/** Public v1 aliases retained while existing clients migrate to Instruments v2. */
@ApiTags('Compatibility: Instruments v1')
@Public()
@Controller('api/v1/market-data/reference/symbols')
export class InstrumentsV1Controller {
  constructor(private readonly instruments: InstrumentsService) {}

  // Keep the static route before :symbol for parity with the FastAPI router.
  @Get('search')
  @ApiOperation({ operationId: 'searchSymbolsV1Compatibility' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'exchange', required: false, type: String })
  @ApiQuery({ name: 'asset_type', required: false, type: String })
  @ApiQuery({ name: 'include_indices', required: false, type: Boolean, default: false })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1, minimum: 1 })
  @ApiQuery({
    name: 'page_size',
    required: false,
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @ApiOkResponse({
    description: 'Legacy bare search response.',
    schema: z.toJSONSchema(legacyInstrumentSearchResponseSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid legacy search query.',
    schema: legacyValidationErrorSchema,
  })
  @ApiInternalServerErrorResponse({
    description: 'A bigint price cannot be represented safely by the legacy number contract.',
    schema: z.toJSONSchema(legacyErrorSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  async search(
    @Query(LegacyInstrumentQueryPipe) query: InstrumentSearchQuery,
  ): Promise<LegacyInstrumentSearchResponse> {
    const result = await this.instruments.search(query);
    return {
      items: result.items.map(toLegacyInstrumentSearchItem),
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      total_pages: result.totalPages,
    };
  }

  @Get(':symbol')
  @ApiOperation({ operationId: 'getSymbolV1Compatibility' })
  @ApiOkResponse({
    description: 'Legacy bare symbol detail response.',
    schema: z.toJSONSchema(legacyInstrumentDetailSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @ApiNotFoundResponse({
    description: 'Symbol does not exist or is inactive.',
    schema: legacyDetailErrorSchema,
  })
  async detail(
    @Param('symbol', { schema: instrumentSymbolSchema }) symbol: string,
  ): Promise<LegacyInstrumentDetail> {
    let row;
    try {
      row = await this.instruments.getBySymbol(symbol);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException({
          detail: `Không tìm thấy mã chứng khoán: ${symbol.toUpperCase()}`,
        });
      }
      throw error;
    }

    const detail = toLegacyInstrumentDetail(row);
    if (detail.last_synced_at?.endsWith('Z')) {
      detail.last_synced_at = `${detail.last_synced_at.slice(0, -1)}+00:00`;
    }
    return detail;
  }
}

// Transitional named export for consumers that adopted the earlier draft name.
export { InstrumentsV1Controller as V1InstrumentsController };
