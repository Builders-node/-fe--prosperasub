import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { TrendingUp, Sparkles, CheckCircle2, BarChart3, ClipboardList } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/ui/spinner";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";
import {
  AnalyticsShell, KpiCard, StatItem, MonthlyRevenueChart, RankedBarList,
} from "@/components/admin/analytics/AnalyticsPrimitives";

const isActiveSub = (s: any) =>
  s.payment_status === "paid" &&
  (s.subscription_status === "active" ||
    (s.is_active && !["paused", "cancelled", "expired"].includes(s.subscription_status)));

const CleaningAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["admin-cleaning-analytics-subs"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_subscriptions")
        .select("id, package_id, total_price_cents, monthly_price_cents, payment_status, subscription_status, is_active, created_at")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["admin-cleaning-analytics-packages"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_packages")
        .select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-cleaning-analytics-bookings"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_bookings")
        .select("id, status, created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: completionCount = 0 } = useQuery({
    queryKey: ["admin-cleaning-analytics-completions"],
    queryFn: async () => {
      const { count, error } = await supabaseDb
        .from("cleaning_completion_reports")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: tipsCents = 0 } = useQuery({
    queryKey: ["admin-cleaning-tips-total"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("cleaning_tips").select("amount_cents").eq("payment_status", "paid");
      if (error) throw error;
      return (data ?? []).reduce((s: number, t: any) => s + (t.amount_cents || 0), 0);
    },
  });

  // Month boundaries follow Honduras time — the browser's timezone would
  // roll the month over at the wrong moment for an admin travelling.
  const now = nowHN();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  // Revenue comes from paid subscriptions (full subscription value).
  const paidSubs = subscriptions.filter((s: any) => s.payment_status === "paid");
  const subValue = (s: any) => s.total_price_cents || s.monthly_price_cents || 0;
  const totalRevenueCents = paidSubs.reduce((sum: number, s: any) => sum + subValue(s), 0);

  const monthSubs = paidSubs.filter((s: any) => {
    const d = parseISO(s.created_at);
    return d >= thisMonthStart && d <= thisMonthEnd;
  });
  const monthRevenueCents = monthSubs.reduce((sum: number, s: any) => sum + subValue(s), 0);

  const activeCount = subscriptions.filter(isActiveSub).length;
  const pausedCount = subscriptions.filter((s: any) => s.subscription_status === "paused").length;
  const cancelledCount = subscriptions.filter((s: any) => s.subscription_status === "cancelled").length;

  const upcomingBookings = bookings.filter((b: any) => b.status === "booked").length;
  const completedBookings = bookings.filter((b: any) => b.status === "completed").length;
  const cancelledBookings = bookings.filter((b: any) => b.status === "cancelled").length;

  const avgRevenuePerSub = paidSubs.length > 0 ? totalRevenueCents / paidSubs.length : 0;

  // Revenue + subscription count per plan
  const planStats: Record<string, { name: string; revenue: number; subs: number }> = {};
  packages.forEach((p: any) => {
    planStats[p.id] = { name: p.name, revenue: 0, subs: 0 };
  });
  paidSubs.forEach((s: any) => {
    if (!s.package_id) return;
    if (!planStats[s.package_id]) {
      planStats[s.package_id] = { name: "Unknown plan", revenue: 0, subs: 0 };
    }
    planStats[s.package_id].revenue += subValue(s);
    planStats[s.package_id].subs++;
  });
  const planList = Object.entries(planStats)
    .map(([id, s]) => ({ id, ...s }))
    .filter((p) => p.subs > 0)
    .sort((a, b) => b.subs - a.subs);

  // Monthly revenue for last 6 months
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const start = startOfMonth(d);
    const end = endOfMonth(d);
    const rev = paidSubs
      .filter((s: any) => {
        const sd = parseISO(s.created_at);
        return sd >= start && sd <= end;
      })
      .reduce((sum: number, s: any) => sum + subValue(s), 0);
    return { label: format(d, "MMM"), rev };
  });

  if (loadingSubs) {
    return (
      <AnalyticsShell embedded={embedded} title="Cleaning — Analytics">
        <PageLoader />
      </AnalyticsShell>
    );
  }

  return (
    <AnalyticsShell embedded={embedded} title="Cleaning — Analytics">
      <div className="space-y-space-6">
        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={TrendingUp} label="Total Revenue" value={formatUSD(totalRevenueCents)} accent="text-green-400" />
          <KpiCard icon={TrendingUp} label={`Revenue — ${format(now, "MMMM")}`} value={formatUSD(monthRevenueCents)} accent="text-blue-400" />
          <KpiCard icon={Sparkles} label="Active Subscriptions" value={String(activeCount)} accent="text-yellow-400" />
          <KpiCard icon={CheckCircle2} label="Completed Cleanings" value={String(completionCount)} accent="text-purple-400" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Monthly revenue bar chart */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <BarChart3 className="h-5 w-5 text-primary" />
              Monthly Revenue (last 6 months)
            </h2>
            <MonthlyRevenueChart months={last6} barClass="bg-primary/60" formatValue={formatUSD} />
          </div>

          {/* Plan performance */}
          <div className="rounded-2xl bg-card p-5 space-y-4">
            <h2 className="flex items-center gap-2 font-black text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Plan Performance
            </h2>
            <RankedBarList
              rows={planList.map((p) => ({
                key: p.id,
                label: p.name,
                sublabel: formatUSD(p.revenue),
                value: p.subs,
              }))}
              formatValue={(v) => `${v} sub${v !== 1 ? "s" : ""}`}
              emptyMessage="No subscriptions on any plan yet."
            />
          </div>
        </div>

        {/* Bookings overview */}
        <div className="rounded-2xl bg-card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-black text-foreground">
            <ClipboardList className="h-5 w-5 text-primary" />
            Bookings & Subscriptions Overview
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <StatItem label="Total Subscriptions" value={String(subscriptions.length)} />
            <StatItem label="Active" value={String(activeCount)} />
            <StatItem label="Paused" value={String(pausedCount)} />
            <StatItem label="Cancelled" value={String(cancelledCount)} />
            <StatItem label="Avg Revenue / Sub" value={formatUSD(avgRevenuePerSub)} />
            <StatItem label="Total Bookings" value={String(bookings.length)} />
            <StatItem label="Upcoming" value={String(upcomingBookings)} />
            <StatItem label="Completed" value={String(completedBookings)} />
            <StatItem label="Cancelled Bookings" value={String(cancelledBookings)} />
            <StatItem label="Tips collected" value={formatUSD(tipsCents)} />
          </dl>
        </div>
      </div>
    </AnalyticsShell>
  );
};

export default CleaningAnalytics;
