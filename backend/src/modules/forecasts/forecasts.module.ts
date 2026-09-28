import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MarketHttpClient } from '../market-extended/market-http.client.js';
import { ForecastsController } from './forecasts.controller.js';
import { ForecastsService } from './forecasts.service.js';
import { GoogleSheetsService } from './google-sheets.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ForecastsController],
  providers: [MarketHttpClient, GoogleSheetsService, ForecastsService],
  exports: [GoogleSheetsService, ForecastsService],
})
export class ForecastsModule {}
