import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';

import { toInstrumentDetail, toInstrumentSummary } from './instruments.mapper.js';
import {
  instrumentSearchQuerySchema,
  instrumentDetailResponseSchema,
  instrumentListResponseSchema,
  instrumentNotFoundErrorSchema,
  instrumentSymbolSchema,
  validationErrorSchema,
  type InstrumentDetailResponse,
  type InstrumentListResponse,
  type InstrumentSearchQuery,
} from './instruments.schemas.js';
import { InstrumentsService } from './instruments.service.js';
import { Public } from '../../auth/index.js';

/** Public, read-only instrument catalogue. */
@ApiTags('Instruments')
@Public()
@Controller('api/v2/instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get()
  @ApiOperation({ operationId: 'searchInstrumentsV2', summary: 'Search active instruments' })
  @ApiOkResponse({
    description: 'Ranked, paginated instrument search results.',
    schema: z.toJSONSchema(instrumentListResponseSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid search query.',
    schema: z.toJSONSchema(validationErrorSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  async search(
    @Query({ schema: instrumentSearchQuerySchema }) query: InstrumentSearchQuery,
  ): Promise<InstrumentListResponse> {
    const result = await this.instruments.search(query);

    return {
      data: result.items.map(toInstrumentSummary),
      meta: {
        pagination: {
          page: result.page,
          page_size: result.pageSize,
          total: result.total,
          total_pages: result.totalPages,
        },
      },
    };
  }

  @Get(':symbol')
  @ApiOperation({ operationId: 'getInstrumentV2', summary: 'Get one active instrument' })
  @ApiOkResponse({
    description: 'Instrument detail without internal upstream URLs.',
    schema: z.toJSONSchema(instrumentDetailResponseSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  @ApiNotFoundResponse({
    description: 'Instrument does not exist or is inactive.',
    schema: z.toJSONSchema(instrumentNotFoundErrorSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  })
  async detail(
    @Param('symbol', { schema: instrumentSymbolSchema }) symbol: string,
  ): Promise<InstrumentDetailResponse> {
    const row = await this.instruments.getBySymbol(symbol);
    return { data: toInstrumentDetail(row), meta: {} };
  }
}
