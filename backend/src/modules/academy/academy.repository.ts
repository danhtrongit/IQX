import { Injectable } from '@nestjs/common';

import { DatabaseService, type SqlClient } from '../../platform/database/index.js';
import type { OptionOrders } from './academy.grading.js';

export type AttemptKind = 'lesson' | 'chapter_exam';

export type AttemptRow = {
  id: string;
  user_id: string;
  lesson_id: string;
  /** NULL for attempts made before the 13ch/71 catalog (they stay in the legacy catalog). */
  lesson_key: string | null;
  /** `lesson` for lessons and practice (and every pre-v3.2 attempt), `chapter_exam` for exams. */
  kind: AttemptKind;
  catalog_version: string;
  /** NULL for chapter exams (no lesson content). */
  content_version: string | null;
  /** Pinned bank hash (column kept as `questions_version`). Never served. */
  questions_version: string;
  question_ids: string[];
  option_orders: OptionOrders;
  status: 'open' | 'submitted';
  idempotency_key: string;
  created_at: Date;
  submitted_at: Date | null;
  score: number | null;
  passed: boolean | null;
};

export type NewAttempt = Pick<
  AttemptRow,
  | 'id'
  | 'user_id'
  | 'lesson_id'
  | 'lesson_key'
  | 'kind'
  | 'catalog_version'
  | 'content_version'
  | 'questions_version'
  | 'question_ids'
  | 'option_orders'
  | 'idempotency_key'
>;

export type AnswerRow = {
  attempt_id: string;
  question_id: string;
  option_id: string;
  correct: boolean;
};

/** Server-side draft selections of an open attempt: {question_id: option_id}, never graded. */
export type DraftRow = {
  attempt_id: string;
  selections: Record<string, string>;
  /** Number of saves; 1 for the first. An attempt without a draft row has revision 0. */
  revision: number;
  updated_at: Date;
};

/** Submitted attempts of one lesson key: the best score only ever grows, whatever a retake scores. */
export type AttemptStats = { best_score: number | null; attempts_submitted: number };

export type CompletionMethod = 'quiz' | 'guide' | 'legacy_migration';

export type CompletionRow = {
  user_id: string;
  lesson_key: string;
  catalog_version: string;
  lesson_id: string;
  completion_method: CompletionMethod;
  attempt_id: string | null;
  request_id: string | null;
  content_version: string | null;
  completed_at: Date;
  source: Record<string, unknown>;
};

export type NewCompletion = Pick<
  CompletionRow,
  | 'user_id'
  | 'lesson_key'
  | 'catalog_version'
  | 'lesson_id'
  | 'completion_method'
  | 'attempt_id'
  | 'request_id'
  | 'content_version'
  | 'source'
>;

/** The learner's scenario choice of a ch2/ch3 lesson (one row per account and lesson key). */
export type ScenarioChoiceRow = {
  user_id: string;
  lesson_key: string;
  lesson_id: string;
  choice: number;
  /** `canonicalHash(scenario block)` at the time of the choice. */
  scenario_hash: string;
  catalog_version: string;
  created_at: Date;
};

export type NewScenarioChoice = Omit<ScenarioChoiceRow, 'created_at'>;

export type NotesMaps = {
  texts: Record<string, string>;
  checks: Record<string, boolean>;
  scores: Record<string, number[]>;
};

export type PracticeNotesRow = NotesMaps & {
  user_id: string;
  lesson_key: string;
  lesson_id: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
};

export type NotesPatch = Partial<NotesMaps>;

export type SaveNotesResult =
  | { status: 'saved'; row: PracticeNotesRow }
  /** `current` is the stored row, or null when none existed before this call. */
  | { status: 'conflict'; current: PracticeNotesRow | null }
  | { status: 'too_large' };

/** Same measure as ck_academy_practice_notes_size (jsonb text, larger than compact JSON). */
export const NOTES_SIZE_LIMIT = 65536;

/** Persistence operations used by the academy service; one instance per client/transaction. */
export interface AcademyStore {
  insertAttempt(attempt: NewAttempt): Promise<AttemptRow | null>;
  attemptByIdempotencyKey(userId: string, idempotencyKey: string): Promise<AttemptRow | null>;
  /** Locks the owner's attempt row for the rest of the transaction (`for update`). */
  lockAttempt(userId: string, attemptId: string): Promise<AttemptRow | null>;
  /** The owner's attempt without taking the row lock (read paths). */
  attemptById(userId: string, attemptId: string): Promise<AttemptRow | null>;
  /** The owner's most recent OPEN attempt of the lesson key under the given catalog, if any. */
  latestOpenAttempt(
    userId: string,
    lessonKey: string,
    catalogVersion: string,
  ): Promise<AttemptRow | null>;
  /** The owner's submitted attempts of the lesson key in one catalog, newest first. */
  submittedAttempts(
    userId: string,
    lessonKey: string,
    catalogVersion: string,
    limit: number,
    offset: number,
  ): Promise<AttemptRow[]>;
  markSubmitted(attemptId: string, score: number, passed: boolean): Promise<AttemptRow | null>;
  draft(attemptId: string): Promise<DraftRow | null>;
  /**
   * Merges `selections` into the attempt's draft (creating it) and bumps the revision. Callers
   * hold the attempt lock and have validated the ids against the pinned bank.
   */
  saveDraft(attemptId: string, selections: Record<string, string>): Promise<DraftRow>;
  deleteDraft(attemptId: string): Promise<void>;
  answers(attemptId: string): Promise<AnswerRow[]>;
  insertAnswers(answers: readonly AnswerRow[]): Promise<void>;
  /** Best score and number of submitted attempts of the owner's lesson key in one catalog. */
  attemptStats(userId: string, lessonKey: string, catalogVersion: string): Promise<AttemptStats>;
  /** `attemptStats` of every lesson key of the owner in one catalog, in one query. */
  attemptStatsAll(userId: string, catalogVersion: string): Promise<Map<string, AttemptStats>>;
  /** Serializes the owner's completion writes for the rest of the transaction. */
  lockUser(userId: string): Promise<void>;
  completion(userId: string, lessonKey: string): Promise<CompletionRow | null>;
  /** Inserts the completion unless one already exists for (user, lesson key); null if it existed. */
  insertCompletion(completion: NewCompletion): Promise<CompletionRow | null>;
  /** Records the reward outcome next to the evidence of the completion that created it. */
  attachReward(userId: string, lessonKey: string, reward: Record<string, unknown>): Promise<void>;
  completions(userId: string): Promise<CompletionRow[]>;
  /** `lesson:<legacy id>` capabilities of the user's legacy academy_grants (read only). */
  legacyLessonCapabilities(userId: string): Promise<string[]>;
  scenarioChoice(userId: string, lessonKey: string): Promise<ScenarioChoiceRow | null>;
  scenarioChoices(userId: string): Promise<ScenarioChoiceRow[]>;
  /**
   * Inserts the choice once. A stored row is kept (created=false) unless its scenario_hash differs
   * from the given one (the scenario changed): then it is replaced once (created=true).
   */
  insertScenarioChoice(
    row: NewScenarioChoice,
  ): Promise<{ row: ScenarioChoiceRow; created: boolean }>;
  practiceNotes(userId: string, lessonKey: string): Promise<PracticeNotesRow | null>;
  /**
   * Merges `patch` into the stored notes (per map, by key). Must run inside a transaction: a
   * conflict or a too-large result is turned into an error by the caller, which rolls back the
   * placeholder row inserted by the first save. `expectedRevision` 0 means "no row yet"; n > 0
   * must equal the stored revision; undefined means last write wins.
   */
  savePracticeNotes(
    userId: string,
    lessonKey: string,
    lessonId: string,
    patch: NotesPatch,
    expectedRevision?: number,
  ): Promise<SaveNotesResult>;
}

export interface AcademyStoreProvider {
  store(): AcademyStore;
  /** `tx` is the transaction client, handed to cross-module hooks that must join the transaction. */
  transaction<T>(operation: (store: AcademyStore, tx: SqlClient) => Promise<T>): Promise<T>;
}

/** True when merging `patch` into `stored` changes nothing. */
export function notesPatchIsNoop(stored: NotesMaps, patch: NotesPatch): boolean {
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  return (['texts', 'checks', 'scores'] as const).every((map) =>
    Object.entries(patch[map] ?? {}).every(([key, value]) => same(stored[map][key], value)),
  );
}

const ATTEMPT_COLUMNS = `id, user_id, lesson_id, lesson_key, kind, catalog_version, content_version,
  questions_version, question_ids, option_orders, status, idempotency_key, created_at, submitted_at,
  score, passed`;
const DRAFT_COLUMNS = 'attempt_id, selections, revision, updated_at';
const COMPLETION_COLUMNS = `user_id, lesson_key, catalog_version, lesson_id, completion_method,
  attempt_id, request_id, content_version, completed_at, source`;
const SCENARIO_COLUMNS =
  'user_id, lesson_key, lesson_id, choice, scenario_hash, catalog_version, created_at';
const NOTES_COLUMNS =
  'user_id, lesson_key, lesson_id, texts, checks, scores, revision, created_at, updated_at';

export class AcademySqlStore implements AcademyStore {
  constructor(private readonly client: SqlClient) {}

  async insertAttempt(attempt: NewAttempt): Promise<AttemptRow | null> {
    const rows = await this.client.query<AttemptRow>(
      `insert into academy_attempts
         (id, user_id, lesson_id, lesson_key, kind, catalog_version, content_version,
          questions_version, question_ids, option_orders, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10::jsonb, $11)
       on conflict (user_id, idempotency_key) do nothing
       returning ${ATTEMPT_COLUMNS}`,
      [
        attempt.id,
        attempt.user_id,
        attempt.lesson_id,
        attempt.lesson_key,
        attempt.kind,
        attempt.catalog_version,
        attempt.content_version,
        attempt.questions_version,
        attempt.question_ids,
        JSON.stringify(attempt.option_orders),
        attempt.idempotency_key,
      ],
    );
    return rows[0] ?? null;
  }

  async attemptByIdempotencyKey(userId: string, idempotencyKey: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts where user_id = $1 and idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async lockAttempt(userId: string, attemptId: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts where id = $1 and user_id = $2 for update`,
      [attemptId, userId],
    );
    return rows[0] ?? null;
  }

  async attemptById(userId: string, attemptId: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts where id = $1 and user_id = $2`,
      [attemptId, userId],
    );
    return rows[0] ?? null;
  }

  async latestOpenAttempt(userId: string, lessonKey: string, catalogVersion: string) {
    const rows = await this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts
       where user_id = $1 and lesson_key = $2 and catalog_version = $3 and status = 'open'
       order by created_at desc, id desc
       limit 1`,
      [userId, lessonKey, catalogVersion],
    );
    return rows[0] ?? null;
  }

  submittedAttempts(
    userId: string,
    lessonKey: string,
    catalogVersion: string,
    limit: number,
    offset: number,
  ) {
    return this.client.query<AttemptRow>(
      `select ${ATTEMPT_COLUMNS} from academy_attempts
       where user_id = $1 and lesson_key = $2 and catalog_version = $3 and status = 'submitted'
       order by submitted_at desc, id desc
       limit $4 offset $5`,
      [userId, lessonKey, catalogVersion, limit, offset],
    );
  }

  async markSubmitted(attemptId: string, score: number, passed: boolean) {
    const rows = await this.client.query<AttemptRow>(
      `update academy_attempts set status = 'submitted', submitted_at = now(), score = $2, passed = $3
       where id = $1 and status = 'open'
       returning ${ATTEMPT_COLUMNS}`,
      [attemptId, score, passed],
    );
    return rows[0] ?? null;
  }

  async draft(attemptId: string) {
    const rows = await this.client.query<DraftRow>(
      `select ${DRAFT_COLUMNS} from academy_attempt_drafts where attempt_id = $1`,
      [attemptId],
    );
    return rows[0] ?? null;
  }

  async saveDraft(attemptId: string, selections: Record<string, string>) {
    const rows = await this.client.query<DraftRow>(
      `insert into academy_attempt_drafts (attempt_id, selections)
       values ($1, $2::jsonb)
       on conflict (attempt_id) do update
         set selections = academy_attempt_drafts.selections || excluded.selections,
             revision = academy_attempt_drafts.revision + 1,
             updated_at = now()
       returning ${DRAFT_COLUMNS}`,
      [attemptId, JSON.stringify(selections)],
    );
    const row = rows[0];
    if (!row) throw new Error('Academy draft upsert returned no row');
    return row;
  }

  async deleteDraft(attemptId: string) {
    await this.client.query('delete from academy_attempt_drafts where attempt_id = $1', [
      attemptId,
    ]);
  }

  answers(attemptId: string) {
    return this.client.query<AnswerRow>(
      'select attempt_id, question_id, option_id, correct from academy_answers where attempt_id = $1',
      [attemptId],
    );
  }

  async insertAnswers(answers: readonly AnswerRow[]) {
    if (!answers.length) return;
    await this.client.query(
      `insert into academy_answers (attempt_id, question_id, option_id, correct)
       select $1::uuid, question_id, option_id, correct
       from unnest($2::text[], $3::text[], $4::boolean[]) as a(question_id, option_id, correct)`,
      [
        answers[0]!.attempt_id,
        answers.map((answer) => answer.question_id),
        answers.map((answer) => answer.option_id),
        answers.map((answer) => answer.correct),
      ],
    );
  }

  async attemptStats(userId: string, lessonKey: string, catalogVersion: string) {
    const rows = await this.client.query<{ best_score: number | null; attempts_submitted: number }>(
      `select max(score) as best_score, count(*)::int as attempts_submitted
       from academy_attempts
       where user_id = $1 and lesson_key = $2 and catalog_version = $3 and status = 'submitted'`,
      [userId, lessonKey, catalogVersion],
    );
    return {
      best_score: rows[0]?.best_score ?? null,
      attempts_submitted: Number(rows[0]?.attempts_submitted ?? 0),
    };
  }

  async attemptStatsAll(userId: string, catalogVersion: string) {
    const rows = await this.client.query<{
      lesson_key: string;
      best_score: number | null;
      attempts_submitted: number;
    }>(
      `select lesson_key, max(score) as best_score, count(*)::int as attempts_submitted
       from academy_attempts
       where user_id = $1 and catalog_version = $2 and status = 'submitted'
         and lesson_key is not null
       group by lesson_key`,
      [userId, catalogVersion],
    );
    return new Map(
      rows.map((row) => [
        row.lesson_key,
        {
          best_score: row.best_score === null ? null : Number(row.best_score),
          attempts_submitted: Number(row.attempts_submitted),
        },
      ]),
    );
  }

  async lockUser(userId: string) {
    await this.client.query(
      `select pg_advisory_xact_lock(hashtext('academy_completions:' || $1::text))`,
      [userId],
    );
  }

  async completion(userId: string, lessonKey: string) {
    const rows = await this.client.query<CompletionRow>(
      `select ${COMPLETION_COLUMNS} from academy_completions where user_id = $1 and lesson_key = $2`,
      [userId, lessonKey],
    );
    return rows[0] ?? null;
  }

  async insertCompletion(completion: NewCompletion) {
    const rows = await this.client.query<CompletionRow>(
      `insert into academy_completions
         (user_id, lesson_key, catalog_version, lesson_id, completion_method, attempt_id, request_id,
          content_version, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       on conflict (user_id, lesson_key) do nothing
       returning ${COMPLETION_COLUMNS}`,
      [
        completion.user_id,
        completion.lesson_key,
        completion.catalog_version,
        completion.lesson_id,
        completion.completion_method,
        completion.attempt_id,
        completion.request_id,
        completion.content_version,
        JSON.stringify(completion.source),
      ],
    );
    return rows[0] ?? null;
  }

  async attachReward(userId: string, lessonKey: string, reward: Record<string, unknown>) {
    await this.client.query(
      `update academy_completions set source = source || jsonb_build_object('reward', $3::jsonb)
       where user_id = $1 and lesson_key = $2`,
      [userId, lessonKey, JSON.stringify(reward)],
    );
  }

  completions(userId: string) {
    return this.client.query<CompletionRow>(
      `select ${COMPLETION_COLUMNS} from academy_completions
       where user_id = $1 order by completed_at, lesson_key`,
      [userId],
    );
  }

  async legacyLessonCapabilities(userId: string) {
    const rows = await this.client.query<{ capability: string }>(
      `select distinct c.capability
       from academy_grants g cross join lateral unnest(g.capability_ids) as c(capability)
       where g.user_id = $1 and c.capability like 'lesson:%'
       order by c.capability`,
      [userId],
    );
    return rows.map((row) => row.capability);
  }

  async scenarioChoice(userId: string, lessonKey: string) {
    const rows = await this.client.query<ScenarioChoiceRow>(
      `select ${SCENARIO_COLUMNS} from academy_scenario_choices
       where user_id = $1 and lesson_key = $2`,
      [userId, lessonKey],
    );
    return rows[0] ?? null;
  }

  scenarioChoices(userId: string) {
    return this.client.query<ScenarioChoiceRow>(
      `select ${SCENARIO_COLUMNS} from academy_scenario_choices
       where user_id = $1 order by lesson_key`,
      [userId],
    );
  }

  async insertScenarioChoice(row: NewScenarioChoice) {
    const inserted = await this.client.query<ScenarioChoiceRow>(
      `insert into academy_scenario_choices
         (user_id, lesson_key, lesson_id, choice, scenario_hash, catalog_version)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, lesson_key) do update
         set choice = excluded.choice, scenario_hash = excluded.scenario_hash,
             lesson_id = excluded.lesson_id, catalog_version = excluded.catalog_version,
             created_at = now()
         where academy_scenario_choices.scenario_hash <> excluded.scenario_hash
       returning ${SCENARIO_COLUMNS}`,
      [
        row.user_id,
        row.lesson_key,
        row.lesson_id,
        row.choice,
        row.scenario_hash,
        row.catalog_version,
      ],
    );
    if (inserted[0]) return { row: inserted[0], created: true };
    const stored = await this.scenarioChoice(row.user_id, row.lesson_key);
    if (!stored) throw new Error('Academy scenario choice disappeared after a conflict');
    return { row: stored, created: false };
  }

  async practiceNotes(userId: string, lessonKey: string) {
    const rows = await this.client.query<PracticeNotesRow>(
      `select ${NOTES_COLUMNS} from academy_practice_notes where user_id = $1 and lesson_key = $2`,
      [userId, lessonKey],
    );
    return rows[0] ?? null;
  }

  async savePracticeNotes(
    userId: string,
    lessonKey: string,
    lessonId: string,
    patch: NotesPatch,
    expectedRevision?: number,
  ): Promise<SaveNotesResult> {
    // 1. Placeholder row so concurrent first saves serialize on the row lock (no PK violation).
    const placeholder = await this.client.query<{ inserted: number }>(
      `insert into academy_practice_notes (user_id, lesson_key, lesson_id)
       values ($1, $2, $3)
       on conflict (user_id, lesson_key) do nothing
       returning 1 as inserted`,
      [userId, lessonKey, lessonId],
    );
    const inserted = placeholder.length > 0;
    // 2. Lock the row for the rest of the transaction.
    const locked = await this.client.query<PracticeNotesRow>(
      `select ${NOTES_COLUMNS} from academy_practice_notes
       where user_id = $1 and lesson_key = $2 for update`,
      [userId, lessonKey],
    );
    const stored = locked[0];
    if (!stored) throw new Error('Academy practice notes row disappeared under lock');
    // 3. Optimistic guard.
    if (expectedRevision !== undefined) {
      const conflict =
        expectedRevision === 0 ? !inserted : inserted || stored.revision !== expectedRevision;
      if (conflict) return { status: 'conflict', current: inserted ? null : stored };
    }
    // 4. Merge. An unchanged merge on an existing row writes nothing and keeps the revision.
    if (!inserted && notesPatchIsNoop(stored, patch)) return { status: 'saved', row: stored };
    try {
      const rows = await this.client.query<PracticeNotesRow>(
        `update academy_practice_notes
            set texts = texts || $3::jsonb,
                checks = checks || $4::jsonb,
                scores = scores || $5::jsonb,
                revision = case when $6::boolean then 1 else revision + 1 end,
                updated_at = now()
          where user_id = $1 and lesson_key = $2
            and octet_length((texts || $3::jsonb)::text)
                + octet_length((checks || $4::jsonb)::text)
                + octet_length((scores || $5::jsonb)::text) <= ${NOTES_SIZE_LIMIT}
          returning ${NOTES_COLUMNS}`,
        [
          userId,
          lessonKey,
          JSON.stringify(patch.texts ?? {}),
          JSON.stringify(patch.checks ?? {}),
          JSON.stringify(patch.scores ?? {}),
          inserted,
        ],
      );
      return rows[0] ? { status: 'saved', row: rows[0] } : { status: 'too_large' };
    } catch (error) {
      const pg = error as { code?: string; constraint?: string };
      if (pg.code === '23514' && pg.constraint === 'ck_academy_practice_notes_size')
        return { status: 'too_large' };
      throw error;
    }
  }
}

@Injectable()
export class AcademyRepository implements AcademyStoreProvider {
  constructor(private readonly database: DatabaseService) {}

  store(): AcademyStore {
    return new AcademySqlStore(this.database);
  }

  transaction<T>(operation: (store: AcademyStore, tx: SqlClient) => Promise<T>): Promise<T> {
    return this.database.transaction((client) => operation(new AcademySqlStore(client), client));
  }
}
