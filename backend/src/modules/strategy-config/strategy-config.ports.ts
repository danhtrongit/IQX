import type { SharedConfig } from '../quant/v2/types.js';

/**
 * Cross-module port used by the Bot (behind BOT_SHARED_CONFIG_ENABLED) to read the
 * shared Buy/Sell config revision that is effective for a given trading session.
 * Implemented by the strategy-config lane; exported from StrategyConfigModule under
 * SHARED_CONFIG_READER.
 */
export const SHARED_CONFIG_READER = Symbol('SHARED_CONFIG_READER');

export type EffectiveSharedConfig = {
  revision: number;
  config: SharedConfig;
  config_hash: string;
  /** First valid session (Asia/Ho_Chi_Minh) strictly after the save date. */
  effective_session: string;
};

export interface SharedConfigReaderPort {
  /**
   * Latest saved revision whose effective_session <= sessionDate, or null when the user
   * never saved a v2 config (Bot then keeps its existing v1 behaviour).
   */
  effectiveFor(userId: string, sessionDate: string): Promise<EffectiveSharedConfig | null>;
  /** Exact saved revision owned by the user (for backtest snapshots), or null. */
  getRevision(
    userId: string,
    revision: number,
  ): Promise<{
    revision: number;
    config: SharedConfig;
    config_hash: string;
    saved_at: string;
  } | null>;
}
