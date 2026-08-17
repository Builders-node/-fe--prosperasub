import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { UnifiedBookingRow } from "@/hooks/useUnifiedBookings";

/**
 * The week as a clock, not as a list.
 *
 * A list grouped by day answers "what is on Thursday". It cannot answer "is
 * court 2 free at six" — the question a club is actually asked on the phone —
 * because nothing in a list is positioned in time. This is the grid every
 * calendar app draws: hours down the side, days across, a booking occupying the
 * space it really takes.
 *
 * Two things it deliberately does:
 *
 * - **Overlaps stagger, they do not shrink into slivers.** Three bookings in one
 *   hour split into equal thirds are three blocks whose labels are all
 *   "Te…". Each lane is offset instead and keeps most of the width, the way
 *   every calendar app draws it: you can see there are three, and you can read
 *   the one on top.
 * - **It scrolls sideways rather than shrinking.** Seven columns at phone width
 *   would be 40px each; a booking's own name would not fit. The hour gutter
 *   stays put while the days move.
 */

export interface WeekTimeGridProps {
  /** The seven days, Monday first. */
  days: Date[];
  bookings: UnifiedBookingRow[];
  /** Hour the day opens / closes, from the calendars themselves. */
  openHour: number;
  closeHour: number;
  /** Label above each block — the customer, or the calendar when several show. */
  labelOf: (row: UnifiedBookingRow) => string;
  onSelect?: (row: UnifiedBookingRow) => void;
}

/** Pixels per hour. Enough for "18:00 – 19:00" plus a name on two lines. */
const HOUR_PX = 56;

interface Placed {
  row: UnifiedBookingRow;
  /** Fractional hours from `openHour`. */
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/**
 * Lay a day's bookings out in lanes so overlapping ones share the width.
 *
 * Greedy by start time: a booking takes the first lane whose last block has
 * already finished. The number of lanes is counted per cluster of overlapping
 * bookings rather than per day, so one busy hour does not squeeze the whole
 * column into thirds.
 */
function place(rows: UnifiedBookingRow[], openHour: number, closeHour: number): Placed[] {
  const spans = rows
    .map((row) => {
      const start = row.startAt.getHours() + row.startAt.getMinutes() / 60;
      const rawEnd = row.endAt
        ? row.endAt.getHours() + row.endAt.getMinutes() / 60
        : start + 1;
      // A booking that runs past closing (or over midnight) is clamped so it
      // stays inside the grid instead of pushing it open.
      const end = rawEnd <= start ? closeHour : Math.min(rawEnd, closeHour);
      return { row, start: Math.max(start, openHour), end: Math.max(Math.min(end, closeHour), Math.max(start, openHour) + 0.25) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: Placed[] = [];
  let cluster: typeof spans = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((s) => {
      let lane = laneEnds.findIndex((end) => end <= s.start + 1e-9);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.end); }
      else laneEnds[lane] = s.end;
      return { ...s, lane };
    });
    const lanes = laneEnds.length;
    assigned.forEach((s) => out.push({
      row: s.row,
      top: s.start - openHour,
      height: s.end - s.start,
      lane: s.lane,
      lanes,
    }));
    cluster = [];
    clusterEnd = -Infinity;
  };

  spans.forEach((s) => {
    // A gap means the previous overlap group is finished and its width is settled.
    if (s.start >= clusterEnd - 1e-9) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.end);
  });
  flush();

  return out;
}

const CANCELLED = ["cancelled", "canceled", "released", "no_show"];

export function WeekTimeGrid({
  days, bookings, openHour, closeHour, labelOf, onSelect,
}: WeekTimeGridProps) {
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, closeHour - openHour) }, (_, i) => openHour + i),
    [openHour, closeHour],
  );

  const perDay = useMemo(
    () => days.map((day) => place(bookings.filter((b) => isSameDay(b.startAt, day)), openHour, closeHour)),
    [days, bookings, openHour, closeHour],
  );

  const now = new Date();
  const nowOffset = now.getHours() + now.getMinutes() / 60 - openHour;
  const showNow = nowOffset >= 0 && nowOffset <= closeHour - openHour;

  return (
    <div className="overflow-x-auto rounded-radius-lg bg-card">
      <div className="min-w-[680px]">
        {/* Day header. Sticky so scrolling the page keeps the dates in view on
            a long grid. */}
        <div className="sticky top-0 z-20 flex border-b border-border bg-card">
          <div className="w-14 shrink-0" />
          {days.map((day) => {
            const today = isSameDay(day, now);
            return (
              <div key={day.toISOString()} className="flex-1 px-2 py-2 text-center tracking-[-0.02em]">
                <p className="text-[12px] uppercase leading-[16px] text-muted-foreground">{format(day, "EEE")}</p>
                <p className={cn(
                  "text-[16px] font-semibold leading-[22px] tabular-nums",
                  today ? "text-primary" : "text-foreground",
                )}>
                  {format(day, "d")}
                </p>
              </div>
            );
          })}
        </div>

        <div className="relative flex">
          {/* Hour gutter */}
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: HOUR_PX }}>
                <span className="absolute right-2 top-0.5 text-[12px] leading-none tabular-nums text-muted-foreground">
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((day, di) => (
            <div
              key={day.toISOString()}
              className={cn(
                "relative flex-1 border-l border-border/60",
                isSameDay(day, now) && "bg-inset/40",
              )}
              style={{ height: hours.length * HOUR_PX }}
            >
              {/* Hour lines */}
              {hours.map((h) => (
                <div key={h} className="border-b border-border/40" style={{ height: HOUR_PX }} />
              ))}

              {/* Now, on today's column only. */}
              {showNow && isSameDay(day, now) && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-primary"
                  style={{ top: nowOffset * HOUR_PX }}
                />
              )}

              {perDay[di].map(({ row, top, height, lane, lanes }) => {
                const off = CANCELLED.includes(row.status.toLowerCase());
                // Each extra lane steps in by a fixed share and the block keeps
                // the rest of the column, so two overlapping bookings are 76%
                // wide rather than 50% — and the later one sits on top.
                const step = lanes > 1 ? Math.min(24, 60 / (lanes - 1)) : 0;
                const width = 100 - step * (lanes - 1);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={onSelect ? () => onSelect(row) : undefined}
                    className={cn(
                      "absolute overflow-hidden rounded-[8px] px-1.5 py-1 text-left tracking-[-0.02em] transition-colors",
                      off
                        ? "bg-muted text-muted-foreground line-through ring-1 ring-border"
                        : "bg-primary text-primary-foreground ring-1 ring-primary/60 hover:brightness-110",
                      onSelect && "cursor-pointer",
                    )}
                    style={{
                      top: top * HOUR_PX + 1,
                      height: Math.max(height * HOUR_PX - 2, 18),
                      left: `calc(${lane * step}% + 2px)`,
                      width: `calc(${width}% - 4px)`,
                      zIndex: 2 + lane,
                    }}
                    title={`${labelOf(row)} · ${format(row.startAt, "HH:mm")}${row.endAt ? `–${format(row.endAt, "HH:mm")}` : ""}`}
                  >
                    <span className="block truncate text-[12px] font-semibold leading-[15px]">
                      {labelOf(row)}
                    </span>
                    <span className="block truncate text-[11px] leading-[14px] opacity-80 tabular-nums">
                      {format(row.startAt, "HH:mm")}
                      {row.endAt ? `–${format(row.endAt, "HH:mm")}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
