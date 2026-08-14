import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Info, TrendingUp, Wallet } from "lucide-react";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { formatUSD } from "@/lib/pricing";
import {
  FINANCE_SOURCES, financeSourceFor, readTakeConfig, splitTake,
} from "@/lib/finance/platformTake";
import { fetchEarned } from "@/lib/finance/providerEarnings";
import { cn } from "@/lib/utils";

/**
 * What this business earned, and what of it has actually been paid.
 *
 * Providers could see a Revenue MTD number in the KPI strip and nothing else:
 * not what the platform keeps, not what they are owed, and certainly not what
 * has been sent — because until now nothing recorded a payout at all.
 *
 * Three deliberate choices:
 *
 * 1. Revenue is recognized straight-line across each subscription's service
 *    period, exactly as the admin's Net Profit page does it. A 3-month plan
 *    paid up front earns a third of its money each month. Booking it all in
 *    the month of purchase would make the first month look like a windfall and
 *    the next two like a collapse.
 * 2. The commission model is read from the same `global_settings` keys the
 *    admin edits, through the same helpers (lib/finance/platformTake). If an
 *    admin changes the rate, this screen changes with it — a provider and an
 *    admin quoting different numbers at each other is the failure mode worth
 *    designing against.
 * 3. Payouts come from the ledger, not from a guess. If nothing has been
 *    recorded, the screen says nothing has been recorded.
 */

type RangeKey = "month" | "last_month" | "quarter" | "year" | "all";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

function rangeFor(key: RangeKey): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const endOfToday = new Date(y, m, now.getDate(), 23, 59, 59);
  if (key === "month") return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59) };
  if (key === "last_month") return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59) };
  if (key === "quarter") return { start: new Date(y, m - 2, 1), end: endOfToday };
  if (key === "year") return { start: new Date(y, 0, 1), end: endOfToday };
  return { start: new Date(2020, 0, 1), end: endOfToday };
}

const AVG_DAYS_PER_MONTH = 365.25 / 12;

interface PayoutRow {
  id: string;
  amount_cents: number;
  period_start: string | null;
  period_end: string | null;
  method: string | null;
  reference: string | null;
  note: string | null;
  paid_at: string;
}

function MoneyCard({ label, value, hint, icon: Icon, tone = "muted" }: {
  label: string; value: string; hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "muted" | "emerald" | "amber";
}) {
  const tint =
    tone === "emerald" ? "bg-emerald-500/15 text-emerald-500" :
    tone === "amber"   ? "bg-amber-500/15 text-amber-500" :
                         "bg-muted text-muted-foreground";
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", tint)}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ProviderEarningsTab({ providerId, legacyId, sourceKey }: {
  /** Universal providers.id — payouts are keyed by it. */
  providerId: string;
  /** Legacy per-service id — the money lives in the legacy tables. */
  legacyId: string;
  sourceKey: string;
}) {
  const [range, setRange] = useState<RangeKey>("month");
  const { start, end } = useMemo(() => rangeFor(range), [range]);
  const months = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1) / AVG_DAYS_PER_MONTH;

  const sourceMeta = FINANCE_SOURCES.find((s) => s.key === financeSourceFor(sourceKey)) ?? null;

  const { data: settings } = useQuery({
    queryKey: ["global-settings-finance"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabaseDb.from("global_settings").select("key, value");
      const map: Record<string, unknown> = {};
      (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  const { data: earned, isLoading } = useQuery({
    queryKey: ["provider-earnings", sourceKey, legacyId, range],
    enabled: !!legacyId || financeSourceFor(sourceKey) === "beach",
    staleTime: 60_000,
    queryFn: () => fetchEarned(sourceKey, legacyId, start, end),
  });

  // The ledger is invisible to the anon key on purpose — it comes from NestJS.
  const { data: payouts = [], isError: payoutsFailed } = useQuery({
    queryKey: ["provider-payouts", providerId],
    enabled: !!providerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/payouts`);
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as PayoutRow[];
    },
  });

  const cfg = readTakeConfig(settings);
  const revenue = earned?.revenue ?? 0;
  const units = earned?.units ?? 0;

  const split = sourceMeta
    ? splitTake(sourceMeta, cfg[sourceMeta.key], { revenueCents: revenue, units, months })
    : { platformCents: 0, providerCents: revenue, explanation: "No commission is configured for this service." };

  // Payouts inside the selected window, so "paid" answers the same question
  // "earned" does. All-time totals would make a monthly view unreadable.
  const paidInRange = payouts
    .filter((p) => {
      const t = new Date(p.paid_at).getTime();
      return t >= start.getTime() && t <= end.getTime();
    })
    .reduce((s, p) => s + Number(p.amount_cents || 0), 0);

  const outstanding = split.providerCents - paidInRange;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
              range === r.key ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyCard
          label="Customers paid"
          value={isLoading ? "—" : formatUSD(revenue)}
          hint="Spread across the days each plan covers"
          icon={TrendingUp}
        />
        <MoneyCard
          label={sourceMeta?.kind === "cost" ? "Platform margin" : "Platform fee"}
          value={isLoading ? "—" : formatUSD(split.platformCents)}
          hint={split.explanation}
          icon={Info}
        />
        <MoneyCard
          label="You earned"
          value={isLoading ? "—" : formatUSD(split.providerCents)}
          icon={Banknote}
          tone="emerald"
        />
        <MoneyCard
          label={outstanding >= 0 ? "Owed to you" : "Paid ahead"}
          value={isLoading ? "—" : formatUSD(Math.abs(outstanding))}
          hint={paidInRange ? `${formatUSD(paidInRange)} already paid` : "Nothing paid out for this period"}
          icon={Wallet}
          tone={outstanding > 0 ? "amber" : "muted"}
        />
      </div>

      <section className="rounded-2xl bg-card p-4">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-muted-foreground">Payouts</h3>

        {payoutsFailed ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Couldn't load the payout ledger. It lives behind the API rather than in the browser —
            try again in a moment.
          </p>
        ) : payouts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No payouts recorded yet. Once the platform sends money it appears here with its date,
            method and reference, and the figure above stops counting it as owed.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(p.paid_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    {p.method && <span className="ml-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.method}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.period_start && p.period_end ? `Covers ${p.period_start} → ${p.period_end}` : "Ad-hoc payout"}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                  {p.reference && (
                    <p className="truncate font-mono text-[11px] text-muted-foreground/70">{p.reference}</p>
                  )}
                </div>
                <span className="text-base font-black tabular-nums text-foreground">{formatUSD(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Money is counted over the days a plan covers, not the day it was bought — a three-month
        plan earns a third of its total each month. Only payments the platform has confirmed as
        received are included.
      </p>
    </div>
  );
}
