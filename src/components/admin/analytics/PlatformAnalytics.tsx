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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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
          <div>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3 py-2">Service</TableHead>
                  <TableHead className="px-3 py-2 text-right">Revenue</TableHead>
                  <TableHead className="px-3 py-2 text-right">{monthLabel}</TableHead>
                  <TableHead className="px-3 py-2 text-right">Active</TableHead>
                  <TableHead className="px-3 py-2 text-right">Subs</TableHead>
                  <TableHead className="px-3 py-2 text-right">Customers</TableHead>
                  <TableHead className="px-3 py-2 text-right">Awaiting</TableHead>
                  <TableHead className="w-10 px-3 py-2" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {services.map((s) => (
                  <TableRow key={s.key} className="transition-colors hover:bg-muted/40">
                    <TableCell className="px-3 py-3">
                      <Link to={`/admin/analytics?service=${s.key}`} className="font-semibold text-foreground">
                        {s.label}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">{formatUSD(s.revenueCents)}</TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">{formatUSD(s.monthRevenueCents)}</TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums text-foreground">{s.active}</TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.subs}</TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums text-muted-foreground">{s.customers}</TableCell>
                    <TableCell className={`px-3 py-3 text-right tabular-nums ${s.awaitingPayment > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {s.awaitingPayment}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <Link to={`/admin/analytics?service=${s.key}`} aria-label={`Open ${s.label} analytics`}>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ),
      }}
    />
  );
}

export default PlatformAnalytics;
