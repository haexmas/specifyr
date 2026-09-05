"""Rule-pack contract and built-in finite-graph evaluators."""

from __future__ import annotations

from collections import defaultdict
from math import inf
from typing import Any, Callable

from spec_logic.errors import ContractError
from spec_logic.findings import make_finding, sort_findings, source_evidence
from spec_logic.model import ModelIndex, is_active, scope_key

RULE_PACK_SCHEMA = "spec-logic-rule-pack-v1"
KNOWN_KINDS = frozenset(
    {
        "contradictory_claims",
        "references_active",
        "relation_coverage",
        "acyclic",
        "unresolved_references",
        "ambiguous_claim",
    }
)
KNOWN_SEVERITIES = frozenset({"error", "warning", "info"})


def validate_rule_pack(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ContractError("rule pack must be an object")
    if data.get("schema") != RULE_PACK_SCHEMA:
        raise ContractError(f"rule pack schema must equal {RULE_PACK_SCHEMA!r}")
    for field in ("id", "version"):
        if not isinstance(data.get(field), str) or not data[field]:
            raise ContractError(f"rule pack {field} must be a non-empty string")
    rules = data.get("rules")
    if not isinstance(rules, list) or not rules:
        raise ContractError("rule pack rules must be a non-empty array")
    seen: set[str] = set()
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            raise ContractError(f"rules[{index}] must be an object")
        rule_id = rule.get("id")
        if not isinstance(rule_id, str) or not rule_id:
            raise ContractError(f"rules[{index}].id must be a non-empty string")
        if rule_id in seen:
            raise ContractError(f"duplicate rule id {rule_id!r}")
        seen.add(rule_id)
        kind = rule.get("kind")
        if kind not in KNOWN_KINDS:
            raise ContractError(f"unknown rule kind {kind!r} in {rule_id}")
        severity = rule.get("severity", "error")
        if severity not in KNOWN_SEVERITIES:
            raise ContractError(f"unknown severity {severity!r} in {rule_id}")
        if not isinstance(rule.get("category"), str) or not rule["category"]:
            raise ContractError(f"rule {rule_id} requires category")
        if not isinstance(rule.get("rationale"), str) or not rule["rationale"]:
            raise ContractError(f"rule {rule_id} requires rationale")
        params = rule.setdefault("params", {})
        if not isinstance(params, dict):
            raise ContractError(f"rule {rule_id}.params must be an object")
        if kind == "references_active":
            predicates = params.get("predicates")
            if not isinstance(predicates, list) or not predicates or not all(
                isinstance(predicate, str) and ":" in predicate for predicate in predicates
            ):
                raise ContractError(f"rule {rule_id} requires namespaced params.predicates")
            if set(params) != {"predicates"}:
                raise ContractError(f"rule {rule_id} has unsupported params")
        elif kind == "relation_coverage":
            if not isinstance(params.get("relation"), str) or ":" not in params["relation"]:
                raise ContractError(f"rule {rule_id} requires namespaced params.relation")
            if not isinstance(params.get("claim_kind"), str) or not params["claim_kind"]:
                raise ContractError(f"rule {rule_id} requires params.claim_kind")
            if set(params) != {"relation", "claim_kind"}:
                raise ContractError(f"rule {rule_id} has unsupported params")
        elif kind == "acyclic":
            if not isinstance(params.get("relation"), str) or ":" not in params["relation"]:
                raise ContractError(f"rule {rule_id} requires namespaced params.relation")
            if set(params) != {"relation"}:
                raise ContractError(f"rule {rule_id} has unsupported params")
        elif params:
            raise ContractError(f"rule {rule_id} kind {kind} accepts no params")
    return data


def _active_claims(model: dict[str, Any]) -> list[dict[str, Any]]:
    return [claim for claim in model["claims"] if is_active(claim)]


def _numeric_interval(claim: dict[str, Any]) -> tuple[float, bool, float, bool] | None:
    value = claim.get("value")
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    operator = claim.get("operator", "equals")
    number = float(value)
    if operator in {"equals", "exactly"}:
        return number, True, number, True
    if operator == "at_least":
        return number, True, inf, True
    if operator == "at_most":
        return -inf, True, number, True
    if operator == "greater_than":
        return number, False, inf, True
    if operator == "less_than":
        return -inf, True, number, False
    return None


def _intervals_disjoint(left: tuple[float, bool, float, bool], right: tuple[float, bool, float, bool]) -> bool:
    left_min, left_min_inclusive, left_max, left_max_inclusive = left
    right_min, right_min_inclusive, right_max, right_max_inclusive = right
    low = max(left_min, right_min)
    high = min(left_max, right_max)
    if low < high:
        return False
    if low > high:
        return True
    left_contains = (low != left_min or left_min_inclusive) and (low != left_max or left_max_inclusive)
    right_contains = (low != right_min or right_min_inclusive) and (low != right_max or right_max_inclusive)
    return not (left_contains and right_contains)


def _same_proposition(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return (
        left.get("operator", "equals") == right.get("operator", "equals")
        and left.get("value") == right.get("value")
    )


def _claims_conflict(left: dict[str, Any], right: dict[str, Any]) -> bool:
    left_negative = left.get("polarity", "positive") == "negative" or left.get("modality") == "must_not"
    right_negative = right.get("polarity", "positive") == "negative" or right.get("modality") == "must_not"
    if left_negative != right_negative and _same_proposition(left, right):
        return True
    if left_negative or right_negative:
        return False

    left_interval = _numeric_interval(left)
    right_interval = _numeric_interval(right)
    if left_interval is not None and right_interval is not None:
        return _intervals_disjoint(left_interval, right_interval)

    equality_operators = {"equals", "exactly"}
    if left.get("operator", "equals") in equality_operators and right.get(
        "operator", "equals"
    ) in equality_operators:
        return left.get("value") != right.get("value")
    return False


def _eval_contradictory_claims(
    model: dict[str, Any], index: ModelIndex, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    del index
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for claim in _active_claims(model):
        if claim.get("modality", "asserts") not in {"must", "must_not"}:
            continue
        groups[(claim["subject"], claim["predicate"], scope_key(claim))].append(claim)

    findings: list[dict[str, Any]] = []
    for claims in groups.values():
        for position, left in enumerate(claims):
            for right in claims[position + 1 :]:
                if not _claims_conflict(left, right):
                    continue
                findings.append(
                    make_finding(
                        rule_id=rule["id"],
                        category=rule["category"],
                        severity=rule.get("severity", "error"),
                        message=(
                            f"active claims {left['id']} and {right['id']} cannot both hold "
                            f"for {left['subject']} {left['predicate']}"
                        ),
                        evidence=[source_evidence(left), source_evidence(right)],
                        details={"left": left["id"], "right": right["id"]},
                    )
                )
    return findings


def _eval_unresolved_references(
    model: dict[str, Any], index: ModelIndex, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    del model
    findings: list[dict[str, Any]] = []
    for relation in index.relations:
        if not is_active(relation):
            continue
        missing = [endpoint for endpoint in (relation["source"], relation["target"]) if endpoint not in index.all_nodes]
        if not missing:
            continue
        findings.append(
            make_finding(
                rule_id=rule["id"],
                category=rule["category"],
                severity=rule.get("severity", "error"),
                message=f"relation {relation['id']} references unknown node(s): {', '.join(missing)}",
                evidence=[source_evidence(relation)],
                details={"missing": sorted(missing)},
            )
        )
    return findings


def _eval_references_active(
    model: dict[str, Any], index: ModelIndex, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    del model
    predicates = set(rule["params"].get("predicates", []))
    findings: list[dict[str, Any]] = []
    for relation in index.relations:
        if not is_active(relation) or (predicates and relation["predicate"] not in predicates):
            continue
        target = index.node(relation["target"])
        if target is None or target.get("status", "active") not in {"superseded", "withdrawn", "rejected", "stale"}:
            continue
        findings.append(
            make_finding(
                rule_id=rule["id"],
                category=rule["category"],
                severity=rule.get("severity", "error"),
                message=f"active relation {relation['id']} targets {target['status']} node {target['id']}",
                evidence=[source_evidence(relation), source_evidence(target)],
                details={"relation": relation["id"], "target_status": target["status"]},
            )
        )
    return findings


def _eval_relation_coverage(
    model: dict[str, Any], index: ModelIndex, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    predicate = str(rule["params"].get("relation", ""))
    if predicate not in model["closed_world"]:
        return []
    claim_kind = rule["params"].get("claim_kind")
    covered = {
        relation["target"]
        for relation in index.relations
        if is_active(relation) and relation["predicate"] == predicate
    }
    findings: list[dict[str, Any]] = []
    for claim in _active_claims(model):
        if claim_kind and claim.get("kind") != claim_kind:
            continue
        if claim["id"] in covered:
            continue
        findings.append(
            make_finding(
                rule_id=rule["id"],
                category=rule["category"],
                severity=rule.get("severity", "error"),
                message=f"active {claim.get('kind', 'claim')} {claim['id']} has no {predicate} evidence",
                evidence=[source_evidence(claim)],
                details={"required_relation": predicate},
            )
        )
    return findings


def _cycle(adjacency: dict[str, set[str]]) -> list[str] | None:
    visited: set[str] = set()
    active: set[str] = set()
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        if node in active:
            start = stack.index(node)
            return stack[start:] + [node]
        if node in visited:
            return None
        visited.add(node)
        active.add(node)
        stack.append(node)
        for target in sorted(adjacency.get(node, set())):
            found = visit(target)
            if found:
                return found
        stack.pop()
        active.remove(node)
        return None

    for node in sorted(adjacency):
        found = visit(node)
        if found:
            return found
    return None


def _eval_acyclic(
    model: dict[str, Any], index: ModelIndex, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    del model
    predicate = str(rule["params"].get("relation", ""))
    adjacency: dict[str, set[str]] = defaultdict(set)
    contributing: list[dict[str, Any]] = []
    for relation in index.relations:
        if is_active(relation) and relation["predicate"] == predicate:
            adjacency[relation["source"]].add(relation["target"])
            contributing.append(relation)
    found = _cycle(adjacency)
    if not found:
        return []
    cycle_edges = set(zip(found, found[1:]))
    evidence = [
        source_evidence(relation)
        for relation in contributing
        if (relation["source"], relation["target"]) in cycle_edges
    ]
    return [
        make_finding(
            rule_id=rule["id"],
            category=rule["category"],
            severity=rule.get("severity", "error"),
            message=f"{predicate} contains a cycle: {' -> '.join(found)}",
            evidence=evidence,
            details={"cycle": found},
        )
    ]


def _eval_ambiguous_claim(
    model: dict[str, Any], index: ModelIndex, rule: dict[str, Any]
) -> list[dict[str, Any]]:
    del index
    findings: list[dict[str, Any]] = []
    for claim in _active_claims(model):
        provenance = claim.get("provenance", {})
        if not isinstance(provenance, dict) or provenance.get("confidence") != "ambiguous":
            continue
        findings.append(
            make_finding(
                rule_id=rule["id"],
                category=rule["category"],
                severity=rule.get("severity", "warning"),
                message=f"claim {claim['id']} is explicitly marked ambiguous",
                evidence=[source_evidence(claim)],
                details={},
            )
        )
    return findings


Evaluator = Callable[[dict[str, Any], ModelIndex, dict[str, Any]], list[dict[str, Any]]]
_EVALUATORS: dict[str, Evaluator] = {
    "contradictory_claims": _eval_contradictory_claims,
    "references_active": _eval_references_active,
    "relation_coverage": _eval_relation_coverage,
    "acyclic": _eval_acyclic,
    "unresolved_references": _eval_unresolved_references,
    "ambiguous_claim": _eval_ambiguous_claim,
}


def evaluate_rules(
    model: dict[str, Any], rule_pack: dict[str, Any], *, disabled: frozenset[str] = frozenset()
) -> list[dict[str, Any]]:
    index = ModelIndex.build(model)
    findings: list[dict[str, Any]] = []
    for rule in rule_pack["rules"]:
        if rule["id"] in disabled:
            continue
        findings.extend(_EVALUATORS[rule["kind"]](model, index, rule))
    return sort_findings(findings)
