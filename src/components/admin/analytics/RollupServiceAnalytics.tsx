import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnalyticsView, rankedByRevenue } from "@/components/admin/analytics/AnalyticsView";
import { ANALYTICS_NAMES_KEY, fetchAnalyticsNames } from "@/lib/analytics/names";
import { PageLoader } from "@/components/ui/spinner";
import {
  fetchPlatformRollup, groupRevenue, periodFigures, rowsInPeriod, type RollupServiceKey,
} from "@/lib/analytics/platformRollup";
import { useRollupPeriod } from "@/hooks/useRollupPeriod";
import { nowHN } from "@/lib/timezone";
import { tr, dfLocale } from "@/lib/tr";

/**
 * Analytics for a service that has no bespoke analytics page — Vehicles and
 * every service created in Settings → Services (Healthcare, Water…). Cleaning, food and the beach
 * keep their own pages because they know what a visit, a delivery and a court
 * hour are; everything here is pure rollup arithmetic, so one component covers
 * every service the rollup covers, including the next one.
 *
 * Same query key as PlatformAnalytics — switching the picker re-slices rows
 * already in the cache instead of re-fetching the tables.
 */
export function RollupServiceAnalytics({ serviceKey }: { serviceKey: RollupServiceKey }) {
  const [period] = useRollupPeriod();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });

  if (isLoading || !data) return <PageLoader />;

  const svc = data.byKey[serviceKey];
  if (!svc) return <PageLoader />;
  const allRows = data.rows.filter((r) => r.service === serviceKey);
  const rows = rowsInPeriod(allRows, period);

  return (
    <AnalyticsView
      monthLabel={format(nowHN(), "MMMM", { locale: dfLocale })}
      months={data.months}
      series={[{ key: svc.key, label: svc.label, values: svc.monthly, barClass: "bg-primary" }]}
      figures={svc}
      period={periodFigures(allRows, period)}
      plans={{
        rows: rankedByRevenue(groupRevenue(rows, (r) => r.planKey, (k) => names?.plans.get(k))).slice(0, 8),
        emptyMessage: tr("Nothing has earned anything yet."),
      }}
      group={{
        title: tr("Revenue by business"),
        rows: rankedByRevenue(groupRevenue(rows, (r) => r.providerKey, (k) => names?.providers.get(k))),
        emptyMessage: tr("No business has earned anything yet."),
      }}
    />
  );
}

export default RollupServiceAnalytics;
