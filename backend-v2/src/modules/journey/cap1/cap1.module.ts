import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../platform/database/index.js';
import { Cap1Controller } from './cap1.controller.js';
import { Cap1Service } from './cap1.service.js';
@Module({
  imports: [DatabaseModule],
  controllers: [Cap1Controller],
  providers: [Cap1Service],
  exports: [Cap1Service],
})
export class Cap1Module {}
