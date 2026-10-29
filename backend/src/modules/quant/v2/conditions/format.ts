import { loadTechnicalRegistry } from '../technical-registry.js';
import {
  HISTORICAL_RULE_VERSIONS,
  HISTORICAL_SCHEMA_VERSIONS,
  RULE_VERSION,
  SCHEMA_VERSION,
  type RegistryEntry,
} from '../types.js';
import { isRowsEntry } from './definitions.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A rule version of an earlier shared config (`iqx-rules-3.0`, `iqx-rules-2.0`). */
export const isHistoricalRuleVersion = (value: unknown): boolean =>
  (HISTORICAL_RULE_VERSIONS as readonly unknown[]).includes(value);

/** A schema version of an earlier shared config (`2.0`). */
export const isHistoricalSchemaVersion = (value: unknown): boolean =>
  (HISTORICAL_SCHEMA_VERSIONS as readonly unknown[]).includes(value);

/**
 * true when a stored document is in the current format: current schema and rule versions and,
 * for every row-based indicator present, tabs without `params` whose rows carry exactly the
 * registry row ids in order. Values are not checked (`validateConfig` does that); anything else
 * is an outdated document that readers replace by defaults (SPEC V3 §6.1.5), never map.
 */
export function isCurrentFormat(
  doc: unknown,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): boolean {
  if (!isRecord(doc)) return false;
  if (doc.schema_version !== SCHEMA_VERSION || doc.rule_version !== RULE_VERSION) return false;
  const indicators = doc.indicators;
  if (!isRecord(indicators)) return false;
  for (const entry of registry) {
    if (!isRowsEntry(entry)) continue;
    const item = indicators[entry.id];
    if (item === undefined) continue;
    if (!isRecord(item)) return false;
    for (const side of ['buy', 'sell'] as const) {
      const value = item[side];
      if (!isRecord(value) || 'params' in value || !Array.isArray(value.rules)) return false;
      const ids = value.rules.map((row: unknown) => (isRecord(row) ? row.id : undefined));
      if (JSON.stringify(ids) !== JSON.stringify(entry.rows.map((row) => row.id))) return false;
    }
  }
  return true;
}
