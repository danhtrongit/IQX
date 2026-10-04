/**
 * Capability ids granted by passing a lesson quiz (CONTRACTS.md §2):
 *   technical lesson with a registry config -> `indicator:<config_id>`
 *   fundamental lesson                      -> `metric:<config_id>`
 *   every lesson                            -> `lesson:<lesson_id>`
 */
export function capabilitiesForLesson(lesson: {
  id: string;
  kind: string;
  config_id: string | null;
}): string[] {
  const capabilities: string[] = [];
  if (lesson.config_id && lesson.kind === 'technical')
    capabilities.push(`indicator:${lesson.config_id}`);
  if (lesson.config_id && lesson.kind === 'fundamental')
    capabilities.push(`metric:${lesson.config_id}`);
  capabilities.push(`lesson:${lesson.id}`);
  return capabilities;
}
