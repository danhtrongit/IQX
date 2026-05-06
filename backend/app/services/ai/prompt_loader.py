"""Load AI prompt templates from markdown files in backend/docs/ai/.

Prompts are cached after first load to avoid repeated filesystem reads.
If a prompt file does not exist, a clear FileNotFoundError is raised.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# Base directory for prompt files — resolved relative to this file
_DOCS_AI_DIR = Path(__file__).resolve().parents[3] / "docs" / "ai"

# Mapping of prompt type → filename
PROMPT_FILES: dict[str, str] = {
    "dashboard": "ai-dashboard.md",
    "industry": "ai-industry.md",
    "insight": "ai-insight.md",
}


@lru_cache(maxsize=8)
def load_prompt(prompt_type: str) -> str:
    """Load and return the content of a prompt markdown file.

    Args:
        prompt_type: One of 'dashboard', 'industry', 'insight'.

    Returns:
        The full text content of the prompt file.

    Raises:
        ValueError: If prompt_type is not recognised.
        FileNotFoundError: If the prompt file does not exist on disk.
    """
    filename = PROMPT_FILES.get(prompt_type)
    if filename is None:
        raise ValueError(
            f"Loại prompt '{prompt_type}' không hợp lệ. "
            f"Cho phép: {', '.join(sorted(PROMPT_FILES))}"
        )

    filepath = _DOCS_AI_DIR / filename
    if not filepath.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy file prompt: {filepath}. "
            f"Hãy đảm bảo file tồn tại trong thư mục docs/ai/."
        )

    content = filepath.read_text(encoding="utf-8")
    logger.debug("Loaded AI prompt '%s' from %s (%d chars)", prompt_type, filepath, len(content))
    return content


def clear_cache() -> None:
    """Clear the prompt cache (useful for testing)."""
    load_prompt.cache_clear()
