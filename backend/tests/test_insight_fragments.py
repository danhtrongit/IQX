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
