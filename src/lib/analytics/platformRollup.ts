import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import {
  effectiveBeachStatus,
  effectiveCleaningStatus,
  effectiveFoodStatus,
} from "@/lib/subscriptionLifecycle";
import { nowHN, todayHN } from "@/lib/timezone";

/**
 * The platform's subscriptions, normalized once.
 *
 * Three tables, three price shapes, three lifecycle columns — and, until this
 * module existed, three hand-written copies of the same reduce loop (Overview,
 * Finance, and whatever the next page needed). They agreed only because
 * someone kept noticing when they stopped.
 *
 * One rule, applied to every service:
 *
 *   revenue  = payment_status is 'paid' AND the sub was not cancelled,
 *              counted at its full committed value (the whole service period,
 *              renewals included) and bucketed by `created_at`
 *   active   = paid AND effectively running today in Honduras — "effectively"
 *              because the expire-sweep cron is a lagging indicator and a sub
 *              whose end_date passed last night is not an active subscription
 *              just because nothing has flipped the column yet
 *   awaiting = not paid, not cancelled, not expired: the approval queue
 *
 * This is a cash-committed view bucketed by sale date, which is what the
 * Overview and Analytics tiles ask for. It is deliberately NOT the Finance
 * breakdown's straight-line recognition (`lib/revenueRecognition.ts`) — that
 * one answers "what did this week earn", which is a different question with a
 * different answer, and the two must not be mixed in one figure.
 */

export type RollupServiceKey = "cleaning" | "food" | "beach";

export const ROLLUP_SERVICES: { key: RollupServiceKey; label: string }[] = [
  { key: "cleaning", label: "Cleaning" },
  { key: "food", label: "Food" },
  { key: "beach", label: "Beach Club" },
];

/** How many months the revenue series covers, current month last. */
export const ROLLUP_MONTHS = 6;

export interface ServiceRollup {
  key: RollupServiceKey;
  label: string;
  /** Every row in the service's table (minus soft-deleted ones). */
  subs: number;
  active: number;
  paused: number;
  cancelled: number;
  expired: number;
  /** Sold but not paid for — the admin's approval queue. */
  awaitingPayment: number;
  /** Distinct customers who ever bought this service. */
  customers: number;
  revenueCents: number;
  /** Revenue from subs sold this calendar month (Honduras). */
  monthRevenueCents: number;
  /** Cents per month, oldest → newest, aligned with `PlatformRollup.months`. */
  monthly: number[];
}

/** Everything an analytics view needs about a population of subscriptions. */
export type RollupFigures = Omit<ServiceRollup, "key" | "label">;

export interface PlatformRollup {
  /** Short month labels, oldest → newest ("Mar" … "Aug"). */
  months: string[];
  services: ServiceRollup[];
  byKey: Record<RollupServiceKey, ServiceRollup>;
  /** The same figures summed across services. */
  totals: RollupFigures;
  /**
   * Every subscription, normalized. Handed out so a per-service page can break
   * the SAME rows down by plan or provider instead of re-fetching the table and
   * re-deciding what counts as revenue.
   */
  rows: NormRow[];
}

/** One subscription, whatever table it came from. */
export interface NormRow {
  service: RollupServiceKey;
  /** Full committed value of the sale, in cents. */
  valueCents: number;
  paid: boolean;
  /** Effective lifecycle: active | paused | cancelled | expired | pending. */
  status: string;
  createdAt: string | null;
  /** Whoever bought it, for the distinct-customer count. */
  customerKey: string | null;
  /** What was bought (plan/package id) and from whom (provider id). */
  planKey: string | null;
  providerKey: string | null;
  /**
   * Where it is delivered, when the service records one (food's residence).
   * Null elsewhere — cleaning keeps its address on the booking, not the sub.
   */
  locationKey: string | null;
}

const num = (v: unknown) => Number(v) || 0;

const isRevenue = (r: NormRow) => r.paid && r.status !== "cancelled";

const isAwaiting = (r: NormRow) =>
  !r.paid && !["cancelled", "expired"].includes(r.status);

/**
 * Rows grouped into a revenue ranking — by plan, by provider, by anything the
 * caller can pull a key out of. Revenue obeys the same rule as every other
 * figure in this module, so a per-plan breakdown always adds up to the total
 * sitting above it.
 */
export interface RevenueGroup { key: string; label: string; revenueCents: number; subs: number }

export function groupRevenue(
  rows: NormRow[],
  keyOf: (r: NormRow) => string | null,
  nameOf: (key: string) => string | undefined,
  unassignedLabel = "Unassigned",
): RevenueGroup[] {
  const out = new Map<string, RevenueGroup>();
  rows.forEach((r) => {
    const key = keyOf(r) ?? "__none__";
    const group = out.get(key) ?? {
      key,
      // A row whose plan was deleted still happened; naming it after its id
      // would be worse than admitting we no longer know what it was.
      label: key === "__none__" ? unassignedLabel : nameOf(key) ?? "Unknown",
      revenueCents: 0,
      subs: 0,
    };
    group.subs++;
    if (isRevenue(r)) group.revenueCents += r.valueCents;
    out.set(key, group);
  });
  return [...out.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.subs - a.subs);
}

export async function fetchPlatformRollup(): Promise<PlatformRollup> {
  // Paged, not plain selects: every one of these rows is reduced into a money
  // figure, and PostgREST truncates a plain `.select()` at 1000 rows with a
  // perfectly cheerful HTTP 200. See lib/supabasePaging.ts.
  const [cleaning, food, beach] = await Promise.all([
    fetchAllRows<any>(() => supabaseDb
      .from("cleaning_subscriptions")
      .select("user_id, created_at, payment_status, subscription_status, is_active, total_price_cents, monthly_price_cents, service_end_date, end_date, paid_until, package_id, provider_id")
      .is("deleted_at", null).order("id")),
    fetchAllRows<any>(() => supabaseDb
      .from("food_subscriptions")
      .select("user_id, created_at, payment_status, status, weekly_price_cents, commitment_weeks, periods_paid, end_date, meal_plan_id, provider_id, residence")
      .order("id")),
    fetchAllRows<any>(() => supabaseDb
      .from("provider_subscriptions")
      .select("user_id, created_at, payment_status, status, price_cents, end_date, plan_id, provider_id")
      .eq("source_service_key", "beach").order("id")),
  ]);

  const today = todayHN();
  const rows: NormRow[] = [
    ...cleaning.map((r: any): NormRow => ({
      service: "cleaning",
      // A cleaning sub carries the whole plan in `total_price_cents`; the
      // monthly figure is the fallback for the older single-month rows.
      valueCents: num(r.total_price_cents) || num(r.monthly_price_cents),
      paid: r.payment_status === "paid",
      status: effectiveCleaningStatus(r, today),
      createdAt: r.created_at,
      customerKey: r.user_id ? String(r.user_id) : null,
      planKey: r.package_id ? String(r.package_id) : null,
      providerKey: r.provider_id ? String(r.provider_id) : null,
      locationKey: null,
    })),
    ...food.map((r: any): NormRow => ({
      service: "food",
      // Food is priced by the week: weekly × the weeks committed to × the
      // number of times that commitment has been paid for (renewals).
      valueCents: num(r.weekly_price_cents) * (num(r.commitment_weeks) || 1) * (num(r.periods_paid) || 1),
      paid: r.payment_status === "paid",
      status: effectiveFoodStatus(r, today),
      createdAt: r.created_at,
      customerKey: r.user_id ? String(r.user_id) : null,
      planKey: r.meal_plan_id ? String(r.meal_plan_id) : null,
      providerKey: r.provider_id ? String(r.provider_id) : null,
      locationKey: String(r.residence ?? "").trim() || null,
    })),
    ...beach.map((r: any): NormRow => ({
      service: "beach",
      valueCents: num(r.price_cents),
      paid: r.payment_status === "paid",
      status: effectiveBeachStatus(r, today),
      createdAt: r.created_at,
      customerKey: r.user_id ? String(r.user_id) : null,
      planKey: r.plan_id ? String(r.plan_id) : null,
      providerKey: r.provider_id ? String(r.provider_id) : null,
      locationKey: null,
    })),
  ];

  // Month boundaries follow Honduras wall-clock — the browser's timezone rolls
  // the month over at the wrong moment for an admin who is travelling.
  const now = nowHN();
  const buckets = Array.from({ length: ROLLUP_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (ROLLUP_MONTHS - 1) + i, 1);
    return { label: format(d, "MMM"), start: startOfMonth(d), end: endOfMonth(d) };
  });

  const services = ROLLUP_SERVICES.map(({ key, label }) => {
    const mine = rows.filter((r) => r.service === key);
    const earning = mine.filter(isRevenue);
    const monthly = buckets.map((b) => earning.reduce((sum, r) => {
      if (!r.createdAt) return sum;
      const d = parseISO(r.createdAt);
      return d >= b.start && d <= b.end ? sum + r.valueCents : sum;
    }, 0));
    return {
      key,
      label,
      subs: mine.length,
      active: mine.filter((r) => r.paid && r.status === "active").length,
      paused: mine.filter((r) => r.status === "paused").length,
      cancelled: mine.filter((r) => r.status === "cancelled").length,
      expired: mine.filter((r) => r.status === "expired").length,
      awaitingPayment: mine.filter(isAwaiting).length,
      customers: new Set(mine.map((r) => r.customerKey).filter(Boolean)).size,
      revenueCents: earning.reduce((s, r) => s + r.valueCents, 0),
      monthRevenueCents: monthly[monthly.length - 1] ?? 0,
      monthly,
    } satisfies ServiceRollup;
  });

  const sum = (pick: (s: ServiceRollup) => number) => services.reduce((t, s) => t + pick(s), 0);

  return {
    months: buckets.map((b) => b.label),
    services,
    rows,
    byKey: Object.fromEntries(services.map((s) => [s.key, s])) as Record<RollupServiceKey, ServiceRollup>,
    totals: {
      subs: sum((s) => s.subs),
      active: sum((s) => s.active),
      paused: sum((s) => s.paused),
      cancelled: sum((s) => s.cancelled),
      expired: sum((s) => s.expired),
      awaitingPayment: sum((s) => s.awaitingPayment),
      // Counted across services, so someone who buys cleaning AND food is one
      // customer of the platform, not two.
      customers: new Set(rows.map((r) => r.customerKey).filter(Boolean)).size,
      revenueCents: sum((s) => s.revenueCents),
      monthRevenueCents: sum((s) => s.monthRevenueCents),
      monthly: buckets.map((_, i) => sum((s) => s.monthly[i] ?? 0)),
    },
  };
}
