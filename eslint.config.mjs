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
    // The vanilla-JS app being replaced; it has its own tests (npm run test:legacy).
    "legacy/**",
  ]),
  {
    rules: {
      // All markup goes through React's escaping (#12).
      "react/no-danger": "error",
    },
  },
]);

export default eslintConfig;
