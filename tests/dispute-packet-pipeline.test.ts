import { describe, expect, it } from "vitest";
import {
  canonicalDisputePacketJson,
  hashDisputePacketV1,
  type CanonicalJson,
} from "../genlayer/schemas/dispute-packet";
import {
  createDisputePacketV1,
  validateDisputePacketV1,
  type DisputePacketV1,
} from "../src/server/dispute-packet";
import { phase3b2cFixture } from "./fixtures/phase3b2c";

function reseal(packet: DisputePacketV1): DisputePacketV1 {
  const withoutHash: Partial<DisputePacketV1> = { ...packet };
  delete withoutHash.disputePacketHash;
  return {
    ...(withoutHash as Omit<DisputePacketV1, "disputePacketHash">),
    disputePacketHash: hashDisputePacketV1(
      withoutHash as unknown as {
        readonly disputePacketHash?: never;
      } & Record<string, CanonicalJson>,
    ),
  };
}

describe("Phase 3B2C DisputePacketV1 pipeline", () => {
  it.each(["release", "insufficient", "refund"] as const)(
    "builds a valid %s packet with approved amendment precedence",
    (kind) => {
      const inputs = phase3b2cFixture(kind);
      const built = createDisputePacketV1(inputs);
      expect(validateDisputePacketV1(built.packet, inputs)).toBe(true);
      expect(built.packet.governingTerms).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining("±0.25 mm"),
            effective: false,
          }),
          expect.objectContaining({
            text: expect.stringContaining("±0.15 mm"),
            effective: true,
          }),
        ]),
      );
      expect(built.canonicalJson).toBe(
        canonicalDisputePacketJson(built.packet),
      );
    },
  );

  it.each([
    ["schemaVersion", "2"],
    ["caseId", `0x${"9".repeat(64)}`],
    ["xLayerChainId", 1],
    ["xLayerEscrow", `0x${"9".repeat(40)}`],
    ["obligationId", 999],
    ["agreementHash", `0x${"9".repeat(64)}`],
    ["policyHash", `0x${"9".repeat(64)}`],
    ["evidenceRoot", `0x${"9".repeat(64)}`],
  ] as const)("rejects a packet with a wrong %s binding", (field, value) => {
    const inputs = phase3b2cFixture();
    const built = createDisputePacketV1(inputs);
    const tampered = reseal({
      ...built.packet,
      [field]: value,
    } as DisputePacketV1);
    expect(() => validateDisputePacketV1(tampered, inputs)).toThrow();
  });

  it("rejects missing, duplicate, unknown requirements and outside sources", () => {
    const inputs = phase3b2cFixture();
    const built = createDisputePacketV1(inputs);
    for (const disputedRequirements of [
      [],
      [
        ...built.packet.disputedRequirements,
        built.packet.disputedRequirements[0]!,
      ],
      [
        {
          ...built.packet.disputedRequirements[0]!,
          requirementId: "R-UNKNOWN",
        },
      ],
    ]) {
      const tampered = reseal({ ...built.packet, disputedRequirements });
      expect(() => validateDisputePacketV1(tampered, inputs)).toThrow(
        "REQUIREMENT_SET_MISMATCH",
      );
    }
    const sourceBlocks = [
      ...built.packet.sourceBlocks,
      {
        sourceId: `sha256:${"9".repeat(64)}`,
        sourceBlockHash: `sha256:${"9".repeat(64)}`,
        documentId: `sha256:${"9".repeat(64)}`,
        page: 1,
        blockOrder: 0,
        content: "outside",
      },
    ];
    expect(() =>
      validateDisputePacketV1(
        reseal({ ...built.packet, sourceBlocks }),
        inputs,
      ),
    ).toThrow("SOURCE_OUTSIDE_BUNDLE");
    const wrongSourceHash = reseal({
      ...built.packet,
      sourceBlocks: built.packet.sourceBlocks.map((source, index) =>
        index === 0
          ? { ...source, sourceBlockHash: `sha256:${"9".repeat(64)}` }
          : source,
      ),
    });
    expect(() => validateDisputePacketV1(wrongSourceHash, inputs)).toThrow(
      "SOURCE_OUTSIDE_BUNDLE",
    );
  });

  it("rejects stale lineage, unapproved precedence, bad citations, and tampered hashes", () => {
    const base = phase3b2cFixture();
    expect(() =>
      createDisputePacketV1({
        ...base,
        evidenceRoot: `0x${"9".repeat(64)}`,
      }),
    ).toThrow("EVIDENCE_LINEAGE_MISMATCH");
    expect(() =>
      createDisputePacketV1({
        ...base,
        evaluationContextHash: `sha256:${"9".repeat(64)}`,
      }),
    ).toThrow("EVALUATION_CONTEXT_MISMATCH");
    const wrongAmendment = structuredClone(base);
    wrongAmendment.bundle.requirements[0]!.effectiveGoverningSources =
      wrongAmendment.bundle.requirements[0]!.baseGoverningSources;
    expect(() => createDisputePacketV1(wrongAmendment)).toThrow(
      "AMENDMENT_PRECEDENCE_MISMATCH",
    );
    const outsideCitation = structuredClone(base);
    outsideCitation.evaluation.requirements[0]!.claims[0]!.citations[0]!.sourceBlockHash = `sha256:${"9".repeat(64)}`;
    expect(() => createDisputePacketV1(outsideCitation)).toThrow();
    const built = createDisputePacketV1(base);
    expect(() =>
      validateDisputePacketV1(
        { ...built.packet, disputePacketHash: `0x${"9".repeat(64)}` },
        base,
      ),
    ).toThrow("DISPUTE_PACKET_HASH_MISMATCH");
  });

  it("rejects malformed canonical values, private fields, and oversized packets", () => {
    expect(() =>
      canonicalDisputePacketJson({ unsafe: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
    expect(() => canonicalDisputePacketJson({ unsupported: 1.25 })).toThrow();
    expect(() => canonicalDisputePacketJson({ invalid: "\ud800" })).toThrow();
    const inputs = phase3b2cFixture();
    const built = createDisputePacketV1(inputs);
    expect(() =>
      validateDisputePacketV1(
        reseal({ ...built.packet, caseId: "0x123" }),
        inputs,
      ),
    ).toThrow("MALFORMED_BYTES32");
    const privatePacket = reseal({
      ...built.packet,
      sourceBlocks: [
        { ...built.packet.sourceBlocks[0]!, storageObjectKey: "private/path" },
        ...built.packet.sourceBlocks.slice(1),
      ],
    });
    expect(() => validateDisputePacketV1(privatePacket, inputs)).toThrow(
      "FORBIDDEN_PACKET_FIELD",
    );
    expect(() =>
      createDisputePacketV1({ ...inputs, maxPacketBytes: 100 }),
    ).toThrow("DISPUTE_PACKET_TOO_LARGE");
    expect(() =>
      validateDisputePacketV1(
        reseal({
          ...built.packet,
          buyerChallengeStatement: 7 as unknown as string,
        }),
        inputs,
      ),
    ).toThrow("INVALID_PARTY_STATEMENT");
    expect(() =>
      validateDisputePacketV1(
        reseal({ ...built.packet, extra: "forbidden" } as DisputePacketV1),
        inputs,
      ),
    ).toThrow("PACKET_SCHEMA_MISMATCH");
  });

  it("is deterministic and changes the hash for hash-covered party statements", () => {
    const inputs = phase3b2cFixture();
    const first = createDisputePacketV1(inputs);
    const second = createDisputePacketV1(structuredClone(inputs));
    expect(second.canonicalJson).toBe(first.canonicalJson);
    expect(second.disputePacketHash).toBe(first.disputePacketHash);
    expect(
      createDisputePacketV1({ ...inputs, buyerChallengeStatement: "Challenge" })
        .disputePacketHash,
    ).not.toBe(first.disputePacketHash);
    expect(
      createDisputePacketV1({ ...inputs, supplierResponse: "Response" })
        .disputePacketHash,
    ).not.toBe(first.disputePacketHash);
    const mutations: Array<Partial<DisputePacketV1>> = [
      { evidenceRoot: `0x${"9".repeat(64)}` },
      { agreementHash: `0x${"9".repeat(64)}` },
      { policyHash: `0x${"9".repeat(64)}` },
      {
        governingTerms: first.packet.governingTerms.map((term, index) =>
          index === 0 ? { ...term, text: "Changed governing term" } : term,
        ),
      },
      {
        sourceBlocks: first.packet.sourceBlocks.map((source, index) =>
          index === 0 ? { ...source, content: "Changed source block" } : source,
        ),
      },
    ];
    for (const mutation of mutations) {
      expect(
        reseal({ ...first.packet, ...mutation }).disputePacketHash,
      ).not.toBe(first.disputePacketHash);
    }
  });
});
