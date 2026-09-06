"""Benchmark formal checks against plain Spec Kit/ADR artifacts."""

from __future__ import annotations

import hashlib
import time
from typing import Any, Callable

from specifyr.baseline import analyze_documents
from specifyr.checker import check
from specifyr.io import canonical_json


def _score(expected: dict[str, set[str]], predicted: dict[str, set[str]]) -> dict[str, Any]:
    true_positive = false_positive = false_negative = 0
    for case_id, wanted in expected.items():
        got = predicted.get(case_id, set())
        true_positive += len(wanted & got)
        false_positive += len(got - wanted)
        false_negative += len(wanted - got)
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 1.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def _run_repeated(call: Callable[[], Any], runs: int) -> tuple[Any, float, bool]:
    outputs: list[Any] = []
    started = time.perf_counter_ns()
    for _ in range(runs):
        outputs.append(call())
    elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
    hashes = {hashlib.sha256(canonical_json(output).encode("utf-8")).hexdigest() for output in outputs}
    return outputs[0], elapsed_ms / runs, len(hashes) == 1


def run_benchmark(
    corpus_data: Any,
    rule_pack_data: Any,
    *,
    runs: int = 5,
    external_baseline: Any | None = None,
) -> dict[str, Any]:
    if not isinstance(corpus_data, dict) or corpus_data.get("schema") != "specifyr-benchmark-corpus-v1":
        raise ValueError("benchmark corpus must use specifyr-benchmark-corpus-v1")
    cases = corpus_data.get("cases", [])
    if not isinstance(cases, list) or not cases:
        raise ValueError("benchmark corpus requires cases")
    if runs < 1:
        raise ValueError("runs must be positive")

    seen_case_ids: set[str] = set()
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str) or "model" not in case:
            raise ValueError("each corpus case requires a string id and a model")
        case_id = case["id"]
        if case_id in seen_case_ids:
            raise ValueError(f"duplicate corpus case id {case_id!r}")
        seen_case_ids.add(case_id)
    expected = {case["id"]: set(case.get("expected_categories", [])) for case in cases}
    formal_predictions: dict[str, set[str]] = {}
    baseline_predictions: dict[str, set[str]] = {}
    formal_times: list[float] = []
    baseline_times: list[float] = []
    formal_deterministic = True
    baseline_deterministic = True
    formal_evidence = 0
    formal_findings = 0

    case_results: list[dict[str, Any]] = []
    for case in cases:
        formal_report, formal_ms, formal_same = _run_repeated(
            lambda case=case: check(case["model"], rule_pack_data), runs
        )
        baseline_report, baseline_ms, baseline_same = _run_repeated(
            lambda case=case: analyze_documents(case.get("documents", [])), runs
        )
        formal_categories = {finding["category"] for finding in formal_report["findings"]}
        baseline_categories = {finding["category"] for finding in baseline_report}
        formal_predictions[case["id"]] = formal_categories
        baseline_predictions[case["id"]] = baseline_categories
        formal_times.append(formal_ms)
        baseline_times.append(baseline_ms)
        formal_deterministic = formal_deterministic and formal_same
        baseline_deterministic = baseline_deterministic and baseline_same
        for finding in formal_report["findings"]:
            formal_findings += 1
            if finding.get("evidence"):
                formal_evidence += 1
        case_results.append(
            {
                "id": case["id"],
                "expected": sorted(expected[case["id"]]),
                "formal": sorted(formal_categories),
                "document_baseline": sorted(baseline_categories),
            }
        )

    runners: dict[str, Any] = {
        "formal": {
            **_score(expected, formal_predictions),
            "mean_case_ms": sum(formal_times) / len(formal_times),
            "deterministic": formal_deterministic,
            "evidence_rate": formal_evidence / formal_findings if formal_findings else 1.0,
        },
        "document_baseline": {
            **_score(expected, baseline_predictions),
            "mean_case_ms": sum(baseline_times) / len(baseline_times),
            "deterministic": baseline_deterministic,
            "evidence_rate": 1.0,
            "scope": "plain deterministic Spec Kit/ADR artifacts; not /speckit.analyze",
        },
    }

    if external_baseline is not None:
        if not isinstance(external_baseline, dict) or not isinstance(
            external_baseline.get("predictions"), dict
        ):
            raise ValueError("external baseline requires a predictions object")
        external_predictions = {
            case_id: set(categories)
            for case_id, categories in external_baseline["predictions"].items()
        }
        external_name = str(external_baseline.get("name", "external_baseline"))
        if external_name in runners:
            raise ValueError(
                f"external baseline name conflicts with a built-in runner: {external_name}"
            )
        runners[external_name] = {
            **_score(expected, external_predictions),
            "deterministic": False,
            "evidence_rate": external_baseline.get("evidence_rate"),
            "scope": "externally supplied predictions",
        }

    return {
        "schema": "specifyr-benchmark-result-v1",
        "corpus": corpus_data.get("id", "unnamed"),
        "cases": len(cases),
        "runs_per_case": runs,
        "runners": runners,
        "case_results": case_results,
        "limitations": [
            "The bundled document baseline is not an execution of the model-driven /speckit.analyze command.",
            "The curated corpus measures known consistency patterns, not general natural-language understanding.",
            "External LLM baselines must be repeated and supplied separately to measure variance.",
        ],
    }


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# specifyr benchmark",
        "",
        f"Corpus: `{result['corpus']}` · cases: {result['cases']} · runs/case: {result['runs_per_case']}",
        "",
        "| Runner | Precision | Recall | F1 | FP | FN | Deterministic | Mean ms/case |",
        "|---|---:|---:|---:|---:|---:|:---:|---:|",
    ]
    for name, metrics in result["runners"].items():
        mean = metrics.get("mean_case_ms")
        mean_text = f"{mean:.3f}" if isinstance(mean, (float, int)) else "n/a"
        lines.append(
            f"| {name} | {metrics['precision']:.3f} | {metrics['recall']:.3f} | "
            f"{metrics['f1']:.3f} | {metrics['false_positive']} | "
            f"{metrics['false_negative']} | {str(metrics.get('deterministic')).lower()} | "
            f"{mean_text} |"
        )
    lines.extend(["", "## Cases", ""])
    for case in result["case_results"]:
        lines.append(
            f"- `{case['id']}` — expected={case['expected']}; "
            f"formal={case['formal']}; baseline={case['document_baseline']}"
        )
    lines.extend(["", "## Limitations", ""])
    lines.extend(f"- {item}" for item in result["limitations"])
    return "\n".join(lines) + "\n"
