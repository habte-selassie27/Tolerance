# Phase 3B1A — Private PDF Extraction

PDF.js (`pdfjs-dist` 6.2.108) runs only in server modules. The private object is downloaded through the server-only Supabase admin boundary, and SHA-256 is recomputed before parsing. A mismatch fails closed as `FILE_INTEGRITY_MISMATCH`.

Documents progress through `READY_FOR_EXTRACTION`, `EXTRACTING`, `EXTRACTED`, `FAILED`, or `OCR_REQUIRED`; timestamps, extractor version, and a small deterministic failure code are retained. PDF.js is queried page-by-page with 1-based provenance. Native-text-empty PDFs are `OCR_REQUIRED`; OCR is deliberately not included.

`normalizeSourceText` only normalizes line endings and non-semantic whitespace. `SourceBlockHashV1` is SHA-256 over UTF-8 lines: `ToleranceSourceBlockV1`, document content hash, page, block order, locator, extractor version, and normalized text. The persistence transaction replaces only the same extractor-version block set then marks the document extracted, making retries idempotent.

All extraction and SourceBlock reads require Phase 3A document authorization. No signed URL is persisted. This checkpoint excludes requirements workflows, evidence mapping/bundles, OCR, LLMs, GenLayer submission, and automatic attestation.

## Phase 3B1B entry

Add governing-source and evidence-mapping operations only after retaining this immutable source provenance boundary.
