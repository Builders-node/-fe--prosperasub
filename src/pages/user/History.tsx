import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  SparklesIcon, UtensilsCrossed, Waves, LandPlot, Receipt, RefreshCw, Store, CarFront,
} from "lucide-react";
import { format } from "date-fns";
import { UserLayout } from "@/components/layout/UserLayout";
import { PageLoader } from "@/components/ui/spinner";
import { YdEmptyState } from "@/components/yd/YdPrimitives";
import { StatusPill } from "@/components/patterns/StatusPill";
import { QueryError } from "@/components/patterns/QueryError";
import { PaymentMethodBadge } from "@/components/admin/PaymentMethodBadge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useUserUuid } from "@/hooks/useUserUuid";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// ─── Unified entry shape ────────────────────────────────────────────────────
type ServiceKey = "cleaning" | "food" | "entertainment" | "court" | "plan" | "cars";
type EntryKind = "purchase" | "renewal";

interface HistoryEntry {
  id: string;
  createdAt: string;
  kind: EntryKind;
  service: ServiceKey;
  serviceLabel: string;
  subtitle: string;        // plan / court name / period-extension summary
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
  court:         { label: "Court booking", icon: LandPlot },
  plan:          { label: "Purchase",      icon: Store },
  cars:          { label: "Car rental",    icon: CarFront },
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

      // Every purchase, whatever the service, from the one read model
      // (subscriptions_unified) — it already carries the plan's name and the
      // FULL committed value. Reading the three tables apart showed a meal
      // plan's weekly price as what was paid, and left universal purchases
      // (a dive course, any new service) out of the history altogether.
      const [orders, courts, renewals] = await Promise.all([
        supabaseDb.from("subscriptions_unified")
          .select("id,service,created_at,plan_name,price_cents,payment_method,payment_status")
          .in("user_id", ids).order("created_at", { ascending: false }),
        // Bookings live in the engine's own table, which the browser cannot
        // read — it is service-role only. The legacy court table this used to
        // ask has been empty since the cutover, so a member who books a court
        // every week has been looking at a history with no courts in it.
        accountApi("/booking/mine?limit=200"),
        // Every server-recorded renewal (food + cleaning + beach + balance).
        supabaseDb.from("subscription_renewals")
          .select("id,created_at,service,subscription_id,previous_end,new_start,new_end,amount_cents,payment_method,payment_reference")
          .in("renewed_by_user", ids).order("created_at", { ascending: false }),
      ]);
      if (orders.error) throw orders.error;

      const serviceOf = (svc: string): ServiceKey =>
        svc === "beach" ? "entertainment"
          : svc === "food" || svc === "cleaning" || svc === "cars" ? svc
          : "plan";

      // Map SubscriptionRenewalService's service tag to our History service key.
      // `beach` on the backend renders under "entertainment" in the UI to match
      // the archetype rename.
      const renewalServiceToUi = (svc: string): ServiceKey => {
        if (svc === "beach") return "entertainment";
        if (svc === "food") return "food";
        if (svc === "cleaning") return "cleaning";
        if (svc === "plan") return "plan";
        return "court";
      };

      const entries: HistoryEntry[] = [
        ...(orders.data ?? []).map((r: any): HistoryEntry => {
          const service = serviceOf(String(r.service));
          return {
            id: `${r.service}:${r.id}`,
            createdAt: r.created_at,
            kind: "purchase",
            service,
            serviceLabel: SERVICE_META[service].label,
            subtitle: r.plan_name ?? SERVICE_META[service].label,
            amountCents: r.price_cents ?? null,
            paymentMethod: r.payment_method,
            paymentStatus: r.payment_status,
          };
        }),
        ...((courts.data ?? []) as any[]).map((r: any): HistoryEntry => ({
          id: `court:${r.id}`,
          // What a booking IS, is when it is — the moment it was created is
          // filing metadata. `start_at` is what the customer remembers.
          createdAt: r.start_at ?? r.created_at,
          kind: "purchase",
          service: "court",
          serviceLabel: SERVICE_META.court.label,
          subtitle: r.resource_name ?? "Booking",
          amountCents: null,        // bookings are included with the plan
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
        <div className="app-container pt-5">
          <YdEmptyState
            icon={Receipt}
            title="Sign in to view history"
            subtitle="Your subscriptions, bookings and payments will appear here."
            action={<Button onClick={() => openAuthModal("login", "/history")}>Sign In</Button>}
          />
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout title="History">
      <div className="app-container pt-5">
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
          <YdEmptyState
            icon={Receipt}
            title="No transactions yet"
            subtitle="Everything you buy on the platform will show up here."
            action={<Button onClick={() => navigate("/discovery")}>Browse services</Button>}
          />
        ) : (
          <div className="space-y-6">
            {grouped.map(([day, rows]) => (
              <section key={day}>
                <h2 className="mb-2 text-heading font-semibold text-foreground">
                  {formatDayHeader(day)}
                </h2>
                <div className="divide-y divide-border/60 overflow-hidden rounded-radius-md bg-card px-4">
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
        <p className="truncate text-meta text-muted-foreground">{entry.subtitle}</p>
      </div>

      {/* Right column — amount + payment method */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {entry.amountCents != null ? (
          <p className={cn(
            "text-sm font-semibold tabular-nums",
            isRefunded ? "text-positive" : isPending ? "text-muted-foreground" : "text-foreground",
          )}>
            {isRefunded ? "+" : "−"}{formatUSD(entry.amountCents)}
          </p>
        ) : (
          <span className="text-meta text-muted-foreground">Included</span>
        )}
        {entry.paymentMethod && (
          <PaymentMethodBadge method={entry.paymentMethod} />
        )}
        {isPending && (
          <StatusPill status="pending" />
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
          <div className="divide-y divide-border/60 overflow-hidden rounded-radius-md bg-card px-4">
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
