from app.models.ai_insight_history import AIInsightHistory


def test_table_shape():
    t = AIInsightHistory.__table__
    assert t.name == "ai_insight_history"
    cols = set(t.columns.keys())
    assert {"id", "symbol", "session_date", "payload", "created_at", "updated_at"} <= cols
    uniques = [tuple(c.name for c in u.columns) for u in t.constraints if u.__class__.__name__ == "UniqueConstraint"]
    assert ("symbol", "session_date") in uniques
