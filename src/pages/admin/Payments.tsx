import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";
import { TabPills } from "@/components/admin/TabPills";
import { FinanceBreakdown } from "@/components/admin/FinanceBreakdown";
import { NetProfitPanel } from "@/components/admin/NetProfitPanel";
import { ProviderPayoutsPanel } from "@/components/admin/ProviderPayoutsPanel";
import { formatUSD } from "@/lib/pricing";
import { fetchPlatformRollup } from "@/lib/analytics/platformRollup";
import { useTabParam } from "@/hooks/useTabParam";
import { FinanceRangePicker, useFinanceRange } from "@/components/admin/finance/FinanceRange";
import { QueryError } from "@/components/patterns/QueryError";

const FINANCE_TABS = ["payments", "profit", "payouts"] as const;

const AdminPayments = () => {

  // The headline figures are the platform rollup — the same function, and the
  // same cache entry, the Analytics page reads, and the same arithmetic the
  // Dashboard's Revenue tile sums. This page used to reduce three legacy tables
  // of its own and label the result "all services" while missing cars and
  // every universal-only plan.
  const {
    data: rollup,
    isError: rollupError,
    error: rollupErrorObj,
    refetch: refetchRollup,
  } = useQuery({
    queryKey: ["admin-platform-rollup"],
    queryFn: fetchPlatformRollup,
  });
  // Sales MADE in the chosen period, at full price — the sales rule. The
  // breakdown below spreads the same sales over their service period, so the
  // two can differ for the same month; each says which it is.
  const { start: rangeStart, end: rangeEnd, label: rangeLabel } = useFinanceRange();
  const inRange = rollup
    ? rollup.rows.filter((r) => {
        if (!r.paid || r.status === "cancelled" || !r.createdAt) return false;
        const t = Date.parse(r.createdAt);
        return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
      })
    : [];
  const paidSales = inRange.length;
  const soldCents = inRange.reduce((t, r) => t + r.valueCents, 0);

  // Reading Commission and refreshing should not drop you back on Payments.
  // The value stays `profit` so links to the old Net Profit tab still land.
  const [financeTab, setFinanceTab] = useTabParam(FINANCE_TABS);

  return (
    <SuperAdminLayout title="Finance" subtitle="Payments, commission and payouts across every service">
      <TabPills
        className="mb-space-4"
        value={financeTab}
        onChange={setFinanceTab}
        tabs={[
          { value: "payments", label: "Payments" },
          { value: "profit", label: "Commission" },
          { value: "payouts", label: "Payouts" },
        ]}
      />
      {/* One period for Payments and Commission; Payouts is a ledger, not a period. */}
      {financeTab !== "payouts" && <FinanceRangePicker className="mb-space-4" />}

      {financeTab === "payments" && (
        <>
          {/* Three headline tiles — same flat pattern as the Dashboard so a
              navigation switch between /admin/dashboard and /admin/payments
              doesn't feel like two different apps. */}
          {rollupError ? (
            <QueryError
              compact
              title="Couldn't load the revenue totals"
              error={rollupErrorObj}
              onRetry={() => void refetchRollup()}
            />
          ) : (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <FinanceTile label="Paid sales" value={rollup ? String(paidSales) : "—"} hint={`Made ${rangeLabel.startsWith("this") ? rangeLabel : `in ${rangeLabel}`}`} />
              <FinanceTile label="Awaiting payment" value={rollup ? String(rollup.totals.awaitingPayment) : "—"} hint="Right now · every service"
                warning={(rollup?.totals.awaitingPayment ?? 0) > 0} className="col-span-1" />
              <FinanceTile label="Sold" value={rollup ? formatUSD(soldCents) : "—"}
                hint="Full price of those sales. The breakdown below spreads each over its service period" className="col-span-2 md:col-span-1" />
            </section>
          )}

          {/* Cross-service finance breakdown */}
          <section className="mt-space-4 md:mt-space-5">
            <FinanceBreakdown />
          </section>

          <Link to="/admin/settings/payments" className="mt-space-4 flex items-center justify-between gap-3 rounded-radius-md bg-card p-4 text-body text-muted-foreground transition-colors hover:bg-muted/40 md:mt-space-5">
            <span>Payment methods and fees moved to <span className="font-semibold text-foreground">Settings → Payments</span></span>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          {/* Payment methods and their fees are production settings, not part
              of a report: they live in Settings → Payments. Test payments and
              the notification log are in Diagnostics. */}
        </>
      )}

      {financeTab === "profit" && <NetProfitPanel />}

      {financeTab === "payouts" && <ProviderPayoutsPanel />}

    </SuperAdminLayout>
  );
};

export default AdminPayments;

/** Flat headline tile shared by the finance page. Mirrors the Dashboard's
 *  MetricTile shape so both admin surfaces feel the same. */
function FinanceTile({
  label, value, hint, accent, warning, className,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  warning?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-radius-md bg-card p-4 ${warning ? "bg-attention/10" : ""} ${className ?? ""}`}
    >
      <span className="text-meta text-muted-foreground">
        {label}
      </span>
      <p
        className={
          "text-2xl font-semibold tabular-nums tracking-tight md:text-3xl " +
          (accent ? "text-primary" : warning ? "text-attention" : "text-foreground")
        }
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

