import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Vendored, minified runtime assets staged by `npm run setup:tesseract`.
    // Not our source, and linting them buries real findings under thousands
    // of warnings from generated code.
    "public/tesseract/**",
    // Service worker: plain browser JS, not part of the TS project.
    "public/sw.js",
  ]),
]);

export default eslintConfig;
