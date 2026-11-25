import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GA_ID, readConsent, saveConsent, trackPage } from "@/lib/analytics/ga";
import { tr } from "@/lib/tr";

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

  if (!GA_ID || decided || pathname.startsWith("/admin") || pathname.startsWith("/dev/")) return null;

  return (
    <div
      role="dialog"
      aria-label={tr("Analytics")}
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-40 px-4 md:bottom-6"
    >
      {/* One line and two buttons: it used to be a paragraph that, together
          with the install prompt, covered most of a first visitor's screen. */}
      <div className="mx-auto flex max-w-[640px] items-center gap-3 rounded-radius-lg bg-card py-2 pl-4 pr-2 ring-1 ring-border">
        <p className="min-w-0 flex-1 text-meta leading-4 text-muted-foreground">{tr("Analytics to see where people get stuck. No ads, nothing sold.")}{" "}<Link to="/privacy" className="text-foreground underline underline-offset-2">{tr("Privacy")}</Link>
        </p>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => saveConsent("denied")}>{tr("Decline")}</Button>
          <Button size="sm" onClick={() => { saveConsent("granted"); window.setTimeout(() => trackPage(pathname + search), 300); }}>{tr("Allow")}</Button>
        </div>
      </div>
    </div>
  );
}
