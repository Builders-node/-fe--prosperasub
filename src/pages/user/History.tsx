import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  SparklesIcon, UtensilsCrossed, Car, Waves, LandPlot, Receipt, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { UserLayout } from "@/components/layout/UserLayout";
import { PageLoader } from "@/components/ui/spinner";
import { TabEmptyState } from "@/components/subscriptions/MySubsPrimitives";
import { QueryError } from "@/components/QueryError";
import { PaymentMethodBadge } from "@/components/admin/PaymentMethodBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// ─── Unified entry shape ────────────────────────────────────────────────────
type ServiceKey = "cleaning" | "food" | "entertainment" | "rental" | "court";
type EntryKind = "purchase" | "renewal";

interface HistoryEntry {
  id: string;
  createdAt: string;
  kind: EntryKind;
  service: ServiceKey;
  serviceLabel: string;
  subtitle: string;        // plan / vehicle / court name / period-extension summary
  amountCents: number | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
}

const SERVICE_META: Record<ServiceKey, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  cleaning:      { label: "Cleaning",      icon: SparklesIcon },
  food:          { label: "Food",          icon: UtensilsCrossed },
  entertainment: { label: "Entertainment", icon: Waves },
  rental:        { label: "Rental",        icon: Car },
  court:         { label: "Court booking", icon: LandPlot },
};

// ═══════════════════════════════════════════════════════════════════════════
// Query hook — parallel fetch of every user-owned charge across services.
// Joins are manual (no FK constraints on these legacy tables) so we resolve
// item names client-side after the initial pull.
// ═══════════════════════════════════════════════════════════════════════════
function useUserHistory() {
  const { userData, isAuthenticated } = useAuth();
  const userUuid = useUserUuid();

  return useQuery({
    queryKey: ["user-history", userUuid, userData?.id],
    enabled: isAuthenticated && (!!userUuid || !!userData?.id),
    queryFn: async (): Promise<HistoryEntry[]> => {
      // Same "match by uuid OR raw auth id" trick MySubscriptions uses — Google
      // logins historically stored the auth id, not the UUID, so we accept both.
      const ids = [userUuid, userData?.id].filter(Boolean) as string[];
      if (ids.length === 0) return [];

      const [cleaning, food, beach, rental, courts, renewals] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions")
          .select("id,created_at,package_id,total_price_cents,monthly_price_cents,payment_method,payment_status")
          .in("user_id", ids).order("created_at", { ascending: false }),
        supabaseDb.from("food_subscriptions")
          .select("id,created_at,meal_plan_id,weekly_price_cents,payment_method,payment_status")
          .in("user_id", ids).order("created_at", { ascending: false }),
        supabaseDb.from("beach_club_subscriptions")
          .select("id,created_at,plan_id,total_cents,payment_method,payment_status")
          .in("user_id", ids).order("created_at", { ascending: false }),
        supabaseDb.from("rental_bookings")
          .select("id,created_at,vehicle_id,total_cents,payment_method,payment_status")
          .in("user_id", ids).is("deleted_at", null).order("created_at", { ascending: false }),
        supabaseDb.from("beach_club_court_bookings")
          .select("id,created_at,court_id")
          .in("user_id", ids).order("created_at", { ascending: false }),
        // Every server-recorded renewal (food + cleaning + beach). Populated by
        // the new SubscriptionRenewalService — one row per verified extension.
        supabaseDb.from("subscription_renewals")
          .select("id,created_at,service,subscription_id,previous_end,new_start,new_end,amount_cents,payment_method,payment_reference")
          .in("renewed_by_user", ids).order("created_at", { ascending: false }),
      ]);

      // Resolve item names — one round-trip per legacy item table for whatever
      // ids actually showed up. Empty ids skip the query.
      const [pkgs, meals, plans, vehicles, courtRows] = await Promise.all([
        idsFrom(cleaning.data, "package_id").length
          ? supabaseDb.from("cleaning_packages").select("id,name").in("id", idsFrom(cleaning.data, "package_id"))
          : Promise.resolve({ data: [] as any[] }),
        idsFrom(food.data, "meal_plan_id").length
          ? supabaseDb.from("food_meal_plans").select("id,name").in("id", idsFrom(food.data, "meal_plan_id"))
          : Promise.resolve({ data: [] as any[] }),
        idsFrom(beach.data, "plan_id").length
          ? supabaseDb.from("beach_club_plans").select("id,name").in("id", idsFrom(beach.data, "plan_id"))
          : Promise.resolve({ data: [] as any[] }),
        idsFrom(rental.data, "vehicle_id").length
          ? supabaseDb.from("rental_vehicles").select("id,name").in("id", idsFrom(rental.data, "vehicle_id"))
          : Promise.resolve({ data: [] as any[] }),
        idsFrom(courts.data, "court_id").length
          ? supabaseDb.from("beach_club_courts").select("id,name").in("id", idsFrom(courts.data, "court_id"))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const nameOf = (rows: any[] | null | undefined, id: string, fallback: string) =>
        rows?.find((r) => r.id === id)?.name ?? fallback;

      // Map SubscriptionRenewalService's service tag to our History service key.
      // `beach` on the backend renders under "entertainment" in the UI to match
      // the archetype rename.
      const renewalServiceToUi = (svc: string): ServiceKey => {
        if (svc === "beach") return "entertainment";
        if (svc === "food") return "food";
        if (svc === "cleaning") return "cleaning";
        if (svc === "rental") return "rental";
        return "court";
      };

      const entries: HistoryEntry[] = [
        ...(cleaning.data ?? []).map((r: any): HistoryEntry => ({
          id: `cleaning:${r.id}`,
          createdAt: r.created_at,
          kind: "purchase",
          service: "cleaning",
          serviceLabel: SERVICE_META.cleaning.label,
          subtitle: nameOf(pkgs.data, r.package_id, "Cleaning package"),
          amountCents: r.total_price_cents ?? r.monthly_price_cents ?? null,
          paymentMethod: r.payment_method,
          paymentStatus: r.payment_status,
        })),
        ...(food.data ?? []).map((r: any): HistoryEntry => ({
          id: `food:${r.id}`,
          createdAt: r.created_at,
          kind: "purchase",
          service: "food",
          serviceLabel: SERVICE_META.food.label,
          subtitle: nameOf(meals.data, r.meal_plan_id, "Meal plan"),
          amountCents: r.weekly_price_cents ?? null,
          paymentMethod: r.payment_method,
          paymentStatus: r.payment_status,
        })),
        ...(beach.data ?? []).map((r: any): HistoryEntry => ({
          id: `beach:${r.id}`,
          createdAt: r.created_at,
          kind: "purchase",
          service: "entertainment",
          serviceLabel: SERVICE_META.entertainment.label,
          subtitle: nameOf(plans.data, r.plan_id, "Beach Club plan"),
          amountCents: r.total_cents ?? null,
          paymentMethod: r.payment_method,
          paymentStatus: r.payment_status,
        })),
        ...(rental.data ?? []).map((r: any): HistoryEntry => ({
          id: `rental:${r.id}`,
          createdAt: r.created_at,
          kind: "purchase",
          service: "rental",
          serviceLabel: SERVICE_META.rental.label,
          subtitle: nameOf(vehicles.data, r.vehicle_id, "Vehicle"),
          amountCents: r.total_cents ?? null,
          paymentMethod: r.payment_method,
          paymentStatus: r.payment_status,
        })),
        ...(courts.data ?? []).map((r: any): HistoryEntry => ({
          id: `court:${r.id}`,
          createdAt: r.created_at,
          kind: "purchase",
          service: "court",
          serviceLabel: SERVICE_META.court.label,
          subtitle: nameOf(courtRows.data, r.court_id, "Court"),
          amountCents: null,        // court bookings are included with membership
          paymentMethod: null,
          paymentStatus: null,
        })),
        // Renewal events — each represents a verified period extension.
        ...(renewals.data ?? []).map((r: any): HistoryEntry => {
          const svc = renewalServiceToUi(r.service);
          return {
            id: `renewal:${r.id}`,
            createdAt: r.created_at,
            kind: "renewal",
            service: svc,
            serviceLabel: `${SERVICE_META[svc].label} · Renewed`,
            subtitle: `Extended through ${r.new_end}`,
            amountCents: r.amount_cents ?? null,
            paymentMethod: r.payment_method,
            paymentStatus: "paid", // renewal is only recorded after verify()
          };
        }),
      ];

      // DESC by createdAt so newest lands at the top.
      entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return entries;
    },
  });
}

// Small helper — pull a column across a rowset, filter out empties.
function idsFrom(rows: any[] | null | undefined, col: string): string[] {
  return [...new Set((rows ?? []).map((r) => r[col]).filter(Boolean))] as string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════
const History = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { data: entries, isLoading, isError, error, refetch, isFetching } = useUserHistory();

  // Group by calendar day. Same technique the Yandex screenshot uses — one
  // sticky-looking bold date header, then the day's transactions underneath.
  const grouped = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of entries ?? []) {
      const key = format(new Date(e.createdAt), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()); // insertion order preserved (entries already DESC-sorted)
  }, [entries]);

  // ── Auth gate ────────────────────────────────────────────────────────────
  if (authLoading) {
    return <UserLayout title="History"><PageLoader /></UserLayout>;
  }

  if (!isAuthenticated) {
    return (
      <UserLayout title="History">
        <div className="py-8">
          <TabEmptyState
            icon={Receipt}
            title="Sign in to view history"
            subtitle="Your subscriptions, bookings and payments will appear here."
            action={{ label: "Sign In", onClick: () => openAuthModal("login", "/history") }}
          />
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="History">
      <div className="app-container pb-28 pt-5">
        {/* Page title lives in the mobile header — no inline H1 needed. */}


        {isLoading ? (
          <HistorySkeleton />
        ) : isError ? (
          <QueryError
            title="Couldn't load history"
            error={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : grouped.length === 0 ? (
          <TabEmptyState
            icon={Receipt}
            title="No transactions yet"
            subtitle="Everything you buy on the platform will show up here."
            action={{ label: "Browse services", onClick: () => navigate("/discovery") }}
          />
        ) : (
          <div className="space-y-6">
            {grouped.map(([day, rows]) => (
              <section key={day}>
                <h2 className="mb-2 text-lg font-black tracking-tight text-foreground">
                  {formatDayHeader(day)}
                </h2>
                <div className="divide-y divide-border/60">
                  {rows.map((e) => <HistoryRow key={e.id} entry={e} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
};

// Absolute date for older entries, "Today"/"Yesterday" for the fresh ones —
// so recent activity is instantly obvious without doing math.
function formatDayHeader(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return format(d, d.getFullYear() === today.getFullYear() ? "MMMM d" : "MMMM d, yyyy");
}

// ─── Row ────────────────────────────────────────────────────────────────────
function HistoryRow({ entry }: { entry: HistoryEntry }) {
  // Renewals get a distinct icon so users can eye-scan payments vs extensions.
  const Icon = entry.kind === "renewal" ? RefreshCw : SERVICE_META[entry.service].icon;
  const isRefunded = entry.paymentStatus === "refunded";
  const isPending  = entry.paymentStatus === "pending";

  return (
    <div className="flex items-center gap-3 py-3">
      {/* Service icon — single-accent primary tile to match the app theme */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{entry.serviceLabel}</p>
        <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
      </div>

      {/* Right column — amount + payment method */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {entry.amountCents != null ? (
          <p className={cn(
            "text-sm font-black tabular-nums",
            isRefunded ? "text-emerald-500" : isPending ? "text-muted-foreground" : "text-foreground",
          )}>
            {isRefunded ? "+" : "−"}{formatUSD(entry.amountCents)}
          </p>
        ) : (
          <span className="text-xs text-muted-foreground">Included</span>
        )}
        {entry.paymentMethod && (
          <PaymentMethodBadge method={entry.paymentMethod} />
        )}
        {isPending && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Pending</span>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
function HistorySkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((day) => (
        <div key={day}>
          <div className="mb-2 h-5 w-24 animate-pulse rounded bg-muted" />
          <div className="divide-y divide-border/60">
            {[1, 2, 3].map((r) => (
              <div key={r} className="flex items-center gap-3 py-3">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-48 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-12 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default History;
