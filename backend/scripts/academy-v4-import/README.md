# academy-v4-import

Deterministic importer for Học viện v4. It reads the approved mockup and writes everything under
`src/modules/academy/content/v4/` except `schema.ts`:

| Output                             | Count                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `catalog.json`                     | 12 chapters, 116 required lessons + 1 optional practice + 12 exams      |
| `lessons/<item id>.vi.json`        | 117 lessons (116 + `ch03-practice`)                                    |
| `questions/<item id>.private.json` | 129 banks, 855 questions (private, salted option ids)                  |
| `retired-lessons.json`             | 22 old lesson keys (kept as is unless `--retired-from` is passed)      |
| `import-manifest.json`             | source sha, gates, counts, output sha256, warnings                     |

`catalog_version` is `iqx-academy-v4.0-12ch-116lessons`. The 116 required lessons are Chương 1-7 (54 lessons: 10, 10,
9, 10, 4, 4, 7; Chương 3 also has the optional `ch03-practice`) and Chương 8-12 (62 metric lessons: 17, 16, 11, 10,
8, each with a `metric_key`); the exams are `ch01-exam` ... `ch12-exam`.

## Source

- Path: `$ACADEMY_V4_SOURCE`, else the default in `paths.ts` (outside the repo): `IQX-Hoc-Vien-v4-MAU.html`
- SHA-256: `1ba9407d6033c319b14426d3dc83af6e7602aaf3b1657725ca8dd51ada729a0c` (any other file is refused)
- `--source` overrides `$ACADEMY_V4_SOURCE`.

## Run

```sh
cd backend && npm run build
node dist/scripts/academy-v4-import/main.js extract --source "$ACADEMY_V4_SOURCE"
# reruns must be byte-identical
node dist/scripts/academy-v4-import/main.js extract && git diff --exit-code src/modules/academy/content/v4
node dist/scripts/academy-v4-import/main.js verify
```

`extract` runs `verify` at the end. The importer runs as compiled JS (`dist/`), so rebuild after editing a builder.
`--retired-from <catalog-13ch.v1.json>` is only needed to create `retired-lessons.json` from scratch; later runs keep
the stored file and drop the keys that came back to the live catalog.

`verify` pins `catalog.json` to `catalog-table.ts`, recomputes every manifest count and every chart from code, and
freezes the practice notes keys. Notes are saved per account under those keys, so a change that renames a
workpad, checklist item or roleplay id fails `verify` on purpose: update the fingerprint only together with a plan for
the saved notes. `test/unit/academy-v4*.test.ts` cover the schema, the chart builders and the 62 representative charts.

## Layout

| File                                       | Role                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `main.ts`                                  | CLI (`extract`, `verify`)                                                                               |
| `extract.ts`                               | source -> all outputs (gates, schema checks, manifest); `write: false` for tests                        |
| `paths.ts`                                 | source sha, default source, output directory (resolved from the package root, never from `dist`)        |
| `catalog-table.ts`                         | the only place lesson keys, `metric_key`s, chapter titles and exam intros live                          |
| `source.ts`                                | sha gate, parse5, `article#lesson0..128` -> catalog rows, the question literal                          |
| `dom.ts`, `inline.ts`                      | parse5 helpers; inline HTML allowlist and text normalisation                                            |
| `blocks.ts`                                | section walker + dispatch table; an unknown element is a hard failure with its path                     |
| `extractors/*.ts`                          | one function per mockup pattern                                                                         |
| `charts/math.ts`                           | mockup chart helpers ported verbatim (rng, series, path, sma, EMA first-seeded, Wilder RSI, bands)      |
| `charts/ch1.ts`, `ch2.ts`, `ch4.ts` ... `ch7.ts` | `CHART_BUILDERS` of Chương 1-7: one builder per chart id (hand ports of the page script)           |
| `charts/kit.ts`, `tech.ts`, `tones.ts`     | chart model helpers, the drawing library of Chương 6-13 (RNG, MA/EMA/DMI/Donchian ported verbatim), tone map |
| `charts/dropped.ts`                        | mockup charts that are not ported, each with its reason (the rest of the lesson stays)                  |
| `charts/o8.ts` ... `o13.ts`                | ports of the 33 metric lessons that moved into Chương 8-9; the builder keys keep the old v3.3 position (`o10l1-g1` is the ROE lesson, stored as `c8l11-g1`) |
| `charts/ch10.ts` ... `ch12.ts`             | the new bank / securities / insurance charts (29 lessons)                                               |
| `charts/fund.ts`                           | shared helpers for Chương 8-12: `bars()`, `lines()`, `chart()`, `gauge()`, `zones()`, `hb()`, `wf()`   |
| `charts/rep.ts`, `rep-data.ts`             | the 62 "biểu đồ đại diện" (one `fundamental` chart per metric lesson, own id space `c{chapter}l{lesson}-rep`) |
| `charts/text-figures.ts`                   | the svg drawings that become HTML blocks (receipts, tables, steps, tiles, funnel)                       |
| `charts/index.ts`                          | registry, in-svg legends, gate: DOM svg ids = builders + text figures + icons                           |
| `banks.ts`                                 | question literal -> bank files; option id = `HMAC-SHA256(hex-decoded salt, "<qid>\|<j>")[0:10]`        |
| `manifest.ts`, `verify.ts`, `write.ts`     | manifest schema, no-source checks, stable JSON                                                          |

## Keys

- `lesson_key` is the durable carry-over key (`technical:` / `fundamental:` / `concept:` / `guide:` / `exam:`). Every
  lesson of v3.3 keeps its key, so completions carry over; the 33 metric lessons of the old Chương 8-13 moved to
  Chương 8-9 and keep `fundamental:<metric id>`. Exam keys are `exam:chNN` for Chương 1-7 and `exam:chNN-v4` for
  Chương 8-12, so an old exam pass never counts for a rebuilt exam.
- `metric_key` (Chương 8-12 lessons only) is the Dashboard chart id, the same string the "Học" button of the
  Dashboard sends: `/academy?metric=<key>` and `GET /academy/link?metric=<key>` resolve it to the lesson. The 62 keys
  match the Dashboard v2 catalog one to one (checked by title); the new bank, securities and insurance lessons use
  `fundamental:<metric_key>` as their lesson key.

## Chapter numbers (Học viện v4.1)

A team lead's group may learn a subset of the 12 chapters, so the number a learner sees ("Chương 3") is the position in
HIS chapters, counted again from 1 by the server (`display_no`). Chapter ids, item ids, lesson keys and exam keys are
fixed (`ch01` ... `ch12`). Therefore:

- Lesson content (`lessons/*.vi.json`) never names a chapter number. A lesson that points at another lesson names it
  (`bài MA`, `bài Tìm khách hàng`) or the part it belongs to (`phần Nền tảng`); the 9 lessons of the mockup that said
  "Chương 2 · Bài 3", "Chương 4", "Chương 10" ... are rewritten in `overrides/text.json`. `schema.ts` fails the import
  when a lesson, chart or summary text contains `Chương <digit>`.
- Exam names and intros are templates with a `{n}` placeholder in `catalog-table.ts` (`Bài thi Chương {n}`, "... trong
  Chương {n}."). The server fills in the learner's `display_no`; the stored copy never holds a literal chapter number.
- Chapter titles (`Chỉ tiêu ...` for Chương 8-12 since v4.1 §6.2) carry no number either.

## Overrides

Nobody edits the output JSON by hand; fixes live here and are re-applied on every run.

- `overrides/text.json`: `{ "<exact source text>": "<replacement>" }`. Every en/em dash that the digit-range rule
  (`2015–2025` -> `2015-2025`) does not cover needs an entry, otherwise `extract` exits 1 and lists them. An unused
  entry also fails, so the file never goes stale.
- `overrides/questions.json`: corrections to the question literal applied before the banks are written.
- `overrides/salts.json`: one 32-byte hex salt per bank, generated once with `crypto.randomBytes` and committed. Same
  secrecy as the banks themselves: never serve it. Salts are keyed by item id, so renaming a `metric_key` never
  changes an option id.

## Porting decisions worth knowing

- Chart builders take no DOM input, so `verify` recomputes every model from code and compares it with the committed
  JSON. Indicator series are computed over the full generated history and exported for the window only, rounded to 4
  decimals; every index in a `series_panels` model is absolute.
- Pixel-drawn schematics (trend lines, Elliott waves, divergence) keep the mockup coordinates with y flipped
  (`domain.y = [0, viewBox height]`).
- Phone-readability re-kinds from the mockup: the lessons whose drawings were too wide for 317px became `compare`,
  `flow`, `segment_bar`, `steps` or `funnel` models (see the builder comments).
- The roleplay block takes its title from its section ("Đóng vai và chấm điểm"); bands 48 / 36 / 0 come from the
  page script.
- Each of the 62 representative charts is a `fundamental` chart rendered by the shared Dashboard renderer
  (`frontend/src/components/fundamental-charts`): the mockup draws them as static SVG (no `id`), so their numbers come
  from `charts/rep-data.ts`. Each Chương 8 lesson also has a "Với ngân hàng, chứng khoán, bảo hiểm" section.
- Chart deviations from the mockup, on purpose: labels are cut at 24 characters, tones map onto the 11 chart tones,
  no per-bar opacity.
