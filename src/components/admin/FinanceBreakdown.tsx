import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Sparkles, Car, UtensilsCrossed, Waves, TrendingUp, CalendarRange, Calendar as CalendarIcon, Download, FileSpreadsheet } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { formatUSD } from "@/lib/pricing";
import { recognizedCents, addDaysISO } from "@/lib/revenueRecognition";
import { cn } from "@/lib/utils";

type RangeKey = "week" | "month" | "custom";

const METHODS = [
  { key: "lightning", label: "Lightning" },
  { key: "onchain", label: "On-chain" },
  { key: "lives", label: "LIVES" },
  { key: "paypal", label: "PayPal" },
  { key: "other", label: "Other" },
] as const;
type MethodKey = (typeof METHODS)[number]["key"];

const CATEGORIES = [
  { key: "cleaning", label: "Cleaning", icon: Sparkles, color: "text-blue-400" },
  { key: "food", label: "Food", icon: UtensilsCrossed, color: "text-orange-400" },
  { key: "cars", label: "Car Rental", icon: Car, color: "text-purple-400" },
  { key: "beach", label: "Beach Club", icon: Waves, color: "text-cyan-400" },
] as const;
type CategoryKey = (typeof CATEGORIES)[number]["key"];

const normMethod = (m: unknown): MethodKey => {
  const s = String(m ?? "").toLowerCase();
  if (s === "lightning") return "lightning";
  if (s.includes("onchain") || s === "bitcoin") return "onchain";
  if (s === "crypto" || s === "solana" || s === "infinita" || s === "lives") return "lives";
  if (s === "paypal") return "paypal";
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

const emptyMatrix = (): Record<CategoryKey, Record<MethodKey, number>> => ({
  cleaning: { lightning: 0, onchain: 0, lives: 0, paypal: 0, other: 0 },
  food: { lightning: 0, onchain: 0, lives: 0, paypal: 0, other: 0 },
  cars: { lightning: 0, onchain: 0, lives: 0, paypal: 0, other: 0 },
  beach: { lightning: 0, onchain: 0, lives: 0, paypal: 0, other: 0 },
});

export function FinanceBreakdown() {
  const [range, setRange] = useState<RangeKey>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { start, end } = useMemo(() => rangeFor(range, customStart, customEnd), [range, customStart, customEnd]);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const { data, isLoading } = useQuery({
    // Revenue is recognized straight-line across each sub's service period, so
    // we fetch every paid sub (not just those created in-window) and keep only
    // the portion that falls inside [start, end].
    queryKey: ["admin-finance-breakdown", startISO, endISO],
    queryFn: async () => {
      const [cleaning, beach, rental, food] = await Promise.all([
        supabaseDb
          .from("cleaning_subscriptions")
          .select("total_price_cents, monthly_price_cents, payment_method, created_at, service_start_date, service_end_date, start_date, end_date")
          .eq("payment_status", "paid")
          .is("deleted_at", null),
        supabaseDb
          .from("beach_club_subscriptions")
          .select("total_cents, payment_method, created_at, start_date, end_date")
          .eq("payment_status", "paid"),
        supabaseDb
          .from("rental_bookings")
          .select("total_cents, payment_method, created_at, start_date, end_date")
          .eq("payment_status", "paid")
          .is("deleted_at", null),
        supabaseDb
          .from("food_subscriptions")
          .select("weekly_price_cents, commitment_weeks, status, payment_method, periods_paid, created_at, started_at")
          .in("status", ["active", "paused", "expired"]),
      ]);

      const matrix = emptyMatrix();
      let count = 0;
      const add = (cat: CategoryKey, method: unknown, cents: number) => {
        if (cents > 0) { matrix[cat][normMethod(method)] += cents; count++; }
      };

      (cleaning.data ?? []).forEach((r: any) => {
        add("cleaning", r.payment_method, recognizedCents({
          totalCents: r.total_price_cents || r.monthly_price_cents || 0,
          serviceStart: r.service_start_date || r.start_date || r.created_at,
          serviceEnd: r.service_end_date || r.end_date,
          fallbackDays: 30,
        }, start, end));
      });
      (beach.data ?? []).forEach((r: any) => {
        add("beach", r.payment_method, recognizedCents({
          totalCents: r.total_cents || 0,
          serviceStart: r.start_date || r.created_at,
          serviceEnd: r.end_date,
          fallbackDays: 30,
        }, start, end));
      });
      (rental.data ?? []).forEach((r: any) => {
        add("cars", r.payment_method, recognizedCents({
          totalCents: r.total_cents || 0,
          serviceStart: r.start_date || r.created_at,
          serviceEnd: r.end_date,
          fallbackDays: 1,
        }, start, end));
      });
      (food.data ?? []).forEach((r: any) => {
        // Food is weekly: total = weekly × commitment_weeks × periods_paid, spread
        // across that many weeks from the start.
        const weeks = (r.commitment_weeks || 1) * (r.periods_paid || 1);
        const startDay = r.started_at || r.created_at;
        add("food", r.payment_method, recognizedCents({
          totalCents: (r.weekly_price_cents || 0) * weeks,
          serviceStart: startDay,
          serviceEnd: startDay ? addDaysISO(startDay, weeks * 7) : null,
          fallbackDays: weeks * 7,
        }, start, end));
      });

      return { matrix, count };
    },
  });

  const matrix = data?.matrix ?? emptyMatrix();
  const methodTotals = (m: MethodKey) => CATEGORIES.reduce((s, c) => s + matrix[c.key][m], 0);
  const categoryTotal = (c: CategoryKey) => METHODS.reduce((s, m) => s + matrix[c][m.key], 0);
  const grandTotal = CATEGORIES.reduce((s, c) => s + categoryTotal(c.key), 0);

  // ─── Detailed CSV (per-transaction, with user + plan) ───────────────────────
  const [detailedLoading, setDetailedLoading] = useState(false);

  const exportDetailedCsv = async () => {
    setDetailedLoading(true);
    try {
      const [cleaning, food, cars, beach] = await Promise.all([
        supabaseDb
          .from("cleaning_subscriptions")
          .select("id, user_id, client_id, package_id, total_price_cents, monthly_price_cents, payment_method, payment_reference, payment_status, subscription_status, created_at, service_start_date, service_end_date, apartment_note")
          .eq("payment_status", "paid").is("deleted_at", null)
          .gte("created_at", startISO).lte("created_at", endISO),
        supabaseDb
          .from("food_subscriptions")
          .select("id, user_id, provider_id, meal_plan_id, customer_name, weekly_price_cents, commitment_weeks, periods_paid, payment_method, payment_reference, payment_status, status, created_at, started_at, end_date")
          .in("status", ["active", "paused", "expired"])
          .gte("created_at", startISO).lte("created_at", endISO),
        supabaseDb
          .from("rental_bookings")
          .select("id, user_id, vehicle_id, total_cents, payment_method, payment_reference, payment_status, status, created_at, start_date, end_date")
          .eq("payment_status", "paid").is("deleted_at", null)
          .gte("created_at", startISO).lte("created_at", endISO),
        supabaseDb
          .from("beach_club_subscriptions")
          .select("id, user_id, customer_name, customer_email, plan_name, people, total_cents, payment_method, payment_reference, payment_status, status, created_at, start_date, end_date")
          .eq("payment_status", "paid")
          .gte("created_at", startISO).lte("created_at", endISO),
      ]);

      // Resolve names in bulk
      const userIds = [...new Set([
        ...(cleaning.data ?? []).map((r: any) => r.user_id),
        ...(food.data ?? []).map((r: any) => r.user_id),
        ...(cars.data ?? []).map((r: any) => r.user_id),
        ...(beach.data ?? []).map((r: any) => r.user_id),
      ].filter(Boolean))];
      const clientIds = [...new Set((cleaning.data ?? []).map((r: any) => r.client_id).filter(Boolean))];
      const pkgIds    = [...new Set((cleaning.data ?? []).map((r: any) => r.package_id).filter(Boolean))];
      const mealIds   = [...new Set((food.data ?? []).map((r: any) => r.meal_plan_id).filter(Boolean))];
      const provIds   = [...new Set((food.data ?? []).map((r: any) => r.provider_id).filter(Boolean))];
      const vehIds    = [...new Set((cars.data ?? []).map((r: any) => r.vehicle_id).filter(Boolean))];

      const [users, clients, pkgs, meals, provs, vehs] = await Promise.all([
        userIds.length   ? supabaseDb.from("users").select("id,email,name,display_name").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
        clientIds.length ? supabaseDb.from("cleaning_clients").select("id,company_name,email").in("id", clientIds) : Promise.resolve({ data: [] as any[] }),
        pkgIds.length    ? supabaseDb.from("cleaning_packages").select("id,name").in("id", pkgIds) : Promise.resolve({ data: [] as any[] }),
        mealIds.length   ? supabaseDb.from("food_meal_plans").select("id,name").in("id", mealIds) : Promise.resolve({ data: [] as any[] }),
        provIds.length   ? supabaseDb.from("food_providers").select("id,name").in("id", provIds) : Promise.resolve({ data: [] as any[] }),
        vehIds.length    ? supabaseDb.from("rental_vehicles").select("id,name").in("id", vehIds) : Promise.resolve({ data: [] as any[] }),
      ]);

      const userMap   = new Map((users.data ?? []).map((u: any) => [u.id, u]));
      const clientMap = new Map((clients.data ?? []).map((c: any) => [c.id, c]));
      const pkgMap    = new Map((pkgs.data ?? []).map((p: any) => [p.id, p.name]));
      const mealMap   = new Map((meals.data ?? []).map((p: any) => [p.id, p.name]));
      const provMap   = new Map((provs.data ?? []).map((p: any) => [p.id, p.name]));
      const vehMap    = new Map((vehs.data ?? []).map((v: any) => [v.id, v.name]));

      type Row = {
        service: string; user: string; email: string; plan: string;
        method: string; amountUsd: string; reference: string;
        periodStart: string; periodEnd: string; createdAt: string; status: string;
      };
      const nameOf = (userId?: string, fallbackName?: string, fallbackEmail?: string): { name: string; email: string } => {
        const u: any = userId ? userMap.get(userId) : null;
        return {
          name: u?.display_name || u?.name || fallbackName || "",
          email: u?.email || fallbackEmail || "",
        };
      };
      const iso = (v: any) => (v ? String(v).slice(0, 10) : "");
      const rows: Row[] = [];

      (cleaning.data ?? []).forEach((r: any) => {
        const cents = r.total_price_cents || r.monthly_price_cents || 0;
        const c: any = r.client_id ? clientMap.get(r.client_id) : null;
        const who = nameOf(r.user_id, c?.company_name, c?.email);
        rows.push({
          service: "Cleaning",
          user: who.name, email: who.email,
          plan: pkgMap.get(r.package_id) || (r.package_id ? "Cleaning plan" : "One-time cleaning"),
          method: String(r.payment_method || ""),
          amountUsd: (cents / 100).toFixed(2),
          reference: r.payment_reference || "",
          periodStart: iso(r.service_start_date),
          periodEnd: iso(r.service_end_date),
          createdAt: iso(r.created_at),
          status: r.subscription_status || "",
        });
      });
      (food.data ?? []).forEach((r: any) => {
        const cents = (r.weekly_price_cents || 0) * (r.commitment_weeks || 1) * (r.periods_paid || 1);
        const who = nameOf(r.user_id, r.customer_name);
        const provider = provMap.get(r.provider_id) || "";
        const meal = mealMap.get(r.meal_plan_id) || "Food plan";
        rows.push({
          service: "Food",
          user: who.name, email: who.email,
          plan: provider ? `${provider} — ${meal}` : meal,
          method: String(r.payment_method || ""),
          amountUsd: (cents / 100).toFixed(2),
          reference: r.payment_reference || "",
          periodStart: iso(r.started_at),
          periodEnd: iso(r.end_date),
          createdAt: iso(r.created_at),
          status: r.status || "",
        });
      });
      (cars.data ?? []).forEach((r: any) => {
        const who = nameOf(r.user_id);
        rows.push({
          service: "Car Rental",
          user: who.name, email: who.email,
          plan: vehMap.get(r.vehicle_id) || "Vehicle rental",
          method: String(r.payment_method || ""),
          amountUsd: ((r.total_cents || 0) / 100).toFixed(2),
          reference: r.payment_reference || "",
          periodStart: iso(r.start_date),
          periodEnd: iso(r.end_date),
          createdAt: iso(r.created_at),
          status: r.status || "",
        });
      });
      (beach.data ?? []).forEach((r: any) => {
        const who = nameOf(r.user_id, r.customer_name, r.customer_email);
        rows.push({
          service: "Beach Club",
          user: who.name, email: who.email,
          plan: r.plan_name ? `${r.plan_name} (${r.people || 1} person)` : "Beach Club membership",
          method: String(r.payment_method || ""),
          amountUsd: ((r.total_cents || 0) / 100).toFixed(2),
          reference: r.payment_reference || "",
          periodStart: iso(r.start_date),
          periodEnd: iso(r.end_date),
          createdAt: iso(r.created_at),
          status: r.status || "",
        });
      });

      // Sort newest first
      rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

      // Totals per service + grand total (last rows in the CSV)
      const serviceSum: Record<string, number> = {};
      let grand = 0;
      rows.forEach((r) => {
        const cents = Math.round(Number(r.amountUsd) * 100);
        serviceSum[r.service] = (serviceSum[r.service] || 0) + cents;
        grand += cents;
      });
      const emptyCells = ["", "", "", "", "", "", "", ""];
      const totalRows = [
        ["", "", "", "", "", "", "", "", "", "", ""], // spacer
        ...Object.entries(serviceSum).map(([svc, cents]) => [
          "TOTAL", svc, "", "", "", (cents / 100).toFixed(2), ...emptyCells,
        ]),
        ["GRAND TOTAL", `${rows.length} payments`, "", "", "", (grand / 100).toFixed(2), ...emptyCells],
      ];

      const header = ["Service", "Customer", "Email", "Plan", "Payment method", "Amount (USD)", "Reference", "Period start", "Period end", "Created at", "Status"];
      const csv = [
        header,
        ...rows.map((r) => [r.service, r.user, r.email, r.plan, r.method, r.amountUsd, r.reference, r.periodStart, r.periodEnd, r.createdAt, r.status]),
        ...totalRows,
      ]
        .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\r\n");

      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-detailed_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDetailedLoading(false);
    }
  };

  // ─── CSV export (current period, same matrix as the table) ──────────────────
  const exportCsv = () => {
    const usd = (cents: number) => (cents / 100).toFixed(2);
    const header = ["Service", ...METHODS.map((m) => m.label), "Total"];
    const rows = CATEGORIES.map((c) => [
      c.label,
      ...METHODS.map((m) => usd(matrix[c.key][m.key])),
      usd(categoryTotal(c.key)),
    ]);
    const totalRow = [
      "Total",
      ...METHODS.map((m) => usd(methodTotals(m.key))),
      usd(grandTotal),
    ];
    const csv = [header, ...rows, totalRow]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-breakdown_${format(start, "yyyy-MM-dd")}_to_${format(end, "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="gap-space-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-space-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Finance breakdown
          </CardTitle>
          <CardDescription>
            Revenue by service and payment method, recognized straight-line across each subscription's service period — a 3-month plan books ~⅓ in each month it covers. Payments with no recorded method appear under "Other".
          </CardDescription>
        </div>
        <div className="flex flex-col items-stretch gap-space-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            className="h-9 gap-2 rounded-full px-4"
            onClick={exportCsv}
            disabled={isLoading || grandTotal === 0}
            title="Summary CSV: revenue by service × payment method"
          >
            <Download className="h-4 w-4" />
            Summary CSV
          </Button>
          <Button
            variant="outline"
            className="h-9 gap-2 rounded-full px-4"
            onClick={exportDetailedCsv}
            disabled={isLoading || detailedLoading || grandTotal === 0}
            title="Detailed CSV: every paid transaction — customer, plan, amount, method, dates, reference"
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
                <Button
                  variant="secondary"
                  className={cn(
                    "h-9 justify-start gap-2 rounded-full px-4 font-normal",
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
                      className="rounded-full text-muted-foreground"
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
      </CardHeader>
      <CardContent>
        <div className="mb-space-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/10 px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarRange className="h-4 w-4" />
            {format(start, "MMM d, yyyy")} — {format(end, "MMM d, yyyy")}
          </span>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total revenue</p>
            <p className="text-2xl font-black tabular-nums text-primary">{formatUSD(grandTotal)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-semibold">Service</th>
                {METHODS.map((m) => (
                  <th key={m.key} className="px-3 py-2 text-right font-semibold">{m.label}</th>
                ))}
                <th className="pl-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className={cn(isLoading && "opacity-50")}>
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                return (
                  <tr key={c.key} className="border-b border-border/40">
                    <td className="py-2.5 pr-4">
                      <span className="flex items-center gap-2 font-semibold text-foreground">
                        <Icon className={cn("h-4 w-4", c.color)} />
                        {c.label}
                      </span>
                    </td>
                    {METHODS.map((m) => (
                      <td key={m.key} className={cn("px-3 py-2.5 text-right font-mono tabular-nums", matrix[c.key][m.key] ? "text-foreground" : "text-muted-foreground/40")}>
                        {matrix[c.key][m.key] ? formatUSD(matrix[c.key][m.key]) : "—"}
                      </td>
                    ))}
                    <td className="pl-3 py-2.5 text-right font-mono font-bold tabular-nums text-foreground">
                      {categoryTotal(c.key) ? formatUSD(categoryTotal(c.key)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-foreground">
                <td className="py-2.5 pr-4 font-bold">Total</td>
                {METHODS.map((m) => (
                  <td key={m.key} className="px-3 py-2.5 text-right font-mono font-bold tabular-nums">
                    {methodTotals(m.key) ? formatUSD(methodTotals(m.key)) : "—"}
                  </td>
                ))}
                <td className="pl-3 py-2.5 text-right font-mono font-black tabular-nums text-primary">
                  {formatUSD(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
