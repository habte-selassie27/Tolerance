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
  const cookies = createExpressCookieStore(request, response);
  response.on("finish", () => cookies.flush());
  runInRequestContext({ cookies }, next);
};
