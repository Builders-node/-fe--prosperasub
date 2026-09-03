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
 * The beach club, in the platform's one analytics layout (`AnalyticsView`).
 *
 * This page used to be the odd one out: no status card, no overview grid, a
 * full-width chart where the others had two columns, and a KPI row that
 * counted people where the others counted revenue. It now answers the same
 * questions in the same order; a membership's headcount — the one thing only
 * this service sells — is the last section.
 */

/** What a membership covers, and what it is played on: people and courts. */
async function fetchBeachExtras() {
  const [subs, courts] = await Promise.all([
    // Reduced into a headcount, so paged — see lib/supabasePaging.ts.
    fetchAllRows<any>(() => supabaseDb.from("provider_subscriptions")
      .select("payment_status, status, price_cents, people:metadata->people")
      .eq("source_service_key", "beach").order("id") as never),
    supabaseDb.from("beach_club_courts").select("id", { count: "exact", head: true }),
  ]);
  const paid = subs.filter((s: any) => s.payment_status === "paid");
  const active = paid.filter((s: any) => s.status === "active");
  return {
    // A headcount of live memberships only — counting cancelled rows here
    // inflated the number and disagreed with every tile beside it.
    people: active.reduce((sum: number, s: any) => sum + (Number(s.people) || 0), 0),
    avgOrderCents: paid.length
      ? Math.round(paid.reduce((sum: number, s: any) => sum + (s.price_cents || 0), 0) / paid.length)
      : 0,
    courts: courts.count ?? 0,
  };
}

export default function BeachClubAnalytics({ embedded = false }: { embedded?: boolean }) {
  const { data: rollup, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });
  const { data: extras } = useQuery({
    queryKey: ["admin-beach-analytics-extras"],
    queryFn: fetchBeachExtras,
  });

  if (isLoading || !rollup) {
    return (
      <AnalyticsShell embedded={embedded} title="Beach Club — Analytics">
        <PageLoader />
      </AnalyticsShell>
    );
  }

  const figures = rollup.byKey.beach;
  const rows = rollup.rows.filter((r) => r.service === "beach");

  return (
    <AnalyticsShell embedded={embedded} title="Beach Club — Analytics">
      <AnalyticsView
        monthLabel={format(nowHN(), "MMMM")}
        months={rollup.months}
        series={[{ key: "beach", label: "Beach Club", values: figures.monthly, barClass: "bg-primary" }]}
        figures={figures}
        plans={{ rows: rankedByRevenue(groupRevenue(rows, (r) => r.planKey, (k) => names?.plans.get(k))) }}
        group={{
          title: "Revenue by Provider",
          rows: rankedByRevenue(groupRevenue(rows, (r) => r.providerKey, (k) => names?.providers.get(k))),
          emptyMessage: "No provider has earned anything yet.",
        }}
        details={{
          title: "Beach club memberships",
          children: (
            <dl className="grid gap-4 sm:grid-cols-3">
              <StatItem label="People covered" value={String(extras?.people ?? 0)} />
              <StatItem label="Avg order" value={formatUSD(extras?.avgOrderCents ?? 0)} />
              <StatItem label="Courts" value={String(extras?.courts ?? 0)} />
            </dl>
          ),
        }}
      />
    </AnalyticsShell>
  );
}
