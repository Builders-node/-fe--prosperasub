import { useQuery } from "@tanstack/react-query";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { todayHN, addDaysISO } from "@/lib/timezone";

/**
 * Where the workspace header's numbers come from.
 *
 * Stats (per service):
 *  • Active subs / bookings   — total live customer relationships
 *  • Upcoming (7 days)        — what's about to happen this week
 *  • Rating                   — average of provider_reviews (if any)
 *
 * The query bindings differ per service because each legacy table has its own
 * shape (see CLAUDE.md). Four adapters, kept in this file so a new metric only
 * touches one place per service.
 */

interface Props {
  /** Universal `providers.id` — used for reviews lookup. */
  providerId: string;
  /** Legacy per-service provider id — used to filter service tables. */
  legacyId: string;
  /** Which legacy service this provider belongs to. */
  sourceKey: string;
}

// All date boundaries here are Honduras-local so KPIs match what appears on the
// Finance page and don't drift for admins sitting in positive-offset TZs.
const daysFromNowISO = (days: number) => addDaysISO(todayHN(), days);
const todayISO = () => todayHN();

// ─── Service adapters ──────────────────────────────────────────────────────
// Each adapter loads a { active, upcoming7d, revenueMtdCents } tuple. We do
// three targeted queries instead of one big one — keeps each fetch bounded and
// makes it obvious what a stat means when a service adds/renames a column.

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
  if (sourceKey === "cleaning") return fetchCleaningStats(legacyId);
  if (sourceKey === "food")     return fetchFoodStats(legacyId);
  if (sourceKey === "beach" || sourceKey === "beach_club") return fetchBeachStats(providerId || legacyId);
  // A business with no legacy table at all: whatever the engine holds for it.
  return { active: 0, upcoming: await countEngineBookings(providerId) };
}

async function fetchRating(universalProviderId: string) {
  // Rating averages the numeric rating column. Exclude rows with NULL rating
  // so a data-entry blank doesn't drag the mean to zero. Provider_reviews are
  // hard-deleted, so no soft-delete filter needed.
  const { data } = await supabaseDb
    .from("provider_reviews")
    .select("rating")
    .eq("provider_id", universalProviderId)
    .not("rating", "is", null);
  if (!data?.length) return { avg: null as number | null, count: 0 };
  const nums = data
    .map((r: any) => Number(r.rating))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return { avg: null as number | null, count: 0 };
  const sum = nums.reduce((s, n) => s + n, 0);
  return { avg: sum / nums.length, count: nums.length };
}

/**
 * The four figures a provider is measured by, for the KPI card in the
 * workspace header.
 *
 * This used to render its own strip of four icon-plated cards under the tabs —
 * uppercase micro-labels, values in black weight, a tint per metric. The
 * header above it then showed two of the same numbers in the redesign's type.
 * The strip is gone; what is left is where the numbers come from.
 */
export function useProviderKpis({ providerId, legacyId, sourceKey }: Props) {
  const stats = useQuery({
    queryKey: ["provider-analytics", sourceKey, legacyId, providerId],
    queryFn: () => fetchProviderStats(sourceKey, legacyId, providerId),
    staleTime: 60_000,
  });
  const rating = useQuery({
    queryKey: ["provider-rating", providerId],
    queryFn: () => fetchRating(providerId),
    staleTime: 60_000,
  });
  return {
    active: stats.data?.active ?? 0,
    upcoming: stats.data?.upcoming ?? 0,
    rating: rating.data?.avg ?? null,
    ratingCount: rating.data?.count ?? 0,
    isPending: stats.isPending,
  };
}
