import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

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
