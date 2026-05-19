// Compatibility adapter while the frontend is migrated off Supabase.
// Existing screens keep their query shape, but data now comes from the owned API.

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8082";
const SESSION_KEY = "prospera_owned_session";
const FAVORITES_KEY = "prospera_owned_favorites";
const CLEANING_SUBSCRIPTIONS_KEY = "prospera_owned_cleaning_subscriptions";
const CLEANING_SLOTS_KEY = "prospera_owned_cleaning_slots";
const CLEANING_BOOKINGS_KEY = "prospera_owned_cleaning_bookings";
const CLEANING_CLIENTS_KEY = "prospera_owned_cleaning_clients";
const CLEANING_CUSTOM_PLANS_KEY = "prospera_owned_cleaning_custom_plans";
const CLEANING_RECURRING_SCHEDULES_KEY = "prospera_owned_cleaning_recurring_schedules";
const CLEANING_CHECKLIST_TEMPLATES_KEY = "prospera_owned_cleaning_checklist_templates";
const CLEANING_COMPLETION_REPORTS_KEY = "prospera_owned_cleaning_completion_reports";

type Filter = { field: string; op: "eq" | "neq" | "lte" | "gte" | "gt" | "in"; value: any };
type AuthStateChangeCallback = (event: "SIGNED_IN" | "SIGNED_OUT", session: any) => void;

const authStateListeners = new Set<AuthStateChangeCallback>();

const toSnakeRestaurant = (restaurant: any) => ({
  id: restaurant.id,
  name: restaurant.name,
  description: restaurant.description,
  address: restaurant.address,
  logo_url: restaurant.logoUrl ?? restaurant.logo_url ?? null,
  is_active: restaurant.isActive ?? restaurant.is_active ?? true,
  subscription_plans: (restaurant.subscriptionPlans ?? restaurant.subscription_plans ?? []).map((plan: any) => ({
    id: plan.id,
    is_active: plan.isActive ?? plan.is_active ?? true,
    menu_category: String(plan.menuCategory ?? plan.menu_category ?? "standard").toLowerCase(),
  })),
});

const toSnakePlan = (plan: any) => ({
  id: plan.id,
  restaurant_id: plan.restaurantId ?? plan.restaurant_id,
  name: plan.name,
  description: plan.description,
  price_per_week_sats: plan.pricePerWeekCents ?? plan.price_per_week_sats,
  meal_time: plan.mealTime ?? plan.meal_time,
  menu_category: String(plan.menuCategory ?? plan.menu_category ?? "standard").toLowerCase(),
  supports_delivery: plan.supportsDelivery ?? plan.supports_delivery ?? true,
  is_active: plan.isActive ?? plan.is_active ?? true,
  max_duration_weeks: plan.maxDurationWeeks ?? plan.max_duration_weeks ?? 1,
  restaurants: plan.restaurant
    ? {
        id: plan.restaurant.id,
        name: plan.restaurant.name,
        logo_url: plan.restaurant.logoUrl ?? plan.restaurant.logo_url ?? null,
        address: plan.restaurant.address ?? "Prospera Village",
      }
    : undefined,
});

const toSnakeCleaningPackage = (pkg: any) => ({
  id: pkg.id,
  name: pkg.name,
  description: pkg.description,
  price_per_cleaning_cents: pkg.pricePerCleaningCents ?? pkg.price_per_cleaning_cents,
  cleanings_per_month: pkg.cleaningsPerMonth ?? pkg.cleanings_per_month,
  is_active: pkg.isActive ?? pkg.is_active ?? true,
});

const toSnakeUser = (user: any) => ({
  id: user.id,
  email: user.email ?? null,
  name: user.name ?? null,
  display_name: user.displayName ?? user.display_name ?? user.name ?? null,
  auth_provider: user.authProvider ?? user.auth_provider ?? "EMAIL",
  avatar_url: user.avatarUrl ?? user.avatar_url ?? null,
  roles: user.roles ?? [],
  created_at: user.createdAt ?? user.created_at ?? null,
  last_login_at: user.lastLoginAt ?? user.last_login_at ?? null,
});

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return { data: null, error: new Error(data?.message || "API request failed") };
  }

  return { data, error: null };
}

function getStoredSession() {
  const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    localStorage.removeItem(SESSION_KEY);
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function storeSession(payload: any) {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function ownedUserFromSession() {
  return getStoredSession()?.user ?? null;
}

function notifyAuthStateChange(event: "SIGNED_IN" | "SIGNED_OUT", session: any) {
  authStateListeners.forEach((callback) => {
    setTimeout(() => callback(event, session), 0);
  });
}

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(favorites: any[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

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

function getOwnedUserDetails() {
  const user = ownedUserFromSession();
  return {
    id: user?.id ?? "owned-user-frorex",
    email: user?.email ?? "user@example.com",
    name: user?.name ?? user?.displayName ?? user?.display_name ?? "Frorex Studio",
    display_name: user?.displayName ?? user?.display_name ?? user?.name ?? "Frorex Studio",
  };
}

const compareFilterValues = (left: any, right: any) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(left).localeCompare(String(right));
};

function getSeedCleaningSubscription() {
  const startDate = new Date();
  return {
    id: "owned-cleaning-subscription-frorex-1-bedroom-studio",
    user_id: "owned-user-frorex",
    package_id: "cleaning-1-bedroom-studio",
    start_date: formatDate(startDate),
    end_date: formatDate(addDays(startDate, 30)),
    cleanings_remaining: 4,
    payment_status: "paid",
    payment_method: "admin",
    payment_reference: "admin-created",
    is_active: true,
    created_at: startDate.toISOString(),
    updated_at: startDate.toISOString(),
    cleaning_packages: {
      name: "1 Bedroom & Studio",
      cleanings_per_month: 4,
    },
  };
}

function getCleaningSubscriptions() {
  let subscriptions: any[] = [];
  try {
    subscriptions = JSON.parse(localStorage.getItem(CLEANING_SUBSCRIPTIONS_KEY) || "[]");
  } catch {
    subscriptions = [];
  }

  const hasFrorexSeed = subscriptions.some((subscription) => subscription.id === "owned-cleaning-subscription-frorex-1-bedroom-studio");
  if (!hasFrorexSeed) {
    subscriptions = [getSeedCleaningSubscription(), ...subscriptions];
    localStorage.setItem(CLEANING_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
  }

  return subscriptions;
}

function saveCleaningSubscriptions(subscriptions: any[]) {
  localStorage.setItem(CLEANING_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
}

function getSeedCleaningSlots() {
  const times = [
    ["08:00:00", "10:00:00"],
    ["10:00:00", "12:00:00"],
    ["13:00:00", "15:00:00"],
    ["15:00:00", "16:00:00"],
  ];
  const slots: any[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 0; offset < 35; offset += 1) {
    const date = addDays(today, offset);
    if (date.getDay() === 0) continue;

    const dateKey = formatDate(date);
    for (const [startTime, endTime] of times) {
      slots.push({
        id: `owned-cleaning-slot-${dateKey}-${startTime.slice(0, 5).replace(":", "")}`,
        date: dateKey,
        start_time: startTime,
        end_time: endTime,
        max_bookings: 1,
        current_bookings: 0,
        is_active: true,
        created_at: today.toISOString(),
      });
    }
  }

  return slots;
}

function getCleaningSlots() {
  let slots: any[] = [];
  try {
    slots = JSON.parse(localStorage.getItem(CLEANING_SLOTS_KEY) || "[]");
  } catch {
    slots = [];
  }

  const seededSlots = getSeedCleaningSlots();
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  let changed = false;

  for (const seedSlot of seededSlots) {
    if (!slotsById.has(seedSlot.id)) {
      slotsById.set(seedSlot.id, seedSlot);
      changed = true;
    }
  }

  const nextSlots = [...slotsById.values()].map((slot) => {
    if (slot.max_bookings === 1) return slot;
    changed = true;
    return { ...slot, max_bookings: 1 };
  });
  if (changed || slots.length === 0) {
    saveCleaningSlots(nextSlots);
  }

  return nextSlots;
}

function saveCleaningSlots(slots: any[]) {
  localStorage.setItem(CLEANING_SLOTS_KEY, JSON.stringify(slots));
}

function getCleaningBookings() {
  try {
    return JSON.parse(localStorage.getItem(CLEANING_BOOKINGS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCleaningBookings(bookings: any[]) {
  localStorage.setItem(CLEANING_BOOKINGS_KEY, JSON.stringify(bookings));
}

function getStoredRows(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function saveStoredRows(key: string, rows: any[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function getCleaningClients() {
  return getStoredRows(CLEANING_CLIENTS_KEY);
}

function saveCleaningClients(rows: any[]) {
  saveStoredRows(CLEANING_CLIENTS_KEY, rows);
}

function getCleaningCustomPlans() {
  return getStoredRows(CLEANING_CUSTOM_PLANS_KEY);
}

function saveCleaningCustomPlans(rows: any[]) {
  saveStoredRows(CLEANING_CUSTOM_PLANS_KEY, rows);
}

function getCleaningRecurringSchedules() {
  return getStoredRows(CLEANING_RECURRING_SCHEDULES_KEY);
}

function saveCleaningRecurringSchedules(rows: any[]) {
  saveStoredRows(CLEANING_RECURRING_SCHEDULES_KEY, rows);
}

function getCleaningChecklistTemplates() {
  return getStoredRows(CLEANING_CHECKLIST_TEMPLATES_KEY);
}

function saveCleaningChecklistTemplates(rows: any[]) {
  saveStoredRows(CLEANING_CHECKLIST_TEMPLATES_KEY, rows);
}

function getCleaningCompletionReports() {
  return getStoredRows(CLEANING_COMPLETION_REPORTS_KEY);
}

function saveCleaningCompletionReports(rows: any[]) {
  saveStoredRows(CLEANING_COMPLETION_REPORTS_KEY, rows);
}

function withCleaningRelations(booking: any) {
  const slot = getCleaningSlots().find((candidate) => candidate.id === booking.slot_id);
  const client = booking.client_id
    ? getCleaningClients().find((candidate) => candidate.id === booking.client_id)
    : null;
  const customPlan = booking.custom_plan_id
    ? getCleaningCustomPlans().find((candidate) => candidate.id === booking.custom_plan_id)
    : null;
  const report = getCleaningCompletionReports().find((candidate) => candidate.booking_id === booking.id);
  return {
    ...booking,
    cleaning_available_slots: slot
      ? {
          id: slot.id,
          date: slot.date,
          start_time: slot.start_time,
          end_time: slot.end_time,
        }
      : null,
    users: getOwnedUserDetails(),
    cleaning_clients: client ?? null,
    cleaning_custom_plans: customPlan ?? null,
    cleaning_completion_reports: report ?? null,
  };
}

const normalizeWeekdays = (days: any[] = []) =>
  days
    .map((day) => {
      if (typeof day === "number") return day;
      const upper = String(day).trim().toUpperCase();
      return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].indexOf(upper);
    })
    .filter((day) => day >= 0 && day <= 6);

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

function ensureCleaningSlot(slots: any[], date: string, startTime: string, endTime: string) {
  const normalizedStart = startTime.length === 5 ? `${startTime}:00` : startTime;
  const normalizedEnd = endTime.length === 5 ? `${endTime}:00` : endTime;
  const existing = slots.find(
    (slot) => slot.date === date && slot.start_time === normalizedStart && slot.end_time === normalizedEnd
  );
  if (existing) return { slot: existing, slots };

  const now = new Date().toISOString();
  const slot = {
    id: `owned-cleaning-slot-${date}-${normalizedStart.slice(0, 5).replace(":", "")}`,
    date,
    start_time: normalizedStart,
    end_time: normalizedEnd,
    max_bookings: 1,
    current_bookings: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  return { slot, slots: [...slots, slot] };
}

class OwnedQueryBuilder {
  private filters: Filter[] = [];
  private selected = "*";
  private take: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private orderField: string | null = null;

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
    return Promise.resolve(this.mutate("insert", values));
  }

  upsert(values: any) {
    return Promise.resolve(this.mutate("upsert", values));
  }

  update(values: any) {
    return {
      eq: (field: string, value: any) => {
        this.filters.push({ field, op: "eq", value });
        return Promise.resolve(this.mutate("update", values));
      },
    };
  }

  delete() {
    return {
      eq: (field: string, value: any) => {
        this.filters.push({ field, op: "eq", value });
        return Promise.resolve(this.mutate("delete", null));
      },
    };
  }

  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
  }

  private mutate(action: string, values: any) {
    if (this.table === "favorites") {
      const favorites = getFavorites();

      if (action === "delete") {
        const id = this.filters.find((filter) => filter.field === "id")?.value;
        saveFavorites(favorites.filter((favorite: any) => favorite.id !== id));
        return { data: null, error: null };
      }

      if (action === "insert") {
        const input = Array.isArray(values) ? values[0] : values;
        const existing = favorites.find((favorite: any) =>
          favorite.user_id === input.user_id &&
          ((input.restaurant_id && favorite.restaurant_id === input.restaurant_id) ||
            (input.plan_id && favorite.plan_id === input.plan_id))
        );

        if (existing) {
          return { data: existing, error: null };
        }

        const next = {
          id: `favorite-${Date.now()}`,
          ...input,
        };
        saveFavorites([...favorites, next]);
        return { data: next, error: null };
      }
    }

    if (this.table === "cleaning_subscriptions") {
      const subscriptions = getCleaningSubscriptions();

      if (action === "insert") {
        const input = Array.isArray(values) ? values[0] : values;
        const now = new Date().toISOString();
        const next = {
          id: `owned-cleaning-subscription-${Date.now()}`,
          created_at: now,
          updated_at: now,
          ...input,
          cleaning_packages: input.package_id === "cleaning-1-bedroom-studio"
            ? { name: "1 Bedroom & Studio", cleanings_per_month: 4 }
            : { name: "2 Bedroom", cleanings_per_month: 4 },
        };
        saveCleaningSubscriptions([next, ...subscriptions]);
        return { data: next, error: null };
      }

      if (action === "update") {
        const id = this.filters.find((filter) => filter.field === "id")?.value;
        const nextSubscriptions = subscriptions.map((subscription) =>
          subscription.id === id
            ? { ...subscription, ...values, updated_at: new Date().toISOString() }
            : subscription
        );
        saveCleaningSubscriptions(nextSubscriptions);
        return {
          data: nextSubscriptions.find((subscription) => subscription.id === id) ?? null,
          error: null,
        };
      }
    }

    if (
      [
        "cleaning_clients",
        "cleaning_custom_plans",
        "cleaning_recurring_schedules",
        "cleaning_checklist_templates",
        "cleaning_completion_reports",
      ].includes(this.table)
    ) {
      const keyByTable: Record<string, string> = {
        cleaning_clients: CLEANING_CLIENTS_KEY,
        cleaning_custom_plans: CLEANING_CUSTOM_PLANS_KEY,
        cleaning_recurring_schedules: CLEANING_RECURRING_SCHEDULES_KEY,
        cleaning_checklist_templates: CLEANING_CHECKLIST_TEMPLATES_KEY,
        cleaning_completion_reports: CLEANING_COMPLETION_REPORTS_KEY,
      };
      const key = keyByTable[this.table];
      const rows = getStoredRows(key);

      if (action === "insert" || action === "upsert") {
        const inputRows = Array.isArray(values) ? values : [values];
        const now = new Date().toISOString();
        const nextRows = inputRows.map((input) => ({
          id: input.id ?? `${this.table.slice(0, -1)}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          created_at: now,
          updated_at: now,
          ...input,
        }));
        saveStoredRows(key, [...nextRows, ...rows]);
        return { data: Array.isArray(values) ? nextRows : nextRows[0], error: null };
      }

      if (action === "update") {
        const id = this.filters.find((filter) => filter.field === "id")?.value;
        const nextRows = rows.map((row) =>
          row.id === id ? { ...row, ...values, updated_at: new Date().toISOString() } : row
        );
        saveStoredRows(key, nextRows);
        return { data: nextRows.find((row) => row.id === id) ?? null, error: null };
      }

      if (action === "delete") {
        const id = this.filters.find((filter) => filter.field === "id")?.value;
        if (this.table === "cleaning_clients") {
          const clientBookings = getCleaningBookings().filter((booking) => booking.client_id === id);
          if (clientBookings.length) {
            const bookedSlotIds = new Set(
              clientBookings
                .filter((booking) => booking.status === "booked")
                .map((booking) => booking.slot_id)
            );
            saveCleaningSlots(getCleaningSlots().map((slot) =>
              bookedSlotIds.has(slot.id)
                ? { ...slot, current_bookings: Math.max(0, Number(slot.current_bookings ?? 0) - 1) }
                : slot
            ));
          }

          const planIds = new Set(getCleaningCustomPlans().filter((plan) => plan.client_id === id).map((plan) => plan.id));
          saveCleaningCustomPlans(getCleaningCustomPlans().filter((plan) => plan.client_id !== id));
          saveCleaningRecurringSchedules(getCleaningRecurringSchedules().filter((schedule) => schedule.client_id !== id));
          saveCleaningChecklistTemplates(getCleaningChecklistTemplates().filter((template) => template.client_id !== id));
          saveCleaningCompletionReports(getCleaningCompletionReports().filter((report) => report.client_id !== id && !planIds.has(report.custom_plan_id)));
          saveCleaningBookings(getCleaningBookings().filter((booking) => booking.client_id !== id));
        }
        saveStoredRows(key, rows.filter((row) => row.id !== id));
        return { data: null, error: null };
      }
    }

    if (this.table === "cleaning_bookings") {
      const bookings = getCleaningBookings();

      if (action === "insert") {
        const input = Array.isArray(values) ? values[0] : values;
        const now = new Date().toISOString();
        const next = {
          id: `owned-cleaning-booking-${Date.now()}`,
          created_at: now,
          updated_at: now,
          ...input,
        };
        saveCleaningBookings([next, ...bookings]);
        return { data: next, error: null };
      }

      if (action === "update") {
        const id = this.filters.find((filter) => filter.field === "id")?.value;
        const nextBookings = bookings.map((booking) =>
          booking.id === id ? { ...booking, ...values, updated_at: new Date().toISOString() } : booking
        );
        saveCleaningBookings(nextBookings);
        return { data: nextBookings.find((booking) => booking.id === id) ?? null, error: null };
      }
    }

    return { data: values ?? null, error: null };
  }

  private async execute() {
    const { data, error, count } = await this.loadTable();
    if (error) return { data: null, error, count };

    let rows = Array.isArray(data) ? data : data ? [data] : [];
    rows = this.applyFilters(rows);

    if (this.orderField) {
      rows = [...rows].sort((a, b) => String(a[this.orderField!]).localeCompare(String(b[this.orderField!])));
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

  private applyFilters(rows: any[]) {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        const value = row[filter.field];
        if (filter.op === "eq") return value === filter.value;
        if (filter.op === "neq") return value !== filter.value;
        if (filter.op === "lte") return compareFilterValues(value, filter.value) <= 0;
        if (filter.op === "gte") return compareFilterValues(value, filter.value) >= 0;
        if (filter.op === "gt") return compareFilterValues(value, filter.value) > 0;
        if (filter.op === "in") return filter.value.includes(value);
        return true;
      })
    );
  }

  private async loadTable() {
    if (this.table === "restaurants") {
      const [restaurantsResult, plansResult] = await Promise.all([api("/restaurants"), api("/plans")]);

      if (restaurantsResult.error) {
        return { ...restaurantsResult, data: [] };
      }

      const plansByRestaurant = new Map<string, any[]>();
      for (const plan of plansResult.data || []) {
        const restaurantId = plan.restaurantId ?? plan.restaurant_id;
        plansByRestaurant.set(restaurantId, [...(plansByRestaurant.get(restaurantId) || []), plan]);
      }

      return {
        ...restaurantsResult,
        data: (restaurantsResult.data || []).map((restaurant: any) =>
          toSnakeRestaurant({
            ...restaurant,
            subscriptionPlans: plansByRestaurant.get(restaurant.id) || [],
          })
        ),
      };
    }

    if (this.table === "subscription_plans") {
      const result = await api("/plans");
      return { ...result, data: (result.data || []).map(toSnakePlan) };
    }

    if (this.table === "cleaning_packages") {
      const result = await api("/cleaning/packages");
      return { ...result, data: (result.data || []).map(toSnakeCleaningPackage) };
    }

    if (this.table === "cleaning_subscriptions") {
      const user = getOwnedUserDetails();
      return {
        data: getCleaningSubscriptions().map((subscription) => ({
          ...subscription,
          users: user,
        })),
        error: null,
        count: getCleaningSubscriptions().length,
      };
    }

    if (this.table === "cleaning_available_slots") {
      const slots = getCleaningSlots();
      return { data: slots, error: null, count: slots.length };
    }

    if (this.table === "cleaning_bookings") {
      const bookings = getCleaningBookings().map(withCleaningRelations);
      return { data: bookings, error: null, count: bookings.length };
    }

    if (this.table === "cleaning_clients") {
      const clients = getCleaningClients();
      return { data: clients, error: null, count: clients.length };
    }

    if (this.table === "cleaning_custom_plans") {
      const plans = getCleaningCustomPlans().map((plan: any) => ({
        ...plan,
        cleaning_clients: getCleaningClients().find((client: any) => client.id === plan.client_id) ?? null,
      }));
      return { data: plans, error: null, count: plans.length };
    }

    if (this.table === "cleaning_recurring_schedules") {
      const schedules = getCleaningRecurringSchedules().map((schedule: any) => ({
        ...schedule,
        cleaning_clients: getCleaningClients().find((client: any) => client.id === schedule.client_id) ?? null,
        cleaning_custom_plans: getCleaningCustomPlans().find((plan: any) => plan.id === schedule.custom_plan_id) ?? null,
      }));
      return { data: schedules, error: null, count: schedules.length };
    }

    if (this.table === "cleaning_checklist_templates") {
      const templates = getCleaningChecklistTemplates();
      return { data: templates, error: null, count: templates.length };
    }

    if (this.table === "cleaning_completion_reports") {
      const reports = getCleaningCompletionReports().map((report: any) => ({
        ...report,
        cleaning_bookings: withCleaningRelations(
          getCleaningBookings().find((booking: any) => booking.id === report.booking_id) ?? {}
        ),
      }));
      return { data: reports, error: null, count: reports.length };
    }

    if (this.table === "users") {
      const result = await api("/admin/users");
      if (!result.error) {
        return { ...result, data: (result.data || []).map(toSnakeUser), count: result.data?.length ?? 0 };
      }

      const user = ownedUserFromSession() || (await api("/auth/me")).data?.user;
      return { data: user ? [toSnakeUser(user)] : [], error: null, count: user ? 1 : 0 };
    }

    if (this.table === "user_roles") {
      const roles = getStoredSession()?.roles || ["super_admin", "user"];
      const userId = ownedUserFromSession()?.id ?? "owned-user-frorex";
      return {
        data: roles.map((role: string) => ({ user_id: userId, role })),
        error: null,
        count: roles.length
      };
    }

    if (this.table === "favorites") {
      return { data: getFavorites(), error: null, count: getFavorites().length };
    }

    if (this.table === "global_settings") {
      return { data: [{ id: "owned-global-settings", cutoff_hour: 18 }], error: null, count: 1 };
    }

    if (this.table === "user_profiles") {
      const user = ownedUserFromSession();
      return {
        data: user
          ? [{ id: "owned-profile", user_id: user.id, default_delivery_address: { address: "Prospera Village" } }]
          : [],
        error: null,
        count: user ? 1 : 0,
      };
    }

    return { data: [], error: null, count: 0 };
  }
}

export const supabase = {
  auth: {
    onAuthStateChange(callback: AuthStateChangeCallback) {
      authStateListeners.add(callback);
      setTimeout(() => {
        const session = getStoredSession();
        callback(session ? "SIGNED_IN" : "SIGNED_OUT", session);
      }, 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authStateListeners.delete(callback);
            },
          },
        },
      };
    },
    async getSession() {
      return { data: { session: getStoredSession() }, error: null };
    },
    async getUser() {
      return { data: { user: ownedUserFromSession() }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (result.error) return { data: null, error: result.error };

      const session = {
        ...result.data.session,
        user: result.data.user,
        roles: result.data.roles,
      };
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
    async signInWithOAuth() {
      return { error: new Error("Google login is not connected to the owned API yet.") };
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
    async updateUser() {
      return { data: { user: ownedUserFromSession() }, error: null };
    },
    async signOut() {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      notifyAuthStateChange("SIGNED_OUT", null);
      return { error: null };
    },
  },
  from(table: string) {
    return new OwnedQueryBuilder(table);
  },
  rpc(name: string, params?: any) {
    if (name === "get_user_profile") {
      const user = ownedUserFromSession();
      return Promise.resolve({ data: user ? [{ ...user }] : [], error: null });
    }

    if (name === "create_subscription_by_pubkey") {
      return Promise.resolve({
        data: [{ id: `owned-subscription-${Date.now()}`, ...(params || {}) }],
        error: null,
      });
    }

    if (name === "book_cleaning_slot") {
      const subscriptionId = params?.p_subscription_id;
      const slotId = params?.p_slot_id;
      const notes = params?.p_notes ?? null;

      const subscriptions = getCleaningSubscriptions();
      const slots = getCleaningSlots();
      const bookings = getCleaningBookings();
      const subscription = subscriptions.find((candidate) => candidate.id === subscriptionId);
      const slot = slots.find((candidate) => candidate.id === slotId);

      if (!subscription || !subscription.is_active || subscription.cleanings_remaining <= 0) {
        return Promise.resolve({ data: null, error: new Error("No active cleaning subscription available") });
      }

      if (!slot || !slot.is_active) {
        return Promise.resolve({ data: null, error: new Error("This cleaning slot is no longer available") });
      }

      if (slot.current_bookings >= slot.max_bookings) {
        return Promise.resolve({ data: null, error: new Error("This cleaning slot is full") });
      }

      const slotDate = new Date(`${slot.date}T00:00:00`);
      if (slotDate.getDay() === 0) {
        return Promise.resolve({ data: null, error: new Error("Cleaning is available Monday through Saturday") });
      }

      const dayBookingCount = bookings.filter((booking) => {
        const bookingSlot = slots.find((candidate) => candidate.id === booking.slot_id);
        return booking.status === "booked" && bookingSlot?.date === slot.date;
      }).length;

      if (dayBookingCount >= 3) {
        return Promise.resolve({ data: null, error: new Error("This day is fully booked") });
      }

      const weekStart = new Date(slotDate);
      const day = weekStart.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      weekStart.setDate(weekStart.getDate() + diffToMonday);
      const weekEnd = addDays(weekStart, 6);
      const hasWeeklyBooking = bookings.some((booking) => {
        if (booking.status !== "booked" || booking.cleaning_subscription_id !== subscriptionId) return false;
        const bookingSlot = slots.find((candidate) => candidate.id === booking.slot_id);
        if (!bookingSlot) return false;
        const bookingDate = new Date(`${bookingSlot.date}T00:00:00`);
        return bookingDate >= weekStart && bookingDate <= weekEnd;
      });

      if (hasWeeklyBooking) {
        return Promise.resolve({ data: null, error: new Error("You already have a cleaning booked for this week") });
      }

      const now = new Date().toISOString();
      const booking = {
        id: `owned-cleaning-booking-${Date.now()}`,
        cleaning_subscription_id: subscriptionId,
        slot_id: slotId,
        user_id: subscription.user_id ?? getOwnedUserDetails().id,
        status: "booked",
        notes,
        created_at: now,
        updated_at: now,
      };

      saveCleaningBookings([booking, ...bookings]);
      saveCleaningSlots(slots.map((candidate) =>
        candidate.id === slotId
          ? { ...candidate, current_bookings: candidate.current_bookings + 1 }
          : candidate
      ));
      saveCleaningSubscriptions(subscriptions.map((candidate) =>
        candidate.id === subscriptionId
          ? {
              ...candidate,
              cleanings_remaining: Math.max(0, candidate.cleanings_remaining - 1),
              updated_at: now,
            }
          : candidate
      ));

      return Promise.resolve({ data: [{ id: booking.id }], error: null });
    }

    if (name === "create_custom_cleaning_plan") {
      const payload = params || {};
      const now = new Date().toISOString();
      const clientId = `cleaning-client-${Date.now()}`;
      const planId = `cleaning-custom-plan-${Date.now()}`;
      const scheduleId = `cleaning-recurring-schedule-${Date.now()}`;

      const client = {
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
        created_at: now,
        updated_at: now,
      };

      const plan = {
        id: planId,
        client_id: clientId,
        plan_name: payload.plan_name,
        custom_price_cents: Number(payload.custom_price_cents ?? 0),
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
        created_at: now,
        updated_at: now,
      };

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
        paused_at: null,
        created_at: now,
        updated_at: now,
      };

      const templates = [
        {
          id: `cleaning-checklist-template-daily-${Date.now()}`,
          client_id: clientId,
          custom_plan_id: planId,
          template_type: "daily_upkeep",
          name: "Daily upkeep checklist",
          items: payload.daily_checklist ?? [],
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: `cleaning-checklist-template-deep-${Date.now()}`,
          client_id: clientId,
          custom_plan_id: planId,
          template_type: "deep_cleaning",
          name: "Deep cleaning checklist",
          items: payload.deep_cleaning_checklist ?? [],
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ];

      let slots = getCleaningSlots();
      const bookings = getCleaningBookings();
      const weekdays = normalizeWeekdays(payload.days_of_week ?? []);
      const startDate = new Date(`${payload.start_date}T00:00:00`);
      const hardEndDate = payload.end_date
        ? new Date(`${payload.end_date}T00:00:00`)
        : addMonths(startDate, 2);
      const generatedBookings: any[] = [];
      const conflicts: string[] = [];

      for (let date = new Date(startDate); date <= hardEndDate; date = addDays(date, 1)) {
        if (!weekdays.includes(date.getDay())) continue;
        const dateKey = formatDate(date);
        const result = ensureCleaningSlot(slots, dateKey, payload.preferred_start_time, payload.preferred_end_time);
        slots = result.slots;

        const existingBooking = [...bookings, ...generatedBookings].find(
          (booking) => booking.slot_id === result.slot.id && booking.status === "booked"
        );
        if (existingBooking || result.slot.current_bookings >= result.slot.max_bookings) {
          conflicts.push(dateKey);
          continue;
        }

        generatedBookings.push({
          id: `owned-custom-cleaning-booking-${dateKey}-${Date.now()}-${generatedBookings.length}`,
          cleaning_subscription_id: null,
          subscription_id: null,
          slot_id: result.slot.id,
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
          created_at: now,
          updated_at: now,
        });
        result.slot.current_bookings += 1;
      }

      saveCleaningClients([client, ...getCleaningClients()]);
      saveCleaningCustomPlans([plan, ...getCleaningCustomPlans()]);
      saveCleaningRecurringSchedules([schedule, ...getCleaningRecurringSchedules()]);
      saveCleaningChecklistTemplates([...templates, ...getCleaningChecklistTemplates()]);
      saveCleaningBookings([...generatedBookings, ...bookings]);
      saveCleaningSlots(slots);

      return Promise.resolve({
        data: [{ client, plan, schedule, bookings_created: generatedBookings.length, conflicts }],
        error: null,
      });
    }

    if (name === "complete_cleaning_booking") {
      const bookingId = params?.p_booking_id;
      const bookings = getCleaningBookings();
      const booking = bookings.find((candidate) => candidate.id === bookingId);
      if (!booking) {
        return Promise.resolve({ data: null, error: new Error("Cleaning booking not found") });
      }

      const now = new Date().toISOString();
      const report = {
        id: `cleaning-completion-report-${Date.now()}`,
        booking_id: bookingId,
        custom_plan_id: booking.custom_plan_id ?? null,
        client_id: booking.client_id ?? null,
        checklist_completed: params?.p_checklist_completed ?? [],
        notes: params?.p_notes ?? null,
        photo_url: params?.p_photo_url ?? null,
        issue_report: params?.p_issue_report ?? null,
        completed_by: params?.p_completed_by ?? getOwnedUserDetails().display_name,
        completed_at: now,
        created_at: now,
        updated_at: now,
      };

      saveCleaningCompletionReports([report, ...getCleaningCompletionReports()]);
      saveCleaningBookings(bookings.map((candidate) =>
        candidate.id === bookingId
          ? { ...candidate, status: "completed", updated_at: now }
          : candidate
      ));

      return Promise.resolve({ data: [{ id: report.id }], error: null });
    }

    return Promise.resolve({ data: [], error: null });
  },
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

      return { data: null, error: new Error(`Function ${name} is not implemented in the owned API adapter`) };
    },
  },
  storage: {
    from() {
      return {
        upload: async () => ({ data: null, error: new Error("Storage is not connected to the owned API yet.") }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      };
    },
  },
};
