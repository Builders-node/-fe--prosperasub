import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, Waves, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { PageLoader } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";

interface BeachSub {
  id: string;
  plan_name: string | null;
  people: number;
  total_cents: number | null;
  payment_status: string | null;
  status: string;
  created_at: string;
}

export default function BeachClubAnalytics({ embedded = false }: { embedded?: boolean }) {
  const Wrap = ({ children }: { children?: any }) =>
    embedded ? <>{children}</> : <SuperAdminLayout title="Beach Club — Analytics">{children}</SuperAdminLayout>;
  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["admin-beach-club-analytics"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("beach_club_subscriptions")
        .select("id, plan_name, people, total_cents, payment_status, status, created_at");
      if (error) throw error;
      return (data ?? []) as BeachSub[];
    },
  });

  if (isLoading) {
    return (
      <Wrap>
        <PageLoader />
      </Wrap>
    );
  }

  const paid = subs.filter((s) => s.payment_status === "paid");
  const active = subs.filter((s) => s.status === "active");
  const pending = subs.filter((s) => s.status === "pending");
  const cancelled = subs.filter((s) => s.status === "cancelled");

  const totalRevenueCents = paid.reduce((sum, s) => sum + (s.total_cents ?? 0), 0);
  const totalMembers = subs.reduce((sum, s) => sum + (s.people ?? 0), 0);
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

  return (
    <Wrap>
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

        {subs.length === 0 && (
          <div className="rounded-2xl bg-card p-10 text-center text-muted-foreground">
            <Waves className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No memberships yet — analytics will populate as people subscribe.
          </div>
        )}
      </div>
    </Wrap>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: {
  icon: React.FC<{ className?: string }>; label: string; value: string; accent: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-card p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

function StatusBar({ label, icon, count, total, color, textColor }: {
  label: string; icon: React.ReactNode; count: number; total: number; color: string; textColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className={`flex items-center gap-1.5 font-medium ${textColor}`}>{icon}{label}</span>
        <span className="tabular-nums text-muted-foreground">{count} · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
