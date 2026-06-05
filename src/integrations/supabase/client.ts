// Supabase-backed data adapter
// Auth: NestJS backend (JWT sessions kept in localStorage)
// Business data: Supabase PostgREST — cleaning, profiles, admin operations

import { createClient } from "@supabase/supabase-js";

// ============================================================
// CONFIG
// ============================================================

const resolveApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  const fallbackUrl = "http://127.0.0.1:8082";

  if (configuredUrl && !configuredUrl.includes("127.0.0.1") && !configuredUrl.includes("localhost")) {
    return configuredUrl;
  }

  if (typeof window !== "undefined") {
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!isLocalHost) {
      return "https://api.prosperasub.com";
    }
  }

  return configuredUrl || fallbackUrl;
};

const API_URL = resolveApiUrl();

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://igbytraidldkhhamsfdo.supabase.co";

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnYnl0cmFpZGxka2hoYW1zZmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQxMzEsImV4cCI6MjA5NTU3MDEzMX0.VbaT7LMvtwswdfyDZI1rWkZtKSC0ICBDHeVbO4hLJeI";

// Session keys (these stay in localStorage — they're auth tokens, not business data)
const SESSION_KEY = "prospera_owned_session";
const GOOGLE_OAUTH_STATE_KEY = "prospera_google_oauth_state";

// Supabase client for direct DB access (uses anon key + permissive RLS policies)
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
/** Direct Supabase client — use for queries that need real relation joins */
export const supabaseDb = db;

// ============================================================
// TYPES
// ============================================================

type Filter = { field: string; op: "eq" | "neq" | "lte" | "gte" | "gt" | "in"; value: any };
type AuthStateChangeCallback = (event: "SIGNED_IN" | "SIGNED_OUT", session: any) => void;
type StoredSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: any;
  roles?: string[];
};

const authStateListeners = new Set<AuthStateChangeCallback>();

// ============================================================
// DATA SHAPE HELPERS
// ============================================================

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
// SESSION MANAGEMENT
// ============================================================

const readStoredSession = (): StoredSession | null => {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as StoredSession;
    if (sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return session;
  } catch {
    clearStoredSession();
    return null;
  }
};

const clearStoredSession = () => {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
};

const isSessionExpiring = (session: StoredSession | null) => {
  if (!session?.access_token || !session.expires_at) return true;
  return session.expires_at <= Math.floor(Date.now() / 1000) + 60;
};

const isAuthEndpoint = (path: string) =>
  path.startsWith("/auth/login") ||
  path.startsWith("/auth/signup") ||
  path.startsWith("/auth/refresh") ||
  path.startsWith("/auth/password-reset") ||
  path.startsWith("/auth/google");

async function refreshStoredSession() {
  const current = readStoredSession();
  if (!current?.refresh_token) {
    clearStoredSession();
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
  } catch {
    return current;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.session) {
    clearStoredSession();
    notifyAuthStateChange("SIGNED_OUT", null);
    return null;
  }

  const session = {
    ...data.session,
    user: data.user,
    roles: data.roles || [],
  };
  storeSession(session);
  notifyAuthStateChange("SIGNED_IN", session);
  return session;
}

async function getValidStoredSession() {
  const session = readStoredSession();
  if (!session) return null;
  if (!isSessionExpiring(session)) return session;
  return refreshStoredSession();
}

async function api(path: string, init?: RequestInit, retryOnUnauthorized = true) {
  const session = isAuthEndpoint(path) ? null : await getValidStoredSession();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    window.clearTimeout(timeout);
    return {
      data: null,
      error: new Error(error instanceof DOMException && error.name === "AbortError" ? "API request timed out" : "API request failed"),
    };
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);

  if (response.status === 401 && retryOnUnauthorized && !isAuthEndpoint(path)) {
    const refreshedSession = await refreshStoredSession();
    if (refreshedSession?.access_token) {
      return api(path, init, false);
    }
  }

  if (!response.ok) {
    return { data: null, error: new Error(data?.message || "API request failed") };
  }

  return { data, error: null };
}

export async function adminApi(path: string, init?: RequestInit) {
  return api(path, init);
}

/** Authenticated API calls for the user-facing account portal */
export async function accountApi(path: string, init?: RequestInit) {
  return api(path, init);
}

function getStoredSession() {
  return readStoredSession();
}

function storeSession(payload: any) {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function ownedUserFromSession() {
  return getStoredSession()?.user ?? null;
}

function notifyAuthStateChange(event: "SIGNED_IN" | "SIGNED_OUT", session: any) {
  authStateListeners.forEach((callback) => {
    setTimeout(() => callback(event, session), 0);
  });
}

// ============================================================
// CURRENT USER DETAILS
// ============================================================

function getOwnedUserDetails() {
  const user = ownedUserFromSession();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? user.displayName ?? user.display_name ?? null,
    display_name: user.displayName ?? user.display_name ?? user.name ?? null,
  };
}

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
    await api("/admin/cleaning/seed-slots", { method: "POST" });
  } catch {
    _slotSeedAttempted = false;
  }
}

async function ensureCleaningSlot(
  date: string,
  startTime: string,
  endTime: string,
): Promise<any> {
  const normalizedStart = normalizeTime(startTime);
  const normalizedEnd   = normalizeTime(endTime);

  const { data: existing } = await db
    .from("cleaning_available_slots")
    .select("*")
    .eq("date", date)
    .eq("start_time", normalizedStart)
    .eq("end_time", normalizedEnd)
    .maybeSingle();

  if (existing) return existing;

  // Read default capacity from global settings
  const { data: settings } = await db
    .from("global_settings")
    .select("key, value")
    .in("key", ["default_slot_capacity", "saturday_slot_capacity"]);
  const settingsMap = new Map((settings || []).map((s: any) => [s.key, s.value]));
  const defaultCap = Math.max(1, Number(settingsMap.get("default_slot_capacity")) || 1);
  const saturdayCap = Math.max(1, Number(settingsMap.get("saturday_slot_capacity")) || defaultCap);
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const capacity = dayOfWeek === 6 ? saturdayCap : defaultCap;

  const slot = {
    id: `owned-cleaning-slot-${date}-${normalizedStart.slice(0, 5).replace(":", "")}`,
    date,
    start_time: normalizedStart,
    end_time: normalizedEnd,
    max_bookings: capacity,
    current_bookings: 0,
    is_active: true,
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
          cleanings_remaining: input.cleanings_remaining || 0,
          payment_status: input.payment_status || "pending",
          subscription_status: input.subscription_status || "pending_payment",
          payment_method: input.payment_method || null,
          payment_reference: input.payment_reference || null,
          apartment_note: input.apartment_note || null,
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
      "cleaning_custom_plans",
      "cleaning_recurring_schedules",
      "cleaning_checklist_templates",
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
              await db.rpc("decrement_slot_bookings", { p_slot_id: booking.slot_id }).catch(() => {
                // Fallback: manual decrement
                db.from("cleaning_available_slots")
                  .select("current_bookings")
                  .eq("id", booking.slot_id)
                  .single()
                  .then(({ data: slot }) => {
                    if (slot) {
                      db.from("cleaning_available_slots")
                        .update({ current_bookings: Math.max(0, slot.current_bookings - 1) })
                        .eq("id", booking.slot_id);
                    }
                  });
              });
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
        cleaning_custom_plans (*),
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

    // ── CLEANING_CUSTOM_PLANS ──
    if (this.table === "cleaning_custom_plans") {
      let q = db.from("cleaning_custom_plans").select(`*, cleaning_clients (*)`);
      q = applyDbFilters(q, this.filters);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }

    // ── CLEANING_RECURRING_SCHEDULES ──
    if (this.table === "cleaning_recurring_schedules") {
      let q = db
        .from("cleaning_recurring_schedules")
        .select(`*, cleaning_clients (*), cleaning_custom_plans (*)`);
      q = applyDbFilters(q, this.filters);
      q = q.order("created_at", { ascending: false });
      const { data, error } = await q;
      return { data: data ?? [], error: error ?? null };
    }

    // ── CLEANING_CHECKLIST_TEMPLATES ──
    if (this.table === "cleaning_checklist_templates") {
      let q = db.from("cleaning_checklist_templates").select("*");
      q = applyDbFilters(q, this.filters);
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
    // Fire-and-forget calendar sync via backend
    api(`/admin/cleaning/bookings/${bookingId}/sync-calendar`, { method: "POST" }).catch(() => {});
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
        const slots: any[] = allSlots || [];

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

        // Auto-sync all created bookings to Google Calendar
        api("/admin/cleaning/bookings/sync-calendar", { method: "POST" }).catch(() => {});

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

    if (name === "create_custom_cleaning_plan") {
      return (async () => {
        const payload = params || {};
        const now = new Date().toISOString();

        // Load existing clients
        const { data: existingClients } = await db.from("cleaning_clients").select("*");
        const clients: any[] = existingClients || [];

        const requestedClient = payload.existing_client_id
          ? clients.find((c: any) => c.id === payload.existing_client_id)
          : null;
        const duplicateClient = requestedClient ? null : findDuplicateCleaningClient(clients, payload);
        const reusedClient = requestedClient || duplicateClient || null;

        const clientId = reusedClient?.id ?? `cleaning-client-${Date.now()}`;
        const planId     = `cleaning-custom-plan-${Date.now()}`;
        const scheduleId = `cleaning-recurring-schedule-${Date.now()}`;

        let client = reusedClient;
        if (!reusedClient) {
          const clientRow = {
            id: clientId,
            company_name: payload.company_name,
            contact_person: payload.contact_person ?? null,
            email: payload.email ?? null,
            phone: payload.phone ?? null,
            location: payload.location,
            service_type: payload.service_type ?? null,
            notes: payload.notes ?? null,
            internal_admin_notes: payload.internal_admin_notes ?? null,
            start_date: payload.start_date,
            status: payload.status ?? "active",
            client_type: "custom_cleaning_client",
            visibility: "admin_only",
            is_private: true,
          };
          const { data: insertedClient } = await db
            .from("cleaning_clients")
            .insert(clientRow)
            .select()
            .single();
          client = insertedClient ?? clientRow;
        }

        const plan = {
          id: planId,
          client_id: clientId,
          plan_name: payload.plan_name,
          custom_price_cents: Number(payload.custom_price_cents ?? 0),
          monthly_price_cents: Number(payload.monthly_price_cents ?? payload.custom_price_cents ?? payload.estimated_monthly_total_cents ?? 0),
          price_per_cleaning_cents: payload.price_per_cleaning_cents ?? null,
          frequency_unit: payload.frequency_unit ?? "custom",
          frequency_count: payload.frequency_count ?? null,
          custom_frequency_label: payload.custom_frequency_label ?? payload.service_frequency ?? "Custom schedule",
          pricing_mode: payload.pricing_mode ?? "custom_manual",
          billing_type: payload.billing_type ?? "custom",
          monthly_invoice: Boolean(payload.monthly_invoice),
          payment_timing: payload.payment_timing ?? "custom_terms",
          custom_terms: payload.custom_terms ?? null,
          service_frequency: payload.service_frequency ?? null,
          days_of_week: payload.days_of_week ?? [],
          deep_cleaning_add_on: Boolean(payload.deep_cleaning_add_on),
          estimated_monthly_total_cents: Number(payload.estimated_monthly_total_cents ?? 0),
          custom_checklist: payload.custom_checklist ?? [],
          status: payload.status ?? "active",
          is_private: true,
          visibility: "admin_only",
          client_type: "custom_cleaning_client",
        };
        await db.from("cleaning_custom_plans").insert(plan);

        const schedule = {
          id: scheduleId,
          client_id: clientId,
          custom_plan_id: planId,
          start_date: payload.start_date,
          end_date: payload.end_date || null,
          days_of_week: payload.days_of_week ?? [],
          preferred_start_time: payload.preferred_start_time,
          preferred_end_time: payload.preferred_end_time,
          assigned_cleaner: payload.assigned_cleaner ?? null,
          location: payload.location,
          service_duration_minutes: Number(payload.service_duration_minutes ?? 120),
          repeat_frequency: payload.repeat_frequency ?? "weekly",
          status: "active",
        };
        await db.from("cleaning_recurring_schedules").insert(schedule);

        const templates = [
          {
            id: `cleaning-checklist-template-daily-${Date.now()}`,
            client_id: clientId,
            custom_plan_id: planId,
            template_type: "daily_upkeep",
            name: "Daily upkeep checklist",
            items: payload.daily_checklist ?? [],
            is_active: true,
          },
          {
            id: `cleaning-checklist-template-deep-${Date.now() + 1}`,
            client_id: clientId,
            custom_plan_id: planId,
            template_type: "deep_cleaning",
            name: "Deep cleaning checklist",
            items: payload.deep_cleaning_checklist ?? [],
            is_active: true,
          },
        ];
        await db.from("cleaning_checklist_templates").insert(templates);

        // Generate bookings for recurring dates
        const weekdays = normalizeWeekdays(payload.days_of_week ?? []);
        const startDate   = new Date(`${payload.start_date}T00:00:00`);
        const hardEndDate = payload.end_date
          ? new Date(`${payload.end_date}T00:00:00`)
          : addMonths(startDate, 2);

        const generatedBookings: any[] = [];
        const conflicts: string[] = [];

        // Fetch existing active bookings to check conflicts
        const { data: existingActiveBookings } = await db
          .from("cleaning_bookings")
          .select("slot_id, status")
          .eq("status", "booked");
        const bookedSlotIds = new Set((existingActiveBookings || []).map((b: any) => b.slot_id));

        for (let date = new Date(startDate); date <= hardEndDate; date = addDays(date, 1)) {
          if (!weekdays.includes(date.getDay())) continue;
          const dateKey = formatDate(date);
          const slot = await ensureCleaningSlot(
            dateKey,
            payload.preferred_start_time,
            payload.preferred_end_time,
          );

          const alreadyBooked =
            bookedSlotIds.has(slot.id) ||
            generatedBookings.some((b) => b.slot_id === slot.id) ||
            slot.current_bookings >= slot.max_bookings;

          if (alreadyBooked) {
            conflicts.push(dateKey);
            continue;
          }

          generatedBookings.push({
            slot_id: slot.id,
            user_id: "admin-custom-cleaning",
            client_id: clientId,
            custom_plan_id: planId,
            recurring_schedule_id: scheduleId,
            status: "booked",
            notes: payload.notes ?? null,
            location: payload.location,
            assigned_cleaner: payload.assigned_cleaner ?? null,
            service_duration_minutes: Number(payload.service_duration_minutes ?? 120),
            checklist_template_id: templates[0].id,
            is_private: true,
            visibility: "admin_only",
            client_type: "custom_cleaning_client",
            google_calendar_sync_status: "pending",
          });
          bookedSlotIds.add(slot.id);

          // Increment the slot counter
          await db
            .from("cleaning_available_slots")
            .update({ current_bookings: (slot.current_bookings || 0) + 1, updated_at: now })
            .eq("id", slot.id);
        }

        if (generatedBookings.length > 0) {
          await db.from("cleaning_bookings").insert(generatedBookings);
        }

        return {
          data: [{
            client,
            plan,
            schedule,
            bookings_created: generatedBookings.length,
            conflicts,
            reused_client: Boolean(reusedClient),
          }],
          error: null,
        };
      })();
    }

    if (name === "cancel_cleaning_booking") {
      return (async () => {
        const bookingId = params?.p_booking_id;
        const { data: booking, error: findError } = await db
          .from("cleaning_bookings")
          .select("*")
          .eq("id", bookingId)
          .single();

        if (findError || !booking) {
          return { data: null, error: new Error("Booking not found") };
        }
        if (booking.status === "completed") {
          return { data: null, error: new Error("Completed bookings cannot be cancelled") };
        }

        const now = new Date().toISOString();
        await db
          .from("cleaning_bookings")
          .update({ status: "cancelled", updated_at: now })
          .eq("id", bookingId);

        if (booking.slot_id) {
          const { data: slot } = await db
            .from("cleaning_available_slots")
            .select("current_bookings")
            .eq("id", booking.slot_id)
            .single();
          if (slot) {
            await db
              .from("cleaning_available_slots")
              .update({
                current_bookings: Math.max(0, (slot.current_bookings || 0) - 1),
                updated_at: now,
              })
              .eq("id", booking.slot_id);
          }
        }

        const subId = booking.cleaning_subscription_id || booking.subscription_id;
        if (subId) {
          const { data: sub } = await db
            .from("cleaning_subscriptions")
            .select("cleanings_remaining")
            .eq("id", subId)
            .single();
          if (sub) {
            await db
              .from("cleaning_subscriptions")
              .update({
                cleanings_remaining: (sub.cleanings_remaining || 0) + 1,
                updated_at: now,
              })
              .eq("id", subId);
          }
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

    return Promise.resolve({ data: [], error: null });
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
