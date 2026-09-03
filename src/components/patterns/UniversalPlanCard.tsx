import { SUBSCRIBE } from "@/lib/checkout/ctaLabel";
import { PlanCard, type PlanCardRating } from "@/components/patterns/PlanCard";
import { includedLabel, periodNoun } from "@/lib/services/planPeriod";

/**
 * A row from the universal `provider_plans` table as a plan card.
 *
 * This is the one for providers with no legacy table at all — the row IS the
 * offer, so everything the card shows has to come out of columns an admin
 * typed into the generic plan form.
 */
export interface UniversalPlan {
  id: string;
  name: string;
  description: string | null;
  price_cents: number | null;
  currency: string | null;
  period: string | null;
  features: unknown;
  included_quantity?: number | null;
  included_unit?: string | null;
  /** The plan's own photographs — the offer editor saves them here. */
  gallery_urls?: unknown;
}

/** The card's photo rule: the plan's own pictures first, the provider's as a
 *  fallback. Never an avatar — that is a logo, and a logo standing in a photo
 *  slot is why two plans of one business could look like different companies. */
function planPhotos(plan: UniversalPlan, providerPhotos?: string[]): string[] | undefined {
  const own = Array.isArray(plan.gallery_urls)
    ? (plan.gallery_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  return own.length ? own : providerPhotos;
}

/**
 * `features` is jsonb and nothing constrains its shape, so an admin can leave
 * it an object, a string, or null. Anything that isn't a list of non-empty
 * strings renders as no list rather than as `[object Object]`.
 */
function featureList(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .map((f) => f.trim());
}

export function UniversalPlanCard({
  plan, onSubscribe, featured = false, rating, photos,
}: {
  plan: UniversalPlan;
  /** Opens the plan's own page. Every caller does this — none buys from here. */
  onSubscribe: (id: string) => void;
  featured?: boolean;
  rating?: PlanCardRating | null;
  photos?: string[];
}) {
  const included = includedLabel(plan.included_quantity, plan.included_unit, plan.period);
  const noun = periodNoun(plan.period);
  const hasPrice = typeof plan.price_cents === "number" && plan.price_cents > 0;

  return (
    <PlanCard
      title={plan.name}
      description={plan.description}
      photos={planPhotos(plan, photos)}
      rating={rating}
      featured={featured}
      // "4 massages a month" is the offer, not a footnote — it goes where the
      // eye lands after the name.
      chips={included ? [{ label: included }] : []}
      features={featureList(plan.features)}
      // A one-off says nothing rather than inventing a billing cycle.
      price={{ cents: plan.price_cents, unit: noun ? `/ ${noun}` : undefined }}
      // Opening is not buying. A plan with no price yet still has a page worth
      // reading — and an offer sold in variants has no price of its own at all,
      // because the prices live on the variants. Tying the card's click to the
      // buy button made those unopenable.
      onOpen={() => onSubscribe(plan.id)}
      cta={{
        label: SUBSCRIBE,
        onClick: () => onSubscribe(plan.id),
        disabled: !hasPrice,
        disabledLabel: "Not bookable yet",
      }}
    />
  );
}
