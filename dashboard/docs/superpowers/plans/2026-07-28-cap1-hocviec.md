# Cấp 1 «Học việc» — Implementation Plan (levels program, increment 3)

> subagent-driven-development. Spec (verbatim source): `~/Downloads/DEMO TRADING/LEVEL 1/IQX-Cap1-Spec.md`. Global principles: `~/Downloads/DEMO TRADING/IQX-NguyenTac-Chung.md`.

**Goal:** Build Cấp 1 «Học việc» on top of the live Cấp 0 — the first real level beyond Cấp 0. It also establishes the **progression foundation** (how a user moves Cấp 0 → 1 → … and how /dau-truong picks the right flow), which Cấp 2-8 reuse.

**Architecture:** FE (dashboard/) + BE (backend/). Delta-only; follow the Cap0 patterns (`backend/app/{models,services,schemas,api/v1/endpoints}/cap0*` + `dashboard/src/features/cap0/`). Cấp 1 is Thực chiến mode. Cơ chế bán: hệ thống KHÔNG tự bán.

**Level boundary:** C0 mechanics · **C1 = reasoned entry: Lý do mua (5 lý do) + Vùng mua + AI Thanh tra 6-lớp; trang Phân tích danh mục; Kết sổ đầy đủ** · C2 = SL/TP (later). NO cắt lỗ/chốt lời, NO sổ lệnh bid/ask, NO điểm kỷ luật in C1 (spec §10).

## Global Constraints (from spec)
- Form Kế hoạch **2 trường bắt buộc** (Lý do mua 1/5 + Vùng mua) — **cổng cứng**: nút MUA disabled nếu thiếu. Ẩn 5 chip "đời thường" của C0.
- 5 lý do + nguồn dữ liệu: 🎯 Kỹ thuật (AI Insight L1) · 💰 Dòng tiền (L3) · 👤 Nội bộ (L4) · 📰 Tin tức (L5) · 💎 Định giá (BCTC KHỐI 02). AI Thanh tra map thang 5 bậc → ✅Ủng hộ mạnh/✅/⚪/⚠/❌ (spec §5). ❌ KHÔNG chặn (soi gương).
- 6 nhiệm vụ (spec §2): ① lệnh đầu có kế hoạch · ② bán+Kết sổ đầu · ③ đủ 5 lý do (mỗi loại ≥1, không cần khớp) · ④ ≥3 lệnh lý do ✅ Ủng hộ lúc đặt · ⑤ mở Phân tích danh mục 3 lần khác ngày · ⑥ 10 lệnh Thực chiến. Tốt nghiệp = 6/6.
- Số en-US app-wide. Ngôn ngữ VN. KHÔNG huy chương/confetti.
- Two-branch tour (`da_xem_tour`): Nhánh A (từ C0, đã xem 3 tour) vào thẳng; Nhánh B (xếp lớp thẳng C1) buộc xem 3 tour trước lệnh đầu. (The 3 tours already exist from increment 1 — reuse; gate by a `da_xem_tour` flag.)

---

### Task BE1: Cấp 1 backend foundation + progression
**Files:** `backend/app/models/cap1.py` (Cap1Progress per spec §9 + **OrderKehoach** + **OrderKetso** tables — NEW, don't exist), `backend/app/schemas/cap1.py`, `backend/app/services/cap1/service.py`, `backend/app/api/v1/endpoints/cap1.py`, register router, Alembic migration, `backend/tests/test_cap1.py`. Also a **progression helper**: derive `current_level` (0 if cap0 not graduated; 1 if cap0 graduated & cap1 not; …) — expose via `GET /cap1/progress` returning cap1 row (null if not entered) + a `POST /cap1/enter` (idempotent, called when Cap0 graduates). Follow `cap0/service.py` + `models/cap0.py` patterns exactly.
- Tables: `cap1_progress` (spec §9: user_id, entered_at, da_xem_tour, task_1..6_done_at, so_ly_do_da_dung, so_lenh_ly_do_ung_ho, so_lan_xem_danh_muc, so_lenh_thuc_chien, graduated_at, time_to_graduate_hours). `order_kehoach` (order_id FK→virtual_orders, lyDo enum, trangThai_luc_dat enum, vung_mua, co_bam_doc_chi_tiet, snapshot_lop_du_lieu JSON). `order_ketso` (order_id, gia_ra, so_phien_giu, so_ngay_lich, pnl_pct, pnl_vnd, cam_xuc nullable, closed_at). NO cột cắt lỗ/chốt lời.
- Endpoints: `GET /cap1/progress`, `POST /cap1/enter`, `PATCH /cap1/task {task_no}`, `POST /cap1/kehoach {order_id, lyDo, trangThai_luc_dat, vung_mua, co_bam_doc_chi_tiet, snapshot}`, `POST /cap1/ketso {order_id, cam_xuc?}` (computes pnl/phiên from the virtual_order), `POST /cap1/graduate` (6/6 required). Recompute the 6 task counters server-side from order_kehoach/ketso rows where possible (source of truth), so progress can't drift.
- TDD: pytest for enter, kehoach record, ketso, task counters (③ counts distinct lyDo; ④ counts trangThai_luc_dat='ung_ho'; ⑥ counts thuc_chien orders), graduate gating. `cd backend && uv run pytest tests/test_cap1.py -q` green + FULL `uv run pytest -q` green. Migration applies clean (`alembic upgrade head` on a scratch/sqlite test).
- Commit `feat(cap1-be): Cấp 1 backend — cap1_progress + order_kehoach/ketso + progression`.

### Task FE1: Form Kế hoạch 2 trường + AI Thanh tra 6 lớp
Panel (in `TradingPanel`, gated by a new `isCap1Active`/level check like `isCap0Active`): replace C0 chips with Form Kế hoạch (Lý do 5-lý-do selector + Vùng mua number, default = giá hiện tại) — hard gate on MUA. AI Thanh tra panel slides in on reason pick: fetch the layer's real data (reuse AI Insight endpoints for L1/L3/L4/L5; BCTC KHỐI02 for Định giá), map to the 5-bậc → ✅/⚪/⚠/❌ (spec §5 table), show "Đọc chi tiết →" (records co_bam_doc_chi_tiet). ❌ shows "Chọn lý do khác / Vẫn đặt". On order fill → POST /cap1/kehoach. Reuse Cap0Context-style event bus or a new Cap1Context. TDD + tsc + vitest. Commit.

### Task FE2: Trang Phân tích danh mục (4 khối + 3 mẫu) + Kết sổ Cấp 1
Phân tích danh mục page (spec §7): Khối 1 hồ sơ, Khối 2 bảng thắng/thua 5 lý do, Khối 3 độ phủ + lý do có cơ sở, Khối 4 tiến trình 6 nhiệm vụ; 3 mẫu tự phát hiện (vũ khí/điểm mù/cơ sở đáng giá); ngưỡng <5 lệnh ẩn Khối 2. Opening it 3× khác ngày → nhiệm vụ ⑤ (POST /cap1/task or a view-log). Kết sổ Cấp 1 (spec §6): đối chiếu lý do+vùng mua+kết quả, khối cảm xúc cho lệnh "có chuyện", coach 6 template A-F, 3 dòng cá nhân hóa. TDD + gates. Commit.

### Task FE3: Tab Hành trình C1 + tốt nghiệp + progression routing
Journey C1 (spec §8: 6-task checklist, đồng badge, THỰC CHIẾN). Graduation screen C1 (spec §3, 3 blocks → "Vào Cấp 2" which toasts "sắp ra mắt" until C2). **Progression routing:** /dau-truong picks flow by current_level — Cap0 graduate → enter Cap1 (POST /cap1/enter) → show Cap1 flow (Form Kế hoạch, Thực chiến). Wire Cap0 GraduationModal's "Vào Cấp 1" to actually enter+route (replace the placeholder toast). TDD + gates. Commit.

### Task V: full gates + migration verify → (merge → deploy when channel up)
FE `tsc + vitest + build`; BE `pytest` full + migration applies clean. Then merge → deploy (needs xermius channel + repo public toggle + **alembic upgrade head on prod** after backend rebuild — irreversible, verify first).
