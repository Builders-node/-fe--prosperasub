import type { CheckoutPlan } from "@/lib/checkout/planCheckoutModel";
import { periodNoun, termOptionsFor } from "@/lib/services/planPeriod";

/**
 * THE rule for "how long" and "how many" — one function, read by the checkout
 * and by the cart, so the same plan offers the same choices on both.
 *
 * It used to be two rules: the checkout asked the plan (its period, the
 * provider's min/max, whether the price is per person), the cart asked a fixed
 * per-service table. So a beach membership offered "How many: 1 person" on the
 * checkout and no quantity at all in the cart (it was a `plan` line there,
 * where quantity was switched off), and a provider's term cap reached one
 * screen and not the other.
 *
 *   How long — the usual terms for the plan's billing period
 *              (weekly 1/2/4/8/12 · monthly 1/3/6/12 · quarterly 1/2/4 ·
 *              yearly 1/2), inside the provider's periods_min/max. A one-time
 *              purchase has no term.
 *   How many — portions for food (each portion is its own subscription);
 *              people for a per-person price (one membership, N people);
 *              nothing otherwise — a second cleaning of the same flat is not
 *              a quantity.
 */
export interface OrderShape {
  termOptions: number[];
  /** "week", "month"… singular; "" for a one-time purchase. */
  periodNoun: string;
  quantity: { noun: "portion" | "person"; max: number } | null;
}

export function orderShape(plan: Pick<CheckoutPlan, "service" | "period" | "periodsMin" | "periodsMax" | "oneTime" | "pricingMode">): OrderShape {
  const min = Math.max(1, plan.periodsMin || 1);
  const max = Math.max(min, plan.periodsMax || min);
  const termOptions = plan.oneTime ? [] : [...new Set([...termOptionsFor(plan.period), min, max])]
    .filter((n) => n >= min && n <= max)
    .sort((a, b) => a - b);
  const quantity = plan.service === "food" ? { noun: "portion" as const, max: 20 }
    : plan.pricingMode === "per_person" ? { noun: "person" as const, max: 20 }
    : null;
  return { termOptions, periodNoun: plan.oneTime ? "" : periodNoun(plan.period), quantity };
}
