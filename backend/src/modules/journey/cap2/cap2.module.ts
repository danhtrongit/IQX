import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../platform/database/index.js';
import { Cap1Module } from '../cap1/index.js';
import { Cap2AlertsService } from './cap2.alerts.service.js';
import { Cap2Controller } from './cap2.controller.js';
import { Cap2Service } from './cap2.service.js';
@Module({
  imports: [DatabaseModule, Cap1Module],
  controllers: [Cap2Controller],
  providers: [Cap2Service, Cap2AlertsService],
  exports: [Cap2Service, Cap2AlertsService],
})
export class Cap2Module {}
