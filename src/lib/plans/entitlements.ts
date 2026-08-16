import type { PlanPeriod } from "@/lib/services/planPeriod";

/**
 * What a plan gives you, as a list rather than a single number.
 *
 * A plan used to be one thing with one quantity: "4 cleanings a month" was
 * expressible, "4 cleanings and 2 deep cleans" was not, and neither was
 * "membership plus 4 court hours". Every service had exactly the same shape
 * and every service had the same ceiling.
 *
 * One line per thing the customer gets. Cleaning has one, a beach membership
 * that includes court time has two, and a restaurant still has one — so the
 * model is not more complicated for the providers who never needed it.
 */
export interface Entitlement {
  /** Singular noun the customer reads: "cleaning", "meal", "hour", "access". */
  unit: string;
  /** How many per period. `null` is unlimited — that is what access means. */
  quantity: number | null;
  /** Refresh cycle. `null` inherits the plan's own period. */
  period: PlanPeriod | null;
  /** Bookable resources this line applies to. Empty = all of the provider's. */
  resourceIds: string[];
}

/** The word for a line that grants entry rather than a countable allowance. */
export const ACCESS_UNIT = "access";

export const EMPTY_ENTITLEMENT: Entitlement = {
  unit: "", quantity: null, period: null, resourceIds: [],
};

const asIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

/** One line, however it was stored. */
export function normalizeEntitlement(raw: unknown): Entitlement | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const unit = String(e.unit ?? "").trim();
  if (!unit) return null;
  const q = Number(e.quantity);
  return {
    unit,
    quantity: Number.isFinite(q) && q > 0 ? Math.floor(q) : null,
    period: (e.period as PlanPeriod) ?? null,
    resourceIds: asIds(e.resource_ids ?? (e as { resourceIds?: unknown }).resourceIds),
  };
}

/**
 * The plan's lines, or the one line its legacy columns describe.
 *
 * Every plan was backfilled, so the fallback is for rows written by something
 * that has not learned about the column yet — the legacy mirror trigger, an
 * older client. It keeps such a plan behaving exactly as it did.
 */
export function readEntitlements(plan: {
  entitlements?: unknown;
  included_quantity?: number | null;
  included_unit?: string | null;
  resource_ids?: unknown;
}): Entitlement[] {
  const list = Array.isArray(plan.entitlements)
    ? plan.entitlements.map(normalizeEntitlement).filter((e): e is Entitlement => !!e)
    : [];
  if (list.length) return list;

  const unit = (plan.included_unit ?? "").trim();
  if (!unit && plan.included_quantity == null) {
    return [{ ...EMPTY_ENTITLEMENT, unit: ACCESS_UNIT, resourceIds: asIds(plan.resource_ids) }];
  }
  return [{
    unit: unit || ACCESS_UNIT,
    quantity: plan.included_quantity ?? null,
    period: null,
    resourceIds: asIds(plan.resource_ids),
  }];
}

/** For writing back — the DB spells it `resource_ids`. */
export function serializeEntitlements(list: Entitlement[]): unknown[] {
  return list
    .filter((e) => e.unit.trim())
    .map((e) => ({
      unit: e.unit.trim(),
      quantity: e.quantity && e.quantity > 0 ? Math.floor(e.quantity) : null,
      period: e.period ?? null,
      resource_ids: e.resourceIds,
    }));
}

/**
 * English plurals, to the depth this needs: a provider types the unit and the
 * platform reads it back to a customer, and "Unlimited deliverys a week" is
 * the sort of thing that makes a shop look unfinished.
 */
function plural(unit: string): string {
  const u = unit.trim();
  if (!u) return u;
  if (/(s|x|z|ch|sh)$/i.test(u)) return `${u}es`;
  if (/[^aeiou]y$/i.test(u)) return `${u.slice(0, -1)}ies`;
  return `${u}s`;
}

/**
 * "4 cleanings a month · 2 hours a month" — what the customer is told.
 *
 * An access line says so instead of pretending to a quantity, and a line
 * inherits the plan's period when it has none of its own.
 */
export function describeEntitlement(e: Entitlement, planPeriod: string | null): string {
  const period = e.period ?? planPeriod;
  const per = period === "weekly" ? "a week"
    : period === "monthly" ? "a month"
    : period === "quarterly" ? "a quarter"
    : period === "yearly" ? "a year" : "";
  if (e.unit === ACCESS_UNIT) return per ? `Unlimited access ${per}` : "Unlimited access";
  if (e.quantity == null) return per ? `Unlimited ${plural(e.unit)} ${per}` : `Unlimited ${plural(e.unit)}`;
  const noun = e.quantity === 1 ? e.unit : plural(e.unit);
  return per ? `${e.quantity} ${noun} ${per}` : `${e.quantity} ${noun}`;
}
