import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { YdIllustration } from "@/components/yd/YdPrimitives";
import { cn } from "@/lib/utils";

type Accent = "amber" | "orange" | "cyan" | "sky" | "emerald";
/** Only the accents YdIllustration knows how to render — do NOT extend without
 *  adding the color to `YdPrimitives.tsx` first. */
type IllustrationAccent = "amber" | "orange" | "sky" | "emerald";

interface Props {
  /** Row-click handler. The whole card is a role=button. */
  onClick: () => void;
  /** Optional banner image on top of the card. Falls back to an illustration. */
  bannerUrl?: string | null;
  /** Illustration icon used when `bannerUrl` is missing. */
  fallbackIcon: React.ComponentType<{ className?: string }>;
  /** Illustration accent color when the icon is used. Restricted to the set
   *  YdIllustration supports so a typo here becomes a compile error, not a
   *  runtime "cannot read properties of undefined (reading 'bgChip')". */
  fallbackAccent?: IllustrationAccent;
  /** Taller banner variant — used by "featured" cards in a 2-column grid. */
  featured?: boolean;
  /** Optional overlay slot in the top-right of the banner (chip / badge). */
  overlayTopRight?: ReactNode;
  /** Optional overlay slot in the top-left of the banner (chip / badge). */
  overlayTopLeft?: ReactNode;
  /** Header section — usually avatar + title + meta. */
  header: ReactNode;
  /** Optional two-line description. */
  description?: string | null;
  /** Meta chips (YdChip components). */
  chips?: ReactNode;
  /** Small "from" / "starts at" label before the price value. */
  priceLabel?: string;
  /** Formatted price string, e.g. "$79.00". Pass null for "Coming soon". */
  priceValue?: string | null;
  /** Unit suffix after the price, e.g. "/wk", "/day". */
  priceUnit?: string;
  /** Text on the CTA pill. */
  ctaLabel: string;
  /** Accent color for the CTA pill (per-service palette). */
  ctaAccent?: Accent;
  /** Hover accent color for card border on hover. */
  hoverAccent?: Accent;
  /** Ring color for focus-visible. */
  focusAccent?: Accent;
}

const CTA_CLS: Record<Accent, string> = {
  amber:   "bg-primary text-black",
  orange:  "bg-orange-500 text-white",
  cyan:    "bg-cyan-500 text-black",
  sky:     "bg-sky-500 text-white",
  emerald: "bg-emerald-500 text-black",
};

const HOVER_BORDER_CLS: Record<Accent, string> = {
  amber:   "hover:border-primary/40",
  orange:  "hover:border-orange-500/40",
  cyan:    "hover:border-cyan-500/40",
  sky:     "hover:border-sky-500/40",
  emerald: "hover:border-emerald-500/40",
};

const FOCUS_RING_CLS: Record<Accent, string> = {
  amber:   "focus-visible:ring-primary",
  orange:  "focus-visible:ring-orange-500",
  cyan:    "focus-visible:ring-cyan-500",
  sky:     "focus-visible:ring-sky-500",
  emerald: "focus-visible:ring-emerald-500",
};

/**
 * Single visual template for every public listing card (restaurants, vehicles,
 * beach memberships, cleaning packages…). Everything a card renders slots into
 * a shared structure so all four services share the same rhythm — banner,
 * header, description, chips, price + CTA — with per-service accent colors.
 *
 * The audit found "each service looks like a different app" — this component
 * is the fix.
 */
export function ServiceListingCard({
  onClick,
  bannerUrl,
  fallbackIcon: FallbackIcon,
  fallbackAccent = "amber",
  featured,
  overlayTopRight,
  overlayTopLeft,
  header,
  description,
  chips,
  priceLabel,
  priceValue,
  priceUnit,
  ctaLabel,
  ctaAccent = "amber",
  hoverAccent,
  focusAccent,
}: Props) {
  const hover  = HOVER_BORDER_CLS[hoverAccent ?? ctaAccent];
  const focus  = FOCUS_RING_CLS[focusAccent ?? ctaAccent];
  const bannerHeightCls = featured ? "h-44 md:h-56" : "h-44";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl",
        "transition-all duration-200 ease-out",
        "motion-safe:hover:scale-[1.01]",
        "focus-visible:outline-none focus-visible:ring-2",
        hover,
        focus,
        featured && "md:col-span-2",
      )}
    >
      {/* Banner image */}
      <div className={cn("relative w-full overflow-hidden bg-muted", bannerHeightCls)}>
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <YdIllustration icon={FallbackIcon} accent={fallbackAccent} size="lg" />
          </div>
        )}
        {overlayTopRight && (
          <div className="absolute right-3 top-3">{overlayTopRight}</div>
        )}
        {overlayTopLeft && (
          <div className="absolute left-3 top-3">{overlayTopLeft}</div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        {header}
        {description && (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        )}
        {chips && (
          <div className="mt-3 flex flex-wrap gap-1.5">{chips}</div>
        )}

        {/* Price + CTA */}
        <div className="mt-4 flex items-end justify-between gap-3 pt-3 border-t border-border/60">
          <div className="flex items-baseline gap-1">
            {priceValue ? (
              <>
                {priceLabel && <span className="text-xs text-muted-foreground">{priceLabel}</span>}
                <span className={cn("text-2xl font-black tabular-nums text-foreground", priceLabel && "ml-1")}>
                  {priceValue}
                </span>
                {priceUnit && <span className="text-xs text-muted-foreground">{priceUnit}</span>}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Coming soon</span>
            )}
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold",
              "transition-transform duration-200 group-hover:translate-x-0.5",
              CTA_CLS[ctaAccent],
            )}
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}
