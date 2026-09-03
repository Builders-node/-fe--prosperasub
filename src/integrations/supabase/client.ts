// Supabase-backed data adapter
// Auth: NestJS backend (JWT sessions kept in localStorage)
// Business data: Supabase PostgREST — cleaning, profiles, admin operations

import { createClient } from "@supabase/supabase-js";
import { cancelCleaningBookings } from "@/lib/cleaning/cancelBooking";

import {
  API_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
} from "@/integrations/supabase/config";
import {
  SESSION_KEY, GOOGLE_OAUTH_STATE_KEY, authStateListeners,
  readStoredSession, storeSession, clearStoredSession, getStoredSession,
  ownedUserFromSession, getOwnedUserDetails, notifyAuthStateChange,
  getValidStoredSession, refreshStoredSession, api, adminApi, accountApi,
  type StoredSession, type AuthStateChangeCallback,
} from "@/integrations/supabase/session";

// The session layer moved to its own file; these stay exported from here so
// no call site had to change.
export { adminApi, accountApi };
export type { StoredSession };

// Supabase client for direct DB access (uses anon key + permissive RLS policies)
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
/** Direct Supabase client — use for queries that need real relation joins */
export const supabaseDb = db;

type Filter = { field: string; op: "eq" | "neq" | "lte" | "gte" | "gt" | "in"; value: any };

// ─── The wrapper's own camelCase → snake_case mapping ───────────────────────
const toSnakeCleaningPackage = (pkg: any) => ({
  id: pkg.id,
  name: pkg.name,
  description: pkg.description,
  price_per_cleaning_cents: pkg.pricePerCleaningCents ?? pkg.price_per_cleaning_cents,
  monthly_price_cents: pkg.monthlyPriceCents ?? pkg.monthly_price_cents ?? null,
  cleanings_per_month: pkg.cleaningsPerMonth ?? pkg.cleanings_per_month,
  frequency_unit: pkg.frequencyUnit ?? pkg.frequency_unit ?? "month",
  frequency_count: pkg.frequencyCount ?? pkg.frequency_count ?? pkg.cleaningsPerMonth ?? pkg.cleanings_per_month ?? null,
  custom_frequency_label: pkg.customFrequencyLabel ?? pkg.custom_frequency_label ?? null,
  pricing_mode: pkg.pricingMode ?? pkg.pricing_mode ?? "price_per_cleaning",
  is_active: pkg.isActive ?? pkg.is_active ?? true,
});

const toSnakeUser = (user: any) => ({
  id: user.id,
  email: user.email ?? null,
  name: user.name ?? null,
  display_name: user.displayName ?? user.display_name ?? user.name ?? null,
  auth_provider: user.authProvider ?? user.auth_provider ?? "EMAIL",
  avatar_url: user.avatarUrl ?? user.avatar_url ?? null,
  roles: (user.roles ?? []).map((role: string) => role.toLowerCase()),
  created_at: user.createdAt ?? user.created_at ?? null,
  last_login_at: user.lastLoginAt ?? user.last_login_at ?? null,
});



// ============================================================
// DATE / TIME UTILITIES
// ============================================================

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const toDateOnly = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeTime = (time?: string | null) => {
  if (!time) return "";
  return time.length === 5 ? `${time}:00` : time;
};

const normalizeWeekdays = (days: any[] = []) =>
  days
    .map((day) => {
      if (typeof day === "number") return day;
      const upper = String(day).trim().toUpperCase();
      return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].indexOf(upper);
    })
    .filter((day) => day >= 0 && day <= 6);

const eachRecurringWeekday = (startDate: Date, endDate: Date, dayOfWeek: number) => {
  const dates: string[] = [];
  for (let date = new Date(startDate); date <= endDate; date = addDays(date, 1)) {
    if (date.getDay() === dayOfWeek) dates.push(formatDate(date));
  }
  return dates;
};

const compareFilterValues = (left: any, right: any) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
};

// ============================================================
// CLEANING PACKAGE HELPERS (hardcoded; populated from NestJS API)
// ============================================================

const _packageCache = new Map<string, { name: string; cleanings_per_month: number; price_per_cleaning_cents: number }>();

/**
 * Which slot grid a cleaning package books against — the universal
 * `providers.id`, or null when the provider keeps no rows of its own and the
 * legacy shared grid is still its schedule.
 *
 * package → legacy provider → universal provider, the same walk the booking
 * page and seed_cleaning_slots make. Cached per package: scheduling calls it
 * once, but rescheduling hits the same one repeatedly.
 */
const _providerGridCache = new Map<string, string | null>();

/**
 * The LEGACY provider id a package belongs to — what `cleaning_bookings.
 * provider_id` holds, and what the provider workspace scopes every query by.
 *
 * Its absence was a silent, live bug: the customer booking paths never wrote
 * this column, so 18 visits existed with no owner and the Car Wash owner's
 * Bookings tab was empty while the work was scheduled. The admin dialog set
 * it; the two paths a customer actually uses did not.
 */
const _legacyProviderCache = new Map<string, string | null>();
const cleaningLegacyProviderId = async (packageId?: string | null): Promise<string | null> => {
  if (!packageId) return null;
  if (_legacyProviderCache.has(packageId)) return _legacyProviderCache.get(packageId) ?? null;
  let legacyId: string | null = null;
  try {
    const { data: pkg } = await db
      .from("cleaning_packages").select("provider_id").eq("id", packageId).maybeSingle();
    legacyId = (pkg as { provider_id?: string } | null)?.provider_id ?? null;
  } catch {
    legacyId = null; // never fail a booking over its label
  }
  _legacyProviderCache.set(packageId, legacyId);
  return legacyId;
};

const cleaningProviderGridId = async (packageId?: string | null): Promise<string | null> => {
  if (!packageId) return null;
  if (_providerGridCache.has(packageId)) return _providerGridCache.get(packageId) ?? null;

  let gridId: string | null = null;
  try {
    const { data: pkg } = await db
      .from("cleaning_packages").select("provider_id").eq("id", packageId).maybeSingle();
    const legacyId = (pkg as { provider_id?: string } | null)?.provider_id;
    if (legacyId) {
      const { data: prov } = await db
        .from("providers").select("id")
        .eq("source_service_key", "cleaning")
        .eq("source_provider_id", legacyId)
        .maybeSingle();
      gridId = (prov as { id?: string } | null)?.id ?? null;
    }
  } catch {
    gridId = null; // fall back to the shared grid rather than fail the booking
  }

  _providerGridCache.set(packageId, gridId);
  return gridId;
};

const cleaningPackageForId = async (packageId: string) => {
  const cached = _packageCache.get(packageId);
  if (cached) return cached;

  const { data } = await db
    .from("cleaning_packages")
    .select("name, cleanings_per_month, price_per_cleaning_cents")
    .eq("id", packageId)
    .maybeSingle();

  const pkg = data ?? { name: "Unknown", cleanings_per_month: 4, price_per_cleaning_cents: 0 };
  _packageCache.set(packageId, pkg);
  return pkg;
};

const normalizeBillingMonths = (value: unknown) => {
  const months = Number(value);
  return months === 2 || months === 3 ? months : 1;
};

async function normalizeCleaningSubscription(subscription: any) {
  const packageDetails = await cleaningPackageForId(subscription.package_id);
  const billingPeriodMonths = normalizeBillingMonths(subscription.billing_period_months);
  const monthlyPriceCents =
    Number(subscription.monthly_price_cents) ||
    packageDetails.price_per_cleaning_cents * packageDetails.cleanings_per_month;
  const totalPriceCents =
    Number(subscription.total_price_cents) || monthlyPriceCents * billingPeriodMonths;
  const startDate =
    subscription.service_start_date || subscription.start_date || formatDate(new Date());
  const endDate =
    subscription.paid_until ||
    subscription.service_end_date ||
    subscription.end_date ||
    formatDate(addMonths(toDateOnly(startDate) ?? new Date(), billingPeriodMonths));
  const paidUntil = toDateOnly(endDate);
  const today = toDateOnly(formatDate(new Date()));
  const isExpired =
    subscription.payment_status === "paid" && paidUntil && today && paidUntil < today;

  return {
    ...subscription,
    start_date: subscription.start_date || startDate,
    end_date: subscription.end_date || endDate,
    service_start_date: startDate,
    service_end_date: subscription.service_end_date || endDate,
    paid_until: endDate,
    billing_period_months: billingPeriodMonths,
    monthly_price_cents: monthlyPriceCents,
    total_price_cents: totalPriceCents,
    recurring_day_of_week: subscription.recurring_day_of_week ?? null,
    recurring_time: subscription.recurring_time ?? null,
    subscription_status: isExpired
      ? "expired"
      : subscription.subscription_status ||
        (subscription.is_active ? "active" : "pending"),
    is_active: isExpired ? false : subscription.is_active,
    cleaning_packages: {
      ...packageDetails,
      ...subscription.cleaning_packages,
    },
  };
}

const normalizeClientLookup = (value?: string | null) => String(value || "").trim().toLowerCase();
const normalizeClientPhone  = (value?: string | null) => String(value || "").replace(/\D/g, "");

function findDuplicateCleaningClient(clients: any[], payload: any) {
  const email   = normalizeClientLookup(payload.email);
  const phone   = normalizeClientPhone(payload.phone);
  const company = normalizeClientLookup(payload.company_name);
  const location = normalizeClientLookup(payload.location);

  if (!email && !phone && !company) return null;

  return clients.find((client) => {
    const clientEmail   = normalizeClientLookup(client.email);
    const clientPhone   = normalizeClientPhone(client.phone);
    const clientCompany = normalizeClientLookup(client.company_name);
    const clientLocation = normalizeClientLookup(client.location);

    return (
      (email && clientEmail && email === clientEmail) ||
      (phone && clientPhone && phone === clientPhone) ||
      (company && location && clientCompany === company && clientLocation === location)
    );
  });
}

// ============================================================
// SLOT SEEDING
// ============================================================

let _slotSeedAttempted = false;
async function ensureSlotsSeeded() {
  if (_slotSeedAttempted) return;
  _slotSeedAttempted = true;

  try {
    await api("/cleaning/ensure-slots", { method: "POST" });
  } catch {
    _slotSeedAttempted = false;
  }
}

/**
 * Find — or create — the slot a booking at this date and time belongs to.
 *
 * `providerId` is the UNIVERSAL providers.id, which is what
 * cleaning_available_slots.provider_id references. Callers holding a legacy
 * per-service id must bridge it first (useUniversalIdForLegacy).
 *
 * Omitting it means the legacy shared grid, which is still the schedule for
 * platform-run cleaning that belongs to no single provider. Since grids became
 * per-provider, two providers may legitimately publish the same hour — so a
 * lookup that filtered only on date and time could return SOMEONE ELSE'S slot
 * and count a booking against their capacity. That is how a hand-added booking
 * for one provider ended up on the shared grid at a 105-minute length its own
 * provider never offers.
 */
export async function ensureCleaningSlot(
  date: string,
  startTime: string,
  endTime: string,
  providerId?: string | null,
): Promise<any> {
  const normalizedStart = normalizeTime(startTime);
  const normalizedEnd   = normalizeTime(endTime);

  let lookup = db
    .from("cleaning_available_slots")
    .select("*")
    .eq("date", date)
    .eq("start_time", normalizedStart)
    .eq("end_time", normalizedEnd);
  lookup = providerId
    ? lookup.eq("provider_id", providerId)
    : lookup.is("provider_id", null);

  const { data: existing } = await lookup.maybeSingle();

  if (existing) return existing;

  // How many bookings this hour can hold. The provider's own answer wins; the
  // platform-wide numbers are the fallback for the shared grid, which belongs
  // to no single provider, and for a provider that has never set one.
  let capacity: number | null = null;
  if (providerId) {
    const { data: provider } = await db
      .from("providers")
      .select("booking_settings")
      .eq("id", providerId)
      .maybeSingle();
    const own = Number((provider?.booking_settings as { capacity?: unknown } | null)?.capacity);
    if (Number.isFinite(own) && own >= 1) capacity = Math.floor(own);
  }

  if (capacity === null) {
    const { data: settings } = await db
      .from("global_settings")
      .select("key, value")
      .in("key", ["default_slot_capacity", "saturday_slot_capacity"]);
    const settingsMap = new Map((settings || []).map((s: any) => [s.key, s.value]));
    const defaultCap = Math.max(1, Number(settingsMap.get("default_slot_capacity")) || 1);
    const saturdayCap = Math.max(1, Number(settingsMap.get("saturday_slot_capacity")) || defaultCap);
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    capacity = dayOfWeek === 6 ? saturdayCap : defaultCap;
  }

  // The id carries the provider, because the old scheme collides the moment
  // two providers offer the same hour — and the unique index is now scoped by
  // provider, so the database would happily accept both rows and the second
  // insert would fail on the primary key instead.
  const hhmm = normalizedStart.slice(0, 5).replace(":", "");
  const slot = {
    id: providerId
      ? `slot-${providerId.replace(/-/g, "").slice(0, 8)}-${date}-${hhmm}`
      : `owned-cleaning-slot-${date}-${hhmm}`,
    date,
    start_time: normalizedStart,
    end_time: normalizedEnd,
    max_bookings: capacity,
    current_bookings: 0,
    is_active: true,
    provider_id: providerId ?? null,
  };

  const { data } = await db
    .from("cleaning_available_slots")
    .insert(slot)
    .select()
    .single();

  return data ?? slot;
}

// ============================================================
// SUPABASE FILTER HELPERS
// ============================================================

function applyDbFilters(query: any, filters: Filter[]) {
  let q = query;
  for (const filter of filters) {
    switch (filter.op) {
      case "eq":  q = q.eq(filter.field, filter.value); break;
      case "neq": q = q.neq(filter.field, filter.value); break;
      case "lte": q = q.lte(filter.field, filter.value); break;
      case "gte": q = q.gte(filter.field, filter.value); break;
      case "gt":  q = q.gt(filter.field, filter.value); break;
      case "in":  q = q.in(filter.field, filter.value); break;
    }
  }
  return q;
}

// ============================================================
// QUERY BUILDER
// ============================================================

class OwnedQueryBuilder {
  private filters: Filter[] = [];
  private selected = "*";
  private take: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private orderField: string | null = null;
  private pendingMutation: { action: string; values: any } | null = null;

  constructor(private readonly table: string) {}

  select(columns = "*", _options?: any) {
    this.selected = columns;
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }
  lte(field: string, value: any) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }
  gte(field: string, value: any) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }
  gt(field: string, value: any) {
    this.filters.push({ field, op: "gt", value });
    return this;
  }
  neq(field: string, value: any) {
    this.filters.push({ field, op: "neq", value });
    return this;
  }
  in(field: string, value: any[]) {
    this.filters.push({ field, op: "in", value });
    return this;
  }

  order(field: string, _options?: any) {
    this.orderField = field;
    return this;
  }

  limit(count: number) {
    this.take = count;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this.execute();
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this.execute();
  }

  insert(values: any) {
    this.pendingMutation = { action: "insert", values };
    return this;
  }

  upsert(values: any) {
    this.pendingMutation = { action: "upsert", values };
    return this;
  }

  update(values: any) {
    return {
      eq: (field: string, value: any) => {
        this.filters.push({ field, op: "eq", value });
        this.pendingMutation = { action: "update", values };
        return this;
      },
    };
  }

  delete() {
    return {
      eq: (field: string, value: any) => {
        this.filters.push({ field, op: "eq", value });
        this.pendingMutation = { action: "delete", values: null };
        return this;
      },
    };
  }

  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
  }

  // --------------------------------------------------------
  // MUTATE  (all tables → Supabase or NestJS API)
  // --------------------------------------------------------
  private async mutate(
    action: string,
    values: any,
  ): Promise<{ data: any; error: any }> {
    const now = new Date().toISOString();

    // ── USER_PROFILES ──
    if (this.table === "user_profiles") {
      const user = ownedUserFromSession();
      if (!user) return { data: null, error: new Error("Not authenticated") };

      if (action === "insert" || action === "upsert") {
        const input = Array.isArray(values) ? values[0] : values;
        const userId = input.user_id ?? user.id;
        const row = {
          user_id: userId,
          phone_number: input.phone_number ?? null,
          telegram_username: input.telegram_username ?? null,
          nwc_connection: input.nwc_connection ?? null,
        };
        const { data, error } = await db
          .from("user_profiles")
          .upsert(row, { onConflict: "user_id" })
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }

      if (action === "update") {
        const userId = this.filters.find((f) => f.field === "user_id")?.value ?? user.id;
        const { data, error } = await db
          .from("user_profiles")
          .upsert({ ...values, user_id: userId }, { onConflict: "user_id" })
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }
    }

    // ── CLEANING_SUBSCRIPTIONS ──
    if (this.table === "cleaning_subscriptions") {
      if (action === "insert") {
        const input = Array.isArray(values) ? values[0] : values;
        const row = {
          user_id: input.user_id,
          package_id: input.package_id,
          start_date: input.start_date,
          end_date: input.end_date,
          service_start_date: input.service_start_date || input.start_date,
          service_end_date: input.service_end_date || input.end_date,
          paid_until: input.paid_until || input.end_date,
          billing_period_months: input.billing_period_months || 1,
          monthly_price_cents: input.monthly_price_cents || 0,
          total_price_cents: input.total_price_cents || 0,
          // This insert rebuilds the row field by field, so any column missing
          // from this list is silently dropped — that is how surcharge_cents
          // got lost on its first pass. Add new columns here too.
          surcharge_cents: input.surcharge_cents || 0,
          cleanings_remaining: input.cleanings_remaining || 0,
          payment_status: input.payment_status || "pending",
          subscription_status: input.subscription_status || "pending_payment",
          payment_method: input.payment_method || null,
          payment_reference: input.payment_reference || null,
          apartment_note: input.apartment_note || null,
          cleaner_hint: input.cleaner_hint || null,
          is_active: input.is_active ?? false,
        };
        const { data, error } = await db
          .from("cleaning_subscriptions")
          .insert(row)
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }

      if (action === "update") {
        const id = this.filters.find((f) => f.field === "id")?.value;
        const { data, error } = await db
          .from("cleaning_subscriptions")
          .update({ ...values, updated_at: now })
          .eq("id", id)
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }
    }

    // ── GENERIC CLEANING + SUPPORT TABLES ──
    const genericSupportTables = [
      "cleaning_clients",
      "cleaning_completion_reports",
    ];

    if (genericSupportTables.includes(this.table)) {
      if (action === "insert" || action === "upsert") {
        const inputRows = Array.isArray(values) ? values : [values];
        const rows = inputRows.map((input) => ({
          created_at: now,
          updated_at: now,
          ...input,
        }));

        if (action === "upsert") {
          const { data, error } = await db
            .from(this.table)
            .upsert(rows)
            .select();
          return {
            data: Array.isArray(values) ? (data ?? []) : (data?.[0] ?? null),
            error: error ?? null,
          };
        }

        const { data, error } = await db
          .from(this.table)
          .insert(rows)
          .select();
        return {
          data: Array.isArray(values) ? (data ?? []) : (data?.[0] ?? null),
          error: error ?? null,
        };
      }

      if (action === "update") {
        const id = this.filters.find((f) => f.field === "id")?.value;

        // Cascade delete slot current_bookings when deleting a client
        if (this.table === "cleaning_clients" && action === "update") {
          // just update
        }

        const { data, error } = await db
          .from(this.table)
          .update({ ...values, updated_at: now })
          .eq("id", id)
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }

      if (action === "delete") {
        const id = this.filters.find((f) => f.field === "id")?.value;

        if (this.table === "cleaning_clients" && id) {
          // Decrement slot counts for active bookings belonging to this client
          const { data: clientBookings } = await db
            .from("cleaning_bookings")
            .select("id, slot_id, status")
            .eq("client_id", id);

          for (const booking of clientBookings || []) {
            if (booking.status === "booked" && booking.slot_id) {
              // PostgREST reports a failed RPC in `error`, it doesn't throw — so
              // the `.catch()` this used to hang the fallback off never fired.
              // Check the returned error instead, and await the fallback rather
              // than leaving it to a floating promise chain.
              const { error: decErr } = await db.rpc("decrement_slot_bookings", {
                p_slot_id: booking.slot_id,
              });
              if (decErr) {
                const { data: slot } = await db
                  .from("cleaning_available_slots")
                  .select("current_bookings")
                  .eq("id", booking.slot_id)
                  .single();
                if (slot) {
                  await db
                    .from("cleaning_available_slots")
                    .update({ current_bookings: Math.max(0, (slot.current_bookings ?? 0) - 1) })
                    .eq("id", booking.slot_id);
                }
              }
            }
          }
        }

        const { error } = await db.from(this.table).delete().eq("id", id);
        return { data: null, error: error ?? null };
      }
    }

    // ── CLEANING_BOOKINGS ──
    if (this.table === "cleaning_bookings") {
      if (action === "insert") {
        const input = Array.isArray(values) ? values[0] : values;
        const row = {
          google_calendar_event_id: null,
          google_calendar_event_link: null,
          google_calendar_synced_at: null,
          google_calendar_sync_status: "pending",
          google_calendar_sync_error: null,
          created_at: now,
          updated_at: now,
          ...input,
        };
        const { data, error } = await db
          .from("cleaning_bookings")
          .insert(row)
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }

      if (action === "update") {
        const id = this.filters.find((f) => f.field === "id")?.value;
        const { data, error } = await db
          .from("cleaning_bookings")
          .update({ ...values, updated_at: now })
          .eq("id", id)
          .select()
          .single();
        return { data: data ?? null, error: error ?? null };
      }
    }

    // Fallback
    return { data: values ?? null, error: null };
  }

  // --------------------------------------------------------
  // EXECUTE  (SELECT queries)
  // --------------------------------------------------------
  private async execute(): Promise<{ data: any; error: any; count?: number }> {
    if (this.pendingMutation) {
      const { action, values } = this.pendingMutation;
      this.pendingMutation = null;
      const result = await this.mutate(action, values);

      if (this.singleMode && Array.isArray(result.data)) {
        const row = result.data[0] ?? null;
        if (!row && this.singleMode === "single") {
          return { data: null, error: new Error("No rows found") };
        }
        return { data: row, error: result.error };
      }

      return result;
    }

    const { data, error, count } = await this.loadTable();
    if (error) return { data: null, error, count };

    let rows: any[] = Array.isArray(data) ? data : data ? [data] : [];

    // Client-side ordering for non-DB-backed tables
    if (this.orderField) {
      rows = [...rows].sort((a, b) =>
        String(a[this.orderField!]).localeCompare(String(b[this.orderField!])),
      );
    }

    if (this.take !== null) {
      rows = rows.slice(0, this.take);
    }

    if (this.singleMode) {
      const row = rows[0] ?? null;
      if (!row && this.singleMode === "single") {
        return { data: null, error: new Error("No rows found"), count };
      }
      return { data: row, error: null, count };
    }

    return { data: rows, error: null, count: count ?? rows.length };
  }

  private async loadTable(): Promise<{ data: any; error: any; count?: number }> {
    // ── CLEANING_PACKAGES (from Supabase DB) ──
    if (this.table === "cleaning_packages") {
      let q = db.from("cleaning_packages").select("*");
      q = applyDbFilters(q, this.filters);
      q = q.order("price_per_cleaning_cents", { ascending: true });
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }

    // ── CLEANING_AVAILABLE_SLOTS ──
    if (this.table === "cleaning_available_slots") {
      await ensureSlotsSeeded();
      let q = db.from("cleaning_available_slots").select("*");
      q = applyDbFilters(q, this.filters);
      if (this.orderField) q = q.order(this.orderField);
      else q = q.order("date").order("start_time");
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }

    // ── CLEANING_SUBSCRIPTIONS ──
    if (this.table === "cleaning_subscriptions") {
      let q = db.from("cleaning_subscriptions").select(this.selected || "*");
      q = applyDbFilters(q, this.filters);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }

    // ── CLEANING_BOOKINGS (with embedded relations) ──
    if (this.table === "cleaning_bookings") {
      let q = db.from("cleaning_bookings").select(`
        *,
        cleaning_available_slots (id, date, start_time, end_time),
        cleaning_clients (*),
        cleaning_completion_reports (*)
      `);
      q = applyDbFilters(q, this.filters);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) return { data: [], error };
      const user = getOwnedUserDetails() ?? { id: null, email: null, name: null, display_name: null };
      return {
        data: (data || []).map((b: any) => ({ ...b, users: user })),
        error: null,
      };
    }

    // ── CLEANING_CLIENTS ──
    if (this.table === "cleaning_clients") {
      let q = db.from("cleaning_clients").select("*");
      q = applyDbFilters(q, this.filters);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }


    // ── CLEANING_COMPLETION_REPORTS ──
    if (this.table === "cleaning_completion_reports") {
      let q = db.from("cleaning_completion_reports").select(`
        *,
        cleaning_bookings (
          *,
          cleaning_available_slots (id, date, start_time, end_time),
          cleaning_clients (*)
        )
      `);
      q = applyDbFilters(q, this.filters);
      q = q.order("completed_at", { ascending: false });
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }

    // ── USERS (from NestJS API or session) ──
    if (this.table === "users") {
      const idFilter = this.filters.find((f) => f.field === "id" && f.op === "eq");
      if (idFilter) {
        const meResult = await api("/auth/me");
        if (!meResult.error && meResult.data?.user) {
          const meUser = toSnakeUser(meResult.data.user);
          if (meUser.id === idFilter.value) {
            return { data: [meUser], error: null, count: 1 };
          }
        }
      }
      const result = await api("/admin/users");
      if (!result.error) {
        let rows = (result.data || []).map(toSnakeUser);
        for (const f of this.filters) {
          if (f.op === "eq") rows = rows.filter((r: any) => r[f.field] === f.value);
        }
        return { data: rows, error: null, count: rows.length };
      }
      const user = ownedUserFromSession() || (await api("/auth/me")).data?.user;
      return { data: user ? [toSnakeUser(user)] : [], error: null, count: user ? 1 : 0 };
    }

    // ── USER_ROLES (from session) ──
    if (this.table === "user_roles") {
      const session = getStoredSession();
      const roles = session?.roles ?? [];
      const userId = session?.user?.id ?? ownedUserFromSession()?.id ?? "";
      if (!userId) return { data: [], error: null, count: 0 };
      return {
        data: roles.map((role: string) => ({ user_id: userId, role })),
        error: null,
        count: roles.length,
      };
    }

    // ── GLOBAL_SETTINGS ──
    if (this.table === "global_settings") {
      const { data, error } = await db.from("global_settings").select("*");
      if (error) return { data: [], error };
      if (!data?.length) return { data: [], error: null };
      // Shape: [{ key, value }, ...] → also expose as flat { cutoff_hour: 18 }
      const settings = data.reduce(
        (acc: any, row: any) => ({ ...acc, [row.key]: row.value }),
        { id: "global" },
      );
      return { data: [settings], error: null };
    }

    // ── USER_PROFILES ──
    if (this.table === "user_profiles") {
      const user = ownedUserFromSession();
      if (!user) return { data: [], error: null };
      let q = db.from("user_profiles").select("*").eq("user_id", user.id);
      q = applyDbFilters(q, this.filters);
      const { data, error } = await q;
      if (error) return { data: [], error };
      return { data: data ?? [], error: null };
    }

    return { data: [], error: null, count: 0 };
  }
}

// ============================================================
// SUPABASE EXPORT OBJECT
// ============================================================

export const supabase = {
  // ── AUTH (NestJS backend) ──────────────────────────────────
  auth: {
    onAuthStateChange(callback: AuthStateChangeCallback) {
      authStateListeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => { authStateListeners.delete(callback); },
          },
        },
      };
    },
    async getSession() {
      return { data: { session: await getValidStoredSession() }, error: null };
    },
    async getUser() {
      const session = await getValidStoredSession();
      if (!session?.access_token) {
        return { data: { user: null }, error: null };
      }

      const result = await api("/auth/me", undefined, false);
      if (result.error || !result.data?.user) {
        return { data: { user: session.user ?? null }, error: result.error ?? null };
      }

      const updatedSession = {
        ...session,
        user: result.data.user,
        roles: result.data.roles || session.roles || [],
      };
      storeSession(updatedSession);
      return { data: { user: result.data.user }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (result.error) return { data: null, error: result.error };
      const session = { ...result.data.session, user: result.data.user, roles: result.data.roles };
      storeSession(session);
      notifyAuthStateChange("SIGNED_IN", session);
      return { data: { session, user: result.data.user }, error: null };
    },
    async signUp({ email, password, options }: any) {
      const result = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, name: options?.data?.name || email }),
      });
      if (result.error) return { data: null, error: result.error };
      if (result.data.session) {
        const session = {
          ...result.data.session,
          user: result.data.user,
          roles: result.data.roles || [],
        };
        storeSession(session);
        notifyAuthStateChange("SIGNED_IN", session);
        return { data: { user: result.data.user, session }, error: null };
      }
      return { data: { user: result.data.user, session: result.data.session }, error: null };
    },
    async signInWithOAuth({ provider, options }: { provider: string; options?: { redirectTo?: string } }) {
      if (provider !== "google") {
        return { data: null, error: new Error("Only Google OAuth is supported") };
      }
      const redirectUrl = options?.redirectTo || `${window.location.origin}/auth`;
      const state =
        globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state);

      const result = await api("/auth/google/start", {
        method: "POST",
        body: JSON.stringify({ redirectUrl, state }),
      });
      if (result.error) {
        localStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
        return { data: null, error: result.error };
      }
      window.location.assign(result.data.url);
      return { data: { provider, url: result.data.url }, error: null };
    },
    async completeOAuthSignIn({
      provider,
      code,
      state,
      redirectTo,
    }: {
      provider: string;
      code: string;
      state: string | null;
      redirectTo?: string;
    }) {
      if (provider !== "google") {
        return { data: null, error: new Error("Only Google OAuth is supported") };
      }
      const expectedState = localStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
      localStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
      if (!state || !expectedState || state !== expectedState) {
        return { data: null, error: new Error("Google login state could not be verified") };
      }
      const result = await api("/auth/google/callback", {
        method: "POST",
        body: JSON.stringify({
          provider,
          code,
          redirectUrl: redirectTo || `${window.location.origin}/auth`,
        }),
      });
      if (result.error) return { data: null, error: result.error };
      const session = {
        ...result.data.session,
        user: result.data.user,
        roles: result.data.roles || [],
      };
      storeSession(session);
      notifyAuthStateChange("SIGNED_IN", session);
      return { data: { session, user: result.data.user, roles: result.data.roles || [] }, error: null };
    },
    async requestPasswordReset(email: string, redirectUrl?: string) {
      return api("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email, redirectUrl }),
      });
    },
    async confirmPasswordReset(token: string, password: string) {
      return api("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
    },
    async updateUser(update?: { data?: { name?: string } }) {
      const session = readStoredSession();
      if (session && update?.data?.name) {
        const result = await api("/auth/me", undefined, false);
        if (result.error) return { data: { user: session.user ?? null }, error: result.error };
        const updatedSession = {
          ...session,
          user: result.data.user,
          roles: result.data.roles || session.roles || [],
        };
        storeSession(updatedSession);
        notifyAuthStateChange("SIGNED_IN", updatedSession);
      }
      return { data: { user: ownedUserFromSession() }, error: null };
    },
    async signOut() {
      clearStoredSession();
      notifyAuthStateChange("SIGNED_OUT", null);
      return { error: null };
    },
  },

  // ── FROM (query builder) ──────────────────────────────────
  from(table: string) {
    return new OwnedQueryBuilder(table);
  },

  // ── CALENDAR AUTO-SYNC ────────────────────────────────────
  _syncBookingToCalendar(bookingId: string) {
    // Fire-and-forget calendar sync via backend. Admins use the admin endpoint;
    // regular clients (who can't call it) fall back to the account endpoint that
    // syncs only their own booking — so the Google Calendar updates automatically
    // for everyone, with no manual reconcile.
    api(`/admin/cleaning/bookings/${bookingId}/sync-calendar`, { method: "POST" })
      .then((res: any) => {
        if (res?.error) {
          return api(`/account/cleaning/bookings/${bookingId}/sync`, { method: "POST" });
        }
      })
      .catch(() => {
        api(`/account/cleaning/bookings/${bookingId}/sync`, { method: "POST" }).catch(() => {});
      });
  },

  // ── RPC (business logic) ──────────────────────────────────
  rpc(name: string, params?: any) {
    if (name === "set_lightning_session") {
      return Promise.resolve({ data: null, error: null });
    }

    if (name === "get_user_profile") {
      const user = ownedUserFromSession();
      return Promise.resolve({ data: user ? [{ ...user }] : [], error: null });
    }

    if (name === "schedule_cleaning_subscription") {
      return (async () => {
        const subscriptionId = params?.p_subscription_id;
        const dayOfWeek = Number(params?.p_day_of_week);
        const startTime = normalizeTime(params?.p_start_time);
        const notes = typeof params?.p_notes === "string" ? params.p_notes.trim() : "";

        if (!subscriptionId || Number.isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 6 || !startTime) {
          return { data: null, error: new Error("Choose a weekday and time slot") };
        }
        if (!notes) {
          return { data: null, error: new Error("Apartment / access notes are required") };
        }

        const { data: subData, error: subError } = await db
          .from("cleaning_subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .single();

        if (subError || !subData) {
          return { data: null, error: new Error("Subscription not found") };
        }
        if (subData.payment_status !== "paid") {
          return { data: null, error: new Error("Payment must be completed before scheduling") };
        }
        if (!["pending_schedule", "active"].includes(subData.subscription_status)) {
          return { data: null, error: new Error("This cleaning subscription cannot be scheduled") };
        }

        const periodStart = toDateOnly(subData.service_start_date || subData.start_date || formatDate(new Date()));
        const periodEnd   = toDateOnly(subData.paid_until || subData.service_end_date || subData.end_date);
        if (!periodStart || !periodEnd || periodEnd < periodStart) {
          return { data: null, error: new Error("Cleaning service period is invalid") };
        }

        const today = toDateOnly(formatDate(new Date()));
        const recurringDates = eachRecurringWeekday(periodStart, periodEnd, dayOfWeek).filter((dateKey) => {
          const date = toDateOnly(dateKey);
          return date && today && date >= today;
        });

        if (recurringDates.length === 0) {
          return { data: null, error: new Error("No future cleanings match this schedule") };
        }

        await ensureSlotsSeeded();

        // Load all slots for the relevant date range
        const { data: allSlots } = await db
          .from("cleaning_available_slots")
          .select("*")
          .gte("date", formatDate(periodStart))
          .lte("date", formatDate(periodEnd));

        /**
         * Narrow to the grid this subscription actually books against.
         *
         * Slots became per-provider on 2026-08-10, so a (date, time) pair now
         * matches several rows — Car Wash's, Apartment Cleaning's and the
         * legacy shared one. Every lookup below is `slots.find(...)`, which
         * takes whichever came back first, so a car wash booked on 17 August
         * landed in the shared grid and one on 21 September landed in Car
         * Wash's, from the same schedule. Capacity was then checked and
         * decremented against whoever happened to win.
         *
         * Same rule as the booking page and the SQL function: the provider's
         * own rows when it keeps any, the shared grid otherwise.
         */
        const providerGridId = await cleaningProviderGridId(subData.package_id);
        // Who the visit belongs to. Without it the booking exists and its
        // provider cannot see it.
        const legacyProviderId = await cleaningLegacyProviderId(subData.package_id);
        const allSlotRows: any[] = allSlots || [];
        const ownRows = providerGridId
          ? allSlotRows.filter((s: any) => s.provider_id === providerGridId)
          : [];
        const slots: any[] = ownRows.length
          ? ownRows
          : allSlotRows.filter((s: any) => s.provider_id == null);

        // Load existing future bookings for this subscription
        const { data: existingBookings } = await db
          .from("cleaning_bookings")
          .select("id, slot_id, status")
          .or(`cleaning_subscription_id.eq.${subscriptionId},subscription_id.eq.${subscriptionId}`)
          .eq("status", "booked");

        const oldFutureBookings = (existingBookings || []).filter((b: any) => {
          const slot = slots.find((s: any) => s.id === b.slot_id);
          if (!slot) return false;
          const slotDate = toDateOnly(slot.date);
          return slotDate && today && slotDate >= today;
        });

        // Check availability
        const oldFutureSlotIds = new Set(oldFutureBookings.map((b: any) => b.slot_id));
        const unavailableDate = recurringDates.find((dateKey) => {
          const slot = slots.find(
            (s: any) => s.date === dateKey && normalizeTime(s.start_time) === startTime,
          );
          if (!slot || !slot.is_active) return true;
          if (oldFutureSlotIds.has(slot.id)) return false;
          return slot.current_bookings >= slot.max_bookings;
        });

        if (unavailableDate) {
          return {
            data: null,
            error: new Error(`The selected time is not available for every week. First conflict: ${unavailableDate}`),
          };
        }

        const now = new Date().toISOString();

        // Remove old future bookings
        if (oldFutureBookings.length > 0) {
          const oldIds = oldFutureBookings.map((b: any) => b.id);
          await db.from("cleaning_bookings").delete().in("id", oldIds);
          // Decrement slots
          for (const b of oldFutureBookings) {
            const slot = slots.find((s: any) => s.id === b.slot_id);
            if (slot) {
              await db
                .from("cleaning_available_slots")
                .update({ current_bookings: Math.max(0, (slot.current_bookings || 0) - 1), updated_at: now })
                .eq("id", slot.id);
            }
          }
        }

        // Create new recurring bookings
        const generatedBookings = recurringDates.map((dateKey, index) => {
          const slot = slots.find(
            (s: any) => s.date === dateKey && normalizeTime(s.start_time) === startTime,
          );
          return {
            cleaning_subscription_id: subscriptionId,
            subscription_id: subscriptionId,
            provider_id: legacyProviderId,
            slot_id: slot?.id,
            user_id: subData.user_id ?? getOwnedUserDetails()?.id ?? "unknown",
            status: "booked",
            source: "user_recurring_schedule",
            notes,
            google_calendar_event_id: null,
            google_calendar_event_link: null,
            google_calendar_synced_at: null,
            google_calendar_sync_status: "pending",
            google_calendar_sync_error: null,
          };
        });

        if (generatedBookings.length > 0) {
          await db.from("cleaning_bookings").insert(generatedBookings);
          // Increment slot counts
          const slotIncrements = new Map<string, number>();
          for (const b of generatedBookings) {
            if (b.slot_id) slotIncrements.set(b.slot_id, (slotIncrements.get(b.slot_id) || 0) + 1);
          }
          for (const [slotId, inc] of slotIncrements) {
            const slot = slots.find((s: any) => s.id === slotId);
            if (slot) {
              await db
                .from("cleaning_available_slots")
                .update({ current_bookings: (slot.current_bookings || 0) + inc, updated_at: now })
                .eq("id", slotId);
            }
          }
        }

        // Update subscription
        const packageDetails = await cleaningPackageForId(subData.package_id);
        const purchasedCleanings =
          packageDetails.cleanings_per_month * normalizeBillingMonths(subData.billing_period_months);
        await db
          .from("cleaning_subscriptions")
          .update({
            recurring_day_of_week: dayOfWeek,
            recurring_time: startTime,
            cleanings_remaining: Math.max(0, purchasedCleanings - generatedBookings.length),
            subscription_status: "active",
            is_active: true,
            updated_at: now,
          })
          .eq("id", subscriptionId);

        // Auto-sync all created bookings to Google Calendar. Uses the
        // account-scoped endpoint so regular buyers (not just admins) trigger
        // it — otherwise the admin route 401s silently and events only land on
        // the next daily cron run.
        if (generatedBookings.length > 0) {
          api(
            `/account/cleaning/subscriptions/${encodeURIComponent(subscriptionId)}/sync-bookings`,
            { method: "POST" },
          ).catch(() => {});
        }

        return {
          data: {
            subscription_id: subscriptionId,
            bookings_created: generatedBookings.length,
            recurring_day_of_week: dayOfWeek,
            recurring_time: startTime,
          },
          error: null,
        };
      })();
    }

    if (name === "book_cleaning_slot") {
      return (async () => {
        const subscriptionId = params?.p_subscription_id;
        const slotId = params?.p_slot_id;
        const notes = params?.p_notes ?? null;

        const [{ data: subData }, { data: slotData }] = await Promise.all([
          db.from("cleaning_subscriptions").select("*").eq("id", subscriptionId).single(),
          db.from("cleaning_available_slots").select("*").eq("id", slotId).single(),
        ]);

        if (!subData || !subData.is_active || subData.cleanings_remaining <= 0) {
          return { data: null, error: new Error("No active cleaning subscription available") };
        }
        if (!slotData || !slotData.is_active) {
          return { data: null, error: new Error("This cleaning slot is no longer available") };
        }
        if (slotData.current_bookings >= slotData.max_bookings) {
          return { data: null, error: new Error("This cleaning slot is full") };
        }

        const slotDate = new Date(`${slotData.date}T00:00:00`);
        if (slotDate.getDay() === 0) {
          return { data: null, error: new Error("Cleaning is available Monday through Saturday") };
        }

        // Check daily booking limit (max 3 per day across all users)
        const { data: dayBookings } = await db
          .from("cleaning_bookings")
          .select("id, slot_id")
          .eq("status", "booked");
        const today_slot_date = slotData.date;
        const { data: allSlotsForDay } = await db
          .from("cleaning_available_slots")
          .select("id")
          .eq("date", today_slot_date);
        const slotIdsForDay = new Set((allSlotsForDay || []).map((s: any) => s.id));
        const dayBookingCount = (dayBookings || []).filter((b: any) => slotIdsForDay.has(b.slot_id)).length;
        if (dayBookingCount >= 3) {
          return { data: null, error: new Error("This day is fully booked") };
        }

        // Check weekly booking for this subscription
        const slotDateObj = new Date(`${slotData.date}T00:00:00`);
        const day = slotDateObj.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const weekStart = new Date(slotDateObj);
        weekStart.setDate(weekStart.getDate() + diffToMonday);
        const weekEnd = addDays(weekStart, 6);

        const { data: weekSlots } = await db
          .from("cleaning_available_slots")
          .select("id, date")
          .gte("date", formatDate(weekStart))
          .lte("date", formatDate(weekEnd));
        const weekSlotIds = new Set((weekSlots || []).map((s: any) => s.id));

        const { data: weekBookings } = await db
          .from("cleaning_bookings")
          .select("slot_id")
          .eq("status", "booked")
          .eq("cleaning_subscription_id", subscriptionId);

        const hasWeeklyBooking = (weekBookings || []).some((b: any) => weekSlotIds.has(b.slot_id));
        if (hasWeeklyBooking) {
          return { data: null, error: new Error("You already have a cleaning booked for this week") };
        }

        const now = new Date().toISOString();
        const { data: booking, error: bookingError } = await db
          .from("cleaning_bookings")
          .insert({
            cleaning_subscription_id: subscriptionId,
            subscription_id: subscriptionId,
            provider_id: await cleaningLegacyProviderId(subData.package_id),
            slot_id: slotId,
            user_id: subData.user_id ?? getOwnedUserDetails()?.id ?? "unknown",
            status: "booked",
            notes,
            google_calendar_sync_status: "pending",
          })
          .select()
          .single();

        if (bookingError) return { data: null, error: bookingError };

        await Promise.all([
          db
            .from("cleaning_available_slots")
            .update({ current_bookings: (slotData.current_bookings || 0) + 1, updated_at: now })
            .eq("id", slotId),
          db
            .from("cleaning_subscriptions")
            .update({
              cleanings_remaining: Math.max(0, (subData.cleanings_remaining || 0) - 1),
              updated_at: now,
            })
            .eq("id", subscriptionId),
        ]);

        // Auto-sync to Google Calendar
        supabase._syncBookingToCalendar(booking.id);

        return { data: [{ id: booking.id }], error: null };
      })();
    }

    if (name === "cancel_cleaning_booking") {
      return (async () => {
        const bookingId = params?.p_booking_id as string;
        try {
          // Shared with the three admin/owner cancel paths — cancelling has to
          // release the slot seat and refund the cleaning wherever it happens.
          const { cancelled, skipped } = await cancelCleaningBookings(db, [bookingId]);
          if (cancelled.length === 0) {
            return {
              data: null,
              error: new Error(
                skipped.length ? "This booking is already cancelled or completed" : "Booking not found",
              ),
            };
          }
        } catch (err) {
          return { data: null, error: err instanceof Error ? err : new Error("Could not cancel booking") };
        }

        // Auto-sync cancellation to Google Calendar
        supabase._syncBookingToCalendar(bookingId);

        return { data: [{ id: bookingId }], error: null };
      })();
    }

    if (name === "complete_cleaning_booking") {
      return (async () => {
        const bookingId = params?.p_booking_id;
        const { data: booking, error: findError } = await db
          .from("cleaning_bookings")
          .select("*")
          .eq("id", bookingId)
          .single();

        if (findError || !booking) {
          return { data: null, error: new Error("Cleaning booking not found") };
        }

        const now = new Date().toISOString();
        const report = {
          booking_id: bookingId,
          custom_plan_id: booking.custom_plan_id ?? null,
          client_id: booking.client_id ?? null,
          checklist_completed: params?.p_checklist_completed ?? [],
          notes: params?.p_notes ?? null,
          photo_url: params?.p_photo_url ?? null,
          issue_report: params?.p_issue_report ?? null,
          completed_by: params?.p_completed_by ?? getOwnedUserDetails()?.display_name ?? "Unknown",
          completed_at: now,
        };

        const { data: reportData } = await db
          .from("cleaning_completion_reports")
          .insert(report)
          .select()
          .single();

        await db
          .from("cleaning_bookings")
          .update({ status: "completed", google_calendar_sync_status: "pending", updated_at: now })
          .eq("id", bookingId);

        // Auto-sync completion to Google Calendar
        supabase._syncBookingToCalendar(bookingId);

        return { data: [{ id: reportData?.id ?? bookingId }], error: null };
      })();
    }

    // An RPC this wrapper doesn't shim used to resolve as SUCCESS with an empty
    // result. That is how `decrement_slot_bookings` went unnoticed for so long:
    // the admin reschedule called it, got `error: null`, skipped its manual
    // fallback, and silently leaked a slot seat on every move. Report the miss
    // so a caller's error branch actually runs.
    return Promise.resolve({
      data: null,
      error: new Error(`RPC "${name}" is not available through this client. Use supabaseDb for direct Postgres functions.`),
    });
  },

  // ── EDGE FUNCTIONS ────────────────────────────────────────
  functions: {
    async invoke(name: string, options?: { body?: any }) {
      if (name === "create-invoice") {
        return api("/payments/lightning/invoice", {
          method: "POST",
          body: JSON.stringify(options?.body || {}),
        });
      }
      if (name === "verify-payment") {
        return api("/payments/lightning/status", {
          method: "POST",
          body: JSON.stringify(options?.body || {}),
        });
      }
      if (name === "create-onchain-charge") {
        return api("/payments/onchain/address", {
          method: "POST",
          body: JSON.stringify(options?.body || {}),
        });
      }
      if (name === "verify-onchain-payment") {
        return api("/payments/onchain/status", {
          method: "POST",
          body: JSON.stringify(options?.body || {}),
        });
      }
      if (name === "send-payment-confirmation-email") {
        return api("/mail/payment-confirmation", {
          method: "POST",
          body: JSON.stringify(options?.body || {}),
        });
      }
      return { data: null, error: new Error(`Function ${name} is not implemented`) };
    },
  },

  // ── ADMIN HELPERS ─────────────────────────────────────────
  admin: {
    syncAllCleaningBookingsCalendar() {
      return api("/admin/cleaning/bookings/sync-calendar", { method: "POST" });
    },
    syncCleaningBookingCalendar(bookingId: string) {
      return api(`/admin/cleaning/bookings/${bookingId}/sync-calendar`, { method: "POST" });
    },
    syncCleaningBookingDirect(
      bookingId: string,
      payload: {
        date: string;
        startTime: string;
        endTime: string;
        clientName?: string;
        planName?: string;
        location?: string;
        status?: string;
        notes?: string;
        googleCalendarEventId?: string;
      },
    ) {
      return api(`/admin/cleaning/bookings/${bookingId}/sync-direct`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    updateCleaningBooking(bookingId: string, payload: Record<string, unknown>) {
      return api(`/admin/cleaning/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    deleteCleaningBooking(bookingId: string) {
      return api(`/admin/cleaning/bookings/${bookingId}`, { method: "DELETE" });
    },
    listPaymentNotifications() {
      return api("/admin/payment-notifications");
    },
    resendPaymentNotification(id: string) {
      return api(`/admin/payment-notifications/${id}/resend`, { method: "POST" });
    },
  },

  // ── STORAGE (stub) ────────────────────────────────────────
  storage: {
    from() {
      return {
        upload: async () => ({ data: null, error: new Error("Storage is not connected yet.") }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      };
    },
  },
};
