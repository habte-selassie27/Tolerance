import "server-only";

import type { CanonicalJson } from "../../genlayer/schemas/dispute-packet";
import { canonicalDisputePacketJson } from "../../genlayer/schemas/dispute-packet";
import {
  hashDisputePacketV2,
  hashEvidenceManifestV2,
  type EvidenceSourceReferenceV1,
} from "../../genlayer/schemas/v2";
import { deploymentForProtocol } from "../config/protocol";

/** V2 deliberately holds public sources as references. It never accepts
 * packet-supplied public source content as validator-verified evidence. */
export type DisputePacketV2Input = {
  caseId: string;
  obligationId: number;
  agreementHash: string;
  policyHash: string;
  privateEvidence: Array<{
    sourceId: string;
    contentHash: `0x${string}`;
    requirementIds: string[];
  }>;
  publicSources: EvidenceSourceReferenceV1[];
  disputedRequirements: CanonicalJson[];
  governingTerms: CanonicalJson[];
  approvedAmendments: CanonicalJson[];
  deterministicCheckResults: CanonicalJson[];
  decisionRubric: string;
  burdenOfProof: string;
  buyerChallengeStatement: string;
  supplierResponse: string;
};

export function createDisputePacketV2(input: DisputePacketV2Input) {
  const deployment = deploymentForProtocol("V2");
  if (
    !deployment.deployed ||
    !deployment.xLayer.escrow ||
    !deployment.genLayer.judge
  )
    throw new Error("PROTOCOL_V2_NOT_DEPLOYED");
  const evidenceRoot = hashEvidenceManifestV2({
    privateEvidence: input.privateEvidence,
    publicSources: input.publicSources,
  });
  // V2 cannot become actionable until RC5B2 writes real, verified deployment identities.
  const packet = {
    schemaVersion: "2",
    caseId: input.caseId,
    xLayerChainId: deployment.xLayer.chainId,
    xLayerEscrow: deployment.xLayer.escrow,
    obligationId: input.obligationId,
    agreementHash: input.agreementHash,
    policyHash: input.policyHash,
    evidenceRoot,
    decisionRubric: input.decisionRubric,
    burdenOfProof: input.burdenOfProof,
    disputedRequirements: input.disputedRequirements,
    governingTerms: input.governingTerms,
    approvedAmendments: input.approvedAmendments,
    privateEvidence: input.privateEvidence,
    publicSources: input.publicSources,
    deterministicCheckResults: input.deterministicCheckResults,
    buyerChallengeStatement: input.buyerChallengeStatement,
    supplierResponse: input.supplierResponse,
  } as unknown as Record<string, CanonicalJson>;
  const disputePacketHash = hashDisputePacketV2(packet);
  const sealed = { ...packet, disputePacketHash } as CanonicalJson;
  return {
    packet: sealed,
    evidenceRoot,
    disputePacketHash,
    canonicalJson: canonicalDisputePacketJson(sealed),
  };
}
