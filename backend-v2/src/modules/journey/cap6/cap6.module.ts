import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../../platform/database/database.module.js';
import { BotsModule, BotService } from '../../bots/index.js';
import { Cap5Module } from '../cap5/cap5.module.js';
import { JourneyIdentityModule, JourneyIdentityService } from '../identity/index.js';
import { CAP6_POST_GRADUATION_HOOKS, type Cap6PostGraduationHooks } from './cap6.types.js';
import { Cap6Controller } from './cap6.controller.js';
import { Cap6Service } from './cap6.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, Cap5Module, BotsModule, JourneyIdentityModule],
  controllers: [Cap6Controller],
  providers: [
    Cap6Service,
    {
      provide: CAP6_POST_GRADUATION_HOOKS,
      inject: [BotService, JourneyIdentityService],
      useFactory: (
        bots: BotService,
        identity: JourneyIdentityService,
      ): Cap6PostGraduationHooks => ({
        initializeBot: async (userId) => {
          await bots.initializeAccount(userId);
        },
        initializeMascot: async (userId) => {
          await identity.initializeAfterGraduation(userId);
        },
      }),
    },
  ],
  exports: [Cap6Service, CAP6_POST_GRADUATION_HOOKS],
})
export class Cap6Module {}
