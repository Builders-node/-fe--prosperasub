import { normalizeUnit } from "@/lib/checkout/ctaLabel";
import type { LucideIcon } from "lucide-react";
import { FavoriteButton } from "@/components/patterns/FavoriteButton";
import { Plus, Star } from "lucide-react";
import type { ReactNode } from "react";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { PhotoSlider } from "@/components/patterns/PhotoSlider";

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
  /** A heart on the photo — save this to favourites without opening it. */
  favorite?: { kind: "plan" | "vehicle"; id: string };
}

/** ★ 4.8 (12) — absent entirely when nobody has rated, never "0.0" or "No reviews". */
export function RatingLine({ rating, className }: { rating?: PlanCardRating | null; className?: string }) {
  if (!rating || rating.count < 1) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-meta font-semibold text-foreground", className)}>
      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
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
  featuredLabel,
  cta,
  onOpen,
  className,
  favorite,
}: PlanCardProps) {
  const hasPrice = typeof price.cents === "number" && price.cents > 0;
  const open = onOpen ?? (cta.disabled ? undefined : cta.onClick);
  // The grey words after the name — who sells it, or what it is.
  const meta = eyebrow?.text || description || null;
  const labels = chips.map((c) => c.label).filter(Boolean).slice(0, 2);

  return (
    // The shelf card, the same as every other card on the platform (see
    // OfferCard): a square photo with round corners, labels on its bottom-left
    // and a round "+" on its bottom-right, then the price large and the name
    // under it, without a box. The whole card is the target.
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
        "group flex min-w-0 flex-col gap-2 rounded-radius-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]",
        open && "cursor-pointer",
        className,
      )}
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-radius-lg bg-muted">
        <PhotoSlider photos={photos} className="h-full w-full bg-muted transition-transform duration-300 group-hover:scale-[1.03]" />
        {favorite && (
          <FavoriteButton kind={favorite.kind} id={favorite.id} name={title} variant="overlay" className="absolute right-2 top-2" />
        )}
        {(labels.length > 0 || (featured && featuredLabel)) && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-4rem)] flex-col items-start gap-1">
            {labels.map((l) => (
              <span key={l} className="max-w-full truncate rounded-full bg-primary px-2.5 py-0.5 text-meta font-bold text-primary-foreground">{l}</span>
            ))}
            {/* A PAID place must say so on the card itself (Terms). */}
            {featured && featuredLabel && (
              <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-meta font-bold text-white backdrop-blur">{featuredLabel}</span>
            )}
          </div>
        )}
        <span
          aria-hidden
          className="absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-figma transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
        >
          <Plus className="h-6 w-6" strokeWidth={2} />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-1">
        {hasPrice ? (
          <p className="text-[20px] font-bold leading-tight tracking-tight tabular-nums text-foreground">
            {price.from && <span className="text-meta font-medium tracking-normal text-muted-foreground">From </span>}
            {formatUSD(price.cents!)}
            {price.unit && (
              <span className="text-meta font-medium tracking-normal text-muted-foreground">
                {" "}{price.unit.trim().startsWith("/") ? normalizeUnit(price.unit) : price.unit}
              </span>
            )}
          </p>
        ) : (
          // A plan with no price is a half-finished admin entry. Saying so
          // beats rendering "$0.00".
          <p className="text-meta font-semibold text-muted-foreground">Price on request</p>
        )}
        <h3 className="line-clamp-2 text-body font-normal leading-snug text-foreground">
          {title}
          {meta && <span className="text-muted-foreground"> {meta}</span>}
        </h3>
        {badges && <div className="flex flex-wrap gap-1 overflow-hidden pt-0.5">{badges}</div>}
        <RatingLine rating={rating} className="pt-0.5" />
      </div>
    </article>
  );
}
