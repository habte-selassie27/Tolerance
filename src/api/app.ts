import { join, resolve } from "node:path";

import cookieParser from "cookie-parser";
import express, { Router } from "express";

import { parseServerEnvironment } from "../config/env";
import { prisma } from "../lib/prisma";
import { requestContext } from "./context";
import { apiErrorHandler, notFoundHandler } from "./errors";
import { accountRouter } from "./routes/account";
import { authRouter } from "./routes/auth";
import { commercialRouter } from "./routes/commercial";
import { disputesRouter } from "./routes/disputes";
import { evidenceRouter } from "./routes/evidence";
import { invitationsRouter } from "./routes/invitations";
import { workspaceRouter } from "./routes/workspace";

const publicDirectory = resolve(process.cwd(), "dist/client");

/**
 * The public origin this deployment is reachable at. Used to build absolute
 * Supabase redirect and counterparty invitation links.
 */
export function appOrigin() {
  return (process.env.TOLERANCE_APP_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Only same-origin relative paths are accepted as post-authentication targets. */
export function safeNextPath(
  candidate: string | null | undefined,
  fallback: string,
) {
  const next = candidate ?? "";
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function createApiRouter(): Router {
  const api = Router();
  api.use(requestContext);
  api.use(cookieParser());

  /** A deliberately narrow readiness signal: never return configuration values. */
  api.get("/health", async (_request, response) => {
    try {
      parseServerEnvironment(process.env);
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: "ready", database: "reachable" });
    } catch {
      response.status(503).json({
        status: "not_ready",
        database: "unavailable_or_misconfigured",
      });
    }
  });

  api.use(authRouter);
  api.use(invitationsRouter);

  // Every route below the public routers carries its own session prefilter so
  // that an unmatched path still reaches the JSON 404. Authorization against
  // organization membership stays in the individual handlers.
  api.use(workspaceRouter);
  api.use(commercialRouter);
  api.use(evidenceRouter);
  api.use(disputesRouter);
  api.use(accountRouter);

  api.use(notFoundHandler);
  return api;
}

/**
 * Vite fingerprints everything under /assets, so those responses are immutable.
 * The remaining files (index.html, icon.svg) must stay revalidated so a deploy
 * is picked up without a hard refresh.
 */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  // Behind a reverse proxy the client scheme must survive for cookie security
  // and for absolute invitation links.
  app.set("trust proxy", true);
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", createApiRouter());
  app.use(
    "/assets",
    express.static(join(publicDirectory, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  app.use(express.static(publicDirectory, { index: false, maxAge: "1h" }));
  app.get("/{*splat}", (_request, response) => {
    response.sendFile(join(publicDirectory, "index.html"));
  });
  app.use(apiErrorHandler);
  return app;
}
