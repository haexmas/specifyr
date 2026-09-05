"""Public checking API."""

from __future__ import annotations

from typing import Any

from specifyr.model import validate_model
from specifyr.rules import evaluate_rules, validate_rule_pack


def check(model_data: Any, rule_pack_data: Any) -> dict[str, Any]:
    model = validate_model(model_data)
    rules = validate_rule_pack(rule_pack_data)
    findings = evaluate_rules(model, rules)
    blocking = [item for item in findings if item["severity"] == "error"]
    formalized = sum(
        1
        for claim in model["claims"]
        if claim.get("provenance", {}).get("method") == "asserted"
    )
    return {
        "schema": "specifyr-report-v1",
        "status": "nonconforming" if blocking else "conforming",
        "rule_pack": {"id": rules["id"], "version": rules["version"]},
        "coverage": {
            "formalized_claims": formalized,
            "total_claims": len(model["claims"]),
            "closed_world_predicates": sorted(model["closed_world"]),
        },
        "findings": findings,
    }
