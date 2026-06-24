"""Build v2 AIInsightResponse from parsed AI JSON + payload.

Pure function — no LLM, no DB.

Exports:
    build_insight_response(ai_json, payload, prev) -> dict

Return shape matches SPEC §4.5 (TypeScript AIInsightResponse):
    { symbol, updatedAt, header, briefing, layers:{L1..L5}, rawInput }
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.services.ai.insight_fragments import parse_fragments
from app.services.ai.insight_levels import briefing_variant, status_level

# ── Constants ────────────────────────────────────────────────────────────────

_LAYER_NAMES: dict[str, str] = {
    "L1": "Xu hướng",
    "L2": "Thanh khoản",
    "L3": "Dòng tiền",
    "L4": "Nội bộ",
    "L5": "Tin tức",
}

_RECOMMENDATION_SET = frozenset(
    {"Chờ điểm mua", "Có thể mua thử", "Quan sát thêm", "Nên giảm bớt", "Bán bớt"}
)

# Sentinel phrases that mean "no change" in the diff field.
_NO_CHANGE_SENTINELS = (
    "ổn định",
    "lần đầu",
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _format_volume(vol: Any) -> str:
    """Format a raw volume number to a short string like '18.0M' or '350K'."""
    try:
        v = float(vol)
    except (TypeError, ValueError):
        return ""
    if v >= 1_000_000:
        return f"{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v / 1_000:.1f}K"
    return str(int(v))


def _build_header(payload: dict[str, Any]) -> dict[str, Any]:
    """Extract StockHeader from payload (price_board + company_overview/details)."""
    sym = str(payload.get("symbol", "")).upper()

    price_board = payload.get("price_board")
    pb: dict[str, Any] = {}
    if isinstance(price_board, list) and price_board:
        pb = price_board[0] if isinstance(price_board[0], dict) else {}

    # Price fields — key names produced by vietcap.fetch_price_board
    price = pb.get("close_price") or pb.get("matchedPrice") or pb.get("close") or 0
    ref = pb.get("reference_price") or pb.get("refPrice") or pb.get("referencePrice") or 0
    high = pb.get("high_price") or pb.get("high") or pb.get("highPrice") or 0
    low = pb.get("low_price") or pb.get("low") or pb.get("lowPrice") or 0
    total_vol = pb.get("total_volume") or pb.get("totalVolume") or pb.get("nmTotalTradedQty") or 0
    exchange = pb.get("exchange") or ""

    # Change percent
    change_pct: float = 0.0
    if ref and price:
        try:
            change_pct = round((float(price) - float(ref)) / float(ref) * 100, 2)
        except (TypeError, ValueError, ZeroDivisionError):
            change_pct = 0.0

    # Sector / index group from company_details (Vietcap fields)
    company_details = payload.get("company_details") or {}
    company_overview = payload.get("company_overview") or {}

    sector = (
        company_details.get("icb_name_2")
        or company_details.get("icb_name_3")
        or company_details.get("industryName")
        or ""
    )
    index_group = (
        company_details.get("stock_type")
        or company_details.get("index_type")
        or company_details.get("indexGroup")
        or company_overview.get("exchange")
        or exchange
        or ""
    )

    # isLive: True if price data present (not None/0)
    is_live = bool(pb)

    return {
        "symbol": sym,
        "sector": sector,
        "indexGroup": index_group,
        "price": price,
        "changePercent": change_pct,
        "high": high,
        "low": low,
        "volume": _format_volume(total_vol),
        "isLive": is_live,
    }


def _diff_has_change(diff_text: str) -> bool:
    """Return True if the diff is not a sentinel 'no-change' phrase."""
    lower = diff_text.lower()
    return not any(sentinel in lower for sentinel in _NO_CHANGE_SENTINELS)


def _build_diff(diff_text: str, *, is_first: bool) -> dict[str, Any]:
    return {
        "text": parse_fragments(diff_text),
        "hasChange": _diff_has_change(diff_text),
        "isFirstAnalysis": is_first,
    }


# ── Layer builders ───────────────────────────────────────────────────────────

def _layer_fields_l1(layer: dict[str, Any]) -> list[dict[str, Any]]:
    fields = []
    if layer.get("xu_huong"):
        fields.append({"label": "Xu hướng", "value": parse_fragments(str(layer["xu_huong"]))})
    if layer.get("statusLabel"):
        fields.append({"label": "Trạng thái", "value": parse_fragments(str(layer["statusLabel"]))})
    if layer.get("ho_tro"):
        fields.append({"label": "Hỗ trợ", "value": parse_fragments(str(layer["ho_tro"]))})
    if layer.get("khang_cu"):
        fields.append({"label": "Kháng cự", "value": parse_fragments(str(layer["khang_cu"]))})
    if layer.get("da_gia"):
        fields.append({"label": "Đà giá", "value": parse_fragments(str(layer["da_gia"]))})
    return fields


def _layer_fields_l2(layer: dict[str, Any]) -> list[dict[str, Any]]:
    fields = []
    if layer.get("thanh_khoan"):
        fields.append({"label": "Thanh khoản", "value": parse_fragments(str(layer["thanh_khoan"]))})
    if layer.get("cung_cau"):
        fields.append({"label": "Cung–Cầu", "value": parse_fragments(str(layer["cung_cau"]))})
    if layer.get("tac_dong"):
        fields.append({"label": "Tác động", "value": parse_fragments(str(layer["tac_dong"]))})
    return fields


def _layer_fields_l3(layer: dict[str, Any]) -> list[dict[str, Any]]:
    fields = []
    if layer.get("khoi_ngoai"):
        fields.append({"label": "Khối ngoại", "value": parse_fragments(str(layer["khoi_ngoai"]))})
    if layer.get("tu_doanh"):
        fields.append({"label": "Tự doanh", "value": parse_fragments(str(layer["tu_doanh"]))})
    if layer.get("statusLabel"):
        fields.append({"label": "Tác động", "value": parse_fragments(str(layer["statusLabel"]))})
    return fields


def _layer_fields_l4(layer: dict[str, Any]) -> list[dict[str, Any]]:
    fields = []
    if layer.get("noi_bo"):
        fields.append({"label": "Nội bộ", "value": parse_fragments(str(layer["noi_bo"]))})
    if layer.get("khoi_luong_tong"):
        fields.append({"label": "Khối lượng tổng", "value": parse_fragments(str(layer["khoi_luong_tong"]))})
    if layer.get("statusLabel"):
        fields.append({"label": "Tác động", "value": parse_fragments(str(layer["statusLabel"]))})
    return fields


def _layer_fields_l5(layer: dict[str, Any]) -> list[dict[str, Any]]:
    fields = []
    if layer.get("tong_quan"):
        fields.append({"label": "Tổng quan", "value": parse_fragments(str(layer["tong_quan"]))})
    # Tin material — render as a list of items with title + tag + tac_dong_ngan
    tin_material = layer.get("tin_material") or []
    if tin_material:
        material_lines = "; ".join(
            f"{item.get('tieu_de', '')} [{item.get('tag', '')}] — {item.get('tac_dong_ngan', '')}"
            for item in tin_material
            if isinstance(item, dict)
        )
        fields.append({"label": "Tin material", "value": parse_fragments(material_lines)})
    # Tin filler — plain list
    tin_filler = layer.get("tin_filler") or []
    if tin_filler:
        filler_lines = "; ".join(
            f"{item.get('tieu_de', '')} [{item.get('tag', '')}]"
            for item in tin_filler
            if isinstance(item, dict)
        )
        fields.append({"label": "Tin filler", "value": parse_fragments(filler_lines)})
    if layer.get("tac_dong"):
        fields.append({"label": "Tác động", "value": parse_fragments(str(layer["tac_dong"]))})
    return fields


_LAYER_FIELD_BUILDERS = {
    "L1": _layer_fields_l1,
    "L2": _layer_fields_l2,
    "L3": _layer_fields_l3,
    "L4": _layer_fields_l4,
    "L5": _layer_fields_l5,
}


def _build_layer_card(layer_key: str, layer: dict[str, Any], *, is_first: bool) -> dict[str, Any]:
    status_label = layer.get("statusLabel", "")
    diff_text = layer.get("diff", "")

    field_builder = _LAYER_FIELD_BUILDERS.get(layer_key)
    fields = field_builder(layer) if field_builder else []

    return {
        "layerNum": layer_key,
        "layerName": _LAYER_NAMES.get(layer_key, layer_key),
        "statusLabel": status_label,
        "statusLevel": status_level(layer_key, status_label),
        "fields": fields,
        "diff": _build_diff(diff_text, is_first=is_first),
    }


# ── Briefing builder ─────────────────────────────────────────────────────────


def _build_briefing(l6: dict[str, Any], *, is_first: bool, updated_at: str) -> dict[str, Any]:
    trend = l6.get("trend", "")
    status = l6.get("status", "")
    timeframe = l6.get("timeframe", "")
    narrative_text = l6.get("narrative", "")
    diff_text = l6.get("diff", "")
    recommendation = l6.get("recommendation", "Quan sát thêm")

    # observations
    obs_raw = l6.get("observations") or {}
    observations = {
        "liquidity": parse_fragments(obs_raw.get("liquidity", "")),
        "moneyFlow": parse_fragments(obs_raw.get("moneyFlow", "")),
        "insider": parse_fragments(obs_raw.get("insider", "")),
        "news": parse_fragments(obs_raw.get("news", "")),
        "supportResistance": parse_fragments(obs_raw.get("supportResistance", "")),
    }

    # watchLevels — pass through as-is (already {tag, description})
    watch_levels = l6.get("watchLevels") or []

    # Guard recommendation to the 5 valid phrases
    if recommendation not in _RECOMMENDATION_SET:
        recommendation = "Quan sát thêm"

    return {
        "updatedAt": updated_at,
        "trend": trend,
        "status": status,
        "statusVariant": briefing_variant(trend, status),
        "timeframe": timeframe,
        "narrative": parse_fragments(narrative_text),
        "diff": _build_diff(diff_text, is_first=is_first),
        "observations": observations,
        "watchLevels": watch_levels,
        "recommendation": recommendation,
    }


# ── Public API ───────────────────────────────────────────────────────────────


def build_insight_response(
    ai_json: dict[str, Any],
    payload: dict[str, Any],
    prev: dict[str, Any] | None,
) -> dict[str, Any]:
    """Assemble the v2 AIInsightResponse dict.

    Args:
        ai_json:  Parsed LLM JSON with keys L1..L6 (per task-1-report.md schema).
        payload:  build_insight_payload() output (price_board, company_overview,
                  company_details, rawInput, ...).
        prev:     Previous analysis dict (or None for first analysis).

    Returns:
        Dict matching SPEC §4.5 AIInsightResponse.
    """
    is_first = prev is None
    updated_at = datetime.now(UTC).isoformat()
    symbol = str(payload.get("symbol", "")).upper()

    # Header
    header = _build_header(payload)
    if not header["symbol"] and symbol:
        header["symbol"] = symbol

    # Layers L1–L5
    layers: dict[str, Any] = {}
    for layer_key in ("L1", "L2", "L3", "L4", "L5"):
        layer_data = ai_json.get(layer_key) or {}
        layers[layer_key] = _build_layer_card(layer_key, layer_data, is_first=is_first)

    # Briefing from L6
    l6 = ai_json.get("L6") or {}
    briefing = _build_briefing(l6, is_first=is_first, updated_at=updated_at)

    # rawInput — carry through from payload (BT8 populates it; here we pass through)
    raw_input = payload.get("rawInput") or {}

    return {
        "symbol": symbol or header["symbol"],
        "updatedAt": updated_at,
        "header": header,
        "briefing": briefing,
        "layers": layers,
        "rawInput": raw_input,
    }
