import { Injectable, NotFoundException } from '@nestjs/common';

import type { SymbolRow } from '../../../platform/database/index.js';
import { InstrumentsRepository } from './instruments.repository.js';
import type { InstrumentSearchQuery } from './instruments.schemas.js';

export interface InstrumentSearchResult {
  items: SymbolRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class InstrumentsService {
  constructor(private readonly repository: InstrumentsRepository) {}

  async search(query: InstrumentSearchQuery): Promise<InstrumentSearchResult> {
    const { rows, total } = await this.repository.search(query);

    return {
      items: rows,
      total,
      page: query.page,
      pageSize: query.page_size,
      totalPages: total > 0 ? Math.ceil(total / query.page_size) : 0,
    };
  }

  async getBySymbol(symbol: string): Promise<SymbolRow> {
    const row = await this.repository.findBySymbol(symbol);
    if (!row?.isActive) {
      throw new NotFoundException({
        code: 'INSTRUMENT_NOT_FOUND',
        message: `Không tìm thấy mã chứng khoán: ${symbol.toUpperCase()}`,
      });
    }

    return row;
  }
}
