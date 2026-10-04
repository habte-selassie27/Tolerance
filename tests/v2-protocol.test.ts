import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  canonicalUrlForPolicy,
  hashDisputePacketV2,
  hashEvidenceAuthorityPolicyV1,
  hashEvidenceManifestV2,
  hashResolvedCaseV2,
  hashSourceVerificationV1,
  validateEvidenceSourceReference,
} from "../genlayer/schemas/v2";
import { deploymentForProtocol } from "../src/config/protocol";
import {
  judgeForSubmission,
  ProtocolVersionError,
} from "../src/server/agreements";

/**
 * Resolves a Python 3 interpreter that can import `genlayer`. Hosts differ on
 * whether the unversioned `python` name exists, so probe rather than assume.
 */
const pythonInterpreter = () => {
  for (const candidate of [process.env.PYTHON, "python3", "python"].filter(
    (name): name is string => Boolean(name),
  )) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    "No Python 3 interpreter found; set PYTHON to run the V2 hash parity check.",
  );
};

const bytes = (fill: string) => `0x${fill.repeat(64)}` as `0x${string}`;
const source = () => {
  const policy = hashEvidenceAuthorityPolicyV1({
    retrievalMode: "GET_JSON",
    allowedHost: "evidence.tolerance.example",
    allowedPath: "/synthetic/",
    expectedContentType: "application/json",
    extractionRule: "JSON_FIELD:measurement",
  });
  return {
    sourceId: "source-inspection",
    sourcePolicyHash: policy,
    canonicalUrl: "https://evidence.tolerance.example/synthetic/result.json",
    retrievalMode: "GET_JSON" as const,
    allowedHost: "evidence.tolerance.example",
    allowedPath: "/synthetic/",
    expectedContentType: "application/json",
    extractionRule: "JSON_FIELD:measurement",
    requirementIds: ["diameter"],
  };
};

describe("Tolerance V2 protocol isolation", () => {
  it("keeps V1 deployed and V2 explicitly undeployed", () => {
    expect(deploymentForProtocol("V1").deployed).toBe(true);
    expect(deploymentForProtocol("V2").deployed).toBe(false);
    expect(() => judgeForSubmission("V2")).toThrow(ProtocolVersionError);
  });
  it("canonicalizes only HTTPS exact authority URLs", () => {
    expect(
      canonicalUrlForPolicy(
        "https://Evidence.Tolerance.Example/synthetic/result.json",
      ),
    ).toBe("https://evidence.tolerance.example/synthetic/result.json");
    for (const bad of [
      "http://evidence.tolerance.example/synthetic/a",
      "https://u:p@evidence.tolerance.example/synthetic/a",
      "https://evidence.tolerance.example/synthetic/a#fragment",
      "https://127.0.0.1/synthetic/a",
      "https://localhost/synthetic/a",
    ])
      expect(() => canonicalUrlForPolicy(bad)).toThrow();
  });
  it("rejects host suffixes and policy-path substitution", () => {
    expect(() =>
      validateEvidenceSourceReference({
        ...source(),
        canonicalUrl:
          "https://evidence.tolerance.example.attacker.test/synthetic/result.json",
      }),
    ).toThrow("SOURCE_HOST_MISMATCH");
    expect(() =>
      validateEvidenceSourceReference({
        ...source(),
        canonicalUrl: "https://evidence.tolerance.example/other/result.json",
      }),
    ).toThrow("SOURCE_PATH_MISMATCH");
  });
  it("commits a source manifest, not unknown future fetched bytes", () => {
    const root = hashEvidenceManifestV2({
      privateEvidence: [
        {
          sourceId: "private-report",
          contentHash: bytes("a"),
          requirementIds: ["diameter"],
        },
      ],
      publicSources: [source()],
    });
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(root).not.toContain("measurement");
  });
  it("binds deterministic validator-observed source verification", () => {
    const item = {
      sourceId: "source-inspection",
      canonicalUrl: source().canonicalUrl,
      sourcePolicyHash: source().sourcePolicyHash,
      contentHash: bytes("b"),
      canonicalExtractHash: bytes("c"),
      verificationStatus: "VERIFIED" as const,
    };
    expect(hashSourceVerificationV1([item])).toBe(
      hashSourceVerificationV1([item]),
    );
    expect(() => hashSourceVerificationV1([item, item])).toThrow(
      "DUPLICATE_SOURCE_ID",
    );
  });
  it("seals packet and resolved case V2 in distinct domains", () => {
    const packet = {
      schemaVersion: "2",
      caseId: bytes("1"),
      xLayerChainId: 1952,
      xLayerEscrow: "0x1111111111111111111111111111111111111111",
      obligationId: 1,
      agreementHash: bytes("2"),
      policyHash: bytes("3"),
      evidenceRoot: bytes("4"),
      decisionRubric: "r",
      burdenOfProof: "b",
      disputedRequirements: [],
      governingTerms: [],
      approvedAmendments: [],
      privateEvidence: [],
      publicSources: [],
      deterministicCheckResults: [],
      buyerChallengeStatement: "",
      supplierResponse: "",
    };
    const packetHash = hashDisputePacketV2(packet);
    expect(
      hashResolvedCaseV2({
        schemaVersion: "2",
        caseId: bytes("1"),
        xLayerChainId: 1952,
        xLayerEscrow: "0x1111111111111111111111111111111111111111",
        obligationId: "1",
        agreementHash: bytes("2"),
        policyHash: bytes("3"),
        evidenceRoot: bytes("4"),
        disputePacketHash: packetHash,
        sourceVerificationHash: bytes("5"),
        resolved: true,
        verdict: "INSUFFICIENT_EVIDENCE",
      }),
    ).not.toBe(packetHash);
  });
  it("matches Python canonical V2 source verification hashing", () => {
    const item = {
      sourceId: "source-inspection",
      canonicalUrl: source().canonicalUrl,
      sourcePolicyHash: source().sourcePolicyHash,
      contentHash: bytes("b"),
      canonicalExtractHash: bytes("c"),
      verificationStatus: "VERIFIED" as const,
    };
    const payload = JSON.stringify([item]);
    const python = execFileSync(
      pythonInterpreter(),
      [
        "-c",
        "import json,sys; from genlayer.schemas.v2 import hash_source_verification_v1; print(hash_source_verification_v1(json.loads(sys.argv[1])))",
        payload,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
    expect(python).toBe(hashSourceVerificationV1([item]));
  });
});
