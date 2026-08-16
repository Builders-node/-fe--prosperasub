import type { ReactNode } from "react";
import { BarChart3, Layers, TrendingUp, Users } from "lucide-react";
import {
  KpiCard, RankedBarList, StackedRevenueChart, StatItem, StatusBar,
  type RankedRow, type RevenueSeries,
} from "@/components/admin/analytics/AnalyticsPrimitives";
import type { RevenueGroup, RollupFigures } from "@/lib/analytics/platformRollup";
import { formatUSD } from "@/lib/pricing";

/** A revenue grouping as the ranked list wants it — "Studio Apartment · 5 subs". */
export const rankedByRevenue = (groups: RevenueGroup[]): RankedRow[] =>
  groups.map((g) => ({
    key: g.key,
    label: g.label,
    sublabel: `${g.subs} sub${g.subs !== 1 ? "s" : ""}`,
    value: g.revenueCents,
  }));

/**
 * The shape of every analytics screen in the admin.
 *
 * Cleaning, food and the beach club each grew their own page, so the same
 * question had a different answer in a different place on each one: the KPI
 * row was "MRR · Active · Revenue · Avg weekly" here and "Revenue · Active ·
 * People · Avg order" there, one page had a status breakdown and another
 * didn't, and the revenue chart was first, second or absent depending on where
 * you looked. Comparing two services meant re-reading the page.
 *
 * Now there is one layout, in one order, and a service supplies content for
 * its slots — never a slot of its own:
 *
 *   1. four headline figures (always the same four)
 *   2. revenue over six months  |  where the subscriptions stand
 *   3. plans by revenue         |  the level below (services / providers)
 *   4. the same eight overview numbers
 *   5. what only this service has — one clearly-named section, last
 *
 * Everything except slot 5 is computed by `lib/analytics/platformRollup.ts`,
 * so the figures agree across services and with the Overview page.
 */

export interface AnalyticsViewProps {
  /** Current month's name, for the second KPI ("Revenue — August"). */
  monthLabel: string;
  months: string[];
  /** One series per service: a service page passes one, the platform three. */
  series: RevenueSeries[];
  figures: RollupFigures;
  plans: { rows: RankedRow[]; emptyMessage?: string };
  /** The breakdown one level below what this view is about. */
  group: { title: string; rows: RankedRow[]; emptyMessage?: string };
  /** Slot 5 — the only place a service says something the others don't. */
  details?: { title: string; children: ReactNode };
}

function Card({ title, icon: Icon, children }: {
  title: string;
  icon: React.FC<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <h2 className="flex items-center gap-2 text-[20px] font-semibold leading-[26px] text-foreground">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      {children}
    </div>
  );
}

export function AnalyticsView({
  monthLabel, months, series, figures, plans, group, details,
}: AnalyticsViewProps) {
  const avgPerSubCents = figures.subs > 0 ? Math.round(figures.revenueCents / figures.subs) : 0;

  return (
    <div className="space-y-space-6">
      {/* 1 — the same four figures on every screen. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Total Revenue" value={formatUSD(figures.revenueCents)} accent="text-green-400" />
        <KpiCard icon={TrendingUp} label={`Revenue — ${monthLabel}`} value={formatUSD(figures.monthRevenueCents)} accent="text-blue-400" />
        <KpiCard icon={Layers} label="Active Subscriptions" value={String(figures.active)} accent="text-yellow-400" />
        <KpiCard icon={Users} label="Customers" value={String(figures.customers)} accent="text-purple-400" />
      </div>

      {/* 2 — how revenue moved, and where the subscriptions stand today. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Monthly Revenue (last 6 months)" icon={BarChart3}>
          <StackedRevenueChart months={months} series={series} formatValue={formatUSD} />
        </Card>
        <Card title="Subscription Status" icon={Layers}>
          <div className="space-y-3">
            <StatusBar label="Active" count={figures.active} total={figures.subs} color="bg-green-500" textColor="text-green-400" />
            <StatusBar label="Expired" count={figures.expired} total={figures.subs} color="bg-blue-500" textColor="text-blue-400" />
            <StatusBar label="Paused" count={figures.paused} total={figures.subs} color="bg-yellow-500" textColor="text-yellow-400" />
            <StatusBar label="Cancelled" count={figures.cancelled} total={figures.subs} color="bg-muted-foreground" textColor="text-muted-foreground" />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3 text-[16px] leading-[22px]">
            <span className="text-muted-foreground">Awaiting payment</span>
            <span className={`font-semibold tabular-nums ${figures.awaitingPayment > 0 ? "text-amber-500" : "text-foreground"}`}>
              {figures.awaitingPayment}
            </span>
          </div>
        </Card>
      </div>

      {/* 3 — what sells, and who sells it. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Revenue by Plan" icon={TrendingUp}>
          <RankedBarList
            rows={plans.rows}
            formatValue={formatUSD}
            emptyMessage={plans.emptyMessage ?? "No plan has earned anything yet."}
          />
        </Card>
        <Card title={group.title} icon={Layers}>
          <RankedBarList
            rows={group.rows}
            formatValue={formatUSD}
            emptyMessage={group.emptyMessage ?? "Nothing to show yet."}
          />
        </Card>
      </div>

      {/* 4 — the same eight numbers, in the same order, on every screen. */}
      <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <h2 className="mb-4 text-[20px] font-semibold leading-[26px] text-foreground">Overview</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatItem label="Total subscriptions" value={String(figures.subs)} />
          <StatItem label="Active" value={String(figures.active)} />
          <StatItem label="Paused" value={String(figures.paused)} />
          <StatItem label="Expired" value={String(figures.expired)} />
          <StatItem label="Cancelled" value={String(figures.cancelled)} />
          <StatItem label="Awaiting payment" value={String(figures.awaitingPayment)} />
          <StatItem label="Customers" value={String(figures.customers)} />
          <StatItem label="Avg revenue / sub" value={formatUSD(avgPerSubCents)} />
        </dl>
      </div>

      {/* 5 — the service's own numbers, last, so the shared part reads first. */}
      {details && (
        <div className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
          <h2 className="mb-4 text-[20px] font-semibold leading-[26px] text-foreground">{details.title}</h2>
          {details.children}
        </div>
      )}

      <p className="text-[14px] leading-[20px] text-muted-foreground">
        Revenue counts each paid, non-cancelled subscription at its full committed
        value, in the month it was sold — the same rule on every service and on the
        Overview. Active means paid and running today (Honduras time).
      </p>
    </div>
  );
}
