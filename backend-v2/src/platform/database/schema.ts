import {
  bigint,
  boolean,
  doublePrecision,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Read-only mapping of the legacy `symbols` table.
 *
 * Alembic remains the schema owner while backend-v2 is introduced. Keep this
 * definition aligned with the existing migration; importing it must never
 * create or alter database objects.
 */
export const symbols = pgTable(
  'symbols',
  {
    id: uuid('id').primaryKey().notNull(),
    symbol: varchar('symbol', { length: 10 }).notNull().unique('uq_symbols_symbol'),
    name: varchar('name', { length: 500 }),
    shortName: varchar('short_name', { length: 255 }),
    exchange: varchar('exchange', { length: 20 }),
    assetType: varchar('asset_type', { length: 50 }).default('stock'),
    isIndex: boolean('is_index').default(false).notNull(),
    currentPriceVnd: bigint('current_price_vnd', { mode: 'bigint' }),
    targetPriceVnd: bigint('target_price_vnd', { mode: 'bigint' }),
    upsidePct: doublePrecision('upside_pct'),
    logoUrl: varchar('logo_url', { length: 2048 }),
    logoSource: varchar('logo_source', { length: 30 }),
    icbLv1: varchar('icb_lv1', { length: 100 }),
    icbLv2: varchar('icb_lv2', { length: 100 }),
    source: varchar('source', { length: 50 }),
    sourceUrl: varchar('source_url', { length: 2048 }),
    lastSyncedAt: timestamp('last_synced_at', {
      mode: 'string',
      withTimezone: true,
    }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: false,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: false,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('ix_symbols_symbol').on(table.symbol),
    index('ix_symbols_exchange').on(table.exchange),
    index('ix_symbols_asset_type').on(table.assetType),
    index('ix_symbols_is_index').on(table.isIndex),
  ],
);

export type SymbolRow = typeof symbols.$inferSelect;
