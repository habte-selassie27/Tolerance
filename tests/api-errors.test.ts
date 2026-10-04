import { describe, expect, it } from "vitest";

import { apiErrorHandler } from "../src/api/errors";
import { EvaluationProviderError } from "../src/server/ai-evaluation";
import { EvaluationValidationError } from "../src/server/evaluation-context";
import { EvidenceBundleError } from "../src/server/evidence-bundle";
import { GenLayerSubmissionError } from "../src/server/genlayer-submission";
import { ProvenanceError } from "../src/server/provenance-services";

type Recorded = { status: number; body: { code: string; message: string } };

function surface(error: unknown): Recorded {
  let status = 0;
  let body: Recorded["body"] = { code: "", message: "" };
  const response = {
    headersSent: false,
    setHeader() {
      return response;
    },
    status(code: number) {
      status = code;
      return response;
    },
    json(payload: Recorded["body"]) {
      body = payload;
      return response;
    },
  };
  apiErrorHandler(
    error,
    {} as never,
    response as never,
    (() => undefined) as never,
  );
  return { status, body };
}

describe("api error classification", () => {
  it("maps a corrected provenance request to a caller error", () => {
    expect(
      surface(new ProvenanceError("Cross-deal source mapping rejected")),
    ).toEqual({
      status: 400,
      body: {
        code: "INVALID_REQUEST",
        message: "Cross-deal source mapping rejected",
      },
    });
  });

  it("maps bundle prerequisites to a state conflict carrying the code", () => {
    expect(
      surface(new EvidenceBundleError("OBLIGATION_BINDING_MISSING")),
    ).toEqual({
      status: 409,
      body: {
        code: "OBLIGATION_BINDING_MISSING",
        message: "OBLIGATION_BINDING_MISSING",
      },
    });
  });

  it("rejects an evaluation the validator refused", () => {
    expect(
      surface(new EvaluationValidationError("CITATION_OUTSIDE_CONTEXT")),
    ).toEqual({
      status: 400,
      body: {
        code: "EVALUATION_REJECTED",
        message: "CITATION_OUTSIDE_CONTEXT",
      },
    });
  });

  it("distinguishes a retryable provider outage from a provider failure", () => {
    expect(
      surface(new EvaluationProviderError("PROVIDER_TRANSIENT")),
    ).toMatchObject({
      status: 503,
      body: { code: "PROVIDER_UNAVAILABLE" },
    });
    expect(
      surface(new EvaluationProviderError("PROVIDER_FATAL", "internal detail")),
    ).toEqual({
      status: 502,
      body: {
        code: "PROVIDER_FAILED",
        message: "The evaluation service returned an unusable result.",
      },
    });
  });

  it("keeps a GenLayer status outage retryable without reopening a send", () => {
    expect(
      surface(
        new GenLayerSubmissionError("GENLAYER_STATUS_UNAVAILABLE", false),
      ),
    ).toMatchObject({
      status: 503,
      body: { code: "GENLAYER_STATUS_UNAVAILABLE" },
    });
    expect(
      surface(
        new GenLayerSubmissionError("GENLAYER_CLI_EXECUTION_FAILED", true),
      ),
    ).toEqual({
      status: 409,
      body: {
        code: "GENLAYER_CLI_EXECUTION_FAILED",
        message: "GENLAYER_CLI_EXECUTION_FAILED",
      },
    });
  });

  it("reports an oversized body without accepting it", () => {
    expect(surface({ type: "entity.too.large" })).toEqual({
      status: 413,
      body: {
        code: "PAYLOAD_TOO_LARGE",
        message: "That request is larger than the allowed size.",
      },
    });
  });

  it("serves an unclassified failure as a generic message", () => {
    expect(surface(new Error("database password is hunter2"))).toEqual({
      status: 500,
      body: {
        code: "INTERNAL_ERROR",
        message: "Tolerance could not complete that request.",
      },
    });
  });
});
