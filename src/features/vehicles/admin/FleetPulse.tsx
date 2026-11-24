import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Car } from "lucide-react";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { addDaysISO, holds, overlapDays, todayHN, type FleetBlock, type FleetBooking, type FleetVehicle } from "./fleetData";

/**
 * The line above the schedule: how the fleet did, and what today needs.
 *
 * Was five big tiles (half of them "—" or "$0.00" on a quiet fleet), then two
 * cards whose whole content was "Nothing goes out today". Now one thin strip
 * with the change against the period before — a number alone says nothing —
 * and today's lists appear only when they hold something.
 */

const PERIODS = [7, 30, 90] as const;

interface Window { from: string; to: string; days: number }

function measure(live: FleetBooking[], blocks: FleetBlock[], cars: number, w: Window) {
  const paidIn = live.filter((b) => b.payment_status === "paid" && b.created_at.slice(0, 10) >= w.from && b.created_at.slice(0, 10) <= w.to);
  const revenue = paidIn.reduce((s, b) => s + (Number(b.total_cents) || 0), 0);
  const bookedDays = live.reduce((s, b) => s + overlapDays(b.start_date, b.end_date, w.from, w.to), 0);
  const blockedDays = blocks.reduce((s, k) => s + overlapDays(k.start_date, k.end_date, w.from, w.to), 0);
  const capacity = Math.max(1, cars * w.days - blockedDays);
  const lengths = paidIn.map((b) => b.rental_days).filter((n) => n > 0);
  return {
    revenue,
    rentals: paidIn.length,
    utilisation: Math.min(100, Math.round((bookedDays / capacity) * 100)),
    avgDays: lengths.length ? lengths.reduce((a, n) => a + n, 0) / lengths.length : 0,
  };
}

export function FleetPulse({ vehicles, bookings, blocks, onOpenBooking }: {
  vehicles: FleetVehicle[];
  bookings: FleetBooking[];
  blocks: FleetBlock[];
  onOpenBooking: (b: FleetBooking) => void;
}) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const today = todayHN();
  const live = useMemo(() => bookings.filter(holds), [bookings]);

  const { now, before } = useMemo(() => {
    const cur: Window = { from: addDaysISO(today, -(days - 1)), to: today, days };
    const prev: Window = { from: addDaysISO(cur.from, -days), to: addDaysISO(cur.from, -1), days };
    return { now: measure(live, blocks, vehicles.length, cur), before: measure(live, blocks, vehicles.length, prev) };
  }, [live, blocks, vehicles.length, days, today]);

  const name = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "Vehicle";
  const goingOut = live.filter((b) => b.start_date === today && b.status !== "active" && b.status !== "completed");
  const comingBack = live.filter((b) => b.end_date === today && b.status === "active");
  const late = live.filter((b) => b.status === "active" && b.end_date < today);
  const notCollected = live.filter((b) => b.start_date < today && b.end_date >= today && (b.status === "confirmed" || b.status === "pending") && b.payment_status === "paid");
  const unpaid = live.filter((b) => b.payment_status !== "paid" && b.status !== "completed" && b.end_date >= today);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-radius-lg bg-card px-3 py-2.5 md:px-4">
        <div className="grid basis-full grid-cols-2 sm:basis-auto sm:flex-1 gap-x-6 gap-y-2 sm:flex sm:w-auto sm:flex-wrap sm:items-baseline">
          <Metric label="Revenue" value={formatUSD(now.revenue)} delta={pct(now.revenue, before.revenue)} />
          <Metric label="Rentals" value={String(now.rentals)} delta={pct(now.rentals, before.rentals)} />
          <Metric label="Utilisation" value={`${now.utilisation}%`} delta={points(now.utilisation, before.utilisation)} hint="Booked days ÷ available car-days" />
          <Metric label="Avg rental" value={now.avgDays ? `${now.avgDays.toFixed(1)} d` : "—"} delta={now.avgDays && before.avgDays ? pct(now.avgDays, before.avgDays) : null} />
        </div>
        <div className="order-first flex self-start rounded-full bg-inset p-0.5 sm:order-none sm:self-auto" role="group" aria-label="Period">
          {PERIODS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={cn("h-7 rounded-full px-2.5 text-[12px] font-semibold", days === d ? "bg-segment text-foreground" : "text-muted-foreground")}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Today's jobs — only the lists that have something in them. */}
      {(goingOut.length + comingBack.length + late.length + notCollected.length + unpaid.length) > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {goingOut.length > 0 && <JobList title="Going out today" icon={ArrowUpRight} rows={goingOut} name={name} onOpen={onOpenBooking} />}
          {comingBack.length > 0 && <JobList title="Coming back today" icon={ArrowDownLeft} rows={comingBack} name={name} onOpen={onOpenBooking} />}
          {(late.length > 0 || notCollected.length > 0) && (
            <JobList title="Needs attention" icon={AlertTriangle} tone="text-negative"
              rows={[...late, ...notCollected]} name={name} onOpen={onOpenBooking}
              note={(b) => (b.status === "active" ? `late since ${format(new Date(`${b.end_date}T00:00:00`), "MMM d")}` : "paid, not handed over")} />
          )}
          {unpaid.length > 0 && (
            <JobList title={`Unpaid · ${formatUSD(unpaid.reduce((s, b) => s + b.total_cents, 0))}`} icon={AlertTriangle} tone="text-attention"
              rows={unpaid} name={name} onOpen={onOpenBooking} />
          )}
        </div>
      )}
    </div>
  );
}

/** Relative change, or null when there is nothing to compare with. */
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
/** Change in percentage points — for a number that is already a percentage. */
const points = (a: number, b: number) => (a === 0 && b === 0 ? null : a - b);

function Metric({ label, value, delta, hint }: { label: string; value: string; delta: number | null; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1.5" title={hint}>
      <span className="text-meta text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-body font-semibold tabular-nums text-foreground">{value}</span>
      {delta != null && delta !== 0 && (
        <span className={cn("text-[12px] font-semibold tabular-nums", delta > 0 ? "text-positive" : "text-negative")}
          title="Against the period before">
          {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}{label === "Utilisation" ? "pt" : "%"}
        </span>
      )}
      </span>
    </div>
  );
}

function JobList({ title, icon: Icon, rows, name, onOpen, tone, note }: {
  title: string; icon: typeof Car; rows: FleetBooking[]; name: (id: string) => string;
  onOpen: (b: FleetBooking) => void; tone?: string; note?: (b: FleetBooking) => string;
}) {
  return (
    <section className="rounded-radius-lg bg-card p-3">
      <h3 className={cn("mb-1 flex items-center gap-1.5 text-title font-semibold text-foreground", tone)}><Icon className="h-4 w-4" /> {title}</h3>
      {rows.map((b) => (
        <button key={b.id} type="button" onClick={() => onOpen(b)}
          className="flex w-full items-center justify-between gap-3 rounded-radius-md p-2 text-left hover:bg-inset">
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold text-foreground">{b.customer}</span>
            <span className="block truncate text-meta text-muted-foreground">
              {name(b.vehicle_id)}{note ? ` · ${note(b)}` : b.delivery_address ? ` · ${b.delivery_address}` : " · pickup at the office"}
            </span>
          </span>
          <span className="shrink-0 text-meta tabular-nums text-muted-foreground">{formatUSD(b.total_cents)}</span>
        </button>
      ))}
    </section>
  );
}
