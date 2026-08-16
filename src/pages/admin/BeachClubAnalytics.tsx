import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, Waves, CheckCircle2, Clock, XCircle } from "lucide-react";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import {
  AnalyticsShell, KpiCard, StatusBar,
} from "@/components/admin/analytics/AnalyticsPrimitives";
import { PageLoader } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";

interface BeachSub {
  id: string;
  plan_name: string | null;
  /** Read out of the row's metadata, so json until it is counted. */
  people: number | string | null;
  total_cents: number | null;
  payment_status: string | null;
  status: string;
  created_at: string;
}

export default function BeachClubAnalytics({ embedded = false }: { embedded?: boolean }) {
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-beach-club-analytics"],
    queryFn: async () => {
      // Paged — these rows are reduced into revenue/count figures and
      // PostgREST truncates a plain select at 1000 rows without erroring.
      // The generated row type cannot express an aliased json path, so the
      // shape is asserted here rather than fought with at every call site.
      return await fetchAllRows<BeachSub>(() => supabaseDb
        .from("provider_subscriptions")
        .select("id, payment_status, status, created_at, plan_name:metadata->>plan_name, people:metadata->people, total_cents:price_cents")
        .eq("source_service_key", "beach").order("id") as never);
    },
  });

  if (isLoading) {
    return (
      <AnalyticsShell embedded={embedded} title="Beach Club — Analytics">
        <PageLoader />
      </AnalyticsShell>
    );
  }

  const paid = subs.filter((s) => s.payment_status === "paid");
  // "Active" means paid AND active — same definition as "Total People" below
  // and as Dashboard/Finance. Counting status alone let unpaid rows show up as
  // active memberships here while the headcount tile beside it excluded them:
  // two numbers, two definitions, 10px apart.
  const active = paid.filter((s) => s.status === "active");
  const pending = subs.filter((s) => s.status === "pending");
  const cancelled = subs.filter((s) => s.status === "cancelled");

  const totalRevenueCents = paid.reduce((sum, s) => sum + (s.total_cents ?? 0), 0);
  // "Total People" is a live-membership headcount, so only paid + active
  // members count. Including cancelled/pending rows inflated the number and
  // disagreed with every other tile on this page.
  const totalMembers = active.reduce((sum, s) => sum + (Number(s.people) || 0), 0);
  const avgOrderCents = paid.length ? Math.round(totalRevenueCents / paid.length) : 0;

  // Revenue for the current month.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenueCents = paid
    .filter((s) => new Date(s.created_at) >= monthStart)
    .reduce((sum, s) => sum + (s.total_cents ?? 0), 0);

  // Revenue per plan.
  const planStats: Record<string, { subs: number; revenue: number }> = {};
  for (const s of paid) {
    const key = s.plan_name || "—";
    (planStats[key] ??= { subs: 0, revenue: 0 });
    planStats[key].subs += 1;
    planStats[key].revenue += s.total_cents ?? 0;
  }
  const planRows = Object.entries(planStats).sort((a, b) => b[1].revenue - a[1].revenue);

  if (subs.length === 0) {
    return (
      <AnalyticsShell embedded={embedded} title="Beach Club — Analytics">
        <div className="rounded-2xl bg-card p-10 text-center text-muted-foreground">
          <Waves className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No memberships yet — analytics will populate as people subscribe.
        </div>
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell embedded={embedded} title="Beach Club — Analytics">
      <div className="space-y-6">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={TrendingUp} label="Total Revenue" value={formatUSD(totalRevenueCents)} accent="text-green-400" />
          <KpiCard icon={Waves} label="Active Memberships" value={String(active.length)} accent="text-cyan-400" />
          <KpiCard icon={Users} label="Total People" value={String(totalMembers)} accent="text-violet-400" />
          <KpiCard icon={TrendingUp} label="Avg Order" value={formatUSD(avgOrderCents)} accent="text-blue-400" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Status breakdown */}
          <div className="space-y-4 rounded-2xl bg-card p-5">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <Waves className="h-5 w-5 text-cyan-400" /> Membership Status
            </h2>
            <div className="space-y-3">
              <StatusBar label="Active" icon={<CheckCircle2 className="h-3.5 w-3.5" />} count={active.length} total={subs.length} color="bg-green-500" textColor="text-green-400" />
              <StatusBar label="Pending" icon={<Clock className="h-3.5 w-3.5" />} count={pending.length} total={subs.length} color="bg-yellow-500" textColor="text-yellow-400" />
              <StatusBar label="Cancelled" icon={<XCircle className="h-3.5 w-3.5" />} count={cancelled.length} total={subs.length} color="bg-muted-foreground" textColor="text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between border-t border-border/60 pt-3 text-sm">
              <span className="text-muted-foreground">Revenue this month</span>
              <span className="font-black tabular-nums text-foreground">{formatUSD(monthRevenueCents)}</span>
            </div>
          </div>

          {/* Revenue by plan */}
          <div className="space-y-4 rounded-2xl bg-card p-5">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <TrendingUp className="h-5 w-5 text-green-400" /> Revenue by Plan
            </h2>
            {planRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid memberships yet.</p>
            ) : (
              <div className="space-y-2">
                {planRows.map(([name, st]) => (
                  <div key={name} className="flex items-center justify-between gap-4 rounded-xl bg-muted/40 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{name}</p>
                      <p className="text-xs text-muted-foreground">{st.subs} membership{st.subs !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="shrink-0 font-black tabular-nums text-foreground">{formatUSD(st.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </AnalyticsShell>
  );
}
