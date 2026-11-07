import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Sparkles, UtensilsCrossed, Waves, Store, Car, TrendingUp, CalendarRange,
  Calendar as CalendarIcon, Download, FileSpreadsheet, type LucideIcon,
} from "lucide-react";
import { fetchAllRows } from "@/lib/supabasePaging";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { formatUSD } from "@/lib/pricing";
import { recognizedCents } from "@/lib/revenueRecognition";
import { cn } from "@/lib/utils";
import { fetchUsersByIds } from "@/lib/admin/customerNames";
import { ROLLUP_SERVICES, type RollupServiceKey } from "@/lib/analytics/platformRollup";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type RangeKey = "week" | "month" | "custom";

/**
 * The columns are the rails a customer can pay on today, plus one bucket for
 * everything else. Infinita/LIVES is retired as a checkout method, so it no
 * longer earns a column of its own — but its historical `crypto` rows are real
 * money, and they land in "Other / LIVES" rather than falling out of the sums.
 */
const METHODS = [
  { key: "lightning", label: "Lightning" },
  { key: "onchain", label: "On-chain" },
  { key: "paypal", label: "PayPal" },
  { key: "crypto_gateway", label: "Other crypto" },
  { key: "other", label: "Other / LIVES" },
] as const;
type MethodKey = (typeof METHODS)[number]["key"];

/**
 * The rows are whatever the platform rollup counts — the same list Dashboard
 * and Analytics read — so a new arm of `subscriptions_unified` shows up here
 * without anyone remembering this file. Icons are decoration: an unknown key
 * gets the generic one rather than no row.
 */
const SERVICE_ICONS: Partial<Record<string, LucideIcon>> = {
  cleaning: Sparkles,
  food: UtensilsCrossed,
  beach: Waves,
  plan: Store,
  cars: Car,
};
const iconFor = (key: string): LucideIcon => SERVICE_ICONS[key] ?? Store;
const labelFor = (key: string) => ROLLUP_SERVICES.find((s) => s.key === key)?.label ?? key;

const normMethod = (m: unknown): MethodKey => {
  const s = String(m ?? "").toLowerCase();
  if (s === "lightning") return "lightning";
  if (s.includes("onchain") || s === "bitcoin") return "onchain";
  if (s === "paypal") return "paypal";
  if (s === "crypto_gateway") return "crypto_gateway";
  // `crypto` / `solana` / `infinita` are historical LIVES; manual, cash and
  // anything unrecognised land here too. Nothing is dropped from the sums.
  return "other";
};

function rangeFor(key: RangeKey, customStart: string, customEnd: string) {
  const now = new Date();
  if (key === "week") return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (key === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfMonth(now);
  const end = customEnd ? new Date(`${customEnd}T23:59:59`) : now;
  return { start, end };
}

type MethodRow = Record<MethodKey, number>;
type Matrix = Record<string, MethodRow>;

const emptyRow = (): MethodRow =>
  Object.fromEntries(METHODS.map((m) => [m.key, 0])) as MethodRow;

const emptyMatrix = (): Matrix =>
  Object.fromEntries(ROLLUP_SERVICES.map((s) => [s.key, emptyRow()]));

/**
 * A sale, as `subscriptions_unified` hands it out — every service, cars and
 * universal-only plans included, price at the BASE (no surcharge, no deposit).
 */
interface SaleRow {
  service: RollupServiceKey;
  id: string;
  provider_id?: string | null;
  user_id?: string | null;
  price_cents: number | null;
  status?: string | null;
  payment_method: string | null;
  payment_reference?: string | null;
  created_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  customer_name?: string | null;
  plan_name?: string | null;
}

/**
 * Paid sales, by the rollup's rule: paid, and not cancelled — the same rows the
 * Dashboard's revenue tile sums. Paged, because every row is reduced into money
 * and PostgREST truncates a plain select at 1000 rows with an HTTP 200.
 */
function fetchPaidSales(columns: string, window?: { startISO: string; endISO: string }) {
  // `select(columns)` with a runtime string can't be typed by supabase-js, so
  // the builder is `any` and the row shape is asserted by SaleRow.
  return fetchAllRows<SaleRow>((): any => {
    let q: any = supabaseDb
      .from("subscriptions_unified")
      .select(columns)
      .eq("paid", true)
      .neq("status", "cancelled");
    if (window) q = q.gte("created_at", window.startISO).lte("created_at", window.endISO);
    return q.order("service").order("id");
  });
}

function downloadCsv(rows: unknown[][], filename: string) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const usd = (cents: number) => (cents / 100).toFixed(2);

export function FinanceBreakdown() {
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { start, end } = useMemo(() => rangeFor(range, customStart, customEnd), [range, customStart, customEnd]);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const { data, isLoading } = useQuery({
    // Revenue is recognized straight-line across each sale's service period,
    // so we fetch every paid sale (not just those created in-window) and keep
    // only the portion that falls inside [start, end].
    queryKey: ["admin-finance-breakdown", startISO, endISO],
    queryFn: async () => {
      const sales = await fetchPaidSales("service, id, price_cents, payment_method, created_at, starts_on, ends_on");

      const matrix = emptyMatrix();
      let count = 0;
      sales.forEach((r) => {
        const cents = recognizedCents({
          totalCents: Number(r.price_cents) || 0,
          serviceStart: r.starts_on || r.created_at,
          serviceEnd: r.ends_on,
          fallbackDays: 30,
        }, start, end);
        if (cents <= 0) return;
        // A service the rollup does not list yet still happened — it gets a
        // row of its own rather than vanishing from the total.
        const row = (matrix[r.service] ??= emptyRow());
        row[normMethod(r.payment_method)] += cents;
        count++;
      });

      return { matrix, count };
    },
  });

  const matrix = data?.matrix ?? emptyMatrix();
  const serviceKeys = Object.keys(matrix);
  const cellOf = (service: string, m: MethodKey) => matrix[service]?.[m] ?? 0;
  const methodTotals = (m: MethodKey) => serviceKeys.reduce((s, c) => s + cellOf(c, m), 0);
  const categoryTotal = (c: string) => METHODS.reduce((s, m) => s + cellOf(c, m.key), 0);
  const grandTotal = serviceKeys.reduce((s, c) => s + categoryTotal(c), 0);

  // ─── Detailed CSV (per sale, with customer, business + plan) ───────────────
  const [detailedLoading, setDetailedLoading] = useState(false);

  const exportDetailedCsv = async () => {
    setDetailedLoading(true);
    try {
      const sales = await fetchPaidSales(
        "service, id, provider_id, user_id, price_cents, status, payment_method, payment_reference, created_at, starts_on, ends_on, customer_name, plan_name",
        { startISO, endISO },
      );

      const providerIds = [...new Set(sales.map((r) => r.provider_id).filter(Boolean) as string[])];
      const [users, provs] = await Promise.all([
        fetchUsersByIds(sales.map((r) => r.user_id)),
        providerIds.length
          ? supabaseDb.from("providers").select("id, name").in("id", providerIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ]);
      const provMap = new Map((provs.data ?? []).map((p: any) => [String(p.id), String(p.name ?? "")]));

      const iso = (v: unknown) => (v ? String(v).slice(0, 10) : "");
      const rows = sales.map((r) => {
        const u = r.user_id ? users.get(String(r.user_id)) : undefined;
        return {
          service: labelFor(r.service),
          business: r.provider_id ? provMap.get(String(r.provider_id)) ?? "" : "",
          user: u?.display_name || u?.name || r.customer_name || "",
          email: u?.email || "",
          plan: r.plan_name || "",
          method: String(r.payment_method || ""),
          cents: Number(r.price_cents) || 0,
          reference: r.payment_reference || "",
          periodStart: iso(r.starts_on),
          periodEnd: iso(r.ends_on),
          createdAt: iso(r.created_at),
          status: r.status || "",
        };
      });

      // Newest first
      rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      // Totals per service + grand total (last rows in the CSV)
      const serviceSum: Record<string, number> = {};
      let grand = 0;
      rows.forEach((r) => {
        serviceSum[r.service] = (serviceSum[r.service] || 0) + r.cents;
        grand += r.cents;
      });

      const header = ["Service", "Business", "Customer", "Email", "Plan", "Payment method", "Amount (USD)", "Reference", "Period start", "Period end", "Created at", "Status"];
      const pad = (cells: string[]) => [...cells, ...Array(header.length - cells.length).fill("")];
      downloadCsv([
        header,
        ...rows.map((r) => [r.service, r.business, r.user, r.email, r.plan, r.method, usd(r.cents), r.reference, r.periodStart, r.periodEnd, r.createdAt, r.status]),
        pad([]), // spacer
        ...Object.entries(serviceSum).map(([svc, cents]) => pad(["TOTAL", svc, "", "", "", "", usd(cents)])),
        pad(["GRAND TOTAL", `${rows.length} payments`, "", "", "", "", usd(grand)]),
      ], `finance-detailed_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.csv`);
    } finally {
      setDetailedLoading(false);
    }
  };

  // ─── CSV export (current period, same matrix as the table) ──────────────────
  const exportCsv = () => {
    downloadCsv([
      ["Service", ...METHODS.map((m) => m.label), "Total"],
      ...serviceKeys.map((key) => [
        labelFor(key),
        ...METHODS.map((m) => usd(cellOf(key, m.key))),
        usd(categoryTotal(key)),
      ]),
      ["Total", ...METHODS.map((m) => usd(methodTotals(m.key))), usd(grandTotal)],
    ], `finance-breakdown_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.csv`);
  };

  return (
    <section className="rounded-radius-md bg-card">
      <div className="flex flex-col p-space-6 gap-space-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-panel-title flex items-center gap-space-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Finance breakdown
          </h3>
          <p className="type-body text-muted-foreground">
            Revenue by service × payment method, recognized straight-line across each sale's service
            period. The same paid sales the Dashboard counts — cars and one-off plans included.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-space-2 sm:flex-row sm:items-center">
          <Button size="sm"
            variant="outline"
            className="gap-2 px-4"
            onClick={exportCsv}
            disabled={isLoading || grandTotal === 0}
            title="Summary CSV: revenue by service × payment method"
          >
            <Download className="h-4 w-4" />
            Summary CSV
          </Button>
          <Button size="sm"
            variant="outline"
            className="gap-2 px-4"
            onClick={exportDetailedCsv}
            disabled={isLoading || detailedLoading || grandTotal === 0}
            title="Detailed CSV: every paid sale created in the period — business, customer, plan, amount, method, dates, reference"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {detailedLoading ? "Building…" : "Detailed CSV"}
          </Button>
          <div className="flex gap-1 rounded-full bg-muted/50 p-1">
            {(["week", "month", "custom"] as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRange(k)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors",
                  range === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm"
                  variant="secondary"
                  className={cn(
                    "justify-start gap-2 px-4 font-normal",
                    !customStart && !customEnd && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {customStart || customEnd ? (
                    <span className="tabular-nums">
                      {customStart ? format(new Date(`${customStart}T00:00:00`), "MMM d, yyyy") : "Start"}
                      {" – "}
                      {customEnd ? format(new Date(`${customEnd}T00:00:00`), "MMM d, yyyy") : "End"}
                    </span>
                  ) : (
                    "Pick date range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  weekStartsOn={1}
                  defaultMonth={customStart ? new Date(`${customStart}T00:00:00`) : undefined}
                  selected={{
                    from: customStart ? new Date(`${customStart}T00:00:00`) : undefined,
                    to: customEnd ? new Date(`${customEnd}T00:00:00`) : undefined,
                  }}
                  onSelect={(r: DateRange | undefined) => {
                    setCustomStart(r?.from ? format(r.from, "yyyy-MM-dd") : "");
                    setCustomEnd(r?.to ? format(r.to, "yyyy-MM-dd") : "");
                  }}
                />
                {(customStart || customEnd) && (
                  <div className="flex justify-end border-t border-[hsl(var(--app-divider))] p-space-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => { setCustomStart(""); setCustomEnd(""); }}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <div className="p-space-6 pt-0">
        {/* Period + total strip — neutral card background, primary accent lives
            on the total number only. Matches the Dashboard's headline tiles. */}
        <div className="mb-space-4 flex flex-wrap items-center justify-between gap-3 rounded-radius-md bg-muted/40 px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarRange className="h-4 w-4" />
            {format(start, "MMM d, yyyy")} — {format(end, "MMM d, yyyy")}
          </span>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recognized in period</p>
            <p className="text-2xl font-black tabular-nums text-primary">{formatUSD(grandTotal)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="py-2 pr-4">Service</TableHead>
                {METHODS.map((m) => (
                  <TableHead key={m.key} className="px-3 py-2 text-right">{m.label}</TableHead>
                ))}
                <TableHead className="pl-3 py-2 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={cn(isLoading && "opacity-50")}>
              {serviceKeys.map((key) => {
                const Icon = iconFor(key);
                return (
                  <TableRow key={key} className="border-b border-border/40">
                    <TableCell className="py-2.5 pr-4">
                      <span className="flex items-center gap-2 font-semibold text-foreground">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {labelFor(key)}
                      </span>
                    </TableCell>
                    {METHODS.map((m) => (
                      <TableCell key={m.key} className={cn("px-3 py-2.5 text-right tabular-nums", cellOf(key, m.key) ? "text-foreground" : "text-muted-foreground/40")}>
                        {cellOf(key, m.key) ? formatUSD(cellOf(key, m.key)) : "—"}
                      </TableCell>
                    ))}
                    <TableCell className="pl-3 py-2.5 text-right font-bold tabular-nums text-foreground">
                      {categoryTotal(key) ? formatUSD(categoryTotal(key)) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="border-t border-border text-foreground">
                <TableCell className="py-2.5 pr-4 font-bold">Total</TableCell>
                {METHODS.map((m) => (
                  <TableCell key={m.key} className="px-3 py-2.5 text-right font-bold tabular-nums">
                    {methodTotals(m.key) ? formatUSD(methodTotals(m.key)) : "—"}
                  </TableCell>
                ))}
                <TableCell className="pl-3 py-2.5 text-right font-black tabular-nums text-primary">
                  {formatUSD(grandTotal)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>
    </section>
  );
}
