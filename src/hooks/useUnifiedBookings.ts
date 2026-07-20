import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Normalized booking row shared by every service. Adapters map their legacy
 * shape (cleaning_bookings ↔ slots, rental_bookings range, food_subscriptions
 * batch, beach_club_court_bookings hourly) into this common contract so
 * downstream UI (calendar, list, analytics) never branches on service.
 */
export interface UnifiedBookingRow {
  /** Stable id across a UI list. Legacy id from the source row. */
  id: string;
  /** Which legacy table this came from — used for source-of-truth reads/writes. */
  sourceTable: "cleaning_bookings" | "rental_bookings" | "food_subscriptions" | "beach_club_court_bookings";
  /** Human label of the customer (best-effort — legacy tables inconsistent). */
  customerName: string | null;
  /** What is booked (plan / vehicle / court name). */
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
    .select("id,package_id,user_id,client_id,apartment_note,cleaner_hint")
    .in("package_id", pkgIds);
  type SubMeta = { packageId: string; userId: string | null; clientId: string | null; apartmentNote: string | null; cleanerHint: string | null };
  const subMap = new Map<string, SubMeta>(
    (subs ?? []).map((s: any) => [s.id, {
      packageId: s.package_id,
      userId: s.user_id ?? null,
      clientId: s.client_id ?? null,
      apartmentNote: s.apartment_note ?? null,
      cleanerHint: s.cleaner_hint ?? null,
    }]),
  );
  const subIds = Array.from(subMap.keys());
  if (!subIds.length) return [];

  const { data } = await supabaseDb
    .from("cleaning_bookings")
    .select("id,subscription_id,status,notes,location,access_instructions,cleaning_available_slots!inner(date,start_time,end_time)")
    .in("subscription_id", subIds)
    .gte("cleaning_available_slots.date", from)
    .lte("cleaning_available_slots.date", to)
    .order("cleaning_available_slots(date)", { ascending: true });
  const rows = data ?? [];

  // Resolve user + client display names in one batch each so the calendar can
  // show "Ivan Syrtsov" instead of "—" without N per-row lookups.
  const userIds = Array.from(new Set(rows.map((r: any) => subMap.get(r.subscription_id)?.userId).filter(Boolean))) as string[];
  const clientIds = Array.from(new Set(rows.map((r: any) => subMap.get(r.subscription_id)?.clientId).filter(Boolean))) as string[];
  const [usersRes, clientsRes] = await Promise.all([
    userIds.length
      ? supabaseDb.from("users").select("id,name,display_name,phone").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    clientIds.length
      ? supabaseDb.from("cleaning_clients").select("id,company_name,contact_name,whatsapp").in("id", clientIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const userMap = new Map((usersRes.data ?? []).map((u: any) => [String(u.id), u]));
  const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [String(c.id), c]));

  return rows.map((row: any) => {
    const slot = row.cleaning_available_slots ?? {};
    const startAt = new Date(`${slot.date}T${String(slot.start_time || "09:00").slice(0, 5)}:00`);
    const endAt = slot.end_time
      ? new Date(`${slot.date}T${String(slot.end_time).slice(0, 5)}:00`)
      : null;
    const meta = subMap.get(row.subscription_id);
    const user = meta?.userId ? userMap.get(String(meta.userId)) : null;
    const client = meta?.clientId ? clientMap.get(String(meta.clientId)) : null;
    const customerName =
      user?.display_name ??
      user?.name ??
      client?.contact_name ??
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
        phone: user?.phone ?? client?.whatsapp ?? null,
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
    .select("id,meal_plan_id,customer_name,started_at,end_date,status,payment_status,weekly_price_cents,commitment_weeks,delivery_address")
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
    meta: { delivery_address: row.delivery_address },
  }));
}

async function fetchCars(providerId: string, from: string, to: string): Promise<UnifiedBookingRow[]> {
  const { data: vehicles } = await supabaseDb
    .from("rental_vehicles")
    .select("id,name")
    .eq("provider_id", providerId);
  const vMap = new Map((vehicles ?? []).map((v: any) => [v.id, v.name]));
  const vIds = Array.from(vMap.keys());
  if (!vIds.length) return [];

  const { data } = await supabaseDb
    .from("rental_bookings")
    .select("id,user_id,vehicle_id,start_date,end_date,start_time,end_time,status,payment_status,total_cents,customer_whatsapp,delivery_address,delivery_notes")
    .in("vehicle_id", vIds)
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date", { ascending: true });
  const rows = data ?? [];

  // Resolve customer display names off the users table so the calendar shows a
  // real name instead of a phone number. Fall back to whatsapp if the account
  // has no name column populated.
  const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
  const usersRes = userIds.length
    ? await supabaseDb.from("users").select("id,name,display_name,phone").in("id", userIds)
    : { data: [] as any[] };
  const userMap = new Map((usersRes.data ?? []).map((u: any) => [String(u.id), u]));

  return rows.map((row: any) => {
    const user = row.user_id ? userMap.get(String(row.user_id)) : null;
    return {
      id: row.id,
      sourceTable: "rental_bookings" as const,
      customerName: user?.display_name ?? user?.name ?? row.customer_whatsapp ?? null,
      planName: vMap.get(row.vehicle_id) ?? null,
      startAt: new Date(`${row.start_date}T${String(row.start_time || "09:00").slice(0, 5)}:00`),
      endAt: new Date(`${row.end_date}T${String(row.end_time || "18:00").slice(0, 5)}:00`),
      status: row.status ?? "unknown",
      paymentStatus: row.payment_status ?? null,
      priceCents: Number(row.total_cents || 0) || null,
      meta: {
        delivery_address: row.delivery_address,
        delivery_notes: row.delivery_notes,
        phone: user?.phone ?? row.customer_whatsapp ?? null,
      },
    };
  });
}

async function fetchBeach(_providerId: string, from: string, to: string): Promise<UnifiedBookingRow[]> {
  // Beach is platform-owned (single provider), so we ignore providerId and
  // return every court booking in range.
  const { data } = await supabaseDb
    .from("beach_club_court_bookings")
    .select("id,court_id,date,start_hour,end_hour,status,member_name,beach_club_courts(name)")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .order("start_hour", { ascending: true });

  return (data ?? []).map((row: any) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      id: row.id,
      sourceTable: "beach_club_court_bookings" as const,
      customerName: row.member_name ?? null,
      planName: row.beach_club_courts?.name ?? null,
      startAt: new Date(`${row.date}T${pad(Number(row.start_hour ?? 8))}:00:00`),
      endAt: new Date(`${row.date}T${pad(Number(row.end_hour ?? row.start_hour + 1))}:00:00`),
      status: row.status ?? "unknown",
      paymentStatus: null,
      priceCents: null,
    };
  });
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
 * UnifiedBookingRow. Cleaning/food/cars filter by their legacy
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
      if (sourceKey === "cars")     return fetchCars(providerId, from, to);
      if (sourceKey === "beach" || sourceKey === "beach_club") return fetchBeach(providerId, from, to);
      return [];
    },
    staleTime: 30_000,
  });
}
