/**
 * The two Yandex-style primitives the platform actually uses.
 *
 *   • YdEmptyState      — icon, a line, a quieter line, an optional button
 *   • YdSectionHeading  — a section's title row
 *
 * There were five. YdHero, YdChip and YdCard were presented in DESIGN.md as
 * the house vocabulary and had **no consumers at all** — pages built their own
 * hero, their own chip and their own card next to them. A primitive nobody
 * imports is not a design system, it is a second opinion, so they are gone.
 * The six-colour accent palette and YdIllustration went the same way: no
 * consumers, and a service is told apart by its icon, not a colour of its own.
 */
import React from "react";
import { cn } from "@/lib/utils";

/**
 * "There is nothing here", said the same way everywhere.
 *
 * Fifty-one screens wrote their own instead of using this, and the reason is
 * visible in the old signature: it had no room for an action, and almost every
 * empty state ends in one — "Browse services", "Add your first car". A
 * primitive that cannot express the common case is a primitive people work
 * around, so the slot is the fix, not discipline.
 *
 * Also brought onto the design's own numbers: a card is 16px (`rounded-radius-lg`
 * was 24), the title is the 16px semibold every row title uses, and the
 * subtitle the 12px caption — it was `text-base font-bold` over `text-sm`.
 */
export function YdEmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  /** The way out — a button, a link. Rendered under the subtitle. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-radius-md bg-card py-14 text-center", className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-radius-md bg-muted/50">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-title font-semibold text-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-xs px-6 text-meta text-muted-foreground">
          {subtitle}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * A section heading, in the one size the design gives one.
 *
 * There were fourteen of these written by hand — `text-xl font-black`,
 * `text-2xl font-black`, `text-lg font-black`, `text-base font-black`, and a
 * 12px uppercase eyebrow standing in for a heading in the admin — against
 * seventeen written the way DESIGN.md §3 specifies. Discovery had one as a
 * local component, so nobody else could use it even if they wanted to.
 *
 * This is that one, exported: 20px semibold at -0.4px, with the optional
 * count the listings show in parentheses.
 */
export function YdSectionHeading({
  title, count, className, action,
}: {
  title: string;
  /** Rendered as "(N)" beside the title, the way the listings do it. */
  count?: number | null;
  className?: string;
  /** A control on the right — a "see all" link, a filter. */
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="min-w-0 text-heading font-semibold text-foreground">
        <span className="truncate">{title}</span>
        {count != null && (
          <span className="ml-2 text-base font-normal text-muted-foreground">({count})</span>
        )}
      </h2>
      {action}
    </div>
  );
}
