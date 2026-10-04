import type { Request, Response } from "express";

import type { CookieEntry, CookieStore } from "../lib/request-context";

type SupabaseCookie = {
  name: string;
  value: string;
  options?: CookieEntry["options"];
};

/**
 * Bridges Supabase's cookie adapter onto the Express request/response pair.
 * Session refresh writes are buffered and flushed after the handler settles so
 * that an error response cannot leave a partially written session behind.
 */
export function createExpressCookieStore(
  request: Request,
  response: Response,
): CookieStore & { flush: () => void } {
  const pending = new Map<string, CookieEntry>();

  const store: CookieStore & { flush: () => void } = {
    get(name) {
      const value = (request.cookies as Record<string, string>)[name];
      return typeof value === "undefined" ? null : { name, value };
    },
    getAll() {
      return Object.entries(request.cookies as Record<string, string>).map(
        ([name, value]) => ({ name, value }),
      );
    },
    setAll(entries) {
      for (const entry of entries as SupabaseCookie[]) {
        pending.set(entry.name, entry);
      }
    },
    flush() {
      for (const { name, value, options } of pending.values()) {
        response.cookie(name, value, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          ...options,
        });
      }
      pending.clear();
    },
  };

  return store;
}
