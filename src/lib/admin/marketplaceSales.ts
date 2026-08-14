import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";

/**
 * Every sale across every service, read from where it actually lives.
 *
 * `/admin/subscriptions` used to read `provider_subscriptions` +
 * `provider_bookings`. Those are the universal tables, populated by a one-off
 * backfill on 2026-07-04 and never written to since — nothing in the app
 * maintains them and there is no trigger in either direction. So the page was
 * a snapshot of one day in July:
 *
 *   - It showed 9 food rows out of 19. Ten subscriptions taken since the
 *     backfill simply didn't exist as far as this page was concerned.
 *   - Six of the nine it did show had the wrong status — customers who had
 *     since cancelled or expired still read "Active".
 *   - Edits and deletes wrote to the mirror, so an admin could cancel a
 *     subscription here, see "Deleted", and leave the customer's real one
 *     running. The page carried a banner admitting this rather than fixing it.
 *
 * Each service keeps its own column names, so a descriptor per service maps
 * them onto one row shape. Reads and writes both go through it — the table an
 * admin edits is the table the customer, the provider portal and the reconcile
 * cron all read.
 */

export type SaleService = "food" | "cleaning" | "beach";

export interface SaleRow {
  id: string;
  kind: "subscription" | "booking";
  /** Universal `providers.id`, resolved from the legacy id via the bridge. */
  provider_id: string;
  /** Legacy plan id — `food_meal_plans`, `cleaning_packages`, … */
  plan_id: string | null;
  plan_name: string | null;
  user_id: string | null;
  /** Name captured on the order, for rows with no user account behind them. */
  customer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  price_cents: number | null;
  payment_reference: string | null;
  source_service_key: SaleService;
  created_at: string;
}

/** Where a row came from, and what to write back to when it's edited. */
export interface SaleSource {
  service: SaleService;
  table: string;
  kind: "subscription" | "booking";
  /** Column holding the lifecycle status — cleaning calls it subscription_status. */
  statusCol: string;
  startCol: string;
  endCol: string;
  priceCol: string;
  /**
   * Value of `providers.source_service_key` for this service. Not necessarily
   * the service name — keep them separate, they have drifted before.
   */
  bridgeKey: string;
  /** Plan table, used for the plan name and as a provider fallback. */
  planTable: string;
}

export const SALE_SOURCES: Record<SaleService, SaleSource> = {
  food: {
    service: "food", table: "food_subscriptions", kind: "subscription",
    statusCol: "status", startCol: "started_at", endCol: "end_date",
    bridgeKey: "food", planTable: "food_meal_plans",
    // Food prices are per week; the row's total is weekly × commitment. There
    // is no total column to write to, so the edit form's price maps to the
    // weekly rate — see priceToPatch below.
    priceCol: "weekly_price_cents",
  },
  cleaning: {
    service: "cleaning", table: "cleaning_subscriptions", kind: "subscription",
    statusCol: "subscription_status", startCol: "service_start_date", endCol: "service_end_date",
    priceCol: "total_price_cents",
    bridgeKey: "cleaning", planTable: "cleaning_packages",
  },
  beach: {
    service: "beach", table: "beach_club_subscriptions", kind: "subscription",
    statusCol: "status", startCol: "start_date", endCol: "end_date",
    priceCol: "total_cents",
    bridgeKey: "beach", planTable: "beach_club_plans",
  },
};

const day = (v: unknown): string | null =>
  typeof v === "string" && v ? v.slice(0, 10) : null;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/**
 * Legacy provider id → universal `providers.id`.
 *
 * The two id-spaces are not the same, and the page's Provider column and
 * service filter both key off the universal one. Beach is platform-owned and
 * carries no provider on the row, so it resolves by service alone.
 */
async function buildProviderBridge() {
  const { data } = await supabaseDb
    .from("providers")
    .select("id, source_service_key, source_provider_id");
  const byLegacy = new Map<string, string>();
  const byService = new Map<string, string>();
  (data ?? []).forEach((p: any) => {
    if (p.source_service_key && p.source_provider_id) {
      byLegacy.set(`${p.source_service_key}:${p.source_provider_id}`, p.id);
    }
    if (p.source_service_key && !byService.has(p.source_service_key)) {
      byService.set(p.source_service_key, p.id);
    }
  });
  return {
    resolve(service: SaleService, legacyProviderId: string | null | undefined): string {
      const key = SALE_SOURCES[service].bridgeKey;
      if (legacyProviderId) {
        const hit = byLegacy.get(`${key}:${legacyProviderId}`);
        if (hit) return hit;
      }
      // Last resort. Only correct where the service has a single provider —
      // cleaning has two, which is why callers resolve through the plan first.
      return byService.get(key) ?? "";
    },
  };
}

/**
 * Plan id → { name, provider_id }.
 *
 * The provider half matters because 8 of 19 cleaning subscriptions carry no
 * `provider_id` of their own. Cleaning has two providers, so guessing by
 * service would have filed all eight under one of them — and one of those
 * eight really belongs to the other.
 */
async function loadPlans(table: string): Promise<Map<string, { name: string | null; provider_id: string | null }>> {
  const withProvider = table !== "beach_club_plans"; // platform-owned, no provider column
  const { data } = await supabaseDb
    .from(table)
    .select(withProvider ? "id, name, provider_id" : "id, name");
  return new Map((data ?? []).map((r: any) => [
    String(r.id),
    { name: r.name ?? null, provider_id: withProvider ? r.provider_id ?? null : null },
  ]));
}

/**
 * Read every sale across every service.
 *
 * Paged: this feeds counts and totals in the header, and a plain `.select()`
 * is silently truncated at 1000 rows with a 200 — the arithmetic would just
 * quietly be wrong.
 */
export async function fetchMarketplaceSales(): Promise<SaleRow[]> {
  const [bridge, mealPlans, packages, beachPlans, cleaningClients] = await Promise.all([
    buildProviderBridge(),
    loadPlans("food_meal_plans"),
    loadPlans("cleaning_packages"),
    loadPlans("beach_club_plans"),
    // Company bookings have no user at all — the name lives on the client
    // record, and without it those rows rendered as a bare "—".
    supabaseDb.from("cleaning_clients").select("id,company_name,contact_person")
      .then(({ data }) => new Map((data ?? []).map((c: any) =>
        [String(c.id), (c.company_name || c.contact_person || null) as string | null]))),
  ]);

  const [food, cleaning, beach] = await Promise.all([
    fetchAllRows<any>(() => supabaseDb
      .from("food_subscriptions")
      .select("id,provider_id,meal_plan_id,user_id,customer_name,status,payment_status,payment_method,payment_reference,started_at,end_date,weekly_price_cents,commitment_weeks,created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false })),
    fetchAllRows<any>(() => supabaseDb
      .from("cleaning_subscriptions")
      .select("id,provider_id,package_id,user_id,client_id,subscription_status,payment_status,payment_method,payment_reference,service_start_date,service_end_date,paid_until,end_date,total_price_cents,monthly_price_cents,created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false })),
    fetchAllRows<any>(() => supabaseDb
      .from("beach_club_subscriptions")
      .select("id,plan_id,plan_name,user_id,customer_name,status,payment_status,payment_method,payment_reference,start_date,end_date,total_cents,created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false })),
  ]);

  const rows: SaleRow[] = [];

  food.forEach((r) => rows.push({
    id: r.id, kind: "subscription",
    provider_id: bridge.resolve("food", r.provider_id ?? mealPlans.get(String(r.meal_plan_id))?.provider_id),
    plan_id: r.meal_plan_id ?? null,
    plan_name: mealPlans.get(String(r.meal_plan_id))?.name ?? null,
    user_id: r.user_id ?? null,
    customer_name: r.customer_name ?? null,
    start_date: day(r.started_at), end_date: day(r.end_date),
    status: r.status ?? "unknown",
    payment_status: r.payment_status ?? "pending",
    payment_method: r.payment_method ?? null,
    // Weekly × committed weeks — the same total the customer was charged and
    // the food provider's own list shows.
    price_cents: num(Number(r.weekly_price_cents || 0) * Math.max(Number(r.commitment_weeks) || 1, 1)),
    payment_reference: r.payment_reference ?? null,
    source_service_key: "food", created_at: r.created_at,
  }));

  cleaning.forEach((r) => rows.push({
    id: r.id, kind: "subscription",
    // The package's provider when the row has none — see loadPlans.
    provider_id: bridge.resolve("cleaning", r.provider_id ?? packages.get(String(r.package_id))?.provider_id),
    plan_id: r.package_id ?? null,
    plan_name: packages.get(String(r.package_id))?.name ?? null,
    user_id: r.user_id ?? null,
    customer_name: r.client_id ? cleaningClients.get(String(r.client_id)) ?? null : null,
    start_date: day(r.service_start_date),
    // paid_until is the authoritative period end when it's set; the other two
    // are what older rows carry.
    end_date: day(r.paid_until ?? r.service_end_date ?? r.end_date),
    status: r.subscription_status ?? "unknown",
    payment_status: r.payment_status ?? "pending",
    payment_method: r.payment_method ?? null,
    price_cents: num(r.total_price_cents ?? r.monthly_price_cents),
    payment_reference: r.payment_reference ?? null,
    source_service_key: "cleaning", created_at: r.created_at,
  }));

  beach.forEach((r) => rows.push({
    id: r.id, kind: "subscription",
    provider_id: bridge.resolve("beach", null),
    plan_id: r.plan_id ?? null,
    plan_name: r.plan_name ?? beachPlans.get(String(r.plan_id))?.name ?? null,
    user_id: r.user_id ?? null,
    customer_name: r.customer_name ?? null,
    start_date: day(r.start_date), end_date: day(r.end_date),
    status: r.status ?? "unknown",
    payment_status: r.payment_status ?? "pending",
    payment_method: r.payment_method ?? null,
    price_cents: num(r.total_cents),
    payment_reference: r.payment_reference ?? null,
    source_service_key: "beach", created_at: r.created_at,
  }));

  // One list, newest first, so the table's default sort is meaningful across
  // services rather than grouped by whichever query returned first.
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/**
 * Translate the edit form's generic fields onto the row's own column names.
 * Without this, saving wrote `status` to a cleaning row whose column is
 * `subscription_status` — accepted by PostgREST as a no-op column it doesn't
 * know, or rejected outright, but never the change the admin asked for.
 */
export function buildSalePatch(
  row: SaleRow,
  edit: {
    status?: string;
    payment_status?: string;
    payment_method?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    price_cents?: number;
  },
): Record<string, unknown> {
  const src = SALE_SOURCES[row.source_service_key];
  const patch: Record<string, unknown> = {};

  if (edit.status !== undefined) patch[src.statusCol] = edit.status;
  if (edit.payment_status !== undefined) patch.payment_status = edit.payment_status;
  if (edit.payment_method !== undefined) patch.payment_method = edit.payment_method;
  if (edit.start_date !== undefined) patch[src.startCol] = edit.start_date;
  if (edit.end_date !== undefined) patch[src.endCol] = edit.end_date;
  if (edit.price_cents !== undefined) patch[src.priceCol] = edit.price_cents;

  // Cleaning keeps a boolean alongside the status; leaving it stale is how a
  // cancelled subscription goes on behaving like an active one.
  if (row.source_service_key === "cleaning" && edit.status !== undefined) {
    patch.is_active = edit.status === "active";
  }
  return patch;
}
