import { Router } from "express";

import { prisma } from "../../lib/prisma";
import { parseServerEnvironment } from "../../config/env";

export const healthRouter: Router = Router();

/** A deliberately narrow readiness signal: never return configuration values. */
healthRouter.get("/health", async (_request, response) => {
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
