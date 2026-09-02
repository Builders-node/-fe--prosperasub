import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, SparklesIcon, UtensilsCrossed, Waves } from "lucide-react";
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


type ServiceKey = "cleaning" | "food" | "beach";

const SERVICE_META: Record<ServiceKey, { label: string; icon: typeof SparklesIcon; href: string }> = {
  cleaning: { label: "Cleaning",   icon: SparklesIcon,     href: "/admin/analytics?service=cleaning" },
  food:     { label: "Food",       icon: UtensilsCrossed,  href: "/admin/analytics?service=food" },
  beach:    { label: "Beach Club", icon: Waves,            href: "/admin/analytics?service=beach" },
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
      const [cleaningSubs, foodSubs, beachSubs] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions")
          .select("id, user_id, client_id, total_price_cents, monthly_price_cents, created_at, payment_status, subscription_status")
          .is("deleted_at", null).neq("payment_status", "paid").neq("payment_status", "refunded")
          .not("subscription_status", "in", "(cancelled,expired)")
          .order("created_at", { ascending: false }).limit(20),
        supabaseDb.from("food_subscriptions")
          .select("id, user_id, customer_name, weekly_price_cents, commitment_weeks, created_at, payment_status, status")
          .neq("payment_status", "paid").neq("payment_status", "refunded")
          .not("status", "in", "(cancelled,expired)")
          .order("created_at", { ascending: false }).limit(20),
        supabaseDb.from("provider_subscriptions")
          .select("id, user_id, created_at, payment_status, status, total_cents:price_cents, customer_name:metadata->>customer_name")
          .eq("source_service_key", "beach")
          .neq("payment_status", "paid").neq("payment_status", "refunded")
          .not("status", "in", "(cancelled,expired)")
          .order("created_at", { ascending: false }).limit(20),
      ]);

      const userIds = [...new Set([
        ...(cleaningSubs.data ?? []).map((r: any) => r.user_id),
        ...(foodSubs.data ?? []).map((r: any) => r.user_id),
        ...(beachSubs.data ?? []).map((r: any) => r.user_id),
      ].filter(Boolean))] as string[];
      // fetchUsersByIds drops ids that `users.id` (a uuid column) can't hold.
      // One Google-sub id in the batch made PostgREST reject the whole query
      // with 22P02, emptying the map and turning every name into a fallback.
      const [userMap, clientMap] = await Promise.all([
        fetchUsersByIds(userIds),
        fetchClientNames((cleaningSubs.data ?? []).map((r: any) => r.client_id)),
      ]);
      const label = (userId: string | null, fallback?: string | null, clientId?: string | null) =>
        customerNameFrom({
          user: userId ? userMap.get(String(userId)) : null,
          customerName: fallback,
          clientName: clientId ? clientMap.get(String(clientId)) : null,
          fallback: "Customer",
        });

      const rows: PendingRow[] = [];
      (cleaningSubs.data ?? []).forEach((r: any) => rows.push({
        id: r.id, service: "cleaning", serviceLabel: "Cleaning", ServiceIcon: SparklesIcon,
        // Cleaning carries no customer_name of its own — a company booking's
        // name lives on the client record, so pass the client through.
        userLabel: label(r.user_id, null, r.client_id),
        amountCents: Number(r.total_price_cents) || Number(r.monthly_price_cents) || 0,
        createdAt: r.created_at,
      }));
      (foodSubs.data ?? []).forEach((r: any) => rows.push({
        id: r.id, service: "food", serviceLabel: "Food", ServiceIcon: UtensilsCrossed,
        userLabel: label(r.user_id, r.customer_name),
        amountCents: (Number(r.weekly_price_cents) || 0) * (Number(r.commitment_weeks) || 1),
        createdAt: r.created_at,
      }));
      (beachSubs.data ?? []).forEach((r: any) => rows.push({
        id: r.id, service: "beach", serviceLabel: "Beach Club", ServiceIcon: Waves,
        userLabel: label(r.user_id, r.customer_name),
        amountCents: Number(r.total_cents) || 0,
        createdAt: r.created_at,
      }));

      // Newest-first so a fresh pending sub jumps to the top of the queue
      // — the admin's "just came in" is what they want to see first.
      return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);
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
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["admin-recent-activity-subscriptions"],
    queryFn: async () => {
      const [cleaningSubs, foodSubs, beachSubs] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions").select("id, user_id, client_id, payment_status, total_price_cents, monthly_price_cents, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("food_subscriptions").select("id, user_id, status, customer_name, weekly_price_cents, commitment_weeks, created_at").order("created_at", { ascending: false }).limit(6),
        supabaseDb.from("provider_subscriptions").select("id, user_id, status, payment_status, created_at, total_cents:price_cents, customer_name:metadata->>customer_name").eq("source_service_key", "beach").order("created_at", { ascending: false }).limit(6),
      ]);

      const userIds = [...new Set([
        ...(cleaningSubs.data ?? []).map((r: any) => r.user_id),
        ...(foodSubs.data ?? []).map((r: any) => r.user_id),
        ...(beachSubs.data ?? []).map((r: any) => r.user_id),
      ].filter(Boolean))];
      const [usersMap, clientsMap] = await Promise.all([
        fetchUsersByIds(userIds),
        fetchClientNames((cleaningSubs.data ?? []).map((r: any) => r.client_id)),
      ]);
      const nameOf = (uid: string | null, fallback?: string | null, clientId?: string | null) =>
        customerNameFrom({
          user: uid ? usersMap.get(String(uid)) : null,
          customerName: fallback,
          clientName: clientId ? clientsMap.get(String(clientId)) : null,
          fallback: "Customer",
        });

      type Activity = { id: string; service: ServiceKey; tone: "paid" | "pending"; label: string; detail: string; date: string; href: string };
      const out: Activity[] = [];

      (cleaningSubs.data ?? []).forEach((s: any) => out.push({
        id: `csub-${s.id}`, service: "cleaning", tone: s.payment_status === "paid" ? "paid" : "pending",
        label: `${nameOf(s.user_id, null, s.client_id)} — Cleaning subscription`,
        detail: s.payment_status === "paid" ? formatUSD(s.total_price_cents || s.monthly_price_cents || 0) : "Awaiting payment",
        date: s.created_at, href: "/admin/marketplace/subscriptions",
      }));
      (foodSubs.data ?? []).forEach((s: any) => {
        const st = String(s.status ?? "").toLowerCase();
        out.push({
          id: `fsub-${s.id}`, service: "food", tone: st === "pending" ? "pending" : "paid",
          label: `${nameOf(s.user_id, s.customer_name)} — Food subscription`,
          detail: st === "pending" ? "Awaiting payment" : formatUSD((s.weekly_price_cents || 0) * (s.commitment_weeks || 1)),
          date: s.created_at, href: "/admin/marketplace/subscriptions",
        });
      });
      (beachSubs.data ?? []).forEach((s: any) => out.push({
        id: `bsub-${s.id}`, service: "beach", tone: s.payment_status === "paid" ? "paid" : "pending",
        label: `${nameOf(s.user_id, s.customer_name)} — Beach Club membership`,
        detail: s.payment_status === "paid" ? formatUSD(s.total_cents || 0) : "Awaiting payment",
        date: s.created_at, href: "/admin/beach-club/subscriptions",
      }));

      return out
        .filter((a) => a.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 8);
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
          <SectionTitle title="Awaiting payment" count={pendingQueue.length} />
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
        <SectionTitle title="By service" />
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
        <SectionTitle title="Recent activity" count={recentActivity.length} />
        {recentActivity.length === 0 ? (
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

/**
 * A section title, at the size the platform gives one — 20px semibold. The
 * eyebrow this replaces (11px uppercase grey) is the design's `overline` role,
 * which labels a field group; using it as a heading is what made every section
 * here read as fine print.
 */
function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-foreground">{title}</h2>
      {count != null && count > 0 && (
        <span className="text-[12px] tabular-nums tracking-[-0.24px] text-muted-foreground">{count}</span>
      )}
    </div>
  );
}

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
