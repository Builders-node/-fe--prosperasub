import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { AnalyticsView, rankedByRevenue } from "@/components/admin/analytics/AnalyticsView";
import { ANALYTICS_NAMES_KEY, fetchAnalyticsNames } from "@/lib/analytics/names";
import { PageLoader } from "@/components/ui/spinner";
import {
  fetchPlatformRollup, groupRevenue, type RollupServiceKey,
} from "@/lib/analytics/platformRollup";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";

/**
 * The platform, as one set of figures — in the same layout, in the same order,
 * as each service (`AnalyticsView`). Switching the picker changes the numbers
 * and the last section; it never rearranges the page.
 *
 * Where a service breaks its revenue down by plan and by provider, the
 * platform breaks it down by plan and by SERVICE: each view groups by the
 * level directly below it.
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

  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });

  if (isLoading || !data) return <PageLoader />;

  const { totals, services, months, rows } = data;
  const monthLabel = format(nowHN(), "MMMM");
  const serviceLabels = new Map(services.map((s) => [s.key as string, s.label]));

  return (
    <AnalyticsView
      monthLabel={monthLabel}
      months={months}
      series={services.map((s) => ({
        key: s.key, label: s.label, values: s.monthly, barClass: SERIES_TINT[s.key],
      }))}
      figures={totals}
      plans={{
        // Plan ids are unique across services, so the platform's plan ranking
        // is every service's plans in one list — which is the point.
        rows: rankedByRevenue(groupRevenue(rows, (r) => r.planKey, (k) => names?.plans.get(k))).slice(0, 8),
        emptyMessage: "No plan has earned anything yet.",
      }}
      group={{
        title: "Revenue by Service",
        rows: rankedByRevenue(groupRevenue(rows, (r) => r.service, (k) => serviceLabels.get(k))),
        emptyMessage: "No service has earned anything yet.",
      }}
      details={{
        title: "By service",
        children: (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[16px] leading-[22px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 font-normal">Service</th>
                  <th className="px-3 py-2 text-right font-normal">Revenue</th>
                  <th className="px-3 py-2 text-right font-normal">{monthLabel}</th>
                  <th className="px-3 py-2 text-right font-normal">Active</th>
                  <th className="px-3 py-2 text-right font-normal">Subs</th>
                  <th className="px-3 py-2 text-right font-normal">Customers</th>
                  <th className="px-3 py-2 text-right font-normal">Awaiting</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {services.map((s) => (
                  <tr key={s.key} className="transition-colors hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <Link to={`/admin/analytics?service=${s.key}`} className="font-semibold text-foreground">
                        {s.label}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">{formatUSD(s.revenueCents)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{formatUSD(s.monthRevenueCents)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground">{s.active}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.subs}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.customers}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${s.awaitingPayment > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {s.awaitingPayment}
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/admin/analytics?service=${s.key}`} aria-label={`Open ${s.label} analytics`}>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      }}
    />
  );
}

export default PlatformAnalytics;
