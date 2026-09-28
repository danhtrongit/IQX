import { Module } from '@nestjs/common';
import { Cap0Module } from './cap0/index.js';
import { Cap1Module } from './cap1/index.js';
import { Cap2Module } from './cap2/index.js';
import { Cap3Module } from './cap3/index.js';
import { Cap4Module } from './cap4/index.js';
import { Cap5Module } from './cap5/index.js';
import { Cap6Module } from './cap6/index.js';
import { Cap7Module } from './cap7/index.js';
import { Cap8Module } from './cap8/index.js';
import { JourneyCoreModule } from './core/index.js';
import { JourneyIdentityModule } from './identity/identity.module.js';
@Module({
  imports: [
    JourneyCoreModule,
    JourneyIdentityModule,
    Cap0Module,
    Cap1Module,
    Cap2Module,
    Cap3Module,
    Cap4Module,
    Cap5Module,
    Cap6Module,
    Cap7Module,
    Cap8Module,
  ],
  exports: [
    JourneyCoreModule,
    JourneyIdentityModule,
    Cap0Module,
    Cap1Module,
    Cap2Module,
    Cap3Module,
    Cap4Module,
    Cap5Module,
    Cap6Module,
    Cap7Module,
    Cap8Module,
  ],
})
export class JourneyModule {}
