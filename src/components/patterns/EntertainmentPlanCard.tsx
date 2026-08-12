import { PlanCard, type PlanCardRating } from "@/components/patterns/PlanCard";

/**
 * A `beach_club_plans` row as a plan card.
 *
 * Beach memberships price per person, so the unit says so — the same number
 * next to "/ month" would read as a household price and undercount a family
 * by a factor of four at checkout.
 */
export function EntertainmentPlanCard({
  plan, onSubscribe, featured, rating, photos,
}: {
  plan: any;
  onSubscribe: (id: string) => void;
  featured?: boolean;
  rating?: PlanCardRating | null;
  photos?: string[];
}) {
  return (
    <PlanCard
      title={plan.name}
      description={plan.tagline}
      photos={photos}
      rating={rating}
      featured={featured ?? !!plan.featured}
      features={Array.isArray(plan.amenities) ? plan.amenities : []}
      price={{ cents: plan.price_per_person_cents, unit: "/ person · month" }}
      cta={{ label: "Subscribe", onClick: () => onSubscribe(plan.id) }}
    />
  );
}
