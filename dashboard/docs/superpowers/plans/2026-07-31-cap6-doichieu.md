# Cấp 6 «Đối chiếu» — Implementation Plan (levels program, increment 8)

> subagent-driven-development. Spec: `~/Downloads/DEMO TRADING/LEVEL 6/IQX-Cap6-Spec.md`. Principles: `~/Downloads/DEMO TRADING/IQX-NguyenTac-Chung.md`. Cấp 5 is built + merged (`main 401a6cf`) — Cấp 6 is CUMULATIVE on Cấp 0-5 and is the FIRST "theo chủ đề" level (§A2).

**Goal:** Cấp 6 «Đối chiếu» — *"Khi các lớp nói ngược nhau, tin lớp nào — và điều đó tùy loại cổ phiếu."* On top of Cấp 4's đọc-5-lớp, teach resolving CONFLICT between layers, weighted by the stock's archetype.

**Architecture:** FE + BE, delta-only, mirroring Cấp 5 (`features/cap5/` → `features/cap6/`; `models/cap5.py` → `cap6.py`). Màu cấp: **đỏ son `#d64550`**, fill=6. Thực chiến only.

## Global Constraints (from spec)
- **Cộng dồn:** panel keeps Cấp 4's Đọc-5-lớp + Cấp 3's Quản lý vốn + Cấp 2's SL/TP + Cấp 1's Vùng mua + Cấp 5's Đứng-ngoài **100% intact**. Cấp 6 INSERTS a **bước "Đối chiếu"** that appears **ONLY when the 5 lớp conflict**.
- **Conflict trigger:** the user's own 5-lớp ratings contain **≥1 `ok` (Ủng hộ) AND ≥1 `bad` (Ngược chiều)**. No conflict → the step does not render at all and nothing is gated.
- **6 kiểu cổ phiếu** mapped from ngành (BE owns the map): 🏦 Ngân hàng · 🚀 Tăng trưởng/công nghệ · 🏭 Chu kỳ/công nghiệp · 🛡️ Phòng thủ/tiêu dùng · 🏢 Bất động sản · 🎲 Đầu cơ/vốn hóa nhỏ. Ngành missing/unmapped → **"chưa phân loại"**: skip the per-kiểu suggestion but STILL let the user pick a lớp quyết định.
- **Hybrid + provenance (§C12c):** the server SUGGESTS which lớp to prioritise for that kiểu **and returns the reason text**; the user picks the **lớp quyết định** + a 1-line reason. Never a bare suggestion; never auto-decide.
- **Cổng cứng:** when there IS a conflict, MUA is blocked until a lớp quyết định is picked (on top of cấp 1-4's gates).
- **Trọng số là GỢI Ý, không phải luật:** the user may pick a lớp outside the suggestion (that's `khop_goi_y = false`, a neutral fact — never scored as "wrong"). Arbiter is real outcomes.
- **3 nhiệm vụ:** ① lệnh đầu có đối chiếu · ② Kết sổ đầu Cấp 6 · ③ **Thách thức Đối chiếu** (CẢ 3): ≥ **15 lệnh** có mâu thuẫn đã qua bước Đối chiếu · gặp ≥ **3 kiểu** cổ phiếu khác nhau · win-rate of `khop_goi_y=true` trades **≥** win-rate of `khop_goi_y=false` trades (each group needs ≥3 closed trades). Tốt nghiệp 3/3.
- Số en-US; ngôn ngữ VN. KHÔNG huy chương/confetti. Cấp 7 chưa build → nút "Vào Cấp 7" hiện "sắp ra mắt".

---

### Task BE: Cấp 6 backend (+ 1 carried-over fix)
**Files:** `backend/app/models/cap6.py` (`Cap6Progress`: task_1..3_done_at, so_lenh_doi_chieu, so_kieu_da_gap, ty_le_thang_khop, ty_le_thang_lech, graduated_at, time_to_graduate_hours); extend `order_kehoach` (+`kieu_co_phieu`, `lop_mau_thuan` JSON, `trong_so_goi_y` JSON, `lop_quyet_dinh`, `khop_goi_y` bool, `ly_do_doi_chieu` text) via a **NEW** migration (down_revision = head `c81a4d5e93f2`); `schemas/cap6.py`; `services/cap6/service.py`; `api/v1/endpoints/cap6.py`; register router; `tests/test_cap6.py`.
- **Kiểu mapping + trọng số table** live in the service as data (documented constants), mapping the app's existing ngành/sector value on the symbol → 1 of the 6 kiểu. Find how ngành is available (see how cap4/cap1 resolve a symbol's sector, or `stock`/`market-data` models) and reuse it; if no reliable server-side sector exists, accept `kieu_co_phieu` from the client BUT re-validate it against the allowed enum and document that choice.
- Endpoints: `GET /cap6/progress` · `POST /cap6/enter` (requires cap5 graduated) · `PATCH /cap6/task` · **`GET /cap6/goi-y?symbol=`** (returns `{kieu, kieu_ten, lop_uu_tien: [...], lop_it_tin: [...], giai_thich}` for that symbol's kiểu — the provenance the FE shows verbatim; `kieu = null` + an honest note when unmapped) · `POST /cap6/kehoach {order_id, kieu_co_phieu, lop_mau_thuan, lop_quyet_dinh, ly_do_doi_chieu}` (server derives `trong_so_goi_y` + `khop_goi_y` itself — do NOT trust the client) · `GET /cap6/thach-thuc` (3 sub-conditions + values + giải thích) · `POST /cap6/graduate`.
- Recompute server-side: `so_lenh_doi_chieu`, `so_kieu_da_gap` (distinct `kieu_co_phieu`), `ty_le_thang_khop` / `ty_le_thang_lech` (win-rate by `khop_goi_y`, each needing ≥3 closed trades before it counts). Nhiệm vụ ③ = all three legs.
- **CARRIED-OVER FIX (from Cấp 5, do it here):** `cam_xuc` no longer persists at Cấp 5 because `POST /cap1/ketso` now runs before the Kết sổ modal opens. Make `/cap1/ketso` **upsert** `cam_xuc` (an existing row + a non-null `cam_xuc` updates it instead of 409-ing / ignoring), keeping its current create behaviour otherwise. Add a test: create the row with `cam_xuc=null`, then post again with `cam_xuc='so'` → row updated, no error, and Cấp 1-4 behaviour unchanged.
- TDD; gates: `uv run pytest tests/test_cap6.py -q` + FULL `uv run pytest -q` (baseline **1461 passed, 47 skipped**); migration `upgrade head` + `downgrade -1` round-trip clean.
- **Commit BEFORE the report**: `feat(cap6-be): Cấp 6 backend — đối chiếu mâu thuẫn + trọng số theo kiểu cổ phiếu`.

### Task FE1: bước "Đối chiếu" trong panel
`features/cap6/` mirroring `cap5/` (context/api/hooks/keys/types) + `DoiChieuBlock.tsx`: renders ONLY when the user's 5-lớp ratings conflict (≥1 ok AND ≥1 bad — compute from Cấp 4's `doc5Lop`, reuse its helpers). Shows: which lớp are Ủng hộ vs Ngược chiều · the **kiểu cổ phiếu** + the server's `lop_uu_tien`/`lop_it_tin` + `giai_thich` **verbatim** (§C12c) · a picker for the **lớp quyết định** + a required 1-line reason. Wire into `TradingPanel` under `isCap6Active`: purely ADDITIVE to cấp 1-5's blocks; cổng cứng only when a conflict exists; on BUY fill POST `/cap6/kehoach` after cấp 1-5's kehoach posts (same one-row chain). TDD + gates + commit.

### Task FE2: Kết sổ Cấp 6 + khối ⑭⑮ + Hành trình + tốt nghiệp + routing C5→C6
- `coachTemplateCap6.ts` — 4 mẫu by `khop_goi_y` × thắng/thua, composing `composeCoachCap5`. Lệch gợi ý is NEVER "sai".
- `KetsoModalCap6.tsx` — mirror `KetsoModalCap5` (all-in-one modal precedent) + a "ĐỐI CHIẾU — NHÌN LẠI" block (kiểu, các lớp mâu thuẫn, lớp bạn tin, khớp gợi ý hay không) + the Cấp 6 coach. Preserve Cấp 5's phân-loại-4-ô gate.
- `portfolioAnalysisCap6.ts` + `Cap6PortfolioAnalysis.tsx` — delegate to Cấp 5's for earlier blocks; ADD **⑭ Lớp nào đúng cho kiểu nào** (kiểu × lớp quyết định → win-rate; needs ≥3 trades per cell to label) and **⑮ Đối chiếu có giúp không** (khớp vs lệch win-rates + an honest finding either way — if the suggestion is NOT helping for this user, say so plainly).
- `JourneyPanelCap6` (3 nhiệm vụ + Thách thức widget with all 3 conditions), `GraduationModalCap6` (3 khối; Khối 3 uses Cấp 7's colour hồng magenta `#c65cae`; nút "Vào Cấp 7 «Đọc sổ lệnh»" → "sắp ra mắt"), `Cap6PortfolioAnalysisPanel`, `Cap6TradingPage` (all 6 providers; keep Cấp 5's pre-flight `/cap1/ketso` fix), `DauTruongPage` branch cap5-graduated → Cap6, Cấp 5's graduation really enters Cấp 6, RightSidebar + sidebar-context, barrel.
- TDD + gates + commit.

### Task V: real gates (`npx tsc -b` + `npx vitest run` + `npm run build` + BE `uv run pytest -q`) → merge.
> `npx tsc --noEmit` is a NO-OP here — always **`npx tsc -b`**. **Commit BEFORE writing any report.**
