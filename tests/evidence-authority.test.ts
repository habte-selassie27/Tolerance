import { EvidenceAuthorityLevel } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  EVIDENCE_AUTHORITY_POLICY_VERSION,
  EvidenceAuthorityError,
  evidenceAuthoritySatisfies,
  effectiveAuthorityRank,
} from "../src/server/evidence-authority";

describe("RC5 evidence authority boundary", () => {
  it("defaults ordinary persisted evidence to party supplied authority", () => {
    expect(EvidenceAuthorityLevel.PARTY_UPLOADED).toBe("PARTY_UPLOADED");
    expect(EVIDENCE_AUTHORITY_POLICY_VERSION).toBe("1");
    expect(effectiveAuthorityRank.PARTY_UPLOADED).toBe(0);
  });

  it("does not confuse provenance integrity with decisive authority", () => {
    expect(
      evidenceAuthoritySatisfies(
        EvidenceAuthorityLevel.PARTY_UPLOADED,
        EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
      ),
    ).toBe(false);
    expect(
      evidenceAuthoritySatisfies(
        EvidenceAuthorityLevel.PREAGREED_EXTERNAL_SOURCE,
        EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
      ),
    ).toBe(false);
    expect(
      evidenceAuthoritySatisfies(
        EvidenceAuthorityLevel.SERVER_FETCH_VERIFIED,
        EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
      ),
    ).toBe(false);
  });

  it("allows acknowledged, issuer-signed, and on-chain authority when policy permits", () => {
    expect(
      evidenceAuthoritySatisfies(
        EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
        EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
      ),
    ).toBe(true);
    expect(
      evidenceAuthoritySatisfies(
        EvidenceAuthorityLevel.THIRD_PARTY_SIGNED,
        EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
      ),
    ).toBe(true);
    expect(
      evidenceAuthoritySatisfies(
        EvidenceAuthorityLevel.ONCHAIN_VERIFIED,
        EvidenceAuthorityLevel.THIRD_PARTY_SIGNED,
      ),
    ).toBe(true);
  });

  it("keeps authority errors explicit rather than rewriting an AI result", () => {
    const error = new EvidenceAuthorityError("EVIDENCE_AUTHORITY_INSUFFICIENT");
    expect(error.code).toBe("EVIDENCE_AUTHORITY_INSUFFICIENT");
  });
});
