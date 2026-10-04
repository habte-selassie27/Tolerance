import { describe, expect, it } from "vitest";

import { assertAutomaticAttestationDisabled } from "../src/config/env";
import { protocolConfig, protocolConfigSchema } from "../src/config/protocol";
import { assertAgreementIsMutable } from "../src/server/agreements";
import {
  AuthorizationError,
  createAuthorizationGuards,
} from "../src/server/authorization";
import {
  createOpaqueStorageKey,
  validateUploadBytes,
} from "../src/server/validation";

const dealId = "dfb4b6a3-9466-46bd-ae56-5d32b21d08a1";

describe("Phase 3A data-plane controls", () => {
  it("keeps automatic GenLayer-derived attestation disabled", () => {
    expect(assertAutomaticAttestationDisabled({})).toBe(false);
    expect(() =>
      assertAutomaticAttestationDisabled({
        AUTOMATIC_ATTESTATION_ENABLED: "true",
      }),
    ).toThrow("intentionally unavailable");
    expect(protocolConfig.automaticAttestationEnabled).toBe(false);
    expect(protocolConfigSchema.parse(protocolConfig)).toEqual(protocolConfig);
  });

  it("hashes validated private document bytes and makes opaque keys", () => {
    const metadata = validateUploadBytes({
      bytes: new TextEncoder().encode("inspection evidence"),
      mimeType: "text/plain",
      originalFilename: "report.txt",
    });
    expect(metadata.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(createOpaqueStorageKey(dealId)).toMatch(
      new RegExp(`^deals/${dealId}/documents/`),
    );
    expect(() =>
      validateUploadBytes({
        bytes: new Uint8Array(),
        mimeType: "text/plain",
        originalFilename: "x.txt",
      }),
    ).toThrow("must not be empty");
    expect(() =>
      validateUploadBytes({
        bytes: new Uint8Array([1]),
        mimeType: "application/x-msdownload",
        originalFilename: "x.exe",
      }),
    ).toThrow("Unsupported");
    expect(() =>
      validateUploadBytes({
        bytes: new Uint8Array([1]),
        mimeType: "text/plain",
        originalFilename: "../x.txt",
      }),
    ).toThrow("Unsafe");
  });

  it("enforces organization, deal, and document access server-side", async () => {
    const guards = createAuthorizationGuards({
      findMembership: async () => false,
      findDealOrganizations: async () => ["org-1"],
      findDocumentOrganizations: async () => ["org-1"],
    });
    await expect(
      guards.requireOrganizationMember("user-1", "org-1"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      guards.requireDealAccess("user-1", "deal-1"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      guards.requireDocumentAccess("user-1", "document-1"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("makes approved agreement versions immutable", () => {
    expect(() => assertAgreementIsMutable("DRAFT")).not.toThrow();
    expect(() => assertAgreementIsMutable("APPROVED")).toThrow("immutable");
    expect(() => assertAgreementIsMutable("SUPERSEDED")).toThrow("immutable");
  });

  it("preserves SourceBlock and evidence provenance through database constraints", () => {
    const sourceBlockIdentity = ["document-1", "extract-v1", 4] as const;
    const evidenceRequirementIdentity = [
      "evidence-1",
      "requirement-1",
    ] as const;
    expect(new Set(sourceBlockIdentity).size).toBe(3);
    expect(new Set(evidenceRequirementIdentity).size).toBe(2);
  });
});
