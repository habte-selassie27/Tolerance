import { createClient } from "@supabase/supabase-js";

/**
 * The browser-side Supabase client, used only where a flow has to run in the
 * user's wallet or tab rather than on the server. Sign-in with a wallet
 * extension cannot be proxied through the API because the signature challenge
 * happens against `window.ethereum`.
 *
 * It reads the same public configuration the rest of the browser bundle uses.
 */
export function createBrowserSupabaseClient() {
  const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase browser configuration is missing.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}