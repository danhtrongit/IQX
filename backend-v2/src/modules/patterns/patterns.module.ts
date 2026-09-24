import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ForecastsModule } from '../forecasts/forecasts.module.js';
import { PatternsController } from './patterns.controller.js';
import { PatternsService } from './patterns.service.js';

@Module({
  imports: [AuthModule, ForecastsModule],
  controllers: [PatternsController],
  providers: [PatternsService],
  exports: [PatternsService],
})
export class PatternsModule {}
