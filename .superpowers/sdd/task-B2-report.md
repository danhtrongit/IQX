# Task B2 Report — Premarket Payload Builder

## Status
COMPLETE — green on all tests, committed to `feat/intl-data-premarket`.

## Commit
`00f0c12` — `feat(premarket): payload builder (snapshot cells + inverted USD/VND, pools, EOD context, degrade)`

## Test Summary
`tests/test_premarket_payload.py` — **12/12 passed**
Full suite: **1205 passed, 47 skipped, 0 failed** (154 s)
Targeted run: `uv run pytest tests/ -k premarket -q` → **26 passed**

## What was implemented

### `backend/app/services/ai/market_analysis/premarket_payload.py`
Added to the existing normalizer file (without modifying existing `normalize_news`, `normalize_events`, `SOURCE_RANK`):

1. **Module-level re-exports** for patchability: `load_latest_snapshot`, `fetch_news_list`, `fetch_events_calendar`, `fetch_fx` imported at module level so tests can `patch.object(PP, "...")`.

2. **`build_premarket_payload(db) -> dict`** — main async entry:
   - `asyncio.gather` for all external fetches (snapshot, news, events, VCB fx, EOD).
   - 6 fixed-order grid cells (`^GSPC`, `^IXIC`, `^N225`, `BZ=F`, `GC=F`, `VND=X`); always emitted even when absent.
   - USD/VND sentiment **inverted**: `change_pct < 0 → "up"`, `> 0 → "down"`, `None → "flat"`.
   - VCB fallback for absent/stale `VND=X`: `fetch_fx(today)` → USD sell rate, `change_pct=None`, `source="vcb"`.
   - Decimal → float conversion for all cell values.
   - `missing_fields` populated for: absent grid symbols (`"global_markets"`), news fetch failure (`"news_pool"`), events fetch failure (`"events_pool"`).
   - `meta` keys: `report_type="premarket"`, `generated_for_date`, `missing_fields`, `weekday_vi`, `is_post_weekend`, `is_post_holiday`, `as_of`.
   - `config` mirrors the meta flags (prompt consumption contract).
   - `eod_previous_summary`: `headline/tagline/scenarios/watchlist` from latest published `report_type='daily'` row (replicates the `_load_previous_eod` pattern from `midday_payload.py`).

3. **Calendar helpers**:
   - `_compute_calendar_flags(today)` using `market_calendar.is_trading_day`.
   - `_prev_trading_day(today)` walking back up to 14 days.
   - News window: 17:00 prev trading day → 06:30 today (ICT).

4. **`_safe(coro, label)`** — mirrors midday_payload's pattern; swallows exceptions, unwraps `(data, url)` tuples.

### `backend/tests/test_premarket_payload.py`
12 tests covering:
- Cell shape + USD/VND inversion (the spec's required test)
- All 6 cells emitted when snapshot empty (VCB also mocked to fail)
- USD/VND `+0.50%` → "down", `0.0%` → "flat"
- News fetch failure → empty pool + missing_fields
- Events fetch failure → empty pool + missing_fields
- VCB fallback populates VND=X value with `source="vcb"`
- Meta structure validation
- `config` mirrors meta flags
- Fixed cell order regardless of snapshot order
- Stale snapshot row → `stale=True` in cell
- Decimal price/pct converted to float

## Concerns / Notes
- `load_latest_snapshot` returns a plain list (not a tuple), so `_safe` returns it unmodified — correct.
- The `_safe` wrapper silently swallows VCB failures; if VCB is down AND `VND=X` is absent, the cell degrades to `value=None, stale=True` and `"global_markets"` is added to `missing_fields`.
- `is_post_holiday` logic: previous *calendar* day was a weekday but `is_trading_day()` returned False (i.e. a VN holiday). Weekend days do not trigger `is_post_holiday` — they trigger `is_post_weekend` instead. This is correct per spec.
- `asyncio.gather(return_exceptions=False)` — any uncaught exception in `_load_previous_eod` (which has its own try/except) bubbles up. EOD failures return `None` internally so `gather` won't raise.

## Fix report

### Finding addressed
`_build_global_markets` only treated `row is None` as absent for VCB fallback. A stale `VND=X` row (row exists but `row.stale=True`) was emitted with the stale Yahoo price — VCB fallback was never attempted.

### Fix applied
`premarket_payload.py` lines 419–460: introduced `row_is_stale_usdvnd` flag. The branch condition is now `if row is None or row_is_stale_usdvnd`. Inside:
- If VCB sell rate available → VCB cell (value=sell rate, change_pct=None, sentiment="flat", source="vcb", stale=False).
- If VCB also unavailable but stale row exists → stale row data emitted (stale=True, NOT added to missing_fields).
- If row absent and VCB down → existing degraded path (value=None, stale=True, any_missing=True) unchanged.
- Non-VND=X stale rows → behavior unchanged.

### Test run
```
uv run pytest tests/test_premarket_payload.py -q
```
```
..............                                                           [100%]
14 passed in 2.21s
```

2 new tests added:
1. `test_stale_vndx_uses_vcb_fallback` — stale row + VCB available → VCB value, source "vcb", stale False, not in missing_fields.
2. `test_stale_vndx_vcb_also_fails_uses_stale_row` — stale row + VCB fails → stale row price, stale True, NOT in missing_fields.
