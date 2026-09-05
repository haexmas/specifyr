"""Deterministic extraction of Spec Kit/ADR structure and spec-logic blocks."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from spec_logic.errors import AdapterError

_BLOCK_RE = re.compile(r"```spec-logic\s*\n(.*?)\n```", re.DOTALL)
_STATUS_RE = re.compile(r"\*\*Status\*\*:\s*([^\n.]+)", re.IGNORECASE)
_MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)")
_REQUIREMENT_RE = re.compile(r"\*\*(FR-[0-9]{3,})\*\*:\s*(.+)")


def _artifact_kind(path: Path) -> str:
    if "adr" in path.parts:
        return "decision"
    if path.name == "spec.md":
        return "specification"
    if path.name == "plan.md":
        return "plan"
    if path.name == "tasks.md":
        return "tasks"
    if path.name == "constitution.md":
        return "policy"
    if path.suffix in {".yml", ".yaml"}:
        return "workflow"
    return "document"


def _artifact_id(relative: Path) -> str:
    return "artifact:" + relative.as_posix().replace("/", ":")


def _status(text: str) -> str:
    match = _STATUS_RE.search(text)
    if not match:
        return "active"
    value = match.group(1).strip().lower()
    if value.startswith("accepted"):
        return "accepted"
    if value.startswith("draft"):
        return "draft"
    if value.startswith("superseded"):
        return "superseded"
    if value.startswith("rejected"):
        return "rejected"
    return "active"


def _discover(root: Path) -> list[Path]:
    patterns = (
        "specs/**/*.md",
        "docs/adr/*.md",
        "docs/adrs/*.md",
        ".specify/memory/constitution.md",
        ".specify/workflows/**/*.yml",
        ".specify/workflows/**/*.yaml",
        "docs/**/*.md",
        "README.md",
    )
    found: set[Path] = set()
    for pattern in patterns:
        found.update(path for path in root.glob(pattern) if path.is_file())
    return sorted(found)


def _claim_from_requirement(
    requirement_id: str, text: str, relative: Path, *, status: str
) -> dict[str, Any]:
    return {
        "id": f"claim:{relative.parent.name}:{requirement_id}",
        "kind": "requirement",
        "modality": "asserts",
        "polarity": "positive",
        "subject": f"requirement:{requirement_id}",
        "predicate": "core:described_by",
        "operator": "equals",
        "value": text.strip(),
        "scope": {"feature": relative.parent.name},
        "status": status,
        "source": {"path": relative.as_posix(), "anchor": requirement_id},
        "provenance": {"method": "deterministic", "confidence": "extracted"},
    }


def _read_formal_blocks(
    text: str, relative: Path, *, artifact_status: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    claims: list[dict[str, Any]] = []
    relations: list[dict[str, Any]] = []
    for number, match in enumerate(_BLOCK_RE.finditer(text), start=1):
        try:
            payload = json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            raise AdapterError(f"{relative}: invalid spec-logic JSON block {number}: {exc}") from None
        entries = payload if isinstance(payload, list) else [payload]
        for entry in entries:
            if not isinstance(entry, dict):
                raise AdapterError(f"{relative}: spec-logic block entries must be objects")
            item = dict(entry)
            item_type = item.pop("type", "claim")
            item.setdefault("provenance", {"method": "asserted", "confidence": "authoritative"})
            item.setdefault("status", artifact_status)
            if item_type == "claim":
                item.setdefault(
                    "source", {"path": relative.as_posix(), "location": f"block:{number}"}
                )
                claims.append(item)
            elif item_type == "relation":
                item.setdefault(
                    "source_ref", {"path": relative.as_posix(), "location": f"block:{number}"}
                )
                relations.append(item)
            else:
                raise AdapterError(f"{relative}: unknown spec-logic entry type {item_type!r}")
    return claims, relations


def extract_project(root: Path) -> dict[str, Any]:
    root = root.resolve()
    paths = _discover(root)
    artifacts: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []
    relations: list[dict[str, Any]] = []
    by_path: dict[Path, str] = {}
    texts: dict[Path, str] = {}

    for path in paths:
        relative = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        artifact_id = _artifact_id(relative)
        by_path[path.resolve()] = artifact_id
        texts[path] = text
        artifacts.append(
            {
                "id": artifact_id,
                "kind": _artifact_kind(relative),
                "status": _status(text),
                "path": relative.as_posix(),
                "digest": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "source": {"path": relative.as_posix()},
            }
        )

        artifact_status = _status(text)
        block_claims, block_relations = _read_formal_blocks(
            text, relative, artifact_status=artifact_status
        )
        claims.extend(block_claims)
        relations.extend(block_relations)
        for match in _REQUIREMENT_RE.finditer(text):
            generated = _claim_from_requirement(
                match.group(1), match.group(2), relative, status=artifact_status
            )
            if not any(
                claim.get("id") == generated["id"]
                or (
                    isinstance(claim.get("source"), dict)
                    and claim["source"].get("anchor") == match.group(1)
                )
                for claim in claims
            ):
                claims.append(generated)

    relation_number = len(relations)
    for path, text in texts.items():
        relative = path.relative_to(root)
        source_id = by_path[path.resolve()]
        for link in _MARKDOWN_LINK_RE.findall(text):
            if "://" in link or link.startswith("mailto:"):
                continue
            normalized_link = link.strip("<>")
            normalized_link = re.sub(r":(?:[0-9]+|N)$", "", normalized_link)
            if normalized_link.startswith("absolute-path"):
                continue
            target_path = (path.parent / normalized_link).resolve()
            target_id = by_path.get(target_path)
            inside_root = target_path == root or root in target_path.parents
            if target_id is None and inside_root and target_path.exists():
                target_relative = target_path.relative_to(root)
                target_id = _artifact_id(target_relative)
                by_path[target_path] = target_id
                artifacts.append(
                    {
                        "id": target_id,
                        "kind": "directory" if target_path.is_dir() else "file",
                        "status": "active",
                        "path": target_relative.as_posix(),
                        "source": {"path": target_relative.as_posix()},
                    }
                )
            if target_id is None:
                target_id = f"missing:{target_path.name}"
            relation_number += 1
            relations.append(
                {
                    "id": f"relation:markdown:{relation_number}",
                    "source": source_id,
                    "target": target_id,
                    "predicate": "core:references",
                    "status": "active",
                    "source_ref": {"path": relative.as_posix()},
                }
            )

    return {
        "schema": "spec-logic-model-v1",
        "metadata": {"adapter": "speckit-v1", "root": "."},
        "artifacts": artifacts,
        "claims": claims,
        "relations": relations,
        "closed_world": [],
    }
