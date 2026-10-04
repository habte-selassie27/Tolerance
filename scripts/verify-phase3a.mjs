import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const bucketId = "tolerance-private-evidence";
const prisma = new PrismaClient();

try {
  await prisma.$queryRawUnsafe("SELECT 1");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new Error("Server-only Supabase configuration is missing.");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const listed = await fetch(`${url}/storage/v1/bucket`, { headers });
  if (!listed.ok) throw new Error("Unable to list Supabase storage buckets.");
  const buckets = await listed.json();
  let bucket = buckets.find((candidate) => candidate.id === bucketId);
  if (!bucket) {
    const created = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: bucketId,
        name: bucketId,
        public: false,
        file_size_limit: 26_214_400,
      }),
    });
    if (!created.ok)
      throw new Error("Unable to create the private evidence bucket.");
    bucket = await created.json();
  }
  if (bucket.public !== false) {
    const updated = await fetch(`${url}/storage/v1/bucket/${bucketId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ public: false, file_size_limit: 26_214_400 }),
    });
    if (!updated.ok)
      throw new Error("Unable to enforce private evidence bucket settings.");
    const verified = await fetch(`${url}/storage/v1/bucket`, { headers });
    if (!verified.ok) throw new Error("Unable to verify the evidence bucket.");
    bucket = (await verified.json()).find(
      (candidate) => candidate.id === bucketId,
    );
  }
  if (!bucket || bucket.public !== false) {
    throw new Error("Evidence bucket must be private.");
  }
  console.log(
    "Phase 3A database connectivity and private evidence bucket verified.",
  );
} finally {
  await prisma.$disconnect();
}
