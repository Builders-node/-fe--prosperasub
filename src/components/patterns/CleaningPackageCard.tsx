import { SUBSCRIBE } from "@/lib/checkout/ctaLabel";
import { CalendarDays } from "lucide-react";
import { PlanCard, type PlanCardRating } from "@/components/patterns/PlanCard";
import type { PlanOffer } from "@/hooks/usePlanOffers";
import { resolveMonthlyPriceCents, formatFrequencyLabel } from "@/lib/cleaningPlanPricing";

/**
 * A `cleaning_packages` row as a plan card.
 *
 * All the rendering lives in PlanCard; this only knows what cleaning's columns
 * mean — that the price the customer compares is the monthly one however the
 * package is priced underneath, and that frequency is worth a chip.
 */
export function CleaningPackageCard({
  pkg, onSubscribe, featured = false, rating, photos, offer,
}: {
  pkg: any;
  onSubscribe: (id: string) => void;
  featured?: boolean;
  rating?: PlanCardRating | null;
  photos?: string[];
  /**
   * Set when this package is the cheapest variant of an offer — Studio / 1BR /
   * 2BR are one service at three sizes. The card then speaks for the offer and
   * the size is chosen at checkout.
   */
  offer?: PlanOffer | null;
}) {
  return (
    <PlanCard
      title={offer?.name ?? pkg.name}
      description={offer?.description ?? pkg.description}
      photos={photos}
      rating={rating}
      featured={featured}
      chips={
        offer
          ? [
              { icon: CalendarDays, label: formatFrequencyLabel(pkg) },
              ...offer.groups.map((g) => ({
                label: g.options.map((o) => o.label).join(" · "),
              })),
            ]
          // The pricing label ("$29.00/month") used to sit here; on the row
          // card it lands two words from the price itself and says it twice.
          : [{ icon: CalendarDays, label: formatFrequencyLabel(pkg) }]
      }
      features={offer ? [] : (Array.isArray(pkg.features) ? pkg.features : [])}
      price={{
        cents: offer?.fromCents ?? resolveMonthlyPriceCents(pkg),
        unit: "/ month",
        from: !!offer,
      }}
      cta={{ label: SUBSCRIBE, onClick: () => onSubscribe(pkg.id) }}
    />
  );
}
