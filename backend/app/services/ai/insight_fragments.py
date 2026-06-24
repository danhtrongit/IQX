import re
from typing import Any

# Strips any residual markup token so it never reaches the UI as literal text.
# The model sometimes nests tags (e.g. "[bull]... [num]18,000[/num] ...[/bull]");
# the single-level matcher below captures the outer content verbatim, and a
# stray opening tag with no partner survives the matcher entirely, so every
# fragment's content must be cleaned before it is emitted.
_RESIDUAL_TAG = re.compile(r"\[/?(?:bull|bear|warn|info|num|gold)\]")


def _clean(content: str) -> str:
    return _RESIDUAL_TAG.sub("", content)


def parse_fragments(text: str) -> list[dict[str, Any]]:
    """
    Parse inline markup tags into NarrativeFragment dictionaries.

    Supported tags:
    - [bull]...[/bull], [bear]...[/bear], [warn]...[/warn], [info]...[/info]
      -> {"type":"emphasis","content":"...","variant":"<tag>"}
    - [num]...[/num] -> {"type":"number","content":"..."}
    - [gold]...[/gold] -> {"type":"highlight","content":"..."}
    - Plain text between tags -> {"type":"text","content":"..."}

    Unknown/malformed tags are treated as literal text.
    Empty input returns [].
    """
    if not text:
        return []

    fragments = []
    # Pattern to match markup tags: [tag]content[/tag]
    pattern = r'\[(bull|bear|warn|info|num|gold)\](.*?)\[/\1\]'

    last_end = 0
    for match in re.finditer(pattern, text):
        # Add any plain text before this match
        if match.start() > last_end:
            plain_text = _clean(text[last_end:match.start()])
            if plain_text:
                fragments.append({"type": "text", "content": plain_text})

        tag = match.group(1)
        content = _clean(match.group(2))

        # Map tags to fragment types
        if tag == "num":
            fragments.append({"type": "number", "content": content})
        elif tag == "gold":
            fragments.append({"type": "highlight", "content": content})
        elif tag in ("bull", "bear", "warn", "info"):
            fragments.append({
                "type": "emphasis",
                "content": content,
                "variant": tag
            })

        last_end = match.end()

    # Add any remaining plain text after the last match
    if last_end < len(text):
        plain_text = _clean(text[last_end:])
        if plain_text:
            fragments.append({"type": "text", "content": plain_text})

    return fragments
