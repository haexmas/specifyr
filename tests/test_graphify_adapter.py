from __future__ import annotations

import unittest

from spec_logic.adapters.graphify import import_graphify


class GraphifyAdapterTest(unittest.TestCase):
    def test_import_preserves_confidence_and_never_authorizes_candidates(self) -> None:
        graph = {
            "nodes": [
                {"id": "ADR-1", "label": "Decision", "source_file": "docs/adr/1.md", "source_location": "L4"},
                {"id": "FR-1", "label": "Requirement", "source_file": "specs/1/spec.md", "source_location": "L20"},
            ],
            "edges": [
                {"source": "ADR-1", "target": "FR-1", "relation": "supersedes", "confidence": "INFERRED"}
            ],
        }
        result = import_graphify(graph)
        self.assertEqual("spec-logic-candidates-v1", result["schema"])
        edge = result["relation_candidates"][0]
        self.assertEqual("inferred", edge["provenance"]["confidence"])
        self.assertFalse(edge["provenance"]["authoritative"])
        self.assertEqual(["graphify:supersedes"], result["vocabulary_candidates"])

    def test_networkx_node_mapping_is_accepted(self) -> None:
        result = import_graphify({"nodes": {"a": {"label": "A"}}, "edges": []})
        self.assertEqual("graphify:node:a", result["concept_candidates"][0]["id"])


if __name__ == "__main__":
    unittest.main()

