import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { guards } from "./auth";
import { EVIDENCE_BUCKET } from "./evidence-storage";
import {
  EXTRACTOR_VERSION,
  hashSourceBlock,
  normalizeSourceText,
} from "./evidence-provenance";

export async function extractPrivatePdf(documentId: string, actorId: string) {
  await guards.requireDocumentAccess(actorId, documentId);
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
  });
  if (document.mimeType !== "application/pdf")
    return fail(documentId, "UNSUPPORTED_DOCUMENT_TYPE");
  if (document.status === "EXTRACTING")
    throw new Error("EXTRACTION_ALREADY_RUNNING");
  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: "EXTRACTING",
      extractionStartedAt: new Date(),
      processingError: null,
    },
  });
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(EVIDENCE_BUCKET)
    .download(document.storageObjectKey);
  if (error || !data) return fail(documentId, "PERSISTENCE_FAILED");
  const bytes = new Uint8Array(await data.arrayBuffer());
  const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (actual !== document.contentHash)
    return fail(documentId, "FILE_INTEGRITY_MISMATCH");
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
    }).promise;
    const blocks: {
      pageNumber: number;
      blockOrder: number;
      normalizedText: string;
      sourceLocator: string;
      contentHash: string;
    }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = normalizeSourceText(
        content.items
          .map((x) => (isTextItem(x) ? x.str : ""))
          .filter(Boolean)
          .join(" "),
      );
      if (text) {
        const locator = `page:${i}:block:1`;
        blocks.push({
          pageNumber: i,
          blockOrder: blocks.length + 1,
          normalizedText: text,
          sourceLocator: locator,
          contentHash: hashSourceBlock({
            documentContentHash: document.contentHash,
            pageNumber: i,
            blockOrder: blocks.length + 1,
            sourceLocator: locator,
            normalizedText: text,
            extractorVersion: EXTRACTOR_VERSION,
          }),
        });
      }
    }
    if (!blocks.length) return fail(documentId, "OCR_REQUIRED", "OCR_REQUIRED");
    await prisma.$transaction([
      prisma.sourceBlock.deleteMany({
        where: { documentId, extractionVersion: EXTRACTOR_VERSION },
      }),
      prisma.sourceBlock.createMany({
        data: blocks.map((b) => ({
          ...b,
          documentId,
          extractionVersion: EXTRACTOR_VERSION,
        })),
      }),
      prisma.document.update({
        where: { id: documentId },
        data: {
          status: "EXTRACTED",
          pageCount: pdf.numPages,
          extractorVersion: EXTRACTOR_VERSION,
          extractionCompletedAt: new Date(),
          processingError: null,
        },
      }),
    ]);
    return blocks;
  } catch {
    return fail(documentId, "PDF_PARSE_FAILED");
  }
}

function isTextItem(value: unknown): value is { str: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof (value as { str?: unknown }).str === "string"
  );
}
async function fail(
  id: string,
  code: string,
  status: "FAILED" | "OCR_REQUIRED" = "FAILED",
) {
  await prisma.document.update({
    where: { id },
    data: { status, processingError: code },
  });
  return [];
}
export async function getDocumentSourceBlocks(
  documentId: string,
  actorId: string,
) {
  await guards.requireDocumentAccess(actorId, documentId);
  return prisma.sourceBlock.findMany({
    where: { documentId },
    orderBy: [{ pageNumber: "asc" }, { blockOrder: "asc" }],
  });
}
