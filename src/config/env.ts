import { z } from "zod";

const environmentSchema = z.enum(["development", "test", "production"]);

const automaticAttestationSchema = z
  .enum(["false", "true"])
  .default("false")
  .transform((value) => value === "true");

export const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    TOLERANCE_ENVIRONMENT: environmentSchema.default("development"),
    TOLERANCE_APP_ORIGIN: z.url().optional(),
    AUTOMATIC_ATTESTATION_ENABLED: automaticAttestationSchema,
  })
  .superRefine((value, context) => {
    if (
      value.TOLERANCE_ENVIRONMENT === "production" &&
      !value.TOLERANCE_APP_ORIGIN
    ) {
      context.addIssue({
        code: "custom",
        path: ["TOLERANCE_APP_ORIGIN"],
        message: "TOLERANCE_APP_ORIGIN is required in production.",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}

/**
 * Phase 3A deliberately feature-gates the relay. Enabling it is rejected
 * until the safe Studionet execution/envelope observation primitive exists.
 */
export function assertAutomaticAttestationDisabled(
  input: Record<string, string | undefined>,
): false {
  const enabled = automaticAttestationSchema.parse(
    input.AUTOMATIC_ATTESTATION_ENABLED,
  );
  if (enabled) {
    throw new Error(
      "Automatic GenLayer-derived attestation is intentionally unavailable.",
    );
  }
  return false;
}
