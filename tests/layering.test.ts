import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(path)) found.push(path);
  }
  return found;
}

function importsOf(path: string) {
  return [...readFileSync(path, "utf8").matchAll(/from\s+"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

/** Resolves a relative specifier against the importing file. */
function resolveSpecifier(from: string, specifier: string) {
  if (!specifier.startsWith(".")) return null;
  const base = join(from, "..", specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ]) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

describe("layer boundaries", () => {
  it("keeps the browser bundle away from server-only modules", () => {
    const forbidden = [
      "src/server",
      "src/lib/prisma",
      "src/lib/supabase",
      "src/lib/request-context",
    ];
    const violations: string[] = [];
    for (const file of sourceFiles("src/client")) {
      for (const specifier of importsOf(file)) {
        const resolved = resolveSpecifier(file, specifier);
        if (!resolved) continue;
        const target = relative(".", resolved);
        if (forbidden.some((prefix) => target.startsWith(prefix)))
          violations.push(`${file} imports ${target}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the domain modules free of framework and transport concerns", () => {
    const violations: string[] = [];
    for (const file of sourceFiles("src/server")) {
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith("next") || specifier.startsWith("express"))
          violations.push(`${file} imports ${specifier}`);
        const resolved = resolveSpecifier(file, specifier);
        if (resolved && relative(".", resolved).startsWith("src/api"))
          violations.push(`${file} imports ${relative(".", resolved)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("resolves the Supabase session from the ambient request context", () => {
    const supabase = readFileSync("src/lib/supabase/server.ts", "utf8");
    expect(supabase).toContain("currentRequestContext");
    expect(supabase).not.toContain("next/headers");
  });

  it("serves an unclassified failure as a generic message", () => {
    const errors = readFileSync("src/api/errors.ts", "utf8");
    expect(errors).toContain("Tolerance could not complete that request.");
    const unclassified = errors.slice(errors.indexOf("console.error"));
    expect(unclassified).not.toContain("error.message");
  });
});
