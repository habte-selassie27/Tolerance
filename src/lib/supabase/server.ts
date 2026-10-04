import "server-only";

import { createServerClient } from "@supabase/ssr";

import { currentRequestContext } from "../request-context";

/**
 * Resolves the caller's Supabase session from the ambient request. Session
 * refresh writes are recorded on the response by the request context, so no
 * route, loader, or domain module needs an HTTP object of its own.
 */
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase server configuration is missing.");
  }
  const store = currentRequestContext().cookies;
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(entries) {
        store.setAll(entries);
      },
    },
  });
}
