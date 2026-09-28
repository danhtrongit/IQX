import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../platform/database/index.js';
import { Cap0Controller } from './cap0.controller.js';
import { Cap0Service } from './cap0.service.js';
import { JourneyCoreModule } from '../core/index.js';

@Module({
  imports: [DatabaseModule, JourneyCoreModule],
  controllers: [Cap0Controller],
  providers: [Cap0Service],
  exports: [Cap0Service],
})
export class Cap0Module {}
