"""Command-line interface for extraction, checking and benchmarking."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from importlib import resources
from pathlib import Path
from typing import Any

from spec_logic.adapters.graphify import import_graphify
from spec_logic.adapters.speckit import extract_project
from spec_logic.assurance import verify_rule_pack
from spec_logic.benchmark import render_markdown, run_benchmark
from spec_logic.checker import check
from spec_logic.errors import SpecLogicError
from spec_logic.findings import render_human
from spec_logic.io import load_json, pretty_json, write_json


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="spec-logic")
    parser.add_argument("--version", action="version", version="spec-logic 0.1.0")
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check", help="check a Spec Model against a rule pack")
    check_parser.add_argument("--model", type=Path, required=True)
    check_parser.add_argument("--rules", type=Path)
    check_parser.add_argument("--format", choices=("human", "json"), default="human")
    check_parser.add_argument("--output", type=Path)

    extract_parser = subparsers.add_parser("extract", help="extract deterministic Speckit/ADR structure")
    extract_parser.add_argument("project", type=Path, nargs="?", default=Path.cwd())
    extract_parser.add_argument("--output", type=Path, default=Path("spec-logic-out/model.json"))

    graphify_parser = subparsers.add_parser(
        "graphify-import", help="import graph.json as non-authoritative candidates"
    )
    graphify_parser.add_argument("--graph", type=Path, default=Path("graphify-out/graph.json"))
    graphify_parser.add_argument(
        "--output", type=Path, default=Path("spec-logic-out/candidates.json")
    )

    verify_parser = subparsers.add_parser("rules-verify", help="verify rule examples and mutations")
    verify_parser.add_argument("--rules", type=Path)
    verify_parser.add_argument("--corpus", type=Path, default=Path("benchmarks/corpus.json"))
    verify_parser.add_argument("--format", choices=("human", "json"), default="human")

    benchmark_parser = subparsers.add_parser(
        "benchmark", help="compare formal checks with a plain document baseline"
    )
    benchmark_parser.add_argument("--rules", type=Path)
    benchmark_parser.add_argument("--corpus", type=Path, default=Path("benchmarks/corpus.json"))
    benchmark_parser.add_argument("--runs", type=int, default=10)
    benchmark_parser.add_argument("--external-baseline", type=Path)
    benchmark_parser.add_argument("--format", choices=("human", "json", "markdown"), default="human")
    benchmark_parser.add_argument("--output", type=Path)

    export_parser = subparsers.add_parser(
        "benchmark-export", help="export benchmark documents for external analyzer runs"
    )
    export_parser.add_argument("--corpus", type=Path, default=Path("benchmarks/corpus.json"))
    export_parser.add_argument("--output", type=Path, default=Path("spec-logic-out/benchmark-cases"))
    return parser


def _emit(text: str, output: Path | None) -> None:
    if output is None:
        sys.stdout.write(text)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8", newline="\n")


def _load_rules(path: Path | None) -> Any:
    if path is not None:
        return load_json(path)
    bundled = resources.files("spec_logic").joinpath("data/core_rules.json")
    return json.loads(bundled.read_text(encoding="utf-8"))


def _benchmark_human(result: dict[str, Any]) -> str:
    lines = [f"benchmark: {result['corpus']} ({result['cases']} cases)"]
    for name, metrics in result["runners"].items():
        lines.append(
            f"{name}: precision={metrics['precision']:.3f} recall={metrics['recall']:.3f} "
            f"f1={metrics['f1']:.3f} fp={metrics['false_positive']} "
            f"fn={metrics['false_negative']} deterministic={metrics.get('deterministic')}"
        )
    return "\n".join(lines) + "\n"


def _export_cases(corpus: dict[str, Any], output: Path) -> int:
    root = output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    for case in corpus.get("cases", []):
        case_root = (root / case["id"]).resolve()
        if root not in case_root.parents:
            raise ValueError(f"unsafe benchmark case id: {case['id']!r}")
        for document in case.get("documents", []):
            target = (case_root / document["path"]).resolve()
            if case_root not in target.parents:
                raise ValueError(f"unsafe benchmark document path: {document['path']!r}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(document["content"], encoding="utf-8", newline="\n")
    sys.stdout.write(f"exported {len(corpus.get('cases', []))} cases to {output}\n")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "check":
            report = check(load_json(args.model), _load_rules(args.rules))
            text = pretty_json(report) if args.format == "json" else render_human(report)
            _emit(text, args.output)
            return 1 if report["status"] == "nonconforming" else 0
        if args.command == "extract":
            write_json(args.output, extract_project(args.project))
            sys.stdout.write(f"wrote {args.output}\n")
            return 0
        if args.command == "graphify-import":
            write_json(
                args.output,
                import_graphify(load_json(args.graph), source=args.graph.as_posix()),
            )
            sys.stdout.write(f"wrote {args.output}\n")
            return 0
        if args.command == "rules-verify":
            result = verify_rule_pack(_load_rules(args.rules), load_json(args.corpus))
            if args.format == "json":
                sys.stdout.write(pretty_json(result))
            else:
                sys.stdout.write(
                    f"rule assurance: {result['status']} · {result['rules']} rules · "
                    f"{result['cases']} cases · mutation score "
                    f"{result['mutation']['score']:.3f}\n"
                )
                for failure in result["failures"]:
                    sys.stdout.write(f"  {failure}\n")
            return 0 if result["status"] == "passed" else 1
        if args.command == "benchmark":
            external = load_json(args.external_baseline) if args.external_baseline else None
            result = run_benchmark(
                load_json(args.corpus), _load_rules(args.rules), runs=args.runs, external_baseline=external
            )
            if args.format == "json":
                text = pretty_json(result)
            elif args.format == "markdown":
                text = render_markdown(result)
            else:
                text = _benchmark_human(result)
            _emit(text, args.output)
            return 0
        if args.command == "benchmark-export":
            return _export_cases(load_json(args.corpus), args.output)
    except (OSError, ValueError, SpecLogicError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 2
    return 2
