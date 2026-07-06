import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unified loading system for the whole platform.
 *
 * - `<Spinner />` — the single spinner primitive. Use inside buttons, inline,
 *   or anywhere a small activity indicator is needed.
 * - `<PageLoader />` — centered full-area loader for route/page-level loads.
 *
 * Do NOT use bare `<Loader2 className="animate-spin …" />` elsewhere — always
 * go through these so size, color, motion, and a11y stay consistent.
 */

const SIZES = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

export type SpinnerSize = keyof typeof SIZES;

interface SpinnerProps {
  size?: SpinnerSize;
  /** Override color. Defaults to `currentColor` so it inherits the parent (e.g. button text). */
  className?: string;
  /** Accessible label announced to screen readers. */
  label?: string;
}

export function Spinner({ size = "md", className, label = "Loading" }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      className={cn("animate-spin text-current", SIZES[size], className)}
    />
  );
}

interface PageLoaderProps {
  /** Visible/announced text under the spinner. */
  label?: string;
  /** Min height of the centered area. Defaults to a comfortable viewport slice. */
  className?: string;
}

export function PageLoader({ label, className }: PageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 text-muted-foreground",
        className,
      )}
    >
      <Spinner size="lg" className="text-primary" label={label ?? "Loading"} />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
