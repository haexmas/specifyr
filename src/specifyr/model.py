"""Versioned Spec Model validation and lookup indexes."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from specifyr.errors import ContractError

MODEL_SCHEMA = "specifyr-model-v1"
ACTIVE_STATUSES = frozenset({"active", "accepted"})
KNOWN_STATUSES = frozenset(
    {"proposed", "draft", "active", "accepted", "superseded", "rejected", "withdrawn", "stale"}
)
KNOWN_MODALITIES = frozenset({"asserts", "must", "must_not", "should", "may"})
KNOWN_POLARITIES = frozenset({"positive", "negative"})
KNOWN_OPERATORS = frozenset({"equals", "exactly", "at_least", "at_most", "greater_than", "less_than"})
_NAMESPACED = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*:[A-Za-z0-9][A-Za-z0-9_.:/-]*$")


def _required_object(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{name} must be an object")
    return value


def _required_list(value: Any, name: str) -> list[Any]:
    if not isinstance(value, list):
        raise ContractError(f"{name} must be an array")
    return value


def _required_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ContractError(f"{name} must be a non-empty string")
    return value


def _unique_ids(items: list[Any], name: str) -> None:
    seen: set[str] = set()
    for index, raw in enumerate(items):
        item = _required_object(raw, f"{name}[{index}]")
        item_id = _required_string(item.get("id"), f"{name}[{index}].id")
        if item_id in seen:
            raise ContractError(f"duplicate id {item_id!r} in {name}")
        seen.add(item_id)


def validate_model(data: Any) -> dict[str, Any]:
    model = _required_object(data, "model")
    if model.get("schema") != MODEL_SCHEMA:
        raise ContractError(f"model.schema must equal {MODEL_SCHEMA!r}")

    artifacts = _required_list(model.get("artifacts", []), "model.artifacts")
    claims = _required_list(model.get("claims", []), "model.claims")
    relations = _required_list(model.get("relations", []), "model.relations")
    closed_world = _required_list(model.get("closed_world", []), "model.closed_world")
    _unique_ids(artifacts, "model.artifacts")
    _unique_ids(claims, "model.claims")
    _unique_ids(relations, "model.relations")

    all_ids: set[str] = set()
    for group in (artifacts, claims):
        for item in group:
            item_id = str(item["id"])
            if item_id in all_ids:
                raise ContractError(f"duplicate id {item_id!r} across artifacts and claims")
            all_ids.add(item_id)

    for index, raw in enumerate(artifacts):
        item = _required_object(raw, f"model.artifacts[{index}]")
        _required_string(item.get("kind"), f"model.artifacts[{index}].kind")
        status = _required_string(item.get("status", "active"), f"model.artifacts[{index}].status")
        if status not in KNOWN_STATUSES:
            raise ContractError(f"unknown artifact status {status!r}")

    for index, raw in enumerate(claims):
        item = _required_object(raw, f"model.claims[{index}]")
        for field in ("kind", "subject", "predicate"):
            _required_string(item.get(field), f"model.claims[{index}].{field}")
        predicate = str(item["predicate"])
        if not _NAMESPACED.match(predicate):
            raise ContractError(f"claim predicate must be namespaced: {predicate!r}")
        modality = _required_string(item.get("modality", "asserts"), f"model.claims[{index}].modality")
        if modality not in KNOWN_MODALITIES:
            raise ContractError(f"unknown modality {modality!r}")
        polarity = _required_string(item.get("polarity", "positive"), f"model.claims[{index}].polarity")
        if polarity not in KNOWN_POLARITIES:
            raise ContractError(f"unknown polarity {polarity!r}")
        operator = _required_string(item.get("operator", "equals"), f"model.claims[{index}].operator")
        if operator not in KNOWN_OPERATORS:
            raise ContractError(f"unknown operator {operator!r}")
        if "value" not in item:
            raise ContractError(f"model.claims[{index}].value is required")
        status = _required_string(item.get("status", "active"), f"model.claims[{index}].status")
        if status not in KNOWN_STATUSES:
            raise ContractError(f"unknown claim status {status!r}")
        scope = item.get("scope", {})
        if not isinstance(scope, dict) or not all(
            isinstance(key, str) and isinstance(value, (str, int, float, bool))
            for key, value in scope.items()
        ):
            raise ContractError(f"model.claims[{index}].scope must be a scalar-valued object")

    for index, raw in enumerate(relations):
        item = _required_object(raw, f"model.relations[{index}]")
        for field in ("source", "target", "predicate"):
            _required_string(item.get(field), f"model.relations[{index}].{field}")
        predicate = str(item["predicate"])
        if not _NAMESPACED.match(predicate):
            raise ContractError(f"relation predicate must be namespaced: {predicate!r}")
        status = _required_string(item.get("status", "active"), f"model.relations[{index}].status")
        if status not in KNOWN_STATUSES:
            raise ContractError(f"unknown relation status {status!r}")

    for index, predicate in enumerate(closed_world):
        text = _required_string(predicate, f"model.closed_world[{index}]")
        if not _NAMESPACED.match(text):
            raise ContractError(f"closed-world predicate must be namespaced: {text!r}")

    model.setdefault("metadata", {})
    model["artifacts"] = artifacts
    model["claims"] = claims
    model["relations"] = relations
    model["closed_world"] = closed_world
    return model


def is_active(item: dict[str, Any]) -> bool:
    return item.get("status", "active") in ACTIVE_STATUSES


def scope_key(claim: dict[str, Any]) -> str:
    return json.dumps(claim.get("scope", {}), sort_keys=True, separators=(",", ":"))


@dataclass(frozen=True)
class ModelIndex:
    artifacts: dict[str, dict[str, Any]]
    claims: dict[str, dict[str, Any]]
    relations: tuple[dict[str, Any], ...]
    all_nodes: frozenset[str]

    @classmethod
    def build(cls, model: dict[str, Any]) -> "ModelIndex":
        artifacts = {item["id"]: item for item in model["artifacts"]}
        claims = {item["id"]: item for item in model["claims"]}
        return cls(
            artifacts=artifacts,
            claims=claims,
            relations=tuple(model["relations"]),
            all_nodes=frozenset(artifacts) | frozenset(claims),
        )

    def node(self, node_id: str) -> dict[str, Any] | None:
        return self.claims.get(node_id) or self.artifacts.get(node_id)

