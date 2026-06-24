from app.services.ai.insight_fragments import parse_fragments

def test_plain_text():
    assert parse_fragments("xin chào") == [{"type":"text","content":"xin chào"}]

def test_emphasis_and_number():
    out = parse_fragments("Khối ngoại [bear]bán mạnh[/bear] tới [num]-2.0 triệu[/num].")
    assert out == [
        {"type":"text","content":"Khối ngoại "},
        {"type":"emphasis","content":"bán mạnh","variant":"bear"},
        {"type":"text","content":" tới "},
        {"type":"number","content":"-2.0 triệu"},
        {"type":"text","content":"."},
    ]

def test_gold_highlight_and_empty():
    assert parse_fragments("[gold]61,600[/gold]") == [{"type":"highlight","content":"61,600"}]
    assert parse_fragments("") == []

def test_nested_tags_do_not_leak_markup():
    # Regression: the model nests [num] inside [bull], e.g.
    # "[bull]Giá ABB tăng lên [num]18,000[/num], vượt [num]17,100[/num][/bull]".
    # The single-level regex captured the inner content verbatim, so the
    # nested [num]...[/num] rendered as literal brackets on screen.
    out = parse_fragments(
        "[bull]Giá ABB tăng lên [num]18,000[/num], vượt [num]17,100[/num][/bull]"
    )
    assert out == [
        {"type":"emphasis","content":"Giá ABB tăng lên 18,000, vượt 17,100","variant":"bull"},
    ]
    # No fragment content may contain residual markup brackets.
    for frag in out:
        assert "[num]" not in frag["content"] and "[/num]" not in frag["content"]

def test_stray_unmatched_tag_is_stripped():
    # An opening tag with no closing partner must not survive as literal text.
    out = parse_fragments("Giá lên [num]18,000 hôm nay")
    assert out == [{"type":"text","content":"Giá lên 18,000 hôm nay"}]
