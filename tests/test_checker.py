from __future__ import annotations

import json
import unittest
from pathlib import Path

from spec_logic.checker import check


ROOT = Path(__file__).resolve().parents[1]


class CheckerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rules = json.loads((ROOT / "packs/core/rules.json").read_text(encoding="utf-8"))
        cls.corpus = json.loads((ROOT / "benchmarks/corpus.json").read_text(encoding="utf-8"))

    def case(self, case_id: str) -> dict:
        return next(case for case in self.corpus["cases"] if case["id"] == case_id)

    def test_detects_realistic_cardinality_conflict_with_sources(self) -> None:
        result = check(self.case("haex-constitution-cardinality-conflict")["model"], self.rules)
        self.assertEqual("nonconforming", result["status"])
        self.assertEqual(["contradiction"], [finding["category"] for finding in result["findings"]])
        self.assertEqual(2, len(result["findings"][0]["evidence"]))

    def test_disjoint_scopes_do_not_conflict(self) -> None:
        result = check(self.case("same-constraint-disjoint-scopes")["model"], self.rules)
        self.assertEqual("conforming", result["status"])
        self.assertEqual([], result["findings"])

    def test_open_world_does_not_turn_absence_into_false(self) -> None:
        result = check(self.case("open-world-requirement-not-yet-covered")["model"], self.rules)
        self.assertEqual([], result["findings"])

    def test_findings_are_stable(self) -> None:
        model = self.case("task-dependency-cycle")["model"]
        first = check(model, self.rules)
        second = check(model, self.rules)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()

