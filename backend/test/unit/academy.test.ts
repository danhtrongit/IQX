import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AcademyEnabledGuard } from '../../src/modules/academy/academy-enabled.guard.js';
import {
  AcademyGrantsService,
  capabilitiesFromCompletions,
} from '../../src/modules/academy/academy-grants.service.js';
import { capabilitiesForLesson } from '../../src/modules/academy/academy.capabilities.js';
import {
  ACADEMY_CATALOG_VERSION,
  ACADEMY_LEGACY_CATALOG_VERSION,
  buildAcademyContent,
  canonicalHash,
  canonicalJson,
  loadAcademyContent,
  readAcademyContentFiles,
  type AcademyContent,
  type AcademyContentFiles,
} from '../../src/modules/academy/academy.content.js';
import {
  findInvalidAnswers,
  gradeAnswers,
  shuffle,
} from '../../src/modules/academy/academy.grading.js';
import {
  legacyMappingRows,
  loadRemovedLegacyLessons,
  parseMigrationMapping,
} from '../../src/modules/academy/academy.legacy-mapping.js';
import {
  AcademyRepository,
  AcademySqlStore,
  type AcademyStore,
  type AcademyStoreProvider,
  type AnswerRow,
  type AttemptRow,
  type CompletionRow,
} from '../../src/modules/academy/academy.repository.js';
import { AcademyService, buildProgress } from '../../src/modules/academy/academy.service.js';
import { loadTechnicalRegistry } from '../../src/modules/quant/v2/index.js';
import { loadFundamentalRegistry } from '../../src/modules/screener/screener.registry.js';
import type { Environment } from '../../src/platform/config/environment.js';
import type { SqlClient } from '../../src/platform/database/index.js';
import {
  LESSON_REWARD_PORT,
  type LessonRewardInput,
  type LessonRewardPort,
  type LessonRewardResult,
} from '../../src/platform/ports/lesson-reward.port.js';
import { buildLegacyMappingReport } from '../../scripts/academy-legacy-mapping-report.js';

const USER = '00000000-0000-4000-8000-000000000001';
const OTHER_USER = '00000000-0000-4000-8000-000000000002';
const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, '../../src/modules/academy/content');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

/** In-memory store; transactions are serialized and rolled back on error like the row lock + tx. */
class MemoryAcademy implements AcademyStoreProvider, AcademyStore {
  attempts: AttemptRow[] = [];
  answerRows: AnswerRow[] = [];
  completionRows: CompletionRow[] = [];
  legacyCapabilities = new Map<string, string[]>();
  readonly tx = { query: () => Promise.resolve([]) } as unknown as SqlClient;
  private queue: Promise<unknown> = Promise.resolve();

  store(): AcademyStore {
    return this;
  }

  transaction<T>(operation: (store: AcademyStore, tx: SqlClient) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const snapshot = structuredClone({
        attempts: this.attempts,
        answerRows: this.answerRows,
        completionRows: this.completionRows,
      });
      try {
        return await operation(this, this.tx);
      } catch (error) {
        Object.assign(this, snapshot);
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async insertAttempt(attempt: Parameters<AcademyStore['insertAttempt']>[0]) {
    await Promise.resolve();
    if (
      this.attempts.some(
        (row) => row.user_id === attempt.user_id && row.idempotency_key === attempt.idempotency_key,
      )
    )
      return null;
    const row: AttemptRow = {
      ...structuredClone(attempt),
      status: 'open',
      created_at: new Date(),
      submitted_at: null,
      score: null,
      passed: null,
    };
    this.attempts.push(row);
    return structuredClone(row);
  }

  async attemptByIdempotencyKey(userId: string, key: string) {
    await Promise.resolve();
    const row = this.attempts.find(
      (item) => item.user_id === userId && item.idempotency_key === key,
    );
    return row ? structuredClone(row) : null;
  }

  async lockAttempt(userId: string, attemptId: string) {
    await Promise.resolve();
    const row = this.attempts.find((item) => item.id === attemptId && item.user_id === userId);
    return row ? structuredClone(row) : null;
  }

  async markSubmitted(attemptId: string, score: number, passed: boolean) {
    await Promise.resolve();
    const row = this.attempts.find((item) => item.id === attemptId && item.status === 'open');
    if (!row) return null;
    Object.assign(row, { status: 'submitted', submitted_at: new Date(), score, passed });
    return structuredClone(row);
  }

  async answers(attemptId: string) {
    await Promise.resolve();
    return this.answerRows.filter((row) => row.attempt_id === attemptId);
  }

  async insertAnswers(answers: readonly AnswerRow[]) {
    await Promise.resolve();
    for (const answer of answers) {
      if (
        this.answerRows.some(
          (row) => row.attempt_id === answer.attempt_id && row.question_id === answer.question_id,
        )
      )
        throw new Error('duplicate answer primary key');
      this.answerRows.push({ ...answer });
    }
  }

  async lockUser() {
    await Promise.resolve();
  }

  async completion(userId: string, lessonKey: string) {
    await Promise.resolve();
    const row = this.completionRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    return row ? structuredClone(row) : null;
  }

  async completionByRequestId(userId: string, requestId: string) {
    await Promise.resolve();
    const row = this.completionRows.find(
      (item) => item.user_id === userId && item.request_id === requestId,
    );
    return row ? structuredClone(row) : null;
  }

  async insertCompletion(completion: Parameters<AcademyStore['insertCompletion']>[0]) {
    await Promise.resolve();
    if (
      this.completionRows.some(
        (row) => row.user_id === completion.user_id && row.lesson_key === completion.lesson_key,
      )
    )
      return null;
    if (
      completion.request_id !== null &&
      this.completionRows.some(
        (row) => row.user_id === completion.user_id && row.request_id === completion.request_id,
      )
    )
      throw new Error('unique (user_id, request_id) violated');
    const row: CompletionRow = { ...structuredClone(completion), completed_at: new Date() };
    this.completionRows.push(row);
    return structuredClone(row);
  }

  async attachReward(userId: string, lessonKey: string, reward: Record<string, unknown>) {
    await Promise.resolve();
    const row = this.completionRows.find(
      (item) => item.user_id === userId && item.lesson_key === lessonKey,
    );
    if (row) row.source = { ...row.source, reward };
  }

  async completions(userId: string) {
    await Promise.resolve();
    return this.completionRows
      .filter((row) => row.user_id === userId)
      .map((row) => structuredClone(row));
  }

  async legacyLessonCapabilities(userId: string) {
    await Promise.resolve();
    return this.legacyCapabilities.get(userId) ?? [];
  }
}

/** Reward hook double: credits 100 once per (user, lesson key) like the Shop ledger would. */
class FakeRewards implements LessonRewardPort {
  readonly calls: Array<{ tx: SqlClient; input: LessonRewardInput }> = [];
  private readonly rewarded = new Set<string>();
  balance = 0;
  failWith: Error | null = null;

  creditFirstCompletion(tx: SqlClient, input: LessonRewardInput): Promise<LessonRewardResult> {
    this.calls.push({ tx, input });
    if (this.failWith) return Promise.reject(this.failWith);
    const key = `${input.userId}|${input.lessonKey}`;
    if (this.rewarded.has(key))
      return Promise.resolve({ status: 'already_rewarded', balanceAfter: this.balance });
    this.rewarded.add(key);
    this.balance += 100;
    return Promise.resolve({
      status: 'credited',
      delta: 100,
      balanceAfter: this.balance,
      ledgerEntryId: `ledger-${this.calls.length}`,
    });
  }
}

class TestAcademyService extends AcademyService {
  constructor(
    repository: AcademyStoreProvider,
    rewards: LessonRewardPort | undefined,
    private readonly fixture?: AcademyContent,
  ) {
    super(repository, rewards);
  }
  protected override readonly content = (): AcademyContent => this.fixture ?? loadAcademyContent();
}

/** Real content with chosen guide lessons published (typed blocks) to exercise the guide flow. */
function contentWithPublishedGuides(...lessonIds: string[]): AcademyContent {
  const files = readAcademyContentFiles();
  const catalog = structuredClone(files.catalog) as {
    chapters: Array<{ lessons: Array<{ id: string; content_status: string }> }>;
  };
  const lessons = new Map(files.lessons);
  for (const lesson of catalog.chapters.flatMap((chapter) => chapter.lessons)) {
    if (!lessonIds.includes(lesson.id)) continue;
    lesson.content_status = 'published';
    lessons.set(lesson.id, {
      lesson_id: lesson.id,
      content_version: '1.0.0',
      sections: [
        {
          id: 'overview',
          title: 'Tổng quan',
          blocks: [
            { type: 'text', text: 'Giới thiệu.' },
            { type: 'formula', expression: 'a < b ∈ (0, 1)' },
            { type: 'table', header: ['Cột'], rows: [['1']] },
            { type: 'image', asset_id: 'img1', alt: 'Ảnh hướng dẫn' },
            { type: 'chart', chart_id: 'ch1' },
          ],
        },
      ],
      assets: [
        { id: 'img1', kind: 'image', ref: 'assets/img1.png' },
        { id: 'ch1', kind: 'chart', ref: 'charts/ch1' },
      ],
    });
  }
  return buildAcademyContent({ ...files, catalog, lessons });
}

function setup(options: { rewards?: boolean; content?: AcademyContent } = {}) {
  const memory = new MemoryAcademy();
  const rewards = options.rewards === false ? undefined : new FakeRewards();
  return {
    memory,
    rewards,
    service: new TestAcademyService(memory, rewards, options.content),
    grants: new AcademyGrantsService(memory),
  };
}

function answerKey(lessonId: string) {
  return loadAcademyContent().lessons.get(lessonId)!.assessment!.questions;
}

function correctAnswers(lessonId: string) {
  return answerKey(lessonId).map((question) => ({
    question_id: question.id,
    option_id: question.correct_option_id,
  }));
}

function wrongAnswer(lessonId: string, index: number) {
  const question = answerKey(lessonId)[index]!;
  return question.options.find((option) => option.id !== question.correct_option_id)!.id;
}

function deepKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => deepKeys(item, keys));
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      deepKeys(item, keys);
    }
  return keys;
}

async function start(service: AcademyService, lessonId = 'ch01-l01', key = 'attempt-key-0001') {
  return service.createAttempt(USER, {
    lesson_id: lessonId,
    catalog_version: ACADEMY_CATALOG_VERSION,
    idempotency_key: key,
  });
}

async function pass(service: AcademyService, lessonId: string, key: string) {
  const attempt = await start(service, lessonId, key);
  return service.submit(USER, attempt.attempt_id, { answers: correctAnswers(lessonId) });
}

describe('academy catalog (13 chapters / 71 lessons)', () => {
  const content = loadAcademyContent();
  const lessons = [...content.lessons.values()];

  it('has exactly 13 chapters and 71 lessons with the approved per-chapter counts', () => {
    expect(content.catalog_version).toBe('iqx-academy-outline-13ch-71lessons-v1');
    expect(content.chapters).toHaveLength(13);
    expect(lessons).toHaveLength(71);
    expect(content.chapters.map((chapter) => chapter.lessons.length)).toEqual([
      6, 6, 6, 6, 5, 6, 3, 6, 6, 3, 6, 6, 6,
    ]);
    expect(loadAcademyContent()).toBe(content);
  });

  it('matches the approved catalogData chapter titles, lesson names, order and types', () => {
    const spec = readJson(join(here, 'fixtures/academy-catalog-spec.json')) as Array<{
      no: number;
      title: string;
      type: string;
      lessons: Array<{ id: string; name: string; indicator: string | null; type: string }>;
    }>;
    expect(spec).toHaveLength(13);
    spec.forEach((chapter, index) => {
      const actual = content.chapters[index]!;
      expect({ no: actual.no, title: actual.title, type: actual.type }).toEqual({
        no: chapter.no,
        title: chapter.title,
        type: chapter.type,
      });
      expect(actual.lessons.map((lesson) => [lesson.id, lesson.name, lesson.kind])).toEqual(
        chapter.lessons.map((lesson) => [lesson.id, lesson.name, lesson.type]),
      );
      chapter.lessons.forEach((lesson, position) => {
        const actualLesson = actual.lessons[position]!;
        expect(actualLesson.capability_binding?.id ?? null, lesson.id).toBe(
          lesson.type === 'technical'
            ? lesson.indicator
            : (actualLesson.capability_binding?.id ?? null),
        );
      });
    });
  });

  it('counts 16 technical + 42 fundamental + 1 concept + 12 guide lessons: 59 quiz, 12 guide', () => {
    const byKind = (kind: string) => lessons.filter((lesson) => lesson.kind === kind);
    expect(byKind('technical')).toHaveLength(16);
    expect(byKind('fundamental')).toHaveLength(42);
    expect(byKind('concept')).toHaveLength(1);
    expect(byKind('guide')).toHaveLength(12);
    expect(lessons.filter((lesson) => lesson.completion.mode === 'quiz')).toHaveLength(59);
    expect(lessons.filter((lesson) => lesson.completion.mode === 'guide')).toHaveLength(12);
    expect(
      byKind('guide')
        .map((lesson) => lesson.id)
        .sort(),
    ).toEqual([
      ...['01', '02', '03', '04', '05', '06'].map((n) => `ch02-l${n}`),
      ...['01', '02', '03', '04', '05', '06'].map((n) => `ch04-l${n}`),
    ]);
    expect(byKind('concept').map((lesson) => lesson.id)).toEqual(['ch01-l06']);
  });

  it('uses the stable lesson key formats', () => {
    for (const lesson of lessons) {
      if (lesson.kind === 'technical')
        expect(lesson.lesson_key).toBe(`technical:${lesson.capability_binding?.id}`);
      else if (lesson.kind === 'fundamental')
        expect(lesson.lesson_key).toBe(`fundamental:${lesson.capability_binding?.id}`);
      else if (lesson.kind === 'concept') expect(lesson.lesson_key).toBe('concept:hop_luu');
      else expect(lesson.lesson_key).toBe(`guide:${lesson.id}`);
    }
    expect(new Set(lessons.map((lesson) => lesson.lesson_key)).size).toBe(71);
    expect(content.lessons.get('ch05-l04')?.lesson_key).toBe('technical:stochastic');
    expect(content.lessons.get('ch07-l01')?.lesson_key).toBe('technical:obv');
  });

  it('binds technical lessons to the 16-indicator registry (new chapter and lesson ids)', () => {
    const registry = loadTechnicalRegistry();
    const technical = lessons.filter((lesson) => lesson.kind === 'technical');
    expect(technical.map((lesson) => lesson.capability_binding?.id).sort()).toEqual(
      registry.map((entry) => entry.id).sort(),
    );
    for (const entry of registry) {
      const lesson = content.lessonsByKey.get(`technical:${entry.id}`)!;
      expect(lesson.id, entry.id).toBe(entry.lesson_id);
      expect(lesson.chapter, entry.id).toBe(entry.chapter);
      expect(lesson.legacy_lesson_ids, entry.id).toEqual([entry.legacy_lesson_id]);
    }
  });

  it('binds fundamental lessons to the 42 real screener metric ids by lesson id and name', () => {
    const metrics = loadFundamentalRegistry();
    expect(metrics).toHaveLength(42);
    const fundamental = lessons.filter((lesson) => lesson.kind === 'fundamental');
    expect(fundamental.map((lesson) => lesson.capability_binding?.id).sort()).toEqual(
      metrics.map((metric) => metric.id).sort(),
    );
    for (const metric of metrics) {
      const lesson = content.lessonsByKey.get(`fundamental:${metric.id}`)!;
      expect(lesson.id, metric.id).toBe(metric.lesson_id);
      expect(lesson.chapter, metric.id).toBe(metric.chapter);
      expect(lesson.name.replace(/\s*[—-]\s*/g, ' ').replace(/[()]/g, '')).toBe(
        metric.name.replace(/\s*[—-]\s*/g, ' ').replace(/[()]/g, ''),
      );
    }
    // Chapter remap of the screener registry: 10->9, 12->11, 14->12, 15->13; 3/6/8 unchanged.
    const chapters = new Set(metrics.map((metric) => metric.chapter));
    expect([...chapters].sort((a, b) => a - b)).toEqual([3, 6, 8, 9, 11, 12, 13]);
  });

  it('publishes the 59 re-homed quiz lessons and leaves the 12 guides not_published', () => {
    for (const lesson of lessons) {
      if (lesson.completion.mode === 'quiz') {
        expect(lesson.content_status, lesson.id).toBe('published');
        expect(lesson.content?.sections.length, lesson.id).toBeGreaterThan(0);
        expect(lesson.assessment?.questions, lesson.id).toHaveLength(8);
        expect(lesson.assessment?.version, lesson.id).toMatch(/^[a-f0-9]{64}$/);
        expect(lesson.content?.content_version).toBe('2.0.0');
      } else {
        expect(lesson.content_status, lesson.id).toBe('not_published');
        expect(lesson.content, lesson.id).toBeNull();
        expect(lesson.assessment, lesson.id).toBeNull();
      }
    }
    const files = readAcademyContentFiles();
    expect(files.lessons.size).toBe(59);
    expect(files.assessments.size).toBe(59);
    expect(
      [...content.lessons.values()].flatMap((lesson) => lesson.assessment?.questions ?? []),
    ).toHaveLength(472);
  });

  it('keeps removed lessons out of the catalog, in the legacy folder only', () => {
    const removed = loadRemovedLegacyLessons();
    expect(removed).toHaveLength(66);
    const legacyCurriculum = readJson(join(contentDir, 'legacy/CURRICULUM.json')) as Array<{
      lesson_ids: string[];
    }>;
    const legacyIds = legacyCurriculum.flatMap((chapter) => chapter.lesson_ids);
    expect(legacyIds).toHaveLength(125);
    const mapped = new Set(legacyMappingRows().map((row) => row.legacy_lesson_id));
    const gone = new Set(removed.map((lesson) => lesson.legacy_lesson_id));
    expect(mapped.size).toBe(59);
    expect([...mapped].filter((id) => gone.has(id))).toEqual([]);
    expect([...legacyIds].sort()).toEqual([...mapped, ...gone].sort());
    // Published content is only the 59 lessons of the catalog; none of the removed topics.
    const names = new Set(removed.map((lesson) => lesson.name));
    for (const lesson of lessons)
      expect(names.has(lesson.name) && lesson.kind !== 'guide', lesson.id).toBe(false);
    for (const id of [
      'ADX',
      'ATR',
      'ATR Percent',
      'Relative Volume',
      'Keltner Channel',
      'Parabolic SAR',
    ])
      expect(
        removed.some((lesson) => lesson.name === id),
        id,
      ).toBe(true);
  });

  it('rejects inconsistent content: missing or stray files, bad bindings, keys and banks', () => {
    const files = readAcademyContentFiles();
    const without = (id: string, source: 'lessons' | 'assessments'): AcademyContentFiles => {
      const copy = new Map(files[source]);
      copy.delete(id);
      return { ...files, [source]: copy };
    };
    expect(() => buildAcademyContent(without('ch01-l01', 'lessons'))).toThrow(/no lesson file/);
    expect(() => buildAcademyContent(without('ch01-l01', 'assessments'))).toThrow(/no assessment/);

    const stray = new Map(files.lessons);
    stray.set('ch02-l01', structuredClone(files.lessons.get('ch01-l01')));
    expect(() => buildAcademyContent({ ...files, lessons: stray })).toThrow(
      /not_published but has content|declares/,
    );

    const catalog = (
      mutate: (c: { chapters: Array<{ lessons: Array<Record<string, unknown>> }> }) => void,
    ) => {
      const copy = structuredClone(files.catalog) as {
        chapters: Array<{ lessons: Array<Record<string, unknown>> }>;
      };
      mutate(copy);
      return { ...files, catalog: copy };
    };
    expect(() =>
      buildAcademyContent(
        catalog((c) => (c.chapters[0]!.lessons[0]!.lesson_key = 'technical:macd')),
      ),
    ).toThrow(/lesson key/);
    expect(() =>
      buildAcademyContent(
        catalog((c) => (c.chapters[1]!.lessons[0]!.legacy_lesson_ids = ['ch02-l01'])),
      ),
    ).toThrow(/no legacy mapping/);
    expect(() =>
      buildAcademyContent(
        catalog((c) => (c.chapters[0]!.lessons[1]!.legacy_lesson_ids = ['ch01-l01'])),
      ),
    ).toThrow(/maps to two lessons/);
    expect(() => buildAcademyContent(catalog((c) => c.chapters.pop()))).toThrow();
    expect(() =>
      buildAcademyContent(
        catalog(
          (c) => (c.chapters[0]!.lessons[5]!.capability_binding = { kind: 'technical', id: 'x' }),
        ),
      ),
    ).toThrow(/concept lessons open no capability/);

    const banks = new Map(files.assessments);
    const bank = structuredClone(files.assessments.get('ch01-l01')) as {
      questions: Array<{ correct_index: number }>;
    };
    bank.questions.pop();
    banks.set('ch01-l01', bank);
    expect(() => buildAcademyContent({ ...files, assessments: banks })).toThrow(/7 questions/);
    const broken = structuredClone(files.assessments.get('ch01-l01')) as {
      questions: Array<{ correct_index: number }>;
    };
    broken.questions[0]!.correct_index = (broken.questions[0]!.correct_index + 1) % 4;
    banks.set('ch01-l01', broken);
    expect(() => buildAcademyContent({ ...files, assessments: banks })).toThrow(/answer key/);
  });

  it('accepts typed blocks and validates asset references', () => {
    const guide = contentWithPublishedGuides('ch02-l01').lessons.get('ch02-l01')!;
    expect(guide.content_status).toBe('published');
    expect(guide.assessment).toBeNull();
    expect(guide.content?.sections[0]?.blocks.map((block) => block.type)).toEqual([
      'text',
      'formula',
      'table',
      'image',
      'chart',
    ]);
    expect(() => {
      const files = readAcademyContentFiles();
      const catalog = structuredClone(files.catalog) as {
        chapters: Array<{ lessons: Array<{ content_status: string }> }>;
      };
      catalog.chapters[1]!.lessons[0]!.content_status = 'published';
      const lessons = new Map(files.lessons);
      lessons.set('ch02-l01', {
        lesson_id: 'ch02-l01',
        content_version: '1.0.0',
        sections: [
          { id: 's', title: 'x', blocks: [{ type: 'image', asset_id: 'missing', alt: 'a' }] },
        ],
      });
      buildAcademyContent({ ...files, catalog, lessons });
    }).toThrow(/missing image asset/);
  });

  it('keeps re-homed content stable: a legacy lesson keeps its approved sections and bank text', () => {
    const stochastic = content.lessons.get('ch05-l04')!;
    expect(stochastic.content?.sections[0]?.blocks[0]?.type).toBe('html');
    expect(stochastic.assessment?.questions.map((question) => question.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `ch05-l04-q0${i + 1}`),
    );
    expect(stochastic.content?.sources.length).toBeGreaterThan(0);
  });

  it('derives the per-lesson assessment version from that lesson bank only', () => {
    const lesson = content.lessons.get('ch01-l01')!;
    expect(lesson.assessment?.version).toBe(canonicalHash(lesson.assessment?.questions));
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,1]},"b":1}',
    );
    expect(content.lessons.get('ch01-l02')?.assessment?.version).not.toBe(
      lesson.assessment?.version,
    );
  });
});

describe('academy legacy mapping (Học viện SPEC §9.2)', () => {
  const rows = legacyMappingRows();
  const byLegacy = new Map(rows.map((row) => [row.legacy_lesson_id, row]));

  it('maps 59 legacy lessons one-to-one by capability, and matches the migration VALUES list', () => {
    expect(rows).toHaveLength(59);
    expect(new Set(rows.map((row) => row.lesson_key)).size).toBe(59);
    const sql = readFileSync(join(here, '../../migrations/0014_academy_catalog_v1.sql'), 'utf8');
    expect(parseMigrationMapping(sql)).toEqual(rows);
  });

  it('never grants OBV from ATR: legacy ch07-l01 (ATR) maps to nothing, OBV comes from ch07-l04', () => {
    expect(byLegacy.has('ch07-l01')).toBe(false);
    expect(byLegacy.get('ch07-l04')).toMatchObject({
      lesson_key: 'technical:obv',
      lesson_id: 'ch07-l01',
    });
    expect(byLegacy.get('ch07-l05')).toMatchObject({
      lesson_key: 'technical:mfi',
      lesson_id: 'ch07-l02',
    });
    expect(byLegacy.get('ch07-l06')).toMatchObject({
      lesson_key: 'technical:cmf',
      lesson_id: 'ch07-l03',
    });
    expect(['ch07-l02', 'ch07-l03'].some((id) => byLegacy.has(id))).toBe(false);
  });

  it('never grants Stochastic from ADX; Stochastic/CCI follow their capability to the new numbers', () => {
    expect(byLegacy.has('ch05-l04')).toBe(false);
    expect(byLegacy.get('ch05-l05')).toMatchObject({
      lesson_key: 'technical:stochastic',
      lesson_id: 'ch05-l04',
    });
    expect(byLegacy.get('ch05-l06')).toMatchObject({
      lesson_key: 'technical:cci',
      lesson_id: 'ch05-l05',
    });
  });

  it('maps valuation, long-term, stability and shareholder chapters per metric, not per index', () => {
    expect(byLegacy.get('ch10-l01')).toMatchObject({
      lesson_key: 'fundamental:pe',
      lesson_id: 'ch09-l01',
    });
    expect(byLegacy.get('ch12-l01')).toMatchObject({ lesson_id: 'ch11-l01' });
    expect(byLegacy.get('ch14-l06')).toMatchObject({
      lesson_key: 'fundamental:profit_positive_streak',
      lesson_id: 'ch12-l06',
    });
    expect(byLegacy.get('ch15-l06')).toMatchObject({ lesson_id: 'ch13-l06' });
    // Old chapter 9 (price structure) is not the new chapter 9 (valuation).
    expect([...byLegacy.keys()].filter((id) => id.startsWith('ch09-'))).toEqual([]);
    // Old chapter 10 (valuation) cannot be read as the new chapter 10 (Donchian/ROC/Williams).
    expect(byLegacy.get('ch11-l01')).toMatchObject({
      lesson_key: 'technical:donchian',
      lesson_id: 'ch10-l01',
    });
    expect(
      [...byLegacy.values()]
        .filter((row) => row.lesson_id.startsWith('ch10-'))
        .map((row) => row.lesson_key),
    ).toEqual(['technical:donchian', 'technical:roc', 'technical:williams_r']);
  });

  it('keeps chapters 1, 3, 6 and 8 and Hợp lưu in place; ch02/ch04/ch09/ch13/ch16-18 map to nothing', () => {
    expect(byLegacy.get('ch01-l06')).toMatchObject({
      lesson_key: 'concept:hop_luu',
      lesson_id: 'ch01-l06',
    });
    expect(byLegacy.get('ch03-l06')).toMatchObject({
      lesson_key: 'fundamental:roe',
      lesson_id: 'ch03-l06',
    });
    const mappedChapters = new Set(rows.map((row) => row.legacy_lesson_id.slice(0, 4)));
    for (const removedChapter of ['ch02', 'ch04', 'ch09', 'ch13', 'ch16', 'ch17', 'ch18'])
      expect(mappedChapters.has(removedChapter), removedChapter).toBe(false);
    const content = loadAcademyContent();
    for (const lesson of content.lessons.values())
      if (lesson.kind === 'guide') expect(lesson.legacy_lesson_ids).toEqual([]);
  });

  it('dry-run report counts per mapping and keeps ATR out of the OBV count', () => {
    const report = buildLegacyMappingReport({
      catalogVersion: ACADEMY_CATALOG_VERSION,
      rows,
      removed: loadRemovedLegacyLessons(),
      grantsByLegacyLesson: new Map([
        ['ch01-l01', 5],
        ['ch07-l01', 3], // ATR
        ['ch07-l04', 2], // OBV
        ['ch05-l04', 4], // ADX
        ['ch05-l05', 1],
        ['ch02-l01', 9],
        ['ch99-l01', 1],
      ]),
      completionsByKey: new Map(),
      newCompletionsFromLegacy: new Map(),
      usersWithGrants: 12,
      completionsTableExists: false,
    });
    const line = (id: string) => report.mapped.find((item) => item.legacy_lesson_id === id)!;
    expect(line('ch01-l01')).toMatchObject({ legacy_grants: 5, would_insert: 5 });
    expect(line('ch07-l04')).toMatchObject({ lesson_key: 'technical:obv', would_insert: 2 });
    expect(report.mapped.some((item) => item.legacy_lesson_id === 'ch07-l01')).toBe(false);
    expect(report.unmapped.find((item) => item.legacy_lesson_id === 'ch07-l01')).toMatchObject({
      name: 'ATR',
      legacy_grants: 3,
    });
    expect(report.unmapped.find((item) => item.legacy_lesson_id === 'ch05-l04')).toMatchObject({
      name: 'ADX',
      legacy_grants: 4,
    });
    expect(line('ch05-l05')).toMatchObject({ lesson_key: 'technical:stochastic', would_insert: 1 });
    expect(report.unknown).toEqual([{ legacy_lesson_id: 'ch99-l01', legacy_grants: 1 }]);
    expect(report.totals).toMatchObject({
      users_with_grants: 12,
      legacy_grants: 25,
      mapped_grants: 5 + 2 + 1,
      unmapped_grants: 3 + 4 + 9 + 1,
      would_insert: 8,
    });
  });
});

describe('academy capability mapping', () => {
  const content = loadAcademyContent();

  it('technical -> indicator:<id>, fundamental -> metric:<id>, concept and guides open nothing', () => {
    expect(content.lessons.get('ch01-l01')!.capabilities).toEqual(['indicator:rsi']);
    expect(content.lessons.get('ch03-l06')!.capabilities).toEqual(['metric:roe']);
    expect(content.lessons.get('ch01-l06')!.capabilities).toEqual([]);
    expect(content.lessons.get('ch02-l01')!.capabilities).toEqual([]);
    expect(capabilitiesForLesson({ capability_binding: null })).toEqual([]);
  });

  it('covers 16 indicators and 42 metrics and grants no lesson:* capability', () => {
    const all = [...content.lessons.values()].flatMap((lesson) => lesson.capabilities);
    expect(all.filter((id) => id.startsWith('indicator:'))).toHaveLength(16);
    expect(all.filter((id) => id.startsWith('metric:'))).toHaveLength(42);
    expect(all.filter((id) => id.startsWith('lesson:'))).toEqual([]);
    expect(new Set(all).size).toBe(58);
  });
});

describe('academy grading primitives', () => {
  it('shuffles with Fisher-Yates into a permutation', () => {
    const items = ['o1', 'o2', 'o3', 'o4'];
    const result = shuffle(items, () => 0);
    expect(result).toEqual(['o2', 'o3', 'o4', 'o1']);
    expect(items).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect([...shuffle(items)].sort()).toEqual(items);
  });

  it('passes only with 8/8', () => {
    const questions = answerKey('ch01-l01');
    const ids = questions.map((question) => question.id);
    expect(gradeAnswers(questions, ids, correctAnswers('ch01-l01'))).toMatchObject({
      score: 8,
      passed: true,
    });
    const seven = correctAnswers('ch01-l01');
    seven[3] = { ...seven[3]!, option_id: wrongAnswer('ch01-l01', 3) };
    expect(gradeAnswers(questions, ids, seven)).toMatchObject({ score: 7, passed: false });
  });

  it('reports unknown, duplicate, foreign-option and missing answers', () => {
    const questions = answerKey('ch01-l01');
    const ids = questions.map((question) => question.id);
    const answers = correctAnswers('ch01-l01');
    expect(findInvalidAnswers(questions, ids, answers)).toEqual([]);
    const issues = findInvalidAnswers(questions, ids, [
      ...answers.slice(0, 6),
      answers[0]!,
      { question_id: ids[6]!, option_id: 'o9' },
      { question_id: 'ch01-l02-q01', option_id: 'o1' },
    ]);
    expect(issues.map((issue) => issue.reason).sort()).toEqual([
      'duplicate_question',
      'missing_answer',
      'unknown_option',
      'unknown_question',
    ]);
  });
});

describe('AcademyService catalog, lessons and progress', () => {
  it('serves the full catalog metadata without answers or private banks', () => {
    const { service } = setup();
    const catalog = service.catalog();
    expect(catalog).toMatchObject({
      catalog_version: ACADEMY_CATALOG_VERSION,
      chapter_count: 13,
      lesson_count: 71,
    });
    const lessons = catalog.chapters.flatMap((chapter) => chapter.lessons);
    expect(lessons).toHaveLength(71);
    expect(lessons.filter((lesson) => lesson.content_status === 'published')).toHaveLength(59);
    const rsi = lessons.find((lesson) => lesson.id === 'ch01-l01')!;
    expect(rsi).toMatchObject({
      lesson_key: 'technical:rsi',
      kind: 'technical',
      capability_id: 'indicator:rsi',
      completion: { mode: 'quiz', question_count: 8, required_correct: 8, assessment_ready: true },
      content_status: 'published',
      content_version: '2.0.0',
    });
    const guide = lessons.find((lesson) => lesson.id === 'ch02-l01')!;
    expect(guide).toMatchObject({
      lesson_key: 'guide:ch02-l01',
      completion: {
        mode: 'guide',
        question_count: null,
        assessment_ready: false,
        assessment_version: null,
      },
      content_status: 'not_published',
      capability_binding: null,
      capability_id: null,
    });
    expect(lessons.find((lesson) => lesson.id === 'ch07-l01')).toMatchObject({
      legacy_lesson_ids: ['ch07-l04'],
    });
    const keys = deepKeys(catalog);
    expect(
      [...keys].filter((key) =>
        /^(correct|correct_index|correct_option_id|explanation|questions|options)$/.test(key),
      ),
    ).toEqual([]);
  });

  it('returns published content without answers, or not_published for guides, 404 for unknown', async () => {
    const { service } = setup();
    const lesson = await service.lesson(USER, 'ch01-l01');
    expect(lesson).toMatchObject({
      id: 'ch01-l01',
      content_status: 'published',
      completed: false,
      completed_at: null,
    });
    expect(lesson.sections.length).toBeGreaterThan(0);
    expect(lesson.sections[0]!.blocks[0]!.type).toBe('html');
    expect(lesson.fixture).not.toBeNull();
    const keys = deepKeys(lesson);
    expect(keys.has('questions')).toBe(false);
    expect(keys.has('correct_option_id')).toBe(false);

    const guide = await service.lesson(USER, 'ch02-l01');
    expect(guide).toMatchObject({
      content_status: 'not_published',
      content_version: null,
      sections: [],
      assets: [],
      fixture: null,
      completed: false,
    });
    await expect(service.lesson(USER, 'ch99-l99')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.lesson(USER, 'ch01-l07')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('progress is 0/71 with the real chapter totals (5/3/3, never a default 6)', async () => {
    const { service } = setup();
    const progress = await service.progress(USER);
    expect(progress).toMatchObject({
      catalog_version: ACADEMY_CATALOG_VERSION,
      course_done: 0,
      course_total: 71,
      progress_revision: 0,
      completed: [],
      granted_capabilities: [],
    });
    expect(progress.chapters.map((chapter) => chapter.total)).toEqual([
      6, 6, 6, 6, 5, 6, 3, 6, 6, 3, 6, 6, 6,
    ]);
    expect(progress.chapters.find((chapter) => chapter.no === 5)).toEqual({
      no: 5,
      done: 0,
      total: 5,
    });
    expect(progress.chapters.find((chapter) => chapter.no === 7)).toEqual({
      no: 7,
      done: 0,
      total: 3,
    });
    expect(progress.chapters.find((chapter) => chapter.no === 10)).toEqual({
      no: 10,
      done: 0,
      total: 3,
    });
  });

  it('progress counts a lesson once: views, failed attempts and retakes do not add', async () => {
    const { service } = setup();
    await service.lesson(USER, 'ch01-l01');
    await service.lesson(USER, 'ch01-l01');
    const seven = correctAnswers('ch01-l01');
    seven[2] = { ...seven[2]!, option_id: wrongAnswer('ch01-l01', 2) };
    const failed = await service.submit(USER, (await start(service)).attempt_id, {
      answers: seven,
    });
    expect(failed.passed).toBe(false);
    expect((await service.progress(USER)).course_done).toBe(0);

    await pass(service, 'ch01-l01', 'attempt-key-0002');
    await pass(service, 'ch01-l01', 'attempt-key-0003');
    const progress = await service.progress(USER);
    expect(progress.course_done).toBe(1);
    expect(progress.completed_lesson_ids).toEqual(['ch01-l01']);
    expect(progress.chapters[0]).toEqual({ no: 1, done: 1, total: 6 });
    expect(progress.granted_capabilities).toEqual(['indicator:rsi']);
    expect(progress.progress_revision).toBe(1);
  });

  it('progress formula: distinct completions mapped into the current catalog, nothing else', () => {
    const content = loadAcademyContent();
    const row = (lessonKey: string, method: CompletionRow['completion_method']): CompletionRow => ({
      user_id: USER,
      lesson_key: lessonKey,
      catalog_version: ACADEMY_CATALOG_VERSION,
      lesson_id: 'x',
      completion_method: method,
      attempt_id: null,
      request_id: null,
      content_version: null,
      completed_at: new Date('2026-10-01T00:00:00Z'),
      source: {},
    });
    const rows = [
      row('technical:rsi', 'quiz'),
      row('concept:hop_luu', 'legacy_migration'),
      row('guide:ch02-l01', 'guide'),
      row('fundamental:roe', 'quiz'),
      row('technical:atr', 'legacy_migration'), // not in the catalog: ignored
    ];
    const progress = buildProgress(content, rows);
    expect(progress.course_done).toBe(4);
    expect(progress.course_total).toBe(71);
    expect(progress.progress_revision).toBe(5);
    expect(progress.chapters.filter((chapter) => chapter.done > 0)).toEqual([
      { no: 1, done: 2, total: 6 },
      { no: 2, done: 1, total: 6 },
      { no: 3, done: 1, total: 6 },
    ]);
    // Concept and guide lessons count as progress but open no capability.
    expect(progress.granted_capabilities).toEqual(['indicator:rsi', 'metric:roe']);
    expect(progress.completed.map((item) => item.lesson_id)).toEqual([
      'ch01-l01',
      'ch01-l06',
      'ch02-l01',
      'ch03-l06',
    ]);
    expect(capabilitiesFromCompletions(content, rows)).toEqual(['indicator:rsi', 'metric:roe']);
  });
});

describe('AcademyService quiz attempts', () => {
  it('never exposes answer keys or explanations in the attempt payload', async () => {
    const { service } = setup();
    const attempt = await start(service);
    expect(attempt).toMatchObject({
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      content_version: '2.0.0',
    });
    expect(attempt.questions).toHaveLength(8);
    const keys = deepKeys(attempt);
    expect([...keys].filter((key) => /correct|explanation/i.test(key))).toEqual([]);
    const text = JSON.stringify(attempt);
    // Some explanations repeat the correct option text verbatim; only distinct ones can leak.
    for (const question of answerKey('ch01-l01'))
      if (!question.options.some((option) => option.text === question.explanation))
        expect(text).not.toContain(question.explanation);
    expect(attempt.assessment_version).toBe(
      loadAcademyContent().lessons.get('ch01-l01')!.assessment!.version,
    );
  });

  it('stores the shuffled order and pins versions; replays by idempotency key', async () => {
    const { service, memory } = setup();
    const first = await start(service);
    const second = await start(service);
    expect(second).toEqual(first);
    expect(memory.attempts).toHaveLength(1);
    const stored = memory.attempts[0]!;
    expect(stored).toMatchObject({
      catalog_version: ACADEMY_CATALOG_VERSION,
      lesson_key: 'technical:rsi',
      content_version: '2.0.0',
      questions_version: first.assessment_version,
    });
    for (const question of first.questions)
      expect(question.options.map((option) => option.id)).toEqual(
        stored.option_orders[question.id],
      );
    const other = await start(service, 'ch01-l01', 'attempt-key-0002');
    expect(other.attempt_id).not.toBe(first.attempt_id);
    expect(memory.attempts).toHaveLength(2);
  });

  it('rejects stale catalog versions, reused keys, unknown lessons and guide lessons', async () => {
    const { service } = setup();
    await expect(
      service.createAttempt(USER, {
        lesson_id: 'ch01-l01',
        catalog_version: 'iqx-academy-legacy-18ch-125lessons',
        idempotency_key: 'attempt-key-0001',
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CATALOG_VERSION_MISMATCH' } });
    await start(service);
    await expect(start(service, 'ch01-l02')).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    await expect(start(service, 'ch99-l01', 'attempt-key-0003')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Guide lessons have no quiz: 422, and never a fallback bank.
    await expect(start(service, 'ch02-l01', 'attempt-key-0004')).rejects.toMatchObject({
      status: 422,
      response: { code: 'COMPLETION_MODE_MISMATCH' },
    });
  });

  it('refuses a quiz for a lesson whose assessment is not published (no fake quiz)', async () => {
    const files = readAcademyContentFiles();
    const catalog = structuredClone(files.catalog) as {
      chapters: Array<{ lessons: Array<{ content_status: string }> }>;
    };
    catalog.chapters[0]!.lessons[1]!.content_status = 'not_published';
    const lessons = new Map(files.lessons);
    lessons.delete('ch01-l02');
    const assessments = new Map(files.assessments);
    assessments.delete('ch01-l02');
    const content = buildAcademyContent({ catalog, lessons, assessments });
    const { service } = setup({ content });
    await expect(start(service, 'ch01-l02')).rejects.toMatchObject({
      status: 409,
      response: { code: 'NOT_PUBLISHED' },
    });
    expect(service.catalog().chapters[0]!.lessons[1]!.completion.assessment_ready).toBe(false);
  });

  it('7/8 does not complete and opens nothing; the failed result lists the review', async () => {
    const { service, memory, rewards } = setup();
    const seven = correctAnswers('ch01-l01');
    seven[5] = { ...seven[5]!, option_id: wrongAnswer('ch01-l01', 5) };
    const failed = await service.submit(USER, (await start(service)).attempt_id, {
      answers: seven,
    });
    expect(failed).toMatchObject({
      score: 7,
      total: 8,
      passed: false,
      newly_granted: [],
      granted_capabilities: [],
      reward: null,
      completion: { completed: false, completion_method: null, newly_completed: false },
    });
    expect(failed.results[5]).toMatchObject({ correct: false });
    expect(memory.completionRows).toHaveLength(0);
    expect(rewards!.calls).toHaveLength(0);
  });

  it('8/8 records one quiz completion with its capability and reward, replays unchanged', async () => {
    const { service, memory, rewards, grants } = setup();
    const attempt = await start(service);
    const result = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01'),
    });
    expect(result).toMatchObject({
      score: 8,
      total: 8,
      passed: true,
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      newly_granted: ['indicator:rsi'],
      granted_capabilities: ['indicator:rsi'],
      progress_revision: 1,
      completion: { completed: true, completion_method: 'quiz', newly_completed: true },
      reward: { status: 'credited', delta: 100, balance_after: 100 },
    });
    expect(result.results.every((item) => item.correct && item.explanation)).toBe(true);
    expect(memory.completionRows).toHaveLength(1);
    expect(memory.completionRows[0]).toMatchObject({
      user_id: USER,
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      lesson_id: 'ch01-l01',
      completion_method: 'quiz',
      attempt_id: attempt.attempt_id,
      request_id: null,
      content_version: '2.0.0',
    });

    // Retry after a timeout / double click: the committed result, no second completion or reward.
    const again = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01').map((answer, index) =>
        index === 0 ? { ...answer, option_id: wrongAnswer('ch01-l01', 0) } : answer,
      ),
    });
    expect(again).toEqual(result);
    expect(memory.completionRows).toHaveLength(1);
    expect(memory.answerRows).toHaveLength(8);
    expect(rewards!.calls).toHaveLength(1);
    expect([...(await grants.grantedCapabilities(USER))]).toEqual(['indicator:rsi']);
    expect((await grants.grantedCapabilities(OTHER_USER)).size).toBe(0);
  });

  it('calls the reward hook exactly once, inside the completion transaction, with the evidence', async () => {
    const { service, rewards, memory } = setup();
    await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(rewards!.calls).toHaveLength(1);
    const { tx, input } = rewards!.calls[0]!;
    expect(tx).toBe(memory.tx);
    expect(input).toMatchObject({
      userId: USER,
      lessonKey: 'technical:rsi',
      lessonId: 'ch01-l01',
      catalogVersion: ACADEMY_CATALOG_VERSION,
      completionMethod: 'quiz',
    });
    expect(input.completedAt).toBe(memory.completionRows[0]!.completed_at.toISOString());
    // A second pass of the same lesson never reaches the hook again.
    const repeat = await pass(service, 'ch01-l01', 'attempt-key-0002');
    expect(repeat).toMatchObject({
      passed: true,
      newly_granted: [],
      reward: null,
      completion: { completed: true, newly_completed: false },
    });
    expect(rewards!.calls).toHaveLength(1);
    // Another lesson is another first completion.
    await pass(service, 'ch01-l02', 'attempt-key-0003');
    expect(rewards!.calls).toHaveLength(2);
    expect(rewards!.balance).toBe(200);
  });

  it('reports reward unavailable when no Shop hook is installed, and keeps the evidence', async () => {
    const { service, memory } = setup({ rewards: false });
    const result = await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(result.reward).toEqual({ status: 'unavailable' });
    expect(result.completion.newly_completed).toBe(true);
    expect(memory.completionRows[0]!.source).toMatchObject({ reward: { status: 'unavailable' } });
  });

  it('a failing reward hook rolls the whole completion back (atomic), retry then succeeds', async () => {
    const { service, memory, rewards } = setup();
    rewards!.failWith = new Error('ledger down');
    const attempt = await start(service);
    await expect(
      service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toThrow('ledger down');
    expect(memory.completionRows).toHaveLength(0);
    expect(memory.attempts[0]!.status).toBe('open');
    expect(memory.answerRows).toHaveLength(0);
    rewards!.failWith = null;
    const retried = await service.submit(USER, attempt.attempt_id, {
      answers: correctAnswers('ch01-l01'),
    });
    expect(retried.completion.newly_completed).toBe(true);
    expect(memory.completionRows).toHaveLength(1);
  });

  it('a failed retake never removes a completion, and a later pass never re-rewards', async () => {
    const { service, memory, rewards } = setup();
    await pass(service, 'ch01-l01', 'attempt-key-0001');
    const seven = correctAnswers('ch01-l01');
    seven[5] = { ...seven[5]!, option_id: wrongAnswer('ch01-l01', 5) };
    const retake = await service.submit(
      USER,
      (await start(service, 'ch01-l01', 'attempt-key-0002')).attempt_id,
      {
        answers: seven,
      },
    );
    expect(retake).toMatchObject({
      passed: false,
      granted_capabilities: ['indicator:rsi'],
      completion: { completed: true, completion_method: 'quiz', newly_completed: false },
      reward: null,
    });
    const repass = await pass(service, 'ch01-l01', 'attempt-key-0003');
    expect(repass.newly_granted).toEqual([]);
    expect(memory.completionRows).toHaveLength(1);
    expect(rewards!.calls).toHaveLength(1);
    expect((await service.progress(USER)).course_done).toBe(1);
    expect((await service.lesson(USER, 'ch01-l01')).completed).toBe(true);
  });

  it('concept lesson Hợp lưu completes by quiz, counts as progress and opens no capability', async () => {
    const { service, memory } = setup();
    const result = await pass(service, 'ch01-l06', 'attempt-key-0001');
    expect(result).toMatchObject({
      passed: true,
      lesson_key: 'concept:hop_luu',
      newly_granted: [],
      granted_capabilities: [],
      completion: { completed: true, newly_completed: true },
    });
    expect(memory.completionRows[0]!.lesson_key).toBe('concept:hop_luu');
    expect((await service.progress(USER)).course_done).toBe(1);
  });

  it('fundamental lesson grants only its screener metric', async () => {
    const { service } = setup();
    const result = await pass(service, 'ch03-l06', 'attempt-key-0001');
    expect(result.newly_granted).toEqual(['metric:roe']);
    expect(result.granted_capabilities).toEqual(['metric:roe']);
  });

  it('rejects invalid answers with 422 INVALID_ANSWERS and keeps the attempt open', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const answers = correctAnswers('ch01-l01');
    const invalid = [
      answers.slice(0, 7),
      [...answers.slice(0, 7), answers[0]!],
      [...answers.slice(0, 7), { question_id: answers[7]!.question_id, option_id: 'nope' }],
      [...answers.slice(0, 7), { question_id: 'ch01-l02-q08', option_id: 'o1' }],
      [...answers, { question_id: 'ch01-l02-q01', option_id: 'o1' }],
    ];
    for (const body of invalid)
      await expect(
        service.submit(USER, attempt.attempt_id, { answers: body }),
      ).rejects.toMatchObject({ status: 422, response: { code: 'INVALID_ANSWERS' } });
    expect(memory.attempts[0]!.status).toBe('open');
    expect(memory.answerRows).toHaveLength(0);
  });

  it('ignores client-supplied score, pass and capability fields: the server grades the pinned bank', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    const wrong = correctAnswers('ch01-l01').map((answer, index) => ({
      ...answer,
      option_id: wrongAnswer('ch01-l01', index),
    }));
    const body = {
      answers: wrong,
      score: 8,
      passed: true,
      granted_capabilities: ['indicator:macd'],
    } as unknown as Parameters<AcademyService['submit']>[2];
    const result = await service.submit(USER, attempt.attempt_id, body);
    expect(result).toMatchObject({ score: 0, passed: false, newly_granted: [] });
    expect(memory.completionRows).toHaveLength(0);
  });

  it('scopes attempts to the owner', async () => {
    const { service } = setup();
    const attempt = await start(service);
    await expect(
      service.submit(OTHER_USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 404, response: { code: 'ATTEMPT_NOT_FOUND' } });
  });

  it('refuses to grade an attempt of the legacy catalog or of changed versions', async () => {
    const { service, memory } = setup();
    const attempt = await start(service);
    memory.attempts[0]!.catalog_version = ACADEMY_LEGACY_CATALOG_VERSION;
    memory.attempts[0]!.lesson_key = null;
    await expect(
      service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CATALOG_VERSION_MISMATCH' } });

    const second = await start(service, 'ch01-l01', 'attempt-key-0009');
    memory.attempts.find((row) => row.id === second.attempt_id)!.questions_version = 'a'.repeat(64);
    await expect(
      service.submit(USER, second.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'ASSESSMENT_VERSION_MISMATCH' } });
    expect(memory.completionRows).toHaveLength(0);
  });

  it('cannot double-complete or double-reward under concurrent submits', async () => {
    const { service, memory, rewards } = setup();
    const attempt = await start(service);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.submit(USER, attempt.attempt_id, { answers: correctAnswers('ch01-l01') }),
      ),
    );
    expect(memory.completionRows).toHaveLength(1);
    expect(memory.answerRows).toHaveLength(8);
    expect(rewards!.calls).toHaveLength(1);
    for (const result of results) expect(result).toEqual(results[0]);
  });

  it('two devices passing the same lesson with different attempts complete it once', async () => {
    const { service, memory, rewards } = setup();
    const a = await start(service, 'ch01-l01', 'attempt-key-device-a');
    const b = await start(service, 'ch01-l01', 'attempt-key-device-b');
    const [first, second] = await Promise.all([
      service.submit(USER, a.attempt_id, { answers: correctAnswers('ch01-l01') }),
      service.submit(USER, b.attempt_id, { answers: correctAnswers('ch01-l01') }),
    ]);
    expect(memory.attempts.every((row) => row.status === 'submitted')).toBe(true);
    expect(memory.completionRows).toHaveLength(1);
    expect(rewards!.calls).toHaveLength(1);
    expect([first.completion.newly_completed, second.completion.newly_completed].sort()).toEqual([
      false,
      true,
    ]);
    expect((await service.progress(USER)).course_done).toBe(1);
  });

  it('A01/A03 completing a lesson only writes academy rows: no bot, capital, config or indicator flip', async () => {
    const { service, memory } = setup();
    await pass(service, 'ch01-l01', 'attempt-key-0001');
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(memory)),
      ...Object.keys(memory),
    ];
    expect(
      surface.filter((name) =>
        /bot|capital|account|wallet|cash|outbox|shared|revision|master|indicator/i.test(name),
      ),
    ).toEqual([]);
  });
});

describe('AcademyService guide completion', () => {
  const guideInput = (request_id = 'request-guide-0001', content_version = '1.0.0') => ({
    catalog_version: ACADEMY_CATALOG_VERSION,
    content_version,
    request_id,
  });

  it('refuses all 12 current guides until their content is published (409 NOT_PUBLISHED)', async () => {
    const { service, memory, rewards } = setup();
    const guides = [...loadAcademyContent().lessons.values()].filter(
      (lesson) => lesson.kind === 'guide',
    );
    for (const guide of guides)
      await expect(
        service.completeGuide(USER, guide.id, guideInput(`request-${guide.id}`)),
      ).rejects.toMatchObject({ status: 409, response: { code: 'NOT_PUBLISHED' } });
    expect(memory.completionRows).toHaveLength(0);
    expect(rewards!.calls).toHaveLength(0);
  });

  it('refuses the guide button for quiz lessons (422 COMPLETION_MODE_MISMATCH)', async () => {
    const { service, memory } = setup({ content: contentWithPublishedGuides('ch02-l01') });
    for (const lessonId of ['ch01-l01', 'ch03-l06', 'ch01-l06'])
      await expect(
        service.completeGuide(USER, lessonId, guideInput('request-quiz-0001', '2.0.0')),
      ).rejects.toMatchObject({ status: 422, response: { code: 'COMPLETION_MODE_MISMATCH' } });
    expect(memory.completionRows).toHaveLength(0);
    await expect(service.completeGuide(USER, 'ch99-l01', guideInput())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('completes a published guide once: no quiz, no capability, reward once, idempotent per request id', async () => {
    const content = contentWithPublishedGuides('ch02-l01', 'ch04-l06');
    const { service, memory, rewards, grants } = setup({ content });
    const first = await service.completeGuide(USER, 'ch02-l01', guideInput());
    expect(first).toMatchObject({
      lesson_id: 'ch02-l01',
      lesson_key: 'guide:ch02-l01',
      catalog_version: ACADEMY_CATALOG_VERSION,
      completion: { completed: true, completion_method: 'guide', newly_completed: true },
      granted_capabilities: [],
      progress_revision: 1,
      reward: { status: 'credited', delta: 100, balance_after: 100 },
    });
    expect(memory.completionRows[0]).toMatchObject({
      lesson_key: 'guide:ch02-l01',
      completion_method: 'guide',
      attempt_id: null,
      request_id: 'request-guide-0001',
      content_version: '1.0.0',
    });
    expect(rewards!.calls[0]!.input).toMatchObject({
      completionMethod: 'guide',
      lessonKey: 'guide:ch02-l01',
    });

    // Same request again (double click / retry after timeout): identical committed result.
    const replay = await service.completeGuide(USER, 'ch02-l01', guideInput());
    expect(replay).toEqual(first);
    // A new request for an already completed guide (reload / other device): still one completion.
    const other = await service.completeGuide(USER, 'ch02-l01', guideInput('request-guide-0002'));
    expect(other.completion).toMatchObject({ completed: true, newly_completed: false });
    expect(other.reward).toBeNull();
    expect(other.progress_revision).toBe(1);
    expect(memory.completionRows).toHaveLength(1);
    expect(rewards!.calls).toHaveLength(1);

    // Guides open no tool capability, not even through the grants port.
    expect((await grants.grantedCapabilities(USER)).size).toBe(0);
    const progress = await service.progress(USER);
    expect(progress.course_done).toBe(1);
    expect(progress.chapters[1]).toEqual({ no: 2, done: 1, total: 6 });
    expect((await service.lesson(USER, 'ch02-l01')).completed).toBe(true);
  });

  it('is idempotent under concurrent clicks and rejects a request id reused for another lesson', async () => {
    const content = contentWithPublishedGuides('ch02-l01', 'ch02-l02');
    const { service, memory, rewards } = setup({ content });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => service.completeGuide(USER, 'ch02-l01', guideInput())),
    );
    for (const result of results) expect(result).toEqual(results[0]);
    expect(memory.completionRows).toHaveLength(1);
    expect(rewards!.calls).toHaveLength(1);
    await expect(service.completeGuide(USER, 'ch02-l02', guideInput())).rejects.toMatchObject({
      status: 409,
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
    expect(memory.completionRows).toHaveLength(1);
  });

  it('rejects stale catalog and content versions and unknown request payloads', async () => {
    const content = contentWithPublishedGuides('ch02-l01');
    const { service, memory } = setup({ content });
    await expect(
      service.completeGuide(USER, 'ch02-l01', { ...guideInput(), catalog_version: 'old' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CATALOG_VERSION_MISMATCH' } });
    await expect(
      service.completeGuide(USER, 'ch02-l01', guideInput('request-guide-0001', '0.9.0')),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CONTENT_VERSION_MISMATCH' } });
    expect(memory.completionRows).toHaveLength(0);
  });

  it('guide completion by a reward-less deployment still completes (reward unavailable)', async () => {
    const content = contentWithPublishedGuides('ch04-l06');
    const { service } = setup({ content, rewards: false });
    const result = await service.completeGuide(USER, 'ch04-l06', guideInput());
    expect(result.completion.newly_completed).toBe(true);
    expect(result.reward).toEqual({ status: 'unavailable' });
  });
});

describe('AcademyGrantsService', () => {
  const completion = (
    lessonKey: string,
    method: CompletionRow['completion_method'] = 'quiz',
  ): CompletionRow => ({
    user_id: USER,
    lesson_key: lessonKey,
    catalog_version: ACADEMY_CATALOG_VERSION,
    lesson_id: 'x',
    completion_method: method,
    attempt_id: null,
    request_id: null,
    content_version: null,
    completed_at: new Date(),
    source: {},
  });

  it('derives indicator:/metric: capabilities from completions only', async () => {
    const { memory, grants } = setup();
    memory.completionRows.push(
      completion('technical:obv'),
      completion('fundamental:pe', 'legacy_migration'),
      completion('concept:hop_luu'),
      completion('guide:ch04-l01', 'guide'),
    );
    expect([...(await grants.grantedCapabilities(USER))]).toEqual(['indicator:obv', 'metric:pe']);
  });

  it('keeps lesson:<legacy id> capabilities of legacy holders and nothing else from legacy grants', async () => {
    const { memory, grants } = setup();
    memory.legacyCapabilities.set(USER, ['lesson:ch02-l14', 'lesson:ch07-l01', 'lesson:ch16-l01']);
    memory.completionRows.push(completion('technical:rsi'));
    const granted = await grants.grantedCapabilities(USER);
    expect([...granted]).toEqual([
      'indicator:rsi',
      'lesson:ch02-l14',
      'lesson:ch07-l01',
      'lesson:ch16-l01',
    ]);
    // Legacy ATR (lesson:ch07-l01) opens no OBV, and a legacy-only user holds no indicator.
    expect(granted.has('indicator:obv')).toBe(false);
    memory.completionRows.length = 0;
    expect(
      [...(await grants.grantedCapabilities(USER))].some((id) => id.startsWith('indicator:')),
    ).toBe(false);
  });

  it('ignores completions that no longer belong to the catalog', async () => {
    const { memory, grants } = setup();
    memory.completionRows.push(completion('technical:adx'), completion('technical:atr'));
    expect((await grants.grantedCapabilities(USER)).size).toBe(0);
  });
});

describe('academy SQL store', () => {
  const makeStore = () => {
    const statements: Array<{ text: string; values?: readonly unknown[] }> = [];
    const store = new AcademySqlStore({
      query: (text: string, values?: readonly unknown[]) => {
        statements.push({ text, values });
        return Promise.resolve([]);
      },
    } as never);
    return { store, statements };
  };

  it('locks the attempt row, serializes completions per user and never overwrites them', async () => {
    const { store, statements } = makeStore();
    const attemptId = '00000000-0000-4000-8000-0000000000aa';
    await store.lockAttempt(USER, attemptId);
    await store.markSubmitted(attemptId, 8, true);
    await store.lockUser(USER);
    await store.insertCompletion({
      user_id: USER,
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      lesson_id: 'ch01-l01',
      completion_method: 'quiz',
      attempt_id: attemptId,
      request_id: null,
      content_version: '2.0.0',
      source: { score: 8 },
    });
    await store.attachReward(USER, 'technical:rsi', { status: 'unavailable' });
    expect(statements[0]!.text).toMatch(/for update/);
    expect(statements[0]!.text).toMatch(/user_id = \$2/);
    expect(statements[1]!.text).toMatch(/status = 'open'/);
    expect(statements[2]!.text).toMatch(/pg_advisory_xact_lock/);
    expect(statements[3]!.text).toMatch(/insert into academy_completions/);
    expect(statements[3]!.text).toMatch(/on conflict \(user_id, lesson_key\) do nothing/);
    expect(statements[4]!.text).toMatch(/update academy_completions/);
    expect(statements[4]!.text).not.toMatch(/completion_method|completed_at/);
  });

  it('writes the catalog version and lesson key with every new attempt', async () => {
    const { store, statements } = makeStore();
    await store.insertAttempt({
      id: '00000000-0000-4000-8000-0000000000aa',
      user_id: USER,
      lesson_id: 'ch01-l01',
      lesson_key: 'technical:rsi',
      catalog_version: ACADEMY_CATALOG_VERSION,
      content_version: '2.0.0',
      questions_version: 'a'.repeat(64),
      question_ids: ['ch01-l01-q01'],
      option_orders: {},
      idempotency_key: 'attempt-key-0001',
    });
    expect(statements[0]!.text).toMatch(/catalog_version, content_version/);
    expect(statements[0]!.values).toContain(ACADEMY_CATALOG_VERSION);
    expect(statements[0]!.values).toContain('technical:rsi');
  });

  it('reads only lesson:* capabilities from the legacy grants and never writes academy_grants', async () => {
    const { store, statements } = makeStore();
    await store.legacyLessonCapabilities(USER);
    expect(statements[0]!.text).toMatch(/from academy_grants/);
    expect(statements[0]!.text).toMatch(/like 'lesson:%'/);
    const source = readFileSync(
      join(here, '../../src/modules/academy/academy.repository.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/(insert into|update|delete from)\s+academy_grants/i);
  });
});

describe('migration 0014', () => {
  const sql = readFileSync(join(here, '../../migrations/0014_academy_catalog_v1.sql'), 'utf8');

  it('adds the completions table and leaves the legacy tables untouched', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS academy_completions/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, lesson_key\)/);
    expect(sql).toMatch(
      /UNIQUE INDEX IF NOT EXISTS uq_academy_completions_user_request[\s\S]*WHERE request_id IS NOT NULL/,
    );
    expect(sql).toMatch(/'quiz', 'guide', 'legacy_migration'/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS catalog_version[\s\S]*DEFAULT 'iqx-academy-legacy-18ch-125lessons'/,
    );
    const statements = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(
      /DROP |TRUNCATE|DELETE FROM|UPDATE academy_grants|ALTER TABLE academy_grants|ALTER TABLE academy_answers/i,
    );
    expect(statements).toMatch(/ON CONFLICT \(user_id, lesson_key\) DO NOTHING/);
    // ATR must not become OBV and ADX must not become Stochastic.
    expect(statements).not.toMatch(/\('ch07-l01'|\('ch05-l04'/);
  });
});

describe('AcademyEnabledGuard', () => {
  const guard = (enabled: boolean) =>
    new AcademyEnabledGuard({ get: () => enabled } as unknown as ConfigService<Environment, true>);

  it('returns 404 FEATURE_DISABLED when ACADEMY_ENABLED=false', () => {
    expect(() => guard(false).canActivate()).toThrow(NotFoundException);
    try {
      guard(false).canActivate();
    } catch (error) {
      expect((error as NotFoundException).getResponse()).toMatchObject({
        code: 'FEATURE_DISABLED',
      });
    }
    expect(guard(true).canActivate()).toBe(true);
  });
});

describe('AcademyService dependency injection of the reward hook', () => {
  const build = async (withReward: boolean) => {
    const rewards = new FakeRewards();
    const memory = new MemoryAcademy();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AcademyService,
        { provide: AcademyRepository, useValue: memory },
        ...(withReward ? [{ provide: LESSON_REWARD_PORT, useValue: rewards }] : []),
      ],
    }).compile();
    return { service: moduleRef.get(AcademyService), rewards };
  };

  it('works without a Shop module: the hook is optional and reports unavailable', async () => {
    const { service } = await build(false);
    const result = await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(result.reward).toEqual({ status: 'unavailable' });
  });

  it('uses the provided LESSON_REWARD_PORT exactly once per first completion', async () => {
    const { service, rewards } = await build(true);
    const result = await pass(service, 'ch01-l01', 'attempt-key-0001');
    expect(result.reward).toEqual({ status: 'credited', delta: 100, balance_after: 100 });
    expect(rewards.calls).toHaveLength(1);
  });
});
