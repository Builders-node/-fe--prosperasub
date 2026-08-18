import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Info, TrendingUp, Wallet, ArrowUpRight } from "lucide-react";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { formatUSD } from "@/lib/pricing";
import { commissionPct, splitTake } from "@/lib/finance/platformTake";
import { fetchEarned } from "@/lib/finance/providerEarnings";
import { cn } from "@/lib/utils";
import { WorkspaceStat } from "@/components/provider/WorkspaceUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/patterns/ResponsiveDialog";
import { toast } from "sonner";
import { formatDateHN } from "@/lib/timezone";

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
 * 2. The commission is this business's own rate (`providers.commission_pct`,
 *    falling back to the platform default), through the same helper the admin
 *    finance page uses. If an admin changes the rate, this screen changes with
 *    it — a provider and an admin quoting different numbers at each other is
 *    the failure mode worth designing against.
 * 3. Payouts come from the ledger, not from a guess. If nothing has been
 *    recorded, the screen says nothing has been recorded.
 * 4. Withdrawing is a request, not a transfer. The cap shown here is
 *    recomputed by the server before anything is written — the browser's copy
 *    is for reading, not for deciding — and an admin approves before money
 *    moves. Money leaving the platform is not something a screen does alone.
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

interface PayoutRow {
  id: string;
  amount_cents: number;
  status?: "requested" | "approved" | "paid" | "rejected";
  requested_at?: string | null;
  created_at?: string | null;
  decision_note?: string | null;
  period_start: string | null;
  period_end: string | null;
  method: string | null;
  reference: string | null;
  note: string | null;
  paid_at: string | null;
}

/**
 * The withdraw affordance. Deliberately plain: an amount, a destination, and a
 * request — no "instant payout" language for something a person still has to
 * approve. The maximum is what the server says, not what the range picker
 * above happens to be showing.
 */
function WithdrawPanel({ providerId, availableCents }: { providerId: string; availableCents: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const cents = Math.round(Number(amount) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter how much you want to withdraw");
      const { data, error } = await accountApi(`/account/providers/${providerId}/payouts/request`, {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, destination: destination.trim() }),
      });
      if (error) throw new Error(String(error));
      return data;
    },
    onSuccess: () => {
      toast.success("Requested — you'll be notified once it's sent");
      setOpen(false); setAmount(""); setDestination("");
      qc.invalidateQueries({ queryKey: ["provider-payouts", providerId] });
      qc.invalidateQueries({ queryKey: ["provider-payout-available", providerId] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not request the payout"),
  });

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
      <div className="min-w-0">
        <p className="text-[16px] leading-[22px] text-muted-foreground">Available to withdraw</p>
        <p className="mt-1 text-[24px] font-semibold leading-[29px] tabular-nums text-foreground">{formatUSD(availableCents)}</p>
        <p className="mt-1 text-[14px] leading-[18px] text-muted-foreground">
          Everything you have earned, less what you have already asked for or been sent.
        </p>
      </div>
      <Button className="rounded-full gap-1.5" disabled={availableCents <= 0} onClick={() => setOpen(true)}>
        <ArrowUpRight className="h-4 w-4" /> Withdraw
      </Button>

      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Request a payout">
        <div className="space-y-4 pb-2">
          <div className="space-y-1.5">
            <label className="text-[16px] leading-[22px] text-muted-foreground">Amount (USD)</label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={(availableCents / 100).toFixed(2)} />
            <button type="button" className="text-xs font-semibold text-primary"
              onClick={() => setAmount((availableCents / 100).toFixed(2))}>
              Withdraw everything ({formatUSD(availableCents)})
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="text-[16px] leading-[22px] text-muted-foreground">Where to send it</label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)}
              placeholder="Lightning address or Bitcoin address" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            The request goes to the platform for approval. Nothing is sent until it is approved,
            and you will see it here either way.
          </p>
          <Button className="w-full rounded-full" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? "Sending…" : "Request payout"}
          </Button>
        </div>
      </ResponsiveDialog>
    </section>
  );
}

function PayoutStatus({ status }: { status?: string }) {
  if (!status || status === "paid") return null;
  const tone =
    status === "requested" ? "bg-amber-500/15 text-amber-500" :
    status === "approved"  ? "bg-sky-500/15 text-sky-500" :
                             "bg-destructive/15 text-destructive";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold capitalize", tone)}>
      {status}
    </span>
  );
}

/**
 * A figure on the Money tab, in the same tile as the header's — label 16
 * muted over 24 semibold. The icon plate and its tint went with the old look:
 * a coloured square never told anyone which number they were reading.
 */
function MoneyCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <WorkspaceStat label={label} value={value} hint={hint} />;
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

  /** This business's own rate. */
  const { data: providerRow } = useQuery({
    queryKey: ["provider-commission", providerId],
    enabled: !!providerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabaseDb
        .from("providers").select("commission_pct").eq("id", providerId).maybeSingle();
      return (data ?? null) as { commission_pct: number | null } | null;
    },
  });

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
    queryKey: ["provider-earnings", sourceKey, legacyId, providerId, range],
    enabled: !!legacyId || !!providerId,
    staleTime: 60_000,
    // The universal id scopes the beach branch — its money lives in
    // `provider_subscriptions`, keyed by `provider_id`, not by the service.
    queryFn: () => fetchEarned(sourceKey, legacyId, start, end, providerId),
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

  const revenue = earned?.revenue ?? 0;
  const pct = commissionPct(providerRow?.commission_pct, settings);
  const split = splitTake(revenue, pct);

  // Payouts inside the selected window, so "paid" answers the same question
  // "earned" does. All-time totals would make a monthly view unreadable.
  const paidInRange = payouts
    .filter((p) => {
      const t = new Date(p.paid_at).getTime();
      return t >= start.getTime() && t <= end.getTime();
    })
    .reduce((s, p) => s + Number(p.amount_cents || 0), 0);

  const outstanding = split.providerCents - paidInRange;

  // What the server will actually allow — all-time earned minus everything
  // already requested or sent, which is a different question from the
  // per-range figures above.
  const { data: available } = useQuery({
    queryKey: ["provider-payout-available", providerId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await accountApi(`/account/providers/${providerId}/payouts/available`);
      if (error) throw new Error(String(error));
      return data as { availableCents: number; earnedCents: number; committedCents: number };
    },
  });
  const availableCents = available?.availableCents ?? 0;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2 rounded-radius-lg bg-card p-4">
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

      <div className="grid grid-cols-2 gap-3 rounded-radius-lg bg-card p-4 tracking-[-0.02em] lg:grid-cols-4">
        <MoneyCard
          label="Customers paid"
          value={isLoading ? "—" : formatUSD(revenue)}
          hint="Spread across the days each plan covers"
        />
        <MoneyCard
          label={`Platform fee · ${pct}%`}
          value={isLoading ? "—" : formatUSD(split.platformCents)}
          hint={split.explanation}
        />
        <MoneyCard
          label="You earned"
          value={isLoading ? "—" : formatUSD(split.providerCents)}
        />
        <MoneyCard
          label={outstanding >= 0 ? "Owed to you" : "Paid ahead"}
          value={isLoading ? "—" : formatUSD(Math.abs(outstanding))}
          hint={paidInRange ? `${formatUSD(paidInRange)} already paid` : "Nothing paid out for this period"}
        />
      </div>

      <WithdrawPanel providerId={providerId} availableCents={availableCents} />

      <section className="rounded-radius-lg bg-card p-4 tracking-[-0.02em]">
        <h3 className="text-[20px] font-semibold leading-[26px] text-foreground">Payouts</h3>

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
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {formatDateHN(p.paid_at ?? p.requested_at ?? p.created_at)}
                    <PayoutStatus status={p.status} />
                    {p.method && <span className="text-[14px] capitalize text-muted-foreground">{p.method}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.period_start && p.period_end ? `Covers ${p.period_start} → ${p.period_end}` : "Ad-hoc payout"}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                  {p.reference && (
                    <p className="truncate font-mono text-[11px] text-muted-foreground/70">{p.reference}</p>
                  )}
                </div>
                <span className="text-[16px] font-semibold tabular-nums text-foreground">{formatUSD(p.amount_cents)}</span>
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
