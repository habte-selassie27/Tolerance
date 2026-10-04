import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { protocolConfig } from "../src/config/protocol";
import {
  CliGenLayerCaseSubmitter,
  GenLayerSubmissionError,
  JsonRpcGenLayerStatusClient,
  packetTransportMetadata,
} from "../src/server/genlayer-submission";

const hash = `0x${"a".repeat(64)}`;
let base: string | undefined;

afterEach(async () => {
  if (base) await rm(base, { recursive: true, force: true });
  base = undefined;
});

describe("Phase 3C2 GenLayer submission boundaries", () => {
  it("uses one isolated deploy script with exact raw packet string and cleans it", async () => {
    base = await mkdtemp(join(tmpdir(), "tolerance-genlayer-"));
    const packet = '{"a":"exact raw packet"}';
    const runner = vi.fn(async (_command, args, options) => {
      expect(args).toEqual(["deploy"]);
      const deploy = join(options.cwd, "deploy");
      expect(await readdir(deploy)).toEqual(["001_submit_case.ts"]);
      const script = await (
        await import("node:fs/promises")
      ).readFile(join(deploy, "001_submit_case.ts"), "utf8");
      expect(script).toContain('functionName: "submit_case"');
      expect(script).toContain(JSON.stringify(packet));
      expect(script).toContain(protocolConfig.genLayer.judge);
      expect(script).not.toContain("privateKey");
      return { stdout: JSON.stringify({ transactionHash: hash }), stderr: "" };
    });
    const submitter = new CliGenLayerCaseSubmitter("genlayer", base, runner);
    await expect(
      submitter.submitCase({
        judge: protocolConfig.genLayer.judge,
        canonicalPacket: packet,
      }),
    ).resolves.toEqual({ transactionHash: hash });
    expect(await readdir(base)).toEqual([]);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("preserves a large V2 packet byte-for-byte through the worker script", async () => {
    base = await mkdtemp(join(tmpdir(), "tolerance-genlayer-"));
    const packet = JSON.stringify({
      disputePacketHash: hash,
      sourceReference:
        "https://example.invalid/synthetic/" + "x".repeat(96_000),
      nested: { quote: '"', slash: "\\\\", utf8: "50.10 mm — SYNTHETIC" },
    });
    const metadata = packetTransportMetadata(packet);
    expect(metadata.packetByteLength).toBe(Buffer.byteLength(packet, "utf8"));
    expect(metadata.disputePacketHash).toBe(hash);
    const runner = vi.fn(async (_command, _args, options) => {
      const script = await (
        await import("node:fs/promises")
      ).readFile(join(options.cwd, "deploy", "001_submit_case.ts"), "utf8");
      const literal = script.match(/const canonicalPacket = (.*);\n/)?.[1];
      expect(literal).toBeDefined();
      expect(JSON.parse(literal!)).toBe(packet);
      return { stdout: JSON.stringify({ transactionHash: hash }), stderr: "" };
    });
    const submitter = new CliGenLayerCaseSubmitter("genlayer", base, runner);
    await expect(
      submitter.submitCase({
        judge: "0x01e95c90d1108695f81f939513E9a4814c1A688D",
        canonicalPacket: packet,
        protocolVersion: "V2",
        purpose: "JUDGEV2_SYNTHETIC_PROOF",
      }),
    ).resolves.toEqual({ transactionHash: hash });
  });

  it("rejects V2 commercial and V1 synthetic targets before send", async () => {
    base = await mkdtemp(join(tmpdir(), "tolerance-genlayer-"));
    const submitter = new CliGenLayerCaseSubmitter("genlayer", base);
    await expect(
      submitter.submitCase({
        judge: "0x01e95c90d1108695f81f939513E9a4814c1A688D",
        canonicalPacket: "{}",
        protocolVersion: "V2",
      }),
    ).rejects.toMatchObject({
      code: "PROTOCOL_V2_NOT_DEPLOYED",
      mayHaveBeenSent: false,
    });
    await expect(
      submitter.submitCase({
        judge: protocolConfig.genLayer.judge,
        canonicalPacket: "{}",
        protocolVersion: "V1",
        purpose: "JUDGEV2_SYNTHETIC_PROOF",
      }),
    ).rejects.toMatchObject({
      code: "SYNTHETIC_PROOF_REQUIRES_V2",
      mayHaveBeenSent: false,
    });
  });

  it.each([
    ["{}", "MALFORMED_EXECUTOR_OUTPUT"],
    ["not-json", "MALFORMED_EXECUTOR_OUTPUT"],
    [JSON.stringify({ transactionHash: "0x1" }), "MALFORMED_EXECUTOR_OUTPUT"],
  ])("rejects malformed executor output", async (stdout, code) => {
    base = await mkdtemp(join(tmpdir(), "tolerance-genlayer-"));
    const submitter = new CliGenLayerCaseSubmitter(
      "genlayer",
      base,
      async () => ({ stdout, stderr: "" }),
    );
    await expect(
      submitter.submitCase({
        judge: protocolConfig.genLayer.judge,
        canonicalPacket: "{}",
      }),
    ).rejects.toMatchObject({ code, mayHaveBeenSent: true });
  });

  it("classifies pre-send setup failures separately from possible sends", async () => {
    base = await mkdtemp(join(tmpdir(), "tolerance-genlayer-"));
    const preSend = new CliGenLayerCaseSubmitter("genlayer", base, async () => {
      throw new Error("spawn unavailable");
    });
    await expect(
      preSend.submitCase({
        judge: protocolConfig.genLayer.judge,
        canonicalPacket: "{}",
      }),
    ).rejects.toMatchObject({
      code: "GENLAYER_EXECUTOR_PRE_SEND_FAILED",
      mayHaveBeenSent: false,
    });
    const wrongJudge = new CliGenLayerCaseSubmitter("genlayer", base);
    await expect(
      wrongJudge.submitCase({
        judge: "0x1111111111111111111111111111111111111111",
        canonicalPacket: "{}",
      }),
    ).rejects.toMatchObject({
      code: "WRONG_CONFIGURED_JUDGE",
      mayHaveBeenSent: false,
    });
  });

  it.each([
    "PENDING",
    "PROPOSING",
    "COMMITTING",
    "REVEALING",
    "ACCEPTED",
    "FINALIZED",
    "UNDETERMINED",
  ])("uses only gen_getTransactionStatus for %s", async (status) => {
    const fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.method).toBe("gen_getTransactionStatus");
      expect(body.params).toEqual([hash]);
      return new Response(
        JSON.stringify({ result: { status, statusCode: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const client = new JsonRpcGenLayerStatusClient(
      "https://example.invalid",
      fetcher,
    );
    await expect(client.getTransactionStatus(hash)).resolves.toMatchObject({
      status,
    });
  });

  it("accepts the current Studionet string-only status response", async () => {
    const client = new JsonRpcGenLayerStatusClient(
      "https://example.invalid",
      async () =>
        new Response(JSON.stringify({ result: "FINALIZED" }), {
          status: 200,
        }) as unknown as Response,
    );
    await expect(client.getTransactionStatus(hash)).resolves.toEqual({
      status: "FINALIZED",
      statusCode: 0,
    });
  });

  it("fails closed for status transport and malformed lifecycle responses", async () => {
    const unavailable = new JsonRpcGenLayerStatusClient(
      "https://example.invalid",
      async () => {
        throw new Error("network");
      },
    );
    await expect(unavailable.getTransactionStatus(hash)).rejects.toMatchObject({
      code: "GENLAYER_STATUS_UNAVAILABLE",
    });
    const malformed = new JsonRpcGenLayerStatusClient(
      "https://example.invalid",
      async () => new Response("{}", { status: 200 }),
    );
    await expect(malformed.getTransactionStatus(hash)).rejects.toMatchObject({
      code: "MALFORMED_GENLAYER_STATUS",
    });
    const unknown = new JsonRpcGenLayerStatusClient(
      "https://example.invalid",
      async () =>
        new Response(
          JSON.stringify({ result: { status: "SURPRISE", statusCode: 99 } }),
          { status: 200 },
        ),
    );
    await expect(unknown.getTransactionStatus(hash)).rejects.toMatchObject({
      code: "UNKNOWN_GENLAYER_STATUS",
    });
  });

  it("does not expose error internals through the submission error shape", () => {
    const error = new GenLayerSubmissionError("SAFE_CODE", true);
    expect(Object.keys(error)).toEqual(["code", "mayHaveBeenSent"]);
  });
});
