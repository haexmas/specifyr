from __future__ import annotations

import json
import unittest
from pathlib import Path

from specifyr.assurance import verify_rule_pack


ROOT = Path(__file__).resolve().parents[1]


class AssuranceTest(unittest.TestCase):
    def test_bundled_and_authoring_rule_packs_are_identical(self) -> None:
        authoring = json.loads((ROOT / "packs/core/rules.json").read_text(encoding="utf-8"))
        bundled = json.loads(
            (ROOT / "src/specifyr/data/core_rules.json").read_text(encoding="utf-8")
        )
        self.assertEqual(authoring, bundled)

    def test_every_rule_has_examples_and_disable_mutation_is_killed(self) -> None:
        rules = json.loads((ROOT / "packs/core/rules.json").read_text(encoding="utf-8"))
        corpus = json.loads((ROOT / "benchmarks/corpus.json").read_text(encoding="utf-8"))
        result = verify_rule_pack(rules, corpus)
        self.assertEqual("passed", result["status"])
        self.assertEqual(1.0, result["mutation"]["score"])
        self.assertEqual([], result["failures"])

    def test_duplicate_corpus_case_ids_are_rejected(self) -> None:
        rules = json.loads((ROOT / "packs/core/rules.json").read_text(encoding="utf-8"))
        corpus = json.loads((ROOT / "benchmarks/corpus.json").read_text(encoding="utf-8"))
        corpus["cases"].append(corpus["cases"][0].copy())

        with self.assertRaisesRegex(ValueError, "duplicate corpus case id"):
            verify_rule_pack(rules, corpus)


if __name__ == "__main__":
    unittest.main()
