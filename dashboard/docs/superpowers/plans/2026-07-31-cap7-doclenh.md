# Cấp 7 «Đọc sổ lệnh» — Implementation Plan (levels program, increment 9)

> subagent-driven-development. Spec: `~/Downloads/DEMO TRADING/LEVEL 7/IQX-Cap7-Spec.md`. Principles: `~/Downloads/DEMO TRADING/IQX-NguyenTac-Chung.md`. Cấp 6 is being finished on `feat/cap6-doichieu` — Cấp 7 is CUMULATIVE on Cấp 0-6.

**Goal:** Cấp 7 «Đọc sổ lệnh» — *"Sổ lệnh cho thấy lực mua/bán ngay lúc này — nhưng lệnh treo chưa phải lệnh thật."* Add a READING layer over the bid/ask book that has been visible since Cấp 2: a **chỉ số Lực** the user must interpret themselves, plus a **cờ cảnh giác lệnh giả** that teaches skepticism without claiming detection.

**Architecture:** FE + BE, delta-only, mirroring Cấp 6 (`features/cap6/` → `features/cap7/`; `models/cap6.py` → `cap7.py`). Màu cấp: **hồng magenta `#c65cae`**, fill=7. Thực chiến only.

## Established facts this plan depends on (verified, do not re-derive)

- **The order book is already in the panel.** `dashboard/src/features/trading/TradingPanel.tsx:1420` calls `usePrice(symbol)` (from `@/features/market-data`); `data.bid` / `data.ask` are `{ price: number; volume: number }[]`, **3 levels** each (backend caps at 3: `backend/app/services/market_data/sources/vietcap.py:295-301`). `OrderBookView` at `TradingPanel.tsx:121-167` already renders them. **A Cấp 7 block inside `TradingPanel.tsx` reads the same `data` variable already in scope — add no hook, no query, and DO NOT rebuild the book** (spec §4: "thêm lớp phủ đọc… không dựng lại sổ").
- **The book is visible from Cấp 2 onward** — `hideOrderBook` at `TradingPanel.tsx:1438-1439` only hides it for Cấp 0/1. Nothing to change.
- **There is NO frontend trading-hours helper.** The authoritative one is backend: `is_trading_session(now=None, holidays=None) -> bool` at `backend/app/services/virtual_trading/price_resolver.py:100-120` (09:00-11:30 and 13:00-14:45, weekdays). **The FE must NOT compute market-open from the browser clock** — a user in another timezone would get the wrong answer. `trong_phien` comes from the server (see BE task).
- **Scoring "diễn biến ngay sau" reuses Cấp 5's machinery**: `add_trading_days(date, N, set())` from `backend/app/services/virtual_trading/settlement.py:26-43` for the target session, and the `get_adjusted_ohlcv(symbol, start, end)` pattern of `backend/app/services/cap5/service.py:207-237` (`_fetch_close_vnd`) for the close, including its holiday-tolerant fallback to the last bar strictly before the target. No other price source exists for this.
- **`order_kehoach` is defined in `backend/app/models/cap1.py:160-259`** (not in a per-cấp model file). Cấp 7's new columns go there, in a new `# --- Cấp 7 ---` section following the existing Cấp 1/2/3/4/6 sections.
- **Alembic head is `1df8155bcd7c`** (`alembic/versions/1df8155bcd7c_add_cap6_doi_chieu_trong_so_kieu.py`). Cấp 7's migration takes `down_revision = "1df8155bcd7c"`.
- **There is no central cấp→colour map.** Each cấp declares its hex in its own CSS file under a `/* Màu cấp: … */` header comment (e.g. `--cap6: #d64550` at `dashboard/src/features/cap6/cap6.css:17`). Cấp 7 declares `--cap7: #c65cae` in `cap7.css` the same way.

## Global Constraints (from spec — bind every task)

- **Cộng dồn:** the panel keeps Cấp 6's Đối chiếu + Cấp 4's Đọc-5-lớp + Cấp 3's Quản lý vốn + Cấp 2's SL/TP + Cấp 1's Vùng mua + Cấp 5's Đứng-ngoài **100% intact**. Cấp 7 adds a reading overlay only.
- **Chỉ số Lực = tổng dư MUA (3 mức) / tổng dư BÁN (3 mức)**, shown as a gauge + the raw totals + a "vì sao" sentence (§C12c). Bands: **Cầu áp đảo / Cân bằng / Cung áp đảo** — the exact ratio cut-offs are a Task-BE decision, documented as constants, and the FE must render the server-or-shared thresholds, never its own.
- **Hybrid, hệ KHÔNG quyết thay:** the system shows Lực + why; **the user picks `manh` / `can` / `yeu` themselves.**
- **SOFT, không cổng cứng** (spec §9): reading Lực is NEVER required to place an order. Nhiệm vụ ① needs it recorded ≥1 time. Do not gate MUA on it, ever.
- **Ngoài giờ giao dịch:** the book is static → the reading block shows *"Sổ lệnh chỉ sống trong giờ giao dịch — quay lại lúc thị trường mở để đọc lực."* and offers no guess UI. `trong_phien` comes from the server.
- **Cờ cảnh giác lệnh giả is EDUCATIONAL, heuristic, and must say so.** Trigger: one level's volume abnormally large vs the others (spec suggests > 3× the mean of the remaining levels — Task BE fixes the exact rule as a documented constant). It **never blocks**. The copy must state plainly that a large resting order **may or may not be real** — *"Lệnh treo to chưa chắc là cầu/cung thật — đôi khi là 'kê giá' rồi rút. Chờ nó KHỚP THẬT rồi hãy tin."* **NEVER claim the app detected a fake order**, never label it "lệnh giả" as a fact, never promise tick-level detection (spec §9 excludes it explicitly).
- **`doc_luc_dung` is scored SERVER-SIDE** from real price history 1-3 sessions after the buy. `luc_chi_so` and `luc_doc_user` are recorded at buy time, before the outcome is knowable — that time-lock is what makes the metric trustworthy even though `luc_chi_so` originates on the client (see BE task's honesty note).
- **§C12c provenance:** every number shows a 1-sentence plain-Vietnamese explanation and where it came from. VD `Đọc lực đúng: 58% (đoán cầu khớp diễn biến 14/24 lệnh)`.
- **Ngưỡng <3 lệnh đọc lực đã đóng → chỉ đếm, ẩn thống kê** (spec §7).
- Số en-US (thousands = comma, decimal = period: `1,240,000` · `1.9` · `58%`); negative percents use the typographic minus `−` (U+2212). Dates vi-VN. Ngôn ngữ Việt, giọng bình tĩnh.
- **KHÔNG huy chương, KHÔNG confetti, KHÔNG leaderboard, KHÔNG reset.**
- Cấp 8 chưa build → nút "Vào Cấp 8" hiện **"sắp ra mắt"**, không điều hướng. Cấp 8's colour for the forward-looking block: **xanh lá `#3f9b5a`**.
- **`npx tsc --noEmit` is a NO-OP in this repo** (solution-style tsconfig). The real typecheck is **`npx tsc -b`**, which `npm run build` also runs.

---

### Task BE: Cấp 7 backend

**Files:** `backend/app/models/cap7.py` (`Cap7Progress`) · extend `OrderKehoach` in `backend/app/models/cap1.py` (new `# --- Cấp 7 ---` section) · NEW migration (`down_revision = "1df8155bcd7c"`) · `backend/app/schemas/cap7.py` · `backend/app/services/cap7/service.py` · `backend/app/api/v1/endpoints/cap7.py` · register in `backend/app/api/v1/router.py` (both the import block ~line 30 and the `include_router` block ~line 83) · `backend/tests/test_cap7.py`.

**`Cap7Progress`:** `user_id` · `entered_at` · `task_1_done_at` · `task_2_done_at` · `task_3_done_at` · `so_lenh_doc_luc` · `so_lan_khong_duoi_theo_co` · `ty_le_doc_luc_dung` · `graduated_at` · `time_to_graduate_hours`. Mirror `models/cap6.py`'s shape exactly.

**New `order_kehoach` columns (all nullable — orders placed before Cấp 7 have none):**
`luc_chi_so` (numeric — the mua/bán ratio at buy time) · `luc_doc_user` (enum `manh`/`can`/`yeu`) · `doc_luc_dung` (bool, filled later by scoring) · `co_canh_giac_lenh_gia` (bool) · `hanh_vi_co` (enum `cho_xac_nhan`/`mua_duoi_theo`, nullable).

**Constants as documented data in the service** (the FE must never invent its own):
- The Lực band cut-offs mapping ratio → `cau_ap_dao` / `can_bang` / `cung_ap_dao`.
- The cờ-cảnh-giác rule (spec's suggestion: one level's volume > 3× the mean of the remaining levels).
- `SO_PHIEN_CHAM_LUC` — how many trading sessions after the buy count as "ngay sau" (spec says 1-3; pick one, document why, and expose it in the API response so the FE can say it out loud).
- The "đọc lực đúng" rule: `manh` correct if the close moved up beyond a small dead-band, `yeu` correct if down beyond it, `can` correct if it stayed inside it. **Define the dead-band as a documented constant** — without one, `can` is unfalsifiable and `manh`/`yeu` are decided by noise.

**Endpoints:**
- `GET /cap7/progress` — Cap7Progress + `trong_phien: bool` (from `is_trading_session()`, server clock) so the FE never uses the browser clock.
- `GET /cap7/phien` — `{trong_phien, gio_giao_dich_text, giai_thich}`; cheap, re-fetchable when the reading block mounts (the panel can stay open across the 11:30 boundary, so `trong_phien` must be refreshable independently of `progress`).
- `POST /cap7/enter` (requires cap6 graduated) · `PATCH /cap7/task`.
- `POST /cap7/kehoach {order_id, luc_chi_so, luc_doc_user, co_canh_giac_lenh_gia, hanh_vi_co}` — persist onto the existing `order_kehoach` row for that order. **Validate:** `luc_chi_so` finite and > 0; `luc_doc_user` in the enum; `hanh_vi_co` non-null **iff** `co_canh_giac_lenh_gia` is true (reject the inconsistent combination rather than silently normalising it). **Honesty note to write in the service docstring:** `luc_chi_so` is computed on the client from realtime data the server does not hold at request time, so it cannot be re-derived server-side — what makes the graduation metric sound is that it is committed *before* the outcome exists, and that `doc_luc_dung` itself is scored server-side from price history.
- `GET /cap7/thach-thuc` — the 3 sub-conditions with current value / target / `dat` / `giai_thich`: ≥ **15 lệnh** có đọc lực · **không đuổi theo ≥ 3 cờ** (count of `co_canh_giac_lenh_gia = true AND hanh_vi_co = 'cho_xac_nhan'`) · **tỷ lệ đọc lực đúng ≥ 55%**. Recompute server-side on read; do not trust stored aggregates.
- `POST /cap7/graduate` — 3/3 required.

**Scoring (lazy compute-on-read, like Cấp 5's `_score_due_decisions` — no cron):** for every order with `luc_doc_user` set, `doc_luc_dung IS NULL`, and a buy fill whose target session has passed, resolve the target date with `add_trading_days` and the close with the `get_adjusted_ohlcv` pattern from `cap5/service.py:207-237`, then apply the dead-band rule. Price unavailable → leave `doc_luc_dung` NULL and **exclude the order from the ratio's denominator** (an unscoreable order must not count as wrong). `ty_le_doc_luc_dung` counts only scored orders, and the response must say how many are still unscored.

**Gates:** TDD; `uv run pytest tests/test_cap7.py -q` + FULL `uv run pytest -q` (baseline **1493 passed, 47 skipped**); migration `upgrade head` + `downgrade -1` round-trip clean, run twice.
**Commit BEFORE the report:** `feat(cap7-be): Cấp 7 backend — chỉ số Lực + cờ cảnh giác + chấm đọc lực`.

---

### Task FE1: khối "Đọc sổ lệnh" + cờ cảnh giác trong panel

**Files:** create `dashboard/src/features/cap7/` — `types.ts`, `keys.ts`, `api.ts`, `hooks.ts`, `Cap7Context.tsx`, `docSoLenh.ts` (pure), `DocSoLenhBlock.tsx`, `cap7.css`, `index.ts` + tests. Modify `dashboard/src/features/trading/TradingPanel.tsx`.

**`docSoLenh.ts` (pure, fully unit-tested):**
- `tongDu(levels: {price:number;volume:number}[]): number` — sum of volumes.
- `lucChiSo(bid, ask): number | null` — `tongDu(bid) / tongDu(ask)`; **`null` when the ask total is 0 or the book is empty** (never `Infinity`, never a divide-by-zero render).
- `bandLuc(ratio: number): 'cau_ap_dao' | 'can_bang' | 'cung_ap_dao'` — using the cut-offs the BE documents.
- `coCanhGiac(levels): { hit: boolean; price: number; volume: number } | null` — the BE's documented outlier rule, applied across bid+ask levels; returns which level tripped it so the copy can name the price.

**`DocSoLenhBlock.tsx`:**
- Renders the totals, the gauge, the ratio, and the **"vì sao"** sentence, then the user's guess picker `[ Cầu mạnh ] [ Cân bằng ] [ Cầu yếu ]`. Reads bid/ask from the `data` already in `TradingPanel` scope — **passed in as a prop**, so the block stays pure-ish and testable; it must not call `usePrice` itself.
- **`trong_phien === false` → render only the ghi-chú** *"Sổ lệnh chỉ sống trong giờ giao dịch — quay lại lúc thị trường mở để đọc lực."* and no guess UI.
- **`lucChiSo` is `null` → say the book is too thin to read** (honest), no gauge, no fabricated band.
- The cờ, when tripped, renders below the gauge with the spec §5 copy verbatim and the `[ Tôi hiểu — chờ xác nhận ]` action. It **never blocks the panel**. Choosing nothing and buying anyway records `hanh_vi_co = 'mua_duoi_theo'`.
- **Copy constraint (assert in tests):** the block must never render the word `lệnh giả` as an assertion about the current book, and never claim detection. It says large resting orders *may* not be real.

**TradingPanel wiring:** purely ADDITIVE under `isCap7Active`. **No new gate** — Cấp 7 never blocks MUA. On the buy fill, `POST /cap7/kehoach` is awaited **after** cấp 1-6's kehoach posts on the same one `order_kehoach` row. Fire the Cấp 7 event bus on buy and sell like Cấp 6 does.

**Gates:** `npx tsc -b` · `npx vitest run` · `npm run build`. TDD; if the first run is green, mutate the logic to prove the tests bite, then revert.
**Commit BEFORE the report:** `feat(cap7-fe): khối Đọc sổ lệnh (chỉ số Lực) + cờ cảnh giác lệnh giả`.

---

### Task FE2: Kết sổ Cấp 7 + khối ⑯⑰

**Files:** `features/cap7/coachTemplateCap7.ts`, `KetsoModalCap7.tsx`, `portfolioAnalysisCap7.ts`, `Cap7PortfolioAnalysis.tsx` (+ CSS, + tests). Mirror the Cấp 6 equivalents.

- **`coachTemplateCap7.ts`** — composes `composeCoachCap6` (which composes 5→4→3→2→1; never rewrite them) and adds a 7th paragraph. **4 mẫu** per spec §6, using its copy: đọc đúng · đọc sai · có cờ + chờ xác nhận · có cờ + mua đuổi. The "đọc sai" cell must NOT scold — *"Lực sổ lệnh nhiễu và đổi nhanh — đừng đặt cược lớn chỉ vào lực tức thời."* The "mua đuổi" cell is a gentle reminder, **not a penalty** (spec §5: "không phạt cứng"). `doc_luc_dung === null` (unscored) → return `null` rather than guessing a cell.
- **`KetsoModalCap7.tsx`** — mirror `KetsoModalCap6`, keeping every Cấp 1-6 block including Cấp 5's phân-loại-4-ô gate. ADD a block showing: `Lúc mua: Lực = {band} ({ratio}:1) · Bạn đọc: "{đọc}"` / `Diễn biến ngay sau ({N} phiên): {±x.x%} → đọc lực ĐÚNG ✓ | CHƯA ĐÚNG` / `[nếu có cờ] Có cờ lệnh treo lớn ở {giá} — bạn: {chờ xác nhận | mua đuổi}`. Unscored → say "chưa tới hạn chấm", never render a verdict.
- **`portfolioAnalysisCap7.ts` + `Cap7PortfolioAnalysis.tsx`** — delegate to Cấp 6's for ①–⑮, then ADD:
  - **⑯ Đọc lực có đúng không** — the rate + trend. Findings per spec §7: ≥60% → *"Đọc lực đang là lợi thế vào lệnh của bạn."*; ~50% → *"Đọc lực chưa ổn định — dùng làm tham khảo thời điểm, đừng làm lý do chính."* **<3 closed đọc-lực orders → count only, hide the statistic.**
  - **⑰ Kỷ luật cảnh giác lệnh giả** — số lần gặp cờ · chờ xác nhận vs mua đuổi · compare the two groups' entry outcomes, with the same ≥3-per-group floor and an honest "chưa đủ dữ liệu" when unmet.

**Gates + commit BEFORE the report:** `feat(cap7-fe): Kết sổ Cấp 7 + khối ⑯⑰`.

---

### Task FE3: Hành trình + tốt nghiệp + routing C6→C7

**Files:** `JourneyPanelCap7.tsx`, `GraduationModalCap7.tsx`, `Cap7PortfolioAnalysisPanel.tsx`, `Cap7TradingPage.tsx` (+ CSS, + tests); modify `features/cap1/DauTruongPage.tsx`, Cấp 6's `GraduationModalCap6` ("Vào Cấp 7" must really enter Cấp 7), `RightSidebar` + sidebar-context, `features/cap7/index.ts`.

- `JourneyPanelCap7` — 3 nhiệm vụ + the Thách thức widget showing all 3 sub-conditions from `GET /cap7/thach-thuc` with its `giai_thich` verbatim.
- `GraduationModalCap7` — 3 khối per spec §3 (its copy verbatim). Khối 3 uses Cấp 8's **xanh lá `#3f9b5a`**; nút "Vào Cấp 8 «Quản trị rủi ro danh mục»" rendered as **"sắp ra mắt"** (disabled, no navigation). The forward-looking copy must describe what Cấp 8 actually is (phân bổ ngành, tương quan, tổng rủi ro) — promise nothing else.
- `Cap7TradingPage` — mirror `Cap6TradingPage` with **all 7 providers**, and **keep the pre-flight fix**: `POST /cap1/ketso` awaited on the sell fill BEFORE the Kết sổ modal opens (otherwise `/cap5/verdict` and later cấp endpoints 404 and the user is trapped in a `closable={false}` modal). Also `POST /cap7/enter` idempotently on mount.
- `DauTruongPage` — add the branch `cap6 graduated → Cap7TradingPage`, following the existing `cap{N}Fetched` / `cap{N}Graduated` chain at `DauTruongPage.tsx:158-171` exactly. Update that file's doc-comment, which still describes Cấp 5 as the last level.

**Gates + commit BEFORE the report:** `feat(cap7-fe): tab Hành trình + màn tốt nghiệp Cấp 7 + routing C6→C7`.

---

### Task V: real gates (`npx tsc -b` + `npx vitest run` + `npm run build` + BE `uv run pytest -q`) → whole-branch review → merge.
