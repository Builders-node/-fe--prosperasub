import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckoutShellProps {
  /** Controls mount. When false, nothing renders. */
  open: boolean;
  /** Back/close handler (header arrow). */
  onClose: () => void;
  /** Header title. */
  title: ReactNode;
  /** Optional secondary line under the title (e.g. "amount · item · duration"). */
  subtitle?: ReactNode;
  /** Scrollable body content. */
  children: ReactNode;
  /** Optional sticky footer (e.g. a primary CTA) pinned to the bottom. */
  footer?: ReactNode;
  /** Max width of the centered content column. Defaults to a comfortable form width. */
  contentClassName?: string;
}

/**
 * The single, platform-wide checkout/booking scaffold (full page — never a modal).
 *
 * Layout: fixed full-screen surface, a sticky header with a back arrow + title,
 * a scrollable centered body, and an optional sticky footer. Used by every
 * checkout flow (food, car, cleaning) so they look and behave identically.
 *
 * - Respects the desktop sidebar offset (`--sidebar-width`).
 * - Safe-area aware top and bottom for mobile.
 * - No outside-dismiss / scrim: it's a page, so payment SDK popups (PayPal,
 *   etc.) can't accidentally close it.
 */
export function CheckoutShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  contentClassName,
}: CheckoutShellProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:left-[var(--sidebar-width,0px)]">
      {/* Header — matches the app's HomeHeader: centered title, ghost back
          button, subtle divider, blurred translucent surface. */}
      <header
        className="shrink-0 border-b border-border/40 bg-background/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="relative flex items-center px-2" style={{ height: "56px" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center px-14 text-center">
            <span className="text-[17px] font-black leading-none tracking-tight text-foreground">
              ProsperaSub
            </span>
            {(subtitle ?? title) && (
              <span className="mt-0.5 max-w-full truncate text-xs font-medium text-muted-foreground">
                {subtitle ?? title}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto px-3 py-4"
        style={{ paddingBottom: footer ? "1rem" : "max(env(safe-area-inset-bottom, 0px), 1.25rem)" }}
      >
        <div className={cn("mx-auto w-full max-w-md", contentClassName)}>{children}</div>
      </div>

      {/* Optional sticky footer */}
      {footer && (
        <div
          className="border-t border-border bg-background px-3 py-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)" }}
        >
          <div className={cn("mx-auto w-full max-w-md", contentClassName)}>{footer}</div>
        </div>
      )}
    </div>
  );
}
