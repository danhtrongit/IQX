# Học viện v3.2: canonical design

Repo `/Users/danhtrongit/Projects/IQX`, integration branch `feat/academy-v32` (base d145fd5d).
Shared contract: `backend/src/modules/academy/content/v3/schema.ts` (written, typechecks, lints, smoke-tested; revised after
three reviews, see the Review log at the end).
Everything below is decided. Where this document and a `map-*.md` survey disagree, this document wins.

Contents: 0 decisions and ids · 1 data model and migration 0026 · 2 HTTP endpoints · 3 sequence and unlock ·
4 attempt lifecycle · 5 grants · 6 importer · 7 frontend · 8 consumer changes · 9 test plan · 10 work split.

---

## 0. Fixed decisions, ids, keys

| Topic | Decision |
|---|---|
| Content | Typed blocks in JSON, React/SVG renderers. Chart numbers precomputed by the importer (ported mockup PRNG and indicator math). The browser only draws. |
| Catalog version | `iqx-academy-v3.2-14ch-94lessons` (`ACADEMY_V3_CATALOG_VERSION`) |
| Chapters | 14. Ch1-5 published (full items). Ch6-14 stubs `{no,title,published:false,lesson_count}`. `sum(lesson_count) = 94`. Required published = 43. |
| Item ids | `chNN-lMM`, `chNN-exam`, `ch03-practice` (regex `^ch\d{2}-(l\d{2}|exam|practice)$`) |
| Item kinds | `lesson`, `practice` (optional, ch3 only), `chapter_exam` |
| States | `passed`, `open`, `locked` (server computed) |
| Lesson keys | ch04-l04..l08 reuse `technical:volume|ma|rsi|macd|bollinger`. Every other lesson and practice: `concept:<slug>` (table below). Exams `exam:chNN`. Exam keys never earn coins. |
| Unlock | Prefix rule: open iff every earlier required item is passed. Optional items never block. |
| Quiz | Server shuffles question + option order per attempt (frozen). 3 options. ch1-3 lesson 3q, ch4+ lesson 5q, exams 20 / 30. Pass = all correct. No answers, no explanations, ever (including history). No back button. Drafts and resume kept. |
| Coins | +100 on first pass of lessons and practice. Exams 0. |
| Grants | Capability from completion key prefix, even when the key is not in the catalog. New users can only unlock the 5 indicators. |
| Cutover | Hard, single release: migration 0026 -> backend -> contracts regen -> frontend. Old 13ch content and pipeline removed. |
| Guide mode | Removed (`POST lessons/:id/complete` deleted). |
| Review | `GET attempts/:id` deleted. History is score-only. |
| Mobile | Out of scope. |

### 0.1 Catalog table (the only source of keys; lives in `scripts/academy-v32-import/catalog-table.ts`)

`o` = order within chapter. `q` = question_count.

| id | o | q | lesson_key | name | unlock |
|---|---|---|---|---|---|
| ch01-l01 | 1 | 3 | concept:dau_tu_chung_khoan | Đầu tư chứng khoán | |
| ch01-l02 | 2 | 3 | concept:thi_truong_va_san | Thị trường và các sàn | |
| ch01-l03 | 3 | 3 | concept:co_che_giao_dich | Cơ chế giao dịch | |
| ch01-l04 | 4 | 3 | concept:t2_phi_thue_margin | T+2, phí, thuế và margin | |
| ch01-l05 | 5 | 3 | concept:co_phieu_trai_phieu | Cổ phiếu và trái phiếu | |
| ch01-l06 | 6 | 3 | concept:quy_etf_cw_phai_sinh | Quỹ, ETF, chứng quyền và phái sinh | |
| ch01-l07 | 7 | 3 | concept:quyen_co_dong | Quyền cổ đông và sự kiện doanh nghiệp | |
| ch01-l08 | 8 | 3 | concept:chu_ky_kinh_te_lai_suat | Chu kỳ kinh tế và lãi suất | |
| ch01-l09 | 9 | 3 | concept:bon_pha_thi_truong | Bốn pha của thị trường | |
| ch01-l10 | 10 | 3 | concept:quan_tri_rui_ro_tam_ly | Quản trị rủi ro và tâm lý đầu tư | |
| ch01-exam | 11 | 20 | exam:ch01 | Bài thi Chương 1 | |
| ch02-l01 | 1 | 3 | concept:saco_la_ai | SACO là ai và làm gì | |
| ch02-l02 | 2 | 3 | concept:hieu_khach_hang | Hiểu khách hàng | |
| ch02-l03 | 3 | 3 | concept:tim_khach_hang | Tìm khách hàng | |
| ch02-l04 | 4 | 3 | concept:mo_loi_tiep_can | Mở lời tiếp cận | |
| ch02-l05 | 5 | 3 | concept:tu_van_hoi_nghe | Tư vấn: hỏi đúng, nghe nhiều | |
| ch02-l06 | 6 | 3 | concept:ban_gia_tri_dong_hanh | Bán giá trị bạn đồng hành | |
| ch02-l07 | 7 | 3 | concept:xu_ly_tu_choi | Xử lý từ chối | |
| ch02-l08 | 8 | 3 | concept:chot_kich_hoat_khach | Chốt và kích hoạt khách | |
| ch02-l09 | 9 | 3 | concept:cham_soc_gioi_thieu | Chăm sóc và giới thiệu | |
| ch02-l10 | 10 | 3 | concept:nguyen_tac_lich_lam_viec | Nguyên tắc nghề và lịch làm việc mỗi ngày | |
| ch02-exam | 11 | 20 | exam:ch02 | Bài thi Chương 2 | |
| ch03-l01 | 1 | 3 | concept:vi_sao_thuong_hieu | Vì sao SACO cần thương hiệu cá nhân | |
| ch03-l02 | 2 | 3 | concept:dinh_vi_hinh_anh | Định vị và hình ảnh | |
| ch03-l03 | 3 | 3 | concept:thuong_hieu_offline | Thương hiệu offline | |
| ch03-l04 | 4 | 3 | concept:he_sinh_thai_online | Hệ sinh thái online | |
| ch03-l05 | 5 | 3 | concept:thuong_hieu_facebook | Thương hiệu trên Facebook cá nhân | |
| ch03-l06 | 6 | 3 | concept:thuong_hieu_zalo | Thương hiệu trên Zalo | |
| ch03-l07 | 7 | 3 | concept:thuong_hieu_tiktok_reels | Thương hiệu trên TikTok và Reels | |
| ch03-l08 | 8 | 3 | concept:livestream_hoi_nhom | Livestream và hội nhóm | |
| ch03-l09 | 9 | 3 | concept:tam_sai_lam_100_ngay | Tám sai lầm và kế hoạch 100 ngày | |
| ch03-exam | 10 | 20 | exam:ch03 | Bài thi Chương 3 | |
| ch03-practice | 11 | 3 | concept:phong_tap_thuc_chien | Phòng tập thực chiến | (optional: `optional:true`; the name has no suffix so the h1 check passes) |
| ch04-l01 | 1 | 5 | concept:bieu_do_nen | Biểu đồ nến | |
| ch04-l02 | 2 | 5 | concept:xu_huong | Xu hướng | |
| ch04-l03 | 3 | 5 | concept:ho_tro_khang_cu | Hỗ trợ và kháng cự | |
| ch04-l04 | 4 | 5 | technical:volume | Khối lượng | volume "Khối lượng" |
| ch04-l05 | 5 | 5 | technical:ma | MA · đường trung bình | ma "MA" |
| ch04-l06 | 6 | 5 | technical:rsi | RSI | rsi "RSI" |
| ch04-l07 | 7 | 5 | technical:macd | MACD | macd "MACD" |
| ch04-l08 | 8 | 5 | technical:bollinger | Bollinger Bands | bollinger "Bollinger Bands" |
| ch04-l09 | 9 | 5 | concept:fibonacci | Fibonacci | |
| ch04-l10 | 10 | 5 | concept:song_elliott | Sóng Elliott | |
| ch04-exam | 11 | 30 | exam:ch04 | Bài thi Chương 4 | |
| ch05-l01 | 1 | 5 | concept:dca | Đầu tư định kỳ (DCA) | |
| ch05-l02 | 2 | 5 | concept:dau_tu_gia_tri | Đầu tư giá trị | |
| ch05-l03 | 3 | 5 | concept:phuong_phap_4m | Phương pháp 4M | |
| ch05-l04 | 4 | 5 | concept:canslim | CANSLIM | |
| ch05-exam | 5 | 30 | exam:ch05 | Bài thi Chương 5 | |

Stubs: 6 Backtest và Bộ lọc 7 · 7 Chỉ báo xu hướng 4 · 8 Chỉ báo động lượng và dòng tiền 7 · 9 Tốc độ tăng trưởng 6 ·
10 Độ ổn định 5 · 11 Hiệu quả và biên lợi nhuận 7 · 12 Nợ và khả năng thanh toán 4 · 13 Dòng tiền 5 · 14 Định giá 6.

Chapter titles 1-5: Nền tảng · Kỹ năng Sale SACO · Thương hiệu cá nhân · Phương pháp kỹ thuật · Phương pháp cơ bản.
`concept:hop_luu` and every old `guide:*` key are never reused. The DB never sees a `concept:` slug twice.

Exam `intro` (catalog, plain text, first sentence only; the UI appends the bold constant
"Cần trả lời đúng tất cả câu hỏi để hoàn thành."):
- ch1/4/5: "Bài thi gồm N câu hỏi về toàn bộ kiến thức Chương c."
- ch2: "Bài thi gồm 20 câu hỏi về toàn bộ kỹ năng sale của SACO trong Chương 2."
- ch3: "Bài thi gồm 20 câu hỏi về toàn bộ kiến thức thương hiệu cá nhân trong Chương 3."

---

## 1. Data model

### 1.1 Content files (`backend/src/modules/academy/content/v3/`)

| File | Schema (schema.ts) | Visibility |
|---|---|---|
| `schema.ts` | the contract | code |
| `catalog.json` | `catalogFileSchema` | public metadata |
| `lessons/<item id>.vi.json` (43 lessons + `ch03-practice`) | `lessonFileSchema` | public, only for non-locked items |
| `questions/<item id>.private.json` (49) | `bankFileSchema` (incl. secret `salt`) | PRIVATE, never serialized |
| `retired-lessons.json` | `retiredLessonsFileSchema` | names of 66 old keys (shop ledger) |
| `import-manifest.json` | importer-owned | never loaded |

Derived at load (P1 loader): `content_version = canonicalHash(lessonFile).slice(0,16)` (fits varchar(32));
`assessment_version = canonicalHash(bankFile)` (64 hex, fits `questions_version char(64)`). The bank file includes its
secret `salt`, so the version cannot be recomputed from public data; it is also never sent to the client
(removed from `attemptResponseSchema`). Option ids are `HMAC-SHA256(salt, qid|j).slice(0,10)` (schema.ts `bankSaltSchema`).
`copy-assets` copies `content/v3` (banks included) to `dist`: the server needs the banks at runtime; dist is never served.
Bank size equals `question_count`; every attempt uses all questions of the bank in a fresh order.

Removed: `content/catalog.v1.json` (moved to `backend/test/fixtures/academy/catalog-13ch.v1.json` for the grants parity test
and the importer's `--retired-from`; `test/fixtures/academy` and `test/fixtures/quant` are added to `.prettierignore`),
`content/packages/**`, `content/lessons/**` (quant fixtures moved first, see §8), `content/archive/**`, `content/legacy/**`.

### 1.2 Loader output (types committed in M1; P1 implements; P3 consumes exactly these fields)

Types and the pure `buildAcademyContent` signature live in `academy.content.types.ts` (M1). The runtime loader
`academy.content.ts` keeps reading the OLD content until P1's final merge (after P2's content is on the integration branch),
so the backend boots at every merge point. The staff progress reader takes content through an injectable provider
(`ACADEMY_CONTENT` token, default `loadAcademyContent`), so P3 unit tests use `test/unit/academy-v3-fixture.ts`.

```ts
// backend/src/modules/academy/academy.content.types.ts (M1) + academy.content.ts (P1)
export interface AcademyItem extends CatalogItem {           // CatalogItem from schema.ts
  chapter: number;
  chapter_title: string;
  position: number | null;          // 1..lesson_count for kind 'lesson', else null
  capabilities: string[];           // ['indicator:<id>'] when unlock, else []
  lesson: { file: LessonFile; content_version: string } | null;   // null for exams
  bank: { questions: BankQuestion[]; version: string };
}
export interface AcademyContent {
  catalog: CatalogFile;
  sequence: SequenceItem[];         // buildSequence(catalog)
  items: ReadonlyMap<string, AcademyItem>;      // by item id
  itemsByKey: ReadonlyMap<string, AcademyItem>; // by lesson_key
  requiredTotal: number;            // 43
  retired: ReadonlyMap<string, string>;         // lesson_key -> name
}
export function buildAcademyContent(files: AcademyContentFiles): AcademyContent; // pure, throws on any inconsistency
export function loadAcademyContent(): AcademyContent;                            // memoized, reads content/v3
```
Load-time checks (boot fails on any): catalog parses; every published lesson/practice item has a lesson file whose
`id/lesson_key/kind/chapter/order/title(=name)` match the catalog; every published item has a bank with
`questions.length === question_count`; no lesson/bank file for unknown items; `has_scenario` matches
`scenarioOf(lesson) !== null`; retired keys are not catalog keys.

### 1.3 Migration `backend/migrations/0026_academy_v32.sql`

```sql
-- Học viện v3.2: chapter exams, variable quiz sizes, exam keys, scenario choices, practice notes.
-- Idempotent. Existing rows are untouched: old completions keep their keys (5 indicator keys carry over).

-- Attempts: kind + score bound by the attempt's own question count (3/5/20/30; legacy 8).
ALTER TABLE academy_attempts ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'lesson';
ALTER TABLE academy_attempts DROP CONSTRAINT IF EXISTS ck_academy_attempts_kind;
ALTER TABLE academy_attempts
  ADD CONSTRAINT ck_academy_attempts_kind CHECK (kind IN ('lesson', 'chapter_exam'));
ALTER TABLE academy_attempts DROP CONSTRAINT IF EXISTS academy_attempts_score_check;
ALTER TABLE academy_attempts DROP CONSTRAINT IF EXISTS ck_academy_attempts_score;
ALTER TABLE academy_attempts
  ADD CONSTRAINT ck_academy_attempts_score
  CHECK (score IS NULL OR (score >= 0 AND score <= cardinality(question_ids)));
-- Exams have no lesson content: content_version is NULL for chapter_exam attempts.
-- Rollback-safe: old code always supplies a value.
ALTER TABLE academy_attempts ALTER COLUMN content_version DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ix_academy_attempts_user_key_catalog
  ON academy_attempts (user_id, lesson_key, catalog_version, created_at DESC)
  WHERE lesson_key IS NOT NULL;

-- Completions: allow exam:chNN keys.
ALTER TABLE academy_completions DROP CONSTRAINT IF EXISTS ck_academy_completions_key;
ALTER TABLE academy_completions
  ADD CONSTRAINT ck_academy_completions_key
  CHECK (lesson_key ~ '^(technical|fundamental|concept|guide|exam):[a-z0-9_-]+$');

-- Rewards: chapter exams never pay (defence in depth; the service never calls the hook for exams).
ALTER TABLE lesson_rewards DROP CONSTRAINT IF EXISTS ck_lesson_rewards_not_exam;
ALTER TABLE lesson_rewards
  ADD CONSTRAINT ck_lesson_rewards_not_exam CHECK (lesson_key NOT LIKE 'exam:%');

-- Scenario choice per account: insert once (spec §2.3, §5.2). Only exception: when scenario_hash differs from the
-- current scenario (content changed), the next POST replaces the stale row once (see §2 endpoint 4).
CREATE TABLE IF NOT EXISTS academy_scenario_choices (
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key     varchar(96) NOT NULL,
  lesson_id      varchar(32) NOT NULL,
  choice         smallint    NOT NULL,
  scenario_hash  char(64)    NOT NULL,
  catalog_version varchar(64) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_scenario_choices PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT ck_academy_scenario_choices_choice CHECK (choice BETWEEN 0 AND 2)
);

-- Practice notes per account: workpads, checklists, roleplay scores. Revisioned, size capped.
CREATE TABLE IF NOT EXISTS academy_practice_notes (
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key  varchar(96) NOT NULL,
  lesson_id   varchar(32) NOT NULL,
  texts       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  checks      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  scores      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  revision    integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_practice_notes PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT ck_academy_practice_notes_revision CHECK (revision >= 1),
  CONSTRAINT ck_academy_practice_notes_shape CHECK (
    jsonb_typeof(texts) = 'object' AND jsonb_typeof(checks) = 'object' AND jsonb_typeof(scores) = 'object'),
  CONSTRAINT ck_academy_practice_notes_size CHECK (
    octet_length(texts::text) + octet_length(checks::text) + octet_length(scores::text) <= 65536)
);
```
The size CHECK is defence in depth. The service measures the merged size in the same SQL measure
(`octet_length(jsonb::text)`, which is larger than compact `JSON.stringify`) inside the UPDATE's WHERE clause and
maps 0 updated rows to 422 NOTES_TOO_LARGE; a 23514 on `ck_academy_practice_notes_size` is also mapped to 422.
Unchanged: `academy_answers` (still written, never served), `academy_attempt_drafts`, `academy_grants` (legacy `lesson:*`),
`lesson_rewards` PK `(user_id, lesson_key)`, `coin_ledger`. No data backfill.

### 1.4 Repository additions (`academy.repository.ts`, `AcademyStore`)

```ts
insertAttempt(row: NewAttempt & { kind: 'lesson' | 'chapter_exam' })
attemptStats(userId, lessonKey, catalogVersion)        // ADD catalog filter
submittedAttempts(userId, lessonKey, catalogVersion, limit, offset)  // ADD catalog filter
attemptStatsAll(userId, catalogVersion): Map<lessonKey, {best, submitted}>   // progress in one query
scenarioChoice(userId, lessonKey): ScenarioChoiceRow | null
scenarioChoices(userId): ScenarioChoiceRow[]
insertScenarioChoice(row): {row: ScenarioChoiceRow, created: boolean}
  // INSERT ... ON CONFLICT (user_id, lesson_key) DO UPDATE SET choice=EXCLUDED.choice, scenario_hash=EXCLUDED.scenario_hash,
  //   lesson_id=EXCLUDED.lesson_id, catalog_version=EXCLUDED.catalog_version, created_at=now()
  //   WHERE academy_scenario_choices.scenario_hash <> EXCLUDED.scenario_hash RETURNING *;  (created = a row came back)
  // no row returned -> SELECT the stored row (created=false). Safe under read committed.
practiceNotes(userId, lessonKey): PracticeNotesRow | null
savePracticeNotes(tx, userId, lessonKey, lessonId, patch, expectedRevision?): PracticeNotesRow
  // one transaction:
  // 1. INSERT (user_id, lesson_key, lesson_id) VALUES (...) ON CONFLICT DO NOTHING RETURNING 1   -> inserted: boolean
  // 2. SELECT ... FOR UPDATE
  // 3. expected_revision === 0 and !inserted -> 409; expected_revision = n > 0 and (inserted or row.revision != n) -> 409
  //    (409 rolls back, so a placeholder from step 1 disappears; details[0].notes = current stored notes or empty)
  // 4. merged = stored || patch per map; UPDATE ... SET maps, revision = CASE WHEN inserted THEN 1 ELSE revision + 1 END
  //    WHERE pk AND octet_length(merged texts::text)+octet_length(checks)+octet_length(scores) <= 65536 RETURNING *;
  //    0 rows -> rollback, 422 NOTES_TOO_LARGE. Unchanged merge on an existing row -> no UPDATE, revision kept.
  // Concurrent first saves: both see the row after step 1; one waits on FOR UPDATE; no PK violation.
```

---

## 2. HTTP endpoints (`api/v2/academy`, guards `AcademyEnabledGuard, ApiAuthGuard`)

All zod shapes are exported from `schema.ts` §6; `academy.schemas.ts` re-exports them (plus `attemptIdParamSchema = z.uuid()`).
Path param `:lessonId` uses `itemIdSchema`. Error bodies keep the platform error envelope `{error:{code,message,details?}}`.

| # | Method, path | Request | 2xx response | Errors |
|---|---|---|---|---|
| 1 | GET `catalog` | - | 200 `catalogResponseSchema` | FEATURE_DISABLED 404 |
| 2 | GET `progress` | - | 200 `progressResponseSchema` | |
| 3 | GET `lessons/:lessonId` | - | 200 `itemResponseSchema` (union on `kind`: lesson/practice content, or exam intro) | LESSON_NOT_FOUND 404 (unknown/unpublished), ACADEMY_ITEM_LOCKED 403 |
| 4 | POST `lessons/:lessonId/scenario` | `scenarioChoiceRequestSchema` `{choice:0|1|2}` | 200 `scenarioChoiceResponseSchema` (stored row; replay with any choice returns the first; `created` tells which; a row whose `scenario_hash` is stale is replaced once) | 404, 403 ACADEMY_ITEM_LOCKED, 422 NO_SCENARIO |
| 5 | GET `lessons/:lessonId/notes` | - | 200 `notesResponseSchema` (revision 0 and empty maps when none) | 404 LESSON_NOT_FOUND / NOTES_NOT_AVAILABLE, 403 |
| 6 | PUT `lessons/:lessonId/notes` | `notesSaveRequestSchema` (partial maps, merged by key) | 200 `notesResponseSchema` | 404, 403, 409 NOTES_REVISION_CONFLICT (`details[0].notes` = current), 422 INVALID_NOTES, 422 NOTES_TOO_LARGE |
| 7 | GET `lessons/:lessonId/attempt` | - | 200 `resumeResponseSchema` (`attempt: null` when none open in the current catalog) | 404 |
| 8 | GET `lessons/:lessonId/attempts` | query `historyQuerySchema` | 200 `historyResponseSchema` (score-only, current catalog) | 404 |
| 9 | POST `attempts` | `attemptCreateRequestSchema` `{lesson_id:<item id>, catalog_version, idempotency_key}` | 201 `attemptResponseSchema` (replay of the same key returns the same attempt only when it is current-catalog and the same `lesson_id`; otherwise 409 IDEMPOTENCY_KEY_REUSED) | 404, 403 ACADEMY_ITEM_LOCKED, 403 ACADEMY_SCENARIO_REQUIRED, 409 CATALOG_VERSION_MISMATCH, 409 IDEMPOTENCY_KEY_REUSED |
| 10 | PUT `attempts/:attemptId/answers` | `draftSaveRequestSchema` | 200 `draftSaveResponseSchema` | 404 ATTEMPT_NOT_FOUND, 409 ATTEMPT_ALREADY_SUBMITTED, 409 DRAFT_REVISION_CONFLICT, 409 CATALOG_VERSION_MISMATCH, 409 ASSESSMENT_VERSION_MISMATCH, 422 INVALID_ANSWERS |
| 11 | POST `attempts/:attemptId/submit` | `submitRequestSchema` | 200 `submitResponseSchema` (score only; replay returns the stored result) | same as 10 except DRAFT_REVISION_CONFLICT |
| - | ~~GET `attempts/:attemptId`~~ | removed | | |
| - | ~~POST `lessons/:lessonId/complete`~~ | removed | | |

Rules that apply across endpoints:
- Locked = `itemStates(...).get(id) === 'locked'`. Checked on 3, 4, 5, 6, 9. Endpoints 7, 10, 11 operate on an attempt
  that was created while open; state never regresses, so no lock check.
- Notes (5, 6) exist only for items whose `interactiveKeysOf(lesson)` is non-empty, else 404 NOTES_NOT_AVAILABLE.
  PUT validation: every key must be in the lesson's `texts/checks/scores` sets; strings <= 4000; scores length 6, 0..10;
  merged serialized size <= 65536 bytes. Notes never touch progress.
- Scenario (4): requires `lesson.has_scenario`. Allowed for open and passed items.
- No response ever contains `correct_option_id`, `correct`, `results`, `review`, `explanation`, `assessment_version` or
  `salt`. A test walks every response key (deepKeys over catalog, progress, item, scenario, notes, attempt, resume, draft,
  submit, history) and bans those exact names everywhere, with no exceptions. The scenario block's `best_option` and
  `debrief` are public by design (spec §2.3-5) and deliberately named outside the banned set. A positive assertion
  checks that attempt, resume, draft, submit and history responses contain only the keys of their schemas.
- Scenario stale hash: `scenario_hash = canonicalHash(scenarioBlock)`. Item response returns `scenario_choice: null` when
  the stored hash differs from the current one (UI shows the choice again); the attempt gate (403
  ACADEMY_SCENARIO_REQUIRED) is satisfied by any stored row for the key.
- `progress.items[].completion_method`: the reader maps any DB method outside `quiz|legacy_migration` (e.g. `guide`) to `null`.

Field derivations:
- `catalog.required_total` = 43; `catalog.items[].position` = 1..n for lessons; `unlock.capability_id = 'indicator:'+id`.
- `progress.course_done` = passed required lessons of published chapters (kind `lesson` only); `course_total` = 43.
  `chapters[].done/total` same per chapter; `exam_passed` from `exam:chNN` completion.
  `items[].best_score/attempts_submitted` from current-catalog attempts. `progress_revision` = completions count (unchanged).
- Item response `reward` = `academy_completions.source.reward` of that key (lessons/practice), else null.
- Submit `unlocked_labels` = `[item.unlock.label]` when `item.capabilities` intersects `newly_granted`, else `[]`.
  `chapter_completed` = chapter when an exam passes, else null. `next_item_id` = `nextRequiredItemId(seq, id)` when passed, else null.

---

## 3. Sequence and unlock algorithm

Implemented once, pure, in `schema.ts` §7 (`buildSequence`, `itemStates`, `currentItemId`, `nextRequiredItemId`).
Backend, staff reader and frontend tests all use it. The frontend never computes locks for display: it renders
`progress.items[].state`.

```
seq = for each published chapter in no order: its catalog items in `order`
      (lessons 1..n, exam n+1, practice n+2 for ch3)
prefixDone = true
for item in seq:
  passed = completedKeys has item.lesson_key          # any catalog version, any method
  state  = passed ? 'passed' : prefixDone ? 'open' : 'locked'
  if !item.optional and !passed: prefixDone = false
current_item_id = first non-optional item with state 'open' (null when all required passed)
next_required(id) = first non-optional item after id
```
Verified outcomes (smoke run on the real 49 items):
- new user: only `ch01-l01` open.
- user holding `technical:rsi` only: `ch01-l01=open`, `ch04-l06=passed` (shows "Xem lại", content readable), everything else locked.
- all required ch1-3 passed: `ch03-practice` and `ch04-l01` open together; current = `ch04-l01`; next of `ch03-exam` = `ch04-l01`.
- practice never blocks ch4; practice passed does not change `course_done`.
- publishing chapter 6 later: users who passed `exam:ch05` see `ch06-l01` open automatically (prefix rule), totals grow.

---

## 4. Attempt lifecycle changes (`academy.service.ts`)

**createAttempt(user, {lesson_id, catalog_version, idempotency_key})**
1. `catalog_version !== ACADEMY_V3_CATALOG_VERSION` -> 409 CATALOG_VERSION_MISMATCH.
2. Idempotency replay by `(user_id, idempotency_key)`: if the stored attempt's `catalog_version` is not current or its
   `lesson_id` differs from the request -> 409 IDEMPOTENCY_KEY_REUSED (never build public questions of an old-catalog
   attempt from a new bank); else return the stored attempt view.
3. `item = content.items.get(lesson_id)` else 404 LESSON_NOT_FOUND.
4. `keys = completions(user)`; `state = itemStates(seq, keys).get(id)`; locked -> 403 ACADEMY_ITEM_LOCKED.
5. `item.has_scenario && !scenarioChoice(user, key)` -> 403 ACADEMY_SCENARIO_REQUIRED.
6. Order: shuffle all bank question ids and each question's 3 option ids with `crypto.randomInt` (`this.random` injectable).
   No "reshuffle if equal to source" guard: option ids are salted, so source order carries no information.
7. Insert `{kind: item.kind === 'chapter_exam' ? 'chapter_exam' : 'lesson', catalog_version, lesson_id, lesson_key,
   content_version (null for exams; column made nullable by 0026, `NewAttempt.content_version: string | null`),
   questions_version = bank.version, question_ids, option_orders}`.
8. Respond `attemptResponseSchema` with `toPublicQuestion(q, option_order)`.

**Catalog-first rule (endpoints 7, 8, 10, 11)**: the attempt's `catalog_version` is checked BEFORE any lookup of
`lesson_id` in the current content (old ids like `ch01-l01` name different lessons now). Old submitted attempt -> submit
replay returns the stored score-only result without touching the new item; draft save / submit on an old open attempt ->
409 CATALOG_VERSION_MISMATCH. Keep the existing `pinnedAttempt` / `storedResult` behaviour.

**resume / draft**: unchanged mechanics; `latestOpenAttempt` filters current catalog; `total = question_ids.length`.
The client starts at the first unanswered question and offers no "previous" control; the server accepts drafts in any order.

**submit(user, attemptId, {answers})** (one transaction):
1. lock attempt; submitted -> replay `storedResult` (score-only).
2. `pinnedAttempt`: catalog must be current (else 409 CATALOG_VERSION_MISMATCH); bank version must match the item's
   current bank (else 409 ASSESSMENT_VERSION_MISMATCH; no archive in v3: banks change only with a catalog bump).
3. Answers must cover exactly `question_ids` with valid option ids -> else 422 INVALID_ANSWERS.
4. `score = correct count`, `passed = score === question_ids.length`; `markSubmitted`, `insertAnswers`, `deleteDraft`.
5. If passed: `lockUser`; `insertCompletion({method:'quiz', attempt_id})` on conflict do nothing.
   If newly created and `kind === 'lesson'` (lessons and practice) -> `creditReward` (+100 via LESSON_REWARD_PORT).
   Exams: never call the hook; `reward: null`.
6. Return `submitResponseSchema`. `buildReview`, `ReviewItem`, archived banks and `attemptReview` are deleted.

Constants (`academy.constants.ts`): `ACADEMY_CATALOG_VERSION = ACADEMY_V3_CATALOG_VERSION`,
`ACADEMY_PREVIOUS_CATALOG_VERSIONS = ['iqx-academy-outline-13ch-71lessons-v1','iqx-academy-legacy-18ch-125lessons']`,
`ACADEMY_CHAPTER_COUNT = 14`, `ACADEMY_LESSON_COUNT = 94`. `QUESTIONS_PER_LESSON` is deleted; use `questionCountFor`.

In-flight old attempts at cutover: invisible to resume (catalog filter); a stale tab that PUTs/submits gets 409
CATALOG_VERSION_MISMATCH, and the frontend drops `sessionStorage` attempt keys whose catalog differs.

---

## 5. Grants change (`academy-grants.service.ts`)

```ts
const RETIRED_PREFIX: Record<string, (id: string) => string> = {
  technical: (id) => `indicator:${id}`,
  fundamental: (id) => `metric:${id}`,
};
export function capabilitiesFromCompletions(content: AcademyContent, completions: readonly {lesson_key: string}[]): Set<string> {
  const out = new Set<string>();
  for (const c of completions) {
    const item = content.itemsByKey.get(c.lesson_key);
    if (item) { item.capabilities.forEach((x) => out.add(x)); continue; }
    const m = /^(technical|fundamental):([a-z0-9_]+)$/.exec(c.lesson_key);   // key outside the catalog: keep old grant
    if (m) out.add(RETIRED_PREFIX[m[1]](m[2]));
  }
  return out;
}
// grantedCapabilities(user) = capabilitiesFromCompletions(...) ∪ legacyLessonCapabilities(user)   (unchanged `lesson:*`)
```
- New users: only ch04-l04..l08 have `unlock`, so the reachable set is the 5 indicators. No published lesson grants `metric:*`.
- Parity test (P1): with `test/fixtures/academy/catalog-13ch.v1.json`, for a user with completions on all 71 old keys,
  `old mapping (binding -> capability)` equals the new set (16 `indicator:*` + 42 `metric:*`). Plus: a user with all
  43 new lessons passed gets exactly `indicator:{volume,ma,rsi,macd,bollinger}`.
- `ACADEMY_GRANTS` port interface unchanged; no consumer code changes for grants.

---

## 6. Importer (`backend/scripts/academy-v32-import/`)

Deterministic, rerunnable. Source HTML stays outside the repo (precedent: `academy-import`), at the stable path
`/Users/danhtrongit/Projects/IQX-sources/academy-v32/IQX-Hoc-Vien-MAU.html` (lead copies it from the session scratchpad
before P2 starts; SHA `52d11cb8...`; recorded in the importer README; the run reads `$ACADEMY_V32_SOURCE`).
The importer re-creates everything under `content/v3/` except `schema.ts` and, when `--retired-from` is absent,
`retired-lessons.json` (kept as is). `OUT_DIR` resolves to `backend/src/modules/academy/content/v3` from the package root
(not relative to `dist`), and main.ts asserts the path ends with `src/modules/academy/content/v3`.
Manual fix-ups live in `overrides/` and are re-applied on every run; nobody edits output JSON by hand.

### 6.1 Layout
```
README.md
main.ts              CLI: extract --source <html> [--retired-from <catalog-13ch.v1.json>] | verify
paths.ts             SOURCE_SHA256 = '52d11cb805ee8ce28dc6172908a6383b421947e128c0d908a3c92e389072059f', OUT_DIR
catalog-table.ts     §0.1 table + chapter titles + stubs + exam intros (hand-authored, the only place keys live)
source.ts            read, sha gate (mismatch = exit 1), parse5 parseFragment, articles lesson0..48 -> item ids,
                     IT literal: slice `const IT=` .. the single `;` on that line and `JSON.parse` it (it is plain JSON;
                     no node:vm).
dom.ts               parse5 helpers: classes(), children(), text(), attr(), styleColor(), find()
inline.ts            element -> Inline HTML (b/strong/em/br + tone spans; entity-escape text; collapse whitespace);
                     normalizeText(): rules in §6.3; overrides/text.json lookup
blocks.ts            section walker + dispatch table (root class -> extractor); unknown class = hard failure with path
extractors/          prose.ts tables.ts cards.ts data.ts sales.ts interactive.ts figures.ts
charts/tones.ts      hex -> ChartTone (table in §6.4)
charts/math.ts       mockup helpers ported verbatim: lcg, rng (mulberry32 variant), series, genVar, path, sma,
                     emaFirstSeeded, rsiWilder, bands(pop σ), macdOf, crosses, crossList, rsiDotStates, round4
charts/ch1.ts ch2.ts ch4.ts ch5.ts   CHART_BUILDERS: Record<chartId, () => ChartModel> (hand port of each IIFE)
charts/text-figures.ts  TEXT_FIGURES: Record<svgId, () => Block[]> for the 8 svg drawings that become blocks
charts/index.ts      registry + gate: DOM svg ids == CHART_BUILDERS ∪ TEXT_FIGURES ∪ ICONS (3)
banks.ts             IT[g].q -> BankFile; ids `${item}-qNN`; salt from overrides/salts.json (generated once with
                     crypto.randomBytes(32) when missing, then committed); option id = HMAC-SHA256(salt, `${qid}|${j}`)
                     .slice(0,10)
overrides/text.json  { "<exact source text>": "<replacement>" } (dashes between words, typos, arrow glyphs in chart
                     labels such as "Rủi ro →" -> "Rủi ro" with schematic `axes.x.arrow: true`)
overrides/salts.json { "<item id>": "<64 hex>" } bank salts (private, deterministic reruns)
overrides/blocks/<item id>.json   RFC 6902 patch ops on the extracted lesson (rare, reviewed)
write.ts             stable JSON (sorted object keys except block/section arrays), 2-space, trailing newline
manifest.ts          import-manifest.json: source sha, gates, counts, per-lesson counts, output sha256, warnings
verify.ts            no-source checks (§6.5)
```
Run: `cd backend && npm run build && node dist/scripts/academy-v32-import/main.js extract --source "$ACADEMY_V32_SOURCE"`.
A second `extract` must leave `git diff --exit-code src/modules/academy/content/v3` clean.

### 6.2 Extraction rules per mockup pattern (and the block mapping table)

Article skeleton: `article#lessonN` -> item via catalog-table order. `.col > h1` -> must equal catalog name.
`.lead` -> `lead`. Walk EVERY `.blk` child of the article in order: a `.blk` with class `sec` (`.col.sec.blk`,
`.col.sec.first.blk`, `.wide.sec.blk`) -> one section; class-less `div` wrappers are unwrapped and the title is the first
`h2` at any depth; any other `.blk` before the first section (ch01-l01: `.wide.blk` with `.three3` and the C1L1-g1 figure)
-> `intro_blocks`; a non-section `.blk` after a section is a hard failure. The section titled "Tóm tắt" becomes
`summary` (`.take > div > span` inner inline) and is not emitted as a section. `.done` dropped. Exam articles: `.lead`
is checked against the catalog intro (only the intro text is used). Inline `style` margins and `.first` dropped.

| Mockup pattern (selector) | Count | Block | Rule |
|---|---|---|---|
| `p` | 415 | `paragraph` | inner -> Inline |
| extra `h2` in a section | 1 | `heading` | text |
| `span.assume` outside `.fig` | ~3 | `note` | ch2 only (schema enforces) |
| `.fig.tl` or plain `.fig` (C1L1-g2) with `svg[id]` (+ `.ftitle`, following `.legend`, inner `span.assume`) | DOM-derived | `chart` | `chart_id` = id lowercased, ch2 ids get `c2` prefix (`L1-g1` -> `c2l1-g1`); `.ftitle` -> title; `.legend span` -> `{label, tone(dot background)}`; `.assume` -> note; `table_toggle: true` for series_panels/category/segment_bar |
| svg id in TEXT_FIGURES (C1L3-g1, C1L4-g2, C1L3-g4, C1L10-g5, C5L2-g3, C4L9-g1, C5L3-g1, C5L4-g1, plus C1L10-g4, C5L3-g3, C5L4-g0 -> `steps`, c2l1-g2 -> `funnel`) | 12 | `kv_cards`, `table`, `definitions{marker:'check'}`, `formula`, `tiles`, `steps`, `funnel` | built in code, replaces the chart block |
| `.fig.tl > table.cmp` / `.cmp.two` / `.cmp.step` | 29 | `table` variant `grid` / `rows` / `grouped` | `th.ck`/`td.ck` -> column `highlight`; `.bad` -> column 2 `tone:'bad'`; `td.sx[rowspan]` -> `group`; `span.r.g|m|b` -> `{rating: good|mid|bad, text}`; `td[style=color]` -> `{text, tone}` (blue `info`, violet `violet`); `td[colspan]` -> `{text, colspan, highlight?}` (width check sums colspans) |
| `.take` | 44 | lesson `summary` | one Inline per `div` |
| `.roles` | 41 | `definitions` | `b` -> term (`style=color` -> item `tone`), `span` -> text |
| `.ex2` | 26 | `cards{columns:2, style:'card'}` | child `.on`->highlight, `.up`->pos, `.dn`->neg, `.good`->good, `.no`->bad; `b`->title (`style=color` -> `title_tone`); `small`->subtitle; `p`->text; `ul li`->bullets |
| `.ex2.r4` | 8 | `cards{columns:2}` | as above |
| `.ex2.r3`, `.ex3` | 1, 8 | `cards{columns:3}` | `dl dt/dd` -> facts |
| `.three` | 25 | `cards{columns:3, style:'tip'}` | `b`->title, `span`->text |
| `.vvca` | 1 | `cards{columns:4}` | `small`->eyebrow |
| `.mis` | 6 | `cards{columns:2, style:'mistake'}` | `b`->title, `span`->text |
| `.flow4` | 8 | `steps` | `small`->label, `b`->title, `span`->text |
| `.three3 > .p3` | 1 | `stats{variant:'hero'}` | svg `C1L1-ic-ket/tk/ck` -> icon `vault/landmark/chart-line`; `.on` -> highlight |
| `.mini3` | 1 | `stats{variant:'chip'}` | `span`->label, `b`->value |
| `.big3` | 3 | `stats{variant:'big'}` | `b`->value, `span`->label |
| `.st3` | 1 | `gauges` | class ok/warn/bad; `--w` -> pct |
| consecutive `.adv` | 5 rows | `chart_grid{layout:'rows', columns:2}` | svg id -> chart, `h3`->title, `p`->text |
| `.st4` with svgs | 2 | `chart_grid{layout:'grid', columns:2}` | `b`->title, `span`->text |
| `.st4` without svg (ch05-l04) | 1 | `cards{columns:2, style:'card'}` | `b`->title, `span`->text |
| `.pat` | 1 | `chart_grid{layout:'grid', columns:5}` | caption -> title |
| `.say(.g|.r)` | 17 | `quote` | tone good/bad/neutral, `small`->label |
| `.obj` | 6 | `objection` | `h3`, `p` |
| `.fun` | 1 | `funnel` | width % -> pct, background hex -> tone |
| `.post` | 5 | `sample_post` | `.post-t`, `.post-h b`, `.post-h small`, `.post-b` (newlines kept), `.post-w` |
| `.cz[data-a]` | 19 | `scenario` | `.cz-h b`->title, `p`->story, `.cz-q`->question, `.cz-o button`x3->options, `data-a`->`best_option`, `.cz-x`->`debrief` |
| `.cz` "TỰ TÍNH" | 1 | `income_calculator` | fee_rate 0.0015, share_rate 0.7, defaults 20 / 200 (from the script), labels from the inputs |
| `.cz` "CASE n" | 4 | `practice_case` | `.prof` columns -> info / mindset / quote; pad `b` -> `pad_title`; pad `small` split on `<br>` -> 4 prompts; `id` = textarea `data-k`; `.cz-x .roles` -> hints |
| `.todo` / `.todo.audit` | 11 / 2 | `checklist{mode:'todo'|'self_check'}` | `id` = data-k prefix before `-`, item id = suffix (`l1-0` -> `l1` / `0`); audit counter label -> `result_label` ("Số mục đã đạt") |
| `.pad` (standalone) | 18 | `workpad` | `b`->title, `small` split on `<br>` -> prompts, `data-k`->id, placeholder; drop the "lưu trên trình duyệt" `em` |
| `.sc6` + `.verdict` | 1 | `roleplay_score` | 6 criteria (`span` + `small`), max 10, `default: 5`, bands 48 good / 36 warn / 0 bad, id `sc6`, no `title` (the section h2 names it) |

Every pattern in the mockup maps to exactly one of the 24 block types; the walker fails on anything else.
Counts in this table are indicative: the gate counts in `verify` are derived from the DOM at extract time and frozen in
`import-manifest.json`, never hard-coded from this table.

### 6.3 Text normalisation (applied to every visible string, then schema-checked)
1. Collapse whitespace, decode entities, re-escape `& < >` for Inline.
2. Digit ranges: `(\d[\d.,]*%?)\s*[–—]\s*(\d)` -> `$1-$2` ("2015–2025" -> "2015-2025", "36–47" -> "36-47").
3. Any other en/em dash must have an entry in `overrides/text.json` (for example "vài tuần – vài tháng" -> "vài tuần đến vài tháng"); otherwise exit 1 listing them.
4. Strip "✓ " and "✓" (UI uses Lucide `Check`).
5. Remove "Phần bạn viết được lưu trên trình duyệt này."
6. `?` inside ch1/ch4/ch5 lesson prose -> manifest `warnings` (not fatal; spec §2.2 review list).
7. Inline colours -> tone spans per schema.ts §1 table; `b.hl` -> `tone-accent`.

### 6.4 Charts
- Kind per id follows `map-mockup-charts.md` §1 with these renames: `grouped|line|stacked` -> `category{mode}`;
  `panels` and side-by-side -> `compare{layout:'stack'|'row'}`; `svg_diagram`/static -> `diagram`; icons -> Lucide in `stats`.
  Phone readability re-kinds (schema rule: `diagram` may contain text only when view_box width <= 320):
  C1L2-g1 -> `compare` of two `flow`; C1L5-g1, C1L6-g1 -> `flow` with labelled edges; c2l1-g2 -> `funnel` block
  (TEXT_FIGURE); c2l3-g1 -> `segment_bar`; C1L2-g4, C1L6-g2 -> `flow` or `segment_bar` (P2 picks; labels never in a wide
  diagram); C1L10-g4, C5L3-g3, C5L4-g0 -> `steps` blocks (TEXT_FIGURES). C1L1-a1/a3/a4/a5 stay `diagram` (narrow or textless).
  Gate: DOM svg ids (129) == chart models + TEXT_FIGURES (12) + icons (3), so 114 chart models; per-kind counts are
  recorded in the manifest.
- Tones: #2bb886 #7fe0bd #3fc495 #199e70 #3d9e6e (funnel) -> pos · `var(--c1)` -> p1, `var(--c2)` -> p2 (legend dots) · #e66767 #f2a0a0 -> neg · #3987e5 #249bec #5db8ff #7fb8ff -> p1
  (`info` when used as accent text) · #dfb969 #e8c77d #c99a35 #e8a33d #f0d48f -> warn (p2 for a second series) ·
  #d95926 #f0a07a -> p5 · #b48cf2 #b77ee6 #c9a0f0 -> p4 · #6d8399 #95a9be #c9d6e4 -> p3 (price for the main price line) ·
  #3fc6e0 #6fd6ea -> info. Surfaces/borders never become tones. Chart TEXT never takes p3/neutral
  (`chartTextToneSchema`); the mockup's #c9d6e4 / #95a9be label colours map to "no tone" = `--academy-label`.
- Index convention: every index in a series_panels model is absolute (see schema.ts K1 comment); C1L9-g3 fills the months
  between points by linear interpolation instead of nulls.
- `category` extras: C4L6-g0 uses `series[].tone_by_sign` + `caption_value`/`caption_tone` (RSI >= 70 `neg`, <= 30
  `pos`, else `price`, the mockup's neutral grey); C5L1-g2 uses `sublabels`. `value_format {sign?, suffix?}` prints
  value labels and ticks as "+8.000" / "−10%" (C1L5-g2, C1L4-g4, C1L10-g2: losses stored negative). Stacked bars stack
  negatives below zero and label each category once with its net total (C1L5-g2: −100.000, +8.000, +8.000, +108.000).
- Indicators computed over the full generated history, exported for the window only, numbers rounded to 4 decimals.
  Mockup EMA is first-value seeded (not `ch1-math.ts`). Schematic analytic curves sampled to 50-140 points.
- Fix in the port: C1L1-g2 pictogram shows 7 full notes + 0.4 (mockup draws 8).
- Builders take no DOM input, so `verify` recomputes every chart without the source.

### 6.5 Golden and gate checks (`verify.ts`, run by `test/unit/academy-v32-import.test.ts`)
- Source SHA gate (extract only). Output: 1 catalog, 44 lesson files, 49 bank files, retired file, manifest.
- Catalog parses; 14 chapters; sum lesson_count 94; published 43 required + practice; 5 exams.
- Questions: 160 lesson (43x3/5 + practice 3) + 120 exam = 280; 3 options each; all prompts unique across banks;
  ch2 exam contains the 4 replacement prompts (Bài 2 savings maturity, Bài 7 "về bàn với vợ", Bài 9 margin call, Bài 10 rumour).
- Blocks: scenario 19 (one per ch2/ch3 lesson), checklist 13 (11 todo + 2 self_check), workpad 18, practice_case 4,
  roleplay_score 1, income_calculator 1, sample_post 5, objection 6, quote 17; sections = 296 - 44 = 252 (incl. the one
  `.wide.sec.blk`); intro_blocks 2 (ch01-l01 only); summaries 44. Other counts DOM-derived (see §6.2 note).
- Charts: 114 models (manifest-frozen), every referenced id present, every model referenced; each lesson's chart ids start
  with its `cXlY` prefix.
- Recompute every chart from builders and deep-equal the committed JSON.
- Math goldens: C4L6-g5 k=119 (RSI 42.42), e=120 (RSI 50.16) · C4L7-g6 e=124 (MACD 0.342) · C4L9-g4 a=9 b=44 k=59
  e=60, retracement 0.6000 · C5L1-g3 "+5%" / "+36%" · C5L2-m2 mean "14,3" current "12,0" · C5L2-m3 "1,8" / "1,6" ·
  C5L3-g2 "+12" "+13" "+11" "+12" %/năm · C4L6-g0 captions 81 / 50 / 19 · c2l1-g1 end 51 / 23 · C1L1-g1 end 74 / 179 / 308 triệu ·
  C5L1-g2 prose 1.070 CCQ, 16.822, 26,75 triệu, +48,6%.
- Visible-text bans hold everywhere (schema refinements), no raw HTML outside the Inline allowlist.
- Option ids salted: for every question, no option id equals `sha256(qid|j).slice(0,10)` for any j, and every bank has a
  64-hex salt; recomputing `canonicalHash(bank without salt)` never equals the stored version (test). 271 of 280 source
  correct indexes are 0, which is harmless with salted ids.

---

## 7. Frontend

### 7.1 Tokens (`frontend/src/index.css`, `DESIGN.md` exception note)
```
:root (light)  --academy-subtle: oklch(0.330 0.020 256);  --academy-label: oklch(0.380 0.020 256);
.dark          --academy-subtle: oklch(0.925 0.018 245);  /* #dbe7f3 */
               --academy-label:  oklch(0.870 0.022 248);  /* #c9d6e4 */
@theme inline  --color-academy-subtle: var(--academy-subtle); --color-academy-label: var(--academy-label);
```
Inside the reader, quiz, lesson blocks and lesson charts: sub-text uses `text-academy-subtle`, chart labels/ticks and
locked-button text use `fill-academy-label` / `text-academy-label`. `muted-foreground` is banned for text there. Source-scan
tests: P5 scans `pages/academy/{blocks,charts}`; P4 scans `pages/academy/{reader,quiz,interactive,panel}` and the reader
shell files. Lines, grids, bars may stay grey. Adding the tokens changes `index.css`, so P5 also runs
`cd mobile && npm run tokens:sync` and commits `mobile/src/theme/tokens.generated.ts` (mechanical; the mobile token test
parses every `:root`/`.dark` variable).

### 7.2 Component tree
```
DemoTradingPage (unchanged mount)
├─ AcademyPanel                          academy-panel.tsx (shell: "Học viện", "{required_total} bài học")
│  ├─ ProgressCard                       panel/progress-card.tsx ("Tiến độ học tập x / 43", progressbar)
│  └─ ChapterGroup × published chapters  panel/chapter-group.tsx ("Chương c · Tên chương", bold foreground, collapsible,
│     │                                   auto-opens the chapter of the open item or current_item_id)
│     └─ ItemRow × items                 panel/item-row.tsx (one <button> per row; passed "Xem lại" outline,
│                                         open "Học bài"/"Làm bài", locked <div aria-disabled> Lock + "Chưa mở";
│                                         practice adds Badge "Tự chọn"; current row bg-primary/10 aria-current)
└─ AcademyMain                           academy-main.tsx (guest/no item -> MascotStage)
   └─ ItemReader key=itemId              lesson-reader.tsx (switch on item kind; 403 -> LockedState)
      ├─ ReaderTopbar                    reader/reader-topbar.tsx ("Về linh thú", locator "Chương c · Bài n / m" |
      │                                   "Bài thi Chương c" | "Chương 3 · Phòng tập thực chiến", "Danh sách bài" on phone)
      ├─ LessonView (lesson, practice)   reader/lesson-view.tsx
      │  ├─ header (title h2, lead InlineText, Check "Đã hoàn thành" tag, reward tag)
      │  ├─ <BlockRenderer blocks charts renderInteractive={renderInteractiveBlock}/> per section
      │  │     sections as <section id="academy-section-sN"> with h3 title (no nav pills)
      │  ├─ SummaryList                  reader/summary-list.tsx ("Tóm tắt")
      │  ├─ LessonQuizGate               reader/lesson-quiz-gate.tsx
      │  └─ ItemPager                    reader/item-pager.tsx (prev/next over the flat sequence; locked next disabled)
      ├─ ExamIntro (chapter_exam)        reader/exam-intro.tsx
      ├─ QuizFlow (mode quiz; content hidden)  quiz/quiz-flow.tsx -> QuizQuestion | QuizScore
      └─ LockedState                     reader/locked-state.tsx ("Bài này chưa mở", "Đến bài đang học")
interactive/ (rendered through renderInteractive, context from LessonInteractiveProvider)
   ScenarioBlock · ChecklistBlock · WorkpadBlock · IncomeCalculator · ClientCaseBlock (practice_case) · RoleplayScore
```

### 7.3 Behaviour
- **LessonQuizGate**: passed -> disabled outline `<Check/>` "Đã hoàn thành" (`disabled:opacity-100`, academy-label text);
  `has_scenario && !scenario_choice` -> disabled "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra" (wraps);
  else "Làm bài kiểm tra" (+ "{N} câu" sub-line). 403 ACADEMY_SCENARIO_REQUIRED from the API -> refetch item, scroll to scenario.
- **ExamIntro**: h2 "Bài thi Chương c", `intro` + bold "Cần trả lời đúng tất cả câu hỏi để hoàn thành.", button
  "Bắt đầu làm bài"; passed -> Check "Đã hoàn thành" + "Xem lại Chương c" (first item of chapter).
- **QuizQuestion**: label ("Bài kiểm tra", the practice room included, or "Bài thi Chương c"; spec §3.2-1) + "Câu i/N"; dots `<ol aria-hidden>`
  (wrap at 30, sr-only "Câu i trên N"); prompt h3 (focus on change); options as radio cards in server order; single button
  "Câu tiếp theo" enabled after a choice, "Nộp bài" on the last; no previous control; resume at first unanswered;
  ghost "Thoát" back to content (draft kept). Draft autosave via `use-draft-sync.ts` (unchanged pattern).
- **QuizScore**: big "n/N" (`aria-label` "Điểm n trên N"); "Đạt" (`text-(--status-success)`) / "Chưa đạt" (`text-destructive`).
  Passed: static Check "Đã hoàn thành", outline "Xem lại bài"; pill "Đã mở chỉ báo {label}" per `unlocked_labels`;
  exam pill "Đã hoàn thành Chương {chapter_completed}"; secondary "Bài tiếp theo" when `next_item_id`. Failed: "Làm lại"
  (no dialog) + "Xem lại bài" / exam "Xem lại Chương c". Coin toast only when `reward.status === 'credited'`.
  No per-question list.
- **ScenarioBlock**: 3 buttons (`aria-pressed`), `useMutation(chooseScenario)`, all disabled while pending; on success
  write `scenario_choice` into the item cache (`setQueryData`); correct option border `--status-success` + Check icon,
  wrong chosen border destructive + X icon, debrief shown. Stored choice renders the same state on reload. No optimistic gate.
- **Notes** (`interactive/use-lesson-notes.ts`): `useQuery(notes)`; local edits merged by key, debounced 800 ms PUT with
  `expected_revision`; 409 adopts `details[0].notes` and re-applies dirty keys; unsent edits mirrored in sessionStorage
  `iqx.academy.notes-draft.<uid>.<itemId>`; status line "Đã lưu" / "Đang lưu" / "Chưa lưu được. Thử lại" (`role="status"`),
  copy says the work is saved to the account ("Đã lưu vào tài khoản").
- **Checklist**: shadcn Checkbox per item, key `${id}:${item}`; self_check shows "x/N" (`aria-live="polite"`).
- **Workpad / PracticeCase**: prompts one per line, 15px, foreground; Textarea; case reveal toggle "Xem gợi ý phân tích" /
  "Ẩn gợi ý" (`aria-expanded`).
- **IncomeCalculator**: two numeric inputs, `Math.round(max(0,c)*max(0,v)*1e6*fee_rate*share_rate)`, `formatVnd`, not persisted.
- **RoleplayScore**: 6 shadcn Sliders 0..10 step 1 with `<output>`, start at `block.default` (5 -> "30/60"), total "t/60",
  band label by `bands`; persisted in `notes.scores[id]`.
- **ScenarioBlock** reads `best_option` / `debrief` (renamed from answer/explanation).
- **ClientCaseBlock**: pad heading from `pad_title`. **Checklist self_check**: "{result_label}: x/N".
- 390px: card grids collapse to one column below 560px; `chart_grid` layout grid keeps 2 columns with items capped near
  180px only when every item is a thumbnail (candle glyphs, `series_panels` with `axes:false`: `.pat`, C4L4 `.st4`);
  a grid of axis charts (C5L2 `.st4`, which the mockup also drops to one column) is one column below 560px; gantt tick
  labels thin out on collision (the last one stays); `flow` row with 4+ nodes switches to column below 560px; `milestones`
  go vertical below 560px; charts lay out at measured width (`useChartWidth`, min 230); labels wrap; no horizontal page scroll.

### 7.4 Data layer
```ts
// api.ts (P4): requestOperation for endpoints 1-11; error predicates isItemLocked, isScenarioRequired,
//   isNotesConflict, isCatalogMismatch, isDraftConflict, isAlreadySubmitted, isNotFound, isInvalidAnswers.
academyKeys = {
  all: ['academy'], catalog: ['academy','catalog'],
  progress: (uid) => ['academy','progress',uid],
  item:     (uid,id) => ['academy','item',uid,id],
  resume:   (uid,id) => ['academy','resume',uid,id],
  history:  (uid,id) => ['academy','history',uid,id],
  notes:    (uid,id) => ['academy','notes',uid,id],
}   // quiz-run key unchanged
invalidateAfterSubmit(qc, uid, itemId, result): resume+history(item); if passed: progress, item(itemId),
  item(result.next_item_id), and COMPLETION_DEPENDENT_ROOTS [['shop'],['bot'],['practice'],['strategy']]
```
All reads `enabled: isAuthenticated`, `retry: false`. URL param stays `lesson`; `navigation.ts` accepts
`^ch\d{2}-(l\d{2}|exam|practice)$`. Guest: no requests, panel "Đăng nhập để học", description "43 bài học" fallback.
`view-state.ts`: drop guide keys; attempt keys are namespaced by catalog version.

### 7.5 Files
P5 (renderers) owns:
```
pages/academy/blocks/block-renderer.tsx   body only (F0 created the file + signature):
   export function BlockRenderer({blocks, charts, renderInteractive?})
pages/academy/blocks/inline-text.tsx      body only (F0 stub): export function InlineText({html, as?, className?})
pages/academy/blocks/prose-blocks.tsx     paragraph, heading, note
pages/academy/blocks/table-block.tsx      rewrite (variants, ratings, tones, highlight column, scroll on phone)
pages/academy/blocks/card-blocks.tsx      cards, steps, definitions
pages/academy/blocks/data-blocks.tsx      stats, gauges, kv_cards, formula, tiles
pages/academy/blocks/sales-blocks.tsx     quote, objection, funnel, sample_post
pages/academy/blocks/chart-block.tsx      chart, chart_grid
pages/academy/blocks/block-renderer.test.tsx (+ per-file tests), blocks/test-blocks.ts
pages/academy/charts/*                    lesson-chart.tsx (switch), series-panels-chart.tsx (+candles, zones, points,
   segments, fib, notes, fill_between, x.shade, axes:false), category-chart.tsx, segment-bar-chart.tsx, scale-chart.tsx,
   schematic-chart.tsx, gantt-chart.tsx, milestones-chart.tsx, candle-glyphs-chart.tsx, flow-chart.tsx, diagram-chart.tsx,
   compare-chart.tsx, chart-theme.ts (ChartTone -> classes), chart-math.ts (tables for data kinds), use-chart-width.ts,
   lesson-chart.test.tsx, real-content.test.tsx (renders every backend content/v3 lesson; integration)
pages/academy/sanitize.ts (+test)         inline mode allows tone-* span classes only
pages/academy/academy.css                 v3 block styles, no grey text
src/index.css, DESIGN.md                  tokens §7.1
mobile/src/theme/tokens.generated.ts      regenerated by tokens:sync only
DELETE public/assets/academy/** (old block files are deleted by F0)
src/pages/academy/no-backend-questions.test.ts  NEW: no frontend file imports or reads `academy/content/v3/questions`
   (real-content.test.tsx reads only `content/v3/lessons` and `catalog.json`)
```
P4 (app) owns:
```
pages/academy/api.ts queries.ts catalog-model.ts navigation.ts view-state.ts scroll.ts academy-main.tsx academy-panel.tsx
pages/academy/panel/{progress-card,chapter-group,item-row}.tsx
pages/academy/lesson-reader.tsx
pages/academy/reader/{reader-topbar,lesson-view,lesson-quiz-gate,item-pager,exam-intro,summary-list,locked-state}.tsx
pages/academy/quiz/{quiz-flow.tsx,boot-quiz.ts,quiz-question.tsx,quiz-score.tsx,quiz-copy.ts,use-draft-sync.ts}
pages/academy/interactive/{interactive-block.tsx (renderInteractiveBlock), lesson-interactive-context.tsx,
   scenario-block.tsx, checklist-block.tsx, workpad-block.tsx, income-calculator.tsx, client-case-block.tsx,
   roleplay-score.tsx, use-lesson-notes.ts} + tests   (no file or import path may contain `/practice`:
   no-config-controls.test.ts bans it)
pages/academy/{test-api.ts,test-fixtures.ts,test-harness.tsx,test-support.tsx}
pages/academy/{academy-panel,lesson-reader,academy-guest}.test.tsx, quiz/quiz-flow.test.tsx, no-config-controls.test.ts,
pages/demo-trading/demo-trading-page.test.tsx ("43 bài học"; it uses test-api.ts and panel text, so it moves to P4)
   (mutation allowlist: POST attempts, PUT answers, POST submit, POST scenario, PUT notes; keep "Luyện tập" ban;
    folder name `interactive/` avoids the `/practice` import ban)
e2e/academy-v32.spec.ts
```
F0 (lead, inside M1; makes the frontend compile against the regenerated contracts before P4/P5/P6 fork):
```
pages/academy/api.ts                      v3 types + requestOperation for endpoints 1-11 (P4 extends, keeps signatures)
pages/academy/content-types.ts            NEW type aliases from generated contracts (named via .meta ids
   AcademyBlock / AcademyChartModel / AcademyLeafChartModel): ItemResponse, LessonContent, ExamContent, LessonBlock,
   StaticBlock, InteractiveBlock, ChartModel, LeafChartModel, ChartTone, CatalogResponse, CatalogItem, ProgressResponse,
   NotesResponse, SubmitResult, AttemptQuestion
pages/academy/blocks/{block-renderer,inline-text}.tsx  stubs at final paths with final signatures (P5 fills bodies)
academy-panel.tsx, lesson-reader.tsx      minimal compiling placeholders (P4 rewrites)
DELETE guide-completion.tsx(+test), quiz/{quiz-entry,quiz-result,quiz-taking,question-figure}.tsx,
   blocks/html-content.tsx, blocks/lesson-image.tsx(+test), charts/step-charts.tsx, and tests that only cover them
Acceptance: cd frontend && npm run typecheck && npm run lint (vitest for academy may be red until P4/P5 land)
```
P4/P5 seam: P4 imports only `BlockRenderer`, `InlineText` and types from `content-types.ts`; P5 never imports P4 files.
`lesson-reader.tsx` imports `academy.css` (P5) by the stable path `./academy.css`.

---

## 8. Consumer changes (file:line at d145fd5d)

Backend
| File:line | Change | Pkg |
|---|---|---|
| `academy/academy-progress-reader.service.ts:192-296` | `buildAcademyProgress(content.catalog/sequence, facts)`: published chapters only; totals = required lessons (43); exam rows per chapter (kind chapter_exam, max 20/30); practice row `optional:true` excluded from totals; status adds `locked` from `itemStates`; `current_lesson` = `currentItemId` (exam label "Bài thi Chương c"); `chapter_exams {published chapters, passed}` (`:255`); `max_score` per item (`:289`); attempts facts SQL filter current catalog and select `kind` | P3 |
| `users/member-insights.openapi.ts:74-139` | SUMMARY `current_lesson` + `kind: lesson|chapter_exam`; DETAIL lessons rows: `kind: lesson|practice|chapter_exam`, `optional: boolean`, `status` enum + `locked`, `max_score` int, drop `completion_mode`; chapters + `exam_passed` | P1 (M1) |
| `users/admin-users.service.ts:165-201`, `team-leads/team.service.ts:42,107,196,239-258` | type follow-through only (sort by `completed` stays) | P3 |
| `quant/v2/registry/technical-registry.json` | volume/ma/rsi/macd/bollinger -> chapter 4, lesson_id ch04-l04..l08; ema, ma_cross, dmi, donchian -> chapter 7; stochastic, cci, roc, williams_r, obv, mfi, cmf -> chapter 8; their lesson_id `null`; `legacy_chapter/legacy_lesson_id` untouched | P3 |
| `quant/v2/technical-registry.ts:86` | `lesson_id: z.string().regex(/^ch\d{2}-l\d{2}$/).nullable()` | P1 (M1) |
| `quant/v2/types.ts:181` | `lesson_id: string | null` | P1 (M1) |
| `strategy-config/strategy-config.schemas.ts:196` | technical-registry response `lesson_id: z.string().nullable()` | P1 (M1) |
| `screener/registry/fundamental-registry.json` | every `lesson_id` -> `null` | P3 |
| `screener/screener.registry.ts:127`, `screener/screener.schemas.ts:158` | `lesson_id` nullable | P1 (M1) |
| `strategy-config/strategy-config.service.ts:375` | copy "Cần đạt bài kiểm tra của bài học chỉ báo ${name} trước khi bật." | P3 |
| `strategy-backtests/strategy-backtests.service.ts:465` | "... trước khi chạy backtest." (no 8/8) | P3 |
| `strategy-backtests/strategy-backtests.capabilities.ts:4,6,75` | comments + copy (no 13ch/71, no 8/8) | P3 |
| `alerts/strategy-alerts.service.ts:309` | copy | P3 |
| `practice/practice.service.ts:441` | copy | P3 |
| `shop/lesson-reward.service.ts:14` | keep `LESSON_KEY` without `exam:`; add explicit `if (lessonKey.startsWith('exam:')) throw TypeError` | P3 |
| `scripts/shop-reward-backfill.ts:31,134` | skip `exam:` keys with reason `exam_never_rewarded` | P3 |
| `test/unit/quant-v2-engine.test.ts:538-575` | read fixtures from `test/fixtures/quant/lesson-fixtures/*.json` (moved from `content/lessons/*/lesson.vi.json` `fixture` and `content/legacy/chapters/*/fixtures.json`) | P1 |
| `test/unit/quant-v2-spec-parity.test.ts:99-117`, `test/unit/fixtures/bot-registry-spec-16.json` | new lesson ids/chapters | P3 |
| `test/unit/team-insights.test.ts`, `test/system/team-lead-team.system.spec.ts:194,417,516-517` | 43 totals, exam rows, `chapter_exams {5,n}`, labels | P3 |
| `test/unit/shop-purchase.test.ts:453-462` | fixture count only, leave | - |

Frontend
| File:line | Change | Pkg |
|---|---|---|
| `pages/demo-trading/shop/shop-api.ts:128-150` | progress `course_done/course_total` unchanged names; names from `catalog.chapters[].items[]` + `retired_lessons` | P6 |
| `pages/demo-trading/shop/shop-test-support.ts:166` | `course_total: 43` | P6 |
| `pages/demo-trading/practice/practice-api.ts:105-128` | map only volume/ma/rsi/macd/bollinger -> ch04-l04..l08; others null -> "Chưa phát hành" | P6 |
| `pages/demo-trading/practice/practice-failure.tsx:41` | drop "(đúng 8/8 câu)" | P6 |
| `pages/demo-trading/bot/navigation.ts:4-14`, `pages/strategy/shared/indicators.ts:1-43` | `CHAPTER_TITLES = {4:'Phương pháp kỹ thuật', 7:'Chỉ báo xu hướng', 8:'Chỉ báo động lượng và dòng tiền'}`; comments | P6 |
| `pages/demo-trading/bot/panel/bot-panel.tsx:105-125`, `indicator-row.tsx:67` | hide "Xem bài" when `lesson_id === null`, show "Chưa phát hành" | P6 |
| `pages/demo-trading/bot/config/api.ts:120,125`, `use-bot-config.ts:28` | copy "Đạt bài kiểm tra của bài học chỉ báo này để bật." | P6 |
| `pages/strategy/shared/errors.ts:10` | comment | P6 |
| `pages/strategy/filter/definition.ts:42,121`, `catalog-dialog.tsx:8,39`, `metric-library.tsx:32-54` | null `lesson_id` -> "Chưa phát hành" instead of "học bài <id>" | P6 |
| `pages/admin/core/api.ts:327-370,513-560` | adapt new academy detail shape (kind, optional, locked, exam rows, no completion_mode) | P6 |
| `pages/admin/core/components/user-academy-tab.tsx:40-130` | exam row per chapter "Bài thi Chương c" n/20 or n/30; Badge "Tự chọn" on practice; "Chưa mở" status; KPI x / 43 | P6 |
| `pages/demo-trading/demo-trading-page.test.tsx:179,244` | "43 bài học" | P4 (moved: depends on P4 test-api and panel) |
| `pages/about/about-content.ts:43`, repo-root `docs/UX_UI_AUDIT_REPORT.md:107` | copy "14 chương", "43 bài học đã phát hành", no 71/8/6.200 | P6 |
| `lib/generated/backend-v2.ts`, `lib/generated/operation-map.ts`, `contracts/*` | regenerated | lead (M1) + integration |
| `pages/admin/team/*` | none (server labels) | - |

---

## 9. Test plan

Backend unit (vitest)
- `academy.test.ts` (rewrite, P1): catalog response 5 chapters / 43 / practice optional / exam intros; item and key formats;
  locked GET 403; scenario: required 403 before choice, insert-once replay returns first choice, persists; notes: merge,
  revision, 409 conflict, key whitelist 422, size 422, no progress effect; attempts: 2/3 fail, 3/3 pass, 4/5 fail,
  19/20 fail, 20/20 pass, 29/30 fail, 30/30 pass; exam pass no reward and no hook call; practice +100 and course_done
  unchanged; reward once and atomic rollback; concurrent submit; shuffle differs between two attempts and from source
  order (seeded); idempotency; stale catalog 409; no answer keys in any response (deepKeys over catalog, progress, item,
  attempt, resume, draft, submit, history; exact banned names per §2, plus positive schema-key assertions); stats
  filtered by catalog; sequence outcomes of §3; migration 0026 shape; idempotency key reused across catalog or item -> 409;
  old-catalog submitted attempt replays score-only without looking up the new item; draft/submit on an old open attempt
  -> 409; scenario stale hash -> `scenario_choice: null`, gate still satisfied, POST replaces once; notes
  `expected_revision` 0 vs existing row -> 409; notes payload just under 65536 compact bytes but over in jsonb text -> 422
  (never 500); notes checklist key of 97 chars accepted; option ids not equal to sha256(qid|j); no
  `assessment_version` in attempt/resume.
- `academy-grants.test.ts` (P1): parity with catalog-13ch fixture (16 + 42), new-user reachable set = 5 indicators,
  legacy `lesson:*` kept.
- `academy-attempt-resume.test.ts` (P1): routes table (11 routes, removed 2), draft semantics with N = 3/5/20/30.
- `academy-v3-schema.test.ts` (P1): schema.ts rejections (dash, inline tags, scenario count, chart refs, catalog totals, bank ids).
- `academy-v32-import.test.ts` (P2): runs `verify` (no source) + optional full re-extract when `ACADEMY_V32_SOURCE` is set.
- `academy-boot.test.ts` (P1, at integration): `loadAcademyContent()` on the real `content/v3` succeeds; 49 items; 43 required.
- P3: `team-insights.test.ts`, `quant-v2-spec-parity.test.ts`, shop reward exam rejection, backfill skip, registry
  nullable lesson ids, copy strings.
- System (`npm run test:system`; starts its own Postgres + Redis containers via `test/system/system-stack.ts`, needs
  Docker; runs only at integration because it needs 0026 + P1 loader + P2 content):
  `academy-v32.system.spec.ts` (P1 writes it, runs at integration): exam attempt insert with NULL content_version;
  concurrent scenario POSTs with different choices -> one row, equal responses, `created` true exactly once; concurrent
  first notes PUTs -> no 500, one 409 when both send expected_revision 0; two concurrent passing submits on different
  attempts of one lesson -> exactly one +100 and one `lesson_rewards` row; exam pass -> no `lesson_rewards` row and
  `ck_lesson_rewards_not_exam` holds; 0026 applied twice on a DB seeded with legacy rows (score 8, the 0014 backfill
  rows); narrow rollback: old-code attempt insert/submit against the 0026 schema still works.
  `team-lead-team.system.spec.ts` (P3): team-lead list `x / 43`, exam rows, `chapter_exams`.

Frontend (vitest + Testing Library, `test-api.ts` fake backend rebuilt for v3)
- Panel: 5 chapter groups, "43 bài học", state buttons, locked rows not interactive, practice "Tự chọn", current row.
- Reader: locator line for lesson/exam/practice; 403 -> LockedState; gate states; pager across chapters, locked next disabled.
- Quiz: next disabled until choice, no previous, Nộp bài on last, resume at first unanswered, score-only result, unlock pill,
  exam pill, no coin toast for exams, retake.
- Interactive: scenario choose/persist/gate, notes autosave + conflict adopt, checklist counter, calculator 20 x 200 = 4.200.000 đ,
  roleplay bands 48/36.
- Renderers: every block type and chart kind renders from fixtures; narrow width 358 has no overflow; `real-content.test.tsx`
  renders all 44 real lessons without throwing; source scan: no `muted-foreground` text classes in academy content folders.
- `no-config-controls.test.ts`, `academy-guest.test.tsx` updated.
- e2e `e2e/academy-v32.spec.ts` (real backend; skips unless `E2E_REAL_BACKEND=1`): setup = backend on :3001 with
  migrations applied and `ACADEMY_ENABLED=true`, a fresh user registered per run, credentials from env. Correct answers
  come from reading `backend/src/modules/academy/content/v3/questions/*.private.json` in the spec (Node side) and matching
  options by their stable ids. Cases: new user only ch01-l01; pass flow opens next; scenario gate 403 and UI; 390px no
  horizontal scroll on a ch4 lesson with charts. The integration run must report the spec as executed, not skipped.

Release checks: backend `npm run verify && npm run format:check && npm run api:coverage:check`, frontend `npm run verify`, migration on a VPS DB copy (dry run: count users
with each carried indicator key; confirm 0 `exam:` rewards), then deploy order 0026 -> backend -> frontend in one release.

---

## 10. Work split (lead steps + 6 packages, separate worktrees)

Integration branch `feat/academy-v32`. Worktrees: `git worktree add ../IQX-v32-pN -b feat/academy-v32-pN feat/academy-v32`;
each tree runs its own `npm ci` in `backend` and `frontend` (budget ~6 x node_modules disk).
`schema.ts` changes go through the lead and land on the integration branch first.
The integration branch may be red only in the windows marked below; real-content, team-lead system, boot and e2e checks
run only at Integration.

Order: **M0** (this review, schema.ts) -> **P2-M0** -> **M1 + F0** -> parallel P1 / P2-rest / P3 / P4 / P5 / P6 ->
merge **P2 -> P1 -> P3 -> P5 -> P4 -> P6** -> **Integration**.
P1, P3 may start before M1 on code that does not touch the contract (migration, repository, sequence wiring, copy).

### P2-M0 (P2's first milestone, merged before M1)
First full `content/v3` output (catalog, 44 lessons, 49 banks + salts, retired file, manifest) parsing against schema.ts.
Purely additive: no loader change. Gate: `verify` passes; 44 lessons and 114 charts parse. Any schema change it needs goes
in before M1, so the OpenAPI shape is frozen on real content.

### M1 + F0 (lead)
Backend: `academy.schemas.ts` re-exports; controller route table (11 routes; service methods may throw
NotImplementedException); `academy.content.types.ts` (§1.2) + `ACADEMY_CONTENT` provider token; `test/unit/academy-v3-fixture.ts`;
member-insights, `quant/v2/technical-registry.ts`, `quant/v2/types.ts`, `strategy-config.schemas.ts`, screener schema
edits; `.prettierignore` += `test/fixtures/academy`, `test/fixtures/quant`; `contracts:generate` (backend, then frontend).
Frontend F0: §7.5 F0 list. Runtime loader untouched. Acceptance: backend `npm run typecheck && npm run build &&
npm run contracts:check && npm run format:check`; frontend `npm run typecheck && npm run lint`.
Red window: frontend academy vitest until P5 + P4 merge.

### P1 Backend academy core
Files: `backend/migrations/0026_academy_v32.sql`; `backend/src/modules/academy/**` except `content/v3/**`,
`academy-progress-reader.service.ts`, M1 files' signatures; `backend/test/unit/academy*.test.ts` EXCEPT
`academy-v32-import.test.ts`; `academy-test-kit.ts`, `academy-v3-fixture.ts` (after M1), `quant-v2-engine.test.ts`,
`backend/test/fixtures/academy/**`, `backend/test/fixtures/quant/**`; `test/system/academy-v32.system.spec.ts` (runs at
Integration); deletions as before (`content/{catalog.v1.json,packages,lessons,archive,legacy}`, `academy.packages.ts`,
`academy.blocks.ts`, `academy.legacy-mapping.ts`, `scripts/academy-import/**`, `scripts/academy-legacy-mapping-report.ts`,
`academy-packages.test.ts`, `academy-content.test.ts`). Loader swap to `content/v3` is P1's LAST commit (P2 content is
already on the integration branch when P1 merges).
Acceptance:
```
cd backend && npm run lint && npm run typecheck && npm run format:check
npx vitest run test/unit/academy.test.ts test/unit/academy-grants.test.ts test/unit/academy-attempt-resume.test.ts test/unit/academy-v3-schema.test.ts test/unit/quant-v2-engine.test.ts
npm run build && npm run contracts:check && npm run api:coverage:check   # after rebasing on P2-M0 content
grep -rn "QUESTIONS_PER_LESSON\|buildReview\|completeGuide\|src/modules/academy/content/catalog.v1.json" src scripts test && exit 1 || true
grep -rn "8/8\|71-lesson\|13-chapter" src/modules/academy --include=*.ts | grep -v content/ && exit 1 || true
```

### P2 Importer and content
Files: `backend/scripts/academy-v32-import/**`; `backend/src/modules/academy/content/v3/**` except `schema.ts`;
`backend/test/unit/academy-v32-import.test.ts`. Source: `$ACADEMY_V32_SOURCE` =
`/Users/danhtrongit/Projects/IQX-sources/academy-v32/IQX-Hoc-Vien-MAU.html`.
`--retired-from`: `git show d145fd5d:backend/src/modules/academy/content/catalog.v1.json > "$TMPDIR/catalog-13ch.v1.json"`
(same bytes as the P1 fixture).
Acceptance:
```
cd backend && npm run build
node dist/scripts/academy-v32-import/main.js extract --source "$ACADEMY_V32_SOURCE" --retired-from "$TMPDIR/catalog-13ch.v1.json"
node dist/scripts/academy-v32-import/main.js extract --source "$ACADEMY_V32_SOURCE" && git diff --exit-code src/modules/academy/content/v3
node dist/scripts/academy-v32-import/main.js verify
npx vitest run test/unit/academy-v32-import.test.ts && npm run lint && npm run format:check
```

### P3 Backend consumers and staff progress
Files: as §8 (P3 rows): `academy-progress-reader.service.ts` (against `academy.content.types.ts` + provider),
`quant/v2/registry/technical-registry.json`, `screener/registry/fundamental-registry.json`, strategy-config service copy,
strategy-backtests, alerts, practice, shop reward, admin-users, team service, `scripts/shop-reward-backfill.ts`; tests
`team-insights.test.ts` (uses `academy-v3-fixture.ts`), `quant-v2-spec-parity.test.ts`, `fixtures/bot-registry-spec-16.json`,
`shop-*.test.ts`, `test/system/team-lead-team.system.spec.ts` (runs at Integration).
Acceptance:
```
cd backend && npm run lint && npm run typecheck && npm run format:check
npx vitest run test/unit/team-insights.test.ts test/unit/quant-v2-spec-parity.test.ts test/unit/shop test/unit/practice test/unit/strategy test/unit/screener test/unit/bots test/unit/alerts
grep -rn "8/8\|71-lesson\|13-chapter" src | grep -v "src/modules/academy" && exit 1 || true
```

### P4 Frontend app (panel, reader, quiz, interactive, data)
Files: §7.5 P4 list (incl. `demo-trading-page.test.tsx`). Starts from F0; never creates `BlockRenderer`/`InlineText`.
Acceptance:
```
cd frontend && npm run typecheck && npm run lint
npx vitest run src/pages/academy --exclude "src/pages/academy/{blocks,charts}/**" src/pages/demo-trading/demo-trading-page.test.tsx
grep -rn "muted-foreground" src/pages/academy/{reader,quiz,interactive,panel} && exit 1 || true
npm run contracts:check
```

### P5 Frontend renderers and tokens
Files: §7.5 P5 list (incl. `mobile/src/theme/tokens.generated.ts` via `tokens:sync`). Fills F0 stubs.
Acceptance:
```
cd frontend && npm run typecheck && npm run lint
npx vitest run src/pages/academy/blocks src/pages/academy/charts src/pages/academy/sanitize.test.ts src/pages/academy/no-backend-questions.test.ts
grep -rn "muted-foreground" src/pages/academy/blocks src/pages/academy/charts && exit 1 || true
cd ../mobile && npm run tokens:sync && git diff --exit-code src/theme/tokens.generated.ts && npx jest src/theme
```

### P6 Frontend consumers and copy sweep
Files: §8 frontend table P6 rows (not generated files, not `demo-trading-page.test.tsx`), repo-root `docs/UX_UI_AUDIT_REPORT.md`.
Acceptance:
```
cd frontend && npm run typecheck && npm run lint
npx vitest run src/pages/demo-trading src/pages/strategy src/pages/admin --exclude src/pages/demo-trading/demo-trading-page.test.tsx
grep -rn "8/8\|71 bài\|13 chương" src ../docs | grep -v "generated\|pages/academy" && exit 1 || true
```

### Integration (lead, after all merges)
```
cd backend && npm run contracts:generate && npm run verify && npm run format:check && npm run api:coverage:check
npx vitest run test/unit/academy-boot.test.ts && npm run test:system -- academy-v32 team-lead-team    # Docker
cd ../frontend && npm run contracts:generate && npm run verify && npx vitest run src/pages/academy/charts/real-content.test.tsx
E2E_REAL_BACKEND=1 npx playwright test e2e/academy-v32.spec.ts    # backend :3001, migrations, ACADEMY_ENABLED, fresh user
```
Then VPS DB-copy dry run of 0026 and the release in one deploy (memory: `iqx-vps-deploy-procedure`).

---

## Review log (2026-10-17, three reviews of design-v32 + schema.ts)

Accepted (applied above / in schema.ts):
- backend-correctness 1, 2: salted HMAC option ids, bank `salt`, `assessment_version` removed from responses, tests.
- backend-correctness 3: 0026 drops NOT NULL on `content_version`; `NewAttempt.content_version: string | null`; system test.
- backend-correctness 4, 5: notes save = insert-on-conflict + FOR UPDATE + exact `expected_revision`; size measured in SQL.
- backend-correctness 6 / content-frontend 3 / parallelism 11: scenario fields renamed `best_option`/`debrief`; strict ban list.
- backend-correctness 7: stale scenario hash -> `scenario_choice: null`, gate satisfied, one replacement.
- backend-correctness 8, 9: catalog-first rule; idempotency replay 409 on catalog or item mismatch; tests.
- backend-correctness 10: system spec list (runs at Integration).
- backend-correctness 11: `NOTES_KEY_MAX = 97`.
- backend-correctness 12: reader maps unknown completion methods to null (enum unchanged).
- backend-correctness 14: OUT_DIR asserted to the src path; `no-backend-questions.test.ts`.
- content-frontend 1: `intro_blocks`, walker over every `.blk`, `.wide.sec.blk`, unwrap class-less divs, plain `.fig`.
- content-frontend 2: interactive key duplicates per namespace.
- content-frontend 4: `info`/`violet` card tones, definitions `tone`, `tone-violet` inline, extra hex mappings.
- content-frontend 5: table cell `colspan`/`highlight`; width sums colspans.
- content-frontend 6: `.st4` without svg -> cards; `.ex2` = 26; gate counts DOM-derived.
- content-frontend 7: diagram text only when view_box <= 320; re-kinds; flow/milestones/thumbnail renderer rules; 3 flows -> steps.
- content-frontend 8: `category` `tone_by_sign`, `caption_tone`, `sublabels`.
- content-frontend 9: absolute index convention, all indexes checked; C1L9-g3 interpolation.
- content-frontend 10: `visibleString` / `chartString` on every rendered string.
- content-frontend 11: `client-case-block.tsx`.
- content-frontend 12: `chartTextToneSchema` without p3/neutral; default `--academy-label`.
- content-frontend 13: `pad_title`, roleplay `default`, checklist `result_label`, `Math.round`, practice name without suffix.
- content-frontend 14: `JSON.parse` instead of node:vm.
- content-frontend 15: arrow glyphs banned in chart text, schematic `axes.*.arrow`; `.meta({id})` on the three unions.
- parallelism 1-4, 14: P2-M0 before M1, loader swap last in P1, F0, M1 types + fixture + provider, new order.
- parallelism 5: `strategy-config.schemas.ts:196`, `quant/v2/types.ts:181`, path `quant/v2/technical-registry.ts`.
- parallelism 6, 7, 8, 9, 10, 12, 13: test ownership moves, scan scopes, mobile tokens sync, importer paths/flags,
  `.prettierignore` + `format:check` + `api:coverage:check`, Docker system tests and e2e setup, ownership overlaps.

Rejected:
- backend-correctness 13 (per-item attempt rate cap): spec accepts unlimited retakes with score shown; a cap only slows a
  2N+1 search and adds a new error contract. Out of scope for v3.2.
- content-frontend 3 alternative "scope the scan / allow under scenario": superseded by the rename, which keeps one strict rule.
- backend-correctness 12 alternative "add `guide` to the enum": guide mode is removed; mapping to null avoids reviving it in the UI.

## v3.3 (cập nhật 22-10)

Chi tiết các khoảng trống và quyết định nằm ở `backend/docs/update-22-10/spec-update-22-10.md` mục 2. Phần HV-01 đến HV-05 làm trong đợt này:

- Câu hỏi khái niệm thay cho câu phải tính (10 câu viết lại, `question_version` tự đổi theo hash ngân hàng).
- Câu hỏi có thể có `chart_id` trỏ tới biểu đồ của chính bài (33 câu đọc biểu đồ Chương 8 đến 13 trỏ tới `c{ch}l{n}-rep`). `chart_id` được gửi cùng câu hỏi, trình duyệt vẽ từ `charts` của bài đã tải. Đáp án không gửi.
- `GET /strategy/screener/metrics` ẩn 9 chỉ tiêu không có bài học với người không có quyền cũ `fundamental:*`.
- e2e đổi tên thành `frontend/e2e/academy-v33.spec.ts`.
