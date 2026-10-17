# Frontend map for Học viện v3.2

Scope: `frontend/src/pages/academy/**` (44 files, about 6.3k lines) plus everything that imports it or hardcodes the old catalog. Read-only survey on `feat/academy-v32` @ d145fd5d. Line numbers refer to that commit.

---

## 1. Current architecture

### 1.1 Mounting and routing

There is no standalone route. The academy is a tool inside `/demo-trading`.

- `src/App.tsx:119-120`: `/hoc-vien` and `/hoc-vien/:lessonId` go to `AcademyRedirect` (`pages/demo-trading/academy-redirect.tsx`), which navigates to `/demo-trading?view=academy&lesson=<id>` through `academyWorkspaceLocation` (`pages/demo-trading/workspace-url.ts:78`). Its `LESSON_ID` regex at `:20` is generic (`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$`), so it needs no change.
- `src/config/chrome.ts:44,63-65,70`: header link "Học viện" points to `/demo-trading?view=academy`. Rail tools `academy | bot | shop` make up `section: "academy"`.
- `pages/demo-trading/demo-trading-page.tsx:14-15,74-100,173,195`:
  - the sidebar panel is `<AcademyPanel/>`;
  - the main area is `<AcademyMain mascotId/>` inside a `ScrollArea`;
  - the panel starts closed when `view=academy&lesson=` is present.
- `pages/demo-trading/workspace-sections.ts:10`: the academy section owns the params `view, lesson, practice`.
- `pages/academy/navigation.ts`:
  - `LESSON_ID = /^ch\d{2}-l\d{2}$/` at `:7`. **It rejects exam and practice-room ids.**
  - `useAcademyNavigation()` returns `{lessonId, openLesson, closeLesson, openBot, openFilter}`. It writes `?lesson=` with `replace: true`.
- `pages/academy/academy-panel.tsx:20-23`: `chapterOfLesson()` uses the same `chNN-lMM` regex.
- `pages/academy/academy-main.tsx`:
  - for a guest, or when no lesson is open, it shows `MascotStage`;
  - otherwise it renders `<LessonReader key={lessonId}/>`.

### 1.2 Data layer (`api.ts`, `queries.ts`)

- All calls go through `requestOperation("<METHOD> /api/v2/academy/...")` (`@/lib/contract-client`). Types come from `ApiResponseFor<"...">` (`@/lib/contract-types`), which resolves to the generated `src/lib/generated/backend-v2.ts`.
- Current endpoints (`api.ts:1-15`): catalog, progress, lesson, `POST attempts`, resume `GET lessons/{id}/attempt`, `PUT attempts/{id}/answers` (draft), submit, history `GET lessons/{id}/attempts`, review `GET attempts/{id}`, and `POST lessons/{id}/complete` (guide).
- Derived types:
  - `CatalogChapter`, `CatalogLesson`, `LessonSection`, `LessonBlock`, `ChartModel`, `AttemptQuestion`, `QuestionFigure`, `ReviewItem`, `RewardResult`.
  - Hard constants: `QUIZ_QUESTION_COUNT = 8` (`api.ts:44`) and `LESSON_REWARD_XU = 100`.
- Error predicates exist for `CATALOG/CONTENT/ASSESSMENT_VERSION_MISMATCH`, `DRAFT_REVISION_CONFLICT`, `ATTEMPT_ALREADY_SUBMITTED`, `ATTEMPT_NOT_FOUND`, `LESSON_NOT_FOUND`, `INVALID_ANSWERS` and `NOT_PUBLISHED`. There are none yet for `ACADEMY_ITEM_LOCKED` or `ACADEMY_SCENARIO_REQUIRED`.
- `queries.ts`, React Query keys:
  ```ts
  academyKeys = {
    all: ["academy"], catalog: ["academy","catalog"],
    progress: (uid) => ["academy","progress",uid],
    lesson: (uid,id) => ["academy","lesson",uid,id],
    resume: (uid,id) => ["academy","resume",uid,id],
    history: (uid,id) => ["academy","history",uid,id],
  }
  // quiz-flow.tsx:43 adds ["academy","quiz-run",uid,lessonId,key,intent.kind,attemptId]
  COMPLETION_DEPENDENT_ROOTS = [["shop"],["bot"],["practice"],["strategy"]]
  ```
  - `invalidateAfterCompletion()` refreshes progress, lesson and all four dependent roots. `["shop"]` includes `["shop","state",uid]`, which the header coin chip reads.
  - `invalidateAfterSubmit(qc, completed)` covers resume and history, plus completion when passed.
  - Every read uses `retry: false` and is `enabled: isAuthenticated`.

### 1.3 Generated contract shapes that block v3.2 (`src/lib/generated/backend-v2.ts`)

| Type | Line | Problem for v3.2 |
|---|---|---|
| `AcademyCatalogResponses[200]` | 27073 | `chapters[].type: "technical"\|"fundamental"\|"tool"`, `lessons[].kind: "technical"\|"fundamental"\|"concept"\|"guide"`, `completion.mode: "quiz"\|"guide"`. No `published`, `optional`, exam item, `unlock` label or `has_scenario` |
| `AcademyProgressResponses[200]` | 27872 | `completed_lesson_ids`, `chapters[{no,done,total}]`, `course_done/total`, `granted_capabilities`. No per-item `state` (locked/open/passed), no current item, no exam completions, no scenario choices |
| `AcademyLessonResponses[200]` | 27147 | Block union `html \| table \| chart \| image \| steps \| callout \| details`, chart kinds `series_panels \| grouped \| line \| stacked \| timeline \| waterfall \| panels`, `nav_labels: [4]`. No scenario, interactive blocks, cards, takeaways or candles |
| `AcademySubmitAttemptResponses[200]` | 26840 | `total: 8` literal; `results[]` carries `correct_option_id`, `options[].correct` and `explanation` (answers leak after submit) |
| `AcademyCreateAttemptResponses[201]` | 26342 | Body `{lesson_id, catalog_version, idempotency_key}`, so no exam id |

### 1.4 Contracts generation flow (OpenAPI to frontend)

1. Backend: `backend/package.json:31` runs `contracts:generate = npm run build && node dist/scripts/export-openapi.js && node dist/scripts/generate-client.js` (@hey-api/openapi-ts 0.99.0). It writes `backend/contracts/openapi-v2.json` and `backend/contracts/client/types.gen.ts`.
2. Frontend: `npm run contracts:generate` runs `scripts/contracts-generate.mjs`. It:
   - copies the backend types verbatim to `src/lib/generated/backend-v2.ts`;
   - writes `contracts/openapi-v2.json` and `contracts/source-lock.json` (sha256 of both);
   - builds `src/lib/generated/operation-map.ts` (`OperationMap["GET /api/v2/academy/catalog"] = {request, response}`) and `contracts/api-manifest.json`;
   - AST-scans `src/**` for `requestOperation(...)` and other API calls into `contracts/endpoint-inventory.json`.
3. `npm run contracts:check` (part of `npm run verify`) fails when the pinned snapshot drifts or when a production `api-call` has no matching operation.

**Order for v3.2:** first change the backend DTOs and schemas (zod or class schemas that feed OpenAPI), then run backend `contracts:generate`, then frontend `contracts:generate`. Only after that do frontend types compile. `ApiResponseFor<>` makes every academy type follow automatically. Fixtures (`test-fixtures.ts`) are typed against them and will break loudly, which is intended.

### 1.5 Panel (`academy-panel.tsx`, 306 lines)

- `SidebarPanel` has `title="Học viện"` and `description="${chapter_count} chương · ${lesson_count} bài học"` (`:256-262`). The fallbacks are `CATALOG_CHAPTER_COUNT = 13` and `CATALOG_LESSON_COUNT = 71` (`catalog-model.ts:4-5`).
- `ProgressCard` (`:25-72`) shows `course_done / course_total` and a progressbar. It never shows a fake 0.
- `ChapterGroup` (`:74-149`):
  - a collapsible `<section data-chapter>`;
  - header "CHƯƠNG n" in small muted text, the title, and a `done/total` count;
  - each row has the name, "✓ Đã học", and a single outline button **"Xem bài"** that is always enabled.
- Open-chapter state is kept per session (`view-state.ts` `loadPanelState`/`savePanelState`, sessionStorage key `iqx.academy.panel.v1.<uid>`). A deep link auto-opens the lesson's chapter (`:180-184`). Scroll position is restored and the current row is scrolled into view (`:190-227`).
- On a phone, `frame.overlay` closes the sheet when a lesson is selected (`:236-240`).
- A guest sees `PanelState` "Đăng nhập để học" plus a sign-in button and makes no requests (`:243-253`).

### 1.6 Reader (`lesson-reader.tsx`, 274 lines)

- `Mode = {kind:"read"} | {kind:"quiz", run, intent}`. While `kind === "quiz"`, the header and sections are hidden. That already satisfies spec §4.4 "khi đang làm bài kiểm tra, nội dung bài ẩn đi".
- Top bar: "Về linh thú", "Bài x / n" (`:131-135`), and "Danh sách bài" on a phone.
- Header card: "Chương n · title", a `01 / 06` counter, h2 title, lead, `StatusTags` ("Đã học", "Đã nhận 100 xu"), and a guide chapter counter.
- `content_status !== "published"` shows an empty state.
- Section nav pills come from `nav_labels` (four parts). Sections render as `section#academy-section-N` with a numbered h3 and `<BlockRenderer blocks context={{charts, onReload}}/>`.
- The end of the lesson shows either `GuideCompletion` (mode guide) or `QuizEntry`.
- Prev/next stays **within the chapter only** (`catalog-model.ts locateLessons`). At the chapter end it shows "Hết nội dung / Đã hoàn thành Chương n".

### 1.7 Block renderers (`blocks/`)

- `block-renderer.tsx` `renderBlock()` switch:
  - `html` → `HtmlContent` (sanitized via `sanitize.ts` allowlist: flow and inline modes, class allowlist `formula`, `frac`, `good`, `execution-example`, `filter-*` …);
  - `table` → `TableBlock` (inline-sanitized cells, `align`, focusable `academy-table-scroll`);
  - `chart` → `ChartBlockView` (figure, title, "Dữ liệu minh họa" tag, `LessonChart`, optional `ChartDataTable`, caption);
  - `image` → `LessonImage` (sized lazy img, lightbox `Dialog` with "Vừa khung / 100%");
  - `steps` → numbered list;
  - `callout` → variants `notice | worked | signal-buy | signal-sell | filter-example`, recursive;
  - `details` → `academy-details` disclosure.
- Adjacent signal-buy and signal-sell callouts render side by side (`isSignalPair`).

### 1.8 Charts (`charts/`)

All charts are hand-written SVG, not Recharts, even though `AGENTS.md` lists Recharts for product charts.

- `lesson-chart.tsx` `LessonChart` switch:
  - `series_panels` → `SeriesPanelsChart` (shared x, stacked panels each with series, `band`, `bars`, `levels` buy/sell, `marks`, keyboard readout);
  - `grouped | line | stacked` → `CategoryChart`;
  - `timeline` and `waterfall` → `step-charts.tsx`;
  - `panels` → grid of `CategoryChart`.
- `ChartDataTable` shows "Xem bảng số liệu" from `chart-math.ts chartTables()`.
- `chart-theme.ts` maps roles to token classes (`stroke-chart-1`, `fill-price-up`, `fill-muted-foreground` …). `use-chart-width.ts` is a ResizeObserver hook with a fallback width of 580, a minimum of 230 and a narrow breakpoint of 400.
- Axis and label text uses `fill-muted-foreground` and `text-muted-foreground` everywhere. **This conflicts with spec §2.2 "không dùng chữ xám" (sub-text must be `#dbe7f3`/`#c9d6e4`).**

### 1.9 Quiz (`quiz/`)

- `QuizEntry`:
  - title "Bài kiểm tra {name}" and an 8-question description;
  - best score and history `<details>` with "Xem kết quả" (review);
  - buttons "Làm bài kiểm tra · 8 câu" or "Tiếp tục bài kiểm tra", plus "Về Bot" / "Mở Bộ lọc".
- `boot-quiz.ts`:
  - `QuizIntent = start | retake | review`;
  - start resumes an open attempt (server draft) or POSTs a new one;
  - the idempotency key is kept in sessionStorage (`view-state.ts saveAttemptKey`).
- `QuizTaking`:
  - header "Bài kiểm tra · Chương n", "Đã trả lời x / total", a free-jump 8-column strip (`grid-cols-8`, `:162`);
  - a question card with figure, hint `<details>` and a radio list with A/B/C letters;
  - "Câu trước"/"Câu tiếp", and "Nộp bài" only on the last question once everything is answered;
  - draft autosave through `use-draft-sync.ts` (queued PUTs with revision, 409 adopt).
  - Option order is **server order** (the comment at `api.ts:6` says "8 questions in the attempt's own order"). Shuffling is therefore already a server concern.
- `QuizResult`:
  - big score `/ QUIZ_QUESTION_COUNT`, headline and note (`quiz-copy.ts resultHeadline/resultNote`), reward line (`rewardView`), and the buttons "Xem bài học", "Làm lại" (confirm `Dialog`), "Về Bot", "Mở Bộ lọc";
  - **then "Đáp án và giải thích" with a `ReviewCard` per question** that shows the correct option and explanations. v3.2 forbids this.
- `GuideCompletion` (`guide-completion.tsx`) handles "Hoàn thành bài học" for guides. **v3.2 removes guide mode** (§0.1 row 8).

### 1.10 Coin display

- `components/layout/header-coin-chip.tsx` reads `useShopState()` (`pages/demo-trading/shop/use-shop.ts:24`, key `shopKeys.state(uid)` under root `["shop"]`).
- After a pass, `invalidateAfterSubmit` → `invalidateAfterCompletion` invalidates `["shop"]`, so the chip refetches and updates right away. **No change is needed.** A toast `creditedText(delta)` also appears. Exams must produce no coin toast (reward null).

### 1.11 Guest mode

- Panel: `academy-panel.tsx:243-253`. Main area: `academy-main.tsx:14`. Queries are `enabled: isAuthenticated`.
- Test: `academy-guest.test.tsx` asserts there is no `/ 71`, no progressbar and no API calls. Update the `71` to `43` and keep the assertions. The guest description string at `:245` uses `CATALOG_*` constants and should become "43 bài học".

### 1.12 CSS and design rules

- `pages/academy/academy.css` (275 lines) styles `.academy-prose` (body text at 88% foreground), formulas, `.execution-example`, filter chips, `.academy-table-scroll`, `.academy-details`. Grey text appears at `:133,144,149` (`--muted-foreground`).
- `DESIGN.md` §2.2 sets secondary text to `text-muted-foreground`. §2.5 sets chart axes to `fill-muted-foreground`, 11px.
  - Dark: `--muted-foreground: oklch(0.720 0.020 250)` (grey-blue). `--foreground: oklch(0.960 0.010 250)`.
- `AGENTS.md` §7 and §10:
  - no hardcoded hex in JSX;
  - Lucide icons only, no emoji or Unicode glyph used as an icon (the spec's "✓ Đã hoàn thành" must use the Lucide `Check` icon, as the code already does);
  - coins in `text-amber-700 dark:text-chart-2`;
  - Zone B flat, with no glow or gradients;
  - no visible en or em dashes in copy;
  - Vietnamese UI copy;
  - light and dark themes must both work.
- **Decision needed:** spec §2.2 "no grey text" fights DESIGN.md. Proposal: add an academy-scoped token to `src/index.css`, for example `--academy-subtle` (dark ≈ `#dbe7f3` → `oklch(0.92 0.02 245)`, light ≈ `oklch(0.36 0.02 256)`). Expose it as the Tailwind theme color `academy-subtle` and use it instead of `muted-foreground` for **text** inside the reader, quiz and lesson charts only. Panel chrome can stay as is, since the spec only covers "nội dung bài" and locked buttons. Then document the exception in DESIGN.md.

### 1.13 Tests

| File | What it covers | v3.2 impact |
|---|---|---|
| `academy-panel.test.tsx` (223) | 13 chapter groups, "Xem bài" per row, no fake 0/71, chapter open state, deep link | Rewrite: 5 chapters, "43 bài học", lock states, exam and practice rows |
| `lesson-reader.test.tsx` (187) | header, nav_labels, states, prev/next in chapter, phone | Update the locator line, cross-chapter next, locked next, scenario gate |
| `academy-guest.test.tsx` (36) | guest | `71` → `43` |
| `quiz/quiz-flow.test.tsx` (499, 28 cases) | 8-question strip, drafts, resume, review cards, retake, history, Về Bot/Bộ lọc | Heavy rewrite: N = 3/5/20/30, next only after selection, no back/strip, score-only result, exam texts, unlock pill, no review/history |
| `guide-completion.test.tsx` (166) | guide mode | Delete with `guide-completion.tsx` |
| `blocks/block-renderer.test.tsx`, `blocks/lesson-image.test.tsx`, `charts/lesson-chart.test.tsx`, `sanitize.test.ts` | renderers | Extend with the new block and chart kinds |
| `no-config-controls.test.ts` | Source scan. **The mutation allowlist** is exactly 4 endpoints. Bans `/practice` imports and the strings "Luyện tập" and "Cấu hình" | Update the allowlist (remove guide complete, add scenario choice and practice notes PUT). **Watch out:** a file named `practice-*.ts` under academy matches the `/\/practice/` import ban when imported as `./practice/...`. Name the folder `interactive/` and the hook `use-lesson-notes.ts`. "Phòng tập thực chiến" text is fine |
| `test-api.ts` (228), `test-fixtures.ts` (382) | In-memory fake backend with 13 chapters and `total: 8` | Rebuild for the v3.2 catalog (5 chapters, 43 + exams + practice), item states, scenario, notes |
| `e2e/introduction.spec.ts:32-79` | Only checks the `/demo-trading?view=academy` link | No change. **No academy e2e exists.** Add `e2e/academy-v32.spec.ts` against `real-backend` fixtures: lock flow, scenario gate, 390px no overflow |

### 1.14 Outside `pages/academy` that hardcode the old catalog

- `pages/demo-trading/practice/practice-api.ts:106-127` maps `PRACTICE_INDICATORS` to old lesson ids (`rsi: ch01-l01`, `macd: ch01-l02`, `ma: ch01-l03`, `bollinger: ch01-l04`, `volume: ch01-l05`, `ema: ch05-l01` … `williams_r: ch10-l03`). The new ids are `volume: ch04-l04`, `ma: ch04-l05`, `rsi: ch04-l06`, `macd: ch04-l07`, `bollinger: ch04-l08`. The other 11 indicators belong to unpublished chapters 7-8, so `lessonLink()` must return null or show "Sắp phát hành". Better still, derive the links from the catalog's `unlock` field instead of a hardcoded map.
- `pages/demo-trading/bot/navigation.ts:4-14` and `pages/strategy/shared/indicators.ts:33-42` hold `CHAPTER_TITLES {1,5,7,10}` from the old catalog. Replace them with v3.2 (4: "Phương pháp kỹ thuật", 7, 8) or read them from the catalog.
- `pages/demo-trading/shop/shop-api.ts:128-150`: `fetchAcademyProgress` (course_done/total) and `fetchLessonNames` walk `chapters[].lessons[]`. Adjust to the new shape. Old ledger rows reference retired lesson keys, so the backend must still resolve their names (for example a `retired_lessons` map) or rows show raw ids.
- Admin and team (owned by another area): `pages/admin/core/components/user-academy-tab.tsx`, `pages/admin/team/api.ts:53-119` (`academy.completed/total/current_lesson`). These show "x / 43" and the "Tự chọn" label (spec §5.2).
- Copy: `pages/about/about-content.ts` and `pages/introduction/*` may mention 13 chương, 71 bài, 8/8 or 6.200 xu (spec §6). Grep and update.

---

## 2. What must change for v3.2 (frontend checklist)

1. **Contracts** (backend first, see 1.4):
   - the new catalog shape (items with kind, optional and published);
   - progress with server-computed item states;
   - lesson blocks and charts (typed);
   - attempts for `chapter_exam`;
   - scenario choice and practice-notes endpoints;
   - the submit response without per-question answers;
   - new error codes.
2. **`api.ts`**:
   - remove `QUIZ_QUESTION_COUNT`, `completeGuide`, `fetchAttemptReview` (if the review endpoint is retired) and `fetchAttemptHistory` (if history is dropped);
   - add `chooseScenario`, `fetchLessonNotes`, `saveLessonNotes`, `fetchExam` (or reuse the item read);
   - add `isItemLocked` (403 `ACADEMY_ITEM_LOCKED`) and `isScenarioRequired` (403 `ACADEMY_SCENARIO_REQUIRED`).
3. **`catalog-model.ts`**:
   - replace the 13/71 constants with `REQUIRED_LESSON_FALLBACK = 43` (or show no number until loaded);
   - rewrite `locateLessons()` to `locateItems()` over a **flattened sequence** (lesson → exam → next chapter, practice after the ch3 exam) with global prev/next;
   - drop `isGuideLesson`.
4. **`navigation.ts:7` and `academy-panel.tsx:20`**:
   - accept item ids, for example `/^ch\d{2}-(l\d{2}|exam|practice)$/` (agree the exact ids with the backend);
   - resolve legacy ids via the catalog's `legacy_lesson_ids` and replace the URL with the new id.
5. **Panel**:
   - header "N bài học" (no chapter count);
   - chapter heading "Chương c · Tên chương" (bold, foreground);
   - rows with three lock states plus the exam row and the practice row;
   - remove "Xem bài".
6. **Reader**:
   - locator line in the top-right (spec §4.4);
   - remove the 4-part nav pills when `nav_labels` is null (v3.2 lessons have variable section counts, so keep the pills optional);
   - a "Tóm tắt" takeaways section;
   - the end button becomes `LessonQuizGate`;
   - a chapter-exam item renders `ChapterExamIntro`;
   - the practice item renders the same reader with case blocks;
   - prev/next across chapters, disabled when the target is locked.
7. **Quiz**:
   - one question per screen, "Câu i/N" plus a dots strip that is not clickable;
   - "Câu tiếp theo" enabled only after a selection, "Nộp bài" on the last question;
   - no back button (matches the prototype; see the decision below);
   - keep server draft resume;
   - the result shows the score only;
   - remove `ReviewCard`, history and review.
8. **Delete**: `guide-completion.tsx` and its test, the guide keys in `view-state.ts:94-129`, and `resultHeadline`'s chapter-3 special case.
9. **Interactive blocks for chapters 2-3 and the practice room** (section 3.5).
10. **Charts**: new kinds (candles, zones, fib, wave, annotations), and switch text from grey to the subtle token (section 3.6).
11. **CSS**:
    - the `.academy-prose` sub-text colors;
    - new classes for cards, flows and dialogue if they go through `html` (preferably typed React components instead, see 3.4);
    - 390px safety (`overflow-wrap:anywhere`, grids collapse to one column below 560px).
12. **Tests**: see 1.13.

---

## 3. Proposed structure

### 3.1 Proposed types (to be produced by backend OpenAPI; frontend aliases in `api.ts`)

```ts
export type AcademyItemKind = "lesson" | "chapter_exam"
export type AcademyItemState = "locked" | "open" | "passed"

// GET /api/v2/academy/catalog  (only published chapters)
type AcademyCatalog = {
  catalog_version: string            // e.g. "iqx-academy-v3.2-14ch-94l"
  required_lesson_count: number      // 43 now: excludes exams and optional
  chapters: Array<{
    no: number; title: string        // "Nền tảng"
    audience: "all" | "team"         // reserved (§1.3-5)
    items: Array<{
      id: string                     // "ch01-l01" | "ch01-exam" | "ch03-practice"
      kind: AcademyItemKind
      chapter: number
      order: number                  // 1-based within chapter (exam = n+1)
      name: string
      optional: boolean              // true only for Phòng tập
      unlock: { id: string; kind: "technical" | "fundamental"; label: string } | null // label "RSI"
      has_scenario: boolean
      quiz: { question_count: 3 | 5 | 20 | 30; pass_score: number }
      content_version: string | null
      legacy_lesson_ids: string[]
    }>
  }>
}

// GET /api/v2/academy/progress  (server decides unlocks, §5.2)
type AcademyProgress = {
  catalog_version: string
  progress_revision: number
  course_done: number; course_total: number          // x / 43
  current_item_id: string | null                     // first open, not passed, required item
  items: Array<{ id: string; state: AcademyItemState; completed_at: string | null; completion_method: "quiz" | "legacy_migration" | null }>
  granted_capabilities: string[]
}

// GET /api/v2/academy/lessons/{id}  (403 ACADEMY_ITEM_LOCKED when locked)
type AcademyLesson = {
  id: string; kind: "lesson"; chapter: number; order: number; optional: boolean
  title: string; lead: string | null
  catalog_version: string; content_version: string
  state: AcademyItemState
  unlock: CatalogItem["unlock"]
  quiz: { question_count: number; pass_score: number }
  scenario_choice: number | null               // persisted per account
  sections: Array<{ id: string; title: string; blocks: LessonBlock[] }>
  summary: string[]                            // "Tóm tắt" items (inline html)
  charts: Record<string, ChartModel>
  reward: RewardResult | null
}

// GET /api/v2/academy/exams/{id}  (or the same route with kind="chapter_exam")
type AcademyExam = { id: string; kind: "chapter_exam"; chapter: number; title: string; intro: string; question_count: 20 | 30; pass_score: number; state: AcademyItemState }

// POST /api/v2/academy/attempts  body { item_id, catalog_version, idempotency_key }
// submit response (score only):
type AcademySubmitResult = {
  attempt_id: string; item_id: string; kind: AcademyItemKind
  score: number; total: number; passed: boolean
  completion: { completed: boolean; newly_completed: boolean; completed_at: string | null }
  newly_granted: string[]; granted_capabilities: string[]
  unlocked_labels: string[]           // ["RSI"] for "Đã mở chỉ báo RSI"
  next_item_id: string | null         // for navigation after pass
  reward: RewardResult | null         // always null for chapter_exam
  progress_revision: number
}

// POST /api/v2/academy/lessons/{id}/scenario  body { choice: 0|1|2 }  → { choice, answer, explanation }
//   409 ACADEMY_SCENARIO_ALREADY_CHOSEN carries the stored choice
// GET/PUT /api/v2/academy/lessons/{id}/notes
type LessonNotes = {
  revision: number
  texts: Record<string, string>        // worksheet keys "br2", "case1"
  checks: Record<string, boolean>      // todo/self-check keys "l1-0", "br2a-3"
  scores: Record<string, number[]>     // roleplay key → 6 × 0..10
  updated_at: string | null
}
```

`AttemptQuestion` keeps `{id, prompt, options:[{id,text}], figure?, hint?, topic?}`. The server shuffles question and option order per attempt and freezes it, so draft resume stays stable. **The client must not shuffle.**

### 3.2 Sidebar with sequential lock states

```
pages/academy/panel/
  academy-panel.tsx        (shell: header "Học viện" · "{course_total} bài học", ProgressCard, chapter list)
  progress-card.tsx        (moved from academy-panel.tsx:25-72; "Tiến độ học tập x / N")
  chapter-group.tsx        (heading "Chương c · Tên chương", font-semibold text-foreground; collapsible kept,
                            the current item's chapter auto-opens; count = required passed / required total)
  item-row.tsx             (one row per catalog item)
  item-state.ts            (pure: stateOf(progress, id) → "locked"|"open"|"passed"|"unknown")
```

`ItemRow` behaviour:

| state | label (left) | right side | interactive |
|---|---|---|---|
| passed | name, or "Bài thi Chương c" | `Button variant="outline" size="sm"` "Xem lại" | yes |
| open | same | `Button size="sm"` "Học bài" (lesson) or "Làm bài" (exam) | yes |
| locked | same, in subtle color (not grey) | `<Lock/>` + "Chưa mở" text, `aria-disabled` | no (`<div>`, not a button) |
| unknown (progress loading or failed) | name | no button, no skeleton | no |

- The practice row adds a `Badge variant="outline"` "Tự chọn". It is placed after the exam row.
- The current row keeps `bg-primary/10` and `aria-current`.
- A whole-row click target should be one `<button>` with an accessible name such as "Học bài {name}", which avoids nested interactive elements.
- Locks are always rendered from `progress.items[].state`. The client never computes them, because the server is authoritative. `item-state.ts` only maps.
- A deep link to a locked item: the reader gets 403 `ACADEMY_ITEM_LOCKED` and shows `PanelState` "Bài này chưa mở" with "Đến bài đang học" (`current_item_id`).

### 3.3 Reader composition

```
lesson-reader.tsx → item-reader.tsx (switch on catalog item kind)
  ├─ reader-topbar.tsx           ("Về linh thú", locator "Chương c · Bài n / size" | "Bài thi Chương c" | "Chương 3 · Phòng tập thực chiến")
  ├─ lesson-view.tsx             (header, sections, Tóm tắt, LessonQuizGate, ItemPager)
  ├─ exam/chapter-exam-intro.tsx
  └─ quiz/quiz-flow.tsx          (shared by lesson, practice and exam)
item-pager.tsx                   (prev/next over the flattened sequence; locked next → disabled with Lock + "Chưa mở")
lesson-quiz-gate.tsx
```

`LessonQuizGate({lesson, scenarioChosen, onStart})`:

- `lesson.state === "passed"`: disabled outline button with `<Check/>` "Đã hoàn thành" (`disabled:opacity-100`, not grey).
- `has_scenario && !scenarioChosen`: disabled button "Chọn cách xử lý ở phần Tình huống để làm bài kiểm tra". The text uses `whitespace-normal`, so it wraps at 390px.
- Otherwise: "Làm bài kiểm tra" (with " · {question_count} câu" in a sub-line).
- `scenarioChosen` comes from `lesson.scenario_choice !== null`, or from the scenario mutation result written into the lesson query cache with `setQueryData`.

`ChapterExamIntro({exam, onStart, onReviewChapter})`:

- h2 "Bài thi Chương c", and the `exam.intro` text from the server, falling back to a copy map in `quiz-copy.ts` with the chapter 2 and 3 variants from spec §3.3.
- The bold sentence "Cần trả lời đúng tất cả câu hỏi để hoàn thành."
- Button "Bắt đầu làm bài". If already passed: `<Check/>` "Đã hoàn thành" plus "Xem lại Chương c", which calls `openLesson(first item of chapter)`.

### 3.4 Quiz: one question per screen, score-only result

```
quiz/
  quiz-flow.tsx        (keep boot/resume; QuizIntent = "start" | "retake"; item-generic: itemId + kind)
  boot-quiz.ts         (createAttempt({item_id,...}); drop the review branch)
  quiz-question.tsx    (new; replaces quiz-taking.tsx)
  quiz-score.tsx       (new; replaces quiz-result.tsx)
  quiz-copy.ts         (rewrite)
  use-draft-sync.ts    (keep)
  question-figure.tsx  (keep; text color token swap)
```

`QuizQuestion`:

- Header line: label "Bài kiểm tra", "Bài thi Chương c" or "Phòng tập thực chiến", plus "Câu i/N".
- Progress dots: `<ol aria-hidden>` of N dots (done, current, todo) with an sr-only "Câu i trên N". For N = 30 use `flex-wrap gap-1`, `size-2` dots.
- Then the prompt (h3, focus on change), the figure, and options as radio cards. Option letters are optional; the prototype has none.
- One button: "Câu tiếp theo", `disabled` until the current question has an answer. On the last question it reads "Nộp bài".
- No "Câu trước" and no clickable strip.
- Resume: start at the first unanswered question.
- Show a quiet "Thoát" ghost button back to the lesson. The draft is kept server-side.
- Submit sends all N answers. Errors reuse `describeSubmitFailure`, extended with `isItemLocked` → "Bài này chưa mở" and `isScenarioRequired` → back to the lesson.

`QuizScore({result, item, onRetake, onReview, onDone})` (spec §3.2.4):

- Big `n/N`, with the `aria-label` "Điểm n trên N".
- Label **Đạt** (`text-price-up` is wrong here because it is market colour; use `text-(--status-success)`) or **Chưa đạt** (`text-destructive`).
- Passed:
  - `<Check/>` "Đã hoàn thành" (static badge) and "Xem lại bài" (outline);
  - an unlock pill "Đã mở chỉ báo {label}" from `result.unlocked_labels`;
  - for an exam, the pill "Đã hoàn thành Chương c";
  - optional "Bài tiếp theo" to `result.next_item_id`. The prototype has none, so keep it secondary.
  - The coin toast only when `reward.status === "credited"`; exams never show one.
- Failed: "Làm lại" (no confirm dialog needed now, since there is no review to lose) and "Xem lại bài". For an exam the second button reads "Xem lại Chương c" and goes to item 1 of the chapter.
- **No per-question list. No correct answers.** `quiz-copy.ts` is reduced to `quizLabel(item)`, `startLabel`, `examIntro(chapter)`, `unlockPill(label)` and `creditedText`.

Invalidation stays `invalidateAfterSubmit` (progress, lesson, shop for the coin chip, bot, practice, strategy). Also invalidate `["academy","exam"]`.

### 3.5 Interactive blocks for chapters 2-3 and the practice room

New members of the typed `LessonBlock` union:

```ts
| { type: "scenario"; title: string; context_html: string; question: string; options: [string, string, string]; answer: 0|1|2; explanation_html: string }
| { type: "worksheet"; key: string; title: string; prompt_html: string; example?: string; placeholder?: string }
| { type: "todo"; key: string; title: string; items: Array<{ key: string; text: string }> }        // "Việc làm ngay"
| { type: "self_check"; key: string; title: string; items: Array<{ key: string; text: string }> }  // "Tự kiểm tra x/N"
| { type: "income_calculator"; fee_rate: number; share_rate: number;
    fields: { clients: { label: string; default: number }; monthly_value_million: { label: string; default: number } };
    note: string }                                                                                 // 0.0015 / 0.7, from content not code
| { type: "client_case"; key: string; title: string; profile: { info: string[]; psychology: string[]; quote: string };
    prompts: [string, string, string, string];
    reveal: { key_point: string; sample_answer: string; direction: string; closing_line: string; avoid: string } }
| { type: "roleplay_score"; key: string; criteria: Array<{ title: string; hint: string }>; max: 10;
    bands: Array<{ min: number; label: string; tone: "success" | "warning" | "danger" }> }        // 48 / 36 / 0
// non-interactive layout blocks seen in the prototype (cmp/ex2/three/flow4/say/take/assume):
| { type: "cards"; layout: "two" | "three" | "four" | "flow"; items: Array<{ eyebrow?: string; title: string; body_html: string; tone?: "up" | "down" | "neutral" }> }
| { type: "dialogue"; lines: Array<{ who: string; text: string; tone?: "good" | "bad" | "neutral" }> }
| { type: "note"; text: string }    // "Số liệu giả định để minh họa" (ch2 only, §2.2)
```

Components in `pages/academy/interactive/`. Do not name the folder `practice/`, because `no-config-controls.test.ts` bans that path.

| File | Behaviour |
|---|---|
| `scenario-block.tsx` | Three option buttons (`role="radiogroup"`-like buttons, `aria-pressed`). Clicking one calls a `useMutation(chooseScenario)` and disables all options while pending. On success: the correct option gets `border-(--status-success)` plus a `Check` icon, a wrong chosen option gets `border-destructive` plus an `X` icon, and the explanation shows. Then `setQueryData(lesson, {...scenario_choice})` enables the gate. Locked after one choice. A 409 adopts the server choice. No optimistic gate: the gate depends on server acceptance (AGENTS §5, access) |
| `worksheet-block.tsx` | `Textarea` (shadcn) bound to `notes.texts[key]`. Saves through `useLessonNotes` with an 800 ms debounce. Status line "Đã lưu", "Đang lưu…" or "Chưa lưu được. Thử lại" (`role="status"`) |
| `todo-block.tsx` | shadcn `Checkbox` list with `notes.checks[key]`. Checked rows are styled; autosave as above |
| `self-check-block.tsx` | Same as todo plus a counter "x/N" (`aria-live="polite"`) |
| `income-calculator.tsx` | Two `Input type="number" inputMode="numeric" min=0`. Pure `estimateMonthlyIncome(clients, valueMillion, fee, share) = max(0,c)*max(0,v)*1e6*fee*share` → `formatVnd` (`tabular-nums`). Not persisted (prototype parity). Unit test: 20 × 200 gives 4.200.000 đ |
| `client-case-block.tsx` | Profile grid (info, psychology, quote). "Bạn tự phân tích trước" shows **4 prompts, one per line, 15px, foreground** (spec §2.4, §7.3), plus a worksheet textarea. Button "Xem gợi ý phân tích" / "Ẩn gợi ý" toggles the reveal (`aria-expanded`) |
| `roleplay-score.tsx` | 6 × shadcn `Slider` (0-10, step 1) with `<output>`, total "t/60", and a band label. Persisted in `notes.scores[key]` (owner chose per-account notes; the prototype does not persist it) |
| `use-lesson-notes.ts` | `useQuery(["academy","notes",uid,lessonId])` plus a queued `PUT` with `expected_revision`, debounced and merged by key (same pattern as `use-draft-sync.ts`, 409 adopts the server copy and reapplies the local key). Keeps unsent text in `view-state.ts` sessionStorage under `iqx.academy.notes-draft.<uid>.<lessonId>` so a reload before the save lands loses nothing. Never affects progress |

`renderBlock()` gets a new context field `BlockContext = { charts, onReload, lesson: { id, scenario_choice }, notes: UseLessonNotes }`. Interactive blocks render only when `context.notes` is present, which keeps question-figure and admin previews read-only.

### 3.6 Typed chart rendering

Keep the in-house SVG renderers. They are tested, use tokens, and are accessible with a keyboard readout. Recharts is unnecessary here. Extend `ChartModel`:

```ts
// series_panels panel gains:
candles?: { open: (number|null)[]; high: (number|null)[]; low: (number|null)[]; close: (number|null)[] }  // up/down via price-up/price-down tokens
zones?: Array<{ from: number; to: number; role: "support" | "resistance"; label?: string }>
fib?: { high: number; low: number; levels: number[] }        // 0.236…0.786, labelled
annotations?: Array<{ i: number; value: number; label: string; arrow?: "up" | "down" }>   // crosses, divergences
wave?: Array<{ i: number; value: number; label: string }>    // Elliott 1-5, A-C polyline
// new top-level kinds:
| { kind: "candle_anatomy"; candles: Array<{ o: number; h: number; l: number; c: number; title: string }> }  // ch4 L1 g1
| { kind: "cycle"; phases: Array<{ name: string; detail: string }> }                                       // ch1 L8/L9 phase diagrams
```

- The indicator math (RSI Wilder 14, MACD 12/26/9, BB 20±2σ, SMA/EMA) should be **computed by the content pipeline**, so the API ships numbers. The frontend must not compute "real formulas" at runtime, and the backend stays the source of truth for the "bảng số liệu" table.
- `chart-math.ts chartTables()` must cover the new fields.
- Text tokens: in `chart-theme.ts` and every `fill-muted-foreground` / `text-muted-foreground` inside `charts/*`, switch to `fill-academy-subtle` / `text-academy-subtle`. Grid and axis **lines** stay `stroke-border` (grey is allowed for lines and bars).
- No intersection-triggered draw animation (prototype `__go`); AGENTS bans decorative motion.
- 390px: `useChartWidth` already redraws at a minimum width of 230. The narrow variant must reduce ticks and wrap labels (`wrapLabel`). Add a test at width 358 (390 minus gutters).
- The prototype has 129 SVG ids: about 45 for chapter 1, 7 for chapter 2, and the rest for chapter 4. Most chapter 1 and 2 figures are diagrams (flows, comparisons, icons), not data charts. Map them to `cards`, `dialogue` or `table` blocks. Only the true data plots (VNI vs savings, CPI, YRS bar, phase lines, funnel retention line) use `line`, `grouped` or `series_panels`. A small residue of bespoke illustrations needs `{ type: "diagram"; diagram_id: "...", data }` backed by a registry of React components. Keep that list short and explicit.

### 3.7 Copy and constants to change

- `"13 chương · 71 bài học"` becomes `"{course_total} bài học"` (panel header, guest).
- Remove `QUIZ_START_LABEL` "· 8 câu", `RETAKE_CONFIRM`, `REPASS_NOTE`, `resultHeadline` and `resultNote`. Replace `nextToolFor` with the unlock pill plus an optional "Về Bot" when `unlocked_labels` is non-empty.
- `CATALOG_VERSION` in fixtures becomes the new catalog version string.

---

## 4. Open decisions to raise with the owner

1. **"No grey text" against DESIGN.md:** add the `--academy-subtle` token scoped to the reader, quiz and charts, and define the light-theme value.
2. **Back navigation in the quiz:** the prototype has none. Removing it simplifies the flow and matches the spec ("chọn xong mới bật nút Câu tiếp theo"). Confirm.
3. **Attempt history, best score, "Xem kết quả":** they conflict with "không hiện đáp án". Drop them, or keep score-only history rows.
4. **Retire `GET /academy/attempts/{id}` review**, and strip `results[]` from submit. That is a backend change, but the frontend stops reading it either way.
5. **Item ids for exams and the practice room** (`ch01-exam`, `ch03-practice`?), and whether the URL param stays `lesson`.
6. **Sidebar layout:** keep collapsible chapter groups (current) or use the prototype's flat list with chapter headings. Recommendation: keep collapsible, and auto-open the current item's chapter.
7. **Roleplay score persistence:** the prototype does not persist it. The owner chose per-account notes; include `scores` in notes (recommended).
8. **Indicator lesson links** from Bot, Practice and Strategy for the 11 indicators in unpublished chapters 7-8: hide them, or show "Sắp phát hành".
