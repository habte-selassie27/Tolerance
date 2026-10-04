import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  hashSourceBlock,
  normalizeSourceText,
  EXTRACTOR_VERSION,
} from "../src/server/evidence-provenance";

async function fixture(pages: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = pdf.addPage();
    page.drawText(text, { x: 40, y: 760, font, size: 12 });
  }
  return new Uint8Array(await pdf.save());
}
async function extract(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes, useWorkerFetch: false });
  const pdf = await loadingTask.promise;
  const pages = [] as { page: number; text: string }[];
  for (let page = 1; page <= pdf.numPages; page++) {
    const c = await (await pdf.getPage(page)).getTextContent();
    pages.push({
      page,
      text: normalizeSourceText(
        c.items.map((x) => (isTextItem(x) ? x.str : "")).join(" "),
      ),
    });
  }
  await loadingTask.destroy();
  return pages;
}
function isTextItem(value: unknown): value is { str: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "str" in value &&
    typeof (value as { str?: unknown }).str === "string"
  );
}
describe("PDF.js private extraction primitives", () => {
  it("preserves real page provenance and commercial values", async () => {
    const pages = await extract(
      await fixture([
        "Purchase Agreement\nMaterial: Stainless Steel 316L",
        "Dimensional tolerance: ±0.25 mm\nInspection certificate required",
      ]),
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ page: 1 });
    expect(pages[0].text).toContain("316L");
    expect(pages[1]).toMatchObject({ page: 2 });
    expect(pages[1].text).toContain("±0.25 mm");
    expect(pages[1].text).toContain("Inspection certificate");
  }, 15_000);
  it("has a stable SourceBlockHashV1", () => {
    const input = {
      documentContentHash: "sha256:abc",
      pageNumber: 2,
      blockOrder: 1,
      sourceLocator: "page:2:block:1",
      normalizedText: "Diameter 50.00 mm ±0.25 mm",
      extractorVersion: EXTRACTOR_VERSION,
    };
    const hash = hashSourceBlock(input);
    expect(hash).toBe(hashSourceBlock(input));
    expect(hash).toBe(
      "sha256:" +
        createHash("sha256")
          .update(
            [
              "ToleranceSourceBlockV1",
              "sha256:abc",
              "2",
              "1",
              "page:2:block:1",
              EXTRACTOR_VERSION,
              "Diameter 50.00 mm ±0.25 mm",
            ].join("\n"),
            "utf8",
          )
          .digest("hex"),
    );
    expect(hash).not.toBe(hashSourceBlock({ ...input, pageNumber: 1 }));
  });
  it("recognizes a native-text-empty PDF for OCR_REQUIRED", async () => {
    expect((await extract(await fixture([""])))[0].text).toBe("");
  });
});
