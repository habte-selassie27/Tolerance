/**
 * The development ports live here so the Vite proxy and the API entry cannot
 * disagree about them. Vite takes 3000 for the client, so the API defaults to
 * 3001; a single source of truth stops the proxy 502-ing when PORT is unset.
 */
export const DEFAULT_API_PORT = 3001;
export const DEFAULT_WEB_PORT = 3000;