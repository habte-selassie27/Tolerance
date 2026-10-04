import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/**
 * Loads .env files with the precedence this project has always used:
 * `.env.<mode>.local` > `.env.<mode>` > `.env.local` > `.env`. Values already
 * present in the real environment always win, so a container or CI secret is
 * never shadowed by a checked-in file.
 */
export function loadEnvironmentFiles(
  cwd: string = process.cwd(),
  mode: string = process.env.NODE_ENV ?? "development",
) {
  const candidates = [
    ".env",
    ...(mode === "test" ? [] : [".env.local"]),
    ...(mode === "development" ? [] : [`.env.${mode}`]),
    `.env.${mode}.local`,
  ];
  for (const candidate of candidates) {
    let parsed: NodeJS.Dict<string>;
    try {
      parsed = parseEnv(readFileSync(join(cwd, candidate), "utf8"));
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
