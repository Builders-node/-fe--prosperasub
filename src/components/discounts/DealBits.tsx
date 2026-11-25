import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { DisplayDiscount } from "@/lib/discounts";

/**
 * The two marks a discounted offer wears everywhere it is sold: a pill on its
 * photo and a struck-through old price beside the new one. One look for a
 * plan card, a home tile, a car and a plan page, so a customer learns it once.
 */

/** The pill on a photo's top-left: "−20%", "New customers −50%", "Save up to 15%". */
export function DealPill({ deal, className }: { deal: DisplayDiscount | null | undefined; className?: string }) {
  if (!deal) return null;
  return (
    <span
      className={cn(
        "pointer-events-none max-w-[calc(100%-3.5rem)] truncate rounded-full px-2.5 py-0.5 text-meta font-bold shadow-sm",
        deal.kind === "sale" ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background",
        className,
      )}
    >
      {deal.badge}
    </span>
  );
}

/** "$39 $49" with the old one struck — only when a sale has an honest old price. */
export function DealPrice({
  deal, cents, unit, from = false, className, size = "card",
}: {
  deal: DisplayDiscount | null | undefined;
  cents: number;
  unit?: string | null;
  from?: boolean;
  className?: string;
  size?: "card" | "page";
}) {
  const now = deal?.kind === "sale" ? deal.nowCents : cents;
  const was = deal?.kind === "sale" ? deal.wasCents : null;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn(
        "font-bold tracking-tight tabular-nums",
        size === "page" ? "text-[28px] leading-none" : "text-[20px] leading-tight",
        was ? "text-destructive" : "text-foreground",
      )}>
        {from && <span className="text-meta font-medium tracking-normal text-muted-foreground">From </span>}
        {formatUSD(now)}
      </span>
      {was && (
        <span className="text-meta font-medium tabular-nums text-muted-foreground line-through" aria-label={`was ${formatUSD(was)}`}>
          {formatUSD(was)}
        </span>
      )}
      {unit && <span className="text-meta font-medium tracking-normal text-muted-foreground">{unit}</span>}
    </span>
  );
}

/** The small line under a price: "2 days left", "first period". */
export function DealNote({ deal, className }: { deal: DisplayDiscount | null | undefined; className?: string }) {
  if (!deal?.note) return null;
  return (
    <span className={cn("text-meta font-semibold", deal.kind === "sale" ? "text-destructive" : "text-muted-foreground", className)}>
      {deal.note}
    </span>
  );
}
