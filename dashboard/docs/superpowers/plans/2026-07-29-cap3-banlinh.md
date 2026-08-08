# Cấp 3 «Bản lĩnh» — Implementation Plan (levels program, increment 5)

> subagent-driven-development. Spec: `~/Downloads/DEMO TRADING/LEVEL 3/IQX-Cap3-Spec.md`. Principles: `~/Downloads/DEMO TRADING/IQX-NguyenTac-Chung.md`. Cấp 2 is built + merged (`main 4a8a4a9`) — Cấp 3 is CUMULATIVE on top of Cấp 0/1/2.

**Goal:** Cấp 3 «Bản lĩnh» — *"Mua bao nhiêu quan trọng như mua gì."* Adds **quản lý vốn**: khẩu vị rủi ro (hồ sơ, đặt 1 lần) + mức tự tin của lệnh + khối lượng mua tính tự động theo 2 cách.

**Architecture:** FE + BE, delta-only, mirroring Cấp 2 (`features/cap2/` → `features/cap3/`; `models/cap2.py` → `cap3.py`). Màu cấp: xanh brand `#4f8ff7`, fill=3. Thực chiến only.

## Global Constraints (from spec)
- **Cộng dồn:** panel giữ 100% Cấp 2 (lý do + vùng mua + AI Thanh tra + cắt lỗ/chốt lời) + CHÈN khối **"Quản lý vốn"** dưới Loại lệnh/Giá/KL. Kết sổ + Phân tích danh mục giữ mọi khối trước + thêm.
- **Khẩu vị rủi ro** (hồ sơ user, đặt 1 lần khi vào Cấp 3, sửa được): 3 mức — Thận trọng **10%**, Cân bằng **20%** (mặc định gợi ý), Tấn công **30%** — là TRẦN % vốn cho mỗi lệnh; áp cho mọi lệnh.
- **Mức tự tin** (mỗi lệnh, user TỰ chấm — **KHÔNG có AI gợi ý**): ⭐ / ⭐⭐ / ⭐⭐⭐ → hệ số **50% / 75% / 100%**. **LUÔN ghi lại dù chọn cách khối lượng nào** (cấp sau cần dữ liệu này).
- **Khối lượng mua — 2 cách chọn 1** (cổng cứng: thiếu tự tin hoặc chưa chọn cách → không đặt được lệnh):
  - Cách 1 «linh hoạt» = khẩu vị × hệ số tự tin.
  - Cách 2 «kỷ luật» = chia đều theo khẩu vị (không nhân tự tin).
  Ô Khối lượng: Cấp 0-2 user tự gõ → **Cấp 3 tự điền** theo cách đã chọn, vẫn **sửa tay được**.
- **Vốn ban đầu 100.000.000đ** (§C12b) — không nạp thêm, không reset.
- **3 nhiệm vụ:** ① lệnh đầu đủ khẩu vị + mức tự tin + 1 cách khối lượng · ② Kết sổ đầu Cấp 3 · ③ **Thách thức Bản lĩnh** (đạt CẢ 3 cùng lúc): lãi ≥ **+5%** trên vốn (tính lãi/lỗ đã chốt trong Cấp 3) · qua ≥ **15 lệnh** Thực chiến ở Cấp 3 · **điểm kỷ luật ≥ 80%** (trung bình giai đoạn Cấp 3). Tốt nghiệp 3/3.
- **§C12c:** điểm kỷ luật (và mọi chỉ số) luôn hiện kèm 1 câu giải thích + nguồn gốc con số — áp dụng cả Cấp 2 lẫn Cấp 3.
- **KHÔNG:** AI gợi ý mức tự tin · nhập tay tự do SL/TP · tách quyết định/kết quả (Cấp 5) · nạp thêm vốn/reset · huy chương/confetti.
- Số en-US; ngôn ngữ VN (§E: "Khối lượng mua hợp lý", "Mức độ tự tin của lệnh", KHÔNG "Position Sizing"/"Confidence Rating").

---

### Task BE: Cấp 3 backend
**Files:** `backend/app/models/cap3.py` (`Cap3Progress`: khau_vi_da_dat bool, khau_vi, task_1..3_done_at, so_lenh_cap3, lai_pct_cap3, diem_ky_luat_tb_cap3, graduated_at, time_to_graduate_hours); extend `users` (or a profile table) with `khau_vi_rui_ro` + `von_ban_dau` — prefer a column on the existing user/profile if one exists, else put them on `Cap3Progress` (document the choice); extend `order_kehoach` (+`khau_vi`, `muc_tu_tin`, `cach_khoi_luong`, `khoi_luong`, `pct_von`) via a NEW migration (do NOT edit `ecc202a79e70`/`f809de621bd0`); `schemas/cap3.py`; `services/cap3/service.py`; `api/v1/endpoints/cap3.py` (`GET /cap3/progress`, `POST /cap3/enter` (requires cap2 graduated), `POST /cap3/khau-vi {khau_vi}`, `PATCH /cap3/task`, `POST /cap3/kehoach {order_id, khau_vi, muc_tu_tin, cach_khoi_luong, khoi_luong, pct_von}`, `GET /cap3/thach-thuc` (the 3 sub-conditions of nhiệm vụ ③ + their current values, for §C12c display), `POST /cap3/graduate`); register router; `tests/test_cap3.py`.
- Recompute server-side from source rows: `so_lenh_cap3` (thuc_chien orders since entering C3), `lai_pct_cap3` (realized P&L on the 100tr base), `diem_ky_luat_tb_cap3` (mean of the Cấp 2 daily discipline score across the C3 period — reuse `services/cap2`'s scorer, don't duplicate it).
- TDD; gates: `uv run pytest tests/test_cap3.py -q` + FULL `uv run pytest -q`; migration `upgrade head` + `downgrade -1` round-trip clean.
- Commit `feat(cap3-be): Cấp 3 backend — khẩu vị rủi ro + mức tự tin + khối lượng`.

### Task FE1: khối "Quản lý vốn" trong panel
`features/cap3/` mirroring `cap2/` (context/api/hooks/keys/types) + `KhauViModal.tsx` (màn chọn khẩu vị bắt buộc lần đầu vào Cấp 3, 3 mức + giải thích hệ quả: số mã nắm được / thiệt hại tối đa nếu 1 mã giảm sàn) + `QuanLyVonBlock.tsx` (khẩu vị hiện tại + 3 nút mức tự tin + 2 cách khối lượng, tính live; auto-fill ô Khối lượng nhưng cho sửa tay). Wire into `TradingPanel` under `isCap3Active` (Cấp 2's blocks stay intact); cổng cứng; on fill → `POST /cap3/kehoach`. TDD + gates + commit.

### Task FE2: Kết sổ Cấp 3 + 2 khối Phân tích danh mục
Kết sổ = Cấp 2's + khối "Quản lý vốn" (khẩu vị lúc đặt, mức tự tin, cách tính khối lượng, KL + %vốn thực tế) + coach "tự tin vs kết quả" (4 mẫu theo tổ hợp tự tin cao/thấp × thắng/thua). Phân tích danh mục = Cấp 2's + Khối ⑦ thắng/thua theo mức tự tin (3 hàng + phát hiện "tự tin của bạn có đáng tin không") + Khối ⑧ khối lượng có đi theo tự tin không. TDD + gates + commit.

### Task FE3: Hành trình Cấp 3 + tốt nghiệp + routing C2→C3
`JourneyPanelCap3` (3 nhiệm vụ + widget Thách thức Bản lĩnh hiện cả 3 điều kiện kèm giá trị hiện tại, §C12c), `GraduationModalCap3` (3 khối; viền tím `#a78bfa`; nút "Vào Cấp 4" → "sắp ra mắt"), `Cap3TradingPage` (mounts KhauViModal on first entry + Kết sổ Cấp 3 + graduation + sidebar panels), extend `DauTruongPage` C2-graduated → Cap3, and Cấp 2's graduation "Vào Cấp 3" to really enter. Barrel exports. TDD + gates + commit.

### Task V: real gates (`npx tsc -b` + `npx vitest run` + `npm run build` + BE `uv run pytest -q`) → merge.
> **NOTE:** `npx tsc --noEmit` in `dashboard/` is a NO-OP (solution-style tsconfig). Use **`npx tsc -b`**.
