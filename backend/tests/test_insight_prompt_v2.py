# backend/tests/test_insight_prompt_v2.py
from app.services.ai.prompt_loader import load_prompt


def test_insight_prompt_is_v2():
    p = load_prompt("insight")
    # v2 additions present
    for must in ["Đà giá", "So với phiên trước", "Chờ điểm mua", "Có thể mua thử",
                 "Quan sát thêm", "Nên giảm bớt", "Bán bớt", "[bull]", "[bear]", "[num]"]:
        assert must in p, must
    # v1 removed
    for gone in ["xác suất đảo chiều", "độ tin cậy", "Kịch bản thuận lợi", "Kịch bản bất lợi"]:
        assert gone not in p, gone
