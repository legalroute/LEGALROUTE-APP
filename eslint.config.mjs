import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts"]),
  ...nextVitals.map((config) => ({ ...config, files: ["legal_route_ai/**/*.{js,mjs,ts,tsx}"] })),
  ...nextTs,
  { settings: { next: { rootDir: "legal_route_ai/" } }, rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] } },
]);
