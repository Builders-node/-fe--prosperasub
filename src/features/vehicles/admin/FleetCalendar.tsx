import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Ban, Car, ChevronLeft, ChevronRight, Eye, EyeOff, MoreVertical, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Photo } from "@/components/patterns/Photo";
import { cn } from "@/lib/utils";
import { addDaysISO, holds, todayHN, type FleetBlock, type FleetBooking, type FleetVehicle } from "./fleetData";

/**
 * The fleet's schedule — a car per row, a day per column, every booking and
 * block a bar across its days. The one screen a rental company actually runs
 * on: where the gaps are, what goes out today, what is late.
 *
 * Click a bar to open it. Click a free day, or drag across several with a
 * mouse, to book or block those days. Each car says where it is right now and
 * carries its own actions, so "Block days" never has to ask which car.
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

/** Where a car is today, in one word. */
export type CarState = "available" | "booked" | "out" | "late" | "blocked" | "hidden";

const STATE_STYLE: Record<CarState, { label: string; dot: string; text: string }> = {
  available: { label: "Available", dot: "bg-positive", text: "text-positive" },
  booked: { label: "Booked today", dot: "bg-attention", text: "text-foreground" },
  out: { label: "Rented", dot: "bg-primary", text: "text-foreground" },
  late: { label: "Late", dot: "bg-negative", text: "text-negative" },
  blocked: { label: "Blocked", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  hidden: { label: "Hidden", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

export function carState(v: FleetVehicle, bookings: FleetBooking[], blocks: FleetBlock[], today: string): { state: CarState; note?: string } {
  const mine = bookings.filter((b) => b.vehicle_id === v.id && holds(b));
  const late = mine.find((b) => b.status === "active" && b.end_date < today);
  if (late) return { state: "late", note: `due ${short(late.end_date)}` };
  const out = mine.find((b) => b.status === "active");
  if (out) return { state: "out", note: `back ${short(out.end_date)}` };
  // Booked for today but not handed over yet.
  const due = mine.find((b) => b.start_date <= today && b.end_date >= today && b.status !== "completed");
  if (due) return { state: "booked", note: "pickup due" };
  const block = blocks.find((k) => k.vehicle_id === v.id && k.start_date <= today && k.end_date >= today);
  if (block) return { state: "blocked", note: block.reason || `until ${short(block.end_date)}` };
  if (v.status !== "public") return { state: "hidden" };
  return { state: "available" };
}

const short = (iso: string) => format(new Date(`${iso}T00:00:00`), "MMM d");

export interface FleetCalendarActions {
  onOpenBooking: (b: FleetBooking) => void;
  onOpenBlock: (b: FleetBlock) => void;
  /** A free day was clicked, or a range dragged. `end` is set only for a drag. */
  onNew: (vehicleId: string, start: string, end?: string, mode?: "booking" | "block") => void;
  onEditVehicle?: (vehicleId: string) => void;
  onToggleVehicle?: (vehicleId: string) => void;
}

export function FleetCalendar({ vehicles, bookings, blocks, onOpenBooking, onOpenBlock, onNew, onEditVehicle, onToggleVehicle }: {
  vehicles: FleetVehicle[];
  bookings: FleetBooking[];
  blocks: FleetBlock[];
} & FleetCalendarActions) {
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
    now: carState(v, bookings, blocks, today),
  }));

  // ── Drag across free days (mouse only: a finger on a phone scrolls) ──────
  const [sel, setSel] = useState<{ vehicleId: string; a: number; b: number } | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;
  const colAt = (e: React.PointerEvent<HTMLElement>, el: HTMLElement) =>
    Math.max(0, Math.min(SPAN - 1, Math.floor((e.clientX - el.getBoundingClientRect().left) / COL)));

  const laneHandlers = (vehicleId: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      // Bars are buttons of their own; only the empty lane starts a range.
      if (e.button !== 0 || e.pointerType !== "mouse" || (e.target as HTMLElement).closest("[data-bar]")) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const c = colAt(e, e.currentTarget);
      setSel({ vehicleId, a: c, b: c });
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const s = selRef.current;
      if (!s || s.vehicleId !== vehicleId) return;
      const c = colAt(e, e.currentTarget);
      if (c !== s.b) setSel({ ...s, b: c });
    },
    onPointerUp: () => {
      const s = selRef.current;
      if (!s || s.vehicleId !== vehicleId) return;
      setSel(null);
      const lo = Math.min(s.a, s.b);
      const hi = Math.max(s.a, s.b);
      onNew(vehicleId, days[lo], lo === hi ? undefined : days[hi]);
    },
    onPointerCancel: () => setSel(null),
  });

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
      <p className="hidden text-meta text-muted-foreground md:block">Click a free day or drag across several to book or block them.</p>

      <div className="-mx-3 overflow-x-auto md:-mx-4">
        <div className="px-3 md:px-4" style={{ width: "max-content" }}>
          {/* Day header */}
          <div className="flex">
            <div className="sticky left-0 z-20 w-[164px] shrink-0 bg-card md:w-[288px]" />
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

          {rows.map(({ v, bookings: bs, blocks: ks, now }) => {
            const st = STATE_STYLE[now.state];
            const range = sel && sel.vehicleId === v.id ? { lo: Math.min(sel.a, sel.b), hi: Math.max(sel.a, sel.b) } : null;
            return (
              <div key={v.id} className="flex items-stretch border-t border-border/40">
                {/* The car: sticky, so its name and state stay put while the days scroll. */}
                <div className="sticky left-0 z-20 flex w-[164px] shrink-0 items-center gap-2 bg-card py-1.5 pr-1 md:w-[288px] md:pr-2">
                  <span className={cn("hidden h-9 w-12 shrink-0 overflow-hidden rounded-[6px] bg-inset md:block", v.status !== "public" && "opacity-50")}>
                    <Photo src={v.image_url} icon={Car} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14px] font-semibold", v.status === "public" ? "text-foreground" : "text-muted-foreground")}>{v.name}</span>
                    <span className={cn("flex items-center gap-1.5 truncate text-[12px]", st.text)}>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} />
                      <span className="truncate">{st.label}{now.note ? <span className="text-muted-foreground"> · {now.note}</span> : null}</span>
                    </span>
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Actions for ${v.name}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => onNew(v.id, today, undefined, "booking")}><Plus className="mr-2 h-3.5 w-3.5" /> New booking</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onNew(v.id, today, undefined, "block")}><Ban className="mr-2 h-3.5 w-3.5" /> Block days</DropdownMenuItem>
                      {(onEditVehicle || onToggleVehicle) && <DropdownMenuSeparator />}
                      {onEditVehicle && <DropdownMenuItem onSelect={() => onEditVehicle(v.id)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit vehicle</DropdownMenuItem>}
                      {onToggleVehicle && (
                        <DropdownMenuItem onSelect={() => onToggleVehicle(v.id)}>
                          {v.status === "public"
                            ? <><EyeOff className="mr-2 h-3.5 w-3.5" /> Hide from the storefront</>
                            : <><Eye className="mr-2 h-3.5 w-3.5" /> Show in the storefront</>}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="relative h-12 select-none" style={{ width: SPAN * COL }} {...laneHandlers(v.id)}>
                  {/* Free days: a click starts a booking there. */}
                  {days.map((d, i) => (
                    <button key={d} type="button" aria-label={`New booking for ${v.name} on ${d}`}
                      onClick={(e) => { if (e.detail === 0) onNew(v.id, d); }}
                      onPointerUp={(e) => { if (e.pointerType !== "mouse") onNew(v.id, d); }}
                      style={{ left: i * COL, width: COL }}
                      className={cn("group absolute inset-y-0 flex items-center justify-center hover:bg-inset", d === today && "bg-primary/5")}>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                    </button>
                  ))}
                  {range && (
                    <div aria-hidden className="pointer-events-none absolute inset-y-1 rounded-[8px] bg-primary/20 outline outline-1 -outline-offset-1 outline-primary"
                      style={{ left: range.lo * COL + 2, width: (range.hi - range.lo + 1) * COL - 4 }}>
                      <span className="block truncate px-2 pt-2.5 text-[12px] font-semibold text-foreground">
                        {range.hi - range.lo + 1} day{range.hi === range.lo ? "" : "s"}
                      </span>
                    </div>
                  )}
                  {ks.map((k) => {
                    const p = place(k.start_date, k.end_date);
                    if (!p) return null;
                    return (
                      <button key={k.id} data-bar type="button" onClick={() => onOpenBlock(k)} title={k.reason ?? "Blocked"}
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
                      <button key={b.id} data-bar type="button" onClick={() => onOpenBooking(b)}
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
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-5 rounded-[4px]", tone)} />{label}</span>;
}
