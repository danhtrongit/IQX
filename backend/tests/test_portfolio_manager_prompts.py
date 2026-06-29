from app.services.ai.portfolio_manager import prompts as P


def test_system_prompt_loaded_and_nonempty():
    assert isinstance(P.SYSTEM_PROMPT, str)
    assert len(P.SYSTEM_PROMPT) > 200


def test_user_prompt_embeds_analysis_json():
    up = P.build_user_prompt({"meta": {"date": "2026-06-23"}, "overview": {"nav": 534000000}})
    assert "analysis_json" in up
    assert "534000000" in up
