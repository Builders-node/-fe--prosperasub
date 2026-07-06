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
  /** Optional pickup / drop-off time pickers — renders inside the modal & inline panel. */
  pickupTime?: string;
  dropoffTime?: string;
  timeOptions?: string[];
  onPickupTimeChange?: (t: string) => void;
  onDropoffTimeChange?: (t: string) => void;
}

const formatTime12 = (t: string) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
};

type Phase = "start" | "end";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const TODAY = format(new Date(), "yyyy-MM-dd");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build the flat day array for a month grid (Monday-first, with null padding). */
function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  // Monday-first: Mon=0, Tue=1, ..., Sun=6
  const offset   = (getDay(firstDay) + 6) % 7;
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

/**
 * Yandex Прокат-style day cell:
 *  – Endpoints (start / end) = solid orange tile, rounded on the outer side only,
 *    flat on the side that joins the range
 *  – In-range dates = continuous lighter peach bar (full width, no rounding)
 *  – Cell takes full grid column width (no centered circle)
 */
const DayCell = ({ date, role, isFirstInRow, isLastInRow, onClick, onHover, onLeave }: DayCellProps) => {
  const day = date.getDate();

  const isStart        = role === "sel-start" || role === "sel-single";
  const isEnd          = role === "sel-end"   || role === "sel-single";
  const isSelected     = isStart || isEnd;
  const isHoverTarget  = role === "hover-end";
  const isInRange      = role === "sel-range";
  const isHoverRange   = role === "hover-range";
  const isBooked       = role === "booked" || role === "booking-start" || role === "booking-end";
  const isPast         = role === "past";
  const isInteractive  = !(isPast || isBooked);

  // Continuous range bar (lighter peach) — applied to in-range and to the
  // inner half of the start / end tiles so the bar visually joins to the endpoint.
  const showLeftBar  = isInRange || isHoverRange || isEnd || (isHoverTarget);
  const showRightBar = isInRange || isHoverRange || isStart;

  return (
    <div
      className={cn(
        "relative h-11 w-full select-none",
        isInteractive ? "cursor-pointer" : "cursor-not-allowed",
      )}
      onClick={isInteractive ? onClick : undefined}
      onMouseEnter={isInteractive ? onHover : undefined}
      onMouseLeave={onLeave}
    >
      {/* ─── Lighter peach connecting bar (full row coverage) ─────────── */}
      {showLeftBar && (
        <div className={cn(
          "absolute inset-y-1 left-0 w-1/2",
          isInRange || isEnd ? "bg-primary/40" : "bg-primary/25",
          isFirstInRow && "rounded-l-2xl",
        )} />
      )}
      {showRightBar && (
        <div className={cn(
          "absolute inset-y-1 right-0 w-1/2",
          isInRange || isStart ? "bg-primary/40" : "bg-primary/25",
          isLastInRow && "rounded-r-2xl",
        )} />
      )}

      {/* ─── Booked range (lighter destructive bar) ──────────────────── */}
      {role === "booking-start" && (
        <div className="absolute inset-y-1 right-0 w-1/2 bg-destructive/15" />
      )}
      {role === "booking-end" && (
        <div className="absolute inset-y-1 left-0 w-1/2 bg-destructive/15" />
      )}

      {/* ─── Solid endpoint tile (start / end / single) ──────────────── */}
      {isSelected && (
        <div className={cn(
          "absolute inset-y-1 inset-x-1 z-10 bg-primary  shadow-primary/40",
          isStart && isEnd && "rounded-2xl",      // single-day pick
          isStart && !isEnd && "rounded-l-2xl",   // start
          !isStart && isEnd && "rounded-r-2xl",   // end
        )} />
      )}

      {/* ─── Hover target preview (lighter highlight) ────────────────── */}
      {isHoverTarget && !isSelected && (
        <div className="absolute inset-y-1 inset-x-1 z-10 rounded-2xl bg-primary/60 ring-2 ring-primary" />
      )}

      {/* ─── Today ring (subtle) ─────────────────────────────────────── */}
      {role === "today" && !isSelected && (
        <div className="absolute inset-y-1 inset-x-1 z-10 rounded-2xl ring-2 ring-primary/40" />
      )}

      {/* ─── Day number ──────────────────────────────────────────────── */}
      <div className={cn(
        "relative z-20 flex h-full w-full items-center justify-center text-sm transition-colors",
        isSelected && "font-bold text-primary-foreground",
        isHoverTarget && !isSelected && "font-bold text-foreground",
        (isInRange || isHoverRange) && !isSelected && "font-semibold text-foreground",
        role === "today" && !isSelected && "font-bold text-primary",
        role === "available" && "font-medium text-foreground hover:text-primary",
        isPast && "text-muted-foreground/30",
        isBooked && "text-muted-foreground/30 line-through",
      )}>
        {day}
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
      {/* Weekday headers (Yandex Прокат style — sentence case, Monday first) */}
      <div className="mb-2 grid grid-cols-7">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="flex h-7 items-center justify-center text-sm font-medium text-muted-foreground">
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
  pickupTime, dropoffTime, timeOptions,
  onPickupTimeChange, onDropoffTimeChange,
}: RentalCalendarProps) {
  const showTimePickers =
    !!pickupTime && !!dropoffTime &&
    !!timeOptions && !!onPickupTimeChange && !!onDropoffTimeChange;
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

      {/* Pickup / Drop-off time pickers (Yandex Прокат style — two side-by-side tiles) */}
      {showTimePickers && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="relative block rounded-2xl bg-muted/50 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors">
            <span className="block text-xs text-muted-foreground">Pickup time</span>
            <div className="mt-0.5 flex items-center justify-between gap-1">
              <span className="text-base font-bold text-foreground">{formatTime12(pickupTime!)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
            </div>
            <select
              value={pickupTime}
              onChange={(e) => onPickupTimeChange!(e.target.value)}
              className="sr-only absolute inset-0 cursor-pointer opacity-0"
              aria-label="Pickup time"
            >
              {timeOptions!.map((t) => (
                <option key={t} value={t}>{formatTime12(t)}</option>
              ))}
            </select>
          </label>
          <label className="relative block rounded-2xl bg-muted/50 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors">
            <span className="block text-xs text-muted-foreground">Drop-off time</span>
            <div className="mt-0.5 flex items-center justify-between gap-1">
              <span className="text-base font-bold text-foreground">{formatTime12(dropoffTime!)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
            </div>
            <select
              value={dropoffTime}
              onChange={(e) => onDropoffTimeChange!(e.target.value)}
              className="sr-only absolute inset-0 cursor-pointer opacity-0"
              aria-label="Drop-off time"
            >
              {timeOptions!.map((t) => (
                <option key={t} value={t}>{formatTime12(t)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

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
            <p className="text-base font-bold text-foreground">{format(viewMonth, "MMMM yyyy")}</p>
            <button type="button" onClick={nextMonth} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* Weekday headers (Monday-first sentence-case) */}
          <div className="mb-2 grid grid-cols-7">
            {WEEKDAYS.map(wd => (
              <div key={wd} className="flex h-7 items-center justify-center text-sm font-medium text-muted-foreground">{wd}</div>
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
              <p className="flex-1 text-center text-base font-bold text-foreground">{format(viewMonth, "MMMM yyyy")}</p>
              <span className="h-8 w-8 shrink-0" aria-hidden />
            </div>
            <CalendarMonth viewMonth={viewMonth} {...calendarProps} />
          </div>
          {/* Right month */}
          <div>
            <div className="mb-3 flex items-center">
              <span className="h-8 w-8 shrink-0" aria-hidden />
              <p className="flex-1 text-center text-base font-bold text-foreground">{format(nextMo, "MMMM yyyy")}</p>
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

  // ── Inline mode: render the calendar panel directly with no chip/sheet wrappers
  // (used when the parent already wraps it in a modal — e.g. CarDetail's date sheet)
  if (inline) {
    return (
      <>
        <div className="md:hidden">{calendarPanel(true)}</div>
        <div className="hidden md:block">{calendarPanel(false)}</div>
      </>
    );
  }

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
