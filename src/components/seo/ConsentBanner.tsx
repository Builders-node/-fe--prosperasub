import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GA_ID, readConsent, saveConsent, trackPage } from "@/lib/analytics/ga";

/**
 * Asks once whether Google Analytics may run. Nothing loads before "Allow";
 * "Decline" is remembered. Shown only when an id is configured, never in the
 * admin, and sits above the phone tab bar.
 */
export function ConsentBanner() {
  const { pathname, search } = useLocation();
  const [decided, setDecided] = useState(() => readConsent() !== null);

  useEffect(() => {
    const on = () => setDecided(readConsent() !== null);
    window.addEventListener("everysub:consent", on);
    return () => window.removeEventListener("everysub:consent", on);
  }, []);

  if (!GA_ID || decided || pathname.startsWith("/admin")) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-[60] px-4 md:bottom-6"
    >
      <div className="mx-auto flex max-w-[640px] flex-col gap-3 rounded-radius-lg bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-body text-muted-foreground">
          We use Google Analytics (via Google Tag Manager) to see which pages help people find what they need. No ads, nothing sold.{" "}
          <Link to="/privacy" className="text-foreground underline underline-offset-2">Privacy</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="secondary" onClick={() => saveConsent("denied")}>Decline</Button>
          <Button size="sm" onClick={() => { saveConsent("granted"); window.setTimeout(() => trackPage(pathname + search), 300); }}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}
