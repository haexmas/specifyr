"""Executable examples and mutation checks for rule packs."""

from __future__ import annotations

from typing import Any

from spec_logic.model import validate_model
from spec_logic.rules import evaluate_rules, validate_rule_pack


def verify_rule_pack(rule_pack_data: Any, corpus_data: Any) -> dict[str, Any]:
    rules = validate_rule_pack(rule_pack_data)
    if not isinstance(corpus_data, dict) or corpus_data.get("schema") != "spec-logic-benchmark-corpus-v1":
        raise ValueError("assurance corpus must use spec-logic-benchmark-corpus-v1")
    cases = corpus_data.get("cases", [])
    if not isinstance(cases, list) or not cases:
        raise ValueError("assurance corpus requires cases")

    failures: list[dict[str, Any]] = []
    expected_by_case: dict[str, set[str]] = {}
    actual_by_case: dict[str, set[str]] = {}
    validated_models: dict[str, dict[str, Any]] = {}
    for case in cases:
        case_id = case["id"]
        model = validate_model(case["model"])
        validated_models[case_id] = model
        expected = set(case.get("expected_rule_ids", []))
        actual = {finding["rule_id"] for finding in evaluate_rules(model, rules)}
        expected_by_case[case_id] = expected
        actual_by_case[case_id] = actual
        if actual != expected:
            failures.append(
                {"case": case_id, "expected": sorted(expected), "actual": sorted(actual)}
            )

    rule_ids = {rule["id"] for rule in rules["rules"]}
    negative_examples = {
        rule_id: sorted(case_id for case_id, expected in expected_by_case.items() if rule_id in expected)
        for rule_id in sorted(rule_ids)
    }
    positive_examples = {
        rule_id: sorted(case_id for case_id, expected in expected_by_case.items() if rule_id not in expected)
        for rule_id in sorted(rule_ids)
    }
    for rule_id in sorted(rule_ids):
        if not negative_examples[rule_id]:
            failures.append({"rule": rule_id, "error": "missing violating example"})
        if not positive_examples[rule_id]:
            failures.append({"rule": rule_id, "error": "missing conforming example"})

    killed = 0
    for rule_id in sorted(rule_ids):
        mutation_detected = False
        for case_id, model in validated_models.items():
            mutated = {
                finding["rule_id"]
                for finding in evaluate_rules(model, rules, disabled=frozenset({rule_id}))
            }
            if mutated != expected_by_case[case_id]:
                mutation_detected = True
                break
        if mutation_detected:
            killed += 1
        else:
            failures.append({"rule": rule_id, "error": "disable-rule mutation survived"})

    return {
        "schema": "spec-logic-rule-assurance-v1",
        "status": "passed" if not failures else "failed",
        "rules": len(rule_ids),
        "cases": len(cases),
        "mutation": {
            "killed": killed,
            "total": len(rule_ids),
            "score": killed / len(rule_ids) if rule_ids else 1.0,
        },
        "negative_examples": negative_examples,
        "positive_examples": positive_examples,
        "failures": failures,
    }

