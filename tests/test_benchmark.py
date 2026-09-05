from __future__ import annotations

import json
import unittest
from pathlib import Path

from specifyr.benchmark import run_benchmark


ROOT = Path(__file__).resolve().parents[1]


class BenchmarkTest(unittest.TestCase):
    def test_formal_runner_outperforms_document_baseline_on_gold_corpus(self) -> None:
        rules = json.loads((ROOT / "packs/core/rules.json").read_text(encoding="utf-8"))
        corpus = json.loads((ROOT / "benchmarks/corpus.json").read_text(encoding="utf-8"))
        result = run_benchmark(corpus, rules, runs=2)
        formal = result["runners"]["formal"]
        baseline = result["runners"]["document_baseline"]
        self.assertEqual(1.0, formal["precision"])
        self.assertEqual(1.0, formal["recall"])
        self.assertGreater(formal["f1"], baseline["f1"])
        self.assertTrue(formal["deterministic"])

    def test_external_baseline_can_be_scored_without_trusting_it(self) -> None:
        rules = json.loads((ROOT / "packs/core/rules.json").read_text(encoding="utf-8"))
        corpus = json.loads((ROOT / "benchmarks/corpus.json").read_text(encoding="utf-8"))
        external = {"name": "external", "predictions": {case["id"]: [] for case in corpus["cases"]}}
        result = run_benchmark(corpus, rules, runs=1, external_baseline=external)
        self.assertIn("external", result["runners"])
        self.assertFalse(result["runners"]["external"]["deterministic"])


if __name__ == "__main__":
    unittest.main()

