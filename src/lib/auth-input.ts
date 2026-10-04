import { z } from "zod";

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name."),
    email: z.email("Enter a valid email address.").trim().toLowerCase(),
    password: z
      .string()
      .min(8, "Use at least 8 characters with a letter and number.")
      .regex(/[A-Za-z]/, "Use at least 8 characters with a letter and number.")
      .regex(/\d/, "Use at least 8 characters with a letter and number."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export function validateSignupInput(input: unknown) {
  const result = signupSchema.safeParse(input);
  if (!result.success)
    return {
      ok: false as const,
      message: result.error.issues[0]?.message ?? "Check your account details.",
    };
  return { ok: true as const, data: result.data };
}

export function validNewPassword(password: string) {
  return (
    password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
  );
}
