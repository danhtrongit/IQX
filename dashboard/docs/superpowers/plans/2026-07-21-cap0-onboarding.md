# IQX Cấp 0 «Nhập môn» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Lớp onboarding game-hoá "Cấp 0" chồng lên hệ giao dịch ảo (virtual-trading) hiện có — route Demo Trading mới, tab Hành trình, journey bar, gbar, khối Kế hoạch, Kết sổ, tốt nghiệp, huy hiệu.

**Architecture:** DELTA. Tái dùng engine virtual-trading + TradingPanel + WatchlistPanel + shell RightSidebar/RightToolbar. Xây mới `features/cap0/` (FE) + `app/models/cap0.py` + endpoints (BE). Cap 0 mở FREE (ungate Sân tập), 250tr T0, route mới `/dau-truong`.

**Tech Stack:** React 19 + Arco + TanStack Query + Vitest/RTL (FE); FastAPI + SQLAlchemy + Alembic + pytest (BE).

## Global Constraints

- **Nguồn chân lý copy/UX:** `dashboard/docs/superpowers/specs/cap0/IQX-Cap0-Spec.md` (mọi câu chữ VN verbatim — chip lý do, gbar, Kết sổ 4 template coach §5, tốt nghiệp §9, journey copy §7). **Nguồn layout/CSS/SVG:** `iqx-cap0-pc.html` + `iqx-cap0-mobile.html`. Mọi task FE PHẢI đọc file tương ứng trước khi code.
- **Bảng màu (§11)** — thêm token Cap 0 scope trong `.cap0` (KHÔNG đụng token app): `--brand #4f8ff7`, `--brand-soft rgba(79,143,247,.16)`, `--bg1 #171923`, `--bg2 #1f2230`, `--bg3 #282c3d`, `--bd #39405a`, `--t1 #f0f2f7`, `--t2 #b8bdcc`, `--t3 #8a90a5`, `--up #35d07f`, `--down #ff6b6b`, `--warn #ffc53d`, `--ceil #d48aff`, `--floor #4dc3ff`.
- **Font Space Grotesk** (badge số + Kết sổ P&L + tên cấp) — app chỉ có Tahoma. THÊM `@font-face`/Google import scope Cap 0 + fallback system-ui (bài học bctc-dashboard: fallback khi CSP/offline).
- **KHÔNG đụng:** logic engine virtual-trading, luồng khớp lệnh, TradingPanel/WatchlistPanel logic (chỉ gắn event/ẩn có điều kiện), gate premium ở /bieu-do & /co-phieu thường.
- **KHÔNG code Chặng 2** (tour ②③④) — chỉ 3 slot `locked` trong checklist (§4, §7).
- **Ẩn theo cấp = bọc điều kiện, KHÔNG xoá code** (§8).
- **2 cổng hành vi:** ⑤ chỉ `keydown` ô cắt lỗ mới đạt (click auto −5% KHÔNG đạt); ⑥ đóng màn Kết sổ mới đạt.
- Checklist bàn giao đầy đủ ở spec §15 — task V đối chiếu.

---

### Task BE1: Backend — cap0_progress + user_placement + orders.mode + endpoints + seed 250tr

**Files:**
- Create: `backend/app/models/cap0.py`, `backend/app/schemas/cap0.py`, `backend/app/api/v1/endpoints/cap0.py`, `backend/app/services/cap0/service.py`, `backend/alembic/versions/<rev>_add_cap0.py`
- Modify: `backend/app/models/__init__.py` (import Cap0 models), `backend/app/api/v1/router.py` (mount cap0 router), `backend/app/models/virtual_trading.py` (add `mode` column to `VirtualOrder`)
- Test: `backend/tests/test_cap0.py`

**Interfaces:**
- Consumes: `VirtualTradingService` (`app/services/virtual_trading/service.py`) — `activate_account(user_id)`; repo `create_account(user_id, initial_cash_vnd)` (supports explicit amount). `PremiumUser`/`CurrentUser`/`DBSession` from `app.api.deps`.
- Produces:
  - Model `Cap0Progress`: `user_id` FK unique, `entered_at`, `virtual_balance_init` (default 250_000_000), `task_1_done_at`..`task_6_done_at` (nullable ts), `task1_star_clicked` bool, `task5_sl_typed` bool, `task6_debrief_done` bool, `graduated_at` nullable, `time_to_graduate_hours` nullable float.
  - Model `UserPlacement`: `user_id` FK unique, `has_traded_before` bool, `placed_level` int (0/1/2), `created_at`.
  - `VirtualOrder.mode`: `Mapped[str]` default `"thuc_chien"` (values `san_tap`/`thuc_chien`) — migration adds column with server_default `'thuc_chien'`.
  - Endpoints (`/api/v1/cap0`, `CurrentUser` — NOT premium, Cap0 is free): `GET /progress` → Cap0Progress|null; `POST /enter` → tạo Cap0Progress (idempotent) + seed 250tr account nếu user chưa có account (`create_account(user_id, 250_000_000)`); `POST /placement` body `{has_traded_before: bool}` → tạo UserPlacement, trả `{placed_level}` (false→0, true→2); `PATCH /task` body `{task_no:int, gate?:"star"|"sl_typed"|"debrief"}` → set task_N_done_at / gate bool (idempotent); `POST /graduate` → set graduated_at + time_to_graduate_hours (chỉ khi 6/6 + 2 cổng).
- Service `Cap0Service`: `enter(user_id)`, `get_progress(user_id)`, `set_placement(user_id, has_traded)`, `complete_task(user_id, task_no, gate)`, `graduate(user_id)` (validate 6 tasks done + task5_sl_typed + task6_debrief_done, else 409).

- [ ] **Step 1: Failing tests** — `test_cap0.py`:
```python
@pytest.mark.asyncio
async def test_enter_creates_progress_and_seeds_250tr(db_session, user):
    from app.services.cap0.service import Cap0Service
    svc = Cap0Service(db_session)
    p = await svc.enter(user.id)
    assert p.virtual_balance_init == 250_000_000
    # idempotent
    p2 = await svc.enter(user.id); assert p2.id == p.id

@pytest.mark.asyncio
async def test_placement_maps_level(db_session, user):
    svc = Cap0Service(db_session)
    assert (await svc.set_placement(user.id, has_traded=False)).placed_level == 0
    # re-answer overwrites or idempotent — assert no crash

@pytest.mark.asyncio
async def test_graduate_requires_all_tasks_and_gates(db_session, user):
    svc = Cap0Service(db_session)
    await svc.enter(user.id)
    with pytest.raises(Exception):   # 409 — chưa đủ
        await svc.graduate(user.id)
    for n in (1,2,3,4,5,6): await svc.complete_task(user.id, n, gate=None)
    await svc.complete_task(user.id, 5, gate="sl_typed")
    await svc.complete_task(user.id, 6, gate="debrief")
    await svc.complete_task(user.id, 1, gate="star")
    g = await svc.graduate(user.id); assert g.graduated_at is not None
```
- [ ] **Step 2: red** — `uv run pytest tests/test_cap0.py -q`.
- [ ] **Step 3: implement** models + migration (down_revision `"3f9a1c7be204"`, `op.f()` names, `mode` column on `virtual_orders` with `server_default='thuc_chien'`) + register in models/__init__ + service + endpoints + mount router. Seed: in `enter`, check account exists (repo/service) → if none, `create_account(user_id, 250_000_000)`.
- [ ] **Step 4: green** + FULL `uv run pytest -q` (BE1 touches models/__init__ + router — full suite bắt buộc).
- [ ] **Step 5: Commit** — `feat(cap0-be): cap0_progress + user_placement + orders.mode + endpoints + seed 250tr`

---

### Task FE1: `features/cap0/` scaffold — types, hooks, badge SVG, tokens/font, Cap0 context

**Files:**
- Create: `dashboard/src/features/cap0/{types.ts,api.ts,keys.ts,hooks.ts,index.ts}`, `dashboard/src/features/cap0/cap0.css` (tokens §11 scope `.cap0` + Space Grotesk @font-face/import), `dashboard/src/features/cap0/Badge.tsx` (port `badge()` §12 → React), `dashboard/src/features/cap0/ModeBadge.tsx`, `dashboard/src/features/cap0/Cap0Context.tsx`
- Test: `dashboard/src/features/cap0/cap0.test.tsx`

**Interfaces:**
- Consumes: BE1 endpoints (`api` ky client `@/shared/http/client`, `unwrap` pattern như `features/stock/api.ts`).
- Produces:
  - `useCap0Progress()` → query `GET cap0/progress` (staleTime 0, refetch on mutate); `useEnterCap0()`, `usePlacement()`, `useCompleteTask()`, `useGraduate()` (mutations invalidate progress).
  - `Cap0Provider` + `useCap0Events()` context: `{onOrderFilled?(order), onStarToggled?(symbol, watched), registerHandlers(h)}` — event bus để TradingPanel/StockHeader (đã có) báo Cap0 mà KHÔNG cần Cap0 biết chi tiết. Outside provider → hooks no-op.
  - `Badge({n,color,fill,size,glow,ring,showNum})` → renders SVG (port §12 verbatim logic; dùng `LEVELS` §12). `ModeBadge({mode})` → pill `SÂN TẬP · T+0` (warn) / `THỰC CHIẾN` (brand) góc màn hình.
  - `BLOCK_TOKENS`/font: `.cap0` wrapper class + Space Grotesk.

- [ ] **Step 1: Failing tests** — Badge renders `<svg>` với số cấp; ModeBadge hiện đúng nhãn theo mode; `LEVELS[0].name==="Nhập môn"`. Hooks: mock api, `useCap0Progress` trả progress.
- [ ] **Step 2: red → 3: implement** (port badge() từ spec §12; đọc `iqx-cap0-pc.html` cho ModeBadge vị trí/CSS) → **4: green** `npx vitest run src/features/cap0` + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(cap0-fe): scaffold — types/hooks/api + Badge SVG + ModeBadge + Cap0 context + tokens/font`

---

### Task FE2: Câu hỏi xếp lớp (modal 1-lần) + route `/dau-truong` + Cap0TradingPage shell

**Files:**
- Create: `dashboard/src/features/cap0/PlacementModal.tsx`, `dashboard/src/features/cap0/Cap0TradingPage.tsx`
- Modify: `dashboard/src/app/router.tsx` (add route), `dashboard/src/features/cap0/index.ts` (export page)
- Test: `dashboard/src/features/cap0/Cap0TradingPage.test.tsx`

**Interfaces:**
- Consumes: FE1 hooks + `SymbolProvider` (`@/shared/contexts/symbol-context`), terminal parts (`CenterPanel`, `RightSidebar`, `RightToolbar` from `@/features/dashboard`), `useCap0Progress`/`usePlacement`.
- Produces: `Cap0TradingPage` — mirror `DashboardPage` (`<SymbolProvider symbol="VNM">` + terminal layout), thêm: `.cap0` wrapper, `<ModeBadge mode="san_tap"/>` góc, journey bar sticky (FE3 sẽ điền — để placeholder slot), `<PlacementModal/>` (hiện 1 lần nếu chưa có placement + chưa entered), gọi `useEnterCap0()` khi vào lần đầu. Route: `<Route path="/dau-truong" element={<Cap0TradingPage/>} />` trong block standalone (cạnh `/bieu-do`, KHÔNG trong AppShell). Lazy import như DashboardPage.
- PlacementModal (§3): tiêu đề "Chào mừng đến Demo Trading của IQX.", câu hỏi "Bạn đã từng mua cổ phiếu chưa?", 2 nút `Chưa từng`(→placement false→ở Cap0) / `Đã từng`(→placement true→điều hướng bài xếp lớp/Cap1 — đợt này chỉ set placed_level=2 + toast "sẽ có bài xếp lớp", KHÔNG làm checklist Cap0). Chỉ hiện lần đầu (guard bằng useCap0Progress/placement).

- [ ] **Step 1: Failing test** — render Cap0TradingPage (mock hooks + terminal children): placement chưa có → PlacementModal hiện; bấm "Chưa từng" → gọi placement(false) + enter; ModeBadge "SÂN TẬP". Route smoke: `/dau-truong` render page.
- [ ] **Step 2: red → 3: implement** (đọc mockup cho layout shell) → **4: green** + `npx tsc --noEmit` + `npm run build`.
- [ ] **Step 5: Commit** — `feat(cap0-fe): câu hỏi xếp lớp + route /dau-truong + Cap0TradingPage shell (VNM preselect, mode badge)`

---

### Task FE3: Tab 🎯 Hành trình + journey bar sticky (+ đăng ký panel journey)

**Files:**
- Create: `dashboard/src/features/cap0/JourneyPanel.tsx`, `dashboard/src/features/cap0/JourneyBar.tsx`
- Modify: `dashboard/src/shared/contexts/sidebar-context.tsx` (union += `"journey"`), `dashboard/src/features/dashboard/components/RightSidebar.tsx` (switch case + `panelNames.journey`), `dashboard/src/features/dashboard/components/RightToolbar.tsx` (prepend `journey` vào `ITEMS`), `Cap0TradingPage.tsx` (mount JourneyBar)
- Test: `dashboard/src/features/cap0/JourneyPanel.test.tsx`

**Interfaces:**
- Consumes: `useSidebar()` (`activePanel/setActivePanel`), `useCap0Progress`, `Badge`.
- Produces: `JourneyPanel` (§7) — thẻ cấp (Badge Cap0 ring=progress + nhãn `CẤP 0` + tên `NHẬP MÔN` + bài học + ModeBadge) + header `TRƯỚC KHI LÊN CẤP 1 · x/6` + checklist 3 chặng/6 nhiệm vụ (Chặng2 ②③④ = `locked`, mờ, no nút; nhiệm vụ active có mô tả + nút "Làm ngay →" điều hướng) + ô đích cuối. `JourneyBar` (§7) — sticky top, `CẤP 0 · x/6` + tên nhiệm vụ kế + 6 chấm; toàn thanh click → `setActivePanel("journey")`. Copy verbatim §7 theo tiến độ (0/6, 1/6, 6/6).
- Panel wiring: `SidebarPanel` union thêm `"journey"`; RightSidebar switch `case "journey": return <JourneyPanel/>` + `panelNames.journey = "Hành trình"`; RightToolbar `ITEMS` prepend `{icon: Icon... , label:"Hành trình", id:"journey", panel:"journey"}`. Cap0TradingPage đặt journey là view mặc định (setActivePanel("journey") on mount).

- [ ] **Step 1: Failing test** — JourneyPanel: 6 nhiệm vụ hiển thị, ②③④ locked (no nút "Làm ngay"), header "x/6" đúng theo mock progress; JourneyBar click → setActivePanel("journey"). Panel-union compile guard (panelNames đủ key).
- [ ] **Step 2: red → 3: implement** (đọc mockup §7 layout) → **4: green** + tsc + build (build bắt buộc — sửa shared sidebar union).
- [ ] **Step 5: Commit** — `feat(cap0-fe): tab Hành trình + journey bar + đăng ký panel journey`

---

### Task FE4: Khối "Kế hoạch" + ungate Sân tập + gbar + nhiệm vụ ① (gắn event mua/★)

**Files:**
- Create: `dashboard/src/features/cap0/PlanBlock.tsx`, `dashboard/src/features/cap0/Gbar.tsx`, `dashboard/src/features/cap0/gbarMachine.ts`
- Modify: `dashboard/src/features/trading/TradingPanel.tsx` (chèn PlanBlock giữa summary & submit; ungate khi Cap0/sân tập; gọi `useCap0Events().onOrderFilled` sau `mutateAsync`; StockHeader gọi `onStarToggled` sau `toggle`), `Cap0TradingPage.tsx` (mount Gbar dưới journey bar)
- Test: `dashboard/src/features/cap0/gbar.test.tsx`, cập nhật `dashboard/src/features/trading/*` test nếu có

**Interfaces:**
- Consumes: `useCap0Events()` (FE1), `useCompleteTask()`, spec §4/§6 copy.
- Produces:
  - `PlanBlock` (§4 THÊM MỚI) — nhãn `KẾ HOẠCH`, câu hỏi "Vì sao bạn chọn VNM?", 5 chip lý do (verbatim §4), preset SL/TP (VNM 62.400: cắt lỗ 59.300 −5% / chốt lời 68.600 +10%) + ghi chú. Props: `{presetMode:"filled"|"manual", onReasonPick, slValue, tpValue, onSlKeydown}` — dùng lại ở ① (filled) và ⑤ (manual). Chèn trong OrderEntry giữa summary div và nút submit (recon: sau line ~311).
  - `Gbar` + `gbarMachine` (§6) — sticky, state 3 bước ①/2 bước ⑤, ở-lại đến khi xong bước, làm sai → đỏ+rung `gshake` 0.3s+`⚠`, ~1.6s về vàng, xong nhiệm vụ → ẩn. Nội dung verbatim §6.
  - Ungate: trong `GatedOrderEntry`, điều kiện render OrderEntry = `isPremium || isCap0SanTap` (isCap0SanTap từ Cap0 context/prop). KHÔNG đổi hành vi ngoài Cap0.
  - Event glue (🔵, minimal-touch): sau `await placeOrder.mutateAsync(...)` trong OrderEntry.handleSubmit → `cap0Events?.onOrderFilled?.(order)`; chặn submit nếu Cap0 ① chưa chọn chip lý do → gbar warn. Sau `await toggle(symbol)` trong StockHeader → `cap0Events?.onStarToggled?.(symbol, nowWatched)`. Cap0Provider ánh xạ 2 sự kiện → completeTask(1, gate) + gbar bước.
  - Toast verbatim §4 (dùng Arco Message nếu app có, hoặc component đơn giản).

- [ ] **Step 1: Failing tests** — gbarMachine: bước 1→2→3 theo event; làm sai → trạng thái warn rồi về vàng; xong → hidden. PlanBlock: 5 chip + preset hiển thị; chọn chip gọi onReasonPick. (Ungate: test GatedOrderEntry render OrderEntry khi isCap0SanTap dù !isPremium.)
- [ ] **Step 2: red → 3: implement** (đọc mockup Kế hoạch + gbar CSS `gshake`) → **4: green** `npx vitest run src/features/cap0 src/features/trading` + tsc + build.
- [ ] **Step 5: Commit** — `feat(cap0-fe): khối Kế hoạch + ungate Sân tập + gbar + nhiệm vụ ① (event mua/★)`

---

### Task FE5: Ẩn theo cấp (§8) + nhiệm vụ ⑤ (cổng keydown SL) + ⑥ + màn Kết sổ (§5)

**Files:**
- Create: `dashboard/src/features/cap0/DebriefModal.tsx` (Kết sổ), `dashboard/src/features/cap0/coachTemplate.ts` (4 template §5)
- Modify: `dashboard/src/features/trading/TradingPanel.tsx` + `OrderBookView`/`OrderEntry` (ẩn có điều kiện: sổ bid/ask, ô Giá, dropdown MP/LO theo §8; reveal ở ⑤), `dashboard/src/features/dashboard/components/RightSidebar.tsx`/`RightToolbar.tsx` (ẩn tab Tin tức + AI Mẫu nến ở Cap0 §8), Cap0 event glue (bán khớp → DebriefModal; keydown ô SL → cổng ⑤)
- Test: `dashboard/src/features/cap0/debrief.test.tsx`

**Interfaces:**
- Consumes: `useCap0Progress` (biết cấp/nhiệm vụ để quyết ẩn/hiện), `useCompleteTask`, spec §5/§8.
- Produces:
  - Ẩn theo cấp (§8, 🟡 bọc điều kiện KHÔNG xoá): `isCap0` & nhiệm vụ chưa mở → ẩn OrderBookView (mở sau ②), ô Giá + dropdown MP/LO (mở ở ⑤), tab Tin tức + AI Mẫu nến (mở Cap1). Toast "Bạn vừa mở khóa: {tên}" khi mở. Điều kiện tập trung 1 helper `cap0Visibility(progress)`.
  - Nhiệm vụ ⑤: PlanBlock `presetMode="manual"` (không điền sẵn SL/TP); ô Giá + MP/LO hiện; **cổng 1**: `keydown` vào ô cắt lỗ → `completeTask(5, "sl_typed")` (click auto −5% KHÔNG tính). Tooltip §4 verbatim (dạy LO vs MP, cắt lỗ là quyết định của mình). gbar ⑤ (2 bước §4).
  - Nhiệm vụ ⑥: sau bán khớp (event `onOrderFilled` với side sell) → mở `DebriefModal`. **Cổng 2**: bấm "Đóng kết sổ ✓" → `completeTask(6, "debrief")`.
  - `DebriefModal` (§5): header `KẾT SỔ LỆNH · #{n} · SÂN TẬP` + P&L lớn (Space Grotesk 42px count-up) + bảng đối chiếu Kế hoạch/Thực tế (giá vào, cắt lỗ, chốt lời, giá ra + thuế 0,1%) + khối coach `coachTemplate(situation)` (4 template A/B/C/D §5 verbatim) + nút "Đóng kết sổ ✓". KHÔNG hỏi cảm xúc.
  - `coachTemplate({pnlPositive, hitSL, hitTP})` → chọn 1 trong 4 đoạn §5.

- [ ] **Step 1: Failing tests** — coachTemplate: 4 tình huống → đúng template; DebriefModal render P&L + bảng + nút, bấm nút gọi completeTask(6,"debrief"); cap0Visibility: nhiệm vụ chưa mở → ô Giá ẩn, mở ⑤ → hiện. Cổng ⑤: keydown SL → completeTask(5,"sl_typed"), click auto không gọi.
- [ ] **Step 2: red → 3: implement** (đọc mockup §5 Kết sổ layout) → **4: green** + tsc + build.
- [ ] **Step 5: Commit** — `feat(cap0-fe): ẩn theo cấp + nhiệm vụ ⑤ (cổng keydown SL) + ⑥ + màn Kết sổ`

---

### Task FE6: Màn Tốt nghiệp (§9) + chuyển SÂN TẬP→THỰC CHIẾN + auto-tab + unlock

**Files:**
- Create: `dashboard/src/features/cap0/GraduationModal.tsx`
- Modify: `Cap0TradingPage.tsx` (mở GraduationModal khi 6/6+2 cổng; ModeBadge đổi sau tốt nghiệp), Cap0 event glue (auto-chuyển tab Hành trình khi xong 1 nhiệm vụ §7)
- Test: `dashboard/src/features/cap0/graduation.test.tsx`

**Interfaces:**
- Consumes: `useCap0Progress`, `useGraduate`, `Badge`, spec §9.
- Produces: `GraduationModal` (§9, 3 khối) — header (tag `HOÀN THÀNH` + `CẤP 0 · NHẬP MÔN` Space Grotesk 30px + `6/6 nhiệm vụ · 2/2 cổng hành vi` + Badge 120px glow "vừa đúc xong" fill=1) + Khối 1 Ghi nhận + Khối 2 Định vị + Khối 3 Chuyển chế độ (viền xanh) — copy verbatim §9 + nút `Vào Cấp 1 «Học việc» →`. Bấm → `useGraduate()` → ModeBadge đổi `THỰC CHIẾN` + điều hướng flow Cap1 (đợt này: toast/placeholder "Cấp 1 sắp ra"). Điều kiện mở modal: progress 6/6 + task5_sl_typed + task6_debrief_done. Auto-chuyển tab: sau mỗi completeTask → `setActivePanel("journey")` + tick ✓ (moment thưởng, KHÔNG confetti §7).

- [ ] **Step 1: Failing test** — GraduationModal render 3 khối + nút; đủ điều kiện (mock progress 6/6+gates) → modal hiện; bấm nút gọi graduate + ModeBadge→THỰC CHIẾN. Auto-tab: completeTask → setActivePanel("journey").
- [ ] **Step 2: red → 3: implement** (đọc mockup §9) → **4: green** + tsc + build.
- [ ] **Step 5: Commit** — `feat(cap0-fe): màn tốt nghiệp + chuyển chế độ Thực chiến + auto-tab + unlock`

---

### Task V: Verify toàn cục + smoke đi trọn Cap 0

- [ ] Full gates: `uv run pytest -q` (BE) + `npx vitest run` + `npx tsc --noEmit` + `npm run build` (FE) — xanh.
- [ ] Đối chiếu checklist bàn giao spec §15 (14 mục) — từng mục ✓.
- [ ] Smoke (local be+fe, Playwright, user free): vào `/dau-truong` → PlacementModal → "Chưa từng" → tab Hành trình mặc định + journey bar 0/6 + ModeBadge SÂN TẬP; nhiệm vụ ① (chọn chip Kế hoạch → gbar → mua VNM khớp → ★) không cần premium; ẩn đúng (sổ lệnh/ô Giá/Tin tức/AI Mẫu nến); ⑤ ô Giá+MP/LO hiện, keydown SL đạt cổng; ⑥ bán → Kết sổ → đóng; 6/6 → Tốt nghiệp → THỰC CHIẾN. Dark/nền Cap0 đọc tốt.
- [ ] Ghi finding nếu có (ungate rò rỉ? journey panel phá 4 panel cũ?).
