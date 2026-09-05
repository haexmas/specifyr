from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from spec_logic.adapters.speckit import extract_project
from spec_logic.model import validate_model


class SpeckitAdapterTest(unittest.TestCase):
    def test_extracts_visible_formal_block_and_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            spec = root / "specs/001-demo/spec.md"
            spec.parent.mkdir(parents=True)
            spec.write_text(
                "# Feature\n\n**Status**: Draft\n\n"
                "- **FR-001**: Exactly one worker.\n\n"
                "```spec-logic\n"
                '{"id":"demo:FR-001","kind":"requirement","modality":"must",'
                '"polarity":"positive","subject":"demo:pool","predicate":"demo:worker-count",'
                '"operator":"exactly","value":1,"scope":{"feature":"001"},'
                '"source":{"path":"specs/001-demo/spec.md","anchor":"FR-001"}}\n'
                "```\n",
                encoding="utf-8",
            )
            model = validate_model(extract_project(root))
            self.assertEqual(1, len(model["claims"]))
            self.assertEqual("demo:FR-001", model["claims"][0]["id"])
            self.assertEqual("draft", model["claims"][0]["status"])

    def test_missing_markdown_link_becomes_unresolved_relation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "specs/001-demo/plan.md"
            plan.parent.mkdir(parents=True)
            plan.write_text("See [missing](contracts/missing.md).\n", encoding="utf-8")
            model = validate_model(extract_project(root))
            self.assertTrue(model["relations"][0]["target"].startswith("missing:"))


if __name__ == "__main__":
    unittest.main()
