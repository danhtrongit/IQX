"""The factor catalog must stay consistent with the indicator/condition engine."""

from __future__ import annotations

from app.services.ta.catalog import CATALOG, factor_library_payload, resolve_factor
from app.services.ta.conditions import validate_condition


def test_every_factor_resolves_to_a_valid_condition():
    for factor in CATALOG:
        cond = factor.resolve()
        validate_condition(cond)  # raises if the factor references bad fields/ops


def test_editable_factor_applies_tuned_value():
    cond = resolve_factor("rsi_14_oversold", 25.0)
    assert cond.indicator == "rsi_14" and cond.op == "<" and cond.value == 25.0


def test_non_editable_factor_ignores_value():
    cond = resolve_factor("rsi_14_buy_mom", 99.0)  # fixed cross_above 50
    assert cond.value == 50


def test_factor_ids_unique_and_payload_shape():
    ids = [f.id for f in CATALOG]
    assert len(ids) == len(set(ids))
    payload = factor_library_payload()
    assert payload["count"] == len(CATALOG)
    assert payload["buy"] and payload["sell"]
    # groups carry factors
    assert all("factors" in g and g["factors"] for g in payload["buy"])


def test_unknown_factor_raises():
    import pytest

    with pytest.raises(KeyError):
        resolve_factor("nope")
