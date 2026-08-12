import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The pieces every "pick a time" screen needs, in one place.
 *
 * There are three genuinely different booking shapes on the platform — a
 * weekday that repeats (cleaning), an hour on a date (courts), a range of days
 * (a car) — and that is fine; they are different products. What was not fine
 * is that the *parts* were rebuilt each time: `to12h` existed in six files
 * with six identical bodies, and the day strip and the morning/afternoon/
 * evening grouping lived inside the cleaning page where nothing else could
 * reach them, even though a court screen wants exactly the same chip row.
 *
 * Formatting helpers live in lib/booking/bookingSettings (to12h, toMinutes);
 * this file is only the rendering.
 */

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/** Monday-first, matching every calendar on the platform. */
export const WEEKDAYS = [
  { value: 1, label: "Monday",    short: "Mon" },
  { value: 2, label: "Tuesday",   short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday",  short: "Thu" },
  { value: 5, label: "Friday",    short: "Fri" },
  { value: 6, label: "Saturday",  short: "Sat" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Where a start time falls in the day. Used to group a long list of hours into
 * something scannable rather than a wall of forty chips.
 */
export const TIME_PERIODS = [
  { id: "morning",   label: "Morning",   emoji: "🌅", from: "00:00:00", to: "12:00:00" },
  { id: "afternoon", label: "Afternoon", emoji: "☀️", from: "12:00:00", to: "17:00:00" },
  { id: "evening",   label: "Evening",   emoji: "🌙", from: "17:00:00", to: "24:00:00" },
] as const;

export type TimePeriod = (typeof TIME_PERIODS)[number];

/** Split start times into the periods above, dropping periods with nothing in them. */
export function groupByPeriod<T extends { start: string }>(
  slots: T[],
): Array<{ period: TimePeriod; slots: T[] }> {
  return TIME_PERIODS
    .map((period) => ({
      period,
      slots: slots.filter((s) => s.start >= period.from && s.start < period.to),
    }))
    .filter((g) => g.slots.length > 0);
}

// ─── Day strip ───────────────────────────────────────────────────────────────

export interface DayInfo {
  /** First upcoming date for this weekday, "YYYY-MM-DD". */
  nextDate: string;
  /** How many times this weekday occurs in the period being booked. */
  count: number;
  /** Overrides the "N wks" caption — a court screen has no weeks to count. */
  caption?: string;
}

/**
 * Horizontal weekday selector.
 *
 * Days are ordered by which comes round first, not Mon–Sun: someone booking on
 * a Wednesday cares that Thursday is tomorrow, not that Monday sorts first.
 * A weekday with no availability renders disabled rather than disappearing, so
 * the row does not reflow as the period changes.
 */
export function DayStrip({
  selected,
  onSelect,
  occurrences,
  days = WEEKDAYS,
  className,
}: {
  selected: number;
  onSelect: (weekday: number) => void;
  occurrences: Record<number, DayInfo>;
  days?: readonly Weekday[];
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-selected]") as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  const ordered = [...days].sort((a, b) => {
    const aDate = occurrences[a.value]?.nextDate ?? "9999";
    const bDate = occurrences[b.value]?.nextDate ?? "9999";
    return aDate.localeCompare(bDate);
  });

  return (
    <div ref={scrollRef} className={cn("flex gap-3 overflow-x-auto pb-1 scrollbar-hide", className)}>
      {ordered.map((day) => {
        const info = occurrences[day.value];
        const isSelected = selected === day.value;
        const available = !!info && info.count > 0;
        const [, month, dayNum] = (info?.nextDate ?? "").split("-");
        const monthLabel = month
          ? ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][Number(month) - 1]
          : null;

        return (
          <button
            key={day.value}
            type="button"
            data-selected={isSelected || undefined}
            onClick={() => onSelect(day.value)}
            disabled={!available}
            className={cn(
              "flex min-w-[72px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 transition-all duration-150",
              isSelected
                ? "border-transparent bg-foreground text-background"
                : available
                  ? "border-border bg-card text-foreground hover:border-foreground/20 hover:bg-muted"
                  : "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-50",
            )}
          >
            <span className={cn("text-xs font-semibold tracking-wide", isSelected ? "text-background/70" : "text-muted-foreground")}>
              {day.short}
            </span>
            {dayNum && (
              <>
                <span className="text-xl font-black leading-none">{Number(dayNum)}</span>
                <span className={cn("text-[10px] font-semibold uppercase", isSelected ? "text-background/50" : "text-muted-foreground/70")}>
                  {monthLabel}
                </span>
              </>
            )}
            <span className={cn("text-[11px] font-semibold", isSelected ? "text-background/60" : "text-muted-foreground")}>
              {info ? (info.caption ?? `${info.count} wk${info.count !== 1 ? "s" : ""}`) : "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Time chips ──────────────────────────────────────────────────────────────

/** One selectable time. */
export function TimeChip({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-full border text-sm font-semibold transition-all duration-150",
        selected
          ? "border-transparent bg-foreground text-background"
          : disabled
            ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-50"
            : "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

export interface TimeOption {
  /** "HH:MM:SS" — what the caller stores. */
  start: string;
  /** What the customer reads, e.g. "8:00 AM – 9:00 AM". */
  label: ReactNode;
  disabled?: boolean;
}

/**
 * A day's times, grouped into morning / afternoon / evening.
 *
 * Renders nothing when there are no times — the caller owns the empty state,
 * because "no slots" means something different on each screen and the message
 * is worth writing carefully (see CleaningBook, which names the dates that
 * have nothing published).
 */
export function TimeSlotPicker({
  options,
  selected,
  onSelect,
  className,
}: {
  options: TimeOption[];
  selected: string;
  onSelect: (start: string) => void;
  className?: string;
}) {
  const groups = groupByPeriod(options);
  if (!groups.length) return null;

  return (
    <div className={cn("space-y-5 rounded-2xl border border-border bg-card p-4", className)}>
      {groups.map(({ period, slots }) => (
        <div key={period.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{period.emoji}</span>
            <span className="text-sm font-semibold text-foreground">{period.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((slot) => (
              <TimeChip
                key={slot.start}
                label={slot.label}
                selected={selected === slot.start}
                disabled={slot.disabled}
                onClick={() => onSelect(slot.start)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
