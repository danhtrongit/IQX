import type { LegacyConfigReview } from '../quant/v2/legacy-config.js';
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
  /**
   * Always the current 16-indicator shape (`iqx-rules-3.0`). For a historical revision this is
   * the mapping of the stored document, so `configHash(config)` differs from `config_hash`
   * (the hash of the stored document, kept for receipts); check `legacy` first.
   */
  config: SharedConfig;
  config_hash: string;
  /** First valid session (Asia/Ho_Chi_Minh) strictly after the save date. */
  effective_session: string;
  /**
   * null for a current revision. For a historical (35-indicator) revision a side with
   * `legacy_needs_review` must be blocked, never traded on the remaining rules.
   */
  legacy?: LegacyConfigReview | null;
};

export type GetRevisionOptions = {
  /**
   * A revision whose removed indicators were ON is refused with 422
   * LEGACY_CONFIG_NEEDS_REVIEW unless the caller handles `legacy` itself (the Bot does).
   */
  allowLegacyReview?: boolean;
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
    options?: GetRevisionOptions,
  ): Promise<{
    revision: number;
    config: SharedConfig;
    config_hash: string;
    saved_at: string;
    legacy?: LegacyConfigReview | null;
  } | null>;
}
