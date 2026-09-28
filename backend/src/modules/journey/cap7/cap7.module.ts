import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../../platform/database/database.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { Cap7Controller, Cap7V1Controller } from './cap7.controller.js';
import { Cap7Service } from './cap7.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [Cap7Controller, Cap7V1Controller],
  providers: [Cap7Service],
  exports: [Cap7Service],
})
export class Cap7Module {}

export { Cap7Service } from './cap7.service.js';
export * from './cap7.types.js';
