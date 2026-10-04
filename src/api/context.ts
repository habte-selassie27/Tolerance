import type { NextFunction, Request, RequestHandler, Response } from "express";

import { runInRequestContext } from "../lib/request-context";
import { createExpressCookieStore } from "./cookies";

/**
 * Binds the request's cookie surface to the async execution chain and commits
 * any session refresh the handler performed.
 */
export const requestContext: RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  // The store commits buffered session cookies just before the body is
  // written; see createExpressCookieStore for why that is not a `finish` hook.
  const cookies = createExpressCookieStore(request, response);
  runInRequestContext({ cookies }, next);
};
