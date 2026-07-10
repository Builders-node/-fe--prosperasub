import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarClock, DollarSign, Star } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Owner-facing "business at a glance" widget. Mounts at the top of every
 * provider workspace so the owner sees the KPIs that actually matter before
 * digging into tabs.
 *
 * Stats (per service):
 *  • Active subs / bookings   — total live customer relationships
 *  • Upcoming (7 days)        — what's about to happen this week
 *  • Revenue MTD              — booked/paid revenue for the current month
 *  • Rating                   — average of provider_reviews (if any)
 *
 * The query bindings differ per service because each legacy table has its own
 * shape (see CLAUDE.md). One widget, four adapters — kept in this file so a
 * new metric only touches one place per service.
 */

interface Props {
  /** Universal `providers.id` — used for reviews lookup. */
  providerId: string;
  /** Legacy per-service provider id — used to filter service tables. */
  legacyId: string;
  /** Which legacy service this provider belongs to. */
  sourceKey: string;
}

interface Stat {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tint?: "primary" | "amber" | "emerald" | "muted";
}

function StatCard({ label, value, icon: Icon, tint = "primary" }: Stat) {
  const tintCls =
    tint === "amber"   ? "bg-amber-500/15 text-amber-500"     :
    tint === "emerald" ? "bg-emerald-500/15 text-emerald-500" :
    tint === "muted"   ? "bg-muted text-muted-foreground"     :
                         "bg-primary/15 text-primary";
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-4">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tintCls)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-black leading-tight tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

const monthStartISO = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const daysFromNowISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);

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
  if (!packageIds.length) return { active: 0, upcoming: 0, revenueCents: 0 };

  // Upcoming 7d for cleaning = booked cleaning_bookings whose slot.date lands
  // in the next 7 days. `cleaning_bookings` has no date column — it joins to
  // `cleaning_available_slots` via slot_id. Nested inner filter narrows via
  // the slot's date range.
  const [{ count: active }, { count: upcoming }, { data: revRows }] = await Promise.all([
    supabaseDb.from("cleaning_subscriptions")
      .select("id", { count: "exact", head: true })
      .in("package_id", packageIds)
      .eq("subscription_status", "active"),
    supabaseDb.from("cleaning_bookings")
      .select("id, cleaning_available_slots!inner(date)", { count: "exact", head: true })
      .eq("status", "booked")
      .gte("cleaning_available_slots.date", todayISO())
      .lte("cleaning_available_slots.date", daysFromNowISO(7)),
    supabaseDb.from("cleaning_subscriptions")
      .select("total_price_cents,monthly_price_cents,created_at")
      .in("package_id", packageIds)
      .eq("payment_status", "paid")
      .gte("created_at", monthStartISO()),
  ]);
  const revenueCents = (revRows ?? []).reduce((s: number, r: any) =>
    s + Number(r.total_price_cents || r.monthly_price_cents || 0), 0);
  return { active: active ?? 0, upcoming: upcoming ?? 0, revenueCents };
}

async function fetchFoodStats(legacyId: string) {
  const [{ count: active }, { data: revRows }] = await Promise.all([
    supabaseDb.from("food_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", legacyId)
      .eq("subscription_status", "active"),
    supabaseDb.from("food_subscriptions")
      .select("weekly_price_cents,commitment_weeks,created_at")
      .eq("provider_id", legacyId)
      .eq("payment_status", "paid")
      .gte("created_at", monthStartISO()),
  ]);
  const revenueCents = (revRows ?? []).reduce((s: number, r: any) =>
    s + Number(r.weekly_price_cents || 0) * Number(r.commitment_weeks || 1), 0);
  return { active: active ?? 0, upcoming: active ?? 0, revenueCents };
}

async function fetchCarsStats(legacyId: string) {
  const { data: vehicles } = await supabaseDb
    .from("rental_vehicles")
    .select("id")
    .eq("provider_id", legacyId);
  const vehicleIds = (vehicles ?? []).map((v: any) => v.id);
  if (!vehicleIds.length) return { active: 0, upcoming: 0, revenueCents: 0 };

  const [{ count: active }, { count: upcoming }, { data: revRows }] = await Promise.all([
    supabaseDb.from("rental_bookings")
      .select("id", { count: "exact", head: true })
      .in("vehicle_id", vehicleIds)
      .in("status", ["confirmed", "in_progress"]),
    supabaseDb.from("rental_bookings")
      .select("id", { count: "exact", head: true })
      .in("vehicle_id", vehicleIds)
      .gte("start_date", todayISO())
      .lte("start_date", daysFromNowISO(7)),
    supabaseDb.from("rental_bookings")
      .select("total_price_cents,created_at")
      .in("vehicle_id", vehicleIds)
      .eq("payment_status", "paid")
      .gte("created_at", monthStartISO()),
  ]);
  const revenueCents = (revRows ?? []).reduce((s: number, r: any) =>
    s + Number(r.total_price_cents || 0), 0);
  return { active: active ?? 0, upcoming: upcoming ?? 0, revenueCents };
}

async function fetchBeachStats() {
  // Beach is platform-owned (one provider), so stats are global. Real column
  // names on beach_club_* tables: `date` (not booking_date), `total_cents`
  // (not total_price_cents), `people` (not people_count).
  const [{ count: active }, { count: upcoming }, { data: revRows }] = await Promise.all([
    supabaseDb.from("beach_club_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabaseDb.from("beach_club_court_bookings")
      .select("id", { count: "exact", head: true })
      .gte("date", todayISO())
      .lte("date", daysFromNowISO(7))
      .neq("status", "cancelled"),
    supabaseDb.from("beach_club_subscriptions")
      .select("total_cents,created_at")
      .eq("payment_status", "paid")
      .gte("created_at", monthStartISO()),
  ]);
  const revenueCents = (revRows ?? []).reduce((s: number, r: any) => s + Number(r.total_cents || 0), 0);
  return { active: active ?? 0, upcoming: upcoming ?? 0, revenueCents };
}

async function fetchStats(sourceKey: string, legacyId: string) {
  if (sourceKey === "cleaning") return fetchCleaningStats(legacyId);
  if (sourceKey === "food")     return fetchFoodStats(legacyId);
  if (sourceKey === "cars")     return fetchCarsStats(legacyId);
  if (sourceKey === "beach" || sourceKey === "beach_club") return fetchBeachStats();
  return { active: 0, upcoming: 0, revenueCents: 0 };
}

async function fetchRating(universalProviderId: string) {
  const { data } = await supabaseDb
    .from("provider_reviews")
    .select("rating")
    .eq("provider_id", universalProviderId);
  if (!data?.length) return { avg: null as number | null, count: 0 };
  const sum = data.reduce((s: number, r: any) => s + Number(r.rating || 0), 0);
  return { avg: sum / data.length, count: data.length };
}

export function ProviderAnalyticsWidget({ providerId, legacyId, sourceKey }: Props) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["provider-analytics", sourceKey, legacyId],
    queryFn: () => fetchStats(sourceKey, legacyId),
    staleTime: 60_000,
  });
  const { data: rating } = useQuery({
    queryKey: ["provider-rating", providerId],
    queryFn: () => fetchRating(providerId),
    staleTime: 60_000,
  });

  const cards: Stat[] = [
    {
      label: "Active",
      value: isLoading ? "—" : String(stats?.active ?? 0),
      icon: Activity,
      tint: "primary",
    },
    {
      label: "Upcoming 7d",
      value: isLoading ? "—" : String(stats?.upcoming ?? 0),
      icon: CalendarClock,
      tint: "primary",
    },
    {
      label: "Revenue MTD",
      value: isLoading ? "—" : formatUSD(stats?.revenueCents ?? 0),
      icon: DollarSign,
      tint: "emerald",
    },
    {
      label: rating?.count ? `Rating · ${rating.count}` : "Rating",
      value: rating?.avg != null ? rating.avg.toFixed(1) : "—",
      icon: Star,
      tint: "amber",
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => <StatCard key={c.label} {...c} />)}
    </section>
  );
}
