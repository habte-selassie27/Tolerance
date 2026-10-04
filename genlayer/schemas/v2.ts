import { sha256, stringToHex, type Hex } from "viem";
import {
  canonicalDisputePacketJson,
  type CanonicalJson,
} from "./dispute-packet";

export type PublicEvidenceClass =
  | "PRIVATE_ACKNOWLEDGED"
  | "PUBLIC_VALIDATOR_FETCH"
  | "THIRD_PARTY_SIGNED"
  | "ONCHAIN_VERIFIED";
export type RetrievalMode = "GET_TEXT" | "GET_JSON";
export type VerificationStatus =
  | "VERIFIED"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_AUTHORITY_MISMATCH"
  | "SOURCE_HASH_MISMATCH"
  | "SOURCE_CONTENT_TYPE_MISMATCH"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_EXTRACTION_FAILED"
  | "SOURCE_CONSENSUS_FAILED";

export interface EvidenceSourceReferenceV1 {
  sourceId: string;
  sourcePolicyHash: Hex;
  canonicalUrl: string;
  retrievalMode: RetrievalMode;
  allowedHost: string;
  allowedPath: string;
  expectedIssuer?: string;
  expectedContentHash?: Hex;
  expectedContentType: string;
  extractionRule: string;
  requirementIds: string[];
}
export interface FetchedSourceVerificationV1 {
  sourceId: string;
  canonicalUrl: string;
  sourcePolicyHash: Hex;
  contentHash: Hex;
  canonicalExtractHash: Hex;
  verificationStatus: VerificationStatus;
}
export interface ResolvedCaseV2 {
  schemaVersion: "2";
  caseId: Hex;
  xLayerChainId: number;
  xLayerEscrow: Hex;
  obligationId: string;
  agreementHash: Hex;
  policyHash: Hex;
  evidenceRoot: Hex;
  disputePacketHash: Hex;
  sourceVerificationHash: Hex;
  resolved: boolean;
  verdict: "RELEASE_FULL" | "REFUND_FULL" | "INSUFFICIENT_EVIDENCE";
}

function digest(value: CanonicalJson): Hex {
  return sha256(stringToHex(canonicalDisputePacketJson(value)));
}
export function canonicalUrlForPolicy(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error("SOURCE_URL_INVALID");
  if (
    url.hostname === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    url.hostname.includes(":")
  )
    throw new Error("SOURCE_URL_PRIVATE_HOST");
  if (url.port && url.port !== "443")
    throw new Error("SOURCE_URL_PORT_INVALID");
  return `https://${url.hostname.toLowerCase()}${url.pathname || "/"}`;
}
export function validateEvidenceSourceReference(
  source: EvidenceSourceReferenceV1,
): EvidenceSourceReferenceV1 {
  const canonicalUrl = canonicalUrlForPolicy(source.canonicalUrl);
  const host = source.allowedHost.toLowerCase();
  const parsed = new URL(canonicalUrl);
  if (parsed.hostname !== host) throw new Error("SOURCE_HOST_MISMATCH");
  const allowed = source.allowedPath.startsWith("/")
    ? source.allowedPath
    : `/${source.allowedPath}`;
  if (!(
    parsed.pathname === allowed ||
    parsed.pathname.startsWith(`${allowed.replace(/\/$/, "")}/`)
  ))
    throw new Error("SOURCE_PATH_MISMATCH");
  if (!/^0x[a-fA-F0-9]{64}$/.test(source.sourcePolicyHash))
    throw new Error("SOURCE_POLICY_HASH_INVALID");
  if (
    source.expectedContentHash &&
    !/^0x[a-fA-F0-9]{64}$/.test(source.expectedContentHash)
  )
    throw new Error("SOURCE_CONTENT_HASH_INVALID");
  if (
    !source.sourceId ||
    !source.requirementIds.length ||
    !source.expectedContentType ||
    !source.extractionRule
  )
    throw new Error("SOURCE_REFERENCE_INCOMPLETE");
  return { ...source, canonicalUrl, allowedHost: host, allowedPath: allowed };
}
export function hashEvidenceAuthorityPolicyV1(
  source: Omit<
    EvidenceSourceReferenceV1,
    "sourceId" | "sourcePolicyHash" | "canonicalUrl" | "requirementIds"
  >,
): Hex {
  const { expectedIssuer, expectedContentHash, ...required } = source;
  return digest({
    domain: "ToleranceEvidenceAuthorityPolicyV1",
    ...required,
    ...(expectedIssuer ? { expectedIssuer } : {}),
    ...(expectedContentHash ? { expectedContentHash } : {}),
  } as CanonicalJson);
}
export function hashEvidenceManifestV2(input: {
  privateEvidence: Array<{
    sourceId: string;
    contentHash: Hex;
    requirementIds: string[];
  }>;
  publicSources: EvidenceSourceReferenceV1[];
}): Hex {
  return digest({
    domain: "ToleranceEvidenceManifestV2",
    privateEvidence: [...input.privateEvidence].sort((a, b) =>
      a.sourceId.localeCompare(b.sourceId),
    ),
    publicSources: [...input.publicSources]
      .map(validateEvidenceSourceReference)
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  } as unknown as CanonicalJson);
}
export function hashSourceVerificationV1(
  items: FetchedSourceVerificationV1[],
): Hex {
  const sorted = [...items].sort((a, b) =>
    a.sourceId.localeCompare(b.sourceId),
  );
  if (new Set(sorted.map((item) => item.sourceId)).size !== sorted.length)
    throw new Error("DUPLICATE_SOURCE_ID");
  return digest({
    domain: "ToleranceFetchedSourceVerificationV1",
    sources: sorted,
  } as unknown as CanonicalJson);
}
export function hashResolvedCaseV2(value: ResolvedCaseV2): Hex {
  return digest({
    domain: "ToleranceResolvedCaseV2",
    ...value,
  } as CanonicalJson);
}
export function hashDisputePacketV2(
  packet: Record<string, CanonicalJson>,
): Hex {
  if ("disputePacketHash" in packet)
    throw new Error("packet hash input must omit disputePacketHash");
  return digest({
    domain: "ToleranceDisputePacketV2",
    ...packet,
  } as CanonicalJson);
}
