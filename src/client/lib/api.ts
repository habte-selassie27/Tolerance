export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type ApiFailure = { code: string; message: string };

async function toRequestError(response: Response) {
  let failure: ApiFailure = {
    code: "REQUEST_FAILED",
    message: "Tolerance could not complete that request.",
  };
  try {
    const body = (await response.json()) as Partial<ApiFailure>;
    if (typeof body?.message === "string") {
      failure = {
        code: typeof body.code === "string" ? body.code : failure.code,
        message: body.message,
      };
    }
  } catch {
    // A non-JSON error body carries no actionable detail for the browser.
  }
  return new ApiRequestError(response.status, failure.code, failure.message);
}

/**
 * Every loader and action in this application reads and writes through the
 * Tolerance API. `credentials: "same-origin"` keeps the Supabase session cookie
 * attached without widening the cookie's scope to third-party requests.
 */
export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw await toRequestError(response);
  return (await response.json()) as T;
}

export function apiLoad<T>(path: string) {
  return apiRequest<T>(path);
}

export function apiSend<T>(path: string, method: string, body?: unknown) {
  return apiRequest<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Reads a JSON request body through the schema that guards it. */
export function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Actions must not let a rejected request escape as an unhandled error, because
 * that would replace the rendered route with the error boundary. Failures are
 * returned so the caller can surface the API's deliberate copy.
 */
export async function submit<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<
  { ok: true; data: T } | { ok: false; message: string; status: number }
> {
  try {
    return { ok: true, data: await apiRequest<T>(path, init) };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error, fallback),
      status: error instanceof ApiRequestError ? error.status : 500,
    };
  }
}

export function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
