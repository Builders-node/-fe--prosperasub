import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  TrendingUp, Users, BarChart3, ChefHat,
  RefreshCw, Pause, XCircle, BookOpen, MapPin,
} from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFoodRestaurant } from "@/hooks/useFoodRestaurant";
import { formatUSD } from "@/lib/pricing";
import { effectiveFoodStatus } from "@/lib/subscriptionLifecycle";
import { todayHN } from "@/lib/timezone";
import type { FoodSubscription, FoodMealPlan, FoodProvider } from "@/types/food";

const FoodAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const Wrap = ({ children }: { children?: any }) =>
    embedded ? <>{children}</> : <SuperAdminLayout title="Food — Analytics">{children}</SuperAdminLayout>;
  const { restaurants, selectedId, select } = useFoodRestaurant();

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["admin-food-analytics-subscriptions", selectedId],
    queryFn: async () => {
      let q = supabaseDb.from("food_subscriptions").select("*");
      if (selectedId !== "all") q = q.eq("provider_id", selectedId);
      const { data, error } = await q;
      if (error) throw error;
      // Derive effective status so "active" excludes end_date-past rows even
      // before the daily expire-sweep cron flips them.
      const today = todayHN();
      return (data ?? []).map((s: FoodSubscription) => ({
        ...s,
        status: effectiveFoodStatus(s, today) as FoodSubscription["status"],
      })) as FoodSubscription[];
    },
    enabled: true,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-food-analytics-plans"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("food_meal_plans").select("*");
      if (error) throw error;
      return (data ?? []) as FoodMealPlan[];
    },
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["admin-food-analytics-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb.from("food_providers").select("*");
      if (error) throw error;
      return (data ?? []) as FoodProvider[];
    },
  });

  // Tips collected (paid), scoped to the selected restaurant.
  const { data: tipsCents = 0 } = useQuery({
    queryKey: ["admin-food-tips-total", selectedId],
    queryFn: async () => {
      let q = supabaseDb.from("food_tips").select("amount_cents").eq("payment_status", "paid");
      if (selectedId !== "all") q = q.eq("provider_id", selectedId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((s: number, t: any) => s + (t.amount_cents || 0), 0);
    },
  });

  // ─── Derived stats ────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const pausedSubs = subscriptions.filter((s) => s.status === "paused");
  const cancelledSubs = subscriptions.filter((s) => s.status === "cancelled");

  // MRR = weekly_price × 4.33 weeks/month for active subs
  const mrrCents = activeSubs.reduce(
    (s, sub) => s + Math.round(sub.weekly_price_cents * 4.33),
    0,
  );

  // Total revenue = weekly_price × commitment_weeks × paid periods (renewals
  // count too). Pending subscriptions are unconfirmed payments, so they don't count yet.
  const countsAsRevenue = (status: string) => status !== "cancelled" && status !== "pending";
  const periodsOf = (sub: any) => (Number(sub.periods_paid) || 1);
  const revenueOf = (sub: any) => sub.weekly_price_cents * ((sub as any).commitment_weeks ?? 1) * periodsOf(sub);

  const totalRevenueCents = subscriptions
    .filter((s) => countsAsRevenue(s.status))
    .reduce((s, sub) => s + revenueOf(sub), 0);

  // This month's new subs
  const monthSubs = subscriptions.filter((s) => {
    const d = parseISO(s.created_at);
    return d >= thisMonthStart && d <= thisMonthEnd;
  });
  const monthRevenueCents = monthSubs.reduce((s, sub) => s + revenueOf(sub), 0);

  // Average weekly price
  const avgWeeklyCents =
    activeSubs.length > 0
      ? Math.round(activeSubs.reduce((s, sub) => s + sub.weekly_price_cents, 0) / activeSubs.length)
      : 0;

  // Churn rate: cancelled / total
  const churnRate = subscriptions.length > 0
    ? ((cancelledSubs.length / subscriptions.length) * 100).toFixed(1)
    : "0";

  // ─── Plan performance ─────────────────────────────────────────────────────
  const planStats: Record<string, { name: string; provider: string; subs: number; revenue: number }> = {};
  plans.forEach((p) => {
    const providerName = providers.find((pr) => pr.id === p.provider_id)?.name ?? "—";
    planStats[p.id] = { name: p.name, provider: providerName, subs: 0, revenue: 0 };
  });
  subscriptions.forEach((s) => {
    if (s.meal_plan_id && planStats[s.meal_plan_id]) {
      planStats[s.meal_plan_id].subs++;
      if (countsAsRevenue(s.status)) {
        planStats[s.meal_plan_id].revenue += revenueOf(s);
      }
    }
  });
  const planList = Object.entries(planStats)
    .map(([id, p]) => ({ id, ...p }))
    .filter((p) => p.subs > 0 || selectedId === "all")
    .sort((a, b) => b.subs - a.subs);

  // ─── Restaurant performance ───────────────────────────────────────────────
  const restaurantStats: Record<string, { name: string; subs: number; revenue: number }> = {};
  providers.forEach((p) => {
    restaurantStats[p.id] = { name: p.name, subs: 0, revenue: 0 };
  });
  subscriptions.forEach((s) => {
    if (!restaurantStats[s.provider_id]) {
      restaurantStats[s.provider_id] = { name: "Unknown", subs: 0, revenue: 0 };
    }
    restaurantStats[s.provider_id].subs++;
    if (countsAsRevenue(s.status)) {
      restaurantStats[s.provider_id].revenue += revenueOf(s);
    }
  });
  const restaurantList = Object.entries(restaurantStats)
    .map(([id, p]) => ({ id, ...p }))
    .filter((r) => r.subs > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Location (residence) performance ─────────────────────────────────────
  const NO_LOCATION = "No location";
  const locationStats: Record<string, { subs: number; active: number; revenue: number }> = {};
  subscriptions.forEach((s) => {
    const key = ((s as any).residence || "").trim() || NO_LOCATION;
    const a = (locationStats[key] ??= { subs: 0, active: 0, revenue: 0 });
    a.subs++;
    if (s.status === "active") a.active++;
    if (countsAsRevenue(s.status)) a.revenue += revenueOf(s);
  });
  const locationList = Object.entries(locationStats)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxLocationRev = Math.max(...locationList.map((l) => l.revenue), 1);

  // ─── Monthly revenue (last 6 months) ──────────────────────────────────────
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    const label = format(d, "MMM");
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const rev = subscriptions
      .filter((s) => {
        const sd = parseISO(s.created_at);
        return sd >= start && sd <= end;
      })
      .reduce((sum, s) => sum + revenueOf(s), 0);
    return { label, rev };
  });
  const maxRev = Math.max(...last6.map((m) => m.rev), 1);

  if (isLoading) {
    return (
      <Wrap>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="space-y-6">
        {restaurants.length > 1 && (
          <div className="flex justify-end">
            <Select value={selectedId} onValueChange={select}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All Restaurants" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Restaurants</SelectItem>
                {restaurants.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={TrendingUp} label="MRR" value={formatUSD(mrrCents)} accent="text-green-400" />
          <KpiCard icon={RefreshCw} label="Active Subscriptions" value={String(activeSubs.length)} accent="text-orange-400" />
          <KpiCard icon={TrendingUp} label={`Revenue — ${format(now, "MMMM")}`} value={formatUSD(monthRevenueCents)} accent="text-blue-400" />
          <KpiCard icon={Users} label="Avg Weekly Price" value={formatUSD(avgWeeklyCents)} accent="text-purple-400" />
        </div>

        {/* Status breakdown + Monthly chart */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Subscription status */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <RefreshCw className="h-5 w-5 text-orange-400" />
              Subscription Status
            </h2>
            <div className="space-y-3">
              <StatusBar
                label="Active"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                count={activeSubs.length}
                total={subscriptions.length}
                color="bg-green-500"
                textColor="text-green-400"
              />
              <StatusBar
                label="Paused"
                icon={<Pause className="h-3.5 w-3.5" />}
                count={pausedSubs.length}
                total={subscriptions.length}
                color="bg-yellow-500"
                textColor="text-yellow-400"
              />
              <StatusBar
                label="Cancelled"
                icon={<XCircle className="h-3.5 w-3.5" />}
                count={cancelledSubs.length}
                total={subscriptions.length}
                color="bg-muted-foreground"
                textColor="text-muted-foreground"
              />
            </div>
            <div className="border-t border-border pt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Churn rate</span>
              <span className="font-bold text-foreground">{churnRate}%</span>
            </div>
          </div>

          {/* Monthly revenue bar chart */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <BarChart3 className="h-5 w-5 text-orange-400" />
              Revenue (last 6 months)
            </h2>
            <div className="flex items-end gap-3 h-36">
              {last6.map(({ label, rev }) => (
                <div key={label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-orange-500/60 transition-all hover:bg-orange-500"
                    style={{ height: `${Math.max(4, (rev / maxRev) * 100)}%` }}
                    title={formatUSD(rev)}
                  />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total committed revenue</span>
              <span className="font-bold text-orange-400">{formatUSD(totalRevenueCents)}</span>
            </div>
          </div>
        </div>

        {/* Plan + Restaurant performance */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Plan performance */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <BookOpen className="h-5 w-5 text-orange-400" />
              Top Meal Plans
            </h2>
            {planList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
            ) : (
              <div className="space-y-3">
                {planList.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.provider}</p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{
                            width: `${
                              planList.length > 0 && planList[0].subs > 0
                                ? (p.subs / planList[0].subs) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-foreground">{p.subs} sub{p.subs !== 1 ? "s" : ""}</p>
                      <p className="text-xs text-muted-foreground">{formatUSD(p.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Restaurant performance */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <ChefHat className="h-5 w-5 text-orange-400" />
              Restaurants
            </h2>
            {restaurantList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {restaurantList.map((r) => (
                  <div key={r.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{
                            width: `${
                              restaurantList.length > 0 && restaurantList[0].revenue > 0
                                ? (r.revenue / restaurantList[0].revenue) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-foreground">{r.subs} sub{r.subs !== 1 ? "s" : ""}</p>
                      <p className="text-xs text-muted-foreground">{formatUSD(r.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* By location */}
        {locationList.length > 0 && (
          <div className="rounded-2xl bg-card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-black text-foreground">
              <MapPin className="h-4 w-4 text-orange-400" /> Revenue by location
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Where subscriptions are delivered{selectedId !== "all" ? " (this restaurant)" : " (all restaurants)"}.
            </p>
            <div className="space-y-3">
              {locationList.map((l) => (
                <div key={l.name} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{l.name}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-orange-500 transition-all"
                        style={{ width: `${(l.revenue / maxLocationRev) * 100}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-foreground">{formatUSD(l.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{l.subs} sub{l.subs !== 1 ? "s" : ""} · {l.active} active</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="rounded-2xl bg-card p-5">
          <h2 className="mb-4 font-black text-foreground">Overview</h2>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatItem label="Total Subs" value={String(subscriptions.length)} />
            <StatItem label="Active" value={String(activeSubs.length)} />
            <StatItem label="Paused" value={String(pausedSubs.length)} />
            <StatItem label="Cancelled" value={String(cancelledSubs.length)} />
            <StatItem label="This Month" value={String(monthSubs.length)} />
            <StatItem label="Churn" value={`${churnRate}%`} />
            <StatItem label="Tips collected" value={formatUSD(tipsCents)} />
          </dl>
        </div>
      </div>
    </Wrap>
  );
};

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
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

function StatusBar({
  label,
  icon,
  count,
  total,
  color,
  textColor,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  total: number;
  color: string;
  textColor: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className={`flex items-center gap-1.5 font-medium ${textColor}`}>
          {icon} {label}
        </span>
        <span className="font-bold text-foreground">
          {count} <span className="text-xs font-normal text-muted-foreground">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[hsl(var(--app-rail))] p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-black text-foreground">{value}</dd>
    </div>
  );
}

export default FoodAnalytics;
