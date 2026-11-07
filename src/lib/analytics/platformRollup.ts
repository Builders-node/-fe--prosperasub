import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { nowHN } from "@/lib/timezone";
import {
  fetchServiceIndex, serviceOfSale, visibleServices, type SaleSource, type ServiceIndex,
} from "@/lib/analytics/serviceIndex";

/**
 * The platform's subscriptions, normalized once.
 *
 * Three tables, three price shapes, three lifecycle columns — and, until this
 * module existed, three hand-written copies of the same reduce loop (Overview,
 * Finance, and whatever the next page needed). They agreed only because
 * someone kept noticing when they stopped.
 *
 * The normalisation itself now lives in the database, as the
 * `subscriptions_unified` view: one row shape for all three tables, which any
 * reader — SQL, this app, the backend — can use without repeating the rules.
 * This module is what turns those rows into the figures a screen shows.
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

/**
 * A service key — an archetype from Settings → Services, or `vehicles` /
 * `unassigned` (lib/analytics/serviceIndex.ts). It used to be the read model's
 * source arm (cleaning · food · beach · plan · cars), which called a business
 * ("Beach Club") a service and lumped every new service into "Other services".
 */
export type RollupServiceKey = string;

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
  /** Provider → service, and the services' names — for any breakdown below. */
  index: ServiceIndex;
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
  /** The service it counts under (archetype key, `vehicles`, `unassigned`). */
  service: RollupServiceKey;
  /** The table it came from — what the bespoke pages and payment approval need. */
  source: SaleSource;
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
  // One query, one shape. `subscriptions_unified` is the DB view that folds
  // the three subscription tables into a single row shape — full committed
  // value, effective status, universal provider id — so this module no longer
  // reimplements three price formulas and three status vocabularies in
  // TypeScript. See the view's COMMENT for the rules it applies.
  //
  // Paged: every row here is reduced into a money figure, and PostgREST
  // truncates a plain select at 1000 rows with a cheerful HTTP 200.
  const [raw, index] = await Promise.all([
    fetchAllRows<any>(() => supabaseDb
      .from("subscriptions_unified")
      .select("service, id, provider_id, plan_id, user_id, price_cents, paid, status, created_at, location")
      .order("service")
      .order("id")),
    fetchServiceIndex(),
  ]);
  const rows: NormRow[] = raw
    .map((r: any): NormRow => ({
      service: serviceOfSale(r, index),
      source: r.service as SaleSource,
      valueCents: num(r.price_cents),
      paid: !!r.paid,
      status: String(r.status ?? ""),
      createdAt: r.created_at,
      customerKey: r.user_id ? String(r.user_id) : null,
      planKey: r.plan_id ? String(r.plan_id) : null,
      providerKey: r.provider_id ? String(r.provider_id) : null,
      locationKey: r.location ? String(r.location) : null,
    }));

  // Month boundaries follow Honduras wall-clock — the browser's timezone rolls
  // the month over at the wrong moment for an admin who is travelling.
  const now = nowHN();
  const buckets = Array.from({ length: ROLLUP_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (ROLLUP_MONTHS - 1) + i, 1);
    return { label: format(d, "MMM"), start: startOfMonth(d), end: endOfMonth(d) };
  });

  // A service gets a row when it is switched on or has earned something —
  // so Vehicles and Unassigned appear only once there is money in them.
  const earned = rows.filter((r) => isRevenue(r) && r.valueCents > 0).map((r) => r.service);
  const services = visibleServices(index, earned).map(({ key, label }) => {
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
    index,
    months: buckets.map((b) => b.label),
    services,
    rows,
    byKey: Object.fromEntries(services.map((s) => [s.key, s])) as Record<RollupServiceKey, ServiceRollup>,
    totals: {
      // Counted over every row, not the visible services, so a sale in a
      // bucket without a row of its own (an unpaid car, say) still counts.
      subs: rows.length,
      active: rows.filter((r) => r.paid && r.status === "active").length,
      paused: rows.filter((r) => r.status === "paused").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      expired: rows.filter((r) => r.status === "expired").length,
      awaitingPayment: rows.filter(isAwaiting).length,
      // Counted across services, so someone who buys cleaning AND food is one
      // customer of the platform, not two.
      customers: new Set(rows.map((r) => r.customerKey).filter(Boolean)).size,
      revenueCents: sum((s) => s.revenueCents),
      monthRevenueCents: sum((s) => s.monthRevenueCents),
      monthly: buckets.map((_, i) => sum((s) => s.monthly[i] ?? 0)),
    },
  };
}

// ─── Periods ──────────────────────────────────────────────────────────────────
//
// "What came in this week" had no answer: every figure on Today and Analytics
// was all-time. A period narrows the FLOW figures — revenue, sales, buyers —
// to sales made inside a rolling window, and compares them with the window
// just before it. Stock figures (active, awaiting payment) are "right now" and
// do not take a period; a page says so rather than pretending to slice them.
// Rolling windows are measured from this instant, so they need no timezone.

export type RollupPeriod = "7d" | "30d" | "90d" | "12m" | "all";

export const ROLLUP_PERIODS: { key: RollupPeriod; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
];

export const parseRollupPeriod = (raw: string | null | undefined, fallback: RollupPeriod = "30d"): RollupPeriod =>
  ROLLUP_PERIODS.some((p) => p.key === raw) ? (raw as RollupPeriod) : fallback;

export const periodLabel = (p: RollupPeriod) =>
  p === "all" ? "all time" : `last ${ROLLUP_PERIODS.find((x) => x.key === p)!.label}`;

export interface PeriodFigures {
  period: RollupPeriod;
  /** "last 30 days" / "all time" — for a KPI label. */
  label: string;
  revenueCents: number;
  /** Paid, non-cancelled sales made in the window. */
  sales: number;
  /** Distinct buyers of those sales. */
  customers: number;
  /** The same figures for the window just before; null for "all time". */
  prevRevenueCents: number | null;
  prevSales: number | null;
}

const DAY_MS = 86_400_000;

/** Rows sold inside the window — every row for "all time". */
export function rowsInPeriod(rows: NormRow[], period: RollupPeriod, offsetWindows = 0, now = Date.now()): NormRow[] {
  const days = ROLLUP_PERIODS.find((p) => p.key === period)?.days ?? null;
  if (days == null) return offsetWindows === 0 ? rows : [];
  const end = now - offsetWindows * days * DAY_MS;
  const start = end - days * DAY_MS;
  return rows.filter((r) => {
    if (!r.createdAt) return false;
    const t = Date.parse(r.createdAt);
    return t > start && t <= end;
  });
}

export function periodFigures(rows: NormRow[], period: RollupPeriod, now = Date.now()): PeriodFigures {
  const cur = rowsInPeriod(rows, period, 0, now).filter(isRevenue);
  const prev = period === "all" ? null : rowsInPeriod(rows, period, 1, now).filter(isRevenue);
  return {
    period,
    label: periodLabel(period),
    revenueCents: cur.reduce((s, r) => s + r.valueCents, 0),
    sales: cur.length,
    customers: new Set(cur.map((r) => r.customerKey).filter(Boolean)).size,
    prevRevenueCents: prev ? prev.reduce((s, r) => s + r.valueCents, 0) : null,
    prevSales: prev ? prev.length : null,
  };
}

/** "+12%" / "−40%" / "new" against the previous window; null when there is nothing to compare. */
export function changeLabel(cur: number, prev: number | null): { text: string; up: boolean } | null {
  if (prev == null) return null;
  if (prev === 0) return cur === 0 ? null : { text: "new", up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, up: pct >= 0 };
}
