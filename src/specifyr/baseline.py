"""Honest deterministic baseline over plain Spec Kit/ADR documents.

This is intentionally not presented as an execution of the model-driven
``/speckit.analyze`` command.  It captures what plain artifacts expose to
mechanical checks without an accepted formal model.
"""

from __future__ import annotations

import posixpath
import re
from typing import Any

_REQUIREMENT_RE = re.compile(r"\b(FR-[0-9]{3,})\b")
_REQUIREMENT_DEF_RE = re.compile(r"\*\*(FR-[0-9]{3,})\*\*:")
_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)")


def analyze_documents(documents: list[dict[str, str]]) -> list[dict[str, Any]]:
    paths = {document["path"] for document in documents}
    findings: list[dict[str, Any]] = []

    for document in documents:
        path = document["path"]
        content = document["content"]
        if "[NEEDS CLARIFICATION" in content or "AMBIGUOUS:" in content:
            findings.append(
                {
                    "category": "ambiguity",
                    "message": "plain artifact contains an explicit ambiguity marker",
                    "evidence": [{"path": path}],
                }
            )
        if re.search(r"\bSuperseded\b|Do not implement against", content, re.IGNORECASE):
            findings.append(
                {
                    "category": "stale_reference",
                    "message": "plain artifact contains an explicit supersession marker",
                    "evidence": [{"path": path}],
                }
            )
        for link in _LINK_RE.findall(content):
            if "://" in link or link.startswith("mailto:"):
                continue
            target = posixpath.normpath(posixpath.join(posixpath.dirname(path), link))
            if target not in paths:
                findings.append(
                    {
                        "category": "unresolved_reference",
                        "message": f"plain artifact link target does not exist: {target}",
                        "evidence": [{"path": path}],
                    }
                )

    requirement_definitions: dict[str, str] = {}
    non_spec_content = "\n".join(
        document["content"]
        for document in documents
        if not document["path"].endswith("/spec.md")
    )
    for document in documents:
        if not document["path"].endswith("/spec.md"):
            continue
        for requirement_id in _REQUIREMENT_DEF_RE.findall(document["content"]):
            requirement_definitions[requirement_id] = document["path"]
    referenced = set(_REQUIREMENT_RE.findall(non_spec_content))
    for requirement_id, path in sorted(requirement_definitions.items()):
        if requirement_id not in referenced:
            findings.append(
                {
                    "category": "missing_coverage",
                    "message": f"{requirement_id} is not referenced outside its specification",
                    "evidence": [{"path": path}],
                }
            )

    return sorted(findings, key=lambda item: (item["category"], item["message"]))

