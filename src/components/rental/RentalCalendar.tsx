/**
 * RentalCalendar — custom date-range picker for car rentals.
 *
 * Desktop: inline two-month view.
 * Mobile : trigger chip → bottom-sheet single-month view.
 *
 * Features:
 *  – Fetches existing bookings for the vehicle and blocks unavailable dates
 *  – Range selection with hover preview
 *  – Highlights: today, selected range, booked days, partial (first/last day of booking)
 *  – Overlap validation: newStart < existingEnd && newEnd > existingStart
 *  – Smooth animated strip connecting start → end
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, addMonths, subMonths, startOfMonth, getDay,
  getDaysInMonth, isSameDay, parseISO, addDays,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { supabaseDb } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { QUICK_DURATIONS } from "@/types/carRental";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookedRange { start: string; end: string; }

export interface RentalCalendarProps {
  vehicleId: string;
  startDate: string;   // "YYYY-MM-DD" or ""
  endDate:   string;   // "YYYY-MM-DD" or ""
  onRangeChange: (start: string, end: string) => void;
  onError?: (msg: string | null) => void;
  maxDays?: number;
  /** When true, the calendar is shown inline (desktop). Otherwise only the chip is shown. */
  inline?: boolean;
}

type Phase = "start" | "end";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const TODAY = format(new Date(), "yyyy-MM-dd");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build the flat day array for a month grid (with null padding). */
function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const offset   = getDay(firstDay);          // 0=Sun
  const daysInMo = getDaysInMonth(firstDay);
  const result: Array<Date | null> = [];
  for (let i = 0; i < offset; i++) result.push(null);
  for (let d = 1; d <= daysInMo; d++) result.push(new Date(year, month, d));
  while (result.length % 7 !== 0) result.push(null);
  return result;
}

function dateStr(d: Date) { return format(d, "yyyy-MM-dd"); }

// ─── Booking data hook ────────────────────────────────────────────────────────

function useBookedRanges(vehicleId: string) {
  return useQuery<BookedRange[]>({
    queryKey: ["rental-bookings-calendar", vehicleId],
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("rental_bookings")
        .select("start_date, end_date")
        .eq("vehicle_id", vehicleId)
        .not("status", "in", '("cancelled")')
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []).map((b: any) => ({ start: b.start_date as string, end: b.end_date as string }));
    },
    staleTime: 30_000,
    enabled: !!vehicleId,
  });
}

// ─── Day-level status calculation ─────────────────────────────────────────────

type DayRole =
  | "past"           // before today → not selectable
  | "booked"         // within an existing booking
  | "booking-start"  // first day of an existing booking
  | "booking-end"    // last day of an existing booking
  | "available"
  | "today"
  | "sel-start"      // selected range start
  | "sel-end"        // selected range end
  | "sel-range"      // within selected range
  | "hover-end"      // hovered potential end while phase="end"
  | "hover-range"    // within hover preview
  | "sel-single";    // start === end (single day)

function getDayRole(
  d: Date,
  ds: string,
  bookedRanges: BookedRange[],
  startDate: string,
  endDate: string,
  hoverDate: string | null,
  phase: Phase,
): DayRole {
  if (ds < TODAY) return "past";

  // Existing booking membership
  for (const b of bookedRanges) {
    if (ds === b.start) return "booking-start";
    if (ds === b.end)   return "booking-end";
    if (ds > b.start && ds < b.end) return "booked";
  }

  // Selected range
  const hasSel    = !!startDate;
  const hasEnd    = !!endDate;
  const isStart   = hasSel && ds === startDate;
  const isEnd     = hasEnd && ds === endDate;
  const inRange   = hasSel && hasEnd && ds > startDate && ds < endDate;

  if (isStart && isEnd) return "sel-single";
  if (isStart) return "sel-start";
  if (isEnd)   return "sel-end";
  if (inRange) return "sel-range";

  // Hover preview (phase = "end", have start, no confirmed end)
  if (phase === "end" && hasSel && !hasEnd && hoverDate) {
    if (ds === hoverDate) return "hover-end";
    if (hoverDate > startDate && ds > startDate && ds < hoverDate) return "hover-range";
    if (hoverDate < startDate && ds < startDate && ds > hoverDate) return "hover-range";
  }

  if (ds === TODAY) return "today";
  return "available";
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date;
  role: DayRole;
  isFirstInRow: boolean;
  isLastInRow: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}

const DayCell = ({ date, role, isFirstInRow, isLastInRow, onClick, onHover, onLeave }: DayCellProps) => {
  const day = date.getDate();

  const isSelected      = role === "sel-start" || role === "sel-end" || role === "sel-single";
  const isHoverTarget   = role === "hover-end";
  const isInRange       = role === "sel-range";
  const isHoverRange    = role === "hover-range";
  const isBooked        = role === "booked" || role === "booking-start" || role === "booking-end";
  const isPast          = role === "past";
  const isBookingEdge   = role === "booking-start" || role === "booking-end";
  const isDisabled      = isPast || isBooked;
  const isInteractive   = !isDisabled;

  // Strip (background connecting range)
  const showLeftStrip  = (isInRange || isHoverRange || role === "sel-end") && !isFirstInRow;
  const showRightStrip = (isInRange || isHoverRange || role === "sel-start") && !isLastInRow;
  const stripColor     = isInRange ? "bg-primary/20" : "bg-primary/12";

  // Circle style
  const circleClass = cn(
    "relative z-10 mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all duration-150",
    // Selected start / end
    isSelected    && "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 scale-105",
    // Hover target
    isHoverTarget && "bg-primary/50 text-foreground font-semibold ring-2 ring-primary/40",
    // Today (unselected)
    role === "today" && "ring-2 ring-primary/60 text-primary font-bold",
    // In-range / hover-range
    (isInRange || isHoverRange) && "text-foreground/80 hover:bg-primary/30",
    // Booked
    isBookingEdge && "bg-destructive/20 text-destructive/70 line-through decoration-destructive/50",
    role === "booked" && "text-muted-foreground/25 line-through",
    // Past
    isPast && "text-muted-foreground/20",
    // Available
    role === "available" && "text-foreground/80 hover:bg-white/10 hover:text-foreground hover:scale-105",
    role === "today" && !isSelected && "hover:bg-primary/20 hover:scale-105",
    // Cursor
    isInteractive ? "cursor-pointer" : "cursor-not-allowed",
  );

  return (
    <div
      className="relative flex h-10 w-full select-none items-center justify-center"
      onClick={isInteractive ? onClick : undefined}
      onMouseEnter={isInteractive ? onHover : undefined}
      onMouseLeave={onLeave}
    >
      {/* Left strip */}
      {showLeftStrip && (
        <div className={cn("absolute inset-y-[6px] left-0 w-1/2", stripColor)} />
      )}
      {/* Right strip */}
      {showRightStrip && (
        <div className={cn("absolute inset-y-[6px] right-0 w-1/2", stripColor)} />
      )}
      {/* Booking-start right partial strip */}
      {role === "booking-start" && (
        <div className="absolute inset-y-[6px] right-0 w-1/2 bg-destructive/10" />
      )}
      {/* Booking-end left partial strip */}
      {role === "booking-end" && (
        <div className="absolute inset-y-[6px] left-0 w-1/2 bg-destructive/10" />
      )}

      <div className={circleClass}>
        {day}
        {/* Today dot */}
        {role === "today" && (
          <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
        )}
      </div>
    </div>
  );
};

// ─── CalendarMonth ────────────────────────────────────────────────────────────

interface CalendarMonthProps {
  viewMonth: Date;
  bookedRanges: BookedRange[];
  startDate: string;
  endDate: string;
  hoverDate: string | null;
  phase: Phase;
  onDayClick: (ds: string, d: Date) => void;
  onDayHover: (ds: string) => void;
  onDayLeave: () => void;
}

const CalendarMonth = ({
  viewMonth, bookedRanges, startDate, endDate, hoverDate, phase,
  onDayClick, onDayHover, onDayLeave,
}: CalendarMonthProps) => {
  const days = useMemo(
    () => buildMonthGrid(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  );

  return (
    <div className="w-full">
      {/* Weekday headers */}
      <div className="mb-1 grid grid-cols-7">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((d, idx) => {
          if (!d) return <div key={`pad-${idx}`} />;
          const ds   = dateStr(d);
          const col  = idx % 7;
          const role = getDayRole(d, ds, bookedRanges, startDate, endDate, hoverDate, phase);
          return (
            <DayCell
              key={ds}
              date={d}
              role={role}
              isFirstInRow={col === 0}
              isLastInRow={col === 6}
              onClick={() => onDayClick(ds, d)}
              onHover={() => onDayHover(ds)}
              onLeave={onDayLeave}
            />
          );
        })}
      </div>
    </div>
  );
};

// ─── Legend ───────────────────────────────────────────────────────────────────

const Legend = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Selected
    </span>
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-primary/20" /> Your range
    </span>
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-destructive/20" /> Unavailable
    </span>
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-primary/60 ring-2 ring-primary/40" /> Today
    </span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export function RentalCalendar({
  vehicleId, startDate, endDate, onRangeChange, onError, maxDays = 30, inline = true,
}: RentalCalendarProps) {
  const [viewMonth, setViewMonth]   = useState(() => startOfMonth(new Date()));
  const [hoverDate, setHoverDate]   = useState<string | null>(null);
  const [phase, setPhase]           = useState<Phase>("start");
  const [error, setError]           = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: bookedRanges = [], isLoading } = useBookedRanges(vehicleId);

  // Sync phase with external state
  useEffect(() => {
    if (!startDate) setPhase("start");
    else if (startDate && !endDate) setPhase("end");
    else setPhase("start");
  }, [startDate, endDate]);

  // Propagate errors
  useEffect(() => { onError?.(error); }, [error, onError]);

  // A day is unavailable if it falls anywhere within an existing booking,
  // INCLUDING the start and end days (the car is out on its return day too).
  const isDateBooked = useCallback((ds: string) =>
    bookedRanges.some(b => ds >= b.start && ds <= b.end),
  [bookedRanges]);

  // Two ranges conflict if they share any day (inclusive on both ends).
  const hasOverlap = useCallback((s: string, e: string) =>
    bookedRanges.some(b => s <= b.end && e >= b.start),
  [bookedRanges]);

  const handleDayClick = useCallback((ds: string) => {
    setError(null);

    if (ds < TODAY) return;
    if (isDateBooked(ds)) return;

    if (phase === "start" || !startDate) {
      onRangeChange(ds, "");
      setPhase("end");
      return;
    }

    // Phase = "end"
    if (ds === startDate) {
      // Re-click start: reset
      onRangeChange("", "");
      setPhase("start");
      return;
    }

    const [s, e] = ds < startDate ? [ds, startDate] : [startDate, ds];

    if (hasOverlap(s, e)) {
      const msg = "This vehicle is unavailable for the selected period";
      setError(msg);
      onError?.(msg);
      return;
    }

    const days = Math.round((parseISO(e).getTime() - parseISO(s).getTime()) / 86400000);
    if (days > maxDays) {
      const msg = `Maximum rental period is ${maxDays} days`;
      setError(msg);
      onError?.(msg);
      return;
    }

    onRangeChange(s, e);
    setPhase("start");
    setHoverDate(null);
    setMobileOpen(false);
  }, [phase, startDate, isDateBooked, hasOverlap, onRangeChange, onError, maxDays]);

  const handleHover = useCallback((ds: string) => {
    if (phase === "end" && startDate && ds !== startDate && !isDateBooked(ds)) {
      setHoverDate(ds);
    }
  }, [phase, startDate, isDateBooked]);

  /** Quick-pick a duration: starts from the chosen start (or today) for N days. */
  const handleQuickSelect = useCallback((days: number) => {
    setError(null);
    const base = startDate && !isDateBooked(startDate) ? startDate : TODAY;
    const s = base;
    const e = format(addDays(parseISO(s), days), "yyyy-MM-dd");
    if (hasOverlap(s, e)) {
      const msg = "This vehicle is unavailable for the selected period";
      setError(msg);
      onError?.(msg);
      return;
    }
    onRangeChange(s, e);
    setPhase("start");
    setHoverDate(null);
    // keep the start month in view
    setViewMonth(startOfMonth(parseISO(s)));
  }, [startDate, isDateBooked, hasOverlap, onRangeChange, onError]);

  const reset = () => {
    onRangeChange("", "");
    setPhase("start");
    setError(null);
    setHoverDate(null);
  };

  const nextMonth = () => setViewMonth(m => addMonths(m, 1));
  const prevMonth = () => setViewMonth(m => subMonths(m, 1));
  const nextMo = addMonths(viewMonth, 1);

  // Phase hint text
  const hint = !startDate
    ? "Select pickup date"
    : !endDate
    ? "Now select return date"
    : `${format(parseISO(startDate), "MMM d")} → ${format(parseISO(endDate), "MMM d, yyyy")}`;

  const calendarProps = {
    bookedRanges, startDate, endDate, hoverDate, phase,
    onDayClick: handleDayClick,
    onDayHover: handleHover,
    onDayLeave: () => setHoverDate(null),
  };

  // ── Mobile trigger chip ──────────────────────────────────────────────────────
  const chip = (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary/40 hover:bg-card/80"
    >
      <Calendar className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rental period</p>
        <p className={cn("truncate text-sm font-semibold", (!startDate || !endDate) ? "text-muted-foreground" : "text-foreground")}>
          {hint}
        </p>
      </div>
      {(startDate || endDate) && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); reset(); }}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </button>
  );

  // ── Inline calendar panel ─────────────────────────────────────────────────────
  const calendarPanel = (compact = false) => (
    <div className={cn(
      "rounded-2xl border border-border bg-card",
      compact ? "p-4" : "p-5 md:p-6",
    )}>
      {/* Phase hint + reset */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className={cn(
            "text-sm font-semibold transition-colors",
            !endDate ? "text-primary" : "text-foreground",
          )}>
            {hint}
          </p>
          {error && (
            <p className="mt-1 text-xs font-medium text-destructive">{error}</p>
          )}
        </div>
        {(startDate || endDate) && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Quick-duration buttons (matches Atlantis day / +8 / 30-day tiers) */}
      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK_DURATIONS.map(({ label, days }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleQuickSelect(days)}
            className="rounded-full border border-border bg-[hsl(var(--app-rail))] px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary active:scale-95"
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : compact ? (
        /* Single month (mobile sheet) */
        <div>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-bold text-foreground">{format(viewMonth, "MMMM yyyy")}</p>
            <button type="button" onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* Weekday headers */}
          <div className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map(wd => (
              <div key={wd} className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">{wd}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {buildMonthGrid(viewMonth.getFullYear(), viewMonth.getMonth()).map((d, idx) => {
              if (!d) return <div key={`p${idx}`} />;
              const ds = dateStr(d);
              return (
                <DayCell
                  key={ds}
                  date={d}
                  role={getDayRole(d, ds, bookedRanges, startDate, endDate, hoverDate, phase)}
                  isFirstInRow={idx % 7 === 0}
                  isLastInRow={idx % 7 === 6}
                  onClick={() => handleDayClick(ds)}
                  onHover={() => handleHover(ds)}
                  onLeave={() => setHoverDate(null)}
                />
              );
            })}
          </div>
        </div>
      ) : (
        /* Two months (desktop) — single nav: one arrow per side, one label per month */
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Left month */}
          <div>
            <div className="mb-3 flex items-center">
              <button type="button" onClick={prevMonth} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="flex-1 text-center text-sm font-bold text-foreground">{format(viewMonth, "MMMM yyyy")}</p>
              <span className="h-8 w-8 shrink-0" aria-hidden />
            </div>
            <CalendarMonth viewMonth={viewMonth} {...calendarProps} />
          </div>
          {/* Right month */}
          <div>
            <div className="mb-3 flex items-center">
              <span className="h-8 w-8 shrink-0" aria-hidden />
              <p className="flex-1 text-center text-sm font-bold text-foreground">{format(nextMo, "MMMM yyyy")}</p>
              <button type="button" onClick={nextMonth} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <CalendarMonth viewMonth={nextMo} {...calendarProps} />
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 border-t border-[hsl(var(--app-divider))] pt-3">
        <Legend />
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile: chip trigger + bottom sheet */}
      <div className="md:hidden">
        {chip}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-3xl px-4 pb-8 pt-5">
            <SheetHeader className="mb-3">
              <SheetTitle className="text-lg font-black">Select rental dates</SheetTitle>
            </SheetHeader>
            {calendarPanel(true)}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: inline */}
      <div className="hidden md:block">
        {calendarPanel(false)}
      </div>
    </>
  );
}
