import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

/**
 * The untyped integration scripts under scripts/ are not covered by
 * `tsc --noEmit`, so they still need `no-undef` with an explicit environment.
 * Typed sources rely on the compiler for that check instead.
 */
const scriptGlobals = {
  Buffer: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
  window: "readonly",
};

export default tseslint.config(
  globalIgnores([
    "dist/**",
    ".worker-build/**",
    ".venv-genlayer/**",
    "node_modules/**",
    "coverage/**",
    "genlayer/artifacts/**",
    "lib/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: { "no-undef": "off" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: scriptGlobals,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
