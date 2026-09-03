import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { todayHN, addDaysISO } from "@/lib/timezone";

// Honduras-local, so these KPIs match the Finance page and do not drift for an
// admin sitting in a positive-offset timezone.
const daysFromNowISO = (days: number) => addDaysISO(todayHN(), days);
const todayISO = () => todayHN();
import { canonicalServiceKey } from "@/services/manifest";

/**
 * How many customers a business has and what is coming this week — per
 * vertical, because each keeps its bookings somewhere different.
 *
 * These four readers used to sit inside the widget that draws them, behind
 * three `if (sourceKey === …)`. A widget knowing three services by name is the
 * same obstacle as a list or a revenue function knowing them: it makes a
 * fourth expensive to add and a legacy one expensive to remove.
 */

async function fetchCleaningStats(legacyId: string) {
  // Cleaning packages under this provider (owner_provider_id points to the
  // universal `providers` row for cleaning — see per-plan booking calendar).
  const { data: pkgs } = await supabaseDb
    .from("cleaning_packages")
    .select("id")
    .eq("provider_id", legacyId);
  const packageIds = (pkgs ?? []).map((p: any) => p.id);
  if (!packageIds.length) return { active: 0, upcoming: 0 };

  // Subscription ids scoped to this provider's packages — used to bound the
  // "Upcoming 7d" bookings query. Without this scope, every cleaning owner
  // saw the platform-wide upcoming count.
  const { data: subs } = await supabaseDb
    .from("cleaning_subscriptions")
    .select("id")
    .in("package_id", packageIds);
  const subIds = (subs ?? []).map((s: any) => s.id);

  // Upcoming 7d for cleaning = booked cleaning_bookings whose slot.date lands
  // in the next 7 days AND whose subscription belongs to this provider.
  const upcomingQuery = subIds.length
    ? supabaseDb.from("cleaning_bookings")
        .select("id, cleaning_available_slots!inner(date)", { count: "exact", head: true })
        .eq("status", "booked")
        .in("subscription_id", subIds)
        .gte("cleaning_available_slots.date", todayISO())
        .lte("cleaning_available_slots.date", daysFromNowISO(7))
    : Promise.resolve({ count: 0 } as any);

  const [{ count: active }, { count: upcoming }] = await Promise.all([
    supabaseDb.from("cleaning_subscriptions")
      .select("id", { count: "exact", head: true })
      .in("package_id", packageIds)
      .eq("subscription_status", "active"),
    upcomingQuery,
  ]);
  return { active: active ?? 0, upcoming: upcoming ?? 0 };
}

async function fetchFoodStats(legacyId: string) {
  // Food column is `status` (not `subscription_status` — that's cleaning). And
  // "upcoming 7d" for food = active + paid subscriptions whose delivery window
  // overlaps the next 7 days (started_at <= today+7 AND end_date >= today).
  const today = todayISO();
  const in7 = daysFromNowISO(7);
  const [{ count: active }, { count: upcoming }] = await Promise.all([
    supabaseDb.from("food_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", legacyId)
      .eq("status", "active")
      .eq("payment_status", "paid"),
    supabaseDb.from("food_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", legacyId)
      .eq("status", "active")
      .eq("payment_status", "paid")
      .lte("started_at", in7)
      .gte("end_date", today),
  ]);
  return { active: active ?? 0, upcoming: upcoming ?? 0 };
}

async function fetchBeachStats(universalProviderId: string) {
  // Beach is platform-owned (one provider), so memberships are global. The
  // week ahead comes from the engine: the legacy court table it used to count
  // has been empty since the cutover, so this KPI has been reporting 0 on a
  // club that takes bookings every day.
  const [{ count: active }, upcoming] = await Promise.all([
    supabaseDb.from("provider_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("source_service_key", "beach")
      .eq("status", "active"),
    countEngineBookings(universalProviderId),
  ]);
  return { active: active ?? 0, upcoming };
}

/** How many times are booked on this provider's calendars in the next week. */
async function countEngineBookings(universalProviderId: string): Promise<number> {
  if (!universalProviderId) return 0;
  const { data, error } = await accountApi(
    `/booking/by-provider?providerId=${encodeURIComponent(universalProviderId)}` +
      `&from=${todayISO()}&to=${daysFromNowISO(7)}`,
  );
  if (error) return 0;
  return ((data ?? []) as unknown[]).length;
}

/**
 * Active customer relationships and what is coming in the next week.
 *
 * Exported because the workspace header shows the same customer count above
 * the tabs. It shares this function AND its query key, so the number in the
 * header and the number in the Overview strip are one fetch and cannot drift.
 */
export async function fetchProviderStats(sourceKey: string, legacyId: string, providerId = "") {
  // One dispatch: the descriptor map below. Keeping a second if-chain here is
  // how the two would drift apart.
  return analyticsFor(sourceKey)({ providerId, legacyId });
}

export type ProviderStats = { active: number; upcoming: number };
export type StatsFetcher = (ctx: { providerId: string; legacyId: string }) => Promise<ProviderStats>;

/**
 * What a business gets when it has said nothing: whatever the booking engine
 * holds for it. No customer count, because "active" means a subscription and a
 * business without one has no such number to show.
 */
export const UNIVERSAL_STATS: StatsFetcher = async ({ providerId }) => ({
  active: 0,
  upcoming: await countEngineBookings(providerId),
});

const ANALYTICS_SOURCES: Record<string, StatsFetcher> = {
  cleaning: ({ legacyId }) => fetchCleaningStats(legacyId),
  food:     ({ legacyId }) => fetchFoodStats(legacyId),
  beach:    ({ providerId, legacyId }) => fetchBeachStats(providerId || legacyId),
};

/** The reader for a vertical — the universal one when it has said nothing. */
export function analyticsFor(sourceKey: string | null | undefined): StatsFetcher {
  return ANALYTICS_SOURCES[canonicalServiceKey(sourceKey)] ?? UNIVERSAL_STATS;
}
