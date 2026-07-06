import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // ─── Conservative vendor chunk splitting ───────────────────────────
        // RULE: React and ANY package that depends on React must live in the
        // same chunk. Splitting React from its consumers causes the classic
        // "Cannot read properties of undefined (reading 'createContext')"
        // error because the consumer's module-level code runs before React's
        // namespace import is wired up.
        //
        // We only split out libraries that are:
        //   1. Genuinely self-contained (no React deps), OR
        //   2. So heavy that the bundling tradeoff is worth it AND used only
        //      on a few routes (so they can be code-split at the route level).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // Supabase client — no React dependency, heavy (~200KB)
          if (id.includes("@supabase")) return "supabase";

          // NOTE: qrcode.react depends on React, so it must NOT be split into
          // its own chunk — doing so splits a React consumer from React and
          // triggers "Cannot access 'L' before initialization" (TDZ) at load.
          // It stays in the shared "vendor" chunk below.

          // Recharts + d3 — heavy charts, only used in admin analytics
          if (id.includes("recharts") || id.includes("/d3-")) {
            return "charts";
          }

          // Everything else (React, react-dom, react-router, Radix, next-themes,
          // lucide, date-fns, react-hook-form, react-query, etc.) stays in a
          // single shared "vendor" chunk so React identity is preserved.
          return "vendor";
        },
      },
    },
  },
}));
