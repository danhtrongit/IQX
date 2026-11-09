import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/database.module.js';
import { CANDLE_DOJO_CONTENT, loadCandleDojoContent } from './candle-dojo.content.js';
import { CandleDojoController } from './candle-dojo.controller.js';
import { CandleDojoRepository, PgCandleDojoRepository } from './candle-dojo.repository.js';
import { CandleDojoService } from './candle-dojo.service.js';

/**
 * Candle Dojo (spec v1.2): học nến bằng biểu đồ, thi đai, luyện công và bộ 47 thẻ nến. Dùng ví xu và sổ cái
 * của Shop qua `ShopRepository` (ShopModule là Global); thẻ nến đã mua được Flashback tra theo bảng
 * `cd_user_cards`.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [CandleDojoController],
  providers: [
    PgCandleDojoRepository,
    { provide: CandleDojoRepository, useExisting: PgCandleDojoRepository },
    { provide: CANDLE_DOJO_CONTENT, useFactory: loadCandleDojoContent },
    CandleDojoService,
  ],
  exports: [CandleDojoService, CandleDojoRepository],
})
export class CandleDojoModule {}
