import { loadTechnicalRegistry } from '../technical-registry.js';
import type {
  ParamsRegistryEntry,
  RegistryEntry,
  RowDefinition,
  RowValues,
  RowsRegistryEntry,
} from '../types.js';

/** The single definition source of the 15 row-based indicators is the technical registry. */

export const isRowsEntry = (entry: RegistryEntry): entry is RowsRegistryEntry =>
  entry.model === 'rows';

export const isParamsEntry = (entry: RegistryEntry): entry is ParamsRegistryEntry =>
  entry.model === 'legacy_params';

/** Row definition by its stable id (`rsi.trend`), or undefined. */
export function rowDefinition(
  rowId: string,
  registry: readonly RegistryEntry[] = loadTechnicalRegistry(),
): RowDefinition | undefined {
  for (const entry of registry) {
    if (!isRowsEntry(entry)) continue;
    const found = entry.rows.find((row) => row.id === rowId);
    if (found) return found;
  }
  return undefined;
}

export type SentencePart = { text: string } | { field: string };

/** Split a row sentence into fixed text and `{field}` placeholders, in order. */
export function sentenceParts(sentence: string): SentencePart[] {
  const parts: SentencePart[] = [];
  let last = 0;
  for (const match of sentence.matchAll(/\{([a-z_]+)\}/g)) {
    if (match.index > last) parts.push({ text: sentence.slice(last, match.index) });
    parts.push({ field: match[1]! });
    last = match.index + match[0].length;
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last) });
  return parts;
}

/**
 * Row text with its values, e.g. `RSI 14 < 30`, `Giá cắt lên SMA 20` (enum codes shown by their
 * label; numbers as plain JS numbers). A missing value renders as `?`.
 */
export function renderRowSentence(definition: RowDefinition, values: Readonly<RowValues>): string {
  return definition.sentence.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
    const value = values[key];
    const field = definition.fields.find((f) => f.key === key);
    if (field?.type === 'enum') {
      return field.options.find((o) => o.value === value)?.label ?? String(value ?? '?');
    }
    return value === undefined ? '?' : String(value);
  });
}
