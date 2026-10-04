import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { createJudgeV2SyntheticProofIntent } =
    await import("../src/server/judge-v2-synthetic-proof");
  const { prisma } = await import("../src/lib/prisma");
  const args = process.argv.slice(2);
  const sourceUrl = args.at(args.indexOf("--source-url") + 1);
  const expectedContentHash = args.includes("--expected-content-hash")
    ? args.at(args.indexOf("--expected-content-hash") + 1)
    : undefined;
  const expectedExtractHash = args.includes("--expected-extract-hash")
    ? args.at(args.indexOf("--expected-extract-hash") + 1)
    : undefined;
  const failureMode = args.includes("--failure")
    ? "EXPECTED_CONTENT_HASH_MISMATCH"
    : undefined;
  if (!sourceUrl || sourceUrl.startsWith("--"))
    throw new Error(
      "USAGE: --source-url <https URL> [--expected-content-hash <0x hash>] [--failure]",
    );
  const proof = await createJudgeV2SyntheticProofIntent({
    sourceUrl,
    ...(expectedContentHash
      ? { expectedContentHash: expectedContentHash as `0x${string}` }
      : {}),
    ...(expectedExtractHash
      ? { expectedExtractHash: expectedExtractHash as `0x${string}` }
      : {}),
    ...(failureMode ? { failureMode } : {}),
  });
  process.stdout.write(
    JSON.stringify({
      proofId: proof.id,
      caseId: proof.caseId,
      status: proof.status,
      sourcePolicyHash: proof.sourcePolicyHash,
    }) + "\n",
  );
  await prisma.$disconnect();
}

void main();
