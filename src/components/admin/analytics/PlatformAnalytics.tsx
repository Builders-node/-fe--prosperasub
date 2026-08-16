import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowUpRight, BarChart3, Clock, Layers, TrendingUp, Users,
} from "lucide-react";
import {
  KpiCard, RankedBarList, StackedRevenueChart, StatItem, StatusBar,
} from "@/components/admin/analytics/AnalyticsPrimitives";
import { PageLoader } from "@/components/ui/spinner";
import { fetchPlatformRollup, type RollupServiceKey } from "@/lib/analytics/platformRollup";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";

/**
 * The platform, as one set of figures.
 *
 * "All services" used to be the three per-service pages stacked — twelve KPI
 * tiles, three revenue charts, and no answer to the only question the option
 * actually asks: how is the whole marketplace doing. Every number here comes
 * from `fetchPlatformRollup`, the same reduce the Overview runs, so the two
 * pages cannot drift; a single service is still one click away in the picker.
 */

// One accent across the admin (see FinanceBreakdown) — services are separated
// by weight of the same primary, not by a colour each.
const SERIES_TINT: Record<RollupServiceKey, string> = {
  cleaning: "bg-primary",
  food: "bg-primary/60",
  beach: "bg-primary/30",
};

export function PlatformAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });

  if (isLoading || !data) return <PageLoader />;

  const { totals, services, months } = data;
  const monthLabel = format(nowHN(), "MMMM");
  const avgPerSubCents = totals.subs > 0 ? Math.round(totals.revenueCents / totals.subs) : 0;

  return (
    <div className="space-y-space-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Total Revenue" value={formatUSD(totals.revenueCents)} accent="text-green-400" />
        <KpiCard icon={TrendingUp} label={`Revenue — ${monthLabel}`} value={formatUSD(totals.monthRevenueCents)} accent="text-blue-400" />
        <KpiCard icon={Layers} label="Active Subscriptions" value={String(totals.active)} accent="text-yellow-400" />
        <KpiCard icon={Users} label="Customers" value={String(totals.customers)} accent="text-purple-400" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
            <BarChart3 className="h-5 w-5 text-primary" />
            Monthly Revenue (last 6 months)
          </h2>
          <StackedRevenueChart
            months={months}
            series={services.map((s) => ({
              key: s.key, label: s.label, values: s.monthly, barClass: SERIES_TINT[s.key],
            }))}
            formatValue={formatUSD}
          />
        </div>

        <div className="space-y-4 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
            <TrendingUp className="h-5 w-5 text-primary" />
            Revenue by Service
          </h2>
          <RankedBarList
            rows={services.map((s) => ({
              key: s.key,
              label: s.label,
              sublabel: `${s.subs} sub${s.subs !== 1 ? "s" : ""} · ${
                totals.revenueCents > 0 ? Math.round((s.revenueCents / totals.revenueCents) * 100) : 0
              }%`,
              value: s.revenueCents,
            }))}
            formatValue={formatUSD}
            emptyMessage="No revenue on any service yet."
          />
          <div className="flex items-center justify-between border-t border-border pt-3 text-[16px] leading-[22px]">
            <span className="text-muted-foreground">Avg revenue / subscription</span>
            <span className="font-semibold tabular-nums text-foreground">{formatUSD(avgPerSubCents)}</span>
          </div>
        </div>
      </div>

      {/* Where every subscription the platform has ever sold stands today. */}
      <div className="space-y-4 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
          <Layers className="h-5 w-5 text-primary" />
          Subscription Status
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <StatusBar label="Active" icon={<Layers className="h-3.5 w-3.5" />} count={totals.active} total={totals.subs} color="bg-green-500" textColor="text-green-400" />
            <StatusBar label="Expired" icon={<Clock className="h-3.5 w-3.5" />} count={totals.expired} total={totals.subs} color="bg-blue-500" textColor="text-blue-400" />
            <StatusBar label="Paused" icon={<Clock className="h-3.5 w-3.5" />} count={totals.paused} total={totals.subs} color="bg-yellow-500" textColor="text-yellow-400" />
            <StatusBar label="Cancelled" icon={<Clock className="h-3.5 w-3.5" />} count={totals.cancelled} total={totals.subs} color="bg-muted-foreground" textColor="text-muted-foreground" />
          </div>
          <dl className="grid h-fit gap-4 sm:grid-cols-2">
            <StatItem label="Total subscriptions" value={String(totals.subs)} />
            <StatItem label="Awaiting payment" value={String(totals.awaitingPayment)} />
          </dl>
        </div>
      </div>

      {/* Every service on one line, so they can be compared rather than
          scrolled past. A row opens that service's own analytics. */}
      <div className="overflow-hidden rounded-radius-lg bg-card tracking-[-0.02em]">
        <h2 className="p-4 text-[20px] font-semibold leading-[26px] text-foreground">By service</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[16px] leading-[22px]">
            <thead>
              <tr className="border-y border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-normal">Service</th>
                <th className="px-4 py-2 text-right font-normal">Revenue</th>
                <th className="px-4 py-2 text-right font-normal">{monthLabel}</th>
                <th className="px-4 py-2 text-right font-normal">Active</th>
                <th className="px-4 py-2 text-right font-normal">Subs</th>
                <th className="px-4 py-2 text-right font-normal">Customers</th>
                <th className="px-4 py-2 text-right font-normal">Awaiting</th>
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {services.map((s) => (
                <tr key={s.key} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link to={`/admin/analytics?service=${s.key}`} className="font-semibold text-foreground">
                      {s.label}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatUSD(s.revenueCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatUSD(s.monthRevenueCents)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.active}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.subs}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.customers}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${s.awaitingPayment > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                    {s.awaitingPayment}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/analytics?service=${s.key}`} aria-label={`Open ${s.label} analytics`}>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[14px] leading-[20px] text-muted-foreground">
        Revenue counts each paid, non-cancelled subscription at its full committed
        value, in the month it was sold — the same rule as the Overview. Active
        means paid and running today (Honduras time).
      </p>
    </div>
  );
}

export default PlatformAnalytics;
