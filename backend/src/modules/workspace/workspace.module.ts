import { Module } from '@nestjs/common';

import { BotsModule } from '../bots/bots.module.js';
import { TradingModule } from '../trading/trading.module.js';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceService } from './workspace.service.js';

// ShopModule and DatabaseModule are @Global, so only the account owners are imported.
@Module({
  imports: [TradingModule, BotsModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
