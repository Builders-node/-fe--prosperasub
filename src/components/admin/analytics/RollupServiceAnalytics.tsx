import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnalyticsView, rankedByRevenue } from "@/components/admin/analytics/AnalyticsView";
import { ANALYTICS_NAMES_KEY, fetchAnalyticsNames } from "@/lib/analytics/names";
import { PageLoader } from "@/components/ui/spinner";
import {
  fetchPlatformRollup, groupRevenue, type RollupServiceKey,
} from "@/lib/analytics/platformRollup";
import { nowHN } from "@/lib/timezone";

/**
 * Analytics for a service that has no bespoke analytics page — car rentals and
 * the universal-only "Other services" bucket. Cleaning, food and the beach
 * keep their own pages because they know what a visit, a delivery and a court
 * hour are; everything here is pure rollup arithmetic, so one component covers
 * every service the rollup covers, including the next one.
 *
 * Same query key as PlatformAnalytics — switching the picker re-slices rows
 * already in the cache instead of re-fetching the tables.
 */
export function RollupServiceAnalytics({ serviceKey }: { serviceKey: RollupServiceKey }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });

  if (isLoading || !data) return <PageLoader />;

  const svc = data.byKey[serviceKey];
  const rows = data.rows.filter((r) => r.service === serviceKey);

  return (
    <AnalyticsView
      monthLabel={format(nowHN(), "MMMM")}
      months={data.months}
      series={[{ key: svc.key, label: svc.label, values: svc.monthly, barClass: "bg-primary" }]}
      figures={svc}
      plans={{
        rows: rankedByRevenue(groupRevenue(rows, (r) => r.planKey, (k) => names?.plans.get(k))).slice(0, 8),
        emptyMessage: "Nothing has earned anything yet.",
      }}
      group={{
        title: "Revenue by Provider",
        rows: rankedByRevenue(groupRevenue(rows, (r) => r.providerKey, (k) => names?.providers.get(k))),
        emptyMessage: "No provider has earned anything yet.",
      }}
    />
  );
}

export default RollupServiceAnalytics;
