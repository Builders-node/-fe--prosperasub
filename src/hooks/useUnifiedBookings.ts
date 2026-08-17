import { useQuery } from "@tanstack/react-query";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { pickPhone } from "@/components/patterns/CustomerPhone";
import { fetchUsersByIds } from "@/lib/admin/customerNames";

/**
 * Normalized booking row shared by every service. Adapters map their legacy
 * shape (cleaning_bookings ↔ slots, food_subscriptions
 * batch, the engine's own bookings hourly) into this common contract so
 * downstream UI (calendar, list, analytics) never branches on service.
 */
export interface UnifiedBookingRow {
  /** Stable id across a UI list. Legacy id from the source row. */
  id: string;
  /** Which legacy table this came from — used for source-of-truth reads/writes. */
  sourceTable: "cleaning_bookings" | "food_subscriptions" | "bookings";
  /** Human label of the customer (best-effort — legacy tables inconsistent). */
  customerName: string | null;
  /** What is booked (plan / court name). */
  planName: string | null;
  /** Scheduled start (Honduras local). Never null — bookings without a time land at 00:00 that day. */
  startAt: Date;
  /** Scheduled end. Null for open-ended (e.g. cleaning slot end unknown). */
  endAt: Date | null;
  /** Lifecycle status (each service defines its own, we surface the raw string). */
  status: string;
  /** Payment lifecycle string (paid/pending/failed/…). */
  paymentStatus: string | null;
  /** Total charge in cents — best-effort, null if the source doesn't carry it. */
  priceCents: number | null;
  /**
   * The calendar this was booked on, where one exists.
   *
   * Only the engine's bookings have one — a cleaning visit is a slot on a
   * schedule, not a resource — so the "by calendar" view offers itself only to
   * providers that have calendars.
   */
  resourceId?: string | null;
  resourceName?: string | null;
  /** Optional service-specific extras that the UI can render (delivery address, etc.). */
  meta?: Record<string, unknown>;
}

// ─── Service adapters ──────────────────────────────────────────────────────
// Each adapter fetches the raw legacy rows filtered by provider + date range
// and returns UnifiedBookingRow[]. Keep queries bounded — no `select("*")` if
// we can help it — the calendar renders a lot of rows on wide date ranges.

async function fetchCleaning(providerId: string, from: string, to: string): Promise<UnifiedBookingRow[]> {
  // Cleaning bookings link to a slot (which owns the date). Pull provider's
  // packages first so we can filter subscriptions.
  const { data: pkgs } = await supabaseDb
    .from("cleaning_packages")
    .select("id,name")
    .eq("provider_id", providerId);
  const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));
  const pkgIds = Array.from(pkgMap.keys());
  if (!pkgIds.length) return [];

  // Pull enough sub context to surface the customer + apartment on each row.
  // Owners were seeing "—" because we only carried the package name through.
  const { data: subs } = await supabaseDb
    .from("cleaning_subscriptions")
    .select("id,package_id,user_id,client_id,apartment_note,cleaner_hint,customer_whatsapp,payment_reference")
    .in("package_id", pkgIds);
  type SubMeta = { packageId: string; userId: string | null; clientId: string | null; apartmentNote: string | null; customerWhatsapp: string | null; paymentReference: string | null; cleanerHint: string | null };
  const subMap = new Map<string, SubMeta>(
    (subs ?? []).map((s: any) => [s.id, {
      packageId: s.package_id,
      userId: s.user_id ?? null,
      clientId: s.client_id ?? null,
      apartmentNote: s.apartment_note ?? null,
      customerWhatsapp: s.customer_whatsapp ?? null,
      paymentReference: s.payment_reference ?? null,
      cleanerHint: s.cleaner_hint ?? null,
    }]),
  );
  const subIds = Array.from(subMap.keys());

  // Matched on the booking's own provider_id OR its subscription. An admin can
  // book a visit for a customer who has no subscription at all (paid
  // off-platform, a trial); those rows carry provider_id and nothing else, so
  // a subscription-only filter made them invisible on the very page the admin
  // just created them from.
  const providerClause = `provider_id.eq.${providerId}`;
  const subClause = subIds.length ? `,subscription_id.in.(${subIds.join(",")})` : "";
  const { data } = await supabaseDb
    .from("cleaning_bookings")
    .select("id,subscription_id,provider_id,user_id,client_id,slot_id,status,source,notes,location,access_instructions,google_calendar_event_id,cleaning_available_slots!inner(id,date,start_time,end_time)")
    .or(`${providerClause}${subClause}`)
    .gte("cleaning_available_slots.date", from)
    .lte("cleaning_available_slots.date", to)
    .order("cleaning_available_slots(date)", { ascending: true });
  const rows = data ?? [];

  // Resolve user + client display names in one batch each so the calendar can
  // show "Ivan Syrtsov" instead of "—" without N per-row lookups.
  //
  // `?? r.user_id` covers the subscription-less rows: they have no subscription
  // to read an owner from, so the owner is on the booking itself. Without this
  // an admin-created visit would show up nameless.
  const ownerOf = (r: any) => subMap.get(r.subscription_id)?.userId ?? r.user_id ?? null;
  const clientOf = (r: any) => subMap.get(r.subscription_id)?.clientId ?? r.client_id ?? null;
  const userIds = Array.from(new Set(rows.map(ownerOf).filter(Boolean))) as string[];
  const clientIds = Array.from(new Set(rows.map(clientOf).filter(Boolean))) as string[];
  // Columns here have to be real ones. `users.phone`, `cleaning_clients.
  // contact_name` and `cleaning_clients.whatsapp` don't exist — PostgREST
  // answers 42703 and the whole enrichment query fails, which is why the
  // calendar showed no customer name and never a phone number. A user's phone
  // lives on `user_profiles`, and the client's is `phone` / `contact_person`.
  const [usersRes, profilesRes, clientsRes] = await Promise.all([
    userIds.length
      ? fetchUsersByIds(userIds).then((m) => ({ data: [...m.values()] }))
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? supabaseDb.from("user_profiles").select("user_id,phone_number,whatsapp").in("user_id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    clientIds.length
      ? supabaseDb.from("cleaning_clients").select("id,company_name,contact_person,phone").in("id", clientIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const userMap = new Map((usersRes.data ?? []).map((u: any) => [String(u.id), u]));
  const profileMap = new Map((profilesRes.data ?? []).map((p: any) => [String(p.user_id), p]));
  const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [String(c.id), c]));

  return rows.map((row: any) => {
    const slot = row.cleaning_available_slots ?? {};
    const startAt = new Date(`${slot.date}T${String(slot.start_time || "09:00").slice(0, 5)}:00`);
    const endAt = slot.end_time
      ? new Date(`${slot.date}T${String(slot.end_time).slice(0, 5)}:00`)
      : null;
    const meta = subMap.get(row.subscription_id);
    const ownerId = ownerOf(row);
    const clientId = clientOf(row);
    const user = ownerId ? userMap.get(String(ownerId)) : null;
    const client = clientId ? clientMap.get(String(clientId)) : null;
    const profile = ownerId ? profileMap.get(String(ownerId)) : null;
    const customerName =
      user?.display_name ??
      user?.name ??
      client?.contact_person ??
      client?.company_name ??
      null;
    const location = row.location ?? meta?.apartmentNote ?? null;
    return {
      id: row.id,
      sourceTable: "cleaning_bookings" as const,
      customerName,
      planName: meta?.packageId ? pkgMap.get(meta.packageId) ?? null : null,
      startAt, endAt,
      status: row.status ?? "unknown",
      paymentStatus: null,
      priceCents: null,
      meta: {
        location,
        notes: row.notes ?? null,
        access_instructions: row.access_instructions ?? null,
        cleaner_hint: meta?.cleanerHint ?? null,
        // How the visit got here. Only the partner value is surfaced; the rest
        // describe how we made the row ourselves.
        source: row.source ?? null,
        payment_reference: meta?.paymentReference ?? null,
        // Cleaning collects no phone of its own, so it comes from the customer's
        // profile, falling back to the client record for company bookings.
        phone: pickPhone(meta?.customerWhatsapp, profile?.whatsapp, profile?.phone_number, client?.phone),
        // Slot context — the Reschedule dialog needs the current slot id (to
        // free capacity on move) plus the date/times to preselect + render.
        slot_id: row.slot_id ?? slot.id ?? null,
        slot_date: slot.date ?? null,
        slot_start_time: slot.start_time ?? null,
        slot_end_time: slot.end_time ?? null,
        google_calendar_event_id: row.google_calendar_event_id ?? null,
      },
    };
  });
}

async function fetchFood(providerId: string, from: string, to: string): Promise<UnifiedBookingRow[]> {
  // Food subs are date-range products (started_at → end_date) — treat as
  // "active in the window" so they show up on the calendar for their duration.
  const { data: plans } = await supabaseDb
    .from("food_meal_plans")
    .select("id,name")
    .eq("provider_id", providerId);
  const planMap = new Map((plans ?? []).map((p: any) => [p.id, p.name]));

  const { data } = await supabaseDb
    .from("food_subscriptions")
    .select("id,meal_plan_id,customer_name,customer_whatsapp,started_at,end_date,status,payment_status,payment_reference,weekly_price_cents,commitment_weeks,delivery_address")
    .eq("provider_id", providerId)
    .lte("started_at", to)
    .gte("end_date", from)
    // Only surface subs that actually generate deliveries in this window.
    // Cancelled/paused subs would otherwise occupy a calendar row on every
    // day they overlap even though nothing gets delivered.
    .in("status", ["active"])
    .eq("payment_status", "paid")
    .order("started_at", { ascending: true });

  return (data ?? []).map((row: any) => ({
    id: row.id,
    sourceTable: "food_subscriptions" as const,
    customerName: row.customer_name ?? null,
    planName: row.meal_plan_id ? planMap.get(row.meal_plan_id) ?? null : null,
    startAt: new Date(`${row.started_at}T00:00:00`),
    endAt: row.end_date ? new Date(`${row.end_date}T23:59:59`) : null,
    status: row.status ?? "unknown",
    paymentStatus: row.payment_status ?? null,
    priceCents: Number(row.weekly_price_cents || 0) * Number(row.commitment_weeks || 1) || null,
    meta: {
      delivery_address: row.delivery_address,
      phone: pickPhone(row.customer_whatsapp),
      // Food has no `source` column — a partner-provisioned subscription is
      // identified by its payment reference, same as on the subscription list.
      payment_reference: row.payment_reference ?? null,
    },
  }));
}

/**
 * Times booked on this provider's calendars.
 *
 * It read `beach_club_court_bookings`, which has been empty since the engine
 * took the traffic — so the workspace calendar showed a beach club with no
 * bookings while the engine held eleven. Bookings are one table now, behind
 * the API because that table is service-role only, and this works for any
 * provider with a calendar rather than for the beach alone.
 */
async function fetchCalendarBookings(providerId: string, from: string, to: string): Promise<UnifiedBookingRow[]> {
  const { data, error } = await accountApi(
    `/booking/by-provider?providerId=${encodeURIComponent(providerId)}&from=${from}&to=${to}`,
  );
  if (error) return [];
  return ((data ?? []) as any[]).map((row: any) => ({
    id: row.id,
    sourceTable: "bookings" as const,
    // A booking's label is who it is for when staff took it over the counter;
    // otherwise the subject is all we hold at this layer.
    customerName: row.label ?? null,
    planName: row.resource_name ?? null,
    resourceId: row.resource_id ?? null,
    resourceName: row.resource_name ?? null,
    startAt: new Date(row.start_at),
    endAt: row.end_at ? new Date(row.end_at) : null,
    status: row.status ?? "unknown",
    paymentStatus: null,
    priceCents: null,
    meta: { subjectRef: row.subject_ref, notes: row.notes ?? null },
  }));
}

interface UseUnifiedBookingsArgs {
  providerId: string;
  sourceKey: string;
  /** ISO date "YYYY-MM-DD" inclusive lower bound. */
  from: string;
  /** ISO date "YYYY-MM-DD" inclusive upper bound. */
  to: string;
}

/**
 * Fetch bookings for a provider across services, normalized to
 * UnifiedBookingRow. Cleaning and food filter by their legacy
 * `provider_id` link; beach is platform-owned (ignores providerId).
 * Data is currently pulled from legacy tables — this hook is the seam we'll
 * flip to `provider_bookings` when DDD Phase 6 drops legacy tables.
 */
export function useUnifiedBookings({ providerId, sourceKey, from, to }: UseUnifiedBookingsArgs) {
  return useQuery({
    queryKey: ["unified-bookings", sourceKey, providerId, from, to],
    enabled: !!providerId && !!from && !!to,
    queryFn: async (): Promise<UnifiedBookingRow[]> => {
      if (sourceKey === "cleaning") return fetchCleaning(providerId, from, to);
      if (sourceKey === "food")     return fetchFood(providerId, from, to);
      // Everything else — the beach, and any business whose bookings the
      // engine owns. `providerId` is the universal id for both, which is what
      // the engine keys on.
      return fetchCalendarBookings(providerId, from, to);
    },
    staleTime: 30_000,
  });
}
