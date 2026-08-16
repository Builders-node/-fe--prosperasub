import type { ReactNode } from "react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";

/**
 * Shared building blocks for the per-service analytics pages.
 *
 * These were copy-pasted into all four service pages — `KpiCard` was
 * byte-identical in every one, `StatItem` in three, `StatusBar` in two, and
 * the 6-month bar chart in three with only the bar tint differing. A fix to
 * one (empty-state handling, a NaN width guard) never reached the others.
 *
 * They now speak the platform's type: 24 semibold for a figure, 20 for the
 * name of a section, 16 muted for what a figure is — the ramp the provider
 * workspace uses. The old micro-labels (11px uppercase with wide tracking,
 * values in black weight, an icon plate in a different tint per metric) were
 * the last screen still shouting in a language of its own.
 */

// ─── KPI card ───────────────────────────────────────────────────────────────
export function KpiCard({
  icon: Icon, label, value, accent,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-radius-md bg-inset ${accent}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[16px] leading-[22px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-[24px] font-semibold leading-[29px] tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Small labelled figure ──────────────────────────────────────────────────
export function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-radius-md bg-inset p-3 tracking-[-0.02em]">
      <dt className="text-[16px] leading-[22px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[24px] font-semibold leading-[29px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

// ─── Proportion bar ─────────────────────────────────────────────────────────
export function StatusBar({
  label, icon, count, total, color, textColor,
}: {
  label: string;
  icon: ReactNode;
  count: number;
  total: number;
  color: string;
  textColor: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[16px] leading-[22px] tracking-[-0.02em]">
        <span className={`flex items-center gap-1.5 ${textColor}`}>{icon}{label}</span>
        <span className="tabular-nums text-muted-foreground">{count} · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── 6-month revenue chart ──────────────────────────────────────────────────
export interface MonthBar { label: string; rev: number }

/**
 * Renders an empty message instead of six stub bars when there's no revenue.
 * Each copy of this used `Math.max(...values, 1)` to avoid a divide-by-zero,
 * which silently drew a full row of zero-height bars on an empty dataset —
 * indistinguishable from "we haven't loaded" at a glance.
 */
export function MonthlyRevenueChart({
  months, barClass = "bg-primary", formatValue,
}: {
  months: MonthBar[];
  barClass?: string;
  formatValue: (cents: number) => string;
}) {
  const max = Math.max(...months.map((m) => m.rev), 0);
  if (max === 0) {
    return (
      <p className="py-8 text-center text-[16px] leading-[22px] text-muted-foreground">
        No revenue recorded in the last 6 months.
      </p>
    );
  }
  return (
    <div className="flex h-48 items-end justify-between gap-2">
      {months.map((m) => (
        <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {m.rev > 0 ? formatValue(m.rev) : ""}
          </span>
          <div
            className={`w-full rounded-t-radius-sm ${barClass}`}
            style={{ height: `${Math.max((m.rev / max) * 100, 2)}%` }}
          />
          <span className="text-[14px] text-muted-foreground">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 6-month revenue chart, split by service ────────────────────────────────
export interface RevenueSeries {
  key: string;
  label: string;
  /** One value per month, same order and length as `months`. */
  values: number[];
  /** Tailwind background class for this series' segment. */
  barClass: string;
}

/**
 * The platform-wide version of `MonthlyRevenueChart`: one column per month,
 * stacked so the column height reads as the platform total while the segments
 * still say which service earned it. Three separate charts answered "how is
 * cleaning doing" three times and "how is the platform doing" never.
 */
export function StackedRevenueChart({
  months, series, formatValue,
}: {
  months: string[];
  series: RevenueSeries[];
  formatValue: (cents: number) => string;
}) {
  const totals = months.map((_, i) => series.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const max = Math.max(...totals, 0);
  if (max === 0) {
    return (
      <p className="py-8 text-center text-[16px] leading-[22px] text-muted-foreground">
        No revenue recorded in the last 6 months.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex h-48 items-end justify-between gap-2">
        {months.map((label, i) => (
          <div key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {totals[i] > 0 ? formatValue(totals[i]) : ""}
            </span>
            {/* The column is one stack: segments share a rounded top so it
                reads as a single bar, not three bars that happen to touch.
                A 1px gap lets the card show through between them — adjacent
                weights of one accent otherwise blur into a gradient. */}
            <div
              className="flex w-full flex-col-reverse gap-px overflow-hidden rounded-t-radius-sm"
              style={{ height: `${Math.max((totals[i] / max) * 100, 2)}%` }}
            >
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                if (v <= 0) return null;
                return (
                  <div
                    key={s.key}
                    className={s.barClass}
                    style={{ height: `${(v / totals[i]) * 100}%` }}
                    title={`${s.label} · ${formatValue(v)}`}
                  />
                );
              })}
            </div>
            <span className="text-[14px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.barClass}`} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Ranked list with proportion bars ───────────────────────────────────────
export interface RankedRow { key: string; label: string; sublabel?: string; value: number }

/**
 * The "top N by revenue/count" list. Five near-identical copies existed. Rows
 * with a zero value are dropped by default — one copy listed every vehicle in
 * the fleet including "0 rentals", and another divided by a zero maximum,
 * producing `width: NaN%`.
 */
export function RankedBarList({
  rows, formatValue, barClass = "bg-primary", emptyMessage = "Nothing to show yet.", includeZero = false,
}: {
  rows: RankedRow[];
  formatValue: (value: number) => string;
  barClass?: string;
  emptyMessage?: string;
  includeZero?: boolean;
}) {
  const visible = includeZero ? rows : rows.filter((r) => r.value > 0);
  const max = Math.max(...visible.map((r) => r.value), 0);
  if (visible.length === 0 || max === 0) {
    return <p className="py-6 text-center text-[16px] leading-[22px] text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-3">
      {visible.map((r) => (
        <div key={r.key}>
          <div className="mb-1.5 flex items-center justify-between gap-3 tracking-[-0.02em]">
            <span className="min-w-0 truncate text-[16px] leading-[22px] text-foreground">
              {r.label}
              {r.sublabel && <span className="ml-1.5 text-[14px] text-muted-foreground">{r.sublabel}</span>}
            </span>
            <span className="shrink-0 text-[16px] font-semibold tabular-nums text-foreground">
              {formatValue(r.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── embedded/standalone shell ──────────────────────────────────────────────
/**
 * Each page declared this inline INSIDE its component body, which creates a new
 * component type on every render — React unmounts and remounts the whole
 * subtree each time, losing focus and local state. Hoisted here so it's a
 * stable reference.
 */
export function AnalyticsShell({
  embedded, title, children,
}: {
  embedded?: boolean;
  title: string;
  children: ReactNode;
}) {
  if (embedded) return <>{children}</>;
  return <SuperAdminLayout title={title}>{children}</SuperAdminLayout>;
}
