import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Wallet, TrendingUp, TrendingDown, Calendar as CalendarIcon, Settings2, PiggyBank, Pencil, Percent,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb, adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { commissionPct, splitTake, DEFAULT_COMMISSION_KEY, DEFAULT_COMMISSION_PCT } from "@/lib/finance/platformTake";
import { fetchEarned } from "@/lib/finance/providerEarnings";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

/**
 * What the platform makes, business by business.
 *
 * This page used to model money per SERVICE, in three shapes: cleaning was
 * "bought in" at a fixed $750/month so its profit was whatever revenue was
 * left over (and could be a loss), the beach club was $10 per person, food was
 * 10%. Three arithmetics, a type switch on each, and no way to say what the
 * platform actually sells — a rate per business.
 *
 * One model now: each provider has a `commission_pct`, the platform keeps that
 * share of what its customers paid, and the provider keeps the rest. Revenue
 * per provider comes from `fetchEarned`, the same recognition the provider's
 * own Money tab shows them, so the two screens cannot quote different numbers.
 */

type RangeKey = "month" | "custom";

interface ProviderRow {
  id: string;
  name: string;
  status: string | null;
  commission_pct: number | null;
  source_service_key: string | null;
  source_provider_id: string | null;
  archetype_key: string | null;
}

function rangeFor(key: RangeKey, customStart: string, customEnd: string) {
  const now = new Date();
  if (key === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfMonth(now);
  const end = customEnd ? new Date(`${customEnd}T23:59:59`) : endOfMonth(now);
  return { start, end };
}

export function NetProfitPanel() {
  const qc = useQueryClient();

  // ── Period ──────────────────────────────────────────────────────────────────
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const { start, end } = useMemo(() => rangeFor(range, customStart, customEnd), [range, customStart, customEnd]);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  // ── The businesses and their rates ──────────────────────────────────────────
  const { data: providers = [] } = useQuery({
    queryKey: ["finance-providers"],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers")
        .select("id, name, status, commission_pct, source_service_key, source_provider_id, archetype_key")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProviderRow[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["finance-settings"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/settings");
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
  });

  const defaultPct = Number(settings?.[DEFAULT_COMMISSION_KEY] ?? DEFAULT_COMMISSION_PCT);

  // ── Revenue per business, over the period ───────────────────────────────────
  // One call per provider, each the same query the business sees on its own
  // Money tab. Five businesses today; if that ever becomes fifty this is the
  // place to add a single grouped query — not a second definition of revenue.
  const { data: revenues = {}, isLoading } = useQuery({
    queryKey: ["finance-provider-revenue", startISO, endISO, providers.map((p) => p.id).join(",")],
    enabled: providers.length > 0,
    queryFn: async () => {
      const pairs = await Promise.all(providers.map(async (p) => {
        const sourceKey = p.source_service_key ?? p.archetype_key ?? "";
        const legacyId = p.source_provider_id ?? p.id;
        const { revenue } = await fetchEarned(sourceKey, legacyId, start, end, p.id);
        return [p.id, revenue] as const;
      }));
      return Object.fromEntries(pairs) as Record<string, number>;
    },
  });

  const rows = providers.map((p) => {
    const revenue = revenues[p.id] ?? 0;
    const pct = commissionPct(p.commission_pct, settings);
    const split = splitTake(revenue, pct);
    return { ...p, revenue, pct, ours: split.platformCents, theirs: split.providerCents };
  });

  const earning = rows.filter((r) => r.revenue > 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const netProfit = rows.reduce((s, r) => s + r.ours, 0);
  // Everything we don't keep goes to the businesses. revenue − payouts = profit.
  const toProviders = totalRevenue - netProfit;

  // ── Editing the rates ───────────────────────────────────────────────────────
  const [form, setForm] = useState<Record<string, number>>({});
  const [defaultForm, setDefaultForm] = useState<number>(DEFAULT_COMMISSION_PCT);
  /**
   * Rates are read first and changed on purpose.
   *
   * Every number on this card was a live input, so the thing that decides what
   * the platform keeps of every business's revenue — and the ceiling on what
   * each of them can withdraw — was one mis-click away from a different value.
   * Reading it is the common case; editing is the rare one, and now it has to
   * be asked for.
   */
  const [editing, setEditing] = useState(false);
  // Seed the fields from the server — but never while somebody is typing into
  // them. React Query refetches this list on focus, so without the guard,
  // tabbing away and back mid-edit silently threw the new rates away.
  useEffect(() => {
    if (!providers.length || editing) return;
    setForm(Object.fromEntries(providers.map((p) => [p.id, Number(p.commission_pct ?? defaultPct)])));
  }, [providers, defaultPct, editing]);
  useEffect(() => {
    if (!editing) setDefaultForm(defaultPct);
  }, [defaultPct, editing]);

  const saveRates = useMutation({
    mutationFn: async () => {
      const changed = providers.filter((p) => Number(p.commission_pct ?? defaultPct) !== form[p.id]);
      for (const p of changed) {
        const { error } = await supabaseDb
          .from("providers")
          .update({ commission_pct: form[p.id], updated_at: new Date().toISOString() })
          .eq("id", p.id);
        if (error) throw error;
      }
      if (defaultForm !== defaultPct) {
        const { error } = await adminApi("/admin/settings", {
          method: "PATCH",
          body: JSON.stringify({ [DEFAULT_COMMISSION_KEY]: defaultForm }),
        });
        if (error) throw error;
      }
      return changed.length + (defaultForm !== defaultPct ? 1 : 0);
    },
    onSuccess: (n) => {
      toast.success(n ? "Commission updated" : "Nothing to save");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["finance-providers"] });
      qc.invalidateQueries({ queryKey: ["finance-settings"] });
      qc.invalidateQueries({ queryKey: ["provider-earnings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Throw away anything typed and go back to what the server holds. */
  const cancelEdit = () => {
    setForm(Object.fromEntries(providers.map((p) => [p.id, Number(p.commission_pct ?? defaultPct)])));
    setDefaultForm(defaultPct);
    setEditing(false);
  };

  const money = (v: number) => `${v < 0 ? "-" : ""}${formatUSD(Math.abs(v))}`;

  return (
    <div className="space-y-space-4">
      {/* Period selector */}
      <div className="mb-space-4 flex flex-col items-stretch gap-space-2 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex gap-1 rounded-full bg-muted/50 p-1">
          {(["month", "custom"] as RangeKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setRange(k)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors",
                range === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}>
              {k === "month" ? "This month" : "Custom"}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" className="h-9 justify-start gap-2 rounded-full px-4 font-normal">
                <CalendarIcon className="h-4 w-4" />
                {customStart || customEnd ? (
                  <span className="tabular-nums">
                    {customStart ? format(new Date(`${customStart}T00:00:00`), "MMM d, yyyy") : "Start"}
                    {" – "}
                    {customEnd ? format(new Date(`${customEnd}T00:00:00`), "MMM d, yyyy") : "End"}
                  </span>
                ) : "Pick date range"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-0">
              <Calendar
                mode="range" numberOfMonths={2} weekStartsOn={1}
                defaultMonth={customStart ? new Date(`${customStart}T00:00:00`) : undefined}
                selected={{
                  from: customStart ? new Date(`${customStart}T00:00:00`) : undefined,
                  to: customEnd ? new Date(`${customEnd}T00:00:00`) : undefined,
                }}
                onSelect={(d: DateRange | undefined) => {
                  setCustomStart(d?.from ? format(d.from, "yyyy-MM-dd") : "");
                  setCustomEnd(d?.to ? format(d.to, "yyyy-MM-dd") : "");
                }}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-space-5">
            <div className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" /> Total revenue
            </div>
            <p className="mt-space-2 text-3xl font-black tabular-nums text-foreground">{formatUSD(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-space-5">
            <div className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <TrendingDown className="h-4 w-4" /> Paid to providers
            </div>
            <p className="mt-space-2 text-3xl font-black tabular-nums text-foreground">{formatUSD(toProviders)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/10">
          <CardContent className="p-space-5">
            <div className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <PiggyBank className="h-4 w-4 text-primary" /> Our commission
            </div>
            <p className="mt-space-2 text-3xl font-black tabular-nums text-primary">{money(netProfit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-business breakdown */}
      <Card className="mt-space-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-space-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Commission by business
          </CardTitle>
          <CardDescription>
            {format(start, "MMM d, yyyy")} — {format(end, "MMM d, yyyy")} · revenue recognized straight-line across each subscription's service days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2 pr-4">Business</TableHead>
                  <TableHead className="px-3 py-2 text-right">Revenue</TableHead>
                  <TableHead className="px-3 py-2 text-right">Rate</TableHead>
                  <TableHead className="px-3 py-2 text-right">Our commission</TableHead>
                  <TableHead className="px-3 py-2 text-right">They keep</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cn(isLoading && "opacity-50")}>
                {(earning.length ? earning : rows).map((row) => (
                  <TableRow key={row.id} className="border-b border-border/40">
                    <TableCell className="py-2.5 pr-4 font-semibold text-foreground">{row.name}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono tabular-nums text-foreground">{formatUSD(row.revenue)}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{row.pct}%</TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-primary">{money(row.ours)}</TableCell>
                    <TableCell className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatUSD(row.theirs)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="border-t border-border text-foreground">
                  <TableCell className="py-2.5 pr-4 font-bold">Total</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">{formatUSD(totalRevenue)}</TableCell>
                  <TableCell />
                  <TableCell className="px-3 py-2.5 text-right font-mono font-black tabular-nums text-primary">{money(netProfit)}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">{formatUSD(toProviders)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* The rates themselves */}
      <Card className="mt-space-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-space-2">
            <Settings2 className="h-5 w-5" /> Commission rates
          </CardTitle>
          <CardDescription>
            What the platform keeps of each business's revenue. The business sees the same
            rate and the same figures on its own Money tab, and its payout cap follows it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-space-4">
          <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p) => (
              <div key={p.id} className="space-y-2 rounded-radius-lg border border-[hsl(var(--app-divider))] p-space-4">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-foreground">{p.name}</span>
                  {p.status !== "active" && (
                    <span className="ml-auto text-xs text-muted-foreground">inactive</span>
                  )}
                </div>
                {editing ? (
                  <div className="relative">
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={form[p.id] ?? defaultPct}
                      onChange={(e) => setForm((f) => ({ ...f, [p.id]: parseFloat(e.target.value) || 0 }))}
                      className="pr-8"
                    />
                    <Percent className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                ) : (
                  <p className="text-[20px] font-semibold leading-[26px] tabular-nums text-foreground">
                    {form[p.id] ?? defaultPct}%
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-space-3 border-t border-[hsl(var(--app-divider))] pt-space-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Default for new businesses</p>
              <p className="text-xs text-muted-foreground">Used until a business is given a rate of its own.</p>
            </div>
            {editing ? (
              <div className="relative w-28">
                <Input
                  type="number" min={0} max={100} step={0.5}
                  value={defaultForm}
                  onChange={(e) => setDefaultForm(parseFloat(e.target.value) || 0)}
                  className="pr-8"
                />
                <Percent className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            ) : (
              <p className="text-[20px] font-semibold leading-[26px] tabular-nums text-foreground">
                {defaultForm}%
              </p>
            )}

            {editing ? (
              <div className="ml-auto flex items-center gap-space-2">
                <Button variant="ghost" onClick={cancelEdit} disabled={saveRates.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => saveRates.mutate()} disabled={saveRates.isPending}>
                  {saveRates.isPending && <Spinner size="sm" className="mr-2" />}
                  Save rates
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="ml-auto gap-2" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit rates
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
