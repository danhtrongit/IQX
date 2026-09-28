import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../platform/database/index.js';
import { JourneyCoreModule } from '../core/index.js';
import { Cap3Controller } from './cap3.controller.js';
import { Cap3Service } from './cap3.service.js';

@Module({
  imports: [DatabaseModule, JourneyCoreModule],
  controllers: [Cap3Controller],
  providers: [Cap3Service],
  exports: [Cap3Service],
})
export class Cap3Module {}
