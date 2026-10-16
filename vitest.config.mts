import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Room generation is CPU-heavy; under parallel load some suites need more than the 5 s default.
  test: { include: ["src/**/*.test.ts"], testTimeout: 30_000 },
});
