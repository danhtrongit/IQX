import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from '../../platform/database/index.js';
import { AuthController } from './auth.controller.js';
import { ApiAuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { EmailService } from './email.service.js';
import { PremiumGuard } from './premium.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailService,
    ApiAuthGuard,
    RolesGuard,
    PremiumGuard,
    { provide: APP_GUARD, useExisting: ApiAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_GUARD, useExisting: PremiumGuard },
  ],
  exports: [AuthService, EmailService, ApiAuthGuard, RolesGuard, PremiumGuard],
})
export class AuthModule {}
