import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/ui/spinner";
import { AnalyticsShell, StatItem } from "@/components/admin/analytics/AnalyticsPrimitives";
import { AnalyticsView, rankedByRevenue } from "@/components/admin/analytics/AnalyticsView";
import { ANALYTICS_NAMES_KEY, fetchAnalyticsNames } from "@/lib/analytics/names";
import { fetchPlatformRollup, groupRevenue } from "@/lib/analytics/platformRollup";
import { formatUSD } from "@/lib/pricing";
import { nowHN } from "@/lib/timezone";

/**
 * Cleaning, in the platform's one analytics layout (`AnalyticsView`).
 *
 * Everything shared — revenue, status, plans, providers, the overview grid —
 * comes from the platform rollup, so this page and "All services" cannot
 * disagree. What is left here is what only cleaning has: visits.
 */

/** The part of the page no other service can answer: visits and tips. */
async function fetchCleaningExtras() {
  const [completions, bookings, tips] = await Promise.all([
    supabaseDb.from("cleaning_completion_reports").select("id", { count: "exact", head: true }),
    // Reduced into counts and money, so paged — see lib/supabasePaging.ts.
    fetchAllRows<any>(() => supabaseDb.from("cleaning_bookings").select("id, status").order("id")),
    fetchAllRows<any>(() => supabaseDb.from("cleaning_tips").select("amount_cents").eq("payment_status", "paid").order("id")),
  ]);
  const countStatus = (s: string) => bookings.filter((b: any) => b.status === s).length;
  return {
    completions: completions.count ?? 0,
    bookings: bookings.length,
    upcoming: countStatus("booked"),
    completed: countStatus("completed"),
    cancelled: countStatus("cancelled"),
    tipsCents: tips.reduce((s: number, t: any) => s + (t.amount_cents || 0), 0),
  };
}

const CleaningAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const { data: rollup, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });
  const { data: extras } = useQuery({
    queryKey: ["admin-cleaning-analytics-extras"],
    queryFn: fetchCleaningExtras,
  });

  if (isLoading || !rollup) {
    return (
      <AnalyticsShell embedded={embedded} title="Cleaning — Analytics">
        <PageLoader />
      </AnalyticsShell>
    );
  }

  const figures = rollup.byKey.cleaning;
  const rows = rollup.rows.filter((r) => r.service === "cleaning");

  return (
    <AnalyticsShell embedded={embedded} title="Cleaning — Analytics">
      <AnalyticsView
        monthLabel={format(nowHN(), "MMMM")}
        months={rollup.months}
        series={[{ key: "cleaning", label: "Cleaning", values: figures.monthly, barClass: "bg-primary" }]}
        figures={figures}
        plans={{ rows: rankedByRevenue(groupRevenue(rows, (r) => r.planKey, (k) => names?.plans.get(k))) }}
        group={{
          title: "Revenue by Provider",
          rows: rankedByRevenue(groupRevenue(rows, (r) => r.providerKey, (k) => names?.providers.get(k))),
          emptyMessage: "No provider has earned anything yet.",
        }}
        details={{
          title: "Cleaning visits",
          children: (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatItem label="Completed cleanings" value={String(extras?.completions ?? 0)} />
              <StatItem label="Total bookings" value={String(extras?.bookings ?? 0)} />
              <StatItem label="Upcoming" value={String(extras?.upcoming ?? 0)} />
              <StatItem label="Completed" value={String(extras?.completed ?? 0)} />
              <StatItem label="Cancelled bookings" value={String(extras?.cancelled ?? 0)} />
              <StatItem label="Tips collected" value={formatUSD(extras?.tipsCents ?? 0)} />
            </dl>
          ),
        }}
      />
    </AnalyticsShell>
  );
};

export default CleaningAnalytics;
