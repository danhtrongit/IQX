import { loadTechnicalRegistry } from '../technical-registry.js';
import {
  RULE_VERSION,
  SCHEMA_VERSION,
  type ConditionRow,
  type IndicatorConfig,
  type ParamsSideConfig,
  type RegistryEntry,
  type RowSideConfig,
  type RowsRegistryEntry,
  type SharedConfig,
  type Side,
  type SideConfig,
} from '../types.js';
import { isRowsEntry } from './definitions.js';

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A new tab is OFF until the user turns it on (registry behaviour kept from V2). */
const DEFAULT_SIDE_ENABLED = false;

/** Default rows of one tab (SPEC V3 §3): every row with its own default values and switch. */
export function defaultRows(entry: RowsRegistryEntry, side: Side): ConditionRow[] {
  return entry.rows.map((row) => ({ id: row.id, enabled: row.default_enabled, ...row[side] }));
}

/** Default tab of one indicator: rows (15 indicators) or the registry params + rules (Volume). */
export function defaultSide(entry: RegistryEntry, side: Side): SideConfig {
  if (isRowsEntry(entry)) {
    const rows: RowSideConfig = { enabled: DEFAULT_SIDE_ENABLED, rules: defaultRows(entry, side) };
    return rows;
  }
  const params: ParamsSideConfig = {
    enabled: entry[side].enabled,
    params: jsonCopy(entry[side].params),
    rules: jsonCopy(entry[side].rules),
  };
  return params;
}

/** Default config of one indicator, master OFF. */
export function defaultIndicatorConfig(entry: RegistryEntry): IndicatorConfig {
  return { master_enabled: false, buy: defaultSide(entry, 'buy'), sell: defaultSide(entry, 'sell') };
}

/** Every registry indicator, master and both tabs OFF, rows at their SPEC V3 §3 defaults. */
export function defaultConfigV4(
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): SharedConfig {
  const indicators: Record<string, IndicatorConfig> = {};
  for (const entry of registry) indicators[entry.id] = defaultIndicatorConfig(entry);
  return { schema_version: SCHEMA_VERSION, revision: 1, rule_version: RULE_VERSION, indicators };
}
