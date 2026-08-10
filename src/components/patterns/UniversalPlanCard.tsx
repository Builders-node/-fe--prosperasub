import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUSD } from "@/lib/pricing";
import { includedLabel, periodNoun } from "@/lib/services/planPeriod";

/**
 * A plan from the universal `provider_plans` table.
 *
 * Every other plan card on the platform reads a legacy per-service table and
 * knows that table's column names. This one is for providers that have no
 * legacy table at all — the row IS the offer.
 *
 * Same visual language as EntertainmentPlanCard / CleaningPackageCard so a
 * universal provider doesn't look like a different product.
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

/** "monthly" → "/ month". A one-off says nothing rather than inventing a cycle. */
function periodLabel(period: string | null): string {
  const noun = periodNoun(period);
  return noun ? `/ ${noun}` : "";
}

export function UniversalPlanCard({
  plan, onSubscribe, featured = false,
}: {
  plan: UniversalPlan;
  onSubscribe: (id: string) => void;
  featured?: boolean;
}) {
  const features = featureList(plan.features);
  const included = includedLabel(plan.included_quantity, plan.included_unit, plan.period);
  const hasPrice = typeof plan.price_cents === "number" && plan.price_cents > 0;

  return (
    <article
      className={`group flex flex-col rounded-3xl p-5 transition-colors ${
        featured ? "bg-primary/10 hover:bg-primary/15" : "bg-card hover:bg-muted/40"
      }`}
    >
      <h3 className="text-lg font-black tracking-tight text-foreground">{plan.name}</h3>
      {included && (
        <p className="mt-1.5 text-sm font-semibold text-primary">{included}</p>
      )}
      {plan.description && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
      )}

      {features.length > 0 && (
        <ul className="mt-3 space-y-1">
          {features.slice(0, 3).map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-baseline gap-1">
        {hasPrice ? (
          <>
            <span className="text-2xl font-black tabular-nums text-foreground">
              {formatUSD(plan.price_cents!)}
            </span>
            {periodLabel(plan.period) && (
              <span className="text-sm text-muted-foreground">{periodLabel(plan.period)}</span>
            )}
          </>
        ) : (
          // A plan with no price is a half-finished admin entry. Saying so beats
          // rendering "$0.00" next to a Subscribe button.
          <span className="text-sm font-semibold text-muted-foreground">Price on request</span>
        )}
      </div>

      <Button
        size="lg"
        className="mt-4 h-12 w-full rounded-2xl text-base font-bold"
        disabled={!hasPrice}
        onClick={() => onSubscribe(plan.id)}
      >
        {hasPrice ? "Subscribe" : "Not bookable yet"}
        {hasPrice && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </article>
  );
}
