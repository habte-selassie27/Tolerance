import type { Request, Response } from "express";

import type { CookieEntry, CookieStore } from "../lib/request-context";

type SupabaseCookie = {
  name: string;
  value: string;
  options?: CookieEntry["options"];
};

/**
 * Bridges Supabase's cookie adapter onto the Express request/response pair.
 *
 * Session refresh writes are buffered rather than applied immediately, because
 * the auth library can decide to write a cookie at any point during the
 * handler. They are committed just before the response body is written: on
 * `finish` the headers have already gone, and calling `res.cookie` there throws
 * `ERR_HTTP_HEADERS_SENT`, which from an event handler takes the process down.
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
      if (pending.size === 0) return;
      const entries = [...pending.values()];
      pending.clear();
      // Once the headers are out there is nothing to attach a cookie to.
      // Dropping is the only correct option; throwing here would abort the
      // process rather than fail one request.
      if (response.headersSent || response.writableEnded) return;
      for (const { name, value, options } of entries) {
        try {
          response.cookie(name, value, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            ...options,
          });
        } catch {
          return;
        }
      }
    },
  };

  const end = response.end.bind(response);
  response.end = ((...args: Parameters<Response["end"]>) => {
    store.flush();
    return end(...args);
  }) as Response["end"];
  response.on("close", () => pending.clear());

  return store;
}