"""Canonical V2 source/evidence schema shared with the Tolerance application."""
import hashlib
from urllib.parse import urlsplit
from typing import Any
from .dispute_packet import canonical_json

def digest(value: Any) -> str:
    return "0x" + hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()

def canonical_url_for_policy(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.query:
        raise ValueError("SOURCE_URL_INVALID")
    host = parsed.hostname.lower()
    if host == "localhost" or host.replace(".", "").isdigit() or ":" in host:
        raise ValueError("SOURCE_URL_PRIVATE_HOST")
    if parsed.port not in (None, 443): raise ValueError("SOURCE_URL_PORT_INVALID")
    return f"https://{host}{parsed.path or '/'}"

def validate_source_reference(source: dict[str, Any]) -> dict[str, Any]:
    canonical = canonical_url_for_policy(source["canonicalUrl"])
    parsed = urlsplit(canonical)
    host = source["allowedHost"].lower()
    allowed = source["allowedPath"] if source["allowedPath"].startswith("/") else "/" + source["allowedPath"]
    if parsed.hostname != host: raise ValueError("SOURCE_HOST_MISMATCH")
    if not (parsed.path == allowed or parsed.path.startswith(allowed.rstrip("/") + "/")): raise ValueError("SOURCE_PATH_MISMATCH")
    if not source.get("sourceId") or not source.get("requirementIds") or not source.get("expectedContentType") or not source.get("extractionRule"):
        raise ValueError("SOURCE_REFERENCE_INCOMPLETE")
    item = dict(source); item["canonicalUrl"] = canonical; item["allowedHost"] = host; item["allowedPath"] = allowed
    return item

def hash_evidence_authority_policy_v1(source: dict[str, Any]) -> str:
    clean={key:value for key,value in source.items() if value is not None}
    return digest({"domain":"ToleranceEvidenceAuthorityPolicyV1", **clean})
def hash_evidence_manifest_v2(private_evidence: list[dict[str, Any]], public_sources: list[dict[str, Any]]) -> str:
    return digest({"domain":"ToleranceEvidenceManifestV2","privateEvidence":sorted(private_evidence,key=lambda x:x["sourceId"]),"publicSources":sorted([validate_source_reference(s) for s in public_sources],key=lambda x:x["sourceId"])})
def hash_source_verification_v1(items: list[dict[str, Any]]) -> str:
    ordered=sorted(items,key=lambda x:x["sourceId"])
    if len({item["sourceId"] for item in ordered}) != len(ordered): raise ValueError("DUPLICATE_SOURCE_ID")
    return digest({"domain":"ToleranceFetchedSourceVerificationV1","sources":ordered})
def hash_resolved_case_v2(value: dict[str, Any]) -> str: return digest({"domain":"ToleranceResolvedCaseV2", **value})
def hash_dispute_packet_v2(value: dict[str, Any]) -> str:
    if "disputePacketHash" in value: raise ValueError("packet hash input must omit disputePacketHash")
    return digest({"domain":"ToleranceDisputePacketV2", **value})
