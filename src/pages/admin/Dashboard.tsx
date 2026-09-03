import { Link } from "react-router-dom";
import { ArrowUpRight, Car, CheckCircle2, Package, SparklesIcon, UtensilsCrossed, Waves } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { fetchPlatformRollup } from "@/lib/analytics/platformRollup";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { approvePayment, type ApproveService } from "@/lib/subscriptionApprove";
import { cn } from "@/lib/utils";
import { fetchUsersByIds, fetchClientNames, customerNameFrom } from "@/lib/admin/customerNames";
import { formatUSD } from "@/lib/pricing";
import { QueryError } from "@/components/patterns/QueryError";
import { YdSectionHeading } from "@/components/yd/YdPrimitives";

/**
 * Admin Overview.
 *
 * Kept intentionally sparse: three headline numbers, four per-service tiles,
 * and the last handful of *distinct* customer actions. The dense per-booking
 * activity feed used to inflate here — five rows for one recurring cleaning
 * subscription — was pure noise; it's replaced by a subscription-level feed.
 *
 * Everything drilling deeper (individual bookings, payment tables, per-user
 * history) lives one click away in Subscriptions / Finance / People.
 */


type ServiceKey = "cleaning" | "food" | "beach" | "plan" | "cars";

const SERVICE_META: Record<ServiceKey, { label: string; icon: typeof SparklesIcon; href: string }> = {
  cleaning: { label: "Cleaning",   icon: SparklesIcon,     href: "/admin/analytics?service=cleaning" },
  food:     { label: "Food",       icon: UtensilsCrossed,  href: "/admin/analytics?service=food" },
  beach:    { label: "Beach Club", icon: Waves,            href: "/admin/analytics?service=beach" },
  // Everything sold on a universal-only service — new archetypes, one-time
  // offers. The queue and the feed read `subscriptions_unified`, whose fourth
  // arm files these under 'plan'.
  plan:     { label: "Other services", icon: Package,      href: "/admin/marketplace/subscriptions" },
  cars:     { label: "Cars",       icon: Car,              href: "/admin/car-rentals" },
};

interface PendingRow {
  id: string;
  service: ApproveService;
  serviceLabel: string;
  ServiceIcon: typeof SparklesIcon;
  userLabel: string;
  amountCents: number;
  createdAt: string;
}

/** A row of `subscriptions_unified`, as this page reads it. */
interface UnifiedSubRow {
  id: string;
  service: string;
  user_id: string | null;
  price_cents: number | null;
  paid?: boolean;
  payment_status?: string | null;
  status?: string | null;
  created_at: string;
}

/**
 * Customer names for unified rows. The view carries only `user_id`; the human
 * name may live on the users row, on food's own `customer_name`, on cleaning's
 * client record, or in the universal row's metadata — one batched lookup per
 * shape, then one resolver for every row.
 */
async function unifiedNames(rows: UnifiedSubRow[]): Promise<(r: UnifiedSubRow) => string> {
  const idsOf = (...services: string[]) =>
    rows.filter((r) => services.includes(r.service)).map((r) => r.id);
  const foodIds = idsOf("food");
  const cleaningIds = idsOf("cleaning");
  const universalIds = idsOf("beach", "plan");
  const carIds = idsOf("cars");

  const [userMap, food, cleaning, universal, cars] = await Promise.all([
    // fetchUsersByIds drops ids that `users.id` (a uuid column) can't hold.
    // One Google-sub id in the batch made PostgREST reject the whole query
    // with 22P02, emptying the map and turning every name into a fallback.
    fetchUsersByIds(rows.map((r) => r.user_id).filter(Boolean) as string[]),
    foodIds.length
      ? supabaseDb.from("food_subscriptions").select("id, customer_name").in("id", foodIds)
      : Promise.resolve({ data: [] as any[] }),
    cleaningIds.length
      ? supabaseDb.from("cleaning_subscriptions").select("id, client_id").in("id", cleaningIds)
      : Promise.resolve({ data: [] as any[] }),
    universalIds.length
      ? supabaseDb.from("provider_subscriptions").select("id, customer_name:metadata->>customer_name").in("id", universalIds)
      : Promise.resolve({ data: [] as any[] }),
    carIds.length
      ? supabaseDb.from("rental_bookings").select("id, customer_name").in("id", carIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const clientMap = await fetchClientNames(((cleaning.data ?? []) as any[]).map((r) => r.client_id));
  const byId = new Map<string, { customerName?: string | null; clientId?: string | null }>();
  ((food.data ?? []) as any[]).forEach((r) => byId.set(String(r.id), { customerName: r.customer_name }));
  ((cleaning.data ?? []) as any[]).forEach((r) => byId.set(String(r.id), { clientId: r.client_id }));
  ((universal.data ?? []) as any[]).forEach((r) => byId.set(String(r.id), { customerName: r.customer_name }));
  ((cars.data ?? []) as any[]).forEach((r) => byId.set(String(r.id), { customerName: r.customer_name }));

  return (r) => {
    const extra = byId.get(String(r.id)) ?? {};
    return customerNameFrom({
      user: r.user_id ? userMap.get(String(r.user_id)) : null,
      customerName: extra.customerName,
      clientName: extra.clientId ? clientMap.get(String(extra.clientId)) : null,
      fallback: "Customer",
    });
  };
}

const AdminDashboard = () => {
  const qc = useQueryClient();
  const { userData } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["super-admin-stats-all"],
    queryFn: async () => {
      // Revenue, active and awaiting-payment are counted once, in
      // lib/analytics/platformRollup.ts, and shared with the Analytics page.
      // This used to be a hand-written reduce per service here and another one
      // there; they agreed only for as long as someone kept checking.
      const [usersRes, rollup] = await Promise.all([
        supabaseDb.from("users").select("id", { count: "exact", head: true }).is("deleted_at", null),
        fetchPlatformRollup(),
      ]);

      const byService = Object.fromEntries(
        rollup.services.map((s) => [s.key, { active: s.active, revenueCents: s.revenueCents }]),
      ) as Record<ServiceKey, { active: number; revenueCents: number }>;

      return {
        users: usersRes.count || 0,
        revenueCents: rollup.totals.revenueCents,
        activeSubs: rollup.totals.active,
        pending: rollup.totals.awaitingPayment,
        byService,
      };
    },
  });

  // Awaiting-payment queue — the top daily-friction workflow (admin approves
  // manual-payment subs one by one). Ships as an inline mini-queue so the
  // admin doesn't have to leave the dashboard, click into a filtered list, and
  // navigate a table per approval.
  const { data: pendingQueue = [] } = useQuery<PendingRow[]>({
    queryKey: ["super-admin-pending-queue"],
    queryFn: async () => {
      // One read model instead of three named tables. The old three-way query
      // was blind to a whole population: a sale on any universal-only service
      // (a new archetype, a one-time offer) never reached this queue, so the
      // person who approves payments could not see it existed.
      const { data, error } = await supabaseDb
        .from("subscriptions_unified")
        .select("id, service, user_id, price_cents, payment_status, status, created_at")
        .neq("payment_status", "paid").neq("payment_status", "refunded")
        .not("status", "in", "(cancelled,expired)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      const rows = (data ?? []) as UnifiedSubRow[];
      const nameOf = await unifiedNames(rows);
      return rows.map((r) => {
        const meta = SERVICE_META[(r.service as ServiceKey)] ?? SERVICE_META.plan;
        return {
          id: r.id,
          service: (r.service in SERVICE_META ? r.service : "plan") as ApproveService,
          serviceLabel: meta.label,
          ServiceIcon: meta.icon,
          userLabel: nameOf(r),
          amountCents: Number(r.price_cents) || 0,
          createdAt: r.created_at,
        };
      });
    },
    staleTime: 30_000,
  });

  const approve = useMutation({
    mutationFn: async (row: PendingRow) => {
      await approvePayment(row.service, row.id, { adminUserId: userData?.id });
    },
    onSuccess: () => {
      toast.success("Payment approved");
      // Refresh EVERY dashboard block so metrics + queue update in one go.
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith("super-admin-") });
      qc.invalidateQueries({ queryKey: ["admin-recent-activity-subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not approve payment"),
  });

  // Subscription-level activity — one row per distinct customer sale, not one
  // row per generated booking. The old feed emitted five identical rows for a
  // recurring cleaning purchase (one per generated cleaning_booking); the whole
  // point of "Recent activity" is that each event is meaningful.
  const {
    data: recentActivity = [],
    isError: activityError,
    error: activityErrorObj,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: ["admin-recent-activity-subscriptions"],
    queryFn: async () => {
      // Same read model as the queue above, unfiltered: the feed's whole job
      // is "every sale, whatever the service", and the unified view is the
      // only place that sentence is true.
      const { data, error } = await supabaseDb
        .from("subscriptions_unified")
        .select("id, service, user_id, price_cents, paid, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      const rows = (data ?? []) as UnifiedSubRow[];
      const nameOf = await unifiedNames(rows);
      return rows
        .filter((r) => r.created_at)
        .map((r) => {
          const key = (r.service in SERVICE_META ? r.service : "plan") as ServiceKey;
          return {
            id: `${r.service}-${r.id}`,
            service: key,
            tone: r.paid ? ("paid" as const) : ("pending" as const),
            label: `${nameOf(r)} — ${SERVICE_META[key].label}`,
            detail: r.paid ? formatUSD(Number(r.price_cents) || 0) : "Awaiting payment",
            date: r.created_at,
            href: key === "beach" ? "/admin/beach-club/subscriptions" : "/admin/marketplace/subscriptions",
          };
        });
    },
  });

  return (
    <SuperAdminLayout title="Overview" subtitle="What happened across the platform today">
      {/*
        Written in the platform's own vocabulary rather than an admin dialect —
        see DESIGN.md §3 and §4. Three type sizes carry the page (20 / 16 / 12,
        semibold, negative tracking), hierarchy comes from layered backgrounds
        rather than borders and tints, and a card is 16px.

        The two habits that made this screen read as a different product were a
        tiny uppercase eyebrow standing in for a section title, and rows welded
        into one slab by hairline dividers. Both are gone.
      */}

      {/* Headline metrics. Colour lives on the NUMBER, never on the card: a
          tinted panel is a second background, and this design has one. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricTile label="Users" value={String(stats?.users ?? 0)} href="/admin/users" />
        <MetricTile label="Revenue" value={formatUSD(stats?.revenueCents ?? 0)} href="/admin/payments" accent />
        <MetricTile
          label="Awaiting payment"
          value={String(stats?.pending ?? 0)}
          href="/admin/marketplace/subscriptions?status=pending"
          warning={(stats?.pending ?? 0) > 0}
          className="col-span-2 md:col-span-1"
        />
      </div>

      {/* The top daily workflow: approve inline rather than navigate into a
          list, find the row, open a menu. Hidden entirely on a quiet day. */}
      {pendingQueue.length > 0 && (
        <section className="mt-8">
          <YdSectionHeading title="Awaiting payment" count={pendingQueue.length} />
          <div className="space-y-2">
            {pendingQueue.map((row) => {
              const Icon = row.ServiceIcon;
              return (
                <div
                  key={`${row.service}-${row.id}`}
                  className="flex items-center gap-3 rounded-radius-md bg-card p-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                      {row.userLabel} · {row.serviceLabel}
                    </p>
                    <p className="mt-0.5 text-[12px] tracking-[-0.24px] text-muted-foreground">
                      {format(new Date(row.createdAt), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[16px] font-semibold tabular-nums tracking-[-0.32px] text-primary">
                    {formatUSD(row.amountCents)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-2 h-9 shrink-0 gap-1.5 rounded-full text-[13px] font-semibold"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(row)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Per-service breakdown. */}
      <section className="mt-8">
        <YdSectionHeading title="By service" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(SERVICE_META) as ServiceKey[]).map((key) => {
            const meta = SERVICE_META[key];
            const st = stats?.byService[key];
            const Icon = meta.icon;
            return (
              <Link
                key={key}
                to={meta.href}
                className="group flex min-w-0 flex-col gap-3 rounded-radius-md bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">
                    {meta.label}
                  </span>
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[20px] font-semibold tabular-nums tracking-[-0.4px] text-foreground">
                      {formatUSD(st?.revenueCents ?? 0)}
                    </p>
                    <p className="text-[12px] tracking-[-0.24px] text-muted-foreground">Revenue</p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[20px] font-semibold tabular-nums tracking-[-0.4px] text-foreground">
                      {st?.active ?? 0}
                    </p>
                    <p className="text-[12px] tracking-[-0.24px] text-muted-foreground">Active</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Subscription-level, so a recurring purchase is one row and not five.
          An unpaid sale carries the accent on its amount — the same signal the
          metric tile above uses, so the two read as one idea. */}
      <section className="mt-8">
        <YdSectionHeading title="Recent activity" count={recentActivity.length} />
        {activityError ? (
          /* A quiet day and a failed request are not the same news. */
          <QueryError
            title="Couldn't load recent activity"
            error={activityErrorObj}
            onRetry={() => void refetchActivity()}
          />
        ) : recentActivity.length === 0 ? (
          <div className="rounded-radius-md bg-card p-8 text-center">
            <p className="text-[16px] font-semibold tracking-[-0.32px] text-foreground">Nothing yet today</p>
            <p className="mt-1 text-[12px] tracking-[-0.24px] text-muted-foreground">
              Sales across every service appear here as they happen.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((a: any) => {
              const meta = SERVICE_META[a.service as ServiceKey];
              const Icon = meta.icon;
              return (
                <Link
                  key={a.id}
                  to={a.href}
                  className="flex items-center gap-3 rounded-radius-md bg-card p-4 transition-colors hover:bg-muted/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.32px] text-foreground">{a.label}</p>
                    <p className="mt-0.5 text-[12px] tracking-[-0.24px] text-muted-foreground">
                      {format(new Date(a.date), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[16px] font-semibold tabular-nums tracking-[-0.32px]",
                      a.tone === "pending" ? "text-primary" : "text-foreground",
                    )}
                  >
                    {a.detail}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </SuperAdminLayout>
  );
};


function MetricTile({
  label, value, href, accent, warning, className,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
  warning?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={href}
      className={cn(
        "group flex min-w-0 flex-col gap-1 rounded-radius-md bg-card p-4 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-[12px] tracking-[-0.24px] text-muted-foreground">{label}</span>
        <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p
        className={cn(
          "text-[28px] font-semibold leading-tight tabular-nums tracking-[-0.6px]",
          accent || warning ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </Link>
  );
}

export default AdminDashboard;
