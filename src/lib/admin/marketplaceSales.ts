import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";

/**
 * Every sale across every service — read from `subscriptions_unified`.
 *
 * This module used to fetch three legacy tables and re-derive names, provider
 * ids and totals in TypeScript, which meant the sidebar's Subscriptions page
 * was blind to anything the three tables don't hold: car rentals and every
 * sale on a universal-only service simply never appeared. The DB view already
 * folds all five populations into one shape (effective status, universal
 * provider id, full committed value), so reading it is both shorter and
 * complete.
 *
 * Reads come from the view; WRITES still go to each service's own table —
 * the table the customer, the provider portal and the reconcile cron read.
 * `SALE_SOURCES` maps the edit form's generic fields onto that table's own
 * column names.
 */

export type SaleService = "food" | "cleaning" | "beach" | "plan" | "cars";

export interface SaleRow {
  id: string;
  kind: "subscription" | "booking";
  /** Universal `providers.id`, straight from the view. */
  provider_id: string;
  plan_id: string | null;
  plan_name: string | null;
  user_id: string | null;
  /** Name captured on the order, for rows with no user account behind them. */
  customer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  /** EFFECTIVE lifecycle — a period that ended yesterday reads `expired`. */
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
  /** Column holding the lifecycle status — cleaning calls it subscription_status. */
  statusCol: string;
  startCol: string;
  endCol: string;
  priceCol: string;
}

export const SALE_SOURCES: Record<SaleService, SaleSource> = {
  food: {
    service: "food", table: "food_subscriptions",
    statusCol: "status", startCol: "started_at", endCol: "end_date",
    // Food prices are per week; the row's total is weekly × commitment. There
    // is no total column to write to, so the edit form's price maps to the
    // weekly rate — see buildSalePatch below.
    priceCol: "weekly_price_cents",
  },
  cleaning: {
    service: "cleaning", table: "cleaning_subscriptions",
    statusCol: "subscription_status", startCol: "service_start_date", endCol: "service_end_date",
    priceCol: "total_price_cents",
  },
  beach: {
    service: "beach", table: "provider_subscriptions",
    statusCol: "status", startCol: "start_date", endCol: "end_date",
    priceCol: "price_cents",
  },
  // Universal-only services (spa, one-time offers, every new archetype) —
  // same table as beach, source_service_key IS NULL.
  plan: {
    service: "plan", table: "provider_subscriptions",
    statusCol: "status", startCol: "start_date", endCol: "end_date",
    priceCol: "price_cents",
  },
  cars: {
    service: "cars", table: "rental_bookings",
    statusCol: "status", startCol: "start_date", endCol: "end_date",
    priceCol: "total_cents",
  },
};

const day = (v: unknown): string | null =>
  typeof v === "string" && v ? v.slice(0, 10) : null;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/**
 * Read every sale across every service, newest first.
 *
 * Paged: this feeds counts and totals, and a plain `.select()` is silently
 * truncated at 1000 rows with a 200 — the arithmetic would just be wrong.
 */
export async function fetchMarketplaceSales(): Promise<SaleRow[]> {
  const rows = await fetchAllRows<any>(() => supabaseDb
    .from("subscriptions_unified")
    .select("service,id,kind,provider_id,plan_id,plan_name,user_id,customer_name,starts_on,ends_on,status,payment_status,payment_method,payment_reference,price_cents,created_at")
    .order("id"));

  return rows
    .map((r): SaleRow => ({
      id: String(r.id),
      kind: r.kind === "booking" ? "booking" : "subscription",
      provider_id: r.provider_id ? String(r.provider_id) : "",
      plan_id: r.plan_id ?? null,
      plan_name: r.plan_name ?? null,
      user_id: r.user_id ?? null,
      customer_name: r.customer_name ?? null,
      start_date: day(r.starts_on),
      end_date: day(r.ends_on),
      status: r.status ?? "unknown",
      payment_status: r.payment_status ?? "pending",
      payment_method: r.payment_method ?? null,
      price_cents: num(r.price_cents),
      payment_reference: r.payment_reference ?? null,
      source_service_key: (r.service ?? "plan") as SaleService,
      created_at: r.created_at,
    }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
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
