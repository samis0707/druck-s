import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Kopiertes pdf.js-Worker-Bundle (scripts/copy-static-assets.mjs, nicht im Repo).
    "public/pdf.worker.min.mjs",
    // Kopierte Swagger-Oberfläche für /api/docs (ebenfalls nicht im Repo).
    "public/swagger/**",
  ]),
  // Werkzeugskripte für Schulungs-Screenshots und PDFs laufen als CommonJS mit Node.
  {
    files: ["docs/schulung/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
