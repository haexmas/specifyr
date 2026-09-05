"""Stable finding construction and rendering."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def source_evidence(item: dict[str, Any]) -> dict[str, str]:
    raw = item.get("source_ref", item.get("source", {}))
    if not isinstance(raw, dict):
        raw = {}
    evidence = {"id": str(item.get("id", "unknown"))}
    for key in ("path", "anchor", "location"):
        value = raw.get(key)
        if isinstance(value, str) and value:
            evidence[key] = value
    return evidence


def make_finding(
    *,
    rule_id: str,
    category: str,
    severity: str,
    message: str,
    evidence: list[dict[str, str]],
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    identity = json.dumps(
        {"rule": rule_id, "category": category, "evidence": evidence, "details": details or {}},
        sort_keys=True,
        separators=(",", ":"),
    )
    suffix = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:12]
    return {
        "id": f"finding:{suffix}",
        "rule_id": rule_id,
        "category": category,
        "severity": severity,
        "message": message,
        "evidence": evidence,
        "details": details or {},
    }


def sort_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        findings,
        key=lambda item: (
            item["severity"],
            item["category"],
            item["rule_id"],
            item["id"],
        ),
    )


def render_human(report: dict[str, Any]) -> str:
    lines = [
        f"specifyr: {report['status']} ({len(report['findings'])} findings)",
        (
            "coverage: "
            f"{report['coverage']['formalized_claims']}/{report['coverage']['total_claims']} "
            "claims formalized"
        ),
    ]
    for finding in report["findings"]:
        lines.append(
            f"{finding['severity'].upper()} {finding['category']} "
            f"[{finding['rule_id']}]: {finding['message']}"
        )
        for evidence in finding["evidence"]:
            location = evidence.get("path", evidence["id"])
            if evidence.get("anchor"):
                location += f"#{evidence['anchor']}"
            lines.append(f"  - {location} ({evidence['id']})")
    return "\n".join(lines) + "\n"
