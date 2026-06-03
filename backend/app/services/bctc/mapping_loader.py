from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

_DIR = Path(__file__).parent / "mapping"
_FILES = {"nonbank": "nonbank.yaml", "bank": "bank.yaml"}


@lru_cache(maxsize=4)
def load_mapping(template: str) -> dict[str, str | None]:
    """Trả dict concept -> FieldCode (lowercase) hoặc None nếu chưa ánh xạ.

    template: 'nonbank' (Template A) hoặc 'bank' (Template B).
    """
    if template not in _FILES:
        raise ValueError(f"Template không hợp lệ: {template!r} (cần 'nonbank'|'bank')")
    path = _DIR / _FILES[template]
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return {str(k): (str(v).lower() if v else None) for k, v in data.items()}
