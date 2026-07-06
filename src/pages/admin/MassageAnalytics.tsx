import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, HeartPulse, Heart } from "lucide-react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const MassageAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const Wrap = ({ children }: { children?: any }) =>
    embedded ? <>{children}</> : <SuperAdminLayout title="Massage — Analytics">{children}</SuperAdminLayout>;

  const { data: subs = [] } = useQuery({
    queryKey: ["massage-analytics-subs"],
    queryFn: async () => {
      const { data } = await supabaseDb.from("massage_subscriptions").select("*, massage_providers(name)");
      return (data ?? []) as any[];
    },
  });
  const { data: tips = [] } = useQuery({
    queryKey: ["massage-analytics-tips"],
    queryFn: async () => {
      const { data } = await supabaseDb.from("massage_tips").select("amount_cents").eq("payment_status", "paid");
      return (data ?? []) as { amount_cents: number }[];
    },
  });

  const countsRevenue = (s: any) => s.status !== "cancelled" && s.status !== "pending";
  const revenueOf = (s: any) => (s.price_cents || 0) * (Number(s.periods_paid) || 1);
  const totalRevenue = subs.filter(countsRevenue).reduce((a, s) => a + revenueOf(s), 0);
  const active = subs.filter((s) => s.status === "active").length;
  const tipsTotal = tips.reduce((a, t) => a + (t.amount_cents || 0), 0);

  const byProvider: Record<string, { name: string; subs: number; revenue: number }> = {};
  subs.forEach((s) => {
    const name = s.massage_providers?.name ?? "—";
    const a = (byProvider[s.provider_id] ??= { name, subs: 0, revenue: 0 });
    a.subs++; if (countsRevenue(s)) a.revenue += revenueOf(s);
  });
  const providerList = Object.values(byProvider).filter((p) => p.subs > 0).sort((a, b) => b.revenue - a.revenue);
  const maxRev = Math.max(...providerList.map((p) => p.revenue), 1);

  return (
    <Wrap>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={TrendingUp} label="Total revenue" value={formatUSD(totalRevenue)} accent />
          <Kpi icon={Users} label="Active subscriptions" value={String(active)} />
          <Kpi icon={HeartPulse} label="Total subscriptions" value={String(subs.length)} />
          <Kpi icon={Heart} label="Tips collected" value={formatUSD(tipsTotal)} />
        </div>

        <div className="rounded-2xl bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-black text-foreground"><HeartPulse className="h-4 w-4 text-rose-400" /> Providers</h2>
          {providerList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {providerList.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${(p.revenue / maxRev) * 100}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-foreground">{formatUSD(p.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{p.subs} sub{p.subs !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Wrap>
  );
};

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-4", accent ? "bg-primary/10" : "bg-card")}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Icon className={cn("h-4 w-4", accent && "text-primary")} />{label}</p>
      <p className={cn("mt-2 text-2xl font-extrabold tracking-tight", accent ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}

export default MassageAnalytics;
