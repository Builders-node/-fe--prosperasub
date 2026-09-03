import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Offers and their variants.
 *
 * A provider that sells the same thing along a couple of axes — 5 or 6 days a
 * week × 1, 2 or 3 meals a day; a studio, a one-bed or a two-bed — used to
 * reach the customer as one card per combination. An offer is the parent plan
 * a customer sees; its variants are the rows that were those cards, each
 * keeping its own price and its own legacy id.
 *
 * Everything downstream still works on the legacy id: `variant.sourcePlanId`
 * is what the checkout, the weekly menus and every existing subscription know
 * a plan by. Picking options is therefore only ever a lookup that ends in one
 * of those ids — no new checkout, no new payment state.
 */

export interface PlanOption {
  key: string;
  label: string;
}

export interface PlanOptionGroup {
  key: string;
  label: string;
  options: PlanOption[];
}

export interface PlanVariant {
  id: string;
  name: string;
  priceCents: number;
  status: string;
  /** {"days":"5","meals_per_day":"2"} */
  optionKeys: Record<string, string>;
  /** The legacy row this variant IS — food_meal_plans.id, cleaning_packages.id. */
  sourcePlanId: string | null;
  /** monthly | weekly | yearly — a variant may be billed differently. */
  period: string | null;
  /**
   * What THIS combination includes.
   *
   * A variant is the thing being bought, so it owns the answer: Mon–Sat with
   * three meals a day is eighteen meals a week, and the offer above it cannot
   * say that for every combination at once.
   */
  entitlements: unknown;
}

/**
 * The axis a provider gets for free.
 *
 * "One plan, several prices depending on how often you pay" needs no new
 * storage: a variant already has its own `period` and its own `price_cents`.
 * When an offer's variants disagree about the period, that difference IS an
 * axis, and it is presented like any other — so a provider adds a yearly price
 * by adding a variant, not by learning a second concept.
 */
export const BILLING_PERIOD_GROUP = "billing_period";

const PERIOD_LABELS: Record<string, string> = {
  weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
  one_time: "One-time",
};

/** "/ month" — what goes beside a price. */
const PERIOD_UNITS: Record<string, string> = {
  weekly: "/ week", monthly: "/ month", quarterly: "/ quarter", yearly: "/ year",
};
export const periodUnit = (p: string | null | undefined) => (p && PERIOD_UNITS[p]) || "";

export const periodLabel = (p: string | null | undefined) =>
  (p && PERIOD_LABELS[p]) || (p ? p[0].toUpperCase() + p.slice(1) : "");

export interface PlanOffer {
  id: string;
  providerId: string;
  name: string;
  description: string | null;
  period: string | null;
  sourceServiceKey: string | null;
  groups: PlanOptionGroup[];
  variants: PlanVariant[];
  /** The cheapest variant — what "from $40" on the card means. */
  fromCents: number | null;
}

const asOptionKeys = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
  );
};

/** Does this variant match every option the customer has picked so far? */
export function variantMatches(variant: PlanVariant, selection: Record<string, string>): boolean {
  return Object.entries(selection).every(([group, option]) => variant.optionKeys[group] === option);
}

/** The variant for a full selection, or null when that combination isn't sold. */
export function findVariant(offer: PlanOffer, selection: Record<string, string>): PlanVariant | null {
  return offer.variants.find((v) => variantMatches(v, selection)) ?? null;
}

/**
 * The selection that lands on a given variant — used to open the picker
 * already showing what the customer clicked through to.
 */
export function selectionFor(variant: PlanVariant): Record<string, string> {
  return { ...variant.optionKeys };
}

/**
 * Every offer for a set of providers, keyed by universal provider id.
 *
 * `providerIds` may be empty on the first render while the provider query is
 * still in flight; the hook simply doesn't fetch until it has something.
 */
export function usePlanOffers(
  providerIds: Array<string | null | undefined>,
  opts?: { legacyService?: string },
) {
  const ids = Array.from(new Set(providerIds.filter((id): id is string => !!id))).sort();
  const legacyService = opts?.legacyService ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["plan-offers", legacyService, ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PlanOffer[]> => {
      // Callers holding legacy ids (the food listing knows food_providers.id)
      // get bridged here rather than at every call site — same escape hatch as
      // useProviderRatings. See lib/services/providerBridge for the id-spaces.
      let universalIds = ids;
      if (legacyService) {
        const { data: bridge, error: bridgeError } = await supabaseDb
          .from("providers")
          .select("id, source_provider_id")
          .eq("source_service_key", legacyService)
          .in("source_provider_id", ids);
        if (bridgeError) throw bridgeError;
        universalIds = (bridge ?? []).map((r: any) => String(r.id));
        if (!universalIds.length) return [];
      }

      // Offers first: a plan with no parent that some other plan points at.
      const { data: plans, error } = await supabaseDb
        .from("provider_plans")
        .select("id, provider_id, name, description, period, status, price_cents, parent_plan_id, option_keys, entitlements, source_service_key, source_plan_id, sort_order")
        .in("provider_id", universalIds)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const rows = plans ?? [];
      const variantsByParent = new Map<string, PlanVariant[]>();
      rows.forEach((r: any) => {
        if (!r.parent_plan_id) return;
        const list = variantsByParent.get(String(r.parent_plan_id)) ?? [];
        list.push({
          id: String(r.id),
          name: r.name,
          priceCents: Number(r.price_cents ?? 0),
          status: r.status,
          optionKeys: asOptionKeys(r.option_keys),
          sourcePlanId: r.source_plan_id ? String(r.source_plan_id) : null,
          period: r.period ?? null,
          entitlements: r.entitlements ?? null,
        });
        variantsByParent.set(String(r.parent_plan_id), list);
      });

      const offerRows = rows.filter((r: any) => !r.parent_plan_id && variantsByParent.has(String(r.id)));
      if (!offerRows.length) return [];

      const offerIds = offerRows.map((r: any) => String(r.id));

      // Groups with their options nested, in one round trip.
      //
      // These were two queries, and the second asked for `plan_options` with
      // no filter at all — every option row on the platform, downloaded to
      // pick out the handful belonging to these offers, and silently clipped
      // at PostgREST's 1000-row ceiling once there are that many. Embedding
      // scopes the options to the groups we actually asked for and takes a
      // wave off the listing's load.
      const { data: groups, error: groupsError } = await supabaseDb
        .from("plan_option_groups")
        .select("id, plan_id, key, label, sort_order, plan_options(key, label, sort_order)")
        .in("plan_id", offerIds)
        .order("sort_order", { ascending: true });
      if (groupsError) throw groupsError;

      const groupsByPlan = new Map<string, PlanOptionGroup[]>();
      (groups ?? []).forEach((g: any) => {
        const list = groupsByPlan.get(String(g.plan_id)) ?? [];
        const options: PlanOption[] = [...(g.plan_options ?? [])]
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((o: any) => ({ key: String(o.key), label: o.label }));
        list.push({ key: String(g.key), label: g.label, options });
        groupsByPlan.set(String(g.plan_id), list);
      });

      return offerRows.map((r: any) => {
        const variants = variantsByParent.get(String(r.id)) ?? [];

        /**
         * Periods become a group only when they actually differ — an offer
         * whose variants are all monthly must not grow a one-chip row saying
         * "Monthly".
         */
        const periods = [...new Set(variants.map((v) => v.period).filter(Boolean))] as string[];
        const periodGroup: PlanOptionGroup[] = periods.length > 1
          ? [{
              key: BILLING_PERIOD_GROUP,
              label: "Billing period",
              options: periods.map((p) => ({ key: p, label: periodLabel(p) })),
            }]
          : [];
        // The variant has to answer for the axis it is being matched on.
        if (periodGroup.length) {
          variants.forEach((v) => {
            if (v.period) v.optionKeys[BILLING_PERIOD_GROUP] = v.period;
          });
        }
        const prices = variants.map((v) => v.priceCents).filter((n) => n > 0);
        return {
          id: String(r.id),
          providerId: String(r.provider_id),
          name: r.name,
          description: r.description ?? null,
          period: r.period ?? null,
          sourceServiceKey: r.source_service_key ?? null,
          groups: [...(groupsByPlan.get(String(r.id)) ?? []), ...periodGroup],
          variants,
          fromCents: prices.length ? Math.min(...prices) : null,
        };
      });
    },
  });

  const offers = data ?? [];

  /**
   * legacy plan id → the offer that now sells it. This is the lookup a listing
   * needs: it holds legacy rows and has to know which of them have collapsed
   * into one card.
   */
  const offerBySourcePlanId = new Map<string, PlanOffer>();
  offers.forEach((offer) => {
    offer.variants.forEach((v) => {
      if (v.sourcePlanId) offerBySourcePlanId.set(v.sourcePlanId, offer);
    });
  });

  return { offers, offerBySourcePlanId, isLoading };
}
