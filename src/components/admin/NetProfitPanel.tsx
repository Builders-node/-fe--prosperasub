import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfMonth, endOfMonth, format, differenceInCalendarMonths } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Sparkles, Car, UtensilsCrossed, Waves, Wallet, TrendingUp, TrendingDown,
  Calendar as CalendarIcon, Settings2, PiggyBank, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb, adminApi } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import { recognizedCents, overlapDays, addDaysISO } from "@/lib/revenueRecognition";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RangeKey = "month" | "custom";
type CostType = "percent" | "fixed" | "person";
type SrcKey = "cleaning" | "beach" | "cars" | "food";

interface Source {
  key: SrcKey;
  label: string;
  icon: LucideIcon;
  unit: string;            // singular noun for the "per-unit" type (per person / booking / …)
  kind: "cost" | "take";   // cleaning is a cost we pay; others are commission we keep
  valueKey: string;        // global_settings key holding the numeric value
  typeKey: string;         // global_settings key holding the cost type
}

const SOURCES: Source[] = [
  { key: "cleaning", label: "Cleaning",       icon: Sparkles,        unit: "subscription", kind: "cost", valueKey: "finance_cleaning_cost_cents", typeKey: "finance_cleaning_type" },
  { key: "beach",    label: "Beach Club",     icon: Waves,           unit: "person",       kind: "take", valueKey: "finance_beach_extra_cents",   typeKey: "finance_beach_type" },
  { key: "cars",     label: "Car Rentals",    icon: Car,             unit: "booking",      kind: "take", valueKey: "finance_car_commission_pct",  typeKey: "finance_car_type" },
  { key: "food",     label: "Food Orders",    icon: UtensilsCrossed, unit: "order",        kind: "take", valueKey: "finance_food_commission_pct", typeKey: "finance_food_type" },
];

// Raw value is stored in cents for fixed/person types, and as a whole percent for percent.
const DEFAULT_TYPE: Record<SrcKey, CostType> = { cleaning: "fixed", beach: "person", cars: "percent", food: "percent" };
const DEFAULT_RAW: Record<SrcKey, number> = { cleaning: 75000, beach: 1000, cars: 10, food: 10 };

type SrcCfg = { type: CostType; raw: number };
const fallbackCfg = () =>
  Object.fromEntries(SOURCES.map((s) => [s.key, { type: DEFAULT_TYPE[s.key], raw: DEFAULT_RAW[s.key] }])) as Record<SrcKey, SrcCfg>;

function rangeFor(key: RangeKey, customStart: string, customEnd: string) {
  const now = new Date();
  if (key === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfMonth(now);
  const end = customEnd ? new Date(`${customEnd}T23:59:59`) : endOfMonth(now);
  return { start, end };
}

export function NetProfitPanel() {
  const qc = useQueryClient();

  // ── Period ────────────────────────────────────────────────────────────────
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const { start, end } = useMemo(() => rangeFor(range, customStart, customEnd), [range, customStart, customEnd]);
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  // "Fixed" amounts are per-month, so scale them by the months the range spans.
  const monthsInRange = Math.max(1, differenceInCalendarMonths(end, start) + 1);

  // ── Settings (read from backend, editable) ──────────────────────────────────
  const { data: settings } = useQuery({
    queryKey: ["finance-settings"],
    queryFn: async () => {
      const { data, error } = await adminApi("/admin/settings");
      if (error) throw error;
      const out = {} as Record<SrcKey, SrcCfg>;
      for (const s of SOURCES) {
        out[s.key] = {
          type: (String(data[s.typeKey] ?? DEFAULT_TYPE[s.key]) as CostType),
          raw: Number(data[s.valueKey] ?? DEFAULT_RAW[s.key]),
        };
      }
      return out;
    },
  });

  const cfg = settings ?? fallbackCfg();

  // Editable form mirrors saved settings, but the value is in *display* units
  // (whole percent for percent; dollars for fixed/person).
  type SrcForm = { type: CostType; value: number };
  const toForm = (c: Record<SrcKey, SrcCfg>): Record<SrcKey, SrcForm> =>
    Object.fromEntries(SOURCES.map((s) => {
      const { type, raw } = c[s.key];
      return [s.key, { type, value: type === "percent" ? raw : raw / 100 }];
    })) as Record<SrcKey, SrcForm>;

  const [form, setForm] = useState<Record<SrcKey, SrcForm>>(() => toForm(fallbackCfg()));
  useEffect(() => { if (settings) setForm(toForm(settings)); }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      for (const s of SOURCES) {
        const f = form[s.key];
        body[s.typeKey] = f.type;
        body[s.valueKey] = f.type === "percent" ? f.value : Math.round(f.value * 100);
      }
      const { error } = await adminApi("/admin/settings", { method: "PATCH", body: JSON.stringify(body) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Financial settings saved");
      qc.invalidateQueries({ queryKey: ["finance-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Revenue + counts (period-scoped, paid only) ─────────────────────────────
  // Revenue is recognized straight-line across each sub's service period, so a
  // 3-month plan contributes ~⅓ of its total to each month it spans. We fetch
  // all paid subs and keep only the portion that overlaps [start, end]. Counts
  // are the subs whose service period overlaps the window at all.
  const { data: rev, isLoading } = useQuery({
    queryKey: ["finance-profit-revenue", startISO, endISO],
    queryFn: async () => {
      const [cleaning, beach, rental, food] = await Promise.all([
        supabaseDb.from("cleaning_subscriptions")
          .select("total_price_cents, monthly_price_cents, created_at, service_start_date, service_end_date, start_date, end_date")
          .eq("payment_status", "paid").is("deleted_at", null),
        supabaseDb.from("beach_club_subscriptions")
          .select("total_cents, people, created_at, start_date, end_date")
          .eq("payment_status", "paid"),
        supabaseDb.from("rental_bookings")
          .select("total_cents, created_at, start_date, end_date")
          .eq("payment_status", "paid").is("deleted_at", null),
        supabaseDb.from("food_subscriptions")
          .select("weekly_price_cents, commitment_weeks, periods_paid, created_at, started_at")
          .in("status", ["active", "paused", "expired"]),
      ]);

      const acc = (rows: any[], toInput: (r: any) => Parameters<typeof recognizedCents>[0], unit?: (r: any) => number) => {
        let revenue = 0, count = 0;
        (rows ?? []).forEach((r) => {
          const input = toInput(r);
          const cents = recognizedCents(input, start, end);
          if (overlapDays(input, start, end) > 0) { revenue += cents; count += unit ? unit(r) : 1; }
        });
        return { revenue, count };
      };

      return {
        cleaning: acc(cleaning.data, (r) => ({
          totalCents: r.total_price_cents || r.monthly_price_cents || 0,
          serviceStart: r.service_start_date || r.start_date || r.created_at,
          serviceEnd: r.service_end_date || r.end_date,
          fallbackDays: 30,
        })),
        beach: acc(beach.data, (r) => ({
          totalCents: r.total_cents || 0,
          serviceStart: r.start_date || r.created_at,
          serviceEnd: r.end_date,
          fallbackDays: 30,
        }), (r) => r.people || 0),
        cars: acc(rental.data, (r) => ({
          totalCents: r.total_cents || 0,
          serviceStart: r.start_date || r.created_at,
          serviceEnd: r.end_date,
          fallbackDays: 1,
        })),
        food: acc(food.data, (r) => {
          const weeks = (r.commitment_weeks || 1) * (r.periods_paid || 1);
          const startDay = r.started_at || r.created_at;
          return {
            totalCents: (r.weekly_price_cents || 0) * weeks,
            serviceStart: startDay,
            serviceEnd: startDay ? addDaysISO(startDay, weeks * 7) : null,
            fallbackDays: weeks * 7,
          };
        }),
      } as Record<SrcKey, { revenue: number; count: number }>;
    },
  });

  const r = rev ?? { cleaning: { revenue: 0, count: 0 }, beach: { revenue: 0, count: 0 }, cars: { revenue: 0, count: 0 }, food: { revenue: 0, count: 0 } };

  // ── Profit model ────────────────────────────────────────────────────────────
  // The configured value is computed into an "amount": for a cost source it's
  // what we pay (profit = revenue − amount); for a take source it's our cut
  // (profit = amount, capped at revenue).
  const computeAmount = (key: SrcKey) => {
    const { type, raw } = cfg[key];
    const { revenue, count } = r[key];
    if (type === "percent") return Math.round(revenue * (raw / 100));
    if (type === "fixed") return raw * monthsInRange;
    return raw * count; // person / per-unit
  };

  const noteFor = (s: Source) => {
    const { type, raw } = cfg[s.key];
    const { count } = r[s.key];
    if (type === "percent") return `${raw}% of revenue${s.kind === "cost" ? " (provider cost)" : " commission"}`;
    if (type === "fixed") return `${formatUSD(raw)}/mo${monthsInRange > 1 ? ` × ${monthsInRange} mo` : ""}${s.kind === "cost" ? " fixed cost" : " fixed"}`;
    return `${formatUSD(raw)} × ${count} ${s.unit}${count === 1 ? "" : "s"}`;
  };

  const rows = SOURCES.map((s) => {
    const revenue = r[s.key].revenue;
    const amount = computeAmount(s.key);
    const profit = s.kind === "cost" ? revenue - amount : Math.min(amount, revenue);
    return { ...s, revenue, profit, note: noteFor(s) };
  });

  const totalRevenue = rows.reduce((s, x) => s + x.revenue, 0);
  const netProfit = rows.reduce((s, x) => s + x.profit, 0);
  // Expenses = everything we don't keep. Reconciles: revenue − expenses = net profit.
  const totalExpenses = totalRevenue - netProfit;

  const money = (v: number) => `${v < 0 ? "-" : ""}${formatUSD(Math.abs(v))}`;
  const profitClass = (v: number) => (v < 0 ? "text-red-400" : "text-primary");

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
              <TrendingDown className="h-4 w-4" /> Total expenses
            </div>
            <p className="mt-space-2 text-3xl font-black tabular-nums text-foreground">{formatUSD(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card className={netProfit < 0 ? "bg-red-500/10" : "bg-primary/10"}>
          <CardContent className="p-space-5">
            <div className="flex items-center gap-space-2 text-sm font-medium text-muted-foreground">
              <PiggyBank className={cn("h-4 w-4", profitClass(netProfit))} /> Net profit
            </div>
            <p className={cn("mt-space-2 text-3xl font-black tabular-nums", profitClass(netProfit))}>{money(netProfit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Profit breakdown by source */}
      <Card className="mt-space-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-space-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Profit by source
          </CardTitle>
          <CardDescription>
            {format(start, "MMM d, yyyy")} — {format(end, "MMM d, yyyy")} · revenue recognized straight-line across each subscription's service months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Source</th>
                  <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                  <th className="px-3 py-2 text-right font-semibold">Our profit</th>
                  <th className="hidden py-2 pl-3 font-semibold md:table-cell">Rule</th>
                </tr>
              </thead>
              <tbody className={cn(isLoading && "opacity-50")}>
                {rows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <tr key={row.key} className="border-b border-border/40">
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-2 font-semibold text-foreground">
                          <Icon className="h-4 w-4 text-primary" /> {row.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-foreground">{formatUSD(row.revenue)}</td>
                      <td className={cn("px-3 py-2.5 text-right font-mono font-bold tabular-nums", profitClass(row.profit))}>{money(row.profit)}</td>
                      <td className="hidden py-2.5 pl-3 text-xs text-muted-foreground md:table-cell">{row.note}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-foreground">
                  <td className="py-2.5 pr-4 font-bold">Net profit</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">{formatUSD(totalRevenue)}</td>
                  <td className={cn("px-3 py-2.5 text-right font-mono font-black tabular-nums", profitClass(netProfit))}>{money(netProfit)}</td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Configurable settings — type + value per source */}
      <Card className="mt-space-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-space-2">
            <Settings2 className="h-5 w-5" /> Financial settings
          </CardTitle>
          <CardDescription>
            Pick how each source is calculated — Percent of revenue, a Fixed monthly amount, or Per-unit (per person / booking / order) — then set the value. The profit figures above update from the saved values.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-space-4">
          <div className="grid grid-cols-1 gap-space-3 sm:grid-cols-2">
            {SOURCES.map((s) => {
              const f = form[s.key];
              const isPct = f.type === "percent";
              const Icon = s.icon;
              return (
                <div key={s.key} className="space-y-space-3 rounded-radius-lg border border-[hsl(var(--app-divider))] p-space-4">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <Icon className="h-4 w-4 text-primary" /> {s.label}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{s.kind === "cost" ? "Cost" : "Our cut"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-space-3">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={f.type} onValueChange={(v) => setForm((p) => ({ ...p, [s.key]: { ...p[s.key], type: v as CostType } }))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Percent (%)</SelectItem>
                          <SelectItem value="fixed">Fixed ($)</SelectItem>
                          <SelectItem value="person">Per {s.unit} ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{isPct ? "Rate (%)" : "Amount ($)"}</Label>
                      <Input
                        type="number" min={0} step={isPct ? 0.5 : 1} max={isPct ? 100 : undefined}
                        value={f.value}
                        onChange={(e) => setForm((p) => ({ ...p, [s.key]: { ...p[s.key], value: parseFloat(e.target.value) || 0 } }))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.kind === "cost"
                      ? `Cleaning revenue above this cost is profit (can be a loss if under).`
                      : `Our profit from each ${s.unit}.`}
                  </p>
                </div>
              );
            })}
          </div>
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            {saveSettings.isPending && <Spinner size="sm" className="mr-2" />}
            Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
