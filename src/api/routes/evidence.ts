import { Router, raw } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { evaluateObligation } from "../../server/ai-evaluation";
import { requireUser } from "../../server/auth";
import { publishEvidenceRoot } from "../../server/evidence-bundle";
import {
  ensurePrivateEvidenceBucket,
  putPrivateDocument,
} from "../../server/evidence-storage";
import {
  extractPrivatePdf,
  getDocumentSourceBlocks,
} from "../../server/pdf-extraction";
import {
  attachRequirementSourceBlock,
  createRequirement,
  registerEvidence,
} from "../../server/provenance-services";
import { ApiError, notFound, routeParam } from "../errors";
import { requireDealAccess, requireSession } from "../workspace";

export const evidenceRouter: Router = Router();

const requirementSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(4000),
  category: z.string().trim().min(1).max(120),
  governingSourceRef: z.string().trim().min(1).max(400),
  acceptanceCriteria: z.string().trim().min(1).max(4000),
  evidenceExpectations: z.string().trim().min(1).max(4000),
  ordering: z.number().int().min(0).max(9999),
  required: z.boolean().default(true),
  requirementKey: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,80}$/, "That requirement code is not valid.")
    .optional(),
});

const sourceBlockLinkSchema = z.object({
  sourceBlockId: z.uuid(),
  precedence: z.number().int().min(0).max(9999).default(0),
});

const uploadSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (value) =>
        !value.includes("/") &&
        !value.includes("\\") &&
        [...value].every((char) => {
          const code = char.codePointAt(0) ?? 0;
          return code >= 32 && code !== 127;
        }),
      "That file name is not allowed.",
    ),
  documentType: z.enum([
    "AGREEMENT",
    "AMENDMENT",
    "TECHNICAL_SPECIFICATION",
    "INSPECTION_REPORT",
    "SHIPMENT_EVIDENCE",
    "OTHER_EVIDENCE",
  ]),
});

const evidenceSchema = z.object({
  sourceBlockId: z.uuid(),
  requirementId: z.uuid().optional(),
});

const evaluationSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

async function requireObligation(obligationId: string) {
  const obligation = await prisma.obligation.findUnique({
    where: { id: obligationId },
    select: { id: true },
  });
  if (!obligation) throw notFound("That obligation was not found.");
}

async function nextRequirementKey(obligationId: string) {
  const taken = await prisma.requirement.findMany({
    where: { obligationId },
    select: { requirementKey: true },
  });
  const used = new Set(taken.map((item) => item.requirementKey));
  for (let index = 1; index <= taken.length + 100; index += 1) {
    const candidate = `R-${String(index).padStart(3, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new ApiError(
    409,
    "No requirement code is free on this obligation.",
    "REQUIREMENT_CODE_EXHAUSTED",
  );
}

evidenceRouter.post(
  "/obligations/:obligationId/requirements",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const obligationId = routeParam(request, "obligationId");
    await requireObligation(obligationId);
    const input = requirementSchema.parse(request.body);
    if (input.requirementKey) {
      const existing = await prisma.requirement.findFirst({
        where: { obligationId, requirementKey: input.requirementKey },
        select: { id: true },
      });
      if (existing)
        throw new ApiError(
          409,
          "That requirement code is already in use.",
          "REQUIREMENT_CODE_TAKEN",
        );
    }
    const requirement = await createRequirement(actor.id, {
      ...input,
      obligationId,
      requirementKey:
        input.requirementKey ?? (await nextRequirementKey(obligationId)),
    });
    response.status(201).json({
      ok: true,
      requirement: {
        id: requirement.id,
        requirementKey: requirement.requirementKey,
        title: requirement.title,
        ordering: requirement.ordering,
        required: requirement.required,
      },
    });
  },
);

evidenceRouter.post(
  "/requirements/:requirementId/source-blocks",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const requirementId = routeParam(request, "requirementId");
    const input = sourceBlockLinkSchema.parse(request.body);
    const requirement = await prisma.requirement.findUnique({
      where: { id: requirementId },
      select: { id: true },
    });
    if (!requirement) throw notFound("That requirement was not found.");
    const block = await prisma.sourceBlock.findUnique({
      where: { id: input.sourceBlockId },
      select: { id: true },
    });
    if (!block) throw notFound("That source block was not found.");
    const link = await attachRequirementSourceBlock(
      actor.id,
      requirementId,
      input.sourceBlockId,
      input.precedence,
    );
    response.json({ ok: true, precedence: link.precedence });
  },
);

evidenceRouter.post(
  "/deals/:dealId/documents",
  requireSession,
  raw({ type: ["application/pdf", "text/plain"], limit: "12mb" }),
  async (request, response) => {
    const dealId = routeParam(request, "dealId");
    await requireDealAccess(dealId);
    const input = uploadSchema.parse({
      filename: request.query.filename,
      documentType: request.query.documentType,
    });
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0)
      throw new ApiError(400, "Attach a file to upload.", "EMPTY_UPLOAD");
    await ensurePrivateEvidenceBucket();
    const document = await putPrivateDocument({
      dealId,
      documentType: input.documentType,
      originalFilename: input.filename,
      mimeType: String(request.headers["content-type"] ?? ""),
      bytes: new Uint8Array(body),
    });
    response.status(201).json({
      ok: true,
      documentId: document.id,
      status: document.status,
      contentHash: document.contentHash,
      byteSize: document.byteSize,
    });
  },
);

evidenceRouter.get(
  "/documents/:documentId/source-blocks",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const blocks = await getDocumentSourceBlocks(
      routeParam(request, "documentId"),
      actor.id,
    );
    response.json({
      blocks: blocks.map((block) => ({
        id: block.id,
        pageNumber: block.pageNumber,
        blockOrder: block.blockOrder,
        sourceLocator: block.sourceLocator,
        normalizedText: block.normalizedText,
        contentHash: block.contentHash,
      })),
    });
  },
);

evidenceRouter.post(
  "/documents/:documentId/extract",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const documentId = routeParam(request, "documentId");
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { status: true, processingError: true },
    });
    if (!document) throw notFound("That document was not found.");
    if (document.status === "EXTRACTING")
      throw new ApiError(
        409,
        "That document is still being read.",
        "EXTRACTION_ALREADY_RUNNING",
      );
    const blocks = await extractPrivatePdf(documentId, actor.id);
    if (blocks.length) {
      response.json({ ok: true, documentId, blockCount: blocks.length });
      return;
    }
    const failed = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: { status: true, processingError: true },
    });
    const copy: Record<string, string> = {
      OCR_REQUIRED:
        "That document needs OCR before its text can be cited as a source.",
      UNSUPPORTED_DOCUMENT_TYPE: "Only PDF documents can be read as sources.",
      FILE_INTEGRITY_MISMATCH:
        "That document no longer matches the copy that was stored.",
      PERSISTENCE_FAILED: "That document could not be read from storage.",
      PDF_PARSE_FAILED: "That document could not be read.",
    };
    throw new ApiError(
      409,
      copy[failed.processingError ?? ""] ?? "That document could not be read.",
      failed.processingError ?? "EXTRACTION_FAILED",
    );
  },
);

evidenceRouter.post(
  "/obligations/:obligationId/evidence",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const obligationId = routeParam(request, "obligationId");
    await requireObligation(obligationId);
    const input = evidenceSchema.parse(request.body);
    const evidence = await registerEvidence(actor.id, {
      obligationId,
      sourceBlockId: input.sourceBlockId,
      requirementId: input.requirementId,
    });
    response.status(201).json({
      ok: true,
      evidenceId: evidence.id,
      contentHash: evidence.contentHash,
      sourceBlockId: evidence.sourceBlockId,
      authorityLevel: evidence.authorityLevel,
    });
  },
);

evidenceRouter.post(
  "/obligations/:obligationId/evidence-root",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const obligationId = routeParam(request, "obligationId");
    await requireObligation(obligationId);
    const published = await publishEvidenceRoot(actor.id, obligationId);
    response.json({ ok: true, ...published });
  },
);

evidenceRouter.post(
  "/obligations/:obligationId/evaluation",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const obligationId = routeParam(request, "obligationId");
    await requireObligation(obligationId);
    const input = evaluationSchema.parse(request.body ?? {});
    const result = await evaluateObligation(actor.id, obligationId, {
      idempotencyKey: input.idempotencyKey,
    });
    const evaluation = result.snapshot.evaluation as {
      requirements?: unknown[];
    };
    response.json({
      ok: true,
      reused: result.reused,
      runId: result.run.id,
      status: result.run.status,
      snapshotId: result.snapshot.id,
      requirements: evaluation.requirements ?? [],
    });
  },
);
