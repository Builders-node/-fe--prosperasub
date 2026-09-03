import { supabaseDb } from "@/integrations/supabase/client";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { pickPhone } from "@/components/patterns/CustomerPhone";
import { cancelCleaningBookings } from "@/lib/cleaning/cancelBooking";
import { todayHN, addDaysISO, addMonthsISO } from "@/lib/timezone";

/**
 * Who is subscribed to a business, and what changing that means — said as data
 * instead of as six conditions inside a list component.
 *
 * `SubscribersList` was 453 lines, of which about a third was the component
 * asking which vertical it was looking at: where the rows are, what the status
 * column is called, what a renewal writes, and — the one that could not be
 * generalised away — that cancelling a cleaning subscription has to cancel the
 * visits it booked, or those slots stay full for ever.
 *
 * None of that was wrong; it was just in the wrong place. A vertical describes
 * itself here, the component reads the description, and a service that has
 * said nothing gets the universal path — which is why adding one still takes
 * no code.
 */

export interface SubscriberRow {
  id: string;
  /** What they bought. */
  plan: string;
  customerName: string | null;
  customerEmail: string | null;
  start: string | null;
  end: string | null;
  amountCents: number;
  /** Everything this subscription has been charged, renewals included. */
  lifetimeCents?: number;
  status: string;
  paymentStatus: string | null;
  /** One line of whatever this service cares about — a headcount, an address. */
  detail?: string | null;
  phone?: string | null;
  /** How long one paid period runs, in this service's own unit. */
  periodLength?: number;
  periodsPaid?: number;
  /** Tells a walk-in sale from a platform one — the badge reads it. */
  paymentReference?: string | null;
}

export interface SubscriberSource {
  /** Table the subscriptions live in. */
  table: string;
  /** What this table calls the column holding "active". */
  statusColumn: string;
  /** Which shape `approvePayment` needs; see lib/subscriptionApprove. */
  approve: "cleaning" | "food" | "beach";
  /** How the rows are read for one business. */
  fetch: (ctx: { providerId: string; legacyId: string; sourceKey: string }) => Promise<SubscriberRow[]>;
  /** What a renewal writes, given the period it starts. */
  renewPatch: (row: SubscriberRow, at: { start: string; length: number }) => Record<string, unknown>;
  /** A word to add after renewing, where the service needs one. */
  renewNote?: string;
  /** Columns beyond the status one, on pause and resume. */
  statusPatch?: (next: "active" | "paused" | "cancelled") => Record<string, unknown>;
  /** Work a cancellation implies beyond writing a column. */
  onCancelled?: (subscriptionId: string) => Promise<void>;
}

/** What a business gets when it has said nothing: the universal tables. */
export const UNIVERSAL_SUBSCRIBERS: SubscriberSource = {
  table: "provider_subscriptions",
  statusColumn: "status",
  approve: "beach",
  fetch: ({ providerId, sourceKey }) => fetchUniversal(providerId, sourceKey),
  renewPatch: (row, { start, length }) => ({
    status: "active",
    payment_status: "paid", payment_method: "manual",
    start_date: start, end_date: addMonthsISO(start, length),
    periods_paid: (row.periodsPaid || 1) + 1,
    updated_at: new Date().toISOString(),
  }),
};

export const SUBSCRIBER_SOURCES: Record<string, SubscriberSource> = {
  cleaning: {
    table: "cleaning_subscriptions",
    statusColumn: "subscription_status",
    approve: "cleaning",
    fetch: ({ legacyId }) => fetchCleaning(legacyId),
    renewPatch: (_row, { start, length }) => {
      const end = addMonthsISO(start, length);
      return {
        subscription_status: "active", is_active: true,
        payment_status: "paid", payment_method: "manual",
        service_start_date: start, service_end_date: end, paid_until: end, end_date: end,
      };
    },
    // The recurrence engine seeds visits on create, not on renew.
    renewNote: "Add visits for the new period from the Bookings tab.",
    /**
     * Cancelling has to cancel the visits it booked.
     *
     * Each future visit holds a seat in a slot; flipping the subscription's
     * status alone leaves them booked for ever and those slots looking
     * permanently full. This is the one thing a generic list that writes a
     * column could never have replaced.
     */
    onCancelled: async (subscriptionId) => {
      const { data: future } = await supabaseDb
        .from("cleaning_bookings")
        .select("id, cleaning_available_slots!inner(date)")
        .eq("subscription_id", subscriptionId)
        .eq("status", "booked")
        .gte("cleaning_available_slots.date", todayHN());
      const ids = (future ?? []).map((b: any) => b.id);
      if (ids.length) await cancelCleaningBookings(supabaseDb, ids);
    },
  },

  food: {
    table: "food_subscriptions",
    statusColumn: "status",
    approve: "food",
    fetch: ({ legacyId }) => fetchFood(legacyId),
    renewPatch: (row, { start, length }) => ({
      status: "active", paused_at: null, cancelled_at: null,
      started_at: start, end_date: addDaysISO(start, length * 7),
      payment_status: "paid", payment_method: "manual",
      periods_paid: (row.periodsPaid || 1) + 1,
      updated_at: new Date().toISOString(),
    }),
    // Food records WHEN it was paused, and clears that on resume.
    statusPatch: (next) => ({ paused_at: next === "paused" ? todayHN() : null }),
  },

  // A membership is a universal row already; only which rows are its own
  // differs, and `fetchUniversal` decides that from the key.
  beach: UNIVERSAL_SUBSCRIBERS,
};

const ALIASES: Record<string, string> = { beach_club: "beach", entertainment: "beach" };

/** The descriptor for a vertical — the universal one when it has said nothing. */
export function subscriberSourceFor(sourceKey: string | null | undefined): SubscriberSource {
  const k = String(sourceKey ?? "").toLowerCase();
  return SUBSCRIBER_SOURCES[ALIASES[k] ?? k] ?? UNIVERSAL_SUBSCRIBERS;
}

/**
 * Where the subscriptions are. Beach memberships and universal plans both live
 * on `provider_subscriptions`; the difference is only which rows belong to
 * this business.
 */


/** Cleaning: the subscription hangs off the package, the package off the provider. */
async function fetchCleaning(legacyProviderId: string): Promise<SubscriberRow[]> {
  const { data: pkgs } = await supabaseDb
    .from("cleaning_packages").select("id,name").eq("provider_id", legacyProviderId);
  const names = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));
  if (!names.size) return [];
  const { data } = await supabaseDb
    .from("cleaning_subscriptions")
    .select("id,package_id,user_id,subscription_status,payment_status,payment_reference,customer_whatsapp,total_price_cents,billing_period_months,service_start_date,service_end_date,paid_until,start_date,end_date,apartment_note")
    .in("package_id", [...names.keys()])
    .order("service_start_date", { ascending: false });
  const rows = (data ?? []) as any[];
  const users = await fetchUsersByIds(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const u = users.get(String(r.user_id));
    return {
      id: r.id,
      plan: names.get(r.package_id) ?? "Cleaning plan",
      customerName: u?.display_name ?? u?.name ?? null,
      customerEmail: u?.email ?? null,
      start: r.service_start_date ?? r.start_date ?? null,
      // Renewal continues from what has actually been paid for.
      end: r.paid_until ?? r.service_end_date ?? r.end_date ?? null,
      amountCents: r.total_price_cents ?? 0,
      status: String(r.subscription_status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: r.apartment_note ?? null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
      periodLength: Number(r.billing_period_months) || 1,
    };
  });
}

/** Food: the subscription names its provider and its meal plan directly. */
async function fetchFood(legacyProviderId: string): Promise<SubscriberRow[]> {
  const { data } = await supabaseDb
    .from("food_subscriptions")
    .select("id,meal_plan_id,user_id,status,payment_status,payment_reference,customer_whatsapp,weekly_price_cents,commitment_weeks,periods_paid,started_at,end_date,delivery_address,customer_name")
    .eq("provider_id", legacyProviderId)
    .order("started_at", { ascending: false });
  const rows = (data ?? []) as any[];
  const planIds = [...new Set(rows.map((r) => r.meal_plan_id).filter(Boolean))];
  const { data: plans } = planIds.length
    ? await supabaseDb.from("food_meal_plans").select("id,name").in("id", planIds)
    : { data: [] as any[] };
  const names = new Map((plans ?? []).map((p: any) => [p.id, p.name]));
  const users = await fetchUsersByIds(rows.map((r) => r.user_id));
  return rows.map((r) => {
    const u = users.get(String(r.user_id));
    /**
     * What this row is worth, and what it charged.
     *
     * The list showed lifetime value — weekly × committed weeks × periods paid
     * — next to the dates of ONE period, so a renewed week-long subscription
     * read "$270 · Aug 4 → Aug 11" for a week that cost $135. The figure is the
     * period's now; the total follows it when there has been more than one.
     */
    const periods = Math.max(Number(r.periods_paid) || 1, 1);
    const perPeriodCents = (r.weekly_price_cents ?? 0) * (r.commitment_weeks || 1);
    return {
      id: r.id,
      plan: names.get(r.meal_plan_id) ?? "Meal plan",
      customerName: r.customer_name ?? u?.display_name ?? u?.name ?? null,
      customerEmail: u?.email ?? null,
      start: r.started_at ?? null,
      end: r.end_date ?? null,
      amountCents: perPeriodCents,
      lifetimeCents: perPeriodCents * periods,
      status: String(r.status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: r.delivery_address ?? null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
      periodLength: Number(r.commitment_weeks) || 1,
      periodsPaid: Number(r.periods_paid) || 1,
    };
  });
}

async function fetchUniversal(providerId: string, sourceKey: string): Promise<SubscriberRow[]> {
  const isBeach = sourceKey === "beach" || sourceKey === "beach_club";
  let query = supabaseDb
    .from("provider_subscriptions")
    .select("id, user_id, status, payment_status, payment_reference, customer_whatsapp, start_date, end_date, price_cents, periods_paid, metadata, provider_plans(name)")
    .eq("provider_id", providerId)
    .order("start_date", { ascending: false });
  query = isBeach
    ? query.eq("source_service_key", "beach")
    // A universal-only business has no source at all; the rows that carry one
    // belong to a legacy service and are that service's business.
    : query.is("source_service_key", null);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const users = await fetchUsersByIds(rows.map((r) => r.user_id).filter(Boolean));

  return rows.map((r) => {
    const meta = r.metadata ?? {};
    const user = users.get(String(r.user_id));
    const people = Number(meta.people) || 0;
    return {
      id: r.id,
      plan: meta.plan_name ?? r.provider_plans?.name ?? "Subscription",
      customerName: meta.customer_name ?? user?.display_name ?? user?.name ?? null,
      customerEmail: meta.customer_email ?? user?.email ?? null,
      start: r.start_date ?? null,
      end: r.end_date ?? null,
      amountCents: r.price_cents ?? 0,
      status: String(r.status ?? ""),
      paymentStatus: r.payment_status ?? null,
      detail: people > 1 ? `${people} people` : people === 1 ? "1 person" : null,
      phone: pickPhone(r.customer_whatsapp),
      paymentReference: r.payment_reference ?? null,
      // A membership runs a month at a time.
      periodLength: 1,
      periodsPaid: Number(r.periods_paid) || 1,
    };
  });
}
