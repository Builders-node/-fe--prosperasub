import type { ReactNode } from "react";
import SuperAdminLayout from "@/components/admin/SuperAdminLayout";

/**
 * Shared building blocks for the per-service analytics pages.
 *
 * These were copy-pasted into all four service pages — `KpiCard` was
 * byte-identical in every one, `StatItem` in three, `StatusBar` in two, and
 * the 6-month bar chart in three with only the bar tint differing. A fix to
 * one (empty-state handling, a NaN width guard) never reached the others.
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
    <div className="flex items-start gap-4 rounded-2xl bg-card p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Small labelled figure ──────────────────────────────────────────────────
export function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[hsl(var(--app-rail))] p-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-black text-foreground">{value}</dd>
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
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className={`flex items-center gap-1.5 font-medium ${textColor}`}>{icon}{label}</span>
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
      <p className="py-8 text-center text-sm text-muted-foreground">
        No revenue recorded in the last 6 months.
      </p>
    );
  }
  return (
    <div className="flex h-48 items-end justify-between gap-2">
      {months.map((m) => (
        <div key={m.label} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {m.rev > 0 ? formatValue(m.rev) : ""}
          </span>
          <div
            className={`w-full rounded-t-lg ${barClass}`}
            style={{ height: `${Math.max((m.rev / max) * 100, 2)}%` }}
          />
          <span className="text-[10px] font-medium text-muted-foreground">{m.label}</span>
        </div>
      ))}
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
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-3">
      {visible.map((r) => (
        <div key={r.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-foreground">
              {r.label}
              {r.sublabel && <span className="ml-1.5 text-xs text-muted-foreground">{r.sublabel}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatValue(r.value)}</span>
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
