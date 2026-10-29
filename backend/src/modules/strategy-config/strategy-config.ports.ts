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
   * Always the current shape (`iqx-rules-4.0`). For an outdated revision (`outdated: true`) this
   * is the SPEC V3 reset of the stored document (defaults + the user's switches), so
   * `configHash(config)` differs from `config_hash` (the hash of the stored document, kept for
   * receipts).
   */
  config: SharedConfig;
  config_hash: string;
  /** First valid session (Asia/Ho_Chi_Minh) strictly after the save date. */
  effective_session: string;
  /**
   * true when the stored document is not in the current format (`iqx-rules-3.0`, `iqx-rules-2.0`
   * or unreadable). Its conditions were never mapped (SPEC V3 §6.1.5): never trade on it.
   */
  outdated?: boolean;
  /**
   * null for a current revision. For an outdated revision both sides are `legacy_needs_review`
   * (`reset: true`), so a caller that only knows the review still blocks it.
   */
  legacy?: LegacyConfigReview | null;
};

export type GetRevisionOptions = {
  /**
   * An outdated revision is refused with 422 CONFIG_FORMAT_OUTDATED (Backtest create, Alert
   * source) unless the caller handles `outdated` itself (Bot pins and history).
   */
  allowOutdated?: boolean;
  /** @deprecated Same as `allowOutdated` (the pre-V3 name, kept for existing callers). */
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
    outdated?: boolean;
    legacy?: LegacyConfigReview | null;
  } | null>;
}
