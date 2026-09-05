import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Tests for the money path.
 *
 * The checkout is the one flow that takes money and it had no test at all —
 * the backend has 29 specs, the frontend had none. These run in node with no
 * DOM: what is being guarded is arithmetic and lifecycle rules (what a period
 * costs, when it ends, what a one-time purchase does), not rendering.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
