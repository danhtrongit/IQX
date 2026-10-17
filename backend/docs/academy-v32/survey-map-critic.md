# Critic pass: Học viện v3.2 maps (backend, frontend, consumers, mockup-structure, mockup-charts)

Read-only review. Inputs: the spec (`scratchpad/src/IQX-Hoc-Vien-SPEC.md`), the five `map-*.md` reports, and spot-checks against the repo on `feat/academy-v32` @ d145fd5d and against `scratchpad/src/IQX-Hoc-Vien-MAU.html` / `scratchpad/it.json`.

Overall: the five reports cover the code surface well. The serious problems are (a) **contradictions between reports on contract shapes**, which must be settled before anyone writes a schema, (b) **one wrong count that changes the grants plan** (42 metrics, not 36), and (c) **content-production risk**: nobody has planned how ~300 sections and 129 figures get from the mockup into typed JSON, or how that work gets reviewed.

---

## 1. Spot-check results (verified or corrected)

| Claim | Report | Verdict | Evidence |
|---|---|---|---|
| Old catalog binds 16 technical + **42** fundamental, plus 12 guide + 1 concept | backend §1 | **Correct** | `catalog.v1.json` counts: fundamental 42, technical 16, guide 12, concept 1. `fundamental-registry.json` has 42 entries |
| "36 old fundamental lessons", "at least 3 `metric:*` keys" leave | consumers §0 fact 1, §6 | **Wrong** | 42 old metrics against the spec's 33 means **9 or more** `metric:*` keys have no v3.2 home (more if the 33 are not a subset of the 42) |
| `chapter_exams {0,0}` hard-coded at reader `:241` | consumers §1.5, §4 | Line is wrong | `academy-progress-reader.service.ts:255` (backend's 255 is correct) |
| `max_score` at reader `:283` | backend §10.3 | Line is wrong | `:289` `max_score: quiz ? QUESTIONS_PER_LESSON : null` (consumers' 289 is correct) |
| Ch2 exam already holds the 4 replacement questions (spec §3.4 v3.2) | not checked by any report | **Verified** | `it.json` ch2 exam contains the prompts on savings maturing (Bài 2), "về bàn với vợ" (Bài 7), margin call (Bài 9) and an unverified rumour (Bài 10) |
| Bank: 280 questions, all with 3 options, no repeated prompts | mockup-structure §1 | **Verified** | 280×3 options; 0 duplicate prompts across items |
| "13 chương · 71 bài học" only in the academy panel and guest test | frontend §1.11/§1.13 | **Incomplete** | Also `frontend/src/pages/demo-trading/demo-trading-page.test.tsx:179,244` and `docs/UX_UI_AUDIT_REPORT.md:107` |
| `no-config-controls.test.ts` bans `/practice` imports and the text "Luyện tập" | frontend §1.13 | **Verified** | lines 19 and 25. The mockup has 0 occurrences of "Luyện tập", so ported copy is safe |
| technical registry fields | consumers §1.2 | Incomplete | Each entry also has `legacy_chapter` and `legacy_lesson_id` (`technical-registry.json:7-8`). Decide whether to rewrite them or leave them as 18ch history |
| Chart count "~45 ch1, 7 ch2, rest ch4" | frontend §3.6 | Imprecise | mockup-charts: 46 Ch1, 7 Ch2, 0 Ch3, 55 Ch4, **21 Ch5** = 129 |
| Dash rule | not raised for content | **New conflict** | `frontend/AGENTS.md:209` bans visible en/em dashes. Mockup prose has **42 en dashes** (for example "2015–2025", "36–47", "vài tuần – vài tháng"), and the spec itself uses ranges such as "Chương 1–5" |
| Admin support actions in spec-admin §4.3 (`academy.attempt.reset`, `academy.completion.grant`) | none | Not implemented | grep in `backend/src` finds nothing. Raise only as a future interaction with sequential locks |

---

## 2. Contradictions between reports (one answer needed for each before design)

| # | Topic | Report A | Report B | Recommendation |
|---|---|---|---|---|
| C1 | **Where the scenario lives** | backend §10.2: a lesson **field** `scenario {prompt, options[3], answer, explanation, version}` (matches spec §5.1) | frontend §3.5 and mockup-structure §3.2: a **block** `{type:'scenario', ...}` placed inside the "Thực chiến" section | Author it as a block, because the mockup puts it mid-lesson. The content loader validates exactly one scenario block per ch2/ch3 lesson (none elsewhere), derives `lesson.has_scenario` and `scenario_version`, and grades against that. The spec's `scenario` field becomes a derived property. |
| C2 | **Chart computation** (owner said "React charts") | backend §10.2: `{kind:'component', component, props}` and "formulas run client-side" | frontend §3.6 and mockup-charts §3: **precompute** at import (port the mockup PRNG/indicator helpers verbatim), ship numbers, and have React renderers only draw | Precompute. It keeps "bảng số liệu" tables, golden tests (k=119, e=124, …) and server truth consistent, and it matches the existing `series_panels` pipeline. The owner's "React charts" is met by React/SVG renderers, as opposed to an HTML snapshot. **Confirm with the owner** that this is what they meant. |
| C3 | **Item state names** | backend §10.6 `completed / unlocked / locked` | frontend §3.1 `passed / open / locked` | Pick one enum for OpenAPI. Suggest `passed / open / locked`, which reads like the UI copy. |
| C4 | **Scenario endpoint** | backend: `PUT lessons/:id/scenario`; a second different choice returns the first one **or** 409 `SCENARIO_ALREADY_CHOSEN` | frontend: `POST …/scenario`; 409 `ACADEMY_SCENARIO_ALREADY_CHOSEN` carries the stored choice | `POST`, insert-once, **200 with the stored row** when one exists (idempotent, no error path in the UI). |
| C5 | **Practice notes shape** | backend: `{pads, checks, revision}`, 64 KB cap | frontend: `{texts, checks, scores, revision, updated_at}` (roleplay persisted) | Decide whether roleplay sliders are persisted (the mockup does not persist them). If yes, add `scores: Record<key, number[6]>` to the table and the API. |
| C6 | **Lesson-key strategy** | backend §10.5: new prefixes `sales:`, `brand:`, `practice:`, `exam:`, `guide:v3-…`, which widens 4 regexes and 1 DB CHECK | consumers §1.3: alternatively reuse `concept:`/`guide:` with fresh slugs | Either works. Fewest changes: `concept:<slug>` for every non-indicator lesson, including SACO, brand and practice (avoiding `concept:hop_luu`), plus `exam:chNN`. Only `exam:` widens the CHECK, and it stays **outside** Shop `LESSON_KEY` as a defence. |
| C7 | **Keeping grants** | consumers §5-1: keep every old `technical:*`/`fundamental:*` key as a hidden catalog entry **and/or** snapshot into `academy_grants.capability_ids` with a widened `legacyLessonCapabilities` (`repository.ts:355`) | backend §10.9: derive the capability from the key prefix for completions outside the current catalog, gated by cutover date or catalog version | Backend's derivation is simpler and needs no catalog entries for ch7-14. Snapshotting is safer if keys are ever renamed. Pick one and add the "same `grantedCapabilities()` before and after the swap" test from consumers §5-1 either way. |
| C8 | **Unlock rule for migrated users** | backend §10.6: **prefix** rule (every earlier required item done) | spec §4.1/§5.2 and mockup `REQ[]`: **previous required item** only | These differ only for migrated users, where the literal rule lets an RSI holder open ch04-l07 MACD at once, which contradicts §5.3-2. Ask the owner (Q7). |
| C9 | **Locked `GET lessons/:id`** | backend: recommend 403 `ACADEMY_ITEM_LOCKED` | frontend: reader shows "Bài này chưa mở" on 403 | Agreed in practice, but the spec only mandates 403 for attempts. Confirm that the **content** of locked lessons is hidden too. It matters for ch2-3, whose scenario answers ship in the lesson payload. |
| C10 | **Review/history after submit** | backend §10.8: `results: []` or drop `GET attempts/:id` | frontend §4-3: drop history and best score, or keep score-only rows | Keep score-only history (`score/total/passed/submitted_at`). Remove `results`, `correct_option_id` and explanations from **every** response, including legacy `attemptReview`, for v3.2 attempts. |

---

## 3. Gaps no report covers

### 3.1 Content production (largest schedule risk)
- **Volume:** 43 lessons + practice, about 296 sections, about 44 summaries, 129 figures, 22 pads, 13 checklists, 19 scenarios, 4 cases, and 280 questions. No report says **how** the MAU becomes `lessons.vi.json`. The options are: (a) a one-off DOM extractor `scripts/academy-v32-import/*` with a source SHA gate (like `academy-import/gates.ts`) plus manual fix-ups, or (b) hand authoring. Option (a) is the only realistic one for ~566 KB. Decide it, and decide who signs off on the result (content QA).
- **Source of truth after import:** when the owner revises the mockup (the spec already cites a different filename, `IQX-Hoc-Vien-v3-MAU.html`), do we re-run the extractor or edit the JSON? Re-running needs a deterministic importer and a source hash in `import-manifest.json`.
- **One block union.** mockup-structure §3.3 proposes about 23 types (`workpad`, `checklist{mode}`, `practiceCase`, `roleplayScore`, `definitions`, `stats`, `gauges`, `featureRows`, `chartGrid`, `objection`, `samplePost`, `funnel`, …). frontend §3.5 proposes different names (`worksheet`, `todo`, `self_check`, `client_case`, `roleplay_score`, `dialogue`). backend §10.2 proposes yet others (`pad`, `audit`, `client_profiles`). The existing reader blocks are `html/table/chart/image/steps/callout/details`. Someone must write the canonical zod union once (backend `package.schema.ts` successor). It should feed OpenAPI, not three hand-written lists.
- **Inline rich text format:** frontend uses sanitized HTML strings (`sanitize.ts` allowlist), while mockup-structure proposes `Rich = '**bold**' + [tone]{text}`. Recommendation: reuse sanitized inline HTML with an allowlisted `class="tone-up|tone-down|tone-warn|tone-info"`, which needs no new parser. Map the 31 inline `style="color:#…"` occurrences to those classes in the importer.
- **Copy rules that clash with the mockup text:** 42 en dashes (AGENTS rule), the "✓" glyph in spec labels (use Lucide `Check`), and "Phần bạn viết được lưu trên trình duyệt này" (6×, wrong once notes are per-account). Spec §2.2 bans questions in content outside ch2-3. The mockup prose has 96 "?", mostly expected in ch2-3, but ch1/4/5 should be scanned in the importer.
- **Section nav:** v3.2 lessons have 5–12 sections, while `nav_labels` is a 4-tuple (`package.schema.ts:225-254`). Decide whether to drop the pills or derive them from section titles.

### 3.2 Catalog beyond chapter 5
- The spec's `Hoc-vien/IQX-Hoc-Vien-Danh-Muc-v3.md` (lesson lists for ch6-14) is **not in the repo or the download**. So we do not know: the ch6-14 lesson titles, which 4 of the 11 indicators go to ch7 and which 7 to ch8, or which 33 metrics survive out of 42. backend §10.1 wants `ACADEMY_LESSON_COUNT=94` with all metadata, which cannot be written without that file. **Recommendation:** ship v3.2 with full entries for ch1-5 only, and stubs `{no, title, lesson_count, published:false}` for ch6-14. Validate 94 as the sum of `lesson_count`. This also means the grants plan must not depend on ch7-14 catalog entries (see C7).
- Future reuse: when ch7/8 publish, should their lessons reuse `technical:ema` and the other old keys? If yes, old holders get those lessons auto-passed without xu, which matches the §5.3 logic. Decide now, because it fixes the key convention.

### 3.3 Product effects nobody flagged
- **New users lose the whole Bộ lọc and fundamental Bot universe** until ch9 ships, because no published lesson grants any `metric:*` (`screener.service.ts:323`, `bot-universe.service.ts:521`). Today a new user can learn their way to metrics via old ch3. Also, 11 of 16 Bot indicators become unreachable for new users. The owner already chose "stay locked", but should confirm they know the Filter tool is **entirely** dead for new users.
- **Migrated progress display:** an old RSI holder starts at "5 / 43" with ch04-l04..l08 showing "Xem lại" while ch01-l01 is the only open item. Is that the intended look (spec §7-1 "Tiến độ x / 43 khớp với số bài đã đạt")?
- **Shop "N bài đã hoàn thành"** (`shop-api.ts:128`) drops from up to 71 to at most 5 for old users while the coin balance stays. Expect support questions; consider a note.
- **Old deep links and bookmarks:** `ch01-l01` was RSI and becomes "Đầu tư chứng khoán". `academy_completions.lesson_id` and `lesson_rewards.lesson_id` hold old ids with old meanings, so any code that joins on `lesson_id` instead of `lesson_key` (the shop name lookup in `shop-api.ts:146`, the admin reader) mislabels history.
- **Old attempts:** `attemptStats`/`submittedAttempts` lack a catalog filter (backend §5). The admin reader's attempts SQL **filters** by current catalog, so all old attempt counts vanish from admin views after the cutover. Decide whether admins need a "lịch sử danh mục cũ" view.

### 3.4 Rollout and rollback
- No report plans the cutover: deploy order (migration 0026 → backend → contracts → frontend, all in one release because `contracts:check` pins the snapshot), whether a flag such as `ACADEMY_V32_ENABLED` is wanted, and maintenance messaging. Open attempts in flight get 409 `CATALOG_VERSION_MISMATCH`, and sessionStorage attempt keys (`view-state.ts saveAttemptKey`) must be dropped.
- **Rollback:** after v3.2 writes `exam:*`/new-key completions and scores up to 30, the 13ch code must still boot and answer. `catalogFileSchema` ignores unknown keys at read time, but `total: z.literal(8)` in history/submit responses would reject exam attempts if a v3.2 attempt is ever replayed. Add a pre-deploy note: rollback only together with a forward fix, or keep the schemas lenient.
- Prod data dry-run: the v3.2 migration report (consumers §1.8) should run on a VPS DB copy **before** deploy, to count users who lose or keep grants and to measure the size of the "5/43" effect.

### 3.5 Smaller holes
- Exam question ids: `PrivateQuestion` id regex `^ch\d{2}-l\d{2}-q\d{2}$`, `section 1..4` required, **4 options**, `explanation` required (`package.schema.ts:414-447`). The IT data has 3 options, no section, no explanation and no ids. The new bank format must relax all four, and exam ids `ch01-exam-q01..q30` need their own pattern.
- Correct index is 0 for 271/280 questions. Server shuffle is mandatory, and a test must prove that the projected option order differs from the source order. Never serialize source order.
- `academy_attempts.score` CHECK 0..8 (inline, `academy_attempts_score_check`) blocks every exam submit. Draft `answers max 64` is fine for 30.
- Spec §3.2-1: dots plus "Câu i/N", no back button. Resume semantics with server drafts: start at the first unanswered question (frontend says this). Confirm that a resumed 30-question exam keeps the earlier picks.
- Exam intro data source: static copy per spec §3.3 (3 variants). Serve it from the catalog (`exam.intro`) or from the frontend copy map? Choose one.
- `GET lessons/:id` for an exam or practice id: the reader route regex `navigation.ts:7` and the backend param `schemas.ts:6` both need the new id pattern, and they must agree (`ch01-exam`, `ch03-practice`).
- Light theme: the spec's "no grey" values `#dbe7f3`/`#c9d6e4` are dark-only. The light value of a `--academy-subtle` token is undefined (frontend §1.12 raises this; DESIGN.md needs a documented exception).
- Spec §5.2 references "spec quản trị v1.1 §5.1.4" (admin Học viện tab). The repo has `spec-admin.md` (v1.0 wording, §4.3), and the v1.1 document is not in the repo, so the exact admin columns cannot be checked.
- Admin **global** users list has no Academy column (consumers and frontend). The spec §6 row "Cột 'Học viện' ở danh sách người dùng: bài đang học và x / 43" is ambiguous about whether that covers the admin list.
- Income calculator policy numbers (0,15%, 70%) are a pending [DECISION] in the spec. Put them in content (not code) so a change is a content edit.

---

## 4. Questions to resolve before design

**Owner (product) questions, which block contract design:**
1. **Charts (C2):** does "React charts" accept precomputed data drawn by React/SVG components? Recommend yes.
2. **Danh mục v3:** provide `IQX-Hoc-Vien-Danh-Muc-v3.md`, or accept ch6-14 as stubs (title + count) in this release.
3. **Metrics:** which 9+ of the 42 old metrics disappear, and do current holders keep them in Bộ lọc and the Bot universe? (Default from the owner decision is keep.)
4. **Notes persistence:** pads, todos and checklists per account (the owner already said yes). Are **roleplay scores** persisted too? Is the income calculator stored? (Mockup: neither.)
5. **Locked content:** may a learner open (read-only) a locked lesson? The spec says locked rows cannot be clicked. Recommend 403 on content.
6. **Review history:** keep score-only attempt history rows ("Lần 2 · 2/3 · Chưa đạt"), or show nothing?
7. **Migrated users (C8):** when an old RSI holder finishes ch1-3, should ch04-l04..l08 be passed (5/43 from day one)? And may they open RSI out of order to review it now? Is the prefix rule acceptable?
8. **Quiz back button:** confirm "no back" (mockup) for 3/5-question quizzes and also for 30-question exams.
9. **Admin list column:** does the admin global users list need the "Học viện x / 43" column, or only the team list?
10. **Old ledger names:** show retired lesson names in the coin history? This needs a small `lesson_key → name` archive.
11. **Dash and glyph rules:** may the importer normalise "–" ranges to "đến" or "-", and "✓" to an icon, overriding the mockup text?
12. **Cutover:** a hard switch at deploy, or behind a flag for a staging period?

**Implementer decisions, with recommendations:**
- C1 scenario as a block with a derived field. C3 state enum `passed|open|locked`. C4 `POST` insert-once returning the stored row. C6 `concept:<slug>` plus `exam:chNN`. C7 key-prefix derivation plus a parity test. C10 score-only responses.
- Item ids `chNN-lMM`, `chNN-exam`, `ch03-practice`. URL param stays `lesson`.
- One canonical zod block union in backend, emitted through OpenAPI. Frontend renderers follow the generated types.
- Importer: `backend/scripts/academy-v32-import/` (DOM extract plus ported mockup math, source SHA gate, golden values from mockup-charts §3), output under `src/modules/academy/content/v3/` (copied by `scripts/copy-assets.ts:9`).
- Retire `academy-import/*`, `content/packages`, `content/lessons/*` and `academy-packages.test.ts` only after moving the quant fixtures (`quant-v2-engine.test.ts:538-575`).
