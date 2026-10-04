import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { prisma } from "../lib/prisma";
import { createServerSupabaseClient } from "../lib/supabase";

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type AuthorizationData = {
  findMembership(organizationId: string, userId: string): Promise<boolean>;
  findDealOrganizations(dealId: string): Promise<string[]>;
  findDocumentOrganizations(documentId: string): Promise<string[]>;
};

export function createAuthorizationGuards(database: AuthorizationData) {
  async function requireOrganizationMember(
    userId: string,
    organizationId: string,
  ) {
    if (!(await database.findMembership(organizationId, userId))) {
      throw new AuthorizationError();
    }
    return { organizationId, userId };
  }

  async function requireDealAccess(userId: string, dealId: string) {
    const organizationIds = await database.findDealOrganizations(dealId);
    if (!organizationIds.length)
      throw new AuthorizationError("Deal was not found.");
    for (const organizationId of organizationIds) {
      if (await database.findMembership(organizationId, userId))
        return { organizationId };
    }
    throw new AuthorizationError();
  }

  async function requireDocumentAccess(userId: string, documentId: string) {
    const organizationIds =
      await database.findDocumentOrganizations(documentId);
    if (!organizationIds.length)
      throw new AuthorizationError("Document was not found.");
    for (const organizationId of organizationIds) {
      if (await database.findMembership(organizationId, userId))
        return { organizationId };
    }
    throw new AuthorizationError();
  }

  return {
    requireOrganizationMember,
    requireDealAccess,
    requireDocumentAccess,
  };
}

export type AuthenticatedActor = {
  id: string;
  authSubject: string;
  email: string | null;
  displayName: string | null;
};

export async function requireUser(): Promise<AuthenticatedActor> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new AuthorizationError("Authentication is required.");

  const user = await prisma.user.upsert({
    where: { authSubject: data.user.id },
    create: {
      authSubject: data.user.id,
      email: data.user.email ?? null,
      displayName:
        typeof data.user.user_metadata.display_name === "string"
          ? data.user.user_metadata.display_name
          : null,
    },
    update: {
      email: data.user.email ?? null,
      displayName:
        typeof data.user.user_metadata.display_name === "string"
          ? data.user.user_metadata.display_name
          : undefined,
    },
    select: { id: true, authSubject: true, email: true, displayName: true },
  });
  return user;
}

export const guards = createAuthorizationGuards({
  async findMembership(organizationId, userId) {
    return Boolean(
      await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { userId: true },
      }),
    );
  },
  async findDealOrganizations(dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        organizationId: true,
        participants: { select: { organizationId: true } },
      },
    });
    return deal
      ? [
          ...new Set([
            deal.organizationId,
            ...deal.participants.map((p) => p.organizationId),
          ]),
        ]
      : [];
  },
  async findDocumentOrganizations(documentId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        deal: {
          select: {
            organizationId: true,
            participants: { select: { organizationId: true } },
          },
        },
      },
    });
    return document
      ? [
          ...new Set([
            document.deal.organizationId,
            ...document.deal.participants.map((p) => p.organizationId),
          ]),
        ]
      : [];
  },
});

const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const documentUploadSchema = z.object({
  dealId: z.uuid(),
  documentType: z.enum([
    "AGREEMENT",
    "AMENDMENT",
    "TECHNICAL_SPECIFICATION",
    "INSPECTION_REPORT",
    "SHIPMENT_EVIDENCE",
    "OTHER_EVIDENCE",
  ]),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().max(128),
});

export const protocolObservationSchema = z.object({
  obligationId: z.uuid(),
  txHash: bytes32,
  eventType: z.string().min(1).max(80),
  observedState: z.string().min(1).max(80),
  blockNumber: z.bigint().nonnegative().optional(),
});

export const obligationIdentitySchema = z.object({
  xLayerChainId: z.literal(1952),
  xLayerEscrow: address,
  xLayerObligationId: z.string().min(1),
  toleranceCaseId: bytes32,
});

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function validateUploadBytes(input: {
  bytes: Uint8Array;
  mimeType: string;
  originalFilename: string;
}) {
  if (input.bytes.byteLength === 0)
    throw new Error("Uploaded file must not be empty.");
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("Uploaded file exceeds the maximum size.");
  if (!allowedMimeTypes.has(input.mimeType))
    throw new Error("Unsupported document MIME type.");
  if (/[\\/\0]/.test(input.originalFilename))
    throw new Error("Unsafe document filename.");
  return {
    contentHash: `sha256:${createHash("sha256").update(input.bytes).digest("hex")}`,
    byteSize: input.bytes.byteLength,
  };
}

export function createOpaqueStorageKey(dealId: string) {
  z.uuid().parse(dealId);
  return `deals/${dealId}/documents/${randomUUID()}`;
}
