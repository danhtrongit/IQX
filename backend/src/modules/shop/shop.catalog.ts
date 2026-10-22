/**
 * Server-side mascot catalog (Shop spec sections 1-2). Prices and the sale flag are always
 * resolved here, never from the client. `asset_slug` points at the existing 2D renderer
 * assets under frontend/public/assets/mascots-2d/v2/<slug>/ (manifest.json, poster.webp, ...).
 */
export const MASCOT_CATALOG_VERSION = 'iqx-mascot-shop-v2';

/** Reward/ledger policy stamped on every coin ledger row and lesson reward (audit only). */
export const COIN_POLICY_VERSION = 'iqx-shop-xu-v2';

/** +100 xu for each first valid lesson completion (one per user per stable lesson key). */
export const LESSON_REWARD_XU = 100;

/** Price of one purchasable mascot (linh thú) in xu. */
export const MASCOT_PRICE_XU = 2000;

/** Price of one Premium month paid with xu (30 days). */
export const PREMIUM_PRICE_XU = 3000;

/** Days of Premium granted by one xu purchase. */
export const PREMIUM_DURATION_DAYS = 30;

/** Price of the step from level 1 to level 2 of one mascot. */
export const PET_EVOLVE_LEVEL2_XU = 10_000;

/** Price of the step from level 2 to level 3 of one mascot (40.000 xu in total). */
export const PET_EVOLVE_LEVEL3_XU = 30_000;

/** Highest evolution level of a mascot. */
export const PET_MAX_LEVEL = 3;

/** Levels a mascot can be evolved to. */
export const PET_TARGET_LEVELS = [2, 3] as const;

/** Exchange rate between xu and Demo Trading cash: 1 xu = 10.000 VND. */
export const DEMO_CASH_PER_XU = 10_000;

/** Smallest exchange allowed: 1 xu = 10.000 VND. */
export const DEMO_CASH_MIN_EXCHANGE = 10_000;

export const MASCOT_IDS = ['bach_ho', 'thanh_long', 'loc_huou', 'phung_hoang', 'kim_quy'] as const;
export type MascotId = (typeof MASCOT_IDS)[number];

export const DEFAULT_MASCOT_ID: MascotId = 'bach_ho';

export const MASCOT_OWNERSHIP_SOURCES = ['default', 'purchase', 'legacy_grant'] as const;
export type MascotOwnershipSource = (typeof MASCOT_OWNERSHIP_SOURCES)[number];

export interface MascotCatalogEntry {
  readonly mascot_id: MascotId;
  readonly name: string;
  /** 0 for the default mascot, which is never sold. */
  readonly price_xu: number;
  readonly for_sale: boolean;
  readonly is_default: boolean;
  readonly sort_order: number;
  /** Directory name of the existing 2D renderer assets (`/assets/mascots-2d/v2/<slug>`). */
  readonly asset_slug: string;
}

export const MASCOT_CATALOG: readonly MascotCatalogEntry[] = [
  {
    mascot_id: 'bach_ho',
    name: 'Bạch Hổ',
    price_xu: 0,
    for_sale: false,
    is_default: true,
    sort_order: 1,
    asset_slug: 'bach-ho',
  },
  {
    mascot_id: 'thanh_long',
    name: 'Thanh Long',
    price_xu: MASCOT_PRICE_XU,
    for_sale: true,
    is_default: false,
    sort_order: 2,
    asset_slug: 'thanh-long',
  },
  {
    mascot_id: 'loc_huou',
    name: 'Lộc Hươu',
    price_xu: MASCOT_PRICE_XU,
    for_sale: true,
    is_default: false,
    sort_order: 3,
    asset_slug: 'loc-huou',
  },
  {
    mascot_id: 'phung_hoang',
    name: 'Phụng Hoàng',
    price_xu: MASCOT_PRICE_XU,
    for_sale: true,
    is_default: false,
    sort_order: 4,
    asset_slug: 'phung-hoang',
  },
  {
    mascot_id: 'kim_quy',
    name: 'Kim Quy',
    price_xu: MASCOT_PRICE_XU,
    for_sale: true,
    is_default: false,
    sort_order: 5,
    asset_slug: 'kim-quy',
  },
];

const BY_ID = new Map<string, MascotCatalogEntry>(MASCOT_CATALOG.map((m) => [m.mascot_id, m]));

export function findMascot(mascotId: string): MascotCatalogEntry | undefined {
  return BY_ID.get(mascotId);
}

export function isMascotId(value: unknown): value is MascotId {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Level a mascot can be evolved to (2 or 3); anything else is rejected. */
export function isPetTargetLevel(value: unknown): value is 2 | 3 {
  return value === 2 || value === 3;
}

/** Price of one evolution step, in xu. Level 3 costs 30.000 on top of the 10.000 of level 2. */
export function petEvolvePriceXu(level: 2 | 3): number {
  return level === 2 ? PET_EVOLVE_LEVEL2_XU : PET_EVOLVE_LEVEL3_XU;
}

export function mascotAssetRoot(entry: Pick<MascotCatalogEntry, 'asset_slug'>): string {
  return `/assets/mascots-2d/v2/${entry.asset_slug}`;
}
