import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ─── Top-level error boundary so a blank screen always surfaces the cause ─────
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", padding: "32px",
          background: "#141414", color: "#fff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            App failed to load
          </h1>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <pre style={{
            background: "#1f1f1f", padding: 16, borderRadius: 8,
            overflow: "auto", fontSize: 12, maxHeight: 400,
          }}>
            {String(this.state.error?.stack ?? "").split("\n").slice(0, 30).join("\n")}
          </pre>
          <button
            onClick={async () => {
              try {
                // Unregister any service workers + clear all caches
                if ("serviceWorker" in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map((r) => r.unregister()));
                }
                if ("caches" in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map((k) => caches.delete(k)));
                }
                localStorage.clear();
                sessionStorage.clear();
              } catch {}
              // Cache-busting reload — appends a query param so the HTML is re-fetched fresh
              const url = new URL(location.href);
              url.searchParams.set("_t", String(Date.now()));
              location.replace(url.toString());
            }}
            style={{
              marginTop: 16, padding: "10px 16px", borderRadius: 999,
              background: "#F8A31A", color: "#000", border: 0, fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Clear cache and reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Auto-recover from stale-chunk errors after a deploy ─────────────────────
// When a new deploy happens, the browser may still have the old index.html
// cached with references to old chunk hashes. Loading those fails with one
// of:
//   • "Failed to fetch dynamically imported module"
//   • "Loading chunk X failed"
//   • "'text/html' is not a valid JavaScript MIME type" (Vite SPA fallback)
// We auto-trigger ONE hard reload to fetch the fresh HTML + new chunks.
const RELOAD_FLAG = "prospera-stale-chunk-reload";
const looksLikeStaleChunk = (msg: string) =>
  /Failed to fetch dynamically imported module|Loading chunk .* failed|is not a valid JavaScript MIME type|Importing a module script failed/i.test(msg);

const tryAutoRecover = (msg: string) => {
  if (!looksLikeStaleChunk(msg)) return false;
  if (sessionStorage.getItem(RELOAD_FLAG)) return false; // already tried once
  sessionStorage.setItem(RELOAD_FLAG, "1");
  // Unregister SW + clear caches, then hard reload with cache-bust
  (async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set("_t", String(Date.now()));
    location.replace(url.toString());
  })();
  return true;
};

// Catch synchronous render errors that escape React (rare but possible)
window.addEventListener("error", (e) => {
  console.error("[window.error]", e.error || e.message);
  tryAutoRecover(String(e.message ?? e.error?.message ?? ""));
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
  tryAutoRecover(String(e.reason?.message ?? e.reason ?? ""));
});

try {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
} catch (err) {
  // Last-resort: if React itself can't mount, show the error directly
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;padding:32px;background:#141414;color:#fff;font-family:Inter,system-ui,sans-serif">
        <h1 style="font-size:22px;font-weight:800;margin-bottom:12px">Boot failure</h1>
        <pre style="background:#1f1f1f;padding:16px;border-radius:8px;font-size:12px;overflow:auto">${
          String((err as Error)?.stack ?? err)
        }</pre>
      </div>
    `;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => { reg.update(); })
      .catch(() => {});
  });
}
