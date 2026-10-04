import "server-only";

import { prisma } from "../lib/prisma";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { guards, requireUser } from "./auth";
import { createOpaqueStorageKey, validateUploadBytes } from "./validation";

export const EVIDENCE_BUCKET = "tolerance-private-evidence";

export async function ensurePrivateEvidenceBucket() {
  const storage = createSupabaseAdminClient().storage;
  const { data: buckets, error: listError } = await storage.listBuckets();
  if (listError) throw listError;
  if (buckets.some((bucket) => bucket.name === EVIDENCE_BUCKET)) return;
  const { error } = await storage.createBucket(EVIDENCE_BUCKET, {
    public: false,
    fileSizeLimit: "26214400",
  });
  if (error) throw error;
}

export async function putPrivateDocument(input: {
  dealId: string;
  documentType:
    | "AGREEMENT"
    | "AMENDMENT"
    | "TECHNICAL_SPECIFICATION"
    | "INSPECTION_REPORT"
    | "SHIPMENT_EVIDENCE"
    | "OTHER_EVIDENCE";
  originalFilename: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const actor = await requireUser();
  await guards.requireDealAccess(actor.id, input.dealId);
  const validated = validateUploadBytes(input);
  const storageObjectKey = createOpaqueStorageKey(input.dealId);
  const storage = createSupabaseAdminClient().storage.from(EVIDENCE_BUCKET);
  const { error } = await storage.upload(storageObjectKey, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (error) throw error;
  try {
    return await prisma.document.create({
      data: {
        dealId: input.dealId,
        uploadedById: actor.id,
        documentType: input.documentType,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        byteSize: validated.byteSize,
        contentHash: validated.contentHash,
        storageObjectKey,
      },
    });
  } catch (cause) {
    await storage.remove([storageObjectKey]);
    throw cause;
  }
}

export async function getAuthorizedDocumentUrl(documentId: string) {
  const actor = await requireUser();
  await guards.requireDocumentAccess(actor.id, documentId);
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .createSignedUrl(document.storageObjectKey, 60);
  if (error || !data?.signedUrl)
    throw error ?? new Error("Unable to create signed URL.");
  return data.signedUrl;
}

export async function deleteUncommittedDocument(documentId: string) {
  const actor = await requireUser();
  await guards.requireDocumentAccess(actor.id, documentId);
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });
  if (document.status !== "PENDING")
    throw new Error("Only uncommitted documents may be deleted.");
  const { error } = await createSupabaseAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .remove([document.storageObjectKey]);
  if (error) throw error;
  await prisma.document.update({
    where: { id: documentId },
    data: { status: "DELETED" },
  });
}
