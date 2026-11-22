# PLAN · Học viện v5 (17 chương · 203 bài)

> Spec: `IQX-Hoc-Vien-SPEC-v5.md` (07/11/2026). Content source: `IQX-Hoc-Vien-v5-MAU.html`
> (sha256 `6e963a09a9f12a7159517175108ee3b0302c49f940f5ed709017b95fe6487dc6`, 3 607 272 B).
> Companion: `IQX-Dashboard-Phan-Tich-SPEC-v3.md` (planned by the Dashboard workstream).
> Task kind: architecture · priority 3 · migrations 0062–0064 reserved for this workstream (only 0062 used).

## 1. Current state (v4 + v4.1, live)

| Area | Where | Notes |
|---|---|---|
| Content (served) | `backend/src/modules/academy/content/v4/` | `catalog.json` (12 ch, 116 lessons + `ch03-practice` + 12 exams), `lessons/<id>.vi.json` (117), `questions/<id>.private.json` (129 banks), `retired-lessons.json`, `import-manifest.json`, `schema.ts` (zod contract, 1989 lines; also OpenAPI source via `.meta({id})`) |
| Content pipeline | `backend/scripts/academy-v4-import/` | Deterministic importer pinned to the v4 mockup sha; parse5 walker (`blocks.ts` dispatch `div.three`, `div.ex2`, `div.roles`, `div.fig.tl`…), `IT` one-line JSON → banks (salted option ids, `overrides/salts.json`), text overrides, `verify` recomputes all charts. `npm run build && node dist/scripts/academy-v4-import/main.js extract|verify` |
| Loader | `academy.content.ts` (`ACADEMY_CONTENT_DIR = content/v4`, `itemsByMetricKey` = 1:1 map), `academy.constants.ts` (catalog version, counts) | `content_version = canonicalHash(file)[0:16]` (automatic) |
| Progress / xu | `academy_completions` keyed by **`lesson_key`** (not id/order); `LESSON_REWARD_XU = 100` per first pass (`shop/lesson-reward.service.ts`), exams 0 | Re-ordering never touches the DB |
| Attempts | `academy_attempts.catalog_version`; drafts/resume and admin attempt stats filter on the current catalog version | A catalog bump drops in-progress attempts (same as v3.3→v4) |
| Configs (v4.1) | `academy_configs` (migration 0040): one `default` row (`free`, ch01..ch12) + optional `leader` rows; `display_no` computed; warning `DASHBOARD_METRIC_CHAPTER_REMOVED` driven by `item.metric_key` | Catalog-driven, works for ch08–ch17 unchanged |
| Deep link | `GET /api/v2/academy/link?metric=` → `resolveMetricLink()` in `academy.service.ts`: metric_key → exact title → `title ·` prefix, learner's chapters only; miss → `found:false` + current lesson | Front: `/hoc-vien/bai/:metric` (`App.tsx`) → `AcademyMetricRedirect` → `?tool=hoc-vien&metric=` → `pages/academy/deep-link.ts` |
| Representative charts | **Already drawn live** in the app: `kind: "fundamental"` chart model rendered by the shared `frontend/src/components/fundamental-charts` (`FundamentalChart`), via `pages/academy/charts/lesson-chart.tsx`; data in `charts/rep-data.ts` of the v4 importer | Only the *mockup* used static SVG. Dashboard v2 uses the same component |
| Dashboard link | `frontend/src/pages/demo-trading/analysis/model.ts::academyMetricHref` → `/academy?metric=<key>`; backend `dashboard.catalog.ts` owns `metric_key` (= chart id); `financials.industry.ts` `INDUSTRIES = thuong,nh,ck,bh` | Dashboard workstream changes these |

## 2. Mockup v5 structure (verified)

- 221 `article.lesson#lesson0..220` in catalog order (203 lessons + `Phòng tập` + 17 exams), same markup as v4.
- `const IT=[…]` one-line JSON (221 items `{c,k,n,t,ex,opt,q,p}`; lessons 5 q, exams 30 q, answer = option 0).
- `const REPD={…}` one-line JSON: 87 chart objects `C<ch>N<pos>` (Dashboard shape `name,kind,unit,labels,main,sub,ref,hero,mainUnit`; 11 kind-F entries use `v` instead of `main`). Kinds: B 62, F 11, A 8, E1 5, C 1. Units: %, lần, điểm %, ngày, **năm**. `ref = 1` on 6 B charts.
- 190 lines `FIG.draw("<svgId>","<kind>",{json})` — pure JSON, one per `svg[id]` in the new articles (190/190 match). Kinds: formula 104, hbar 59, lines 10, stack 10, wf 7.
- New-lesson markup set (87 articles): `h1`, `p.lead`, `div.col.sec.blk > h2`, `div.fig.tl > svg#id` (FIG), `div.fig.tl.rep[data-rep]` (REPD), `div.three`, `div.three.two`, `div.ex2 > .up/.dn`, `div.roles`, `div.fig.tl > table.cmp`, `p`, `div.take`, `div.done`. All already handled by v4 extractors except `.rep`, FIG svgs and `.three.two`.
- Diff v4 mockup → v5 mockup (v4 file found at `~/.Trash/OLD/IQX-Hoc-Vien-v4-MAU.html`, sha = v4 pin): 93 of 129 articles byte-identical. Changed: 8 ch1–7 lessons (only the v4.1 "Chương n" rewrites, already live via `overrides/text.json`), 17 ch8 lessons (`Với ngân hàng, chứng khoán, bảo hiểm` → `Ở các ngành`, + `Có bài riêng:` paragraph with `<a class="lk" href="#bai=…&nganh=…">` on 8), 10 ch9 lessons (9 new `Ở các ngành` sections + ROIC Stability text fix), exam titles. **All 32 kept ch10–12 lessons are byte-identical.**
- The 260 (name, nganh) pairs of the Dashboard v3 mockup (`const SEC`) all resolve by the §6.2 rule against v5 titles, each to Chương 8 or the industry chapter (checked: 260/260).

## 3. Gap table

| Spec | Today | Change | Task |
|---|---|---|---|
| §1 17 ch / 203 lessons | 12 / 116 | v5 catalog + 87 lesson files + 8 exam banks | T1 |
| §1.3 ch8 "Ở các ngành" + "Có bài riêng" | old section title | patch 17 files: rename section; append `lesson_links` block on 8 | T1 (+T3 renderer) |
| §1.4 ch9 "Ở các ngành" | none | patch 9 files: add last section (renders right before Tóm tắt) | T1 |
| §1.5–1.7 reorder ch10–12, +11 redo lessons | 11/10/8 | new order, kept ids frozen, new ids appended | T1 |
| §2.4 live rep charts | v4 already live | REPD → `fundamental` model; renderer needs `năm` 1 dp, `Mốc 1,00`, hide "Bảng số" | T1 + Dashboard renderer |
| §2.5 FIG figures | none | new chart kind `figure` (5 sub-kinds) + React SVG port | T1 schema, T3 renderer |
| §3 exams ch10–12 30 q (8/8/6 replaced), ch13–17 30 q new | v4 banks | banks rebuilt from `IT` | T1 |
| §4 x/203, 20 400 xu | derived from catalog | constants + texts | T2/T3 |
| §5.1 key (metric_key, nganh) | metric_key unique | `nganh` on catalog items, composite index | T1 schema, T2 runtime |
| §5.2 migration | — | no progress rewrite needed (keys kept) | T2 (0062 config only) |
| §6 link with `nganh` | metric only | resolver order nganh-chapter → ch8 → any; route + param | T2, T3 |
| §9 configs | default = 12 ch | default += ch13–17 (0062); leader configs untouched | T2 |
| §10 acceptance | — | unit + system + e2e at 390px | T4 |

## 4. Decisions (§11 and [DECISION] points)

| # | Point | Decision | Why |
|---|---|---|---|
| D1 | §1.13 release ch13–17 together or one by one | **Together**, one catalog `iqx-academy-v5.0-17ch-203lessons` | Mockup has all 5 chapters complete with exams; schema requires every chapter published; avoids a 2nd catalog bump (each bump drops open attempts) |
| D2 | §2.4 convert the 62 old rep charts to live drawing | **Nothing to do**: the app already draws them live with the shared renderer since v4 | Static images exist only in the mockup |
| D3 | §5.2 keep passed exams ch10–12 | **Keep**: exam keys stay `exam:ch10-v4`, `exam:ch11-v4`, `exam:ch12-v4`; only the bank changes | 73% questions unchanged (spec proposal); zero DB work |
| D4 | §9 add ch13–17 to existing leader configs | **No**. Migration 0062 adds ch13–17 only to the `default` config (+1 `academy_config_logs` row); leader rows untouched | Spec proposal: sequential groups are not disrupted; admin enables per group |
| D5 | §9 Học button when the group lacks the industry chapter | **Fall back to Chương 8** (resolver order nganh → ch8 → any, learner's chapters only); new-only metrics with no ch8 lesson → `found:false` + current lesson (v4.1 rule) | Spec proposal; falls out of the resolver |
| D6 | §11.6 content review of 87 lessons | Import as-is from the owner-approved mockup; owner/finance review is a **pre-deploy checkpoint** (T4 exports a review list). Fixes go through `overrides/text.json` + re-import, never hand edits | Keeps dev unblocked; importer is re-runnable |
| D7 | New lesson ids | Kept 116 ids unchanged; new ids appended per chapter in order of appearance: ch10-l12..l15, ch11-l11..l14, ch12-l09..l11, ch13-l01..l19, ch14-l01..l15, ch15-l01..l13, ch16-l01..l15, ch17-l01..l14 | Keeps `^ch\d{2}-l\d{2}$` (DB varchar(32), front `LESSON_ID` regex) |
| D8 | lesson_key of the 87 new lessons | `fundamental:<metric_key>-<nganh>` (e.g. `fundamental:roe-nh`); the 62 v4 metric lessons keep `fundamental:<metric_key>` | metric keys are snake_case → `-` is an unambiguous separator; fits `ck_academy_completions_key`; no collision with retired keys (T1 test) |
| D9 | Exam keys ch13–17 | `exam:ch13-v5` … `exam:ch17-v5` | New keys, never collide with retired `exam:ch13` (v3.3) |
| D10 | `nganh` of catalog items | `chung` (ch8), `thuong` (ch9), `nh ck bh bds dk bl dien vl` (ch10–17), `null` outside ch8–17 | Spec §5.1/§7 |
| D11 | ch1–7 text | Keep live v4 files (v4.1 fixes already applied); T1 logs ch1–7 text drift vs v5 mockup as manifest warnings only | Spec §1.2 "giữ nguyên" |
| D12 | "Bảng số" in lessons | Hidden in Học viện (prop on shared renderer, default shown) | Spec §2.4 ("chỉ bỏ nút Bảng số") |
| D13 | Attempt stats across catalog bump | Submitted-attempt counts/best scores read from `{v5, v4}` versions for the same `lesson_key`; open drafts only v5 | Avoids admin/team-lead views showing 0 attempts after deploy |
| D14 | API name | Extend existing `GET /api/v2/academy/link?metric=&nganh=` (no new `lesson-link` endpoint); Dashboard links to the route, not the API | One resolver, backward compatible |
| D15 | Content folder | New `content/v5/` (served, full set) built by new `scripts/academy-v5-import/` from **frozen `content/v4/` + v5 mockup**; `content/v4/` and the v4 importer stay untouched (their verify/tests stay green). Delete v4 later as cleanup | Reuses the 117 audited v4 files byte-for-byte; idempotent re-runs; no churn in v4 chart builders |

## 5. Data model (content/v5/schema.ts = evolved copy of v4 schema)

- `ACADEMY_V5_CATALOG_VERSION = 'iqx-academy-v5.0-17ch-203lessons'`, chapter count 17, lesson count 203; `format` strings unchanged.
- `nganhSchema = z.enum(['chung','thuong','nh','ck','bh','bds','dk','bl','dien','vl'])`; `NGANH_CHAPTER` map (chung→8 … vl→17).
- `catalogItemSchema` + `nganh: nganhSchema.nullable()`; rules: `metric_key !== null ⇔ ch ≥ 8 lesson ⇔ nganh !== null`; `nganh === NGANH_OF_CHAPTER[ch]`; `(metric_key, nganh)` unique; `lesson_key ∈ {fundamental:<mk>, fundamental:<mk>-<nganh>}`; lesson id = position **except** ch10–12 (ids unique, chapter-prefixed; exact mapping pinned by the importer's catalog table + T1 test).
- `examKeyOf`: ch ≤ 7 `exam:chNN`, 8–12 `exam:chNN-v4`, 13–17 `exam:chNN-v5`.
- New chart kind `figure` (in `chartModelSchema`, not in leaf union):
  `{kind:'figure', fig:'formula', items:[{t,v,tone,notes?,hl?,size?}], ops:string[], height}` ·
  `{fig:'hbar', title?, items:[{label,value,tone}], decimals, unit, note?, label_width?, row_height?, max?}` ·
  `{fig:'stack', title?, parts:[{label,value,tone}], decimals, unit, note?}` ·
  `{fig:'wf', title?, items:[{label,value,step:'base'|'plus'|'minus'|'total', tone?}], decimals, unit, height?}` ·
  `{fig:'lines', title?, rows:[{report,line,code?,tone?}]}`. Tones = `chartToneSchema`; mockup colour keys map via hex through v4 `charts/tones.ts`. All text via `chartString` (dash/arrow/"Chương n" bans apply).
- New static block `lesson_links`: `{type:'lesson_links', lead: inlineHtml, links:[{label: plainText, metric_key, nganh}] (1..8), tail?: inlineHtml}` — built from the `<a class="lk">` paragraphs (ch8 "Có bài riêng", ch9 "Ở các ngành"); target resolved at runtime through the link API.
- `fundamental` model unchanged (already accepts B+`ref`, 2 main lines, 3 sub series, F with dates); importer converts REPD F `{v}` → `main:[{name,v}]`.
- `linkQuerySchema` + `nganh` (optional, `z.string().max(16)`, unknown value ignored, never 400); `linkResponseSchema` + `nganh` (of the found lesson, nullable).

### Metric-key contract (shared with Dashboard v3)

> **RESOLVED by main agent (2026-11-22):** the authoritative key list is `PLAN-dashboard-v3.md` §6.3 (e.g. `buyer_prepay_to_revenue`, `buyer_prepay_growth`, `unearned_to_equity`, `prepay_receivables_to_equity`, `st_debt_share`, `cash_to_st_debt`, `fin_income_to_pbt`, `core_margin`, `st_debt_to_inventory`, `revenue_to_fixed_assets`, `non_interest_fin_cost_to_pbt`, `dividend_payout`). The table below is superseded wherever names differ. Formula variants (`roe_fin`, `net_margin_bh`, `gross_margin_q`) keep lesson keys `roe`, `net_margin`, `gross_margin`.
> **Học button URL:** Dashboard emits `/academy?metric=<metric_key>&nganh=<nganh>`. Học viện must honour `nganh` on `/academy`, `/hoc-vien/bai/:metric?nganh=` and through `academy-redirect.tsx`, `workspace-url.ts`, `deep-link.ts`.

Redo lessons reuse the v4 keys: `revenue_yoy, revenue_growth_stability, net_margin_stability, roe, roa, net_margin, pe, pb, gross_margin, roic, ccc, debt_equity, interest_coverage, net_debt_ebitda, cfo_profit, fcf_margin, ev_ebitda`. 28 new keys (41 "Mới" lessons; a key may serve several industries):

| key | Dashboard name | nganh |
|---|---|---|
| `non_core_profit_to_pbt` | Lợi nhuận ngoài kinh doanh bất động sản / LNTT | bds |
| `customer_advances_to_revenue` | Người mua trả tiền trước / Doanh thu | bds, dk |
| `customer_advances_growth` | Tăng trưởng người mua trả tiền trước | bds |
| `unearned_revenue_to_equity` | Doanh thu chưa thực hiện / VCSH | bds |
| `inventory_to_assets` | Tồn kho / Tổng tài sản | bds |
| `inventory_years` | Số năm bán hết tồn kho | bds |
| `investment_property_share` | Tỷ trọng bất động sản đầu tư | bds |
| `receivables_prepayments_to_equity` | Phải thu và trả trước / VCSH | bds |
| `short_term_debt_share` | Tỷ trọng nợ vay ngắn hạn | bds |
| `cash_to_short_term_debt` | Tiền / Nợ vay ngắn hạn | bds |
| `interest_paid_to_expense` | Lãi vay đã trả / Chi phí lãi vay | bds |
| `inventory_days` | Số ngày tồn kho | dk, bl, vl |
| `depreciation_to_revenue` | Khấu hao / Doanh thu | dk, dien |
| `capex_to_depreciation` | Capex / Khấu hao | dk, dien, vl |
| `net_cash_to_equity` | Tiền ròng / VCSH | dk |
| `financial_income_to_pbt` | Thu nhập tài chính / LNTT | dk |
| `dividend_payout` | Tỷ lệ chi trả cổ tức | dk, bl, dien |
| `sga_to_revenue` | Chi phí bán hàng và quản lý / Doanh thu | bl |
| `core_operating_margin` | Biên lợi nhuận kinh doanh chính | bl |
| `inventory_provision_ratio` | Dự phòng giảm giá tồn kho / Tồn kho | bl, vl |
| `payables_to_inventory` | Phải trả người bán / Tồn kho | bl |
| `short_term_debt_to_inventory` | Vay ngắn hạn / Tồn kho | bl, vl |
| `fixed_asset_turnover` | Doanh thu / Tài sản cố định | bl |
| `ebitda_margin` | Biên EBITDA | dien, vl |
| `fixed_assets_to_assets` | Tài sản cố định / Tổng tài sản | dien |
| `cip_to_fixed_assets` | Xây dựng dở dang / Tài sản cố định | dien, vl |
| `receivable_days` | Số ngày thu tiền | dien |
| `non_interest_finance_cost_to_pbt` | Chi phí tài chính ngoài lãi vay / LNTT | dien, vl |

The Dashboard workstream owns `dashboard.catalog.ts`; it adopts these keys or sends replacements (e.g. reusing screener `payout_ratio` if the formula matches) **before T1 freezes `catalog-table.ts`**. The cross-check test (T4) fails on any mismatch.

## 6. Migrations

- **0062_academy_v5_default_config.sql** (idempotent): for the `default` row only, append `ch13..ch17` that are missing (keep catalog order), `updated_at = now()`, and insert one `academy_config_logs` row (`action 'update'`, `changed_by NULL`, `before/after` jsonb) only when something changed. Leader rows untouched (D4).
- No progress/reward migration: completions and rewards are keyed by `lesson_key`, every v4 key is kept, reorder is catalog-only (§5.2.1, §10.9).
- 0063, 0064: reserved, not used.

## 7. API / runtime changes (backend)

- `content/v5` becomes `ACADEMY_CONTENT_DIR`; imports `./content/v4/schema.js` → `./content/v5/schema.js` in `academy/*`; `ACADEMY_PREVIOUS_CATALOG_VERSIONS` += `iqx-academy-v4.0-12ch-116lessons`; `scripts/copy-assets.ts` copies `academy/content/v5` only (v4 is a frozen importer base, not runtime).
- `academy.content.ts`: `itemsByMetricKey: Map<string, AcademyItem[]>` (catalog order) + `itemByMetricNganh: Map<"mk|nganh", AcademyItem>`.
- `resolveMetricLink(content, program, metric, nganh?)`, learner's chapters only, first hit wins:
  1. by key: (mk, nganh) → (mk, `chung`) → any item with mk (program order);
  2. by name (exact title, then `name ·` prefix): in the nganh chapter → Chương 8 → all chapters (metric lessons first, as today);
  3. miss → `found:false`, current lesson (unchanged).
  Without `nganh` the order is program order (ROE → Chương 8, NIM → Chương 10), matching §6.2.
- Catalog/progress responses expose `nganh` per item (generated client picks it up).
- D13: `attemptStatsAll` and `academy-progress-reader` submitted stats over `[current, v4]` catalog versions; open-attempt / draft logic unchanged (current only).
- OpenAPI + generated client regenerated (`backend: npm run contracts:generate`, `frontend: npm run contracts:generate`).

## 8. Shared chart component (decision)

- **Owner: Dashboard workstream** — `frontend/src/components/fundamental-charts/**` (already shared by Dashboard v2 and Học viện v4). Dashboard v3 §9/§10 drives every renderer change (unit `năm` 1 dp, `Mốc 1,00` label for B `ref`, zero line with negatives, second line `#f5d76e`), and it has the larger surface (period slicing, table, 9 industries). One owner avoids two workers editing the same files.
- **Học viện consumes** it unchanged through `frontend/src/pages/academy/charts/lesson-chart.tsx` and asks for one prop: `FundamentalChart` `tableToggle?: boolean` (default `true`); Học viện passes `false` (D12). Soft dependency: until it lands, lessons simply keep the "Bảng số" button.
- **Học viện owns** the new FIG renderer `frontend/src/pages/academy/charts/figure-chart.tsx` (lesson-only figures, not used by the Dashboard).
- Representative-chart data for v5 lessons is the Dashboard chart object (`name, kind, unit, labels, main, sub, ref, hero, mainUnit`) stored in the lesson file, so a Dashboard renderer change applies to both.

## 9. Work breakdown (disjoint file sets)

Workers: Claude sub agents only (owner rule 2026-11-20). T1/T2 `backend` → `opus` medium; T3 `frontend` → `opus` high; T4 `qa` → `opus` medium. Priority 3. Do not scan `node_modules/`, `dist/`, `mobile/`. Each task on its own branch/worktree; main agent merges.

### T1 · Content schema + v5 importer + generated content (kind `backend`)

Files (only): `backend/src/modules/academy/content/v5/**` (new: `schema.ts`, `catalog.json`, `lessons/`, `questions/`, `retired-lessons.json`, `import-manifest.json`), `backend/scripts/academy-v5-import/**` (new), `backend/test/unit/academy-v5-content.test.ts`, `backend/test/unit/academy-v5-schema.test.ts`, `backend/test/fixtures/academy-v5/**`.
Steps:
1. `git mv`-free copy: `content/v5/schema.ts` from v4 schema, apply §5 (17 ch, nganh, figure kind, lesson_links block, exam keys, link query/response fields, counts/version).
2. Importer (`main.ts extract|verify`, sha pin of the v5 mockup, default `--source backend/docs/update-22-11/IQX-Hoc-Vien-v5-MAU.html`): `catalog-table.ts` = 221 rows (id, kind, lesson_key, metric_key, nganh, name, order) with the frozen v4 ids (D7) and §5 key table; import v4 library modules (`dom.ts`, `inline.ts`, `extractors/*`, `banks.ts`, `write.ts`, `charts/tones.ts`) instead of copying; own walker with extra dispatch `div.three.two` → cards(2), `div.fig.tl.rep` → `fundamental` chart `c{ch}l{n}-rep` from `REPD`, `svg[id]` → `figure` chart from the `FIG.draw` JSON (190 ids).
3. Compose output: copy 117 v4 lesson files + 116 v4 lesson banks + ch1–9 exam banks from `content/v4` (rewrite only `order`/`chapter` fields where needed); patch 17 ch8 files (section rename, `lesson_links` on 8) and 9 ch9 files (append section `Ở các ngành`) from the v5 articles; build 87 new lesson files; banks for 87 lessons + 8 exams (ch10–17) from `IT` via v4 `buildBank`; salts in `overrides/salts.json` (reuse v4 salts for existing item ids, new 32-byte salts for new ids, committed); `overrides/text.json` for dash/"Chương n" fixes (unused entries fail).
4. `verify`: schema parse of every file; counts 17/203/1/17; ch lesson counts 10,10,9,10,4,4,7,17,16,15,14,11,19,15,13,15,14; ch10–12 order = spec §1.5–1.7; every v4 (id, lesson_key) present unchanged; no literal `Chương <digit>`; each new lesson has exactly 1 rep chart + section titles of §2.1; every FIG id used; byte-identical rerun.
Acceptance (§10): 1 (catalog side), 2, 3, 4, 5, 6, 8 (data: ROE nh/ck/bh 2 lines, gross margin dk/vl "Biên gộp quý" stacked), 10.
Verify: `cd backend && npm run build && node dist/scripts/academy-v5-import/main.js extract && git diff --exit-code src/modules/academy/content/v5 && node dist/scripts/academy-v5-import/main.js verify && npx vitest run test/unit/academy-v5 test/unit/academy-v4 && npm run lint && npm run typecheck`.

### T2 · Backend runtime, link API, migration (kind `backend`, after T1)

Files: `backend/src/modules/academy/*.ts` (not `content/**`), `backend/scripts/copy-assets.ts`, `backend/migrations/0062_academy_v5_default_config.sql`, `backend/test/unit/academy.test.ts`, `academy-boot.test.ts`, `academy-config.test.ts`, `academy-attempt-resume.test.ts`, `academy-test-kit.ts`, `team-insights.test.ts`, new `backend/test/unit/academy-v5-link.test.ts`, backend OpenAPI artefacts + `frontend/src/lib/generated/**` (contract regeneration only).
Steps: switch schema/dir imports (§7); constants (17/203, previous versions); `itemsByMetricKey` multi-map + `(mk|nganh)` map; `link(userId, metric, nganh?)` + controller query + response `nganh`; resolver order §7; D13 stats; migration 0062; update unit tests' expectations (116→203, 12→17); regenerate contracts.
Acceptance (§10): 1 (API), 7 (resolver), 9 (NIM passed in v4 → `passed` at ch10 position 2), §9 (default config 17 ch, leader configs unchanged, warning for ch8–17 removal).
Unit tests to add: the 5 rows of §6.2; `ROE&nganh=thuong` → ch8; group without ch13 + `pe&nganh=bds` → ch8; `inventory_years&nganh=bds` without ch13 → `found:false`; unknown `nganh=xx` ignored; completions with v4 keys → v5 progress counts (116 passed stay passed, 87 open).
Verify: `cd backend && npm run build && npx vitest run test/unit/academy test/unit/team-insights && npm run verify` · migration on a copy of prod schema: `npm run db:migrate` twice (second run no-op), then `select chapter_ids from academy_configs where owner_type='default'`.

### T3 · Frontend Học viện (kind `frontend`, after T2 contracts)

Files: `frontend/src/pages/academy/**` (new `charts/figure-chart.tsx`, `blocks/lesson-links-block.tsx`; edit `charts/lesson-chart.tsx`, `blocks/block-renderer.tsx`, `deep-link.ts`, `api.ts`, `content-types.ts`, tests/fixtures), `frontend/src/pages/demo-trading/academy-redirect.tsx`, `frontend/src/pages/demo-trading/workspace-url.ts` (+ test: add `NGANH_PARAM` only), `frontend/src/pages/admin/academy/**` (visible "12 chương" texts, fixtures 203/17).
Steps: FIG port (`formula`, `hbar`, `stack`, `wf`, `lines`) as responsive SVG, viewBox 760, auto height, theme tokens (no grey text), readable at 390px; `lesson_links` renders links to `?tool=hoc-vien&metric=<mk>&nganh=<ng>`; deep link carries `nganh` to `fetchLink(metric, nganh)` and drops both params on settle; `/hoc-vien/bai/:metric?nganh=` keeps `nganh`; pass `tableToggle={false}` once the Dashboard renderer exposes it; admin texts derived from catalog (no literal 12/116).
Acceptance (§10): 2 (links open the right lesson), 5 (rep chart + figures render), 7 (route), 8 (visual), 11 (390px, no grey text, no blank figure).
Verify: `cd frontend && npm run contracts:check && npx vitest run src/pages/academy src/pages/admin/academy src/pages/demo-trading/workspace-url.test.tsx && npm run typecheck && npm run lint && npm run build`.

### T4 · QA, cross-workstream checks, acceptance (kind `qa`, after T2+T3 and the Dashboard catalog/renderer tasks)

Files: `backend/test/unit/academy-v5-dashboard-pairs.test.ts`, `backend/test/fixtures/academy-v5/dashboard-v3-pairs.json` (260 pairs extracted from `IQX-Dashboard-Phan-Tich-v3-MAU.html` `const SEC`), `backend/test/system/academy-v5.system.spec.ts` (+ retarget `academy-v4.system.spec.ts`, `academy-config.system.spec.ts`), `frontend/e2e/academy-v5.spec.ts` (+ retarget `academy-v4.spec.ts`), `backend/docs/update-22-11/ACCEPTANCE-hoc-vien-v5.md`, `backend/docs/update-22-11/REVIEW-hoc-vien-v5-content.md` (list for D6).
Steps: (a) 260 pairs by name and nganh → found, chapter ∈ {ch08, chapter(nganh)}; (b) same by `metric_key` over `dashboard.catalog.ts` v3 for all 9 industries, plus `INDUSTRIES ⊆ nganh enum` (skipped with a clear message until the Dashboard catalog lands, then mandatory); (c) system: v4-passed user sees 116 passed incl. NIM at ch10 #2, 87 open, ch10–12 exams still passed, xu unchanged, first pass of a new lesson +100 xu, total reachable 20 400; (d) e2e 390px: sidebar "203 bài học", ch8 "Có bài riêng" links, §6.2 examples, one lesson per chapter 13–17, no horizontal overflow; (e) write ACCEPTANCE (11 criteria, evidence).
Verify: `cd backend && npx vitest run test/unit/academy-v5 && npm run test:system -- academy` · `cd frontend && npx playwright test e2e/academy-v5.spec.ts e2e/fundamental-charts-390.spec.ts`.

## 10. Ordering and dependencies

```
Dashboard: metric-key confirmation ──► T1 (freeze catalog-table) ──► T2 ──► T3 ──► T4 ──► deploy
Dashboard: renderer (năm, Mốc 1,00, tableToggle) ───────────────────────────────┘ (T3 soft, T4 hard)
Dashboard: catalog v3 + INDUSTRIES 9 codes + academyMetricHref(key, nganh) ──────┘ (T4 hard)
```
- T1 can start immediately for everything except the 28 new keys (placeholder table, finalised on confirmation).
- Contract for the Dashboard "Học" button: `/hoc-vien/bai/<metric_key>?nganh=<code>` (frontend route; Dashboard edits its own `model.ts`).
- Deploy Học viện v5 and Dashboard v3 in the same release (Dashboard links need the new lessons; v5 lessons link back only via the route). If Dashboard slips, Học viện v5 can ship alone: links still resolve by name.
- Shared hotspot: `frontend/src/pages/demo-trading/workspace-url.ts` — T3 adds one constant + parser; any other workstream touching it rebases on T3.

## 11. Prod risks

| Risk | Impact | Mitigation |
|---|---|---|
| Catalog bump drops open quiz attempts/drafts | Users mid-quiz lose answers once | Deploy off-hours (after 22:00 ICT); same behaviour as v4 rollout; D13 keeps history counts |
| Progress carry-over | A key change would reset passes and re-pay xu | T1 test: all 116 v4 `(id, lesson_key)` identical; reward dedupe stays on `lesson_key`; T4 system test on a prod-shaped user |
| Xu supply 11 700 → 20 400 per user (+8 700, 87 × 100) | Economy inflation | Owner-accepted in spec §4; monitor `lesson_rewards` count/day after deploy |
| Default config change is instant for every default-config user | 5 new chapters appear in the sidebar | Intended (spec §9); leader groups unchanged; 0062 logs the change |
| Leader groups without ch13–17 hit bds/dk/… new metrics on Dashboard | Học opens current lesson (no ch8 lesson) | Spec v4.1 rule; T4 lists affected groups for the admin |
| Unreviewed content (§11.6) | Wrong reference levels / line codes | D6 checkpoint before deploy; fixes via overrides + re-import |
| Migration | 0062 only touches one config row | Idempotent; dump before deploy (`pre-hv5-*.dump`), rollback = previous release + `update academy_configs set chapter_ids = <before>` from the log row |
| Repo/dist size | +~3 MB content | Server-only; v4 copy excluded from dist |
