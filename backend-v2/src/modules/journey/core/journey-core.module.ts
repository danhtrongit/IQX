import { Global, Module } from '@nestjs/common';

import { DatabaseModule } from '../../../platform/database/index.js';
import { CoreJourneyService } from './journey-core.service.js';
import { JourneyEventController } from './journey-event.controller.js';
import { JourneyEventService } from './journey-event.service.js';
import { LearningPlanService } from './learning-plan.service.js';
import { TRADING_LEARNING_PLAN_PORT } from './journey-core.types.js';
import { TRADING_JOURNEY_PORT } from '../../trading/trading.ports.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [JourneyEventController],
  providers: [
    CoreJourneyService,
    JourneyEventService,
    LearningPlanService,
    { provide: TRADING_LEARNING_PLAN_PORT, useExisting: LearningPlanService },
    { provide: TRADING_JOURNEY_PORT, useExisting: LearningPlanService },
  ],
  exports: [
    CoreJourneyService,
    JourneyEventService,
    LearningPlanService,
    TRADING_LEARNING_PLAN_PORT,
    TRADING_JOURNEY_PORT,
  ],
})
export class JourneyCoreModule {}
