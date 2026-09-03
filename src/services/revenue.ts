import { supabaseDb } from "@/integrations/supabase/client";
import { canonicalServiceKey } from "@/services/manifest";
import { fetchAllRows } from "@/lib/supabasePaging";
import { addDaysISO } from "@/lib/timezone";
import type { recognizedCents } from "@/lib/revenueRecognition";

/**
 * Where a vertical's money is, said as data instead of as a branch.
 *
 * `fetchEarned` used to be four `if (source === …)` blocks, and it was one of
 * roughly thirty-four places in the app that knew a vertical by name. That is
 * what makes a bespoke vertical expensive to ADD and a legacy one expensive to
 * DELETE — the same cost, paid twice, and the reason phase 6 has never been
 * affordable.
 *
 * The important property is the DEFAULT. A service you create in
 * /admin/services has no entry here, and that is not an omission: no entry
 * means the universal path — `provider_subscriptions`, scoped by the universal
 * provider id. Adding a service still needs no code, because the absence of a
 * descriptor IS the configuration.
 *
 * Each descriptor belongs beside its vertical once that vertical has a folder
 * (see legacy/ and features/). They are together here while the migration is
 * half-done, so the shape can be judged in one place first.
 */

type RecognitionInput = Parameters<typeof recognizedCents>[0];

export interface RevenueSource {
  /** Table the paid rows live in. */
  table: string;
  select: string;
  /**
   * Which id scopes the rows. `universal` is `providers.id`; `legacy` is the
   * per-service id, which only the verticals that predate the universal model
   * still need — see lib/services/providerBridge.
   */
  scope: "universal" | "legacy";
  /** Column the scope id is matched on. */
  scopeColumn?: string;
  /** Everything else the query must say. */
  where?: (q: any) => any;
  /**
   * Rows a provider owns indirectly. Cleaning sells packages, and its
   * subscriptions point at the package rather than at the business.
   */
  resolveScope?: (legacyId: string) => Promise<{ column: string; ids: string[] } | null>;
  /** One row → what revenue recognition needs from it. */
  toInput: (row: any) => RecognitionInput;
  /** What one row counts as, when the caller wants a count rather than money. */
  units?: (row: any) => number;
}

/**
 * What a service gets when it has said nothing: its plans are `provider_plans`
 * and its sales are `provider_subscriptions`, both keyed by the universal id.
 */
export const UNIVERSAL_REVENUE: RevenueSource = {
  table: "provider_subscriptions",
  select: "price_cents, metadata, created_at, start_date, end_date",
  scope: "universal",
  where: (q) => q.eq("payment_status", "paid"),
  toInput: (r) => ({
    totalCents: r.price_cents || 0,
    serviceStart: r.start_date || r.created_at,
    serviceEnd: r.end_date,
    fallbackDays: 30,
  }),
};

export const REVENUE_SOURCES: Record<string, RevenueSource> = {
  cleaning: {
    table: "cleaning_subscriptions",
    select: "total_price_cents, monthly_price_cents, created_at, service_start_date, service_end_date, start_date, end_date",
    scope: "legacy",
    where: (q) => q.eq("payment_status", "paid").is("deleted_at", null),
    // A cleaning subscription names a package, not a business.
    resolveScope: async (legacyId) => {
      const pkgs = await fetchAllRows<any>(() =>
        supabaseDb.from("cleaning_packages").select("id").eq("provider_id", legacyId).order("id"));
      return { column: "package_id", ids: (pkgs ?? []).map((p) => p.id) };
    },
    toInput: (r) => {
      const total = Number(r.total_price_cents || 0);
      const monthly = Number(r.monthly_price_cents || 0);
      const months = monthly > 0 && total >= monthly ? Math.max(1, Math.round(total / monthly)) : 1;
      return {
        totalCents: total || monthly,
        serviceStart: r.service_start_date || r.start_date || r.created_at,
        serviceEnd: r.service_end_date || r.end_date,
        fallbackDays: months * 30,
      };
    },
  },

  food: {
    table: "food_subscriptions",
    select: "weekly_price_cents, commitment_weeks, periods_paid, created_at, started_at",
    scope: "legacy",
    where: (q) => q.in("status", ["active", "paused", "expired"]).eq("payment_status", "paid"),
    toInput: (r) => {
      const weeks = (r.commitment_weeks || 1) * (r.periods_paid || 1);
      const startDay = r.started_at || r.created_at;
      return {
        totalCents: (r.weekly_price_cents || 0) * weeks,
        serviceStart: startDay,
        serviceEnd: startDay ? addDaysISO(startDay, weeks * 7) : null,
        fallbackDays: weeks * 7,
      };
    },
  },

  /**
   * The beach is the universal path already — its memberships moved to
   * `provider_subscriptions` and the legacy table is their shadow, which would
   * be the same money counted twice. All it adds is what a row counts as: a
   * membership is sold per person.
   */
  beach: {
    ...UNIVERSAL_REVENUE,
    units: (r) => Number(r.metadata?.people) || 0,
  },

  vehicles: {
    table: "rental_bookings",
    select: "total_cents, start_date, end_date, created_at, rental_days",
    scope: "universal",
    where: (q) => q.eq("payment_status", "paid").neq("status", "cancelled").is("deleted_at", null),
    // total_cents is the BASE. The payment surcharge has its own column
    // because it covers the processor's cut; it is never the business's
    // revenue and must never reach a withdrawable balance.
    toInput: (r) => ({
      totalCents: Number(r.total_cents || 0),
      serviceStart: r.start_date || r.created_at,
      serviceEnd: r.end_date,
      fallbackDays: Math.max(1, Number(r.rental_days) || 1),
    }),
  },
};


/** The descriptor for a vertical — the universal one when it has said nothing. */
export function revenueSourceFor(key: string | null | undefined): RevenueSource {
  return REVENUE_SOURCES[canonicalServiceKey(key)] ?? UNIVERSAL_REVENUE;
}
