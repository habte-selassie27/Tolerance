import json
from pathlib import Path

import pytest

from conftest import make_packet, response


CORPUS = json.loads(
    (Path(__file__).parents[1] / "fixtures" / "adjudication-corpus-v1.json").read_text(encoding="utf-8")
)["cases"]


def expected_adjudication(expected):
    if expected == "RELEASE_FULL":
        return response("RELEASE_FULL", "SATISFIED")
    if expected == "REFUND_FULL":
        return response("REFUND_FULL", "NOT_SATISFIED")
    return response("INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", [])


def test_corpus_is_versioned_synthetic_and_complete():
    document = json.loads(
        (Path(__file__).parents[1] / "fixtures" / "adjudication-corpus-v1.json").read_text(encoding="utf-8")
    )
    assert document["schemaVersion"] == "1"
    assert document["syntheticOnly"] is True
    assert [case["id"] for case in document["cases"]] == [f"TM-EVAL-{number:02d}" for number in range(1, 11)]


@pytest.mark.parametrize("case", CORPUS, ids=[case["id"] for case in CORPUS])
def test_corpus_scenarios_preserve_bounded_business_outputs(submit, case):
    packet = make_packet(
        sourceBlocks=[
            {
                "sourceId": "SRC-1",
                "documentId": "synthetic-" + case["id"],
                "page": 1,
                "content": case["fact"],
            }
        ]
    )
    adjudication = expected_adjudication(case["expected"])
    resolved = submit(packet, adjudication)
    assert resolved["verdict"] in {"RELEASE_FULL", "REFUND_FULL", "INSUFFICIENT_EVIDENCE"}
    assert "reasoning" not in resolved
    assert "amount" not in resolved
    assert "recipient" not in resolved
