# Cấp 8 «Quản trị rủi ro danh mục» — Implementation Plan (levels program, increment 10, FINAL)

> subagent-driven-development. Spec: `~/Downloads/DEMO TRADING/LEVEL 8/IQX-Cap8-Spec.md`. Principles: `~/Downloads/DEMO TRADING/IQX-NguyenTac-Chung.md`. CUMULATIVE on Cấp 0-7. This is the **last** level in the current program — its graduation closes the 0-8 arc and offers no next level.

**Goal:** Cấp 8 — *"Rủi ro không nằm ở một lệnh — mà ở cả danh mục."* Cấp 3 taught sizing ONE order; Cấp 8 lifts that to the portfolio: sector concentration, correlation between holdings, and total capital-at-risk.

**Architecture:** FE + BE, delta-only, mirroring Cấp 7 (`features/cap7/` → `features/cap8/`; `models/cap7.py` → `cap8.py`). Màu cấp: **xanh lá `#3f9b5a`**, fill=8. Thực chiến only.

**Key architectural decision:** the whole "Kiểm tra danh mục" computation happens **server-side** in ONE endpoint. The three measures need sector (ICB), price history for correlation, and every open position's stop-loss — none of which the frontend has. The FE renders what the server returns; it computes no measure of its own.

## Established facts this plan depends on (verified, do not re-derive)

- **Positions + cash:** `VirtualPosition` (`backend/app/models/virtual_trading.py:150-164`, table `virtual_positions`, unique on `account_id`+`symbol`) with `quantity_total`/`quantity_sellable`/`quantity_pending`/`quantity_reserved` and `avg_cost_vnd`; `VirtualTradingAccount` (`virtual_trading.py:114-147`) with `cash_available_vnd`/`cash_reserved_vnd`/`cash_pending_vnd`/`initial_cash_vnd`.
- **Portfolio with market values:** `VirtualTradingService.get_portfolio(user_id)` — `backend/app/services/virtual_trading/service.py:605`. Returns `positions` (each with `market_value_vnd`, `current_price_vnd`, `unrealized_pnl_vnd`), `total_market_value_vnd`, `nav_vnd`. **It computes no weight-%** — derive `market_value_vnd / nav_vnd` yourself.
- **Sector:** `icb_lv2 or icb_lv1` off the `Symbol` row via `SymbolRepository.get_by_symbol` (`backend/app/repositories/symbol.py:29-34`) — the pattern Cấp 6 uses at `backend/app/services/cap6/service.py:309-321`. For plain sector-concentration, use the raw ICB ngành string; do NOT route through Cấp 6's 6-kiểu mapping (that's a different abstraction).
- **Correlation:** `correlation(a: list[float], b: list[float]) -> float` at `backend/app/services/ai/portfolio_manager/returns.py:44-52` — pure numpy, no DB/LLM coupling, reusable as-is. Daily-return series come from `daily_returns()` (`returns.py:10-17`) over `close` prices from `fetch_ohlcv` (`portfolio_manager/inputs.py:77-84`); lookback `RISK_LOOKBACK_DAYS = 120` (`portfolio_manager/config.py:5`). **⚠ `correlation()` returns `0.0` when a series has <2 points or zero variance** — see the honesty constraint below. Do NOT reuse `layer_risk`/`build_analysis` (`portfolio_manager/layers.py:100-146`, `analysis.py:65+`): they are welded to `load_inputs`' full-portfolio fetch and are premium-report-shaped.
- **Khẩu vị (current, user-level):** `Cap3Progress.khau_vi` (`backend/app/models/cap3.py:73-80`) is the canonical live editable value — read it directly for `user_id`; do NOT infer from the most recent order. The per-order snapshot `OrderKehoach.khau_vi` (`models/cap1.py:202-209`) is separate. Ceiling values live in `backend/app/services/cap5/service.py:154-158`: `than_trong: 10.0`, `can_bang: 20.0`, `tan_cong: 30.0` (enum `KhauViRuiRo`, `models/cap1.py:92-105`).
- **Stop-loss:** `OrderKehoach.cat_lo` (`models/cap1.py:198`), keyed to a BUY `VirtualOrder` via the unique `order_id` FK. **There is NO FK from `VirtualPosition` to `OrderKehoach`** and no live stop-loss monitoring anywhere in the backend. The existing join goes the other direction (SELL → matching BUY → its kehoach): `Cap1Service._find_matching_buy` (`backend/app/services/cap1/service.py:230-248`) and `Cap2Service._find_matching_kehoach` (`backend/app/services/cap2/service.py:254-272`), both documented as a "pragmatic single-lot approximation" because the account is average-cost, not lot-tracked. Cấp 8 needs a **new** position-side helper (latest FILLED BUY for `account_id`+`symbol`, no upper time bound) — it does not exist yet.
- **Alembic:** Cấp 7's migration will be head by the time this runs — take `down_revision` = whatever `uv run alembic heads` reports, and verify it is the Cấp 7 revision.
- **`order_kehoach` lives in `backend/app/models/cap1.py:160-259`**; add a `# --- Cấp 8 ---` section after Cấp 7's.
- **FE portfolio hook:** `usePortfolio()` (`dashboard/src/features/trading/hooks.ts:25-34`) → `VTPortfolio { positions: VTPosition[]; balance; totalAssets; pnl; pnlPercent }`, `VTPosition { symbol; quantity; avgBuyPrice; currentPrice; marketValue; unrealizedPnl }` (`dashboard/src/features/trading/api.ts:40-47,63-69`). **No `weight`, no `sector`** — which is exactly why the measures are computed server-side.
- **No central cấp→colour map** — each cấp declares its hex in its own CSS under a `/* Màu cấp: … */` comment. Cấp 8 declares `--cap8: #3f9b5a` in `cap8.css`.
- **`npx tsc --noEmit` is a NO-OP here** (solution-style tsconfig). Real typecheck = **`npx tsc -b`**.

## Global Constraints (from spec — bind every task)

- **Cộng dồn:** the panel keeps ALL of Cấp 7's Đọc-sổ-lệnh + Cấp 6's Đối chiếu + Cấp 5's Đứng-ngoài + Cấp 4's Đọc-5-lớp + Cấp 3's Quản lý vốn + Cấp 2's SL/TP + Cấp 1's Vùng mua **100% intact**. Cấp 8 inserts a pre-confirm step only.
- **CẢNH BÁO MỀM, KHÔNG CỔNG CỨNG** (§C8, spec §9). The check never blocks MUA. Three choices: `[ Vẫn mua ]` `[ Giảm khối lượng ]` `[ Chọn mã khác ]`. "Vẫn mua" must be a first-class, unpenalised option in the UI — not styled as the wrong answer.
- **Three measures, each with its "vì sao" (§C12c):**
  - **Dồn ngành** — % of portfolio in the candidate's sector **after** the order. Warn if **> 40%**.
  - **Tương quan** — correlation of the candidate with existing holdings. Warn if **> 0.7** with a *significant* position (define "significant" as a documented constant, e.g. a minimum weight — a 0.9 correlation with a 0.5%-weight position is noise, not a risk).
  - **Tổng vốn ở rủi ro** — Σ over positions of (position weight × distance to its stop-loss) = total % of capital lost if every stop is hit. Compare against the khẩu vị ceiling. Warn if it exceeds it.
- **⚠ HONESTY: the khẩu vị ceiling is being reused across two different meanings.** `KHAU_VI_TRAN_PCT` (10/20/30%) is documented throughout the codebase as *max % of capital **in one order***. The spec compares *total capital-at-risk-if-all-stops-hit* to that same number (spec §2③, §4). Implement the spec's comparison, but the UI copy must state **exactly** what each number means so a user cannot read them as the same quantity — e.g. `Tổng vốn ở rủi ro: 14% (nếu mọi cắt lỗ bị chạm) · trần khẩu vị Cân bằng: 20%`. Note in the service docstring that with typical stop distances this ceiling seldom trips; that is acceptable because graduation condition ③ is a **safety check, not a difficulty knob**.
- **⚠ HONESTY: a position with no stop-loss has UNKNOWN risk, not zero risk.** Positions whose latest filled BUY has no `cat_lo` (bought before Cấp 2, or never set) must be **excluded from the sum and reported by count** — *"{N} vị thế chưa có cắt lỗ — chưa tính được rủi ro của các vị thế này."* Silently summing 0 for them would understate total risk, which is the exact failure this level teaches against.
- **⚠ HONESTY: correlation `0.0` from insufficient history is NOT "uncorrelated".** `correlation()` returns `0.0` for <2 points or zero variance. Wrap it: return `None`/"chưa đủ dữ liệu" unless both series have at least a documented minimum number of bars. Never render `0.0` as a computed correlation.
- **<2 positions → show allocation only, hide correlation** (spec §7 — correlation needs ≥2 symbols).
- **Do NOT rebuild the Portfolio Manager report** (spec §9). Cấp 8 is a compact pre-trade check; cross-ref PM for the deep version: *"Muốn phân tích sâu hơn (stress test, đóng góp lãi/lỗ)? Mở 'Phân tích danh mục' (Người quản lý danh mục)."*
- **No auto-optimisation, no concrete rebalancing advice** (spec §9) — warn, then let the user decide.
- Số en-US (`46%` · `0.82` · `1,240,000`); negative percents use `−` (U+2212). Dates vi-VN. Ngôn ngữ Việt.
- **KHÔNG huy chương, KHÔNG confetti, KHÔNG leaderboard, KHÔNG reset.**
- **This is the top level.** Graduation has **no "next level" button** — its CTA is `Xem hồ sơ hành trình →` opening the Hành trình tab / full 0-8 badge rail. Cấp 9+ is "sắp ra mắt" only as text, with nothing to click into.

---

### Task BE: Cấp 8 backend

**Files:** `backend/app/models/cap8.py` (`Cap8Progress`) · extend `OrderKehoach` in `backend/app/models/cap1.py` (new `# --- Cấp 8 ---` section) · NEW migration (`down_revision` = the Cấp 7 revision, confirmed via `uv run alembic heads`) · `backend/app/schemas/cap8.py` · `backend/app/services/cap8/service.py` · `backend/app/api/v1/endpoints/cap8.py` · register in `backend/app/api/v1/router.py` (import block ~line 30 + `include_router` ~line 83) · `backend/tests/test_cap8.py`.

**`Cap8Progress`:** `user_id` · `entered_at` · `task_1_done_at` · `task_2_done_at` · `task_3_done_at` · `so_lenh_kiem_tra` · `so_lan_mua_bat_chap_canh_bao` · `don_nganh_max_pct` · `tong_rui_ro_pct` · `graduated_at` · `time_to_graduate_hours`.

**New `order_kehoach` columns (all nullable):** `don_nganh_pct` (numeric) · `tuong_quan_cao_voi` (JSON: `{symbol, he_so}` or null) · `tong_rui_ro_pct` (numeric) · `danh_muc_canh_bao` (JSON list of the warnings that fired) · `hanh_vi_canh_bao` (enum `van_mua`/`giam_kl`/`chon_ma_khac`/`khong_canh_bao`).

**Documented constants:** sector-concentration threshold `40.0` · correlation threshold `0.7` · the minimum position weight for a correlation partner to count as "significant" · the minimum bars required before a correlation is reported at all · `KHAU_VI_TRAN_PCT` reused from `cap5/service.py` (import it, do not re-declare a second copy of the same numbers).

**New helper — position → stop-loss.** Write `_cat_lo_of_position(account_id, symbol) -> int | None`: latest FILLED BUY `VirtualOrder` for that account+symbol (no upper time bound), then its `OrderKehoach.cat_lo`. Mirror the query shape of `Cap2Service._find_matching_kehoach` (`services/cap2/service.py:254-272`) and carry the same documented caveat that the account is average-cost, not lot-tracked, so this is a single-lot approximation. Return `None` when there is no kehoach or no `cat_lo` — the caller must treat `None` as **unknown**, never as 0.

**Endpoints:**
- `GET /cap8/progress` · `POST /cap8/enter` (requires cap7 graduated) · `PATCH /cap8/task`.
- **`GET /cap8/kiem-tra?symbol=&khoi_luong=&gia=`** — the whole pre-trade check in one response:
  `{ nganh, don_nganh_pct_truoc, don_nganh_pct_sau, don_nganh_canh_bao, tuong_quan: {symbol, he_so} | null, tuong_quan_canh_bao, tuong_quan_du_lieu: bool, tong_rui_ro_pct_truoc, tong_rui_ro_pct_sau, tong_rui_ro_canh_bao, khau_vi, tran_khau_vi_pct, so_vi_the_thieu_cat_lo, so_vi_the, canh_bao: [...], giai_thich: {...} }`.
  Every measure ships with its own plain-Vietnamese `giai_thich` string stating the number AND where it came from — the FE renders those verbatim and invents no wording of its own. When a measure cannot be computed (no sector on the symbol, <2 positions, insufficient price history), return an explicit "chưa tính được" state with the reason — never a fabricated `0`.
- **`POST /cap8/kehoach {order_id, don_nganh_pct, tuong_quan_cao_voi, tong_rui_ro_pct, danh_muc_canh_bao, hanh_vi_canh_bao}`** — persist onto the existing `order_kehoach` row. **Server re-derives the measures itself and stores its own values, not the client's** (same principle as Cấp 6's kiểu): a client must not be able to report "no warnings fired" to keep its `so_lan_mua_bat_chap_canh_bao` clean. Accept `hanh_vi_canh_bao` from the client (only the user knows what they chose) but validate it against whether any warning actually fired — `khong_canh_bao` with warnings present is a contradiction; reject it.
- **`GET /cap8/thach-thuc`** — 3 sub-conditions, recomputed on read, each with value/target/`dat`/`giai_thich`:
  ① ≥ **15 lệnh** có qua Kiểm tra danh mục · ② ≤ **2 lần** mua bất chấp cảnh báo **trong 15 lệnh gần nhất** (a rolling window, not lifetime — read the spec wording carefully: "trong 15 lệnh gần nhất") · ③ closing state: **no sector > 40%** AND **tổng vốn ở rủi ro ≤ trần khẩu vị**. Condition ③ must state the "{N} vị thế chưa có cắt lỗ" caveat when it applies, so a user is never told their portfolio is within budget on the strength of positions whose risk is unknown.
- `POST /cap8/graduate` — 3/3 required.

**Gates:** TDD; `uv run pytest tests/test_cap8.py -q` + FULL `uv run pytest -q` (report the new totals against the pre-change baseline); migration `upgrade head` + `downgrade -1` + `upgrade head` round-trip, run twice.
**Commit BEFORE the report:** `feat(cap8-be): Cấp 8 backend — kiểm tra danh mục (dồn ngành + tương quan + tổng rủi ro)`.

---

### Task FE1: bước "Kiểm tra danh mục" trước xác nhận MUA

**Files:** create `dashboard/src/features/cap8/` — `types.ts`, `keys.ts`, `api.ts`, `hooks.ts`, `Cap8Context.tsx`, `KiemTraDanhMucBlock.tsx`, `cap8.css`, `index.ts` + tests. Modify `dashboard/src/features/trading/TradingPanel.tsx`.

- `KiemTraDanhMucBlock` renders the server's `GET /cap8/kiem-tra` response: the three measures, each with the server's `giai_thich` **verbatim**, warnings where they fired, and the three actions `[ Vẫn mua ] [ Giảm khối lượng ] [ Chọn mã khác ]`. **It computes no measure itself.**
- `Giảm khối lượng` reduces the volume in Cấp 3's existing volume field (respecting its lô-100 rule) and re-runs the check. `Chọn mã khác` clears the symbol selection. `Vẫn mua` proceeds — **styled as a normal choice, not a warning-coloured one.**
- **Never blocks MUA.** No gate added to the panel's disabled chain. If `GET /cap8/kiem-tra` fails, degrade **open**: show an honest note and let the order through — a failed check must never trap the user.
- The `so_vi_the_thieu_cat_lo > 0` caveat and the `tuong_quan_du_lieu === false` state are rendered explicitly, not hidden.
- **TradingPanel wiring:** purely ADDITIVE under `isCap8Active`; `POST /cap8/kehoach` awaited last in the one-row kehoach chain on the buy fill; Cấp 8 event bus fired on buy and sell.

**Gates + commit BEFORE the report:** `feat(cap8-fe): bước Kiểm tra danh mục trước xác nhận MUA`.

---

### Task FE2: Kết sổ Cấp 8 + khối ⑱

**Files:** `features/cap8/coachTemplateCap8.ts`, `KetsoModalCap8.tsx`, `portfolioAnalysisCap8.ts`, `Cap8PortfolioAnalysis.tsx` (+ CSS, + tests).

- **`coachTemplateCap8.ts`** — composes `composeCoachCap7` and adds the 8th paragraph. **4 mẫu** per spec §6, its copy verbatim: có cảnh báo + nghe (giảm KL/đổi mã) · có cảnh báo + vẫn mua + thua (*"Không chắc thua vì điều đó — nhưng dồn ngành/tương quan cao làm cả danh mục dễ tổn thương cùng lúc."* — note it explicitly does NOT claim causation) · có cảnh báo + vẫn mua + thắng (ties back to Cấp 5's "sai mà thắng") · không cảnh báo.
- **`KetsoModalCap8.tsx`** — mirror `KetsoModalCap7`, keeping every Cấp 1-7 block including Cấp 5's phân-loại-4-ô gate. ADD the spec §6 block: `Lúc mua: ⚠ {cảnh báo} · bạn: {xử lý}` + `Kết quả: {±x.x%}`. Orders with no Cấp 8 data (placed earlier) omit the block silently.
- **`portfolioAnalysisCap8.ts` + `Cap8PortfolioAnalysis.tsx`** — delegate to Cấp 7's for ①–⑰, then ADD **⑱ Bản đồ rủi ro danh mục**: sector allocation (incl. cash), high-correlation pairs, tổng vốn ở rủi ro vs trần khẩu vị, plus ONE finding line with the spec's priority order (sector >40% first, then risk over ceiling, else the "phân tán tốt" default) and the PM cross-ref. **<2 positions → allocation only, correlation hidden.** The "{N} vị thế chưa có cắt lỗ" caveat appears wherever tổng rủi ro is shown.

**Gates + commit BEFORE the report:** `feat(cap8-fe): Kết sổ Cấp 8 + khối ⑱ Bản đồ rủi ro danh mục`.

---

### Task FE3: Hành trình + tốt nghiệp trọn mạch 0-8 + routing C7→C8

**Files:** `JourneyPanelCap8.tsx`, `GraduationModalCap8.tsx`, `Cap8PortfolioAnalysisPanel.tsx`, `Cap8TradingPage.tsx` (+ CSS, + tests); modify `features/cap1/DauTruongPage.tsx`, Cấp 7's `GraduationModalCap7` ("Vào Cấp 8" must really enter Cấp 8), `RightSidebar` + sidebar-context, `features/cap8/index.ts`.

- `JourneyPanelCap8` — 3 nhiệm vụ + the Thách thức widget with all 3 sub-conditions from `GET /cap8/thach-thuc`, `giai_thich` verbatim.
- **`GraduationModalCap8` — the program's finale.** 3 khối per spec §3, copy verbatim, including the header's *"Trọn mạch Nhập môn → đây."* Khối 3 has **no next-level button**: the CTA is `Xem hồ sơ hành trình →` opening the Hành trình tab with the full 0-8 badge rail. Cấp 9+ appears as text only ("sẽ mở dần khi ra mắt") with nothing clickable. **Still no confetti, no medal** — the level colour and the 0-8 rail carry the moment.
- `Cap8TradingPage` — mirror `Cap7TradingPage` with **all 8 providers**; keep the pre-flight fix (`POST /cap1/ketso` awaited on the sell fill BEFORE the Kết sổ modal opens, or `/cap5/verdict` and later endpoints 404 and the user is trapped in a `closable={false}` modal); `POST /cap8/enter` idempotently on mount.
- `DauTruongPage` — add `cap7 graduated → Cap8TradingPage`, following the existing `cap{N}Fetched`/`cap{N}Graduated` chain exactly, and **make the terminal branch Cap8TradingPage** (a cap8-graduated user still lands on Cap8TradingPage — there is no Cấp 9 page). Update the file's doc-comment.
- Verify the badge rail renders all 9 states (Cấp 0-8) with the right colours: 0-3 brand blue `#4f8ff7` · 4 `#a78bfa` · 5 `#e0b64d` · 6 `#d64550` · 7 `#c65cae` · 8 `#3f9b5a`.

**Gates + commit BEFORE the report:** `feat(cap8-fe): tốt nghiệp trọn mạch 0-8 + Hành trình Cấp 8 + routing C7→C8`.

---

### Task V: real gates (`npx tsc -b` + `npx vitest run` + `npm run build` + BE `uv run pytest -q`) → whole-branch review of the 6+7+8 line → merge → deploy (`alembic upgrade head` picks up cấp 5-8's migrations).
