# Virtual Trading — Business Rules & API Reference

## Overview

Virtual Trading lets premium users practice stock trading with simulated VND using real-time market data. Each user receives a configurable amount of virtual cash (default 1B VND) and can place market/limit orders against actual Vietnam stock prices.

## Architecture

```
/api/v1/virtual-trading/
├── account/activate   POST   Premium → Create account
├── account            GET    Auth    → Account summary
├── portfolio          GET    Auth    → Positions + NAV
├── orders             POST   Premium → Place order
├── orders             GET    Auth    → List orders
├── orders/{id}/cancel POST   Premium → Cancel pending
├── refresh            POST   Auth    → Process pending/settle
├── trades             GET    Auth    → Trade history
├── leaderboard        GET    Public  → Rankings
├── admin/config       GET    Admin   → Get config
├── admin/config       PATCH  Admin   → Update config
├── admin/users/{id}/reset POST Admin → Reset user
├── admin/reset-all    POST   Admin   → Reset all
└── admin/accounts     GET    Admin   → List all accounts
```

## Fee & Tax Calculation

All monetary values are **integer VND** (no floating point).
Fee/tax rates are in **basis points** (1 bps = 0.01%).

### Buy Order
```
gross       = price_vnd × quantity
fee         = round_half_up(gross × buy_fee_rate_bps / 10000)
total_cost  = gross + fee
```

### Sell Order
```
gross    = price_vnd × quantity
fee      = round_half_up(gross × sell_fee_rate_bps / 10000)
tax      = round_half_up(gross × sell_tax_rate_bps / 10000)
proceeds = gross - fee - tax
```

### Default Config
| Parameter | Default | Description |
|---|---|---|
| initial_cash_vnd | 1,000,000,000 | Starting cash per account |
| buy_fee_rate_bps | 15 | 0.15% buy commission |
| sell_fee_rate_bps | 15 | 0.15% sell commission |
| sell_tax_rate_bps | 10 | 0.1% sell tax |
| board_lot_size | 100 | Minimum order unit |
| settlement_mode | T0 | T0 (instant) or T2 |

## Settlement Modes

### T0 (Default)
- Buy: shares immediately sellable
- Sell: cash immediately available

### T2
- Buy: shares go to `quantity_pending`, become `quantity_sellable` after T+2 trading days
- Sell: proceeds go to `cash_pending_vnd`, become `cash_available_vnd` after T+2 trading days
- Trading days = weekdays excluding configured holidays

## Order Lifecycle

### Market Order
1. Validate symbol against HOSE/HNX/UPCOM universe (fail-closed: 422 if invalid, 503 if source unreachable)
2. Resolve current price from market data (session-aware)
3. If price unavailable → order status = `rejected`
4. Execute immediately → status = `filled`

### Limit Order
1. Reserve cash (buy) or shares (sell) → status = `pending`
2. On `refresh`: if market price ≤ limit (buy) or ≥ limit (sell) → fill
3. GFD expiry: unfilled orders expire when trading_date < current trading date
4. Cancel: user can cancel pending orders, reserves are released

## Cash Tracking

| Field | Description |
|---|---|
| cash_available_vnd | Spendable cash |
| cash_reserved_vnd | Locked by pending buy orders |
| cash_pending_vnd | T2 sell proceeds awaiting settlement |
| total_cash | available + reserved + pending |

## Position Tracking

| Field | Description |
|---|---|
| quantity_total | Total shares held |
| quantity_sellable | Available to sell |
| quantity_pending | T2 buy shares awaiting settlement |
| quantity_reserved | Locked by pending sell orders |

## Config Snapshot (Authoritative)

Each order captures the active config at creation time as `config_snapshot` JSON. When filling a pending limit order, fee/tax rates and settlement mode are read **from the snapshot**, not the current config. This ensures:
- Admin config changes don't retroactively affect pending orders
- Fee/tax at fill time matches what was shown at order time
- Fallback: if snapshot is missing a field, current config is used

## Price Sources

The price resolver is **trading session aware** (Asia/Ho_Chi_Minh timezone):

### Trading Sessions
- Morning: 09:00–11:30
- Afternoon: 13:00–14:45
- Weekdays only, excluding configured holidays

### Source Priority
- **During session**: VCI intraday (realtime last matched price) → OHLCV close fallback
- **Outside session / weekend / holiday**: OHLCV close only (VND → VCI)

## Symbol Validation

All orders (market + limit) are validated against the HOSE/HNX/UPCOM symbol universe:
- **Invalid symbol**: 422 Unprocessable Entity
- **Source unreachable**: 503 Service Unavailable (fail-closed, no order created)
- Symbol list is cached for 5 minutes

## Leaderboard

Public endpoint, no auth required. Ranks active accounts by:
- `nav` (default): Net Asset Value = total cash + market value of positions
- `profit`: NAV - initial cash
- `return_pct`: profit / initial cash × 100
