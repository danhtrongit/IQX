# Update 19-11 — dev notes

Specs: `IQX-Bo-Cuc-SPEC.md` (bố cục v1.3 + kinh tế xu/Demo) and `IQX-Tab-IQX-Loc-Backtest-SPEC.md`
(tab IQX cho Bộ lọc/Backtest + Quản trị Mẫu IQX). The `*-MAU.html` files are content/behaviour references only.

## Decisions taken (2026-11-20)

| Spec point | Decision | Why |
| --- | --- | --- |
| Bố cục §2.4 default tool of LUYỆN TẬP | **Candle Dojo** | Candle Dojo is already live on the web (2026-11-09), so the spec's own proposal says Candle Dojo. |
| Bố cục §2.5 Candle Dojo button | **Shown**, first in the LUYỆN TẬP rail | Already live. |
| Header "Khu giao dịch" (not in spec, added 2026-11-14) | Kept, after CHIẾN LƯỢC | Spec predates it; "chỗ nào spec không nhắc tới thì giữ nguyên". |
| Bố cục §6 routes | `/luyen-tap?tool=…` and `/flashback?tool=…`, tool slugs `candle-dojo, hoc-vien, bot, giao-dich, phan-tich` / `flashback, shop`; `tab=dat-lenh|danh-muc|tin-tuc` for Giao dịch; main-area tab keeps `content=chart|board|market` | Spec proposal. `/demo-trading*` keeps working as a redirect. |
| Bố cục §8.2 demo exchange already ran on prod? | **Yes.** Prod 2026-11-20: 3 `demo_withdraw` (xu → cash, 3 users, 1000/100/1000 xu), 3 `demo_deposit` (cash → xu, 1 old 100M account, 10 000 xu); 24 accounts opened at 0đ. | Checked in `coin_ledger` / `virtual_trading_accounts`. |
| Bố cục §8.2 conversion | Spec proposal, generalised with the existing `net_deposited_cash_vnd` column (it already equals old grant + xu→cash − cash→xu): `cash_available += 100 000 000 − net_deposited_cash_vnd`; refund `max(0, net_deposited_cash_vnd − original initial_cash_vnd) / 10 000` xu as `demo_exchange_refund`; then `initial_cash_vnd = net_deposited_cash_vnd = 100 000 000`. Positions and order history untouched. Negative cash after the step → abort and list accounts (none expected). One-off, logged in a table for reconciliation. | Old 100M accounts that never exchanged get +0; a 0đ account gets +100M; an account that converted all 100M into xu gets its 100M back and keeps the xu (no clawback, the proposal never takes xu away). |
| Tab IQX §0.3 lesson locks | **No lock left**: `AcademyGrantsService.grantedCapabilities` returns every tool capability. So the IQX tab carries nothing about lessons. | Code check. |
