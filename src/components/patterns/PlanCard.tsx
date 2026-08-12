import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, Star } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
  features?: string[];
  /** How many features to show before cutting the list off. */
  maxFeatures?: number;
  /** null cents = no price set, which the card says out loud. */
  price: { cents: number | null | undefined; unit?: string };
  rating?: PlanCardRating | null;
  featured?: boolean;
  featuredLabel?: string;
  cta: { label: string; onClick: () => void; disabled?: boolean; disabledLabel?: string };
  /** When set, the whole card is clickable and the CTA is a shortcut to it. */
  onOpen?: () => void;
  className?: string;
}

function PhotoStrip({ photos }: { photos: string[] }) {
  const shown = photos.slice(0, 3);
  return (
    <div className="mb-4 grid grid-cols-3 gap-1.5">
      {shown.map((url, i) => (
        <div
          key={i}
          className={cn(
            "relative aspect-square overflow-hidden rounded-xl bg-muted",
            shown.length === 1 && "col-span-3 aspect-[16/9]",
            shown.length === 2 && i === 0 && "col-span-2 aspect-auto",
          )}
        >
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {i === 2 && photos.length > 3 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
              +{photos.length - 3}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** ★ 4.8 (12) — absent entirely when nobody has rated, never "0.0" or "No reviews". */
export function RatingLine({ rating, className }: { rating?: PlanCardRating | null; className?: string }) {
  if (!rating || rating.count < 1) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[13px] font-semibold text-foreground", className)}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      {rating.average.toFixed(1)}
      <span className="font-medium text-muted-foreground">({rating.count})</span>
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
  features = [],
  maxFeatures = 3,
  price,
  rating,
  featured = false,
  featuredLabel = "Most Popular",
  cta,
  onOpen,
  className,
}: PlanCardProps) {
  const hasPrice = typeof price.cents === "number" && price.cents > 0;
  const EyebrowIcon = eyebrow?.icon;

  return (
    <article
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
            }
          : undefined
      }
      className={cn(
        "group flex flex-col rounded-3xl p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        featured ? "bg-primary/10 hover:bg-primary/15" : "bg-card hover:bg-muted/40",
        onOpen && "cursor-pointer",
        className,
      )}
    >
      {photos.length > 0 && <PhotoStrip photos={photos} />}

      {featured && (
        <span className="mb-2 self-start rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
          {featuredLabel}
        </span>
      )}

      {eyebrow && (
        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
          {EyebrowIcon && <EyebrowIcon className="h-3 w-3" />}
          {eyebrow.text}
        </p>
      )}

      <div className="mt-1 flex items-start justify-between gap-3">
        <h3 className="text-lg font-black leading-tight tracking-tight text-foreground">{title}</h3>
        <RatingLine rating={rating} className="mt-0.5 shrink-0" />
      </div>

      {description && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}

      {badges && <div className="mt-3 flex flex-wrap gap-1.5">{badges}</div>}

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const Icon = chip.icon;
            return (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {Icon && <Icon className="h-3 w-3" />}
                {chip.label}
              </span>
            );
          })}
        </div>
      )}

      {features.length > 0 && (
        <ul className="mt-3 space-y-1">
          {features.slice(0, maxFeatures).map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Price sits at the bottom of the card whatever the content above it,
          so a grid of cards lines its prices up instead of stair-stepping. */}
      <div className="mt-auto pt-4">
        <div className="flex items-baseline gap-1">
          {hasPrice ? (
            <>
              <span className="text-2xl font-black tabular-nums text-foreground">{formatUSD(price.cents!)}</span>
              {price.unit && <span className="text-sm text-muted-foreground">{price.unit}</span>}
            </>
          ) : (
            // A plan with no price is a half-finished admin entry. Saying so
            // beats rendering "$0.00" next to a Subscribe button.
            <span className="text-sm font-semibold text-muted-foreground">Price on request</span>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <Button
            size="lg"
            className="mt-4 h-12 w-full rounded-2xl text-base font-bold"
            disabled={cta.disabled}
            onClick={cta.onClick}
          >
            {cta.disabled ? (cta.disabledLabel ?? cta.label) : cta.label}
            {!cta.disabled && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </article>
  );
}
