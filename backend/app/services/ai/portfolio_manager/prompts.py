"""System + user prompt builders for the portfolio-manager narrative tier."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

# prompts.py lives at backend/app/services/ai/portfolio_manager/prompts.py
# parents[0]=portfolio_manager [1]=ai [2]=services [3]=app [4]=backend → docs/ai is under backend/
_PROMPT_PATH = Path(__file__).resolve().parents[4] / "docs" / "ai" / "ai-portfolio-manager.md"


@lru_cache(maxsize=1)
def _load_system_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


SYSTEM_PROMPT = _load_system_prompt()

_USER_TEMPLATE = (
    "Đây là Analysis JSON cho báo cáo kỳ này. "
    "Hãy viết Narrative JSON theo đúng system prompt.\n\n"
    "<analysis_json>\n{analysis_json}\n</analysis_json>"
)


def build_user_prompt(analysis: dict) -> str:
    return _USER_TEMPLATE.format(analysis_json=json.dumps(analysis, ensure_ascii=False, indent=2))
