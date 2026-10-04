import { AsyncLocalStorage } from "node:async_hooks";

export type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  priority?: "low" | "medium" | "high";
  sameSite?: "lax" | "none" | "strict" | boolean;
  secure?: boolean;
};

export type CookieEntry = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export type CookieStore = {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (entries: CookieEntry[]) => void;
};

export type AuthenticatedSubject = {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
};

export type RequestContext = {
  cookies: CookieStore;
  /**
   * Filled in by the session prefilter. The Supabase session is the authority
   * on whether an address is confirmed, which the mirrored database row cannot
   * express, so downstream routes read it from here instead of asking again.
   */
  auth?: AuthenticatedSubject;
};

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Binds the ambient request to the current async execution chain so that the
 * framework-agnostic domain modules can resolve the caller's session without
 * receiving an HTTP object or framework type as a parameter.
 */
export function runInRequestContext<T>(
  context: RequestContext,
  run: () => T,
): T {
  return storage.run(context, run);
}

export function currentRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error(
      "No request context is active. Session-aware modules must run inside an HTTP request.",
    );
  }
  return context;
}

/**
 * Records the verified Supabase subject for this request. Only the session
 * prefilter may call this, and only once the session has been resolved.
 */
export function setAuthenticatedSubject(subject: AuthenticatedSubject) {
  currentRequestContext().auth = subject;
}

export function currentAuthenticatedSubject(): AuthenticatedSubject | null {
  return storage.getStore()?.auth ?? null;
}
