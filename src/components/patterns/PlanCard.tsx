import type { LucideIcon } from "lucide-react";
import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * The plan card. One of them.
 *
 * There were five: CleaningPackageCard, EntertainmentPlanCard,
 * UniversalPlanCard, and a MealPlanCard written twice (the food listing and
 * the restaurant page). They drifted the way copies do — three showed a
 * feature list and two didn't, one had photos, one had a pill CTA and the
 * rest a full-width button, and none of them showed a rating even though the
 * platform has been collecting ratings all along.
 *
 * This is deliberately a presentational component: it takes strings and
 * numbers, not a row from any particular table. The per-service shape
 * (cleaning's frequency labels, food's meals-per-week, beach's per-person
 * price) is turned into `chips` and `price.unit` by the caller, which is the
 * only place that knows what those columns mean.
 */

export interface PlanCardRating {
  average: number;
  count: number;
}

export interface PlanCardChip {
  icon?: LucideIcon;
  label: string;
}

export interface PlanCardProps {
  title: string;
  /** Small uppercase line above the title — the provider, usually. */
  eyebrow?: { icon?: LucideIcon; text: string };
  description?: string | null;
  /** Up to three are shown; a fourth turns the last one into a "+N" tile. */
  photos?: string[];
  /** Whatever the service wants to flag — dietary tags, for instance. */
  badges?: ReactNode;
  chips?: PlanCardChip[];
  /**
   * Still accepted, no longer drawn: the row has no space for a tick-list, and
   * the full list is on the plan's own page, one tap away.
   */
  features?: string[];
  maxFeatures?: number;
  /**
   * null cents = no price set, which the card says out loud. `from` marks an
   * offer whose real price depends on which options the customer picks.
   */
  price: { cents: number | null | undefined; unit?: string; from?: boolean };
  rating?: PlanCardRating | null;
  featured?: boolean;
  featuredLabel?: string;
  cta: { label: string; onClick: () => void; disabled?: boolean; disabledLabel?: string };
  /** When set, the whole card is clickable and the CTA is a shortcut to it. */
  onOpen?: () => void;
  className?: string;
}

/** ★ 4.8 (12) — absent entirely when nobody has rated, never "0.0" or "No reviews". */
export function RatingLine({ rating, className }: { rating?: PlanCardRating | null; className?: string }) {
  if (!rating || rating.count < 1) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-semibold tracking-[-0.24px] text-foreground", className)}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {rating.average.toFixed(1)}
      <span className="font-normal text-muted-foreground">({rating.count})</span>
    </span>
  );
}

export function PlanCard({
  title,
  eyebrow,
  description,
  photos = [],
  badges,
  chips = [],
  price,
  rating,
  featured = false,
  featuredLabel = "Most Popular",
  cta,
  onOpen,
  className,
}: PlanCardProps) {
  const hasPrice = typeof price.cents === "number" && price.cents > 0;
  // An empty string in the gallery is still a gallery entry, and it drew a
  // grey square where a photo should be.
  const cover = photos.find((url) => typeof url === "string" && url.trim().length > 0);

  /**
   * The secondary line. A 120px row has one slot for grey 12px text, and the
   * services fill it with different things — who sells it, cleaning's "3
   * cleanings a month", food's meal tags, a plain description. They queue up
   * in that one slot instead of each inventing a row of its own, which is what
   * cost the description its second line.
   */
  const meta = [eyebrow?.text, description, ...chips.map((c) => c.label)]
    .filter(Boolean).join(" · ");
  const open = onOpen ?? (cta.disabled ? undefined : cta.onClick);

  return (
    // 120px tall, 8px around the picture, 16px of air to the text — the
    // design's row. The whole row is the target; the card no longer carries a
    // Subscribe button, because on a list of eight plans eight buttons all
    // meant "open this plan" and one of them was always the wrong one to hit.
    <article
      role={open ? "button" : undefined}
      tabIndex={open ? 0 : undefined}
      onClick={open}
      onKeyDown={
        open
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
            }
          : undefined
      }
      className={cn(
        "flex h-[120px] gap-4 rounded-radius-md py-2 pl-2 pr-4 shadow-figma transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        featured ? "bg-primary/10 hover:bg-primary/15" : "bg-card hover:bg-muted/40",
        open && "cursor-pointer",
        className,
      )}
    >
      {/* Square, the height of the card. Without a picture the square would be
          an empty grey hole, so the row simply closes up around the text. */}
      {cover && (
        <div className="aspect-square h-full shrink-0 overflow-hidden rounded-[8px] bg-muted">
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* `overflow-hidden` is what keeps the row 120px tall: without it a long
          description pushes the price out through the bottom of the card. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden py-2">
        {/* The "Most Popular" pill used to sit here and took two thirds of the
            width, leaving "Toyota Rai…". The tinted background says the same
            thing and costs no room. */}
        <h3 className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground" title={featured ? `${title} — ${featuredLabel}` : title}>
          {title}
        </h3>

        {/* `flex-1` rather than a natural height: the description takes
            whatever the row has left over after the title and the price, so a
            long one is clamped instead of shoving the price off the card. */}
        {meta && (
          // The wrapper is not decoration: a flex item has its display
          // blockified, which turns `-webkit-box` into `flow-root` and makes
          // line-clamp a no-op. Clamping only works one level in.
          <div className="min-h-0 flex-1 overflow-hidden">
            <p className="line-clamp-2 text-[12px] leading-[1.35] tracking-[-0.24px] text-muted-foreground">
              {meta}
            </p>
          </div>
        )}

        {badges && <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">{badges}</div>}

        {/* Price pinned to the bottom right, so a column of rows lines its
            prices up instead of stair-stepping with the text above them. */}
        <div className="mt-auto flex shrink-0 items-end justify-between gap-2">
          <RatingLine rating={rating} className="shrink-0" />
          <div className="ml-auto flex items-end gap-1 whitespace-nowrap">
            {hasPrice ? (
              <>
                {price.from && (
                  <span className="pb-px text-[12px] tracking-[-0.24px] text-muted-foreground">From</span>
                )}
                <span className="text-[16px] font-semibold tabular-nums tracking-[-0.32px] text-foreground">
                  {formatUSD(price.cents!)}
                </span>
                {price.unit && (
                  <span className="pb-px text-[12px] tracking-[-0.24px] text-muted-foreground">{price.unit}</span>
                )}
              </>
            ) : (
              // A plan with no price is a half-finished admin entry. Saying so
              // beats rendering "$0.00".
              <span className="text-[12px] font-semibold text-muted-foreground">Price on request</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
