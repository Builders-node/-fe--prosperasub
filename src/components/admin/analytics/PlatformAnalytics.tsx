import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { AnalyticsView, rankedByRevenue } from "@/components/admin/analytics/AnalyticsView";
import { ANALYTICS_NAMES_KEY, fetchAnalyticsNames } from "@/lib/analytics/names";
import { PageLoader } from "@/components/ui/spinner";
import {
  fetchPlatformRollup, groupRevenue, periodFigures, rowsInPeriod,
} from "@/lib/analytics/platformRollup";
import { useRollupPeriod } from "@/hooks/useRollupPeriod";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableSort } from "@/lib/table/useTableSort";
import { SortHeader } from "@/components/ui/sort-header";

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
// by weight of the same primary, not by a colour each. As many weights as
// there are services, strongest first.
const TINTS = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-primary/30", "bg-primary/20", "bg-primary/12"];
const tintAt = (i: number) => TINTS[Math.min(i, TINTS.length - 1)];
const NO_SERVICES: Awaited<ReturnType<typeof fetchPlatformRollup>>["services"] = [];

export function PlatformAnalytics() {
  const [period] = useRollupPeriod();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });

  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });

  // Before the early return — a hook. Its own param: the page also carries
  // the service picker and period in the URL.
  const services = data?.services ?? NO_SERVICES;
  const sort = useTableSort(services, {
    service: (s) => s.label,
    revenue: (s) => s.revenueCents,
    month: (s) => s.monthRevenueCents,
    active: (s) => s.active,
    subs: (s) => s.subs,
    customers: (s) => s.customers,
    awaiting: (s) => s.awaitingPayment,
  }, { param: "services_sort" });

  if (isLoading || !data) return <PageLoader />;

  const { totals, months } = data;
  const rows = rowsInPeriod(data.rows, period);
  const monthLabel = format(nowHN(), "MMMM");
  const serviceLabels = new Map(services.map((s) => [s.key as string, s.label]));

  return (
    <AnalyticsView
      monthLabel={monthLabel}
      months={months}
      series={services.map((s, i) => ({
        key: s.key, label: s.label, values: s.monthly, barClass: tintAt(i),
      }))}
      figures={totals}
      period={periodFigures(data.rows, period)}
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
                  <TableHead className="px-3 py-2" aria-sort={sort.ariaSort("service")}><SortHeader {...sort.headerProps("service")}>Service</SortHeader></TableHead>
                  <TableHead className="px-3 py-2 text-right" aria-sort={sort.ariaSort("revenue")}><SortHeader {...sort.headerProps("revenue")} align="right">Revenue</SortHeader></TableHead>
                  <TableHead className="px-3 py-2 text-right" aria-sort={sort.ariaSort("month")}><SortHeader {...sort.headerProps("month")} align="right">{monthLabel}</SortHeader></TableHead>
                  <TableHead className="px-3 py-2 text-right" aria-sort={sort.ariaSort("active")}><SortHeader {...sort.headerProps("active")} align="right">Active</SortHeader></TableHead>
                  <TableHead className="px-3 py-2 text-right" aria-sort={sort.ariaSort("subs")}><SortHeader {...sort.headerProps("subs")} align="right">Subs</SortHeader></TableHead>
                  <TableHead className="px-3 py-2 text-right" aria-sort={sort.ariaSort("customers")}><SortHeader {...sort.headerProps("customers")} align="right">Customers</SortHeader></TableHead>
                  <TableHead className="px-3 py-2 text-right" aria-sort={sort.ariaSort("awaiting")}><SortHeader {...sort.headerProps("awaiting")} align="right">Awaiting</SortHeader></TableHead>
                  <TableHead className="w-10 px-3 py-2" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {sort.sorted.map((s) => (
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
                    <TableCell className={`px-3 py-3 text-right tabular-nums ${s.awaitingPayment > 0 ? "text-attention" : "text-muted-foreground"}`}>
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
