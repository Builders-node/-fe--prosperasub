import { supabaseDb } from "@/integrations/supabase/client";

/**
 * One shape every plan resolves to, whatever service sells it.
 *
 * There were four checkouts because there were four plan shapes: food knew
 * what a meal was, cleaning knew what a cleaning was, the beach knew what a
 * person cost. None of that belongs in a screen — it is configuration, and
 * since phase A it lives on the plan. This turns any plan id into the same
 * object, so the screen asks the same questions everywhere and only the
 * answers differ.
 *
 * The one thing that stays per service is **where the row is written**. A paid
 * subscription lives in its legacy table and every reader — renewals, access
 * verification, the reconcile cron, the provider's own screens — points there.
 * Moving that is phase F. So: one screen, one model, four writers.
 */

export type CheckoutService = "food" | "cleaning" | "beach" | "universal";

export interface SelectionOption { key: string; label: string }
export interface SelectionGroup {
  key: string;
  label: string;
  min: number;
  max: number;
  options: SelectionOption[];
}

export interface CheckoutPlan {
  service: CheckoutService;
  /** `provider_plans.id` — the universal row, always present. */
  universalId: string;
  /** The id a subscription will carry: the legacy plan id, or the universal one. */
  subjectPlanId: string;
  providerUniversalId: string;
  /** Legacy provider id, for the tables that key off it. */
  providerLegacyId: string | null;
  name: string;
  providerName: string | null;
  description: string | null;
  /** Price for ONE period (and for one person, where the price is per person). */
  unitCents: number;
  period: string;
  periodsMin: number;
  periodsMax: number;
  periodsDefault: number;
  pricingMode: string;
  fulfilment: string;
  selection: SelectionGroup | null;
  /** A delivery needs somewhere to arrive; a visit needs somewhere to happen. */
  needsAddress: boolean;
  /** Whether the service is confined to named residences. */
  needsArea: boolean;
  /** What one period is called, for the summary line. */
  unitLabel: string | null;
  unitQuantity: number | null;
  /** The plan's own photograph, for the line item at the till. */
  image: string | null;
}

const asSelection = (value: unknown): SelectionGroup | null => {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  const options = Array.isArray(g.options)
    ? (g.options as Array<Record<string, unknown>>)
        .map((o) => ({ key: String(o.key), label: String(o.label ?? o.key) }))
        .filter((o) => o.key)
    : [];
  if (!options.length) return null;
  return {
    key: String(g.key ?? "selection"),
    label: String(g.label ?? "Choose"),
    min: Number(g.min ?? 1),
    max: Number(g.max ?? options.length),
    options,
  };
};

/**
 * Resolve any plan id — legacy or universal — into the one shape.
 *
 * A customer arrives holding whichever id their listing knew, so both are
 * accepted rather than making the caller work out which id-space it is in.
 */
export async function resolveCheckoutPlan(planId: string): Promise<CheckoutPlan | null> {
  const { data: rows } = await supabaseDb
    .from("provider_plans")
    .select("*, providers(name, source_provider_id)")
    .or(`id.eq.${planId},source_plan_id.eq.${planId}`)
    .limit(1);

  const row = (rows ?? [])[0] as any;
  if (!row) return null;

  const service: CheckoutService =
    row.source_service_key === "food" ? "food"
    : row.source_service_key === "cleaning" ? "cleaning"
    : row.source_service_key === "beach" ? "beach"
    : "universal";

  const periodsMin = Math.max(1, Number(row.periods_min ?? 1));
  // Unset means one period. Offering more than the provider has said they sell
  // would be the checkout making a commercial decision for them.
  const periodsMax = row.periods_max != null ? Number(row.periods_max) : periodsMin;

  return {
    service,
    universalId: String(row.id),
    subjectPlanId: String(row.source_plan_id ?? row.id),
    providerUniversalId: String(row.provider_id),
    providerLegacyId: row.providers?.source_provider_id ? String(row.providers.source_provider_id) : null,
    name: String(row.name ?? "Plan"),
    providerName: row.providers?.name ? String(row.providers.name) : null,
    description: row.description ?? null,
    unitCents: Number(row.price_cents ?? 0),
    period: String(row.period ?? "monthly"),
    periodsMin,
    periodsMax,
    periodsDefault: Math.max(periodsMin, Number(row.periods_default ?? 1)),
    pricingMode: String(row.pricing_mode ?? "flat"),
    fulfilment: String(row.fulfilment ?? "none"),
    selection: asSelection(row.selection_group),
    needsAddress: row.fulfilment === "deliveries" || row.fulfilment === "visits",
    needsArea: service === "food",
    unitLabel: row.included_unit ?? null,
    unitQuantity: row.included_quantity ?? null,
    image: Array.isArray(row.gallery_urls) && typeof row.gallery_urls[0] === "string"
      ? String(row.gallery_urls[0])
      : null,
  };
}

/** price × periods × people, with people only where the price is per person. */
export function totalFor(plan: CheckoutPlan, periods: number, people: number): number {
  const perPerson = plan.pricingMode === "per_person";
  return plan.unitCents * Math.max(1, periods) * (perPerson ? Math.max(1, people) : 1);
}
