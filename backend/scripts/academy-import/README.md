# Academy content import (chapters 1-4)

Deterministic, verified extractor for the approved chapter 1-4 content packages. It turns the four
handoff HTML files (outside the repo, never committed) into typed JSON packages and guide
screenshots, and a verifier that re-checks the committed result without the source.

```
backend/scripts/academy-import/        extractor + verifier (this folder)
backend/src/modules/academy/content/packages/
  package.schema.ts                    zod schema of the package format (also exports types)
  ch01..ch04/
    lessons.vi.json                    public: typed lessons (all chapters)
    charts.vi.json                     public: chart models keyed by chart_id (ch01, ch03)
    questions.vi.private.json          PRIVATE: 48 questions with key + per-option explanations (ch01, ch03)
    assets.manifest.json               public: guide screenshots (ch02, ch04)
    import-manifest.json               provenance, spec-hash gates passed, counts, output hashes
frontend/public/assets/academy/ch02|ch04/<asset_id>.<sha8>.webp    screenshots, bytes unchanged
backend/test/unit/academy-packages.test.ts
```

## Commands

Run from `backend/`. The scripts are compiled with the rest of the backend (`tsc -p tsconfig.build.json`
emits `dist/scripts/academy-import/*.js`); `parse5` is a devDependency.

```bash
npx tsc -p tsconfig.build.json                                   # or: npm run build

# Extract (writes the package JSON and the images). <sourceDir> holds the four approved HTML files:
#   IQX-Hoc-Vien-Chuong-1-MAU-v2.0.html  ...-2-MAU-v2.0.html  ...-3-MAU-v2.0.html  ...-4-MAU.html
node dist/scripts/academy-import/extract.js <sourceDir> [--chapters 1,2,3,4]

# Re-run without writing; exit 1 if anything differs from the committed files (determinism check)
node dist/scripts/academy-import/extract.js <sourceDir> --check

# Verify the committed outputs (no source needed; also run by the unit test)
node dist/scripts/academy-import/verify.js
npx vitest run test/unit/academy-packages.test.ts

# Unit test with the full byte-for-byte re-extraction of the real source
ACADEMY_IMPORT_SOURCE_DIR=<sourceDir> npx vitest run test/unit/academy-packages.test.ts
```

Re-running the extractor never changes a file (no timestamps, sorted asset ids, stable key order,
fixed JSON printer).

## Gates (fail loudly, nothing is skipped)

`gates.ts` holds every hash the chapter specs publish. The extractor refuses to run on other input,
and `verify.ts` re-checks that the committed manifests still record exactly these values.

- whole-file size + SHA-256 of each HTML file (C4 supplied as `...-4-MAU.html`, the spec says `-v1.0`);
- SHA-256 of the raw text of `script#chN-content-data` (parsed with parse5, no entity decoding);
- spec object hashes (`json.dumps(sort_keys, ensure_ascii=False, separators=(',',':'))`): C1 48
  questions + 6 lessons, C3 questions/charts/datasets/reference_periods + 6 lessons, C4 payload +
  lessons + reference_filter + 6 lessons. `canonical.ts` ports the Python float repr (`25.0`),
  otherwise the C3 `charts`/`datasets` hashes cannot match;
- C2/C4 image bytes: SHA-256 of every decoded WebP equals payload metadata and spec table; RIFF
  width/height equal both;
- sanitised text equals source text per section (24/24 per chapter, whitespace-insensitive, UI
  chrome such as the "Phóng to" buttons and the static chart legend excluded);
- C3: 16 `proof` oracles recomputed, 13 `data-chart` markers equal the spec list, lesson keys map to
  real ids of `fundamental-registry.json`; C1: windows and A/B marks of 26 figures equal the spec.

## Package format (see `package.schema.ts`)

Lesson: `id` (`ch0N-l0M`), `lesson_key` (`technical:rsi` ... `concept:hop_luu`,
`fundamental:revenue_yoy` ..., `guide:ch02-l01`), `kind`, `name` (catalogue name), `title` (reader
heading), `lead`, `nav_labels[4]`, `completion` (`quiz` 8/8 or `manual` "Hoàn thành bài học"),
`content_version` (<= 32 chars: `ch01-v2.0`, `ch02-v3.0`, `ch03-v2.0`, `ch04-v1.0`), `source`
(`package`, full `package_version`, `payload_sha256`, `object_sha256`), 4 sections `s1..s4` of
blocks, `config_id`, `fixture: {}`.

Blocks: `html` (sanitised flow HTML), `table` (cells are inline HTML; `align[]`, `aria_label`,
`source` for computed tables), `chart` (reference into `charts.vi.json`), `image`, `steps`,
`callout` (`notice | worked | signal-buy | signal-sell | filter-example`), `details`.

- `html` allowlist v2: elements `p h3 h4 div span strong b em i sub sup code br`; classes
  `formula-group`, `math-eq`, `frac`, `good`, `execution-example`, `time-arrow`, `filter-name`,
  `filter-period`, `filter-expression`; no other attributes. `< > &` are escaped, `∈ ∉` are
  literal. The renderer must sanitise with the same allowlist before `innerHTML`.
- `callout`: `title` comes from the leading `h3`/`b` of the source box; two adjacent `signal-buy` +
  `signal-sell` callouts are the original side-by-side `signal-pair`; `filter-example` keeps its
  `aria_label` and holds one `html` block with the `filter-name/period/expression` chips.
- All other strings (titles, captions, summaries, prompts, option text, question-figure tables) are
  plain text.
- Every top-level table is a `table` block (also in C1/C3), so the focusable scroll region,
  column alignment and counts do not depend on markup. Cells that were `style="text-align:..."`
  became `align`.
- `image.src` is the public URL `/assets/academy/chNN/<asset_id>.<sha8>.webp`; `zoom_title` is the
  lightbox title (payload `images[id].caption`), `max_width` the figure width from the layout.
- Chapter 1 "dynamic hooks": `[data-macd-seed]` and the five `[data-application]` divs are emitted as
  `table` blocks with `source: {kind: 'computed', hook, chart_id?}` plus, for the seed, an `html`
  block with the "Phiên 34: MACD ≈ ..." sentence. The numbers come from the same model as the charts.

### Chart models (`charts.vi.json`)

- C1 `series_panels`: pre-computed by `ch1-math.ts` (port of `CH1.math`/`makeChart`) and windowed to
  the visible range (<= 60 points, `null` = no value, lines must not join across `null`).
  `x.start/x.end` are absolute 0-based observation indexes of the source series (the label of a
  point is `Phiên (i - x.start + 1)` unless `x.ticks` is present); `marks[].i` are absolute too.
  Each panel has its own unit/axis. Table columns of the data-table toggle: `Phiên`, then for every
  panel its series (in order) and then its `bars`. Colour is a role (`price p1 p2 p3 pos neg`),
  bar tones are `pos | neg | neutral`; `levels[].role` is `buy` (30) / `sell` (70). Question
  figures are keyed by question id (`ch01-l01-q03`) and carry no data-table toggle.
- C3: the 14 `D.charts` definitions are copied verbatim (`grouped line stacked timeline waterfall
panels`); `rev-quiz-trend` is used by a question only.
- Numbers are printed as JS doubles, nothing is rounded.

### Questions (`questions.vi.private.json`, server only)

`id` `chNN-lMM-qKK` (source order inside the lesson; `source_id` keeps the handoff id), `topic`,
`section` 1-4, optional `hint`, `prompt`, optional `figure` (`{type:'chart',chart_id}` or
`{type:'table',head,rows}`), 4 `options` `{id, source_id, text, explanation}` and `correct_option_id`.
Option ids are opaque: first 10 hex of `sha256("<question id>|<source option id>")`. Options are
stored in opaque-id order so neither the id nor the position reveals the key (all 48 C3 keys are
`o1` in the source). `toPublicQuestion()` is the projection allowed before submit.
`reference_periods`, `datasets`, `proof`, `basis`, `change_log`, `reference_*` are not imported.

## Serving the packages (runtime, `src/modules/academy`)

`academy.content.ts` loads `content/packages/ch01..ch04` with `package.schema.ts` at boot
(`AcademyService.onModuleInit`) and serves chapters 1-4 from them; chapters 5-13 keep their re-homed
lesson files. A package lesson must equal its catalog entry (`lesson_key`, kind, name, order,
`config_id` = capability binding, quiz ↔ `quiz`, `manual` ↔ `guide`) and a chapter package must cover
all of its catalog lessons, otherwise the API does not start. Containers (`callout`, `details`) may hold
leaf blocks only; chart blocks, computed-table charts and question figures must resolve in
`charts.vi.json`; images must be under `/assets/academy/chNN/`.

- The lesson API returns the blocks as they are plus the chart models its chart blocks use; the
  attempt API projects questions field by field (`id topic section prompt hint figure options[id,text]`),
  never `source_id`, the key or an explanation. Question and option order are shuffled per attempt.
- A bank is identified by `questions_version`: sha256 of the lesson's 8 private questions plus the
  chart models of their figures (`package-v1`), or of the parsed legacy question file (`legacy-v1`).
  **Changing a bank (or a question chart) changes its version.** Before shipping the change, move the
  previous bank to `content/archive/banks/<questions_version>.json` (`packageBankArchiveFile()` builds
  the file), mark it `superseded` in `content/archive/banks.index.json` and register the new version as
  `current`; `academy-content.test.ts` fails until you do. Open attempts are graded with the bank they
  were created with.
- `content/lessons/ch01-l0N` and `ch03-l0N` keep only a stub (`superseded_by` + the worked `fixture`
  read by the quant registry tests); their sections and banks live in the packages and the archive.

## Do-not-copy enforcement

`verify.ts` (and the extractor) scan every string and key of the public files and the question
texts: preview labels (`preview`, `Mẫu Chương`, `Thông tin mẫu`), `HTML`, `spec`, `http(s)`,
`localStorage`, client grading/state (`shopTransaction`, `navigator.locks`, `completedIds`,
`CH1.grade`, `IQX_CH*`, `SHOP`, `rewardGranted`), shell and mascot assets (`mascotAsset`,
`petAsset`, `registryData`, `catalogData`, `academyContractData`), embedded media (`data:image`,
`base64,`), `<script>`/`<style>`/handlers/`style=`, and the keys `proof basis change_log review
reference_runs reference_filter defaults fields content_status capture_kind datasets`. Answer keys
(`correct`, `correct_option_id`, `explanation`) must not appear in lessons or charts.

## Known ambiguities

- The C3 spec publishes no hash for the raw text of `ch3-content-data`; the value observed in the
  supplied file is pinned (`payload_text_in_spec: false` in the manifest).
- The C2 spec publishes no per-lesson object hashes; they are computed and recorded, not gated.
- `package_version` keeps the full payload version; the `-preview` suffix of C4 is dropped.
