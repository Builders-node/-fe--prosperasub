import { Link } from "react-router-dom";
import { ArrowUpRight, Car, CheckCircle2, Package } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { changeLabel, fetchPlatformRollup, periodFigures, type NormRow } from "@/lib/analytics/platformRollup";
import { PeriodPicker } from "@/components/admin/analytics/PeriodPicker";
import {
  getServiceIndex, serviceLabelOf, serviceOfSale, VEHICLES_KEY, type ServiceIndex,
} from "@/lib/analytics/serviceIndex";
import { resolveCategoryIcon } from "@/lib/services/categoryIcons";
import type { LucideIcon } from "lucide-react";

import { useRollupPeriod } from "@/hooks/useRollupPeriod";
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
import { PaymentMethodBadge, PaymentReference } from "@/components/admin/PaymentMethodBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { adminRoutes } from "@/config/adminRoutes";
import { fetchApplications } from "@/lib/admin/providerApplications";

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


const serviceIndex = getServiceIndex;

/** The service a sale counts under (Settings → Services), with its icon. */
function serviceView(r: { service: string; provider_id?: string | null }, index: ServiceIndex) {
  const key = serviceOfSale(r, index);
  const icon = index.byKey.get(key)?.icon;
  return {
    key,
    label: serviceLabelOf(key, index),
    icon: key === VEHICLES_KEY ? Car : icon ? resolveCategoryIcon(icon) : Package,
  };
}

interface PendingRow {
  id: string;
  service: ApproveService;
  serviceLabel: string;
  ServiceIcon: LucideIcon;
  userLabel: string;
  amountCents: number;
  createdAt: string;
  method: string | null;
  reference: string | null;
}

/** A row of `subscriptions_unified`, as this page reads it. */
interface UnifiedSubRow {
  id: string;
  service: string;
  provider_id?: string | null;
  user_id: string | null;
  price_cents: number | null;
  paid?: boolean;
  payment_status?: string | null;
  status?: string | null;
  created_at: string;
  payment_method?: string | null;
  payment_reference?: string | null;
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
  // Revenue and sales follow the period; users, active and awaiting are "now".
  const [period, setPeriod] = useRollupPeriod("7d");

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

      // One tile per service the admin knows (Settings → Services, plus
      // Vehicles) — not per table the sales happen to be stored in.
      const services = rollup.services.map((s) => ({
        key: s.key,
        label: s.label,
        active: s.active,
        icon: s.key === VEHICLES_KEY ? Car : resolveCategoryIcon(rollup.index.byKey.get(s.key)?.icon ?? null),
      }));

      return {
        users: usersRes.count || 0,
        revenueCents: rollup.totals.revenueCents,
        activeSubs: rollup.totals.active,
        pending: rollup.totals.awaitingPayment,
        services,
        rows: rollup.rows as NormRow[],
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
        .select("id, service, provider_id, user_id, price_cents, payment_status, status, created_at, payment_method, payment_reference")
        .neq("payment_status", "paid").neq("payment_status", "refunded")
        .not("status", "in", "(cancelled,expired)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      const rows = (data ?? []) as UnifiedSubRow[];
      const [nameOf, index] = await Promise.all([unifiedNames(rows), serviceIndex()]);
      return rows.map((r) => {
        const view = serviceView(r, index);
        return {
          id: r.id,
          // Approval writes to the row's own table, so it keeps the source.
          service: (["cleaning", "food", "beach", "plan", "cars"].includes(r.service) ? r.service : "plan") as ApproveService,
          serviceLabel: view.label,
          ServiceIcon: view.icon,
          userLabel: nameOf(r),
          amountCents: Number(r.price_cents) || 0,
          createdAt: r.created_at,
          method: r.payment_method ?? null,
          reference: r.payment_reference ?? null,
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

  // Which payment to approve — always through a confirm that shows HOW it was
  // paid. One tap used to turn any pending row into revenue, including a
  // Lightning or PayPal checkout that was abandoned before paying.
  const [approving, setApproving] = useState<PendingRow | null>(null);
  const autoChecked = (m: string | null) => m === "lightning" || m === "onchain" || m === "paypal" || m === "crypto_gateway";

  /**
   * Everything else that is waiting on a person, as counts that open the
   * place to act. Each is hidden at zero, so a quiet day shows nothing here.
   */
  const { data: needs } = useQuery({
    queryKey: ["super-admin-needs-you"],
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date();
      const inTwo = new Date(today.getTime() + 2 * 86400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
        const { count: c, error } = await q;
        return error ? 0 : c ?? 0;
      };
      const [applications, payouts, support, expiring, drafts, ready] = await Promise.all([
        fetchApplications({ status: "pending" }).then((r) => r.length).catch(() => 0),
        count(supabaseDb.from("provider_payouts").select("id", { count: "exact", head: true }).in("status", ["requested", "approved"])),
        count(supabaseDb.from("support_messages").select("id", { count: "exact", head: true }).eq("status", "new")),
        count(supabaseDb.from("subscriptions_unified").select("id", { count: "exact", head: true })
          .eq("status", "active").gte("ends_on", iso(today)).lte("ends_on", iso(inTwo))),
        count(supabaseDb.from("providers").select("id", { count: "exact", head: true }).eq("status", "draft")),
        // Owners who pressed "Ready for review" — the next one to put live.
        count(supabaseDb.from("providers").select("id", { count: "exact", head: true })
          .neq("status", "active").not("review_requested_at", "is", null)),
      ]);
      return { applications, payouts, support, expiring, drafts, ready };
    },
  });
  const needItems = [
    { key: "applications", label: "Applications to review", value: needs?.applications ?? 0, href: adminRoutes.superAdminProviderApplications },
    { key: "payouts", label: "Payouts to send", value: needs?.payouts ?? 0, href: `${adminRoutes.superAdminPayments}?tab=payouts` },
    { key: "support", label: "New support messages", value: needs?.support ?? 0, href: adminRoutes.superAdminSupport },
    { key: "expiring", label: "Ending in 2 days", value: needs?.expiring ?? 0, href: "/admin/marketplace/subscriptions?ending=2" },
    { key: "ready", label: "Ready for review", value: needs?.ready ?? 0, href: `${adminRoutes.superAdminMarketplaceProviders}?status=draft` },
    { key: "drafts", label: "Businesses in draft", value: needs?.drafts ?? 0, href: `${adminRoutes.superAdminMarketplaceProviders}?status=draft` },
  ].filter((n) => n.value > 0);

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
        .select("id, service, provider_id, user_id, price_cents, paid, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      const rows = (data ?? []) as UnifiedSubRow[];
      const [nameOf, index] = await Promise.all([unifiedNames(rows), serviceIndex()]);
      return rows
        .filter((r) => r.created_at)
        .map((r) => {
          const view = serviceView(r, index);
          return {
            id: `${r.service}-${r.id}`,
            Icon: view.icon,
            tone: r.paid ? ("paid" as const) : ("pending" as const),
            label: `${nameOf(r)} — ${view.label}`,
            detail: r.paid ? formatUSD(Number(r.price_cents) || 0) : "Awaiting payment",
            date: r.created_at,
            href: "/admin/marketplace/subscriptions",
          };
        });
    },
  });

  const allRows = stats?.rows ?? [];
  const pf = periodFigures(allRows, period);
  const pfByService = (key: string) => periodFigures(allRows.filter((r) => r.service === key), period);

  return (
    <SuperAdminLayout title="Today" subtitle="What needs you, then how the platform is doing">
      {/*
        Written in the platform's own vocabulary rather than an admin dialect —
        see DESIGN.md §3 and §4. Three type sizes carry the page (20 / 16 / 12,
        semibold, negative tracking), hierarchy comes from layered backgrounds
        rather than borders and tints, and a card is 16px.

        The two habits that made this screen read as a different product were a
        tiny uppercase eyebrow standing in for a section title, and rows welded
        into one slab by hairline dividers. Both are gone.
      */}

      {/* What is waiting on a person — first, because it is why you opened this. */}
      {needItems.length > 0 && (
        <section className="mb-8">
          <YdSectionHeading title="Needs you" />
          <div className="space-y-1 rounded-radius-lg bg-card p-1.5">
            {needItems.map((n) => (
              <Link key={n.key} to={n.href}
                className="flex items-center justify-between gap-3 rounded-radius-md p-3 transition-colors hover:bg-inset">
                <span className="text-title font-semibold text-foreground">{n.label}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-body font-semibold tabular-nums text-primary">{n.value}</span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Headline metrics. Colour lives on the NUMBER, never on the card: a
          tinted panel is a second background, and this design has one. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <YdSectionHeading title="How it's going" className="mb-0" />
        <PeriodPicker value={period} onChange={setPeriod} className="max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile label="Revenue" value={formatUSD(pf.revenueCents)}
          href={`/admin/analytics?period=${period}`} accent change={period === "all" ? undefined : changeLabel(pf.revenueCents, pf.prevRevenueCents)} />
        <MetricTile label="Sales" value={String(pf.sales)}
          href={`/admin/analytics?period=${period}`} change={period === "all" ? undefined : changeLabel(pf.sales, pf.prevSales)} />
        <MetricTile label="Users" value={String(stats?.users ?? 0)} href="/admin/users" />
        <MetricTile
          label="Awaiting payment"
          value={String(stats?.pending ?? 0)}
          href="/admin/marketplace/subscriptions?status=pending"
          warning={(stats?.pending ?? 0) > 0}
        />
      </div>

      {/* The top daily workflow: approve inline rather than navigate into a
          list, find the row, open a menu. Hidden entirely on a quiet day. */}
      {pendingQueue.length > 0 && (
        <section className="mt-8">
          <YdSectionHeading
            title={(stats?.pending ?? 0) > pendingQueue.length
              ? `Awaiting payment · latest ${pendingQueue.length} of ${stats?.pending}`
              : "Awaiting payment"}
            count={(stats?.pending ?? 0) > pendingQueue.length ? undefined : pendingQueue.length}
          />
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
                    <p className="truncate text-title font-semibold text-foreground">
                      {row.userLabel} · {row.serviceLabel}
                    </p>
                    <p className="mt-0.5 text-meta text-muted-foreground">
                      {format(new Date(row.createdAt), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <span className="shrink-0 text-title font-semibold tabular-nums text-primary">
                    {formatUSD(row.amountCents)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-2 shrink-0 gap-1.5 font-semibold"
                    disabled={approve.isPending}
                    onClick={() => setApproving(row)}
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

      <AlertDialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {approving ? formatUSD(approving.amountCents) : ""} as paid?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{approving?.userLabel} · {approving?.serviceLabel}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <PaymentMethodBadge method={approving?.method} />
                  {approving?.reference
                    ? <PaymentReference method={approving.method} reference={approving.reference} />
                    : <span className="text-meta">No payment reference</span>}
                </div>
                {approving && autoChecked(approving.method) && (
                  <p className="text-attention">
                    This method is checked automatically. Approve only if you received the money another way —
                    an abandoned checkout looks exactly like this row.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (approving) approve.mutate(approving); setApproving(null); }}>
              Mark paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Per-service breakdown. */}
      <section className="mt-8">
        <YdSectionHeading title="By service" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(stats?.services ?? []).map((st) => {
            const key = st.key;
            const meta = { label: st.label };
            const sp = pfByService(key);
            const Icon = st.icon;
            return (
              <Link
                key={key}
                to={`/admin/analytics?service=${key}`}
                className="group flex min-w-0 flex-col gap-3 rounded-radius-md bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span className="truncate text-title font-semibold text-foreground">
                    {meta.label}
                  </span>
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-heading font-semibold tabular-nums text-foreground">
                      {formatUSD(sp.revenueCents)}
                    </p>
                    <p className="text-meta text-muted-foreground">Revenue</p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-heading font-semibold tabular-nums text-foreground">
                      {st?.active ?? 0}
                    </p>
                    <p className="text-meta text-muted-foreground">Active</p>
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
            <p className="text-title font-semibold text-foreground">No activity yet</p>
            <p className="mt-1 text-meta text-muted-foreground">
              Sales across every service appear here as they happen.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((a: any) => {
              const Icon = a.Icon;
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
                    <p className="truncate text-title font-semibold text-foreground">{a.label}</p>
                    <p className="mt-0.5 text-meta text-muted-foreground">
                      {format(new Date(a.date), "MMM d, yyyy · h:mm a")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-title font-semibold tabular-nums",
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
  label, value, href, accent, warning, className, change,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
  warning?: boolean;
  className?: string;
  change?: { text: string; up: boolean } | null;
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
        <span className="truncate text-meta text-muted-foreground">{label}</span>
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
      {change !== undefined && (
        <p className={cn("text-meta", change ? (change.up ? "text-positive" : "text-negative") : "text-muted-foreground")}>
          {change ? `${change.text} vs previous` : "No earlier sales"}
        </p>
      )}
    </Link>
  );
}

export default AdminDashboard;
