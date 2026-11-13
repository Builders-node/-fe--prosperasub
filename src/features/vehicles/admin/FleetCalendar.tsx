import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Car, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Photo } from "@/components/patterns/Photo";
import { cn } from "@/lib/utils";
import { addDaysISO, holds, todayHN, type FleetBlock, type FleetBooking, type FleetVehicle } from "./fleetData";

/**
 * The fleet's month at a glance — a car per row, a day per column, every
 * booking and block a bar across its days. The one screen a rental company
 * actually runs on: where the gaps are, what goes out today, what is late.
 *
 * Click a bar to open it; click a free day to start a booking there.
 */

const SPAN = 28;
const COL = 40; // px per day

const TONE: Record<string, string> = {
  pending: "bg-attention/30 text-foreground",
  unpaid: "bg-attention/30 text-foreground",
  confirmed: "bg-primary text-primary-foreground",
  paid: "bg-primary text-primary-foreground",
  active: "bg-positive text-white",
  completed: "bg-muted-foreground/30 text-foreground",
  // Flat, like the rest of the design: a dashed outline says "not bookable".
  block: "bg-inset text-muted-foreground outline-dashed outline-1 -outline-offset-1 outline-muted-foreground/50",
};

export function FleetCalendar({ vehicles, bookings, blocks, onOpenBooking, onOpenBlock, onNew }: {
  vehicles: FleetVehicle[];
  bookings: FleetBooking[];
  blocks: FleetBlock[];
  onOpenBooking: (b: FleetBooking) => void;
  onOpenBlock: (b: FleetBlock) => void;
  onNew: (vehicleId: string, date: string) => void;
}) {
  const today = todayHN();
  const [from, setFrom] = useState(addDaysISO(today, -3));
  const to = addDaysISO(from, SPAN - 1);
  const days = useMemo(() => Array.from({ length: SPAN }, (_, i) => addDaysISO(from, i)), [from]);
  const idx = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  /** A bar's left and width within the window, or null when it misses it. */
  const place = (start: string, end: string) => {
    if (end < from || start > to) return null;
    const a = Math.max(0, idx(start));
    const b = Math.min(SPAN - 1, idx(end));
    return { left: a * COL + 2, width: (b - a + 1) * COL - 4, clipL: start < from, clipR: end > to };
  };

  const rows = vehicles.map((v) => ({
    v,
    bookings: bookings.filter((b) => b.vehicle_id === v.id && holds(b)),
    blocks: blocks.filter((k) => k.vehicle_id === v.id),
  }));

  return (
    <section className="space-y-3 rounded-radius-lg bg-card p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Two weeks back" onClick={() => setFrom(addDaysISO(from, -14))}><ChevronLeft className="h-5 w-5" /></Button>
          <Button size="sm" variant="secondary" onClick={() => setFrom(addDaysISO(today, -3))}>Today</Button>
          <Button size="icon" variant="ghost" aria-label="Two weeks ahead" onClick={() => setFrom(addDaysISO(from, 14))}><ChevronRight className="h-5 w-5" /></Button>
          <span className="ml-2 text-title font-semibold text-foreground">
            {format(new Date(`${from}T00:00:00`), "MMM d")} – {format(new Date(`${to}T00:00:00`), "MMM d, yyyy")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-meta text-muted-foreground">
          <Legend tone={TONE.pending} label="Unpaid" />
          <Legend tone={TONE.confirmed} label="Booked" />
          <Legend tone={TONE.active} label="Out now" />
          <Legend tone={TONE.completed} label="Done" />
          <Legend tone={TONE.block} label="Blocked" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ width: 200 + SPAN * COL }}>
          {/* Day header */}
          <div className="flex">
            <div className="w-[200px] shrink-0" />
            {days.map((d) => {
              const dt = new Date(`${d}T00:00:00`);
              const weekend = dt.getDay() === 0 || dt.getDay() === 6;
              return (
                <div key={d} style={{ width: COL }}
                  className={cn("shrink-0 pb-1 text-center text-[11px] leading-4", d === today ? "font-semibold text-primary" : weekend ? "text-muted-foreground/70" : "text-muted-foreground")}>
                  <div>{format(dt, "EEEEE")}</div>
                  <div className="text-[13px]">{format(dt, "d")}</div>
                </div>
              );
            })}
          </div>

          {rows.length === 0 && <p className="p-4 text-body text-muted-foreground">No vehicles yet.</p>}

          {rows.map(({ v, bookings: bs, blocks: ks }) => (
            <div key={v.id} className="flex items-center border-t border-border/40">
              <div className="flex w-[200px] shrink-0 items-center gap-2 py-2 pr-2">
                <span className="h-8 w-11 shrink-0 overflow-hidden rounded-[6px] bg-inset"><Photo src={v.image_url} icon={Car} /></span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-[14px] font-semibold", v.status === "public" ? "text-foreground" : "text-muted-foreground")}>{v.name}</span>
                  {v.status !== "public" && <span className="block text-[11px] text-muted-foreground">hidden</span>}
                </span>
              </div>
              <div className="relative h-11" style={{ width: SPAN * COL }}>
                {/* Free days: a click starts a booking there. */}
                {days.map((d, i) => (
                  <button key={d} type="button" aria-label={`New booking for ${v.name} on ${d}`}
                    onClick={() => onNew(v.id, d)}
                    style={{ left: i * COL, width: COL }}
                    className={cn("group absolute inset-y-0 flex items-center justify-center hover:bg-inset", d === today && "bg-primary/5")}>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                ))}
                {ks.map((k) => {
                  const p = place(k.start_date, k.end_date);
                  if (!p) return null;
                  return (
                    <button key={k.id} type="button" onClick={() => onOpenBlock(k)} title={k.reason ?? "Blocked"}
                      style={{ left: p.left, width: p.width }}
                      className={cn("absolute inset-y-1.5 truncate rounded-[8px] px-2 text-left text-[12px] font-semibold", TONE.block)}>
                      {k.reason || "Blocked"}
                    </button>
                  );
                })}
                {bs.map((b) => {
                  const p = place(b.start_date, b.end_date);
                  if (!p) return null;
                  const tone = b.status === "active" ? "active" : b.status === "completed" ? "completed" : b.payment_status !== "paid" ? "unpaid" : "confirmed";
                  return (
                    <button key={b.id} type="button" onClick={() => onOpenBooking(b)}
                      title={`${b.customer} · ${b.start_date} → ${b.end_date}`}
                      style={{ left: p.left, width: p.width }}
                      className={cn("absolute inset-y-1.5 truncate px-2 text-left text-[12px] font-semibold",
                        p.clipL ? "rounded-l-none" : "rounded-l-[8px]", p.clipR ? "rounded-r-none" : "rounded-r-[8px]", TONE[tone])}>
                      {b.customer}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-5 rounded-[4px]", tone)} />{label}</span>;
}
