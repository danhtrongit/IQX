# Cấp 0 v3.0 + layout Cấp 1 + tạm tắt Cấp 2-8 — Implementation Plan

> subagent-driven-development. Sources vendored in-repo (commit `eb88c18`):
> `dashboard/docs/superpowers/specs/cap0/IQX-Cap0-Spec.md` (**v3.0 bản cuối**) + `iqx-cap0-datlenh.html` · `iqx-cap0-hanhtrinh.html` · `iqx-cap0-ketso.html`
> `dashboard/docs/superpowers/specs/cap1/IQX-Cap1-Spec.md` + `iqx-cap1-datlenh.html` · `iqx-cap1-hanhtrinh.html` · `iqx-cap1-ketso.html` · `iqx-cap1-phantich-danhmuc.html`

**Goal:** bring Cấp 0 in line with spec v3.0 (6 nhiệm vụ → **5**, no cắt lỗ/chốt lời anywhere), bring Cấp 0 + Cấp 1 layouts in line with their mockups, and temporarily disable Cấp 2-8.

**Branch:** `feat/cap0-v3-cap1-layout` (already checked out, based on `main` @ `ad35d33`).

---

## Decisions already made — do NOT re-open these

| # | Decision | Rationale |
|---|---|---|
| 1 | **Cấp 0 has exactly 5 nhiệm vụ** | Founder chose the spec over `iqx-cap0-hanhtrinh.html`, which draws 7 by splitting Chặng 1 into ①②③. **Every counter, dot-row and DB column follows 5.** Where the hành-trình mockup shows 7, it is superseded. |
| 2 | **Cấp 1 task labels use the full spec §2 headers**, not the mockup's short ones | Founder's call. So `② Bán lệnh đầu — Kết sổ đầu`, not `② Kết sổ đầu tiên`. Keep the current strings in `JourneyPanelCap1.tsx:12-19`. |
| 3 | **Persist the Cấp 0 reason chip + buy timestamp** | Founder's call, and spec §10 asks for an `order_kehoach` row for Cấp 0 orders. Bus-only would be lost on reload — the exact class of bug that made Cấp 0 ungraduatable last week. |
| 4 | **Keep the progress ring on the journey badge** (§12) and **keep the lesson line** on the level card (§7) | The hành-trình mockup omits both; the spec requires both. Spec wins on conflict. |
| 5 | **Keep all three Chặng 2 tours as built** | §4/§14 still say "3 locked slots, don't build" — that text is **stale**; the tours shipped with their own specs. Do not remove them. |
| 6 | **No "Phân tích danh mục" in Cấp 0** | §13 says Cấp 1+; §8 contradicts it; nothing exists in Cấp 0 today. Follow §13. |
| 7 | **Backend: a real migration**, not re-interpretation | `UPDATE cap0_progress SET task_5_done_at = task_6_done_at`, then drop `task_6_done_at` and `task5_sl_typed`, and rename `task6_debrief_done` → `task5_debrief_done`. Leaves no column whose name contradicts the spec. |

**Deferred, out of scope for this branch** (note them, do not build): §12's header-pill badge (position 1, never built); §10's `cap0_*` analytics events (never implemented in either spec version); the §3 placement rewrite — see Task 5.

---

## Global Constraints

- **The trap that must not be re-introduced.** The new nhiệm vụ ⑤ must be driven by **column 6's data**, never by the existing `task_5_done_at`. That column already holds a timestamp from the old SL-keydown flow, so routing the new ⑤ through it makes a mid-flight user read 5/5 while the gate stays `false` → `graduate()` 409s forever, **and** `Gbar.tsx:121`'s `if (!progress || task5Done) return` suppresses the retro-debrief, leaving no path out. The migration in Task 1 copies col6 → col5 precisely to avoid this.
- **Cấp 0 has NO cắt lỗ/chốt lời, anywhere.** Not in the Kế hoạch block, not in gbar, not in Kết sổ, not in coach copy, not on the event bus. v3.0 states this in four places (preamble, §0, §8, §13).
- **Only ONE behaviour gate in Cấp 0**: closing the Kết sổ. `task1_star_clicked` stays a recorded fact but is not a graduation gate (it already isn't).
- **Do not touch the shared terminal's non-Cấp-0 behaviour.** Every edit to `TradingPanel.tsx` / `RightSidebar.tsx` stays gated on `isCap0Active` / `isCap1Active` — an ungated change leaks to `/bieu-do` and `/co-phieu`.
- Số en-US (`250,000,000` style) per project convention; the mockups' `250.000.000đ` is vi-VN and is **not** to be copied — keep the app's existing `toLocaleString("en-US")`. Dates vi-VN.
- Spec copy is **verbatim** where the spec gives it. Where a mockup and the spec differ on copy, **the spec wins** (mockups are layout references).
- **`npx tsc --noEmit` is a NO-OP in this repo.** Real typecheck = **`npx tsc -b`**.
- Baseline before this branch: FE **221 files / 2597 passed**; BE **1589 passed / 47 skipped**.

---

### Task 1 — BE: Cấp 0 5-task model + persist the reason chip

**Files:** `backend/app/models/cap0.py` · `schemas/cap0.py` · `services/cap0/service.py` · `api/v1/endpoints/cap0.py` · new Alembic revision (down_revision = `7b3c1e5a9d24`, confirm with `uv run alembic heads`) · `tests/test_cap0.py` · **and the six copy-pasted graduation helpers** in `tests/test_cap1.py:26-29` and `:89-92`, `test_cap2.py:26-29`, `test_cap3.py:40-43`, `test_cap4.py:55-58`, `test_cap5.py:305-308` (each calls `complete_task(..., 6, gate="debrief")`, which becomes a 400).

1. **Migration** (single revision): `UPDATE cap0_progress SET task_5_done_at = task_6_done_at` → `DROP COLUMN task_6_done_at` → `DROP COLUMN task5_sl_typed` → `ALTER COLUMN task6_debrief_done RENAME TO task5_debrief_done`. Write a real `downgrade()` (it cannot restore the dropped SL data — say so in the docstring).
2. **Model/schema/service:** `_TASK_NOS = (1,2,3,4,5)`; `_GATE_ATTR` loses `"sl_typed"` and maps `"debrief"` → `task5_debrief_done`; `gates_ok = progress.task5_debrief_done`; `Cap0ProgressOut` drops the two fields and renames the gate; `TaskRequest.gate` narrows to `Literal["star","debrief"]`; add `Field(ge=1, le=5)` to `task_no`; fix the "6 nhiệm vụ + 2 cổng" docstrings at `endpoints/cap0.py:50,57`.
3. **Couple ⑤ to its gate:** `task_no=5` must require `gate="debrief"` — ⑤ is only earned by closing the Kết sổ, and today a bare `{task_no: 5}` would mark it done without the gate. Reject the bare form with a clear message.
4. **Persist the Cấp 0 reason chip.** Add an endpoint that records, for a Cấp 0 BUY, the `order_id` + `ly_do_doi_thuong` (one of the 5 chips) — spec §10 asks for an `order_kehoach` row with `mode='san_tap'`. **Read `backend/app/models/cap1.py:160-259` first**: `order_kehoach` already exists as Cấp 1's table with a `lyDo` column and a unique `order_id` FK. Decide — and document in the service docstring — whether Cấp 0 reuses that row (writing only `lyDo`) or gets its own column/table, and make sure a later Cấp 1 `record_kehoach` for the same order cannot collide or be clobbered. The Kết sổ also needs the **buy timestamp** for `Thời gian giữ`; `virtual_orders.created_at` already has it, so prefer deriving over storing.

**Gates:** TDD; `uv run pytest tests/test_cap0.py -q` then FULL `uv run pytest -q` (baseline 1589/47 — report new totals); migration `upgrade head` → `downgrade -1` → `upgrade head`, twice.
**Commit BEFORE the report:** `feat(cap0-be): 5 nhiệm vụ theo spec v3.0 + lưu chip lý do`

---

### Task 2 — FE: strip cắt lỗ/chốt lời out of Cấp 0 + 5-task counters

**Files:** `dashboard/src/features/cap0/{types.ts,PlanBlock.tsx,gbarMachine.ts,Gbar.tsx,Cap0Context.tsx,JourneyPanel.tsx,JourneyBar.tsx,GraduationModal.tsx,DebriefModal.tsx,coachTemplate.ts,cap0Visibility.ts}` + `features/trading/TradingPanel.tsx` (Cấp-0-gated parts only) + their tests. Also the `Cap0Progress` literals in cap1-cap8 test fixtures, which stop typechecking the moment the fields go.

- **Delete the whole SL/TP path:** `PlanBlock`'s entire `presetMode` branch (`:88-145`) and its now-dead props; `TradingPanel`'s `slManual`/`tpManual`/`slGateFiredRef`/`handleSlKeydown`/`presetSl`/`presetTp` and the manual-mode tooltip (`:1259-1265`); `gbarMachine`'s `Task5State`/`task5Reducer`/`task5Step`/`task5StepMessage`/`task5Text` (`:103-165`); the `onSlTyped` bus event and its `Gbar` wiring (`:94,203-206,256`).
- **Counters 6 → 5** everywhere: `types.ts` `countTasksDone` + the interface, `JourneyPanel.tsx:16-23` (`TASK_NAMES` loses entry 5, old 6 becomes 5), `:41-45` (`STAGES` Chặng 3 = `[5]`), `:169`, `:194`, `JourneyBar.tsx:22,55,58` (5 dots), `GraduationModal.tsx:24` (gate) and `:138` (sub-line → **`5/5 nhiệm vụ`**, the `2/2 cổng hành vi` part is deleted), badge `ring={tasksDone/5}`.
- **gbar for nhiệm vụ ⑤** — currently there is NO bar for the sell task once the SL flow is gone. Add it, spec §6 verbatim: *"Chọn lệnh trong Nắm giữ và bấm Bán để khép vòng đời lệnh đầu tiên"*, shown when the user has an open position but hasn't sold.
- **`cap0Visibility.ts:42`**: the order book must be hidden **throughout Cấp 0 and Cấp 1** (opens at Cấp 2), so drop the `task2Done` unlock. Note `TradingPanel.tsx:1861` already does `!isCap2Active && (… || isCap1Active)` — verify the combined effective behaviour, don't just edit one side. The Giá/order-type rules (`:43-44`, keyed on `task_1_done_at`) are **unchanged** — v3.0 still opens them after ①.
- **Keep the retro-debrief fix** shipped in `ad35d33` working against the new task numbering.

**Gates:** `npx tsc -b` · `npx vitest run` · `npm run build`. TDD; if a test passes first run, mutate to prove it bites, then revert.
**Commit BEFORE the report:** `feat(cap0-fe): bỏ cắt lỗ/chốt lời khỏi Cấp 0 + 5 nhiệm vụ`

---

### Task 3 — FE: Cấp 0 layout theo 3 mockup + copy v3.0

**Files:** `PlanBlock.tsx`, `DebriefModal.tsx`, `coachTemplate.ts`, `JourneyPanel.tsx`, `JourneyBar.tsx`, `GraduationModal.tsx`, `cap0.css` + tests. Depends on Task 2.

- **Kết sổ (§5 + `iqx-cap0-ketso.html`):** table rows become `Lý do mua` / `Giá vào` / `Giá ra · thuế bán 0,1%` / `Thời gian giữ` — the `Cắt lỗ` and `Chốt lời` rows are deleted. `Lý do mua` spans both columns (mockup) rather than showing `—` under Thực tế. Add the `Đối chiếu` section label. Sub-line: `+{VND}đ` — note the mockup's `· Giữ N phiên` suffix; include it since Task 1 makes the data available. **Coach collapses from 4-5 templates to 2** (A lãi / B lỗ), both **verbatim from §5** — delete templates C, D and the `E` added last week (under v3.0 there is never a recorded SL, so E's premise is universal and its advice to "gõ ngưỡng cắt lỗ" is now wrong).
- **Panel đặt lệnh (`iqx-cap0-datlenh.html`):** the mockup is one card ordered mode-pill → MUA/BÁN → ticker → Trần/TC/Sàn → số dư → Khối lượng → phí → Kế hoạch → nút. The code splits this across `StockHeader` / `AccountStrip` / `OrderEntry` with tabs *below* ticker+balance. **Reordering the shared terminal is high-risk and out of scope** — instead, match what is cheap and safe: the Kế hoạch block's own contents (tag + question + 5 chips, nothing else), and the `Phí giao dịch (0,15%)` / `Số dư Sân tập` labels. **Report the ordering divergence rather than restructuring `TradingPanel`.**
- **Hành trình (`iqx-cap0-hanhtrinh.html`):** adopt the mockup where it does not conflict with decisions 1/4 — two-element checklist header (`Trước khi lên Cấp 1` left, `{n}/5` right), emoji status glyphs (`✅`/`🎯`/`🔒`), descriptions visible on done tasks too, dashed centred goal box, mode pill inside the info column below the name. **Keep** the progress ring and the lesson line.
- **Tốt nghiệp (§9):** sub-line `5/5 nhiệm vụ`; Khối 1 and Khối 2 rewritten **verbatim from §9** (the current Khối 1 asserts "2 vòng lệnh" and "tự tay đặt ngưỡng cắt lỗ" — both removed by v3.0). **Keep** the premium/free split in Khối 3 — that is the honesty fix from `ad35d33`, not spec copy, and it must not regress.

**Gates + commit BEFORE the report:** `feat(cap0-fe): layout Kết sổ + Hành trình + tốt nghiệp theo mockup v3.0`

---

### Task 4 — FE: Cấp 1 layout theo 4 mockup

**Files:** `dashboard/src/features/cap1/{PlanFormCap1.tsx,AiThanhTra.tsx,JourneyPanelCap1.tsx,KetsoModalCap1.tsx,Cap1PortfolioAnalysis.tsx}` + CSS + tests. **Cấp 1's spec is unchanged — this is layout/copy conformance only, no behaviour change.**

- **`PlanFormCap1`:** numbered field labels `1. Lý do mua — chọn 1 trong 6 lớp` and `2. Vùng mua (giá cụ thể)`. **⚠ The mockup's label says "6 lớp" but lists 5 and the code has 5 — use `5 lớp` and flag the mockup's inconsistency in your report.** Reason rows become icon + name + **description** on one line (`💰 Dòng tiền` *khối ngoại + tự doanh*, etc.) instead of compact pills.
- **`AiThanhTra`:** header `🔍 AI Thanh tra · {tên lớp} — L{n}`; verdict becomes a full-width coloured pill (`✅ ỦNG HỘ — …`) instead of a plain `Trạng thái: …` line. Keep `Đọc chi tiết lớp này →`.
- **`JourneyPanelCap1`:** flat 6-task list (no stage grouping); **keep the full spec §2 labels** (decision 2); add the two-tool row `📓 Kết sổ` + `📊 Phân tích danh mục`; task ③ gets the emoji coverage strip with `.off` dimming + the line `Đã dùng {n}/5 lý do`; add the third `🔲` open-state distinct from `🔒` locked.
- **`KetsoModalCap1`:** add the `Đối chiếu kế hoạch với thực tế` section label; shorten row labels to `Giá ra · thuế` and `Thời gian giữ`; value `{n} phiên` (drop `· N ngày`); span `Lý do` and `Trạng thái` across both columns. **Keep** the emotion block and the `📊 HỒ SƠ CỦA BẠN SAU LỆNH NÀY` block — spec §6 features the mockup simply does not depict.
- **`Cap1PortfolioAnalysis`:** block titles get circled numerals and the mockup's wording (`① Hồ sơ tổng quan`, `② Thắng / thua theo 5 lý do`, `③ Độ phủ 5 lý do + Chọn lý do có cơ sở`, `④ Tiến trình 6 nhiệm vụ`, `🔍 Mẫu hệ thống phát hiện (về lý do)`); patterns render as icon + bold lead + body with `good`/`info` variants. **Keep** `Khoi2Hidden`, `mauInsufficientNote` and the graduation-ready line — honest empty states, not regressions. The mockup's `← Quay lại Nắm giữ` page header does **not** apply: this renders as a sidebar panel.

**Gates + commit BEFORE the report:** `feat(cap1-fe): layout panel/hành trình/kết sổ/phân tích theo mockup`

---

### Task 5 — FE: tạm tắt Cấp 2-8 (+ §3 placement)

**Files:** `dashboard/src/features/cap1/DauTruongPage.tsx`, `features/cap1/GraduationModalCap1.tsx`, `features/cap0/PlacementModal.tsx` (+ `Cap0TradingPage.tsx`'s placement handler) + tests.

- **Routing stops at Cấp 1.** `DauTruongPage` keeps its Cấp 0 → Cấp 1 chain and **terminates at `Cap1TradingPage`** — delete/短-circuit the Cấp 2-8 branches and their `enterCapN` effects so no `/cap2..8/*` request is ever made. Do **not** delete the Cấp 2-8 feature code; this is a temporary gate, so make it one obvious, easily-reverted switch with a comment saying so. Nobody is past Cấp 0 in production (`cap1_progress` is empty), so there is no stranded-user case to handle.
- **`GraduationModalCap1`'s "Vào Cấp 2" CTA** shows **"sắp ra mắt"** and does not navigate. **Do NOT `disabled` it** — that modal is `closable={false}` and only unmounts on `graduated_at`, so a disabled button traps every qualifying user (this exact bug was fixed twice already; follow the Cấp 1-6 precedent: record the graduation, toast "sắp ra mắt").
- **§3 placement:** v3.0 replaces the 2-button question with three radio options — *"Chưa bao giờ → Cấp 0"* / *"Có, nhưng chưa tự tin → Cấp 1"* / *"Có, giao dịch thường xuyên → Cấp 2"*, and the 5-minute quiz is gone. Implement the 3-way UI, but **clamp the ceiling to Cấp 1 while Cấp 2+ are off** — a user picking the third option lands on Cấp 1, and the copy must not promise a Cấp 2 they cannot reach. `POST /cap0/placement` currently takes a boolean (`hooks.ts:45-51`); widening that contract is a **backend change** — if it is needed, STOP and report rather than editing `backend/` (Task 1 owns the backend).

**Gates + commit BEFORE the report:** `feat(cap0/1-fe): tạm tắt Cấp 2-8 + câu hỏi xếp lớp 3 lựa chọn`

---

### Task V — whole-branch review → merge → deploy (web + backend, 1 migration).
