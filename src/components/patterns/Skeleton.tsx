import { cn } from "@/lib/utils";

/**
 * The one loading rectangle.
 *
 * Every screen used to invent its own — `h-72 rounded-3xl bg-muted`,
 * `h-[120px] rounded-radius-lg`, `bg-muted/40` — so geometry flickered
 * between pages while the same thing loaded. One pulse, one tone, one radius;
 * the caller only says how tall the thing it stands in for is.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-radius-md bg-muted/40", className)} />;
}
