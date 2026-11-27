// Preview harness runner: `npx vitest run --config scripts/preview/vitest.config.mts`. Not part of `npm test`.
import { defineConfig } from "vitest/config";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root,
  resolve: { alias: { "@": path.join(root, "src") } },
  test: { environment: "node", include: ["scripts/preview/render.test.tsx"], setupFiles: ["scripts/preview/setup.ts"], testTimeout: 60000 },
});
