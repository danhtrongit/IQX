# Cấp 4 «Thuần thục» — Implementation Plan (levels program, increment 6)

> subagent-driven-development. Spec: `~/Downloads/DEMO TRADING/LEVEL 4/IQX-Cap4-Spec.md`. Principles: `~/Downloads/DEMO TRADING/IQX-NguyenTac-Chung.md`. Cấp 3 is built + merged (`main 2488e08`) — Cấp 4 is CUMULATIVE on Cấp 0/1/2/3.

**Goal:** Cấp 4 «Thuần thục» — *"Đọc trọn bức tranh, không chỉ một lý do — và biết mình đọc giỏi ở đâu."* Replaces Cấp 1's "chọn 1 lý do" with **đọc + tự chấm CẢ 5 lớp** before AI is revealed, then measures reading quality by REAL outcomes (not AI agreement).

**Architecture:** FE + BE, delta-only, mirroring Cấp 3 (`features/cap3/` → `features/cap4/`; `models/cap3.py` → `cap4.py`). Màu cấp: tím `#a78bfa`, fill=4. Thực chiến only.

## Global Constraints (from spec)
- **Cộng dồn với MỘT thay thế:** panel giữ Cấp 2's SL/TP + Cấp 3's Quản lý vốn nguyên vẹn; **trường "Lý do mua" (1-trong-5) của Cấp 1 bị THAY bằng khối "Đọc 5 lớp"** (chấm cả 5). Kết sổ + Phân tích danh mục giữ mọi khối trước + thêm.
- **5 lớp:** L1 Kỹ thuật · L3 Dòng tiền · L4 Nội bộ · L5 Tin tức · Định giá (BCTC). Mỗi lớp: hiện **chi tiết dữ liệu thật sẵn** (thang 5 bậc thật + "So với phiên trước") + **3 nút tự chấm** (Ủng hộ / Trung tính / Ngược chiều).
- **AI ẨN tới khi chấm đủ 5 lớp** (chống nhìn bài). Chấm đủ → lộ ô đối chiếu AI từng lớp (`✓ Cùng góc nhìn` xanh / `↔ Góc nhìn khác AI` **tím** — trung tính, KHÔNG phán "sai") + **điểm đồng thuận X/5** + **cùng góc nhìn AI Y/5**.
- **Cổng cứng:** chưa chấm đủ 5 lớp → không đặt được lệnh.
- **Nguyên tắc đo:** đo chất lượng đọc bằng **KẾT QUẢ THẬT của thị trường**, KHÔNG đo "độ vâng lời AI". Lệch AI = "góc nhìn khác" cần kiểm chứng, KHÔNG phải "sai". KHÔNG chấm điểm đúng/sai khi lệch AI. KHÔNG trọng số lớp (để Cấp 6).
- **3 nhiệm vụ:** ① lệnh đầu đọc + chấm đủ 5 lớp · ② Kết sổ đầu Cấp 4 · ③ **Thách thức Thuần thục** (đạt CẢ 3): đọc+chấm đủ 5 lớp qua ≥ **20 lệnh** · hệ thống đủ dữ liệu chỉ ra **vũ khí** + **điểm mù** của user · lệnh **đồng thuận cao (≥3 lớp ủng hộ) thắng ≥ 60%**. Tốt nghiệp 3/3.
- Số en-US; ngôn ngữ VN. KHÔNG huy chương/confetti. §C12c: mọi chỉ số kèm giải thích + nguồn gốc.

---

### Task BE: Cấp 4 backend
**Files:** `backend/app/models/cap4.py` (`Cap4Progress`: task_1..3_done_at, so_lenh_doc_du_5lop, vu_khi_lop (nullable), diem_mu_lop (nullable), ty_le_thang_dong_thuan_cao, graduated_at, time_to_graduate_hours); extend `order_kehoach` (+`doc_5_lop` JSON {lop: 'ok'|'neu'|'bad'}, `ai_5_lop` JSON (AI's 3-level view per lớp), `so_lop_dong_thuan` int, `so_lop_khac_ai` int) via a **NEW** migration (down_revision = head `ee69ea647b02`); `schemas/cap4.py`; `services/cap4/service.py`; `api/v1/endpoints/cap4.py` (`GET /cap4/progress`, `POST /cap4/enter` (requires cap3 graduated), `PATCH /cap4/task`, `POST /cap4/kehoach {order_id, doc_5_lop, ai_5_lop, so_lop_dong_thuan, so_lop_khac_ai}`, `GET /cap4/vu-khi-diem-mu` (per-lớp: khi user tự đọc "Ủng hộ" thì % thắng THẬT; ≥70% = vũ khí, <50% = điểm mù; cần ≥3 lệnh/lớp — trả kèm giải thích + counts for §C12c), `GET /cap4/thach-thuc` (3 sub-conditions + current values + giải thích), `POST /cap4/graduate`); register router; `tests/test_cap4.py`.
- Recompute server-side from `order_kehoach`+`order_ketso`: so_lenh_doc_du_5lop; per-lớp win-rate when self-rated Ủng hộ → vũ khí/điểm mù; win-rate of lệnh with so_lop_dong_thuan ≥3. Nhiệm vụ ③ = all three legs.
- **Do NOT** score "đúng/sai" against AI anywhere; `so_lop_khac_ai` is a neutral count only.
- TDD; gates: `uv run pytest tests/test_cap4.py -q` + FULL `uv run pytest -q` (baseline 1392 passed/47 skipped); migration `upgrade head` + `downgrade -1` round-trip clean.
- Commit `feat(cap4-be): Cấp 4 backend — đọc 5 lớp + vũ khí/điểm mù`.

### Task FE1: khối "Đọc 5 lớp" (thay trường Lý do mua)
`features/cap4/` mirroring `cap3/` (context/api/hooks/keys/types) + `Doc5LopBlock.tsx`: 5 lớp rows, each with real layer data (reuse `useStockAiInsight` + BCTC hook exactly as `cap1/AiThanhTra.tsx` does — read it) + 3 self-rating buttons; AI verdict per lớp **hidden until all 5 rated**, then revealed with the neutral `✓ Cùng góc nhìn` / `↔ Góc nhìn khác AI` labels + điểm đồng thuận X/5 + cùng-góc-nhìn Y/5. Wire into `TradingPanel` under `isCap4Active`: **hide Cấp 1's `PlanFormCap1` lý-do field** (keep vùng mua!) and Cấp 1's `AiThanhTra`, render `Doc5LopBlock` in its place; keep Cấp 2 SL/TP + Cấp 3 Quản lý vốn intact; cổng cứng adds "đã chấm đủ 5 lớp"; on fill → `POST /cap4/kehoach`. **Also fix the known Cấp 3 gap:** fire a Cấp 3 (and Cấp 4) bus event on SELL fills so Kết sổ opens off its own cấp's event. TDD + gates + commit.

### Task FE2: Kết sổ Cấp 4 + 3 khối Phân tích danh mục
Kết sổ = Cấp 3's + khối "Đọc 5 lớp — nhìn lại" (bảng 5 lớp: bạn đọc gì · AI đánh giá gì, lớp khác AI nổi nền **tím**) + coach "góc nhìn khác AI" (4 mẫu theo khác-AI/cùng-AI × thắng/thua). Phân tích danh mục = Cấp 3's + **⑨** Vũ khí & điểm mù (per-lớp % thắng thật khi tự đọc Ủng hộ; ≥70% vũ khí xanh / <50% điểm mù đỏ; cần ≥3 lệnh/lớp) + **⑩** Đọc toàn cảnh có giúp chọn lệnh tốt hơn (nhóm theo độ đồng thuận 4-5 / 2-3 / 0-1 lớp → tỷ lệ thắng mỗi nhóm) + **⑪** Góc nhìn riêng (số lần đọc khác AI · số lần bạn đúng · số lần AI đúng — trình bày TRUNG THỰC, không xu nịnh). TDD + gates + commit.

### Task FE3: Hành trình Cấp 4 + tốt nghiệp + routing C3→C4
`JourneyPanelCap4` (3 nhiệm vụ + widget Thách thức Thuần thục 3 điều kiện kèm giá trị + vũ khí/điểm mù hiện tại), `GraduationModalCap4` (3 khối verbatim; Khối 3 viền vàng kim `#e0b64d`; nút "Vào Cấp 5" → "sắp ra mắt"), `Cap4TradingPage` (all 4 providers + Kết sổ Cấp 4 + graduation + sidebar panels + tradeLogCap4), extend `DauTruongPage` C3-graduated → Cap4, wire Cấp 3's graduation "Vào Cấp 4" to really enter. Barrel. TDD + gates + commit.

### Task V: real gates (`npx tsc -b` + `npx vitest run` + `npm run build` + BE `uv run pytest -q`) → merge.
> `npx tsc --noEmit` is a NO-OP here (solution-style tsconfig) — always use **`npx tsc -b`**.
> Commit BEFORE writing the report file (an earlier agent stalled between gates and commit).
