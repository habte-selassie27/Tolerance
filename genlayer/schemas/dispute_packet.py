"""Application-boundary canonicalization for Tolerance DisputePacketV1.

This module is not imported by the single-file Intelligent Contract. Both sides use the
same deliberately constrained UTF-8/sorted-key/compact JSON construction.
"""

import hashlib
import json
from typing import Any

MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991


def _require_canonical_value(value: Any) -> None:
    """Reject JSON values which cannot have one unambiguous Python/TypeScript form."""
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, int):
        if abs(value) > MAX_SAFE_JSON_INTEGER:
            raise ValueError("integers must fit the IEEE-754 safe-integer range")
        return
    if isinstance(value, str):
        if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
            raise ValueError("strings must not contain surrogate code points")
        return
    if isinstance(value, list):
        for item in value:
            _require_canonical_value(item)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("object keys must be strings")
            _require_canonical_value(key)
            _require_canonical_value(item)
        return
    raise ValueError("floats and non-JSON values are forbidden")


def canonical_json(value: Any) -> str:
    _require_canonical_value(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def packet_hash(packet_without_hash: dict[str, Any]) -> str:
    if "disputePacketHash" in packet_without_hash:
        raise ValueError("packet_hash input must omit disputePacketHash")
    return "0x" + hashlib.sha256(canonical_json(packet_without_hash).encode("utf-8")).hexdigest()


def seal_packet(packet_without_hash: dict[str, Any]) -> dict[str, Any]:
    packet = dict(packet_without_hash)
    packet["disputePacketHash"] = packet_hash(packet_without_hash)
    return packet
