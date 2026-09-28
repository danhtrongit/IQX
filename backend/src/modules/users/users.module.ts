import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthModule } from '../auth/index.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, AdminUsersService],
  exports: [UsersService, AdminUsersService],
})
export class UsersModule {}
