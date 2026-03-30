import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import nocturnSafety from "./eslint-rules/nocturn-safety.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "eslint-rules/**",
  ]),
  // Nocturn safety rules — catch the bugs found in QA audits
  {
    name: "nocturn-safety",
    plugins: {
      "nocturn-safety": nocturnSafety,
    },
    rules: {
      // WARN for now — switch to "error" after fixing all existing violations
      "nocturn-safety/require-soft-delete-filter": "warn",
      "nocturn-safety/no-memory-rate-limit": "error",
      "nocturn-safety/no-single-query": "warn",
    },
  },
]);

export default eslintConfig;
