import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Car } from "lucide-react";
import { Photo } from "@/components/patterns/Photo";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { addDaysISO, holds, overlapDays, todayHN, type FleetBlock, type FleetBooking, type FleetVehicle } from "./fleetData";

/**
 * The fleet in numbers, and today's jobs.
 *
 * Money and utilisation over a period (7 / 30 / 90 days back): what was
 * earned, how full the cars were, how long people rent for. Then what has to
 * happen today — cars going out, cars coming back, rentals that are late —
 * and a row per car, so the one that sits idle is visible.
 */

const PERIODS = [7, 30, 90] as const;

export function FleetOverview({ vehicles, bookings, blocks, onOpenBooking }: {
  vehicles: FleetVehicle[];
  bookings: FleetBooking[];
  blocks: FleetBlock[];
  onOpenBooking: (b: FleetBooking) => void;
}) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const today = todayHN();
  const from = addDaysISO(today, -(days - 1));
  const live = bookings.filter(holds);

  const stats = useMemo(() => {
    const paidIn = live.filter((b) => b.payment_status === "paid" && b.created_at.slice(0, 10) >= from);
    const revenue = paidIn.reduce((s, b) => s + (Number(b.total_cents) || 0), 0);
    const bookedDays = live.reduce((s, b) => s + overlapDays(b.start_date, b.end_date, from, today), 0);
    const blockedDays = blocks.reduce((s, k) => s + overlapDays(k.start_date, k.end_date, from, today), 0);
    const capacity = Math.max(1, vehicles.length * days - blockedDays);
    const lengths = paidIn.map((b) => b.rental_days).filter((n) => n > 0);
    return {
      revenue,
      count: paidIn.length,
      utilisation: Math.min(100, Math.round((bookedDays / capacity) * 100)),
      avgDays: lengths.length ? lengths.reduce((a, n) => a + n, 0) / lengths.length : 0,
      avgTicket: paidIn.length ? Math.round(revenue / paidIn.length) : 0,
      unpaid: live.filter((b) => b.payment_status !== "paid" && b.status !== "completed" && b.end_date >= today),
    };
  }, [live, blocks, vehicles.length, days, from, today]);

  const name = (id: string) => vehicles.find((v) => v.id === id)?.name ?? "Vehicle";
  const goingOut = live.filter((b) => b.start_date === today && b.status !== "active" && b.status !== "completed");
  const comingBack = live.filter((b) => b.end_date === today && b.status === "active");
  const late = live.filter((b) => b.status === "active" && b.end_date < today);
  const notCollected = live.filter((b) => b.start_date < today && b.end_date >= today && (b.status === "confirmed" || b.status === "pending") && b.payment_status === "paid");

  const perCar = vehicles.map((v) => {
    const mine = live.filter((b) => b.vehicle_id === v.id);
    const booked = mine.reduce((s, b) => s + overlapDays(b.start_date, b.end_date, from, today), 0);
    const earned = mine.filter((b) => b.payment_status === "paid" && b.created_at.slice(0, 10) >= from).reduce((s, b) => s + (Number(b.total_cents) || 0), 0);
    const next = mine.filter((b) => b.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const now = mine.find((b) => b.start_date <= today && b.end_date >= today);
    return { v, booked, util: Math.round((booked / days) * 100), earned, next, now };
  }).sort((a, b) => b.util - a.util);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-heading font-semibold text-foreground">Last {days} days</h2>
        <div className="flex rounded-full bg-inset p-0.5">
          {PERIODS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={cn("h-8 rounded-full px-3 text-[13px] font-semibold", days === d ? "bg-segment text-foreground" : "text-muted-foreground")}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Kpi label="Revenue" value={formatUSD(stats.revenue)} />
        <Kpi label="Rentals paid" value={String(stats.count)} />
        <Kpi label="Utilisation" value={`${stats.utilisation}%`} hint="booked days ÷ available car-days" />
        <Kpi label="Average rental" value={stats.avgDays ? `${stats.avgDays.toFixed(1)} days` : "—"} />
        <Kpi label="Average ticket" value={stats.avgTicket ? formatUSD(stats.avgTicket) : "—"} />
      </div>

      {/* Today's jobs */}
      <div className="grid gap-2 md:grid-cols-2">
        <JobList title="Going out today" icon={ArrowUpRight} empty="Nothing goes out today." rows={goingOut} name={name} onOpen={onOpenBooking} />
        <JobList title="Coming back today" icon={ArrowDownLeft} empty="Nothing comes back today." rows={comingBack} name={name} onOpen={onOpenBooking} />
        {(late.length > 0 || notCollected.length > 0) && (
          <JobList title="Needs attention" icon={AlertTriangle} tone="text-negative" empty=""
            rows={[...late, ...notCollected]} name={name} onOpen={onOpenBooking}
            note={(b) => (b.status === "active" ? `late since ${format(new Date(`${b.end_date}T00:00:00`), "MMM d")}` : "paid, not handed over")} />
        )}
        {stats.unpaid.length > 0 && (
          <JobList title={`Unpaid · ${formatUSD(stats.unpaid.reduce((s, b) => s + b.total_cents, 0))}`} icon={AlertTriangle} tone="text-attention" empty=""
            rows={stats.unpaid} name={name} onOpen={onOpenBooking} />
        )}
      </div>

      {/* Per car */}
      <section className="rounded-radius-lg bg-card p-3 md:p-4">
        <h3 className="mb-2 text-title font-semibold text-foreground">By vehicle</h3>
        <div className="space-y-1">
          {perCar.map(({ v, util, booked, earned, next, now }) => (
            <div key={v.id} className="flex items-center gap-3 rounded-radius-md p-2">
              <span className="h-10 w-14 shrink-0 overflow-hidden rounded-[8px] bg-inset"><Photo src={v.image_url} icon={Car} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-foreground">{v.name}</p>
                <p className="truncate text-meta text-muted-foreground">
                  {now ? `Out now · back ${format(new Date(`${now.end_date}T00:00:00`), "MMM d")}` : next ? `Next: ${format(new Date(`${next.start_date}T00:00:00`), "MMM d")}` : "Nothing booked ahead"}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-inset">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, util)}%` }} />
                </div>
              </div>
              <div className="w-24 shrink-0 text-right">
                <p className="text-body font-semibold tabular-nums text-foreground">{Math.min(100, util)}%</p>
                <p className="text-meta tabular-nums text-muted-foreground">{booked}d · {formatUSD(earned)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-radius-lg bg-card p-3" title={hint}>
      <p className="truncate text-meta text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-heading font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function JobList({ title, icon: Icon, rows, name, onOpen, empty, tone, note }: {
  title: string; icon: typeof Car; rows: FleetBooking[]; name: (id: string) => string;
  onOpen: (b: FleetBooking) => void; empty: string; tone?: string; note?: (b: FleetBooking) => string;
}) {
  return (
    <section className="rounded-radius-lg bg-card p-3">
      <h3 className={cn("mb-1 flex items-center gap-1.5 text-title font-semibold text-foreground", tone)}><Icon className="h-4 w-4" /> {title}</h3>
      {rows.length === 0 ? <p className="p-2 text-meta text-muted-foreground">{empty}</p> : rows.map((b) => (
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
