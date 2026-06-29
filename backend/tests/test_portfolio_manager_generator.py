import datetime as dt
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai.portfolio_manager import generator as G


_GOOD_NARRATIVE = {
    "title": "Danh mục khỏe lên", "verdict": "Khỏe lên.", "lede": "Mở đầu.",
    "progress_text": "", "layers": {k: "Một đoạn." for k in
        ("overview", "performance", "allocation", "stress", "risk", "attribution", "quality", "behavior")},
    "insight": {"label": "x", "text": "y"}, "low_data_note": "",
    "actions": [{"title": "Nâng tiền mặt", "detail": "Đưa tiền mặt lên 15,0%."}],
    "watch": "...", "closing": "Đi đúng hướng.",
}

_ANALYSIS = {
    "meta": {"mode": "first", "date": "2026-06-23", "period_number": 1},
    "overview": {"positions": [{"ticker": "HPG", "weight": 0.16}]},
    "scores": {"overall": 3.5}, "selected_insights": [{"id": "x"}],
    "risk": {"excluded": []},
}


@pytest.mark.asyncio
async def test_generate_persists_and_returns(db_session, premium_user):
    user, _ = premium_user
    with patch.object(G, "build_analysis", new=AsyncMock(return_value=_ANALYSIS)), \
         patch.object(G, "_resolve_account_id", new=AsyncMock(return_value="00000000-0000-0000-0000-000000000001")), \
         patch.object(G, "chat_completion", new=AsyncMock(return_value=(json.dumps(_GOOD_NARRATIVE), "deepseek-test"))):
        out = await G.generate_report(db_session, user.id)
    assert out["meta"]["valid"] is True
    assert out["narrative"]["title"] == "Danh mục khỏe lên"
    assert out["meta"]["attempts"] == 1


@pytest.mark.asyncio
async def test_generate_retries_on_invalid_then_succeeds(db_session, premium_user):
    user, _ = premium_user
    bad = dict(_GOOD_NARRATIVE, actions=[{"title": "x", "detail": "không có số"}])
    responses = [(json.dumps(bad), "m"), (json.dumps(_GOOD_NARRATIVE), "m")]
    mock = AsyncMock(side_effect=responses)
    with patch.object(G, "build_analysis", new=AsyncMock(return_value=_ANALYSIS)), \
         patch.object(G, "_resolve_account_id", new=AsyncMock(return_value="00000000-0000-0000-0000-000000000002")), \
         patch.object(G, "chat_completion", new=mock):
        out = await G.generate_report(db_session, user.id)
    assert out["meta"]["attempts"] == 2
    assert out["meta"]["valid"] is True


@pytest.mark.asyncio
async def test_insufficient_skips_llm(db_session, premium_user):
    user, _ = premium_user
    with patch.object(G, "_resolve_account_id", new=AsyncMock(return_value="00000000-0000-0000-0000-000000000003")), \
         patch.object(G, "build_analysis", new=AsyncMock(return_value={"insufficient_data": True, "reason": "r"})), \
         patch.object(G, "chat_completion", new=AsyncMock()) as llm:
        out = await G.generate_report(db_session, user.id)
    assert out["analysis"]["insufficient_data"] is True
    llm.assert_not_called()


@pytest.mark.asyncio
async def test_no_virtual_account_returns_insufficient_not_404(db_session, premium_user):
    from app.core.exceptions import NotFoundError
    user, _ = premium_user
    with patch.object(G, "_resolve_account_id", new=AsyncMock(side_effect=NotFoundError("tài khoản giao dịch ảo"))), \
         patch.object(G, "chat_completion", new=AsyncMock()) as llm:
        out = await G.generate_report(db_session, user.id)
    assert out["analysis"]["insufficient_data"] is True
    assert out["meta"]["insufficient"] is True
    llm.assert_not_called()
