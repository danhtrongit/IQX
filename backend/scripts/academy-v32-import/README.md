# academy-v32-import

Deterministic importer for Học viện v3.2 (design: `backend/docs/academy-v32/design.md` §6). It reads the
approved mockup and writes everything under `src/modules/academy/content/v3/` except `schema.ts`:

| Output                             | Count                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| `catalog.json`                     | 14 chapters, ch1-5 published                                      |
| `lessons/<item id>.vi.json`        | 43 lessons + `ch03-practice`                                      |
| `questions/<item id>.private.json` | 49 banks, 280 questions (private, salted option ids)              |
| `retired-lessons.json`             | 66 old lesson keys (kept as is unless `--retired-from` is passed) |
| `import-manifest.json`             | source sha, gates, frozen counts, output sha256, warnings         |

## Source

- Path: `/Users/danhtrongit/Projects/IQX-sources/academy-v32/IQX-Hoc-Vien-MAU.html` (outside the repo)
- SHA-256: `52d11cb805ee8ce28dc6172908a6383b421947e128c0d908a3c92e389072059f` (any other file is refused)
- `--source` overrides `$ACADEMY_V32_SOURCE`, which overrides the default path.

## Run

```sh
cd backend && npm run build
# first run (creates retired-lessons.json from the old 13-chapter catalog)
git show d145fd5d:backend/src/modules/academy/content/catalog.v1.json > "$TMPDIR/catalog-13ch.v1.json"
node dist/scripts/academy-v32-import/main.js extract --source "$ACADEMY_V32_SOURCE" --retired-from "$TMPDIR/catalog-13ch.v1.json"
# reruns must be byte-identical
node dist/scripts/academy-v32-import/main.js extract --source "$ACADEMY_V32_SOURCE" && git diff --exit-code src/modules/academy/content/v3
node dist/scripts/academy-v32-import/main.js verify
```

`extract` runs `verify` at the end. `test/unit/academy-v32-import.test.ts` runs `verify` without the source and,
when `ACADEMY_V32_SOURCE` points at the mockup, re-extracts in memory and compares with the committed files.

## Layout

| File                                       | Role                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `main.ts`                                  | CLI (`extract`, `verify`)                                                                          |
| `extract.ts`                               | source -> all outputs (gates, schema checks, manifest); `write: false` for tests                   |
| `paths.ts`                                 | source sha, output directory (resolved from the package root, never from `dist`)                   |
| `catalog-table.ts`                         | the only place lesson keys live (design §0.1), chapter titles, stubs, exam intros                  |
| `source.ts`                                | sha gate, parse5, `article#lesson0..48` -> catalog rows, the `IT` question literal                 |
| `dom.ts`, `inline.ts`                      | parse5 helpers; inline HTML allowlist and text normalisation (§6.3)                                |
| `blocks.ts`                                | section walker + dispatch table; an unknown element is a hard failure with its path                |
| `extractors/*.ts`                          | one function per mockup pattern (§6.2 table)                                                       |
| `charts/math.ts`                           | mockup chart helpers ported verbatim (rng, series, path, sma, EMA first-seeded, Wilder RSI, bands) |
| `charts/ch1.ts` `ch2.ts` `ch4.ts` `ch5.ts` | `CHART_BUILDERS`: one builder per chart id (hand ports of the IIFEs)                               |
| `charts/text-figures.ts`                   | the 12 svg drawings that become HTML blocks (receipts, tables, steps, tiles, funnel)               |
| `charts/index.ts`                          | registry, in-svg legends, gate: DOM svg ids = builders + text figures + 3 icons                    |
| `banks.ts`                                 | `IT[g].q` -> bank files; option id = `HMAC-SHA256(hex-decoded salt, "<qid>\|<j>")[0:10]`           |
| `manifest.ts`, `verify.ts`, `write.ts`     | manifest schema, no-source checks (§6.5), stable JSON                                              |

## Overrides

Nobody edits the output JSON by hand; fixes live here and are re-applied on every run.

- `overrides/text.json`: `{ "<exact source text>": "<replacement>" }`. Every en/em dash that the digit-range rule
  (`2015–2025` -> `2015-2025`) does not cover needs an entry, otherwise `extract` exits 1 and lists them. An unused
  entry also fails, so the file never goes stale.
- `overrides/salts.json`: one 32-byte hex salt per bank, generated once with `crypto.randomBytes` and committed. Same
  secrecy as the banks themselves: never serve it.
- `overrides/blocks/`: reserved for RFC 6902 patches on an extracted lesson (none needed so far).

## Porting decisions worth knowing

- Chart builders take no DOM input, so `verify` recomputes all 114 models from code and compares them with the
  committed JSON. Indicator series are computed over the full generated history and exported for the window only,
  rounded to 4 decimals; every index in a `series_panels` model is absolute.
- Pixel-drawn schematics (trend lines, Elliott waves, divergence) keep the mockup coordinates with y flipped
  (`domain.y = [0, viewBox height]`).
- C1L1-g2 shows 7 full notes + 0.4 (the mockup drew 8). C1L9-g3 fills months between data points by linear
  interpolation.
- Phone-readability re-kinds: C1L2-g1 (compare of two flows), C1L5-g1, C1L6-g1, C1L6-g2 (flow), C1L2-g4 (narrow
  diagram), c2l3-g1, c2l5-g1, c2l6-g1 (segment_bar), c2l1-g2 (funnel block), C1L10-g4, C5L3-g3, C5L4-g0 (steps).
- `cmp.step` tables without `td.sx` (ch03-l07, ch03-l08) treat the first cell as a one-row group.
- The roleplay block takes its title from its section ("Đóng vai và chấm điểm"); bands 48 / 36 / 0 come from the
  page script.
