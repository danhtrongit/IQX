"""Assemble the spec section-5 data payload from existing market-data sources.

Everything is fetched on-demand (no new feed). History-dependent fields
(streak, 5d cumulative, MA20 turnover, %above-MA trend) are derived from the
multi-day series the upstream APIs already return.
"""

from __future__ import annotations

import asyncio
import logging
import statistics
import time
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Any

from app.services.market_data.sources import vietcap_market_overview as mo
from app.services.market_data.sources.vietcap import fetch_ohlcv

from . import market_calendar as cal

logger = logging.getLogger(__name__)

ICT = timezone(timedelta(hours=7))
_VND_B = 1e9          # VND → tỷ
_MILLION_PER_B = 1000  # million VND → tỷ


def _r(x: Any, n: int = 2) -> Any:
    return round(x, n) if isinstance(x, (int, float)) else None


async def _safe(coro: Any, label: str) -> Any:
    """Await a fetch_* coroutine, unwrap (data, url) → data, swallow errors."""
    try:
        res = await coro
        return res[0] if isinstance(res, tuple) else res
    except Exception as exc:  # noqa: BLE001
        logger.warning("market_analysis payload source '%s' failed: %s", label, exc)
        return None


def _ma(values: list[float], n: int) -> float | None:
    vals = [v for v in values if isinstance(v, (int, float))]
    if len(vals) < n:
        return None
    return sum(vals[-n:]) / n


# ── component builders ──────────────────────────────────


def _build_index(idx_ohlc: list[dict], snap: dict) -> tuple[dict, dict, float | None]:
    closes = [r["close"] for r in idx_ohlc] if idx_ohlc else []
    today = idx_ohlc[-1] if idx_ohlc else {}
    prev_close = closes[-2] if len(closes) >= 2 else None
    ref = snap.get("ref_price") or prev_close
    close = snap.get("price") or today.get("close")
    change_points = snap.get("change")
    change_pct = snap.get("change_percent")
    if change_points is None and close is not None and ref:
        change_points = close - ref
    if change_pct is None and change_points is not None and ref:
        change_pct = change_points / ref * 100
    high, low = today.get("high"), today.get("low")
    intraday_range_pct = None
    if high is not None and low is not None and ref:
        intraday_range_pct = (high - low) / ref * 100

    vnindex = {
        "close": _r(close), "open": _r(today.get("open")),
        "high": _r(high), "low": _r(low), "reference": _r(ref),
        "change_points": _r(change_points), "change_pct": _r(change_pct),
        "intraday_range_pct": _r(intraday_range_pct),
        "last_30min_change_pct": None,  # không có minute-bar index → missing
    }

    levels = None
    if idx_ohlc:
        highs = [r["high"] for r in idx_ohlc]
        lows = [r["low"] for r in idx_ohlc]
        levels = {
            "vnindex_support": sorted({_r(min(lows[-20:]), 1), _r(min(lows[-60:]), 1)}, reverse=True),
            "vnindex_resistance": sorted({_r(max(highs[-20:]), 1), _r(max(highs[-60:]), 1)}),
            "vnindex_ma20": _r(_ma(closes, 20), 1),
            "vnindex_ma50": _r(_ma(closes, 50), 1),
            "vnindex_ma200": _r(_ma(closes, 200), 1),
        }
    return vnindex, (levels or {}), ref


def _build_vn30(vn30_ohlc: list[dict], snap: dict) -> dict:
    closes = [r["close"] for r in vn30_ohlc] if vn30_ohlc else []
    close = snap.get("price") or (closes[-1] if closes else None)
    ma20, ma50 = _ma(closes, 20), _ma(closes, 50)
    return {
        "close": _r(close), "change_pct": _r(snap.get("change_percent")),
        "ma20": _r(ma20, 1), "ma50": _r(ma50, 1),
        "above_ma20": (close > ma20) if (close and ma20) else None,
        "above_ma50": (close > ma50) if (close and ma50) else None,
    }


def _build_breadth(vn_snap: dict) -> dict:
    adv = vn_snap.get("total_stock_increase") or 0
    dec = vn_snap.get("total_stock_decline") or 0
    unch = vn_snap.get("total_stock_no_change") or 0
    return {
        "advances": adv, "declines": dec, "unchanged": unch,
        "total_traded": adv + dec + unch,
        "advance_decline_ratio": _r(adv / max(dec, 1)),
        "ceiling_count": vn_snap.get("total_stock_ceiling"),
        "floor_count": vn_snap.get("total_stock_floor"),
    }


def _build_internal_heat(b20: list[dict], b50: list[dict]) -> dict:
    s20 = [r["percent"] * 100 for r in b20 if r.get("percent") is not None] if b20 else []
    s50 = [r["percent"] * 100 for r in b50 if r.get("percent") is not None] if b50 else []
    if not s20:
        return {"_missing": True}
    diffs = [s20[i] - s20[i - 1] for i in range(1, len(s20))]
    last60 = diffs[-60:]
    return {
        "pct_above_ma20": _r(s20[-1], 1),
        "pct_above_ma20_yesterday": _r(s20[-2], 1) if len(s20) >= 2 else None,
        "pct_above_ma20_5d_trend": [_r(x, 1) for x in s20[-5:]],
        "pct_above_ma50": _r(s50[-1], 1) if s50 else None,
        "pct_above_ma200": None,  # SMA/EMA200 series không khả dụng từ API
        "biggest_1d_change_60d": _r(max(last60), 1) if last60 else None,
        "biggest_1d_drop_60d": _r(min(last60), 1) if last60 else None,
        "_note": "pct_above_ma20≈EMA20, pct_above_ma50≈EMA50 (API chỉ trả EMA20/EMA50)",
    }


def _build_volume(idx_ohlc: list[dict], vn_snap: dict) -> dict:
    """Thanh khoản phiên + MA20, từ chuỗi `accumulatedValue` (triệu VND) của
    gap-chart VNINDEX — mỗi bar 1D = tổng GTGD ngày đó. MA20 = trung bình 20
    phiên TRƯỚC (không gồm phiên đang xét, để bar partial giữa phiên không tự
    bóp méo MA của chính nó).
    """
    values = [r.get("value") for r in (idx_ohlc or []) if r.get("value")]
    today_million = values[-1] if values else vn_snap.get("total_value_million_vnd")
    today_b = today_million / _MILLION_PER_B if today_million else None

    ma20_million = None
    if len(values) >= 21:
        ma20_million = statistics.fmean(values[-21:-1])
    elif len(values) >= 2:
        ma20_million = statistics.fmean(values[:-1])
    ma20_b = ma20_million / _MILLION_PER_B if ma20_million else None

    ratio = today_b / ma20_b if (today_b and ma20_b) else None
    label = None
    if ratio is not None:
        pct = (ratio - 1) * 100
        label = f"{'vượt' if pct >= 0 else 'thấp hơn'} {abs(pct):.0f}% MA20"
    return {
        "total_value_vnd_billion": _r(today_b, 0),
        "ma20_value_vnd_billion": _r(ma20_b, 0),
        "ratio_vs_ma20": _r(ratio),
        "ratio_vs_ma20_label": label,
    }


def _build_contribution(imp: dict, change_points: float | None) -> dict:
    if not imp:
        return {"_missing": True}
    ups = sorted(imp.get("top_up", []), key=lambda x: x.get("impact") or 0, reverse=True)
    downs = sorted(imp.get("top_down", []), key=lambda x: x.get("impact") or 0)

    # % of change chỉ có nghĩa khi index dịch chuyển đủ lớn; phiên gần như đi
    # ngang (mẫu số ~0) sẽ cho % vô nghĩa (>100%) → bỏ qua, chỉ dùng điểm tuyệt đối.
    meaningful = change_points is not None and abs(change_points) >= 3.0

    def _row(x: dict) -> dict:
        pts = x.get("impact")
        return {
            "ticker": x.get("symbol"), "points": _r(pts),
            "pct_of_change": _r(pts / change_points * 100, 1) if (meaningful and pts) else None,
        }

    top_pos = [_row(x) for x in ups[:5]]
    top_neg = [_row(x) for x in downs[:5]]

    def _cum(n: int) -> float | None:
        if not meaningful:
            return None
        s = sum(abs(x.get("impact") or 0) for x in ups[:n])
        return _r(s / abs(change_points) * 100, 1)

    return {
        "top_positive": top_pos, "top_negative": top_neg,
        "concentration": {"top1_pct": _cum(1), "top3_pct": _cum(3), "top5_pct": _cum(5)},
        "_note": None if meaningful else "Index gần đi ngang — bỏ % đóng góp (mẫu số ~0), chỉ dùng điểm tuyệt đối.",
    }


def _build_foreign(fseries: list[dict], ftop: dict) -> dict:
    nets = [
        (r.get("foreign_buy_value_vnd") or 0) - (r.get("foreign_sell_value_vnd") or 0)
        for r in fseries
    ] if fseries else []
    today_net = nets[-1] if nets else None
    today_row = fseries[-1] if fseries else {}
    streak = 0
    if today_net is not None:
        pos = today_net > 0
        for n in reversed(nets):
            if (n > 0) == pos:
                streak += 1
            else:
                break
    cum5 = sum(nets[-5:]) if nets else None

    def _top(items: list[dict]) -> list[dict]:
        # dedupe by ticker (API can return multi-day rows) keeping largest |net|
        seen: dict[str, float] = {}
        for x in items or []:
            sym = x.get("symbol")
            if not sym:
                continue
            v = x.get("net_value_vnd") or 0
            if sym not in seen or abs(v) > abs(seen[sym]):
                seen[sym] = v
        rows = sorted(seen.items(), key=lambda kv: abs(kv[1]), reverse=True)[:5]
        return [{"ticker": s, "value_vnd_billion": _r(v / _VND_B)} for s, v in rows]

    return {
        "net_value_vnd_billion": _r((today_net or 0) / _VND_B),
        "buy_value_vnd_billion": _r((today_row.get("foreign_buy_value_vnd") or 0) / _VND_B),
        "sell_value_vnd_billion": _r((today_row.get("foreign_sell_value_vnd") or 0) / _VND_B),
        "streak_direction": ("buy" if (today_net or 0) > 0 else "sell") if today_net is not None else None,
        "streak_count": streak,
        "5d_cumulative_vnd_billion": _r((cum5 or 0) / _VND_B) if cum5 is not None else None,
        "top_buy": _top(ftop.get("net_buy", [])) if ftop else [],
        "top_sell": _top(ftop.get("net_sell", [])) if ftop else [],
    }


def _build_prop(pseries: list[dict], ptop: dict) -> dict:
    last = pseries[-1] if pseries else {}
    buy_v = last.get("total_buy_value_vnd")
    sell_v = last.get("total_sell_value_vnd")
    net = (buy_v - sell_v) if (buy_v is not None and sell_v is not None) else None
    # 5d average abs net
    nets5 = []
    for r in (pseries[-5:] if pseries else []):
        b, s = r.get("total_buy_value_vnd"), r.get("total_sell_value_vnd")
        if b is not None and s is not None:
            nets5.append(b - s)
    vs_label = None
    if net is not None and len(nets5) >= 2:
        avg = statistics.fmean([abs(x) for x in nets5])
        if avg:
            vs_label = "trên trung bình 5 phiên" if abs(net) > avg else "dưới trung bình 5 phiên"

    def _top(items: list[dict]) -> list[dict]:
        return [{"ticker": x.get("ticker"),
                 "value_vnd_billion": _r((x.get("total_value_vnd") or 0) / _VND_B)}
                for x in (items or [])[:5]]

    return {
        "net_value_vnd_billion": _r((net or 0) / _VND_B) if net is not None else None,
        "buy_value_vnd_billion": _r((buy_v or 0) / _VND_B) if buy_v is not None else None,
        "sell_value_vnd_billion": _r((sell_v or 0) / _VND_B) if sell_v is not None else None,
        "vs_avg_5d_label": vs_label,
        "top_buy": _top(ptop.get("buy")) if ptop else [],
        "top_sell": _top(ptop.get("sell")) if ptop else [],
    }


def _build_sectors(secs: list[dict], icb_names: dict[int, str]) -> list[dict]:
    if not secs:
        return []
    rows = []
    for s in secs:
        code = s.get("icb_code")
        rows.append({
            "name": icb_names.get(code, f"ICB {code}"),
            "icb_code": code,
            "change_pct": _r(s.get("icb_change_percent")),
            "volume_vnd_billion": _r((s.get("total_value_vnd") or 0) / _VND_B, 0),
        })
    rows = [r for r in rows if r["change_pct"] is not None]
    # dedupe by name (ICB parent/child can map to the same name), keep larger volume
    best: dict[str, dict] = {}
    for r in rows:
        cur = best.get(r["name"])
        if cur is None or (r.get("volume_vnd_billion") or 0) > (cur.get("volume_vnd_billion") or 0):
            best[r["name"]] = r
    rows = sorted(best.values(), key=lambda r: r["change_pct"], reverse=True)
    # return strongest + weakest few
    top = rows[:4]
    bottom = rows[-3:]
    return top + [r for r in bottom if r not in top]


async def _msn_indices() -> dict[str, Any]:
    """Best-effort world indices via MSN. Returns {} when MSN is unreachable
    (the apikey resolver is currently flaky upstream)."""
    try:
        from app.services.market_data.sources import msn
        apikey = await asyncio.wait_for(msn.resolve_apikey(None), timeout=12)
    except Exception as exc:  # noqa: BLE001
        logger.warning("global indices skipped (MSN): %s", exc)
        return {}

    async def _idx(sym: str) -> tuple[str, dict | None]:
        try:
            series, _ = await msn.fetch_world_index(sym, apikey)
            if series:
                last = series[-1]
                return sym, {"value": _r(last.get("value"), 1),
                             "change_pct": _r(last.get("change") or last.get("changePercent"))}
        except Exception:
            pass
        return sym, None

    results = await asyncio.gather(
        _idx("INX"), _idx("N225"), _idx("HSI"), return_exceptions=True,
    )
    return {r[0]: r[1] for r in results if isinstance(r, tuple) and r[1]}


async def _build_global(session_date: str) -> dict | None:
    """Downscoped global context. USD/VND (VCB) + gold (SJC) are reliable and
    used regardless of MSN; world indices (SPX/N225/HSI) are best-effort MSN."""
    fx_commodities: dict[str, Any] = {}

    # USD/VND — Vietcombank (no apikey, reliable)
    try:
        from app.services.market_data.sources import vcb
        rows = await _safe(vcb.fetch_fx(session_date), "vcb_fx")
        usd = next((r for r in (rows or []) if r.get("currency_code") == "USD"), None)
        if usd and usd.get("sell"):
            fx_commodities["usdvnd"] = {"value": _r(usd["sell"], 0)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("usdvnd fetch failed: %s", exc)

    # Gold — SJC (reliable)
    try:
        from app.services.market_data.sources import sjc
        rows = await _safe(sjc.fetch_gold(session_date), "sjc_gold")
        gold = next((r for r in (rows or []) if r.get("sell_price")), None)
        if gold:
            fx_commodities["gold"] = {"value": gold["sell_price"], "name": gold.get("name")}
    except Exception as exc:  # noqa: BLE001
        logger.warning("gold fetch failed: %s", exc)

    idx_map = await _msn_indices()

    block: dict[str, Any] = {}
    if idx_map.get("INX"):
        block["us_overnight"] = {"spx": idx_map["INX"]}
    asia = {k: idx_map[v] for k, v in {"n225": "N225", "hsi": "HSI"}.items() if idx_map.get(v)}
    if asia:
        block["asia_today"] = asia
    if fx_commodities:
        block["fx_commodities"] = fx_commodities
    return block or None


async def _icb_name_map() -> dict[int, str]:
    """Map ICB code → Vietnamese sector name from VCI reference endpoint."""
    data = await _safe(mo.fetch_icb_codes(), "icb_codes")
    out: dict[int, str] = {}
    for it in (data or []):
        code = it.get("icb_code")
        name = it.get("vi_sector") or it.get("en_sector")
        if code is not None and name:
            out[code] = name
    return out


async def _build_news() -> list[dict]:
    try:
        from app.services.market_data.sources.vietcap_ai_news import fetch_news_list
        items, _total, _url = await fetch_news_list("business", page=1, page_size=8)
    except Exception as exc:  # noqa: BLE001
        logger.warning("news fetch failed: %s", exc)
        return []
    out = []
    for it in (items or [])[:6]:
        if not isinstance(it, dict):
            continue
        tk = it.get("ticker") or it.get("tickers")
        tickers = tk if isinstance(tk, list) else ([tk] if tk else [])
        out.append({
            "title": it.get("title"),
            "sentiment": it.get("sentiment", it.get("score")),
            "tickers": [t for t in tickers if t],
        })
    return out


# ── main entry ──────────────────────────────────────────


async def build_analysis_payload() -> dict[str, Any]:
    """Build the full section-5 payload for the latest closed session."""
    end = int(time.time())
    start = end - 400 * 86400

    idx_ohlc, vn30_ohlc, snap_list, b20, b50, imp, fser, ftop, pser, ptop, secs, icb_names, news = (
        await asyncio.gather(
            _safe(fetch_ohlcv("VNINDEX", start_ts=start, end_ts=end, interval="1D", count_back=260), "vnindex_ohlc"),
            _safe(fetch_ohlcv("VN30", start_ts=start, end_ts=end, interval="1D", count_back=60), "vn30_ohlc"),
            _safe(mo.fetch_market_index(symbols=["VNINDEX", "VN30", "HNXIndex", "HNXUpcomIndex"]), "snapshot"),
            _safe(mo.fetch_breadth(condition="EMA20", exchange="HSX", period="Y1"), "breadth20"),
            _safe(mo.fetch_breadth(condition="EMA50", exchange="HSX", period="Y1"), "breadth50"),
            _safe(mo.fetch_index_impact(group="ALL", time_frame="ONE_DAY"), "impact"),
            _safe(mo.fetch_foreign(group="ALL", time_frame="ONE_DAY", from_ts=start, to_ts=end), "foreign"),
            # single-day window: default range is ~1y → returns duplicate/cumulative rows
            _safe(mo.fetch_foreign_top(group="ALL", time_frame="ONE_DAY",
                                       from_ts=end - 2 * 86400, to_ts=end), "foreign_top"),
            _safe(mo.fetch_proprietary(market="ALL", time_frame="ONE_DAY"), "prop"),
            _safe(mo.fetch_proprietary_top(exchange="ALL", time_frame="ONE_DAY"), "prop_top"),
            _safe(mo.fetch_sectors_allocation(group="ALL", time_frame="ONE_DAY"), "sectors"),
            _icb_name_map(),
            _build_news(),
        )
    )

    snap = {s["symbol"]: s for s in (snap_list or [])}
    vn_snap = snap.get("VNINDEX", {})

    vnindex, levels, ref = _build_index(idx_ohlc, vn_snap)
    # session date from latest index bar
    session_date = None
    if idx_ohlc:
        try:
            session_date = datetime.fromtimestamp(int(idx_ohlc[-1]["time"]), ICT).date().isoformat()
        except Exception:
            session_date = date.today().isoformat()

    payload: dict[str, Any] = {
        "meta": {
            "generated_for_date": session_date or date.today().isoformat(),
            "as_of": datetime.now(UTC).isoformat(),
            "session_type": None,  # filled by classifier
            "missing_fields": [],
        },
        "vnindex": vnindex,
        "vn30": _build_vn30(vn30_ohlc, snap.get("VN30", {})),
        "hnx": {
            "close": _r((snap.get("HNXIndex") or {}).get("price")),
            "change_pct": _r((snap.get("HNXIndex") or {}).get("change_percent")),
        },
        "upcom": {
            "close": _r((snap.get("HNXUpcomIndex") or {}).get("price")),
            "change_pct": _r((snap.get("HNXUpcomIndex") or {}).get("change_percent")),
        },
        "breadth": _build_breadth(vn_snap),
        "internal_heat": _build_internal_heat(b20, b50),
        "volume": _build_volume(idx_ohlc, vn_snap),
        "point_contribution": _build_contribution(imp, vnindex.get("change_points")),
        "foreign_flow": _build_foreign(fser, ftop),
        "prop_trading": _build_prop(pser, ptop),
        "sectors": _build_sectors(secs, icb_names),
        "technical_levels": levels,
        "global_context": await _build_global(session_date or date.today().isoformat()),
        "calendar_hardcoded": cal.build_calendar_block(
            date.fromisoformat(session_date) if session_date else date.today()
        ),
        "top_news_24h": news,
        "historical_pattern_match": {"found": False},
        "memory_context": {"last_analysis": None,
                           "recent_5_sessions_overview": [],
                           "verifiable_claims_from_recent_analyses": []},
    }

    # data completeness over key blocks
    key_blocks = ["vnindex", "breadth", "internal_heat", "volume",
                  "point_contribution", "foreign_flow", "prop_trading", "sectors"]
    present = sum(
        1 for k in key_blocks
        if payload.get(k) and not (isinstance(payload[k], dict) and payload[k].get("_missing"))
    )
    payload["meta"]["data_completeness"] = round(present / len(key_blocks), 2)
    missing = ["vnindex.last_30min_change_pct"]
    if payload["volume"].get("ratio_vs_ma20") is None:
        missing.append("volume.ratio_vs_ma20")
    if payload["global_context"] is None:
        missing.append("global_context")
    elif not (payload["global_context"].get("us_overnight") or payload["global_context"].get("asia_today")):
        missing.append("global_context.indices")  # MSN down → chỉ có USD/VND + vàng
    if payload["internal_heat"].get("_missing"):
        missing.append("internal_heat")
    payload["meta"]["missing_fields"] = missing
    payload["meta"]["data_notes"] = [
        "Nếu chạy GIỮA PHIÊN: thanh khoản phiên hiện tại là lũy kế đang chạy "
        "(chưa đủ phiên) nên ratio vs MA20 có thể thấp; bản 16:30 sau ATC là số EOD đầy đủ.",
        "global_context: USD/VND + vàng từ nguồn nội (VCB/SJC) đáng tin; chỉ số "
        "thế giới (S&P500, Nikkei, Hang Seng) best-effort qua MSN — nếu thiếu thì bỏ qua, không bịa.",
    ]
    return payload
