import { SparklesIcon, CalendarDays } from "lucide-react";
import { PlanCard, type PlanCardRating } from "@/components/patterns/PlanCard";
import { resolveMonthlyPriceCents, formatFrequencyLabel, formatPricingLabel } from "@/lib/cleaningPlanPricing";

/**
 * A `cleaning_packages` row as a plan card.
 *
 * All the rendering lives in PlanCard; this only knows what cleaning's columns
 * mean — that the price the customer compares is the monthly one however the
 * package is priced underneath, and that frequency is worth a chip.
 */
export function CleaningPackageCard({
  pkg, onSubscribe, featured = false, rating, photos,
}: {
  pkg: any;
  onSubscribe: (id: string) => void;
  featured?: boolean;
  rating?: PlanCardRating | null;
  photos?: string[];
}) {
  return (
    <PlanCard
      title={pkg.name}
      description={pkg.description}
      photos={photos}
      rating={rating}
      featured={featured}
      chips={[
        { icon: SparklesIcon, label: formatPricingLabel(pkg) },
        { icon: CalendarDays, label: formatFrequencyLabel(pkg) },
      ]}
      features={Array.isArray(pkg.features) ? pkg.features : []}
      price={{ cents: resolveMonthlyPriceCents(pkg), unit: "/ month" }}
      cta={{ label: "Subscribe", onClick: () => onSubscribe(pkg.id) }}
    />
  );
}
