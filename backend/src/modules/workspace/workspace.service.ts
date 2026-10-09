import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../platform/database/database.service.js';
import { BotService } from '../bots/bot.service.js';
import { ShopService } from '../shop/shop.service.js';
import { TradingService } from '../trading/trading.service.js';
import type { WorkspaceEnsureResult, WorkspaceState } from './workspace.schemas.js';

function money(value: unknown): number | null {
  if (value == null) return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError('Money value exceeds the safe range');
  return result;
}

type StateRow = {
  manual: {
    id: string;
    initial_cash_vnd: string;
    cash_available_vnd: string;
    cash_reserved_vnd: string;
    cash_pending_vnd: string;
  } | null;
  bot: { account_id: string; cash_vnd: string; instance_id: string | null } | null;
  wallet_balance: string | null;
};

/**
 * Workspace onboarding. No egg, level, graduation, Premium or lesson gates: every authenticated
 * user gets a manual demo account, a Bot account, a Bach Ho mascot profile and an xu wallet,
 * each created at most once. Each step is its own idempotent transaction, so a failed call
 * can simply be retried.
 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly trading: TradingService,
    private readonly bots: BotService,
    private readonly shop: ShopService,
  ) {}

  async ensure(userId: string): Promise<WorkspaceEnsureResult> {
    const manual = await this.trading.ensureInitialAccount(userId);
    const bot = await this.bots.initialize(userId);
    const shop = await this.shop.provision(userId);
    return {
      created: {
        manual_account: manual.created,
        bot: bot.initialized,
        mascot_profile: shop.mascot.created,
        wallet: shop.wallet.created,
      },
      state: await this.getState(userId),
    };
  }

  /** Read-only summary; never creates or funds anything. */
  async getState(userId: string): Promise<WorkspaceState> {
    const [row] = await this.database.query<StateRow>(
      `select
         (select json_build_object(
                   'id', a.id, 'initial_cash_vnd', a.initial_cash_vnd::text,
                   'cash_available_vnd', a.cash_available_vnd::text,
                   'cash_reserved_vnd', a.cash_reserved_vnd::text,
                   'cash_pending_vnd', a.cash_pending_vnd::text)
            from virtual_trading_accounts a where a.user_id = $1) as manual,
         (select json_build_object(
                   'account_id', ba.id, 'cash_vnd', ba.cash_vnd::text, 'instance_id', bi.id)
            from bot_accounts ba
            left join bot_instances bi on bi.user_id = ba.user_id
            where ba.user_id = $1) as bot,
         (select w.balance::text from coin_wallets w where w.user_id = $1) as wallet_balance`,
      [userId],
    );
    const shop = await this.shop.getShop(userId);
    const manual = row?.manual ?? null;
    const bot = row?.bot ?? null;
    const available = money(manual?.cash_available_vnd);
    return {
      manual_account: {
        exists: manual !== null,
        account_id: manual?.id ?? null,
        initial_cash_vnd: money(manual?.initial_cash_vnd),
        cash_available_vnd: available,
        total_cash_vnd: manual
          ? (available ?? 0) +
            (money(manual.cash_reserved_vnd) ?? 0) +
            (money(manual.cash_pending_vnd) ?? 0)
          : null,
      },
      bot: {
        exists: bot !== null,
        account_id: bot?.account_id ?? null,
        instance_id: bot?.instance_id ?? null,
        cash_vnd: money(bot?.cash_vnd),
      },
      mascot: {
        active_mascot_id: shop.active.mascot_id,
        revision: shop.active.revision,
        provisioned: shop.provisioned,
      },
      wallet: {
        balance: money(row?.wallet_balance) ?? 0,
        provisioned: row?.wallet_balance != null,
      },
    };
  }
}
