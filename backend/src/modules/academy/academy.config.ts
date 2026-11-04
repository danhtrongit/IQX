import type { AcademyContent, AcademyItem } from './academy.content.types.js';
import {
  chapterIdOf,
  itemStates,
  withChapterNo,
  type AcademyAccessMode,
  type ItemState,
  type SequenceItem,
} from './content/v4/schema.js';

/**
 * Học viện v4.1 · Cấu hình Học viện theo trưởng nhóm (supplement §1-§3). This file is pure: it knows the shape of a
 * config, the rules that normalise one, and turns (content, config) into the learner's PROGRAM: the chapters he
 * learns, numbered again from 1 (`display_no`, spec §2), the chain his access mode runs over (spec §3) and N, the
 * number of required lessons (spec §2.4). Nothing here reads the database; `AcademyConfigService` resolves which
 * config applies to a user and `AcademyService` builds the program once per request.
 */

/** What a config stores (spec §1.2, §8.1). `chapter_ids` are fixed catalog ids (`ch03`) in catalog order. */
export interface AcademyConfigData {
  mode: AcademyAccessMode;
  chapter_ids: readonly string[];
}

/** Which rule picked the config of a user (spec §1.1, §8.2). `admin` is the built-in "all chapters, free" view. */
export type AcademyConfigSource = 'default' | 'leader' | 'admin';

export interface ResolvedAcademyConfig extends AcademyConfigData {
  source: AcademyConfigSource;
  /** Row id of the config; null for the built-in admin config. */
  config_id: string | null;
}

/** Fixed ids of every published chapter, in catalog order. */
export function allChapterIds(content: AcademyContent): string[] {
  return content.catalog.chapters.flatMap((chapter) =>
    chapter.published ? [chapterIdOf(chapter.no)] : [],
  );
}

/** The config the rollout ships (spec §1.2, §11.1): Học tự do, every chapter. */
export function fullConfigData(content: AcademyContent): AcademyConfigData {
  return { mode: 'free', chapter_ids: allChapterIds(content) };
}

/** Administrators see all 12 chapters and learn freely, to check the content (spec §1.1). */
export function adminConfig(content: AcademyContent): ResolvedAcademyConfig {
  return { ...fullConfigData(content), source: 'admin', config_id: null };
}

export type ChapterIdsCheck =
  | { ok: true; chapter_ids: string[] }
  | { ok: false; reason: 'empty' | 'unknown'; unknown: string[] };

/**
 * Validates the chapters of a config being saved (spec §8.3: not empty, valid): every id must be a published chapter.
 * Duplicates collapse and the result is in catalog order, which is how a config stores them (spec §8.1).
 */
export function normalizeChapterIds(
  content: AcademyContent,
  chapterIds: readonly string[],
): ChapterIdsCheck {
  const known = allChapterIds(content);
  const unknown = [...new Set(chapterIds.filter((id) => !known.includes(id)))];
  if (unknown.length) return { ok: false, reason: 'unknown', unknown };
  const chosen = new Set(chapterIds);
  if (chosen.size === 0) return { ok: false, reason: 'empty', unknown: [] };
  return { ok: true, chapter_ids: known.filter((id) => chosen.has(id)) };
}

/** One chapter of a learner's program. */
export interface ProgramChapter {
  /** Fixed id (`ch03`); never changes with the numbering. */
  readonly chapter_id: string;
  /** Number in the catalog (1..12). Internal: a learner never sees it. */
  readonly chapter: number;
  /** The number the learner sees: 1..k over his chapters (spec §2.1). Computed here, never by a client. */
  readonly display_no: number;
  readonly title: string;
  readonly audience: 'all';
  /** Required lessons of the chapter. */
  readonly lesson_count: number;
  readonly items: readonly AcademyItem[];
}

/** The chapters, chain and totals a learner's config gives him. */
export interface AcademyProgram {
  readonly mode: AcademyAccessMode;
  readonly chapters: readonly ProgramChapter[];
  /** The learning chain (`buildSequence`) restricted to the program's chapters; `index` renumbered from 0. */
  readonly sequence: readonly SequenceItem[];
  /** N: required lessons of the program's chapters. The optional practice never counts (spec §2.4). */
  readonly requiredTotal: number;
  /** The program chapter an item belongs to; undefined when the item's chapter is not in the learner's config. */
  chapterOf(itemId: string): ProgramChapter | undefined;
  /** Item states for the learner's completed lesson keys under the program's mode (spec §3, §7). */
  states(completedKeys: ReadonlySet<string>): Map<string, ItemState>;
}

/**
 * Builds the program of a config. Chapters keep catalog order; `display_no` counts from 1 over the chosen ones. A stored
 * id the catalog no longer knows is ignored; a config left with no chapter at all falls back to every chapter, so a
 * corrupted row never leaves a learner with an empty Academy (the API refuses to store such a config in the first place).
 */
export function buildAcademyProgram(
  content: AcademyContent,
  config: AcademyConfigData,
): AcademyProgram {
  const chosen = new Set(config.chapter_ids);
  let published = content.catalog.chapters.filter((chapter) => chapter.published);
  const picked = published.filter((chapter) => chosen.has(chapterIdOf(chapter.no)));
  if (picked.length > 0) published = picked;

  const chapters: ProgramChapter[] = published.map((chapter, index) => ({
    chapter_id: chapterIdOf(chapter.no),
    chapter: chapter.no,
    display_no: index + 1,
    title: chapter.title,
    audience: chapter.audience,
    lesson_count: chapter.lesson_count,
    items: chapter.items.map((entry) => {
      const item = content.items.get(entry.id);
      if (!item) throw new Error(`academy content has no item ${entry.id}`);
      return item;
    }),
  }));
  const byItem = new Map(
    chapters.flatMap((chapter) => chapter.items.map((item) => [item.id, chapter] as const)),
  );
  const sequence = content.sequence
    .filter((entry) => byItem.has(entry.id))
    .map((entry, index): SequenceItem => ({ ...entry, index }));
  const mode = config.mode;
  return {
    mode,
    chapters,
    sequence,
    requiredTotal: chapters.reduce((sum, chapter) => sum + chapter.lesson_count, 0),
    chapterOf: (itemId) => byItem.get(itemId),
    states: (completedKeys) => itemStates(sequence, completedKeys, mode),
  };
}

/**
 * Exam names and intros are stored as templates ("Bài thi Chương {n}", spec §2.3); the learner's own chapter number
 * replaces `{n}` when an item is served. Lessons carry no placeholder and come back unchanged.
 */
export const displayName = (item: Pick<AcademyItem, 'name'>, displayNo: number): string =>
  withChapterNo(item.name, displayNo);

export const displayIntro = (item: Pick<AcademyItem, 'intro'>, displayNo: number): string | null =>
  item.intro === null ? null : withChapterNo(item.intro, displayNo);

/** The line staff see for an item in the learner's numbering (spec §8.4): "Chương 2 · Bài 3: tên", "Bài thi Chương 2". */
export function itemLabel(item: AcademyItem, displayNo: number): string {
  if (item.kind === 'chapter_exam') return displayName(item, displayNo);
  if (item.kind === 'practice') return `Chương ${displayNo} · ${item.name}`;
  return `Chương ${displayNo} · Bài ${item.position ?? item.order}: ${item.name}`;
}
