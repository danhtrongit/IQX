import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../platform/database/index.js';
import { JourneyCoreModule } from '../core/index.js';
import { Cap4Controller } from './cap4.controller.js';
import { Cap4Service } from './cap4.service.js';

@Module({
  imports: [DatabaseModule, JourneyCoreModule],
  controllers: [Cap4Controller],
  providers: [Cap4Service],
  exports: [Cap4Service],
})
export class Cap4Module {}
