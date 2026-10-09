/** Prefix of the capability ids that unlock a technical indicator. */
export const INDICATOR_CAPABILITY_PREFIX = 'indicator:';
/** Prefix of the capability ids that unlock a fundamental screener metric. */
export const METRIC_CAPABILITY_PREFIX = 'metric:';
/**
 * Prefix of the LEGACY per-lesson capability ids (`lesson:<legacy lesson id>`, 18-chapter /
 * 125-lesson catalog). They are only read from the legacy `academy_grants` table so the
 * advanced backtest features keep working for legacy holders; lessons of the current
 * 13-chapter / 71-lesson catalog never grant them.
 */
export const LEGACY_LESSON_CAPABILITY_PREFIX = 'lesson:';

export type CapabilityBinding =
  { kind: 'technical'; id: string } | { kind: 'fundamental'; id: string } | null;

/**
 * Capability ids granted by completing a lesson of the current catalog:
 *   technical lesson   -> `indicator:<indicator id>`  e.g. indicator:rsi
 *   fundamental lesson -> `metric:<metric id>`        e.g. metric:roe
 *   concept / guide    -> nothing (Hợp lưu and the Backtest/Filter guides open no tool).
 * There is no `lesson:<id>` capability for current lessons.
 */
export function capabilitiesForLesson(lesson: { capability_binding: CapabilityBinding }): string[] {
  const binding = lesson.capability_binding;
  if (binding === null) return [];
  return [
    binding.kind === 'technical'
      ? `${INDICATOR_CAPABILITY_PREFIX}${binding.id}`
      : `${METRIC_CAPABILITY_PREFIX}${binding.id}`,
  ];
}
