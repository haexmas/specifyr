"""Import Graphify's graph.json as non-authoritative candidates."""

from __future__ import annotations

from typing import Any

from specifyr.errors import AdapterError

CANDIDATE_SCHEMA = "specifyr-candidates-v1"


def import_graphify(data: Any, *, source: str = "graphify-out/graph.json") -> dict[str, Any]:
    if not isinstance(data, dict):
        raise AdapterError("Graphify graph must be an object")
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])
    if isinstance(nodes, dict):
        nodes = [{"id": node_id, **attrs} for node_id, attrs in nodes.items()]
    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise AdapterError("Graphify graph requires nodes and edges arrays")

    candidates: list[dict[str, Any]] = []
    for index, raw in enumerate(nodes):
        if not isinstance(raw, dict):
            raise AdapterError(f"nodes[{index}] must be an object")
        node_id = raw.get("id")
        if not isinstance(node_id, str) or not node_id:
            raise AdapterError(f"nodes[{index}].id must be a non-empty string")
        candidates.append(
            {
                "id": f"graphify:node:{node_id}",
                "candidate_kind": "concept",
                "label": str(raw.get("label", node_id)),
                "source": {
                    "path": str(raw.get("source_file", "")),
                    "location": str(raw.get("source_location", "")),
                },
                "provenance": {
                    "provider": "graphify",
                    "confidence": "extracted",
                    "authoritative": False,
                },
                "payload": {key: value for key, value in raw.items() if key != "id"},
            }
        )

    relations: list[dict[str, Any]] = []
    relation_names: set[str] = set()
    for index, raw in enumerate(edges):
        if not isinstance(raw, dict):
            raise AdapterError(f"edges[{index}] must be an object")
        edge_source = raw.get("source")
        edge_target = raw.get("target")
        relation = raw.get("relation", raw.get("label", "related_to"))
        if not all(isinstance(value, str) and value for value in (edge_source, edge_target, relation)):
            raise AdapterError(f"edges[{index}] requires source, target and relation strings")
        confidence = str(raw.get("confidence", "INFERRED")).lower()
        if confidence not in {"extracted", "inferred", "ambiguous"}:
            confidence = "inferred"
        relation_names.add(str(relation))
        relations.append(
            {
                "id": f"graphify:edge:{index}",
                "candidate_kind": "relation",
                "source": f"graphify:node:{edge_source}",
                "target": f"graphify:node:{edge_target}",
                "predicate": f"graphify:{relation}",
                "provenance": {
                    "provider": "graphify",
                    "confidence": confidence,
                    "authoritative": False,
                },
            }
        )

    return {
        "schema": CANDIDATE_SCHEMA,
        "source": source,
        "notice": "Candidates are non-authoritative until reviewed and promoted.",
        "concept_candidates": sorted(candidates, key=lambda item: item["id"]),
        "relation_candidates": sorted(relations, key=lambda item: item["id"]),
        "vocabulary_candidates": [f"graphify:{name}" for name in sorted(relation_names)],
    }

