# Academy v3.2: consumers outside `backend/src/modules/academy`

Scope: every place outside `backend/src/modules/academy` that reads Academy data, plus the academy-owned
types those places depend on (`AcademyGrantsPort`, `AcademyProgressReader`). This was a read-only review; no repo file was changed.

## 0. Two facts that drive the whole migration

1. **Grants are not stored. They are derived from completions in the current catalog.**
   `backend/src/modules/academy/academy-grants.service.ts:15` `capabilitiesFromCompletions(content, completions)`
   looks up each completion's `lesson_key` in `content.lessonsByKey` and returns `lesson.capabilities`
   (`indicator:<id>` / `metric:<id>`). `grantedCapabilities()` (line 33) adds only the legacy `lesson:*` rows from
   `academy_grants` (`academy.repository.ts:355` `legacyLessonCapabilities`, `like 'lesson:%'`).
   => **If a `lesson_key` disappears from the new catalog, every consumer silently loses that grant.** The owner wants existing grants kept,
   so the new catalog must either (a) keep all 16 `technical:<id>` and all 36 old `fundamental:<id>` keys as entries
   (published or not, since `lessonsByKey` ignores `content_status`), or (b) persist a grant snapshot
   (for example, write `indicator:*`/`metric:*` into `academy_grants.capability_ids` at migration time and change
   `legacyLessonCapabilities` so it no longer filters on `like 'lesson:%'`). The spec lists 33 fundamental metrics against the 36 old
   fundamental lessons, so at least 3 `metric:*` keys need (b) or must be kept as hidden entries.
2. **Completions and rewards are keyed by `(user_id, lesson_key)` only. No catalog version is involved.**
   `academy_completions` PK `(user_id, lesson_key)` (migration `0014_academy_catalog_v1.sql:41`), `lesson_rewards`
   PK `(user_id, lesson_key)` (`0015_workspace_shop.sql:81`), ledger unique key
   `lesson_first_completion:<user>:<lesson_key>` (`shop/lesson-reward.service.ts:30`).
   => If ch4 bài 4–8 keep `technical:volume|ma|rsi|macd|bollinger`, spec §5.3-2 (old indicator lessons count as passed)
   and §5.3-3 (no extra xu) work with **zero data migration**. The other side of this: a new lesson that reuses an old key
   (`concept:hop_luu`, `guide:ch02-l01..`, `guide:ch04-l..`, any `technical:*`/`fundamental:*`) is auto-completed
   for old users and pays no xu. New ch1–3 and ch5 lessons and all chapter exams **must use fresh keys**.
   The fresh prefixes must pass the DB CHECKs and regexes listed in §1.6 / §1.7.

Indicators that new users can unlock (spec §4.2): only `volume, ma, rsi, macd, bollinger` (ch4 bài 4–8). The other 11
technical indicators (`ema, ma_cross, dmi, stochastic, cci, obv, mfi, cmf, donchian, roc, williams_r`) and every
`metric:*` stay locked for new users. They stay usable for holders as long as fact 1 holds.

---

## 1. Backend consumers

### 1.1 `ACADEMY_GRANTS` port users (capability gating)

Interface (`academy.ports.ts`): `grantedCapabilities(userId): Promise<ReadonlySet<string>>`. The interface itself needs no change.

| File | Use | Hard-coded copy | Impact |
|---|---|---|---|
| `modules/strategy-config/strategy-config.service.ts:139-158` `technicalRegistry()` | `learned: grants.has(indicatorCapability(entry.id))`, also returns `chapter`, `lesson_id` from the quant registry | — | `chapter`/`lesson_id` come from `quant/v2/registry/technical-registry.json` (see 1.2). They are stale after renumbering. |
| same `:163-200` `current()` | `granted_indicators` = registry ids filtered by grants | — | Bot and mobile read this. If a grant is lost (fact 1), the indicator becomes locked. |
| same `:364-379` `assertLearned` | 403 `CAPABILITY_LOCKED` | `"Cần hoàn thành bài học của chỉ báo ${id} (8/8) trước khi bật."` (:375) | Copy must change: 8/8 is wrong. ch4 quizzes are 5/5. Use "đạt bài kiểm tra". |
| `modules/strategy-backtests/strategy-backtests.service.ts:451-475` `assertIndicatorGrants` | indicator grants per run | `"... (8/8) trước khi chạy backtest."` (:465) | Copy. |
| `modules/strategy-backtests/strategy-backtests.capabilities.ts:13-36` `CAPABILITY_LESSONS` + `findCapabilityLock` | advanced features need legacy `lesson:<legacy id>` (ch02-l14..16, ch16-18 of the 18ch catalog) **and** `STRATEGY_ADVANCED_CAPABILITIES` env allowlist | header comment "13-chapter / 71-lesson" (:6), message "(8/8) của danh mục Học viện cũ" (:75) | Works unchanged as long as `legacyLessonCapabilities` keeps returning `lesson:*` and new catalog lessons never emit `lesson:*`. Only comments and copy change. |
| `modules/alerts/strategy-alerts.service.ts:301-316` | create-alert check | `"... (8/8) trước khi tạo cảnh báo."` (:309) | Copy. Spec §7-8 says ch4 bài 4–8 unlock "Backtest, Bot, Cảnh báo". This already works via `indicator:*`. |
| `modules/alerts/strategy-alerts.evaluator.ts:160-221` | per-run grant cache, skips with `reason: 'capability_locked'` | — | If grants are lost, existing alerts for ema/obv/... stop firing. Fact 1 is required. |
| `modules/practice/practice.service.ts:131-175` `listIndicators` | `granted`, `lesson_key: \`technical:${id}\`` (:152) | — | Assumes the stable key `technical:<id>`, so the new catalog must keep that prefix for indicator lessons. `PRACTICE_INDICATOR_IDS` (`practice.constants.ts:8`) = all 16. New users see 11 locked forever until ch7/8 are published. |
| same `:433-446` | 403 | `"Cần hoàn thành bài học của chỉ báo ${entry.name} (8/8) trước khi luyện tập."` (:441) | Copy. |
| `modules/practice/practice-enabled.guard.ts:15` | follows `ACADEMY_ENABLED` | — | none |
| `modules/screener/screener.service.ts:186-205` `metrics()` | `learned: granted.has('metric:'+id)`, `lesson_id` from `screener/registry/fundamental-registry.json` | — | All 42 metrics are locked for new users (no published chapter grants a metric). The `lesson_id` values (ch03/06/08/09/11/12/13) point at old ids, so they must be renumbered to ch09–14 or nulled. `screener.registry.ts:127` requires `lesson_id` regex `^ch\d{2}-l\d{2}$`, which the new ids still match. |
| same `:323-336` `run()` | 403 `CAPABILITY_LOCKED` for `metric:*` | — | Same. |
| `modules/bots/bot-universe.service.ts:521-530` `assertMetricGrants` | applied screener list needs `metric:*` | — | New users cannot apply a fundamental list to the Bot universe until ch9+ is published. Existing users need fact 1. |
| `modules/bots/bot.service.ts:676-711` `resolveConfig` | `grants = current.granted_indicators.map(indicatorCapability)`. `gateConfigSides(config, grants, registry, ...)` blocks a whole side if an ON indicator is not granted | — | **Highest risk.** A user with EMA ON whose `indicator:ema` disappears gets the buy/sell side blocked and the Bot stops trading. The grants are also frozen into the receipt (`botRuleReceipt(pin, resolution.grants, ...)` :971). |
| `modules/bots/bot.shared-config.ts:43-252, 278-293` | receipt `granted_capabilities` (sorted), `validatePinnedSharedConfig(config, pin, grantedCapabilities)` | — | Receipts are immutable history, so no change. |
| `modules/bots/bot.domain.ts:77-121`, `bot.legacy.ts:50-94` | reason codes `academy_buy`, `waiting_for_academy_conditions`, frozen `iqx-bot-academy-activation-1` | — | Naming only. No change. |

Module wiring that imports `AcademyModule` (no change needed, keep exports `ACADEMY_GRANTS` + `AcademyProgressReader`):
`app.ts:51,97`, `alerts.module.ts:4,26`, `bots.module.ts:4,24`, `practice.module.ts:4,18`, `screener.module.ts:4,14`,
`strategy-backtests.module.ts:4,18`, `strategy-config.module.ts:4,14`, `team-leads.module.ts:4,18`, `users.module.ts:4,12`.
Any new Academy providers (scenario choices, practice notes) stay inside AcademyModule. `ShopModule` is `@Global` and
supplies `LESSON_REWARD_PORT` (`shop.module.ts:10-23`).

### 1.2 Quant technical registry (lesson pointers used by Bot / Backtest / mobile)

`backend/src/modules/quant/v2/registry/technical-registry.json`: 16 entries with `chapter` + `lesson_id`:
rsi 1/ch01-l01, macd 1/ch01-l02, ma 1/ch01-l03, bollinger 1/ch01-l04, volume 1/ch01-l05, ema..cci 5/ch05-l01..05,
obv/mfi/cmf 7/ch07-l01..03, donchian/roc/williams_r 10/ch10-l01..03. Schema `technical-registry.ts:85-86`
(`chapter: int`, `lesson_id: string.min(1)`).
- New values: volume 4/ch04-l04, ma 4/ch04-l05, rsi 4/ch04-l06, macd 4/ch04-l07, bollinger 4/ch04-l08. The other 11
  go to ch07 (4 trend) / ch08 (7 momentum and money flow), with ids still undecided. **Question:** which 4 go to ch7, and which lesson order?
- Test parity: `test/unit/quant-v2-spec-parity.test.ts:99-117` + fixture `test/unit/fixtures/bot-registry-spec-16.json`
  (`lesson_id` / `new_lesson_id`) must be updated.
- Check whether registry content feeds `CALCULATION_VERSION` or any hash. I found no registry hash in bot receipts.
  Changing `chapter`/`lesson_id` alone looks safe, but run the bot/receipt tests.

### 1.3 Shop: `lesson-reward.port.ts` + `lesson-reward.service.ts`

- Port (`platform/ports/lesson-reward.port.ts:9-35`): `LessonRewardInput { userId; lessonKey; lessonId; catalogVersion;
  completionMethod: 'quiz'|'guide'|'legacy_migration'; completedAt }` → `LessonRewardResult = credited{delta,balanceAfter,ledgerEntryId} | already_rewarded{balanceAfter}`.
- `LESSON_REWARD_XU = 100` (`shop.catalog.ts:12`), `COIN_POLICY_VERSION = 'iqx-shop-xu-v1'`. The spec keeps +100 per lesson. No "6200" constant exists in code. The 6.200 xu only appears in product copy.
- **Breaks:**
  - `LESSON_KEY` regex (`lesson-reward.service.ts:14`) `^(technical|fundamental|concept|guide):...` throws `TypeError` for any new
    prefix. Extend it in step with the DB CHECK on `academy_completions` (0014:44), or reuse `concept:`/`guide:` with fresh slugs.
  - Chapter exams must **never** call `creditFirstCompletion` (spec §4.3: 0 xu). This is enforced on the academy side. I recommend
    also rejecting exam-kind keys in `assertValidInput` (for example an `exam:` prefix) as defense in depth.
  - Phòng tập thực chiến = `kind lesson, optional:true`. It gets +100, which the existing flow already handles.
  - §5.3 migration completions must not be paid. Do not add them to `REWARD_COMPLETION_METHODS` (:17). Use a new method
    such as `catalog_migration` (requires migrating `ck_academy_completions_method`, `ck_academy_completions_evidence`). If keys
    are kept stable (fact 2), no new completion rows are needed at all.
- `backend/scripts/shop-reward-backfill.ts:30-41`: `STABLE_LESSON_KEY` is the same regex copy. `isRewardableMethod` pays
  `quiz|guide|legacy_migration` for any completion without a reward row. **A chapter-exam completion stored with method `quiz`
  would be paid by this backfill.** Add a kind/prefix exclusion here too.
- Tests with numbers: `test/unit/shop-purchase.test.ts:453-462` ("71 rewards ... 7,100 earned") is a fixture count only, so it is fine to keep or rename.

### 1.4 Team leads (`modules/team-leads/*`)

- `team.service.ts:5-7,42,107,196,239-258`: `AcademyProgressReader.summaries(ids)` → `TeamUserItem.academy: AcademyProgressSummary`.
  Sort `academy_progress` = `item.academy.completed` (:196, in memory).
- `team.schemas.ts:15` sort enum includes `academy_progress`. No change.
- `team.openapi.ts:4,60` uses `ACADEMY_SUMMARY_SCHEMA` from `users/member-insights.openapi.ts`.
- There is no literal 71 here. `total` is computed by the reader as **all published lessons**, so with v3.2 it would be 44 (it includes the optional
  Phòng tập). It must count only required published lessons, which gives 43. `completed` must likewise exclude the optional lesson and exams.
  Sorting by `completed` is then fine.
- `current_lesson` semantics change (reader, academy-owned): it should be the first **unlocked** not-passed item in the sequential
  chain, which can be a chapter exam ("Bài thi Chương c"). The current reader picks "most recent open attempt else first
  incomplete", which can point at a locked lesson (for example an old user with `technical:rsi` done but ch1 not done).

### 1.5 Admin user 360 (`modules/users/*`)

- `admin-users.service.ts:10-12,57,165-201`: `academy: AcademyProgressDetail` from `AcademyProgressReader.detail(userId)`.
- `member-insights.openapi.ts:74-139` (all `closedObject`, `additionalProperties:false`):
  - `ACADEMY_SUMMARY_SCHEMA {started, completed, total, all_done, current_lesson: {lesson_id, chapter, order, name, label}|null}`
  - `ACADEMY_DETAIL_SCHEMA` adds `catalog_version, chapter_exams{total,passed}, last_completion, learning_coins, chapters[{no,title,total,completed,lessons[{lesson_id,order,name,kind,completion_mode,status,attempts,latest_score,max_score,completed_at,is_current}]}]`.
  - **Breaks:** `kind` enum `['technical','fundamental','concept','guide']` and `completion_mode` enum `['quiz','guide']`.
    New kinds or optional/exam rows violate the closed schema, so the schema must be extended. Proposed additions:
    ```ts
    lessons[i]: { ...; kind: 'lesson' | 'chapter_exam' | <old kinds>; optional: boolean; unlocked: boolean;
                  max_score: 3 | 5 | 20 | 30 | null }        // per item, not QUESTIONS_PER_LESSON
    current_lesson: { ...; item_kind: 'lesson' | 'chapter_exam' }  // label "Bài thi Chương c" / "Chương 3 · Phòng tập thực chiến"
    chapter_exams: { total: number /* published chapters = 5 */, passed: number }
    ```
  - `max_score` is currently `QUESTIONS_PER_LESSON` (8) in `academy-progress-reader.service.ts:289`. It must become 3 for ch1–3 and 5 for ch4–5.
  - `chapter_exams` is hard-coded `{ total: 0, passed: 0 }` (reader :241). It must count published exams and passed exams.
- `platform/openapi/enrich-openapi.ts:20,910-926`: `addFields('Legacy_User360Response', USER_INSIGHT_PROPERTIES)`. Picks up schema
  changes automatically. Then run `backend npm run contracts:generate` (which regenerates `frontend/src/lib/generated/backend-v2.ts` +
  `operation-map.ts`) and `frontend npm run contracts:check`.
- Tests: `test/unit/team-insights.test.ts:13-125` (uses the real catalog, `ch01-l06`, chapter 13, `chapter_exams {0,0}`, scores
  `7` of 8), `test/system/team-lead-team.system.spec.ts:194,417,516-517` (`ch01-l01..03`, "6/8", `chapter_exams {0,0}`).

### 1.6 DB constraints that consumers depend on

- `academy_completions.ck_academy_completions_key` `^(technical|fundamental|concept|guide):[a-z0-9_-]+$` (0014:44)
- `academy_completions.ck_academy_completions_method` / `_evidence` (0014:45-51)
- `lesson_rewards.ck_lesson_rewards_method` `quiz|guide|legacy_migration` (0020:8-10)
- `coin_ledger.ck_coin_ledger_kind` `lesson_first_completion|mascot_purchase|adjustment` (0015:39). No change needed.

### 1.7 Config

`platform/config/environment.ts:204-215`: `ACADEMY_ENABLED` (default true), `STRATEGY_ADVANCED_CAPABILITIES`. No change.
A new flag is optional (for example `ACADEMY_V32_ENABLED`) if a staged cutover is wanted.

### 1.8 Scripts

- `backend/scripts/academy-legacy-mapping-report.ts` (222 lines): a read-only dry run of the **18ch→13ch** backfill (migration 0014),
  built on `academy.legacy-mapping.ts` `legacyMappingRows(loadAcademyContent())` (from `content.lessonsByLegacyId`) and
  `content/legacy/removed-lessons.json`. Once `loadAcademyContent()` serves the 14ch catalog, `lessonsByLegacyId`
  and the `legacy_lesson_id` mapping lose their meaning, and `parseMigrationMapping` vs 0014 parity tests fail.
  Recommendation: freeze it (pin it to an archived 13ch catalog file, or delete it with its test), and add a new
  `academy-v32-migration-report.ts` that counts, per user, old completions by key: {kept-as-is (the 5 ch4 keys), kept
  hidden (11 technical + metrics in unpublished chapters), orphaned (concept:hop_luu, guide:*, dropped metrics)}, plus
  grants that would be lost under fact 1.
- `backend/scripts/academy-import/*` (≈4.9k lines: `extract.ts`, `gates.ts`, `verify.ts`, `blocks.ts`, `ch1-math.ts`,
  `canonical.ts`, `sanitize-allow.ts`, `paths.ts`, `webp.ts`, README): a deterministic extractor for the **old ch1–4 HTML
  handoffs**, with hard SHA-256 gates (`gates.ts`) and fixed counts (`verify.ts:153,185` 24 sections, `:244` "16 indicators",
  `:405`, `:467` 13 data-chart, `:579` 8 questions per lesson, `:629` [10,8,1] figures). It cannot ingest the v3.2 MAU and
  is not needed for typed-block authoring. Keep it only for the archived packages, or retire it together with
  `test/unit/academy-packages.test.ts` (imports at lines 30-67) and `content/packages/ch01..ch04`. `canonical.ts`
  (`stableStringify`, `canonicalPlainHash`) and the `package.schema.ts` block types are reusable for a new authoring/verify step.
- `backend/scripts/copy-assets.ts:9` copies `src/modules/academy/content`, so any new content dir must sit under it.

---

## 2. Frontend consumers (outside `frontend/src/pages/academy`)

| File | Use | Hard-coded | Must change |
|---|---|---|---|
| `pages/admin/core/api.ts:327-370, 513-560` `adaptAcademyProgress` | maps the wire `academy` to `AcademyProgress` | `completionMode: "quiz"\|"guide"` | Add `kind`/`optional`/item type (exam), regenerate types. |
| `pages/admin/core/components/user-academy-tab.tsx:40-130` | KPI `completed/total`, exam KPI only when `chapterExams.total>0`, per-chapter table "Bài n: name", "Số lần làm bài" only for quiz | — | Add exam row per chapter ("Bài thi Chương c", n/20 or n/30), "Tự chọn" tag for Phòng tập (spec §5.2), and optionally a locked status. "x/43" needs no code change once the reader excludes the optional lesson. |
| `pages/admin/core/components/user-360-body.tsx:224,268` | tab wiring | — | none |
| `pages/admin/team/api.ts:53-76,114-119` `TeamAcademySummary` | `started, allDone, completed, total, currentLessonLabel` | — | none (label comes from the server) |
| `pages/admin/team/team-cells.tsx:19-35` `AcademyProgressCell` | "x/y bài" + current label | — | none. The spec column "bài đang học và x / 43" is already satisfied when the server sends 43 |
| `pages/admin/team/labels.ts:15-16` | "Chưa bắt đầu", "Đã hoàn thành các chương hiện có" | — | none |
| Admin global users list (`pages/admin/core`) | **no Academy column exists** | — | Only the team list has it. Ask whether admin needs it too. |
| `pages/demo-trading/shop/shop-api.ts:128-146` | `GET /academy/progress` → `course_done`, `course_total`; `GET /academy/catalog` → names by `lesson_key` and `id` | — | `course_done` counted on the new catalog drops for old users (only 5 ch4 keys survive) while xu stays. Ledger rows for orphaned/unpublished keys (`concept:hop_luu`, `guide:*`, `technical:ema` ...) lose their names, because the catalog API returns published chapters only. Fallback shows the raw id (`shop-model.ts:125-131`). Consider a small `lesson_key → name` archive map or a server-side label in the ledger `ref`. |
| `pages/demo-trading/shop/shop-panel.tsx:53-55,126-127` | "N bài đã hoàn thành", "+100 xu" | — | none |
| `pages/demo-trading/shop/shop-test-support.ts:166` | `course_total: 71` | 71 | Update the fixture to 43. |
| `pages/demo-trading/practice/practice-api.ts:105-128` `PRACTICE_INDICATORS` | indicator → lesson id for "học bài" links | rsi ch01-l01 … williams_r ch10-l03 (all old ids) | Remap to ch04-l04..08 for the 5. For the other 11 the lessons are unpublished, so show "Chưa phát hành" instead of a link (a link to an unpublished id would 404). Better: drive it from the registry `lesson_id` plus a published flag. |
| `pages/demo-trading/practice/practice-failure.tsx:41` | copy | "(đúng 8/8 câu)" | Copy. |
| `pages/demo-trading/bot/navigation.ts:4-14` `CHAPTER_TITLES` | Bot panel chapter headers | `{1:"Chỉ báo kỹ thuật nền tảng",5:...,7:...,10:...}` + comment "13ch-71lessons" | New: `{4:"Phương pháp kỹ thuật",7:"Chỉ báo xu hướng",8:"Chỉ báo động lượng và dòng tiền"}`. |
| `pages/demo-trading/bot/panel/bot-panel.tsx:105-125`, `indicator-row.tsx:67` | group by `indicator.chapter`, "Xem bài" → `lessonSearch(indicator.lesson_id)` | "16 chỉ báo của Bot" | Hide or disable "Xem bài" for indicators whose lesson is unpublished. |
| `pages/demo-trading/bot/config/api.ts:120-125` | locked copy | "Hoàn thành bài kiểm tra 8/8 …" | Copy. |
| `pages/demo-trading/bot/config/use-bot-config.ts:28` | comment "quiz 8/8" | — | Comment only. |
| `pages/strategy/shared/indicators.ts:1-43` | `TECHNICAL_INDICATOR_IDS` (16), `CHAPTER_TITLES` (same 1/5/7/10) | comment "13ch-71lessons" | Update titles. The 16 ids stay. Used by `strategy/backtest/library.tsx`, `backtest-tab.tsx`. |
| `pages/strategy/shared/errors.ts:10` | comment "lesson quiz 8/8" | — | Comment only. |
| `pages/strategy/filter/definition.ts:42,121`, `catalog-dialog.tsx:8,39`, `metric-library.tsx:32-54` | `learned`, `metricChapter(lesson_id)`, "Chưa mở · học bài ch03-l01" | — | Renumbered `lesson_id` (ch09–14) flows through. The copy "học bài <id>" should say "Chưa phát hành" for unpublished chapters, which is all of them now. |
| `config/chrome.ts:26-74`, `components/layout/header.tsx:92,151`, `App.tsx:119-120`, `pages/demo-trading/academy-redirect.tsx`, `workspace-url.ts:5-81`, `workspace-sections.ts:10`, `demo-trading-page.tsx:14-195` | routing `?view=academy&lesson=<id>`, `LESSON_ID` regex `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$` | — | none. Old bookmarked ids (`ch01-l01` = RSI before, "Đầu tư chứng khoán" now) will silently open a different lesson. Optional: redirect old→new for the 5 indicator ids. |
| `pages/about/about-content.ts:43` | "7-step learning journey (Level 0 to Level 6)" | — | Stale product copy. Optional update ("14 chương"). |
| `pages/introduction/introduction-page.tsx:26` | link only | — | none |
| `lib/generated/backend-v2.ts`, `operation-map.ts:20-25,282-284,409` | generated academy ops | — | Regenerate after the schema changes. New ops (scenario choice, practice notes, exam attempts) appear here. |

---

## 3. Mobile (`mobile/`)

No Academy screens or API calls. Indirect consumers only:
- `mobile/src/features/strategy/config/model.ts:25-30` `CHAPTER_TITLES {1,5,7,10}` (same stale titles), `:32`
  `LOCKED_MESSAGE = 'Hoàn thành bài kiểm tra 8/8 của chỉ báo này để bật.'`, `:222-235` `groupByChapter`, `isLearned`
  (`ind.learned || saved.granted_indicators.includes(id)`).
- `indicator-card.tsx:79` "Mở khóa qua Academy trên web."
- `library-screen.tsx:110,177` groups by registry `chapter`.
- `features/shop/api.ts:34` ledger label `lesson_key/lesson_id`.
The mobile app was paused (memory). Update the titles and 8/8 copy when it resumes. Server-driven `chapter` flows automatically.

---

## 4. Hard-coded numbers and where they live (outside the academy module)

| Literal | Location |
|---|---|
| `(8/8)` in API error copy | strategy-config.service.ts:375, strategy-backtests.service.ts:465, strategy-backtests.capabilities.ts:4,75, strategy-alerts.service.ts:309, practice.service.ts:441 |
| `8/8` in UI copy | frontend bot/config/api.ts:120,125; practice-failure.tsx:41; mobile model.ts:32 |
| `71` / "13-chapter / 71-lesson" | strategy-backtests.capabilities.ts:6 (comment); frontend bot/navigation.ts:4, strategy/shared/indicators.ts:2 (comments); shop-test-support.ts:166 `course_total: 71`; backend test shop-purchase.test.ts:453-462 |
| Chapter-title maps {1,5,7,10} | frontend bot/navigation.ts:5, strategy/shared/indicators.ts:34, mobile model.ts:25 |
| Old lesson ids per indicator | quant technical-registry.json (16), screener fundamental-registry.json (42 metrics), frontend practice-api.ts:106-122, test fixture bot-registry-spec-16.json |
| `max_score` 8 | academy-progress-reader.service.ts:289 via `QUESTIONS_PER_LESSON` (exposed to admin/team) |
| `chapter_exams {0,0}` | academy-progress-reader.service.ts:241; tests team-insights.test.ts:48, team-lead-team.system.spec.ts:516 |
| 6200 / 6.200 xu | **not in code** (only product copy). +100 = `LESSON_REWARD_XU`, unchanged |
| 13 chapters | only in academy module and frontend academy page (other agent's area) |

---

## 5. Recommended consumer-side change list (ordered)

1. Decide grant persistence (fact 1). Safest: keep every old `technical:*` / `fundamental:*` key as a catalog entry in its
   new (unpublished) chapter, and snapshot any key that will not exist into `academy_grants.capability_ids` with a widened
   `legacyLessonCapabilities` query (`like any (array['lesson:%','indicator:%','metric:%'])`). Add a test proving that a user with
   completions for all 71 old keys has the same `grantedCapabilities()` before and after the catalog swap.
2. Fresh key prefixes for new lessons and exams. Widen the DB CHECKs (0014:44 + new migration), `LESSON_KEY` in lesson-reward.service.ts:14,
   and `STABLE_LESSON_KEY` in shop-reward-backfill.ts:31. Exclude exams from rewards in both service and backfill.
3. Reader (`AcademyProgressReader`, exported to team/admin): required-only `total` (43), exams counted, `optional` flag,
   per-item `max_score`, sequential `current_lesson`. Extend the closed OpenAPI schemas in member-insights.openapi.ts, then regenerate contracts.
4. Renumber `chapter`/`lesson_id` in technical-registry.json (5 ch4 now, 11 ch7/8 later) and fundamental-registry.json (ch9–14),
   plus the parity fixture.
5. Copy sweep "8/8" → "đạt bài kiểm tra" (6 backend, 3 frontend, 1 mobile). Chapter-title maps (3 places).
6. UI: hide "Xem bài"/"học bài <id>" links for unpublished lessons (bot panel, practice failure, filter catalog dialog).
   Admin tab: exam rows + "Tự chọn". Shop: legacy lesson-name fallback.
7. Retire or freeze `academy-legacy-mapping-report.ts` and `academy-import/*` (+ `academy-packages.test.ts`). Add a v3.2 migration dry-run report.

## 6. Open questions for the owner

- Spec §4.2: "Từ Chương 7 mỗi bài mở 1 chỉ báo (Backtest)" vs ch4: "Bot, Backtest, Cảnh báo". Should ch7/8 indicators be
  Backtest-only (a new capability split, for example `indicator:<id>` vs `backtest-indicator:<id>`) or the same `indicator:*` for all tools as today?
- Which 3 of the 36 old fundamental metrics leave the catalog (33 in spec), and do holders keep them in the screener?
- Should old users who passed `concept:hop_luu` / old `guide:*` lessons get anything, or are those completions just orphaned (xu kept)?
- Naming clash: the spec's "Phòng tập thực chiến" (optional Academy lesson) vs the existing Bot "practice" module
  (`/api/v2/practice`, `PRACTICE_*`). Keep the code names distinct (for example `academy practice lesson` key `concept:phong_tap`).
- Should the admin global users list get an Academy column (currently only the team list has one)?
