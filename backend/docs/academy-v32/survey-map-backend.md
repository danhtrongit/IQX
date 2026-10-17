# Backend map: Academy module → v3.2

Repo: `/Users/danhtrongit/Projects/IQX/backend`, branch `feat/academy-v32`. Paths below are relative to `backend/`. Read-only survey.

---

## 1. Module layout (`src/modules/academy/`)

| File | Lines | Role |
|---|---|---|
| `academy.module.ts` | 31 | Nest module. Providers: `AcademyRepository`, `AcademyService`, `AcademyGrantsService`, `AcademyEnabledGuard`, `AcademyProgressReader`, `{ACADEMY_GRANTS → AcademyGrantsService}`. Exports `ACADEMY_GRANTS`, `AcademyGrantsService`, `AcademyProgressReader`. Imports only `AuthModule`. |
| `academy.constants.ts` | 8 | `ACADEMY_CATALOG_VERSION='iqx-academy-outline-13ch-71lessons-v1'`, `ACADEMY_LEGACY_CATALOG_VERSION='iqx-academy-legacy-18ch-125lessons'`, `ACADEMY_CHAPTER_COUNT=13`, `ACADEMY_LESSON_COUNT=71`, `QUESTIONS_PER_LESSON=8` |
| `academy.content.ts` | 467 | Catalog + content loader/validator (`buildAcademyContent`, `readAcademyContentFiles`, `loadAcademyContent` memoized, `resolveAssessment`, `assertKindRules`) |
| `academy.packages.ts` | 173 | Per-chapter package loader (`buildPackageBundles`, `assertPackageLessonMatchesCatalog`) |
| `content/packages/package.schema.ts` | 541 | Zod schema of the package format: blocks, `PackageLesson`, chart models, private/public questions, assets manifest, import manifest |
| `academy.blocks.ts` | 134 | Reader-contract block schema (`lessonBlockSchema`, flat containers) + `chartIdsOf`, `computedTableChartIdsOf`, `imageBlocksOf` |
| `academy.banks.ts` | 287 | Server-only question banks: `package-v1` + `legacy-v1` formats, archive files, version hashing |
| `academy.grading.ts` | 258 | Shuffle, attempt order, public projection, answer validation, grading, review |
| `academy.service.ts` | 791 | All learner use-cases (catalog, progress, lesson, attempts, drafts, history, review, submit, guide completion, reward) |
| `academy.controller.ts` | 196 | HTTP routes under `api/v2/academy` |
| `academy.schemas.ts` | 357 | Zod request/response schemas (also feed OpenAPI) |
| `academy.repository.ts` | 378 | `AcademyStore` interface + `AcademySqlStore` + `AcademyRepository` (`store()`, `transaction()`) |
| `academy.capabilities.ts` | 31 | `capabilitiesForLesson` (`indicator:<id>` / `metric:<id>`), legacy prefix `lesson:` |
| `academy-grants.service.ts` | 41 | `capabilitiesFromCompletions`, `AcademyGrantsService.grantedCapabilities` (port impl) |
| `academy.ports.ts` | 26 | `ACADEMY_GRANTS` symbol + `AcademyGrantsPort { grantedCapabilities(userId): Promise<ReadonlySet<string>> }` |
| `academy-progress-reader.service.ts` | 296 | Read-only staff progress (admin/team-lead); NOT behind `AcademyEnabledGuard` |
| `academy.legacy-mapping.ts` | 80 | 18ch→13ch mapping helpers, used by tests and `scripts/academy-legacy-mapping-report.ts` |
| `academy.hash.ts` | 26 | `canonicalJson`, `canonicalHash` (sha256), `deepFreeze` |
| `academy-enabled.guard.ts` | 19 | `ACADEMY_ENABLED=false` → 404 `FEATURE_DISABLED` |

### Content directory (`src/modules/academy/content/`, copied to dist by `scripts/copy-assets.ts:9`)

```
catalog.v1.json                           13 chapters / 71 lessons (strict zod: catalogFileSchema, content.ts:81-94)
packages/ch01..ch04/                      typed packages (chapters 1-4 of the 13ch catalog)
  lessons.vi.json                         PackageLesson[]  (all 4)
  charts.vi.json                          Record<chart_id, ChartModel>   (ch01, ch03)
  questions.vi.private.json               PrivateQuestion[] 48 each      (ch01, ch03)  PRIVATE
  assets.manifest.json                    guide screenshots              (ch02, ch04)
  import-manifest.json                    provenance (never loaded by the server)
lessons/<id>/lesson.vi.json               59 dirs: ch01/ch03 = "superseded" stubs (keep `fixture` for quant tests);
                                          ch05-ch13 = legacy {sections:[{title, html}]} + fixture
lessons/<id>/assessment.vi.private.json   legacy-v1 8-question bank (ch05-ch13)  PRIVATE
archive/banks/<sha256>.json               12 superseded banks still used to grade pinned attempts
legacy/{CURRICULUM,LESSON-MAP,removed-lessons}.json, legacy/chapters/NN/*   history of 18ch catalog, never served
```

Catalog row shape (`catalogLessonSchema`, content.ts:68-79):
```ts
{ id: /^ch\d{2}-l\d{2}$/, order: int>=1, name: string,
  lesson_key: /^(technical|fundamental|concept|guide):[a-z0-9_-]+$/,
  kind: 'technical'|'fundamental'|'concept'|'guide',
  completion: {mode:'quiz', question_count: 8, required_correct: 8} | {mode:'guide'},
  capability_binding: {kind:'technical'|'fundamental', id:/^[a-z0-9_]+$/} | null,
  legacy_lesson_ids: string[], content_status: 'published'|'not_published' }
chapter: { no, title, type: 'technical'|'fundamental'|'tool', lessons: [...] }   // exactly 13 (.length)
```
Current catalog: ch1 RSI/MACD/MA/Bollinger/Volume/Hợp lưu (quiz), ch2 6 Backtest guides, ch3 6 fundamentals, ch4 6 Filter guides, ch5-13 legacy-html quiz lessons. 16 indicators + 42 metrics bound. All 71 `published`.

---

## 2. Content loading pipeline

`loadAcademyContent()` (content.ts:464) → `readAcademyContentFiles()` (412-459) → `buildAcademyContent(files)` (238-349). Called at boot by `AcademyService.onModuleInit` (service.ts:82) so a broken package stops the API.

`buildAcademyContent` checks, in order:
1. `catalogFileSchema.parse` — literal catalog versions, exactly `ACADEMY_CHAPTER_COUNT` chapters.
2. `buildPackageBundles` per `packages/chNN` (packages.ts:74-143): `packageLessonsFileSchema` (4 sections s1..s4, nav_labels tuple of 4, quiz completion literal 8), chart refs resolve, images under `/assets/academy/chNN/`, quiz lessons → `buildPackageAssessment` (exactly 8 questions `<id>-q01..q08`).
3. Per catalog lesson: id must equal `chNN-lMM` with order = position (265-267); unique id/key; `assertKindRules` (368-391: technical/fundamental ⇒ quiz + matching binding + key `kind:id`; concept ⇒ quiz, no binding, key `concept:*`; guide ⇒ guide mode, key `guide:<id>`, no legacy ids).
4. Published + bundle ⇒ `assertPackageLessonMatchesCatalog` (key/chapter/order/kind/name/mode/`config_id`==binding id); legacy lesson file may exist only as `{lesson_id, superseded_by}` stub. Published without bundle ⇒ legacy file + (quiz) legacy bank.
5. `not_published` must have **no** content files (304-305).
6. Total lessons must equal `ACADEMY_LESSON_COUNT` (326).
7. Archived banks re-hash to their filename and belong to a catalog lesson (331-338).

Output type `AcademyContent` (164-174): `chapters`, `lessons: Map<id>`, `lessonsByKey`, `lessonsByLegacyId`, `archivedBanks: Map<questions_version, ArchivedBank>`. `AcademyLesson = catalog row + {chapter, capabilities[], content: PublishedLessonContent|null, assessment: LessonAssessment|null}`.

`PublishedLessonContent` (131-147): `{content_version, origin:'package'|'legacy', title, lead, nav_labels[4]|null, completion_button_label, sections: AcademySection[], charts: Record<id, ChartModel>, fixture, sources, review_status, package:{id,version}|null}`.

### Block types (reader contract, `academy.blocks.ts`)
Leaf: `html{html}`, `table{head[], rows[][], align?: ('l'|'r'|'c')[], aria_label?, source?:{kind:'computed', hook:'macd-seed'|'application', chart_id?}}`, `chart{chart_id, title, caption?, illustrative?, table_toggle}`, `image{asset_id, src, width, height, alt, title, caption?, zoom_title, max_width?}`, `steps{items:[{no,title,html}]}`.
Containers (hold leaf blocks only): `callout{variant:'notice'|'worked'|'signal-buy'|'signal-sell'|'filter-example', title?, aria_label?, blocks}`, `details{summary, blocks}`.
`package.schema.ts` has the same set but recursive (`blockSchema`); `parseSections` (packages.ts:57) re-validates against the flat reader schema.

Chart models (`chartModelSchema`, package.schema.ts:359-398): `series_panels` (C1 windowed multi-panel), `grouped`, `line`, `stacked`, `timeline`, `waterfall`, `panels`. All carry precomputed numbers.

### Question banks (`academy.banks.ts`) — how answers stay server-side
- `AcademyQuestion` (35-47) holds `correct_option_id`, per-option `explanation` (package) or question `explanation` (legacy). Never serialized directly.
- `package-v1` (`buildPackageAssessment`, 197-219): exactly 8, sorted ids, version = `canonicalHash({format, lesson_id, questions, charts used by figures})`. Option ids opaque (10 hex of sha256(`qid|source option id`)).
- `legacy-v1` (`buildLegacyAssessment`, 118-144): version = `canonicalHash(file.questions)`.
- `PrivateQuestion` schema (package.schema.ts:414-447): id `/^ch\d{2}-l\d{2}-q\d{2}$/`, `section 1..4` required, `options` **length(4)**, each option `explanation` **required**.
- Archive (`archivedBankFileSchema`, 231-239): an attempt pinned to an old `questions_version` is graded with the archived copy (`resolveAssessment`, content.ts:355-365); unknown version ⇒ 409 `ASSESSMENT_VERSION_MISMATCH`.
- Public projection: `attemptQuestionViews` (grading.ts:129-148) lists fields one by one: `{id, topic, section, prompt, hint, figure, options:[{id,text}]}` in stored order. Answer key only leaves through `buildReview` (grading.ts:220-258) after submit.

---

## 3. HTTP endpoints (`academy.controller.ts`, guards `AcademyEnabledGuard, ApiAuthGuard`, prefix `api/v2/academy`)

| Method / path | Service fn | Request | Response schema |
|---|---|---|---|
| GET `catalog` (61) | `catalog()` svc:87 | – | `catalogResponseSchema` `{catalog_version, chapter_count, lesson_count, chapters:[{no,title,type,lessons: LessonMeta[]}]}` — **not user-specific** |
| GET `progress` (71) | `progress()` svc:103 | – | `{catalog_version, completed:[{lesson_id,lesson_key,completion_method,completed_at}], completed_lesson_ids, chapters:[{no,done,total}], course_done, course_total, progress_revision, granted_capabilities}` |
| GET `lessons/:lessonId` (81) | `lesson()` svc:113 | param `/^ch\d{2}-l\d{2}$/` | `LessonMeta & {catalog_version, completed, completion_method, completed_at, reward, best_score, attempts_submitted, title, lead, nav_labels[4]|null, sections:[{id,title,blocks}], charts, fixture, sources, review_status}` |
| GET `lessons/:lessonId/attempt` (95) | `resumeAttempt()` svc:191 | – | `{lesson_id, lesson_key, catalog_version, attempt: (AttemptResponse & {created_at, draft: DraftState}) | null}` |
| GET `lessons/:lessonId/attempts` (109) | `attemptHistory()` svc:282 | query `limit 1-50 (20)`, `offset` | `{lesson_id, lesson_key, catalog_version, items:[{attempt_id, submitted_at, score, total: 8, passed, review_available}], total, limit, offset, next_offset}` |
| POST `attempts` (123) | `createAttempt()` svc:150 | strict `{lesson_id, catalog_version, idempotency_key 8-128}` | 201 `AttemptResponse {attempt_id, lesson_id, lesson_key, catalog_version, content_version, assessment_version, status, questions:[{id, topic, section, prompt, hint, figure, options:[{id,text}]}]}` |
| GET `attempts/:attemptId` (137) | `attemptReview()` svc:320 | uuid | `SubmitResponse`; 409 `ATTEMPT_NOT_SUBMITTED` if open |
| PUT `attempts/:attemptId/answers` (151) | `saveDraft()` svc:229 | `{answers:[{question_id, option_id}] max 64, expected_revision?}` | `DraftState & {attempt_id}`: `{revision, answers, answered_count, total: 8, updated_at}`; 409 `ATTEMPT_ALREADY_SUBMITTED`, 409 `DRAFT_REVISION_CONFLICT` (details[0].draft), 422 `INVALID_ANSWERS` |
| POST `attempts/:attemptId/submit` (166) | `submit()` svc:337 | `{answers[] max 64, idempotency_key?}` | 200 `SubmitResponse {attempt_id, lesson_id, lesson_key|null, catalog_version, score, total: 8, correct, wrong, passed, submitted_at, best_score, attempts_submitted, review_available, results: ReviewItem[], completion:{completed, completion_method, completed_at, newly_completed}, granted_capabilities, newly_granted, progress_revision, reward}` |
| POST `lessons/:lessonId/complete` (182) | `completeGuide()` svc:399 | strict `{catalog_version, content_version ≤32, request_id 8-128}` | `{lesson_id, lesson_key, catalog_version, completion, granted_capabilities, progress_revision, reward}` |

`ReviewItem` = `{question_id, topic, section, prompt, hint, figure, option_id, correct, correct_option_id, explanation, options:[{id, text, chosen, correct, explanation}]}` — **this is what v3.2 forbids on the result screen.**
`RewardResult` = `{status:'credited', delta, balance_after} | {status:'already_rewarded', balance_after} | {status:'unavailable'} | null`.
Error codes in use: `LESSON_NOT_FOUND` 404, `ATTEMPT_NOT_FOUND` 404, `CATALOG_VERSION_MISMATCH` 409, `IDEMPOTENCY_KEY_REUSED` 409, `ASSESSMENT_VERSION_MISMATCH` 409, `NOT_PUBLISHED` 409, `CONTENT_VERSION_MISMATCH` 409, `COMPLETION_MODE_MISMATCH` 422, `INVALID_ANSWERS` 422, `FEATURE_DISABLED` 404.

---

## 4. Attempt lifecycle (service.ts)

1. **Start** `createAttempt` (150-182): catalog version must match; lesson must be quiz + published + have assessment; idempotent by `(user_id, idempotency_key)` (replay → `attemptView`, 559-584, rejects key reuse for another lesson/catalog). `buildAttemptOrder` (grading.ts:90) shuffles question ids and every question's options with `crypto.randomInt` (overridable `this.random`). Insert pins `catalog_version, content_version, questions_version, question_ids, option_orders`. **No lock/sequence check today.**
2. **Resume** `resumeAttempt` (191-222): `latestOpenAttempt(user, lesson_key, catalog)`; null if bank gone/order invalid; returns projection + `draftState`.
3. **Draft** `saveDraft` (229-279) in tx: `lockAttempt` (`FOR UPDATE`), open only, `pinnedAttempt`, `findInvalidDraftAnswers`, optimistic `expected_revision`, merge upsert (`selections || excluded.selections`, revision+1); no-op if unchanged.
4. **Submit** `submit` (337-396) in tx: lock; already submitted ⇒ `storedResult` replay; `findInvalidAnswers` + `question_ids.length !== QUESTIONS_PER_LESSON` ⇒ 422; `gradeAnswers` (grading.ts:193, pass = `score === 8`); `markSubmitted` (status guard), `insertAnswers` (academy_answers), `deleteDraft`; if passed: `lockUser` (advisory lock `hashtext('academy_completions:'||user)`), `insertCompletion` (on conflict `(user_id, lesson_key)` do nothing), if created ⇒ `creditReward(…, 'quiz')`. Returns `storedResult` (490-557), which rebuilds the review from the pinned bank.
5. **Guide** `completeGuide` (399-457): content_version must match; tx + lockUser; request_id idempotency (`uq_academy_completions_user_request`); insert `completion_method='guide'`, `source={acknowledgment:true}`, reward.
6. **Reward** `creditReward` (460-483): optional `LESSON_REWARD_PORT` (`src/platform/ports/lesson-reward.port.ts`) → Shop `LessonRewardService.creditFirstCompletion(tx, {userId, lessonKey, lessonId, catalogVersion, completionMethod, completedAt})` (`src/modules/shop/lesson-reward.service.ts:65`) inserts `lesson_rewards` PK `(user_id, lesson_key)` + `coin_ledger` +100 xu (`LESSON_REWARD_XU`), unique key `lesson_first_completion:<user>:<lesson_key>`; same tx, so a failing hook rolls back the completion. Outcome stored in `academy_completions.source.reward` via `attachReward`. Shop validates key with `LESSON_KEY = /^(technical|fundamental|concept|guide):[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/` (lesson-reward.service.ts:14); same regex in `scripts/shop-reward-backfill.ts:31`.
7. **Grants**: no grant table write. `AcademyGrantsService.grantedCapabilities` = `capabilitiesFromCompletions(content, completions)` (grants.service.ts:14-24, **only keys present in the current catalog**) ∪ legacy `lesson:*` from `academy_grants.capability_ids`. Consumers via `ACADEMY_GRANTS`: strategy-config (`indicator:` on master ON, strategy-config.service.ts:364-378), screener (`metric:`, screener.service.ts:187,323), bot-universe (523), bots shared config, alerts evaluator/service, practice (433-438), strategy-backtests (legacy `lesson:*`).

Other helpers: `lessonMeta` (639-664), `buildProgress` (667-704: `course_done` = distinct catalog-key completions, `course_total = lessons.size`), `pinnedAttempt` (742-762), `draftState` (609-629, `total: QUESTIONS_PER_LESSON`).

---

## 5. Database (academy tables)

**0008_academy.sql**
- `academy_attempts(id uuid pk, user_id fk users cascade, lesson_id varchar(32), content_version varchar(32), questions_version char(64), question_ids text[], option_orders jsonb, status varchar(16) default 'open' CHECK in ('open','submitted'), idempotency_key varchar(128), created_at, submitted_at, score integer CHECK (score BETWEEN 0 AND 8), passed boolean)`; `uq_academy_attempts_user_idempotency(user_id, idempotency_key)`; `ck_academy_attempts_submission` (open ⇒ submitted_at/score/passed null; submitted ⇒ all not null); `ix_academy_attempts_user_lesson(user_id, lesson_id, created_at desc)`. The score CHECK is an inline column check ⇒ Postgres name `academy_attempts_score_check`.
- `academy_answers(attempt_id fk cascade, question_id varchar(64), option_id varchar(64), correct bool, pk(attempt_id, question_id))`.
- `academy_grants(user_id, lesson_id varchar(32), capability_ids text[], attempt_id fk, granted_at, content_version, pk(user_id, lesson_id))` — legacy, read-only now.

**0012_bot_academy_activation.sql** — no academy table changes (bot_positions/decisions/receipts only).

**0014_academy_catalog_v1.sql**
- `academy_attempts` + `catalog_version varchar(64) NOT NULL DEFAULT 'iqx-academy-legacy-18ch-125lessons'`, `lesson_key varchar(96)`; `ix_academy_attempts_user_lesson_key(user_id, lesson_key, created_at desc) where lesson_key is not null`.
- `academy_completions(user_id fk cascade, lesson_key varchar(96), catalog_version varchar(64), lesson_id varchar(32), completion_method varchar(24), attempt_id uuid fk academy_attempts, request_id varchar(128), content_version varchar(32), completed_at, source jsonb default '{}', created_at)`, `pk(user_id, lesson_key)`, `ck_academy_completions_key CHECK (lesson_key ~ '^(technical|fundamental|concept|guide):[a-z0-9_-]+$')`, `ck_academy_completions_method in ('quiz','guide','legacy_migration')`, `ck_academy_completions_evidence` (quiz ⇒ attempt not null & request null; guide ⇒ attempt null & request not null; legacy_migration ⇒ request null), `ck_academy_completions_source` object; `uq_academy_completions_user_request(user_id, request_id) where request_id is not null`; `ix_academy_completions_attempt`.
- Backfill from `academy_grants` via explicit VALUES list (59 rows, kept in sync with catalog by `parseMigrationMapping` test).

**0015_workspace_shop.sql** `lesson_rewards(user_id, lesson_key text, lesson_id text, catalog_version text, completion_method varchar(16), completed_at, ledger_id fk coin_ledger deferrable, policy_version, created_at, pk(user_id, lesson_key), uq ledger_id, ck method)`; **0020** relaxes method CHECK to `('quiz','guide','legacy_migration')`.

**0018_academy_attempt_drafts.sql** `academy_attempt_drafts(attempt_id uuid pk fk academy_attempts cascade, selections jsonb default '{}' CHECK object, revision int default 1 CHECK >=1, created_at, updated_at)`.

Latest migration is `0025_team_lead_conversion.sql` ⇒ next is **0026**.

Repository SQL facts relevant to v3.2 (`academy.repository.ts`):
- `attemptStats` (280-291) and `submittedAttempts` (208-216) filter by `user_id, lesson_key, status` **but not catalog_version** ⇒ old 8-question attempts of `technical:rsi` would show as best_score 8 on the new 5-question RSI lesson.
- `latestOpenAttempt` (197-206) does filter catalog.
- `completions(userId)` returns all rows, any catalog.

## 6. Config flags (`src/platform/config/environment.ts`)
Only `ACADEMY_ENABLED: booleanSetting(true)` (line 206). Related: `STRATEGY_ADVANCED_CAPABILITIES` (legacy `lesson:*` gates). No academy content/catalog switch, no lock flag.

## 7. Staff progress (`academy-progress-reader.service.ts`)
`summaries(userIds)` / `detail(userId)` → `buildAcademyProgress(content, facts)` (pure, 192-296). Facts SQL: completions any catalog (`source->'reward'`), attempts grouped per lesson_key **filtered by current catalog**. Only published lessons count. `chapter_exams: {total: 0, passed: 0}` hard-coded (line 255). `current_lesson` = lesson with most recent open attempt else first not completed. `max_score: QUESTIONS_PER_LESSON`. Status: completed / in_progress (open attempt) / failed / not_started. Consumers: `src/modules/users/admin-users.service.ts:192`, `src/modules/team-leads/team.service.ts` (summary + sort by academy progress), OpenAPI closed schema `src/modules/users/member-insights.openapi.ts:81-139` (`ACADEMY_SUMMARY_SCHEMA`, `ACADEMY_DETAIL_SCHEMA`).

## 8. Legacy mapping
`academy.legacy-mapping.ts`: `legacyMappingRows(content)` from `lessonsByLegacyId`; `loadRemovedLegacyLessons()` (`content/legacy/removed-lessons.json`); `parseMigrationMapping(sql)` regex over 0014 VALUES. Script `scripts/academy-legacy-mapping-report.ts` (dry-run report). Grants port doc (ports.ts) explains the `lesson:<legacy id>` capability is never confused with new ids.

Cross-module lesson-id references (must be updated with the new catalog):
- `src/modules/quant/v2/registry/technical-registry.json`: every indicator has `lesson_id` (rsi→ch01-l01 … williams_r→ch10-l03); schema `technical-registry.ts:86` `lesson_id: z.string().min(1)` (not nullable).
- `src/modules/screener/registry/fundamental-registry.json` + `screener.registry.ts:127` `lesson_id: /^ch\d{2}-l\d{2}$/` (not nullable), served as `lesson_id` by `screener.service.ts:191`.
- `test/unit/quant-v2-engine.test.ts:538-575` reads `content/lessons/*/lesson.vi.json` `fixture` keyed by registry `lesson_id`, and `content/legacy/chapters/*/fixtures.json`.

## 9. Backend tests touching Academy

| File | Tests | Asserts |
|---|---|---|
| `test/unit/academy.test.ts` | 63 | 13ch/71 counts and per-chapter titles/order; 16 technical+42 fundamental+1 concept+12 guide; key formats; bindings vs quant/screener registries; 47 re-homed + 24 package lessons; inconsistent-content rejection; legacy mapping 59 rows == migration 0014 VALUES, ATR≠OBV, ADX≠Stochastic; capability mapping; grading 8/8; catalog/lesson/progress payloads have no answer keys; progress 0/71; attempt pinning, idempotency, stale catalog, not-published refusal, 7/8 vs 8/8, reward once & atomic rollback, concurrent submit, guide completion (12 guides +100 xu), grants service (completions + legacy `lesson:*`, ignores off-catalog keys), SQL store (locks, catalog/key on insert, stats), migration 0014 shape, guard 404, optional reward DI |
| `test/unit/academy-content.test.ts` | 27 | ch1-4 package counts (C1 16 charts/48 q, C2 22 images, C3 13 charts/48 q, C4 27 images), chart models, image files, response shapes vs OpenAPI (non-recursive), boot validation, no private data before submit, seeded shuffles stable on resume, grading by option id, review payload with explanations, retake best score, pinned/archived banks, legacy-catalog attempts readable, varchar limits of 0008/0014 |
| `test/unit/academy-packages.test.ts` | 35 | `scripts/academy-import` verifier: inventory/hashes/do-not-copy, image src exist under `frontend/public`, banks 48×8 with opaque option ids, ch1 math golden values (RSI/SMA/EMA/MACD/Bollinger/volume), deterministic transforms, sanitiser allowlist, canonical hashing, schema rejections; full re-extraction (needs source HTML) |
| `test/unit/academy-attempt-resume.test.ts` | 29 | routes registered; migration 0018 + draft SQL; draft save/merge/idempotent/invalid ids/owner-only/submitted refusal/legacy refusal/expected_revision; submit stays strict; resume semantics; history pagination; review == submit replay; MFI text escaping; no unescaped `<` in html |
| `test/unit/academy-test-kit.ts` | – | `MemoryAcademy` (in-memory `AcademyStore` with tx snapshot rollback), `FakeRewards`, `seededRandom`, `TestAcademyService`, `setup`, `answerKey/correctAnswers/wrongAnswer`, `start`, `pass` |
| `test/unit/team-insights.test.ts` | 7 | `buildAcademyProgress` (published-only, current lesson, statuses, `chapter_exams` 0) |
| `test/system/team-lead-team.system.spec.ts` | 6 | inserts `academy_attempts`/`academy_completions`, expects label `Chương 1 · Bài 3:`, `chapter_exams {0,0}`, current `ch01-l03`, chapter numbers/total from `loadAcademyContent` |
| `test/unit/quant-v2-engine.test.ts` | (fixtures) | lesson fixtures in `content/lessons/*` keyed by registry lesson ids |
| practice-*, screener-service, strategy-config, strategy-alerts-*, strategy-backtests, bots-* , shop-* | – | use `AcademyGrantsPort` doubles / capability strings (`indicator:rsi`, `metric:roe`); shop tests use lesson keys `technical:*` |

---

## 10. What must change for v3.2 and where

### 10.1 Catalog + constants (new catalog, published flag, optional, exams)
- `academy.constants.ts`: new `ACADEMY_CATALOG_VERSION = 'iqx-academy-v3.2-14ch-94lessons'`; move 13ch version to a `ACADEMY_PREVIOUS_CATALOG_VERSIONS` list (needed so old attempts stay readable as history). Replace `QUESTIONS_PER_LESSON` with per-item counts: `LESSON_QUIZ_SIZE = {1:3,2:3,3:3, default:5}`, `EXAM_SIZE = {1..3:20, default:30}`; `ACADEMY_CHAPTER_COUNT=14`, `ACADEMY_LESSON_COUNT=94` (required only), `ACADEMY_OPTIONAL_COUNT=1`.
- New `content/catalog.v3.json` (keep `catalog.v1.json` only if archived banks still need owner lookup; otherwise move to `content/archive/`). Proposed strict shape:
```ts
type CatalogV3 = {
  catalog_version: 'iqx-academy-v3.2-14ch-94lessons';
  previous_catalog_versions: string[];
  chapters: Array<{
    no: number; title: string;
    type: 'foundation' | 'sales' | 'brand' | 'technical' | 'fundamental' | 'tool';
    published: boolean;                       // §5.1 cờ phát hành
    audience: 'all';                          // reserved (§1.3-5), later 'team'
    exam: { id: `ch${string}-exam`; item_key: `exam:ch${string}`;
            question_count: 20 | 30; required_correct: 20 | 30 } | null;   // null only when unpublished
    items: Array<{
      id: string;                             // ch01-l01 … ; practice: 'ch03-practice'
      order: number; name: string;
      lesson_key: string;                     // stable key, see 10.5
      kind: 'technical' | 'fundamental' | 'concept' | 'guide' | 'practice';
      optional: boolean;                      // true only for Phòng tập
      completion: { mode: 'quiz'; question_count: 3 | 5; required_correct: 3 | 5 };
      capability_binding: { kind: 'technical' | 'fundamental'; id: string } | null;
      scenario_required: boolean;             // ch2-3 lessons
      legacy_lesson_ids: string[];
    }>;
  }>;
};
```
- `academy.content.ts`: rewrite `catalogFileSchema`/`catalogLessonSchema` (68-94), `assertKindRules` (368-391: allow concept lessons with 3/5-question quiz; guide ⇒ quiz too in v3.2; practice kind), drop the `id === chNN-lMM` positional rule for practice/exam ids (264-267), replace `content_status` with chapter-level `published` (a published chapter requires every item + exam bank; an unpublished chapter has metadata only and no files), change count checks (326). Build a flat ordered sequence `content.sequence: AcademyItem[]` (lessons + exam per published chapter, practice after ch3 exam) and `itemsById`. `AcademyContent` gains `exams: Map<chapterNo, AcademyItem>`.
- `academy.service.ts catalog()` (87-100) and schemas `catalogResponseSchema` (104-116): return only `published` chapters; add `optional`, `kind`, `exam` per chapter, `required_total` (43). Because the sidebar needs lock states, either make `catalog` user-aware or (preferred) keep catalog static and add per-item status to `progress`.

### 10.2 Content format (typed blocks + React charts)
- Replace the package pipeline for v3.2 with a new folder, e.g. `content/v3/chNN/{lessons.vi.json, questions.vi.private.json, exam.vi.private.json}` and a new schema file `content/v3/package.schema.ts` (keep `content/packages/package.schema.ts` only as long as archived `package-v1` banks need `privateQuestionSchema`).
- Lesson shape: variable number of sections (today `.length(4)` + `nav_labels` tuple of 4, package.schema.ts:225-254) ⇒ `sections: {id: string, title: string, blocks: Block[]}[] (min 1)`, `lead`, `summary: string[]`, no `nav_labels` or derived from section titles.
- New leaf blocks needed in `academy.blocks.ts` (and OpenAPI): `cards` (thẻ so sánh), `diagram`/`chart {chart_id}` with a `component` chart model (`{kind:'component', component: <allow-listed React chart id>, props: Record<string, number|string|…>}`) so formulas run client-side as the owner chose; `pad {key, prompt}` (bài tự làm), `todo {items:[{key, text}]}`, `audit {items:[{key,text}]}` (tự chấm x/N), `income_calculator {fee_rate:0.0015, share:0.7}`, `client_profiles`, `roleplay_scorer {criteria[6], bands}` for the practice room. Keys of `pad`/`todo`/`audit` must be unique per lesson and are the whitelist for practice notes (10.7).
- `scenario` is a lesson field, not a block (spec §5.1): `{prompt: string; options: [string,string,string]; answer: 0|1|2; explanation: string; version: string}`. It is public (§2.3-5), so it is served in `GET lessons/:id`.
- `lessons/<id>` legacy html dirs, `packages/ch01-04`, `scripts/academy-import/*` and `test/unit/academy-packages.test.ts` become archive-only. Keep worked `fixture`s needed by `quant-v2-engine.test.ts` by moving them into the quant registry test data (they are indicator fixtures, not lesson content).

### 10.3 Question banks and quiz sizes
- `academy.banks.ts`: add bank format `v3-items` built from the MAU `IT[].q = [prompt, string[3], correctIndex]` data: ids `<item id>-qNN` (NN up to 30), opaque option ids `sha256(qid|index)[:10]`, 3 options, `explanation` optional, `section` optional/null. `expectedQuestionIds(lessonId)` (75-79) and both length checks (125, 205) must take the item's `question_count`. Version = `canonicalHash({format:'v3-items', item_id, questions})`; keep `resolveAssessment`/archive so later edits stay gradable.
- `academy.grading.ts gradeAnswers` (193-213): `passed = score === questionIds.length` (all-correct for 3/5/20/30) — drop `QUESTIONS_PER_LESSON`.
- `academy.service.ts submit` (346-351): replace the `!== QUESTIONS_PER_LESSON` check with `!== item.completion.question_count` (or `attempt.question_ids.length`); messages use N. `storedResult` `total/wrong` (542-544), `attemptHistory total` (303), `draftState total` (626) ⇒ `attempt.question_ids.length`.
- `academy.schemas.ts`: `total: z.literal(8)` at 238, 302, 327 ⇒ `z.number().int()`.
- `academy-progress-reader.service.ts` `max_score` (283) ⇒ item question count.
- Migration: drop `academy_attempts_score_check`, add `CHECK (score IS NULL OR (score >= 0 AND score <= cardinality(question_ids)))`.

### 10.4 Chapter exams (`kind`)
- Migration 0026: `ALTER TABLE academy_attempts ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson','chapter_exam'))` (practice attempts are `lesson`, per §5.2). Completion key for an exam: `exam:ch01` …
- Endpoints: reuse `POST attempts` with the exam id (`ch01-exam`) — widen `lessonIdParamSchema` (schemas.ts:6) to `/^ch\d{2}-(l\d{2}|exam|practice)$/` — or add `GET chapters/:no/exam` (intro: N, required, status) + `POST attempts {item_id}`. Exam intro text is static per spec §3.3; serve `question_count`, `required_correct`, `chapter_title`.
- `submit`: when `item.kind === 'chapter_exam'` ⇒ insert completion but **skip `creditReward`** (§3.1 "Không cộng xu"); `reward: null`. `NewAttempt`/`AttemptRow` (`repository.ts:6-38`) gain `kind`; `insertAttempt` SQL (149-171) writes it.
- Progress reader: `chapter_exams: {total: published chapters, passed: exam completions}`; add exam rows to each chapter.

### 10.5 Lesson keys (stable identity, migration §5.3)
- Reuse `technical:volume`, `technical:ma`, `technical:rsi`, `technical:macd`, `technical:bollinger` for ch04-l04..l08 ⇒ existing completions (quiz/legacy_migration) count automatically, no SQL, and `lesson_rewards` PK makes them pay nothing extra (§5.3-3).
- Every other new lesson needs a **fresh** key. Never reuse `guide:ch02-lMM`/`guide:ch04-lMM` (old completions exist for those exact keys and would mark Sale SACO lessons done) nor `concept:hop_luu`. Proposal: `concept:<slug>` for ch1/ch4 non-indicator/ch5 lessons, new prefixes `sales:<slug>`, `brand:<slug>`, `practice:thuc_chien`, `exam:chNN`, `guide:v3-chNN-lMM` for ch6.
- Regexes to widen (all four must agree): `academy.content.ts:46`, `academy.banks.ts:226`, `shop/lesson-reward.service.ts:14` (`LESSON_KEY`), `scripts/shop-reward-backfill.ts:31`; DB `ck_academy_completions_key` (drop/re-add in 0026). `lesson_rewards` has no key CHECK.
- Exams must be rejected by the Shop hook even if called (defence in depth: `exam:` not in `LESSON_KEY`).

### 10.6 Sequential unlocking (new `academy.sequence.ts`)
- Pure function, used by service, controller responses and progress reader:
```ts
type ItemState = 'completed' | 'unlocked' | 'locked';
function buildItemStates(content: AcademyContent, completedKeys: ReadonlySet<string>): Map<string /*item id*/, ItemState>;
```
  Rule (spec §4.1/§5.2): walk `content.sequence` (published chapters only); first item unlocked; an item is unlocked when the previous **required** item is completed (optional practice skipped); practice unlocks with ch3 exam. **Recommendation:** for migrated users use a prefix rule (unlocked only if *every* earlier required item is completed). With the literal "previous item" rule, a user migrated with `technical:rsi` completed would get ch04-l07 MACD unlocked without doing ch1-3, contradicting §5.3-2 ("vẫn phải đi qua Chương 1–3"). For a new user both rules give the same result. Completed-but-out-of-order items show `completed` ("Xem lại").
- Enforcement points (403 `ForbiddenException`):
  - `createAttempt` (service.ts:150) ⇒ `ACADEMY_ITEM_LOCKED` (load completions in the same call; completions only grow, so no lock needed).
  - `completeGuide` (399) ⇒ same (guide mode is only kept for compatibility).
  - `lesson()` (113) for a locked item: decide 403 vs meta-only (spec says locked items are not clickable; recommend 403 `ACADEMY_ITEM_LOCKED` for content, meta stays in catalog).
  - `resumeAttempt`/`saveDraft`/`submit` of an attempt created while unlocked: allow (it was unlocked at start; state cannot regress).
- Responses: `progress` gains `items: [{id, kind, chapter, optional, state, completed_at, best_score, attempts}]`, `required_done`, `required_total` (43), `exams:[{chapter, state}]`, `practice:{state}`; `course_done/course_total` count required lessons only (exclude exams and optional).

### 10.7 Scenario choices (ch2-3) and practice notes
- Migration 0026:
```sql
CREATE TABLE IF NOT EXISTS academy_scenario_choices (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key varchar(96) NOT NULL,
  lesson_id varchar(32) NOT NULL,
  choice smallint NOT NULL CHECK (choice BETWEEN 0 AND 2),
  scenario_version char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_scenario_choices PRIMARY KEY (user_id, lesson_key)
);
CREATE TABLE IF NOT EXISTS academy_practice_notes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_key varchar(96) NOT NULL,
  lesson_id varchar(32) NOT NULL,
  pads jsonb NOT NULL DEFAULT '{}'::jsonb,      -- {key: text}
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,    -- {key: boolean} (todo + audit)
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_academy_practice_notes PRIMARY KEY (user_id, lesson_key),
  CONSTRAINT ck_academy_practice_notes_shape CHECK (jsonb_typeof(pads)='object' AND jsonb_typeof(checks)='object'),
  CONSTRAINT ck_academy_practice_notes_size CHECK (octet_length(pads::text) <= 65536)
);
```
  (Spec names the column `lesson_id`; keying by `lesson_key` survives renumbering like completions do. Name note: a `practice` module (bot mini practice, migration 0017) already exists; `academy_practice_notes` is fine but keep it inside the academy module.)
- Endpoints (controller + schemas + service + repository):
  - `PUT lessons/:lessonId/scenario` body `{choice: 0|1|2}` ⇒ insert `ON CONFLICT DO NOTHING`, return stored row (idempotent; a different second choice returns the first one, or 409 `SCENARIO_ALREADY_CHOSEN`). Response `{lesson_id, choice, answer, correct, explanation, chosen_at}`. Requires item unlocked and `scenario` present.
  - `GET lessons/:id` adds `scenario` (public, includes answer + explanation per §2.3-5) and `scenario_choice: {choice, chosen_at} | null`, plus `quiz_unlocked: boolean`.
  - `createAttempt`: if item has `scenario` and no row ⇒ 403 `ACADEMY_SCENARIO_REQUIRED`.
  - `GET/PUT lessons/:lessonId/notes` body `{pads?: Record<key,string ≤4000>, checks?: Record<key,boolean>, expected_revision?}` ⇒ merge upsert like drafts (`||`, revision+1, no-op when unchanged); keys validated against the lesson's `pad/todo/audit` block keys. Never affects progress.
- `AcademyStore` additions: `scenarioChoice(user, key)`, `insertScenarioChoice(...)`, `practiceNotes(user, key)`, `savePracticeNotes(...)`.

### 10.8 Score-only result (no answer leak)
- `submit`/`attemptReview`/`storedResult` (490-557): for v3.2 attempts return `results: []`, `review_available: false`, keep `score/total/passed/newly_granted/reward/completion`. Better: a new `SubmitResponse` without `results`, `correct_option_id` or explanations, and drop `GET attempts/:id` review (or make it return the score only). Reason: retakes reuse the same small bank (3 questions), so revealing the key after a failed attempt makes the next attempt trivial and contradicts §3.2-4 / §7-7. `buildReview` stays for legacy attempts only or is removed.
- `newly_granted` stays (the "Đã mở chỉ báo X" label). Add `chapter_completed: number | null` for exams ("Đã hoàn thành Chương c").

### 10.9 Grants and migration (§5.3, owner decisions)
- `capabilitiesFromCompletions` (academy-grants.service.ts:14-24) currently drops completions whose key is not in the catalog ⇒ switching catalogs would **revoke** every `indicator:ema`, `metric:roe`, … earned before. Change: for a completion key not in the current catalog, derive the capability from the key itself (`technical:<id>` ⇒ `indicator:<id>`, `fundamental:<id>` ⇒ `metric:<id>`), only for `completed_at` before the v3.2 cutover or for `catalog_version` in the previous-catalog list. New users cannot get them because no published lesson binds them (owner: "stay locked"). Update the test "ignores completions that no longer belong to the catalog" (academy.test.ts:1322).
- Progress: no data migration is needed. 5 indicator keys carry over, everything else is out of the new catalog and not counted. Exams always start fresh. Coins untouched (`lesson_rewards` keyed by lesson_key).
- `attemptStats` / `submittedAttempts` (repository.ts:208-216, 280-291): add `and catalog_version = $3` so old 8-question attempts on `technical:rsi` don't show in the new lesson's best score/history.
- Old open attempts get 409 `CATALOG_VERSION_MISMATCH` from `pinnedAttempt` (742-751); `storedResult` keeps returning stored scores with no review for any non-current catalog. 13ch archived banks become unreachable (lesson ids/keys change) and can be removed together with `content/archive/banks` once the archive check (`content.ts:331-338`) is relaxed.
- Registries: update `technical-registry.json` lesson ids (volume→ch04-l04, ma→ch04-l05, rsi→ch04-l06, macd→ch04-l07, bollinger→ch04-l08, others → `null`), and `fundamental-registry.json` (all → `null` until ch9-14 publish). Make `lesson_id` nullable in `quant/v2/technical-registry.ts:86` and `screener/screener.registry.ts:127` (+ `screener.schemas.ts:158`).
- `academy.legacy-mapping.ts` + `scripts/academy-legacy-mapping-report.ts` + migration-0014 parity test: keep as history or replace with a 13ch→v3.2 key report (5 carried keys).

### 10.10 Staff progress reader
`buildAcademyProgress` (192-296): published chapters only; totals = required lessons (43); `chapter_exams` real; practice row with `optional: true` ("Tự chọn") and not counted in `completed/total/all_done`; `current_lesson` = first `unlocked` and not completed required item from `buildItemStates` (exam label "Bài thi Chương c"); attempts facts SQL add `kind`. Update the closed OpenAPI schema in `member-insights.openapi.ts` (add `kind`, `optional`, exam rows), and `team-lead-team.system.spec.ts` / `team-insights.test.ts` expectations.

### 10.11 Config
No new flag strictly needed (catalog switch is a deploy). Optional: `ACADEMY_SCENARIO_REQUIRED` (default true) only if the owner wants a kill switch; `ACADEMY_ENABLED` unchanged. Chapter publishing stays in content (`published`), not env.

### 10.12 Tests to rewrite/add
- Rewrite `academy.test.ts` catalog/mapping/progress blocks for 14ch/94+1, 5 published chapters, 43 required.
- New: sequence states (new user only ch01-l01; exam after 10 lessons; ch02-l01 after exam 1; practice + ch04-l01 together after exam 3; practice optional; migrated RSI user still locked at ch01-l02 for ch04 items), 403 `ACADEMY_ITEM_LOCKED`, 403 `ACADEMY_SCENARIO_REQUIRED`, scenario insert-once + persistence, notes merge/revision/key whitelist, 2/3 fail 3/3 pass, 4/5 fail, 19/20 fail, 29/30 fail, exam no reward, practice +100 xu but progress unchanged, submit/review responses carry no `correct_option_id`/explanations (deepKeys check as in academy-content.test.ts:338), grants keep pre-v3.2 indicators, stats filtered by catalog, migration 0026 shape (`kind`, score CHECK, new tables).
- Retire/archive `academy-packages.test.ts`, the ch1-4 package parts of `academy-content.test.ts`; move quant worked fixtures out of `content/lessons`.
- `academy-test-kit.ts MemoryAcademy`: add `kind`, scenario and notes stores.
