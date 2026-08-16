import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  TrendingUp, Users, BarChart3, ChefHat,
  RefreshCw, Pause, XCircle, BookOpen, MapPin,
} from "lucide-react";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import {
  AnalyticsShell, KpiCard, StatItem, StatusBar, MonthlyRevenueChart, RankedBarList,
} from "@/components/admin/analytics/AnalyticsPrimitives";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFoodRestaurant } from "@/hooks/useFoodRestaurant";
import { formatUSD } from "@/lib/pricing";
import { effectiveFoodStatus } from "@/lib/subscriptionLifecycle";
import { todayHN, nowHN } from "@/lib/timezone";
import type { FoodSubscription, FoodMealPlan, FoodProvider } from "@/types/food";

const FoodAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const { restaurants, selectedId, select } = useFoodRestaurant();

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ["admin-food-analytics-subscriptions", selectedId],
    queryFn: async () => {
      // Paged — these rows are reduced into revenue/count figures and
      // PostgREST truncates a plain select at 1000 rows without erroring.
      const data = await fetchAllRows<FoodSubscription>(() => {
        let q = supabaseDb.from("food_subscriptions").select("*").order("id");
        if (selectedId !== "all") q = q.eq("provider_id", selectedId);
        return q;
      });
      // Derive effective status so "active" excludes end_date-past rows even
      // before the daily expire-sweep cron flips them.
      const today = todayHN();
      return data.map((s: FoodSubscription) => ({
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
      const rows = await fetchAllRows<any>(() => {
        let q = supabaseDb.from("food_tips").select("amount_cents").eq("payment_status", "paid").order("id");
        if (selectedId !== "all") q = q.eq("provider_id", selectedId);
        return q;
      });
      return rows.reduce((s: number, t: any) => s + (t.amount_cents || 0), 0);
    },
  });

  // ─── Derived stats ────────────────────────────────────────────────────────
  // Anchor "now" to Honduras wall-clock — otherwise MTD boundaries shift for
  // admins in positive-offset timezones and rows created late in the day HN
  // leak into the next month.
  const now = nowHN();
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
  // count too).
  //
  // `payment_status === "paid"` is the ONLY gate that makes this page reconcile
  // with Dashboard and Finance. Subscription status alone is not enough: an
  // Infinita/crypto sub sits at status "active" while payment_status stays
  // "pending" until it's manually confirmed (the reconcile cron only handles
  // Blink lightning/onchain — see CLAUDE.md). Gating on status alone counted
  // those as revenue here but not on the other two pages, so Analytics read
  // higher than Finance for the same period.
  const countsAsRevenue = (sub: any) =>
    sub.payment_status === "paid" && sub.status !== "cancelled";
  const periodsOf = (sub: any) => (Number(sub.periods_paid) || 1);
  const revenueOf = (sub: any) => sub.weekly_price_cents * ((sub as any).commitment_weeks ?? 1) * periodsOf(sub);

  // One filtered list feeds every money figure on this page, so the total, the
  // month tile and the 6-month chart can't drift apart again.
  const revenueSubs = subscriptions.filter(countsAsRevenue);

  const totalRevenueCents = revenueSubs.reduce((s, sub) => s + revenueOf(sub), 0);

  // This month's new subs
  const monthSubs = revenueSubs.filter((s) => {
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
      if (countsAsRevenue(s)) {
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
    if (countsAsRevenue(s)) {
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
    if (countsAsRevenue(s)) a.revenue += revenueOf(s);
  });
  const locationList = Object.entries(locationStats)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Monthly revenue (last 6 months) ──────────────────────────────────────
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i);
    const label = format(d, "MMM");
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const rev = revenueSubs
      .filter((s) => {
        const sd = parseISO(s.created_at);
        return sd >= start && sd <= end;
      })
      .reduce((sum, s) => sum + revenueOf(s), 0);
    return { label, rev };
  });

  if (isLoading) {
    return (
      <AnalyticsShell embedded={embedded} title="Food — Analytics">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell embedded={embedded} title="Food — Analytics">
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
          {/* Revenue over time — second on every service's page. */}
          <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em] space-y-4">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
              <BarChart3 className="h-5 w-5 text-orange-400" />
              Revenue (last 6 months)
            </h2>
            <MonthlyRevenueChart months={last6} barClass="bg-orange-500/60" formatValue={formatUSD} />
            <div className="border-t border-border pt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total committed revenue</span>
              <span className="font-bold text-orange-400">{formatUSD(totalRevenueCents)}</span>
            </div>
          </div>
          {/* Subscription status */}
          <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em] space-y-4">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
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
        </div>

        {/* Plan + Restaurant performance */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Plan performance */}
          <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em] space-y-4">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
              <BookOpen className="h-5 w-5 text-orange-400" />
              Top Meal Plans
            </h2>
            <RankedBarList
              rows={planList.slice(0, 6).map((p) => ({
                key: p.id,
                label: p.name,
                sublabel: `${p.provider} · ${formatUSD(p.revenue)}`,
                value: p.subs,
              }))}
              formatValue={(n) => `${n} sub${n !== 1 ? "s" : ""}`}
              barClass="bg-orange-500"
              emptyMessage="No subscriptions yet."
            />
          </div>

          {/* Restaurant performance */}
          <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em] space-y-4">
            <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
              <ChefHat className="h-5 w-5 text-orange-400" />
              Restaurants
            </h2>
            <RankedBarList
              rows={restaurantList.map((r) => ({
                key: r.id,
                label: r.name,
                sublabel: `${r.subs} sub${r.subs !== 1 ? "s" : ""}`,
                value: r.revenue,
              }))}
              formatValue={formatUSD}
              barClass="bg-orange-500"
              emptyMessage="No data yet."
            />
          </div>
        </div>

        {/* By location */}
        {locationList.length > 0 && (
          <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
            <h2 className="mb-1 flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
              <MapPin className="h-4 w-4 text-orange-400" /> Revenue by location
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Where subscriptions are delivered{selectedId !== "all" ? " (this restaurant)" : " (all restaurants)"}.
            </p>
            <RankedBarList
              rows={locationList.map((l) => ({
                key: l.name,
                label: l.name,
                sublabel: `${l.subs} sub${l.subs !== 1 ? "s" : ""} · ${l.active} active`,
                value: l.revenue,
              }))}
              formatValue={formatUSD}
              barClass="bg-orange-500"
              emptyMessage="No revenue by location yet."
            />
          </div>
        )}

        {/* Summary stats */}
        <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <h2 className="mb-4 text-[20px] font-semibold leading-[26px] text-foreground">Overview</h2>
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
    </AnalyticsShell>
  );
};

export default FoodAnalytics;
