import { supabaseDb, accountApi } from "@/integrations/supabase/client";
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

export type SaleService = "food" | "cleaning" | "beach" | "plan" | "cars" | "court";

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
  /**
   * "14:00–15:00" for a booked hour. A subscription runs between two dates and
   * has none; a court booking IS a time, and showing only its date would hide
   * the thing the admin is looking at.
   */
  time_label?: string | null;
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
  /** Empty when the row is API-managed — see `apiManaged`. */
  table: string;
  /**
   * True when this row cannot be written from the browser at all.
   *
   * The booking engine's table is service-role only (RLS on, no policies), and
   * a PostgREST update it refuses returns 200 with zero rows — no error to
   * catch. Anything that wrote to it directly reported success and changed
   * nothing. Rows marked here go through the API instead.
   */
  apiManaged?: true;
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
  // An hour on a calendar — a court, a room, a seat on a trip. Lives in the
  // booking engine, which owns an exclusion constraint over the slot, so it is
  // never edited field-by-field from here: cancelling goes through the API,
  // which frees the slot and writes the legacy row back.
  court: {
    service: "court", table: "", apiManaged: true,
    statusCol: "status", startCol: "start_at", endCol: "end_at",
    priceCol: "",
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
/**
 * Hours booked on somebody's calendar.
 *
 * These do not come from the view and cannot: the booking engine's table is
 * service-role only, so the browser is not allowed to read it either. They
 * come through the API, per provider that owns a calendar — which today is the
 * beach club and tomorrow is whoever else gets one.
 *
 * Thirty-one of these existed while this page showed sixty-six rows and called
 * that "every sale": a court booked by a member was an order the admin could
 * not see from the orders screen at all.
 */
async function fetchCourtBookings(): Promise<SaleRow[]> {
  // Who owns a calendar. Reading the resources rather than hard-coding the
  // beach club is what makes this work for the next provider that gets one.
  const { data: resources } = await supabaseDb
    .from("bookable_resources")
    .select("provider_id");
  const providerIds = [...new Set(((resources ?? []) as Array<{ provider_id: string | null }>)
    .map((r) => r.provider_id)
    .filter((id): id is string => !!id))];
  if (providerIds.length === 0) return [];

  // Wide enough to cover the whole history this page is expected to show; the
  // endpoint wants an explicit window.
  const today = new Date();
  const from = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
  const to   = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

  const perProvider = await Promise.all(providerIds.map(async (providerId) => {
    const { data, error } = await accountApi(
      `/booking/by-provider?providerId=${encodeURIComponent(providerId)}&from=${from}&to=${to}`,
    ).catch(() => ({ data: null, error: new Error("unreachable") }));
    if (error || !Array.isArray(data)) return [] as SaleRow[];

    return (data as any[]).map((row): SaleRow => {
      const start = row.start_at ? new Date(row.start_at) : null;
      const end   = row.end_at   ? new Date(row.end_at)   : null;
      const hhmm  = (d: Date | null) => d ? d.toISOString().slice(11, 16) : "";
      return {
        id: String(row.id),
        kind: "booking",
        provider_id: String(row.provider_id ?? providerId),
        plan_id: row.resource_id ?? null,
        // The calendar's name is what this booking is FOR — "Tennis Court 2".
        plan_name: row.resource_name ?? null,
        user_id: typeof row.subject_ref === "string" && row.subject_ref.startsWith("user:")
          ? row.subject_ref.slice(5)
          : null,
        // `label` is what staff typed when they took it over the counter.
        customer_name: row.customer_name ?? row.label ?? null,
        start_date: day(row.start_at),
        end_date: day(row.end_at ?? row.start_at),
        time_label: start ? `${hhmm(start)}–${hhmm(end)}` : null,
        status: row.status ?? "unknown",
        // Court time is included in a membership and settled at the desk —
        // there is no payment_status column to report, and inventing "pending"
        // would put every one of them in the admin's chase list.
        payment_status: "n/a",
        payment_method: null,
        price_cents: null,
        payment_reference: null,
        source_service_key: "court",
        created_at: row.created_at ?? row.start_at,
      };
    });
  }));

  return perProvider.flat();
}

export async function fetchMarketplaceSales(): Promise<SaleRow[]> {
  const [courts, rows] = await Promise.all([
    // Never lets the whole page fail: a calendar the API cannot reach must not
    // hide sixty-six subscriptions that load fine.
    fetchCourtBookings().catch(() => [] as SaleRow[]),
    fetchAllRows<any>(() => supabaseDb
    .from("subscriptions_unified")
    .select("service,id,kind,provider_id,plan_id,plan_name,user_id,customer_name,starts_on,ends_on,status,payment_status,payment_method,payment_reference,price_cents,created_at")
    .order("id")),
  ]);

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
    .concat(courts)
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
  if (src.apiManaged) {
    // Caught here rather than producing a patch aimed at a table that will
    // accept it and change nothing.
    throw new Error(`${row.source_service_key} rows are managed through the booking API, not a table write`);
  }
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
