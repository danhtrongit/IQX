import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../platform/database/database.module.js';
import { InstrumentsController } from './instruments.controller.js';
import { InstrumentsRepository } from './instruments.repository.js';
import { InstrumentsService } from './instruments.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [InstrumentsController],
  providers: [InstrumentsRepository, InstrumentsService],
  exports: [InstrumentsRepository, InstrumentsService],
})
export class InstrumentsModule {}
