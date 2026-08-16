import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/ui/spinner";
import { AnalyticsShell, RankedBarList, StatItem } from "@/components/admin/analytics/AnalyticsPrimitives";
import { AnalyticsView, rankedByRevenue } from "@/components/admin/analytics/AnalyticsView";
import { ANALYTICS_NAMES_KEY, fetchAnalyticsNames } from "@/lib/analytics/names";
import { fetchPlatformRollup, groupRevenue } from "@/lib/analytics/platformRollup";
import { formatUSD } from "@/lib/pricing";
import { effectiveFoodStatus } from "@/lib/subscriptionLifecycle";
import { nowHN, todayHN } from "@/lib/timezone";

/**
 * Food, in the platform's one analytics layout (`AnalyticsView`).
 *
 * Revenue, status, plans, restaurants and the overview grid come from the
 * platform rollup — the same rows the "All services" view reduces. Only what
 * is peculiar to food (a weekly price, and deliveries actually made) is
 * fetched here, and it lives in the last section like every other service's
 * own numbers.
 */

/** Weekly pricing and delivery volume — the two things only food has. */
async function fetchFoodExtras() {
  const [subs, deliveries, tips] = await Promise.all([
    // Reduced into money, so paged — see lib/supabasePaging.ts.
    fetchAllRows<any>(() => supabaseDb.from("food_subscriptions")
      .select("status, payment_status, weekly_price_cents, end_date").order("id")),
    supabaseDb.from("food_delivery_logs").select("id", { count: "exact", head: true }),
    fetchAllRows<any>(() => supabaseDb.from("food_tips").select("amount_cents").eq("payment_status", "paid").order("id")),
  ]);
  const today = todayHN();
  const active = subs.filter((s: any) => s.payment_status === "paid" && effectiveFoodStatus(s, today) === "active");
  const weekly = active.reduce((sum: number, s: any) => sum + (s.weekly_price_cents || 0), 0);
  return {
    // 4.33 weeks in an average month — the same conversion the food page has
    // always used to state a monthly figure for a weekly product.
    mrrCents: Math.round(weekly * 4.33),
    avgWeeklyCents: active.length ? Math.round(weekly / active.length) : 0,
    deliveries: deliveries.count ?? 0,
    tipsCents: tips.reduce((s: number, t: any) => s + (t.amount_cents || 0), 0),
  };
}

const FoodAnalytics = ({ embedded = false }: { embedded?: boolean }) => {
  const { data: rollup, isLoading } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  const { data: names } = useQuery({ queryKey: ANALYTICS_NAMES_KEY, queryFn: fetchAnalyticsNames });
  const { data: extras } = useQuery({
    queryKey: ["admin-food-analytics-extras"],
    queryFn: fetchFoodExtras,
  });

  if (isLoading || !rollup) {
    return (
      <AnalyticsShell embedded={embedded} title="Food — Analytics">
        <PageLoader />
      </AnalyticsShell>
    );
  }

  const figures = rollup.byKey.food;
  const rows = rollup.rows.filter((r) => r.service === "food");

  return (
    <AnalyticsShell embedded={embedded} title="Food — Analytics">
      <AnalyticsView
        monthLabel={format(nowHN(), "MMMM")}
        months={rollup.months}
        series={[{ key: "food", label: "Food", values: figures.monthly, barClass: "bg-primary" }]}
        figures={figures}
        plans={{ rows: rankedByRevenue(groupRevenue(rows, (r) => r.planKey, (k) => names?.plans.get(k))) }}
        group={{
          title: "Revenue by Restaurant",
          rows: rankedByRevenue(groupRevenue(rows, (r) => r.providerKey, (k) => names?.providers.get(k))),
          emptyMessage: "No restaurant has earned anything yet.",
        }}
        details={{
          title: "Food deliveries",
          children: (
            <div className="space-y-6">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatItem label="MRR (active subs)" value={formatUSD(extras?.mrrCents ?? 0)} />
                <StatItem label="Avg weekly price" value={formatUSD(extras?.avgWeeklyCents ?? 0)} />
                <StatItem label="Deliveries logged" value={String(extras?.deliveries ?? 0)} />
                <StatItem label="Tips collected" value={formatUSD(extras?.tipsCents ?? 0)} />
              </dl>
              {/* Where the food goes. No other service records a delivery
                  address on the subscription, so this stays in food's own
                  section rather than becoming a slot the others leave empty. */}
              <div className="space-y-3">
                <h3 className="text-[16px] leading-[22px] text-muted-foreground">Revenue by location</h3>
                <RankedBarList
                  rows={rankedByRevenue(groupRevenue(rows, (r) => r.locationKey, (k) => k, "No location"))}
                  formatValue={formatUSD}
                  emptyMessage="No revenue by location yet."
                />
              </div>
            </div>
          ),
        }}
      />
    </AnalyticsShell>
  );
};

export default FoodAnalytics;
