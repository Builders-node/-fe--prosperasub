import { addDaysISO, addMonthsISO } from "@/lib/timezone";

/**
 * Which dates a repeated cleaning lands on.
 *
 * This used to live inside the New-booking dialog, where it could not be
 * tested and could not be seen. An admin asked for four visits, got four —
 * thirty days apart — and reported it as "it only added one", because the only
 * one inside the Bookings list's window was the first. The arithmetic was
 * right and the screen never said what it was about to do.
 *
 * So: one function, spec'd, and the dialog prints the dates it returns.
 */

export type Cadence = "once" | "daily" | "weekly" | "biweekly" | "monthly";

/** Honduras-local weekday of a YYYY-MM-DD string, without a timezone shift. */
export function dowOf(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** The largest number of visits one run may create. */
export const MAX_VISITS = 60;

export interface SeriesInput {
  /** First visit — every other one is measured from here. */
  anchor: string;
  cadence: Cadence;
  /** How many visits were asked for. Clamped to 1…60. */
  count: number;
  /** Days the cleaner comes, as `getDay()` numbers. Weekly cadences only. */
  weekdays?: number[];
  /**
   * Is the chosen time actually run on `d`? Days it is not are skipped (daily,
   * named weekdays) or stepped over (weekly/biweekly/monthly). Defaults to
   * "every day", which is what a provider with no grid means.
   */
  isWorkingDay?: (d: string) => boolean;
}

/**
 * How far a visit may slide to find a working day.
 *
 * Never as far as the next visit: two visits that slid into the same day would
 * silently become one, which is the whole failure this dialog is prone to.
 */
function slideWindow(target: string, next: string | null): number {
  if (!next) return 7;
  const days = Math.round(
    (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86_400_000,
  );
  return Math.max(1, days);
}

/** The i-th scheduled date of a cadence, before any sliding. */
function targetOf(anchor: string, cadence: Exclude<Cadence, "once">, i: number): string {
  if (i === 0) return anchor;
  switch (cadence) {
    case "daily":    return addDaysISO(anchor, i);
    case "weekly":   return addDaysISO(anchor, i * 7);
    case "biweekly": return addDaysISO(anchor, i * 14);
    // A calendar month, not thirty days. Stepping 30 walked a customer's
    // cleaning backwards — the 13th became the 12th became the 11th — and over
    // a year it drifts a fortnight off the day they actually expect someone.
    case "monthly":  return addMonthsISO(anchor, i);
  }
}

export function buildBookingSeries({
  anchor, cadence, count, weekdays = [], isWorkingDay = () => true,
}: SeriesInput): string[] {
  if (!anchor) return [];
  if (cadence === "once") return [anchor];

  const n = Math.max(1, Math.min(Math.floor(count) || 1, MAX_VISITS));
  const weekdaysApply = cadence === "weekly" || cadence === "biweekly";

  // Specific days of the week: walk forward from the anchor and take every day
  // that matches, so "Mon + Thu, 8 visits" books four real weeks rather than
  // eight Mondays. A fixed step could never express that.
  if (weekdaysApply && weekdays.length > 0) {
    const wanted = new Set(weekdays);
    // Every-2-weeks keeps only alternate weeks; weeks are counted from the
    // Monday of the anchor's week so the parity doesn't shift with the day the
    // admin happened to start on.
    const anchorMonday = (dowOf(anchor) + 6) % 7;
    const out: string[] = [];
    const horizon = n * (cadence === "biweekly" ? 14 : 7) + 21;
    for (let offset = 0; offset < horizon && out.length < n; offset += 1) {
      const d = offset === 0 ? anchor : addDaysISO(anchor, offset);
      if (!wanted.has(dowOf(d))) continue;
      if (!isWorkingDay(d)) continue;
      if (cadence === "biweekly" && Math.floor((offset + anchorMonday) / 7) % 2 !== 0) continue;
      out.push(d);
    }
    return out;
  }

  // Daily: the next N days the time is run, stepping over days off.
  if (cadence === "daily") {
    const out: string[] = [];
    for (let offset = 0; offset < n * 3 + 14 && out.length < n; offset += 1) {
      const d = offset === 0 ? anchor : addDaysISO(anchor, offset);
      if (isWorkingDay(d)) out.push(d);
    }
    return out;
  }

  // Weekly / every 2 weeks / monthly: a visit that lands on a day off moves to
  // the next working day rather than disappearing — a monthly customer whose
  // date falls on a Sunday still gets that month's cleaning.
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const target = targetOf(anchor, cadence, i);
    const next = i + 1 < n ? targetOf(anchor, cadence, i + 1) : null;
    const window = slideWindow(target, next);
    for (let shift = 0; shift < window; shift += 1) {
      const c = shift === 0 ? target : addDaysISO(target, shift);
      if (!isWorkingDay(c)) continue;
      if (out.includes(c)) break;      // would collapse two visits into one
      out.push(c);
      break;
    }
  }
  return out;
}

/** Visits that had no working day left inside their window. */
export function droppedCount(input: SeriesInput): number {
  if (input.cadence === "once") return 0;
  const asked = Math.max(1, Math.min(Math.floor(input.count) || 1, MAX_VISITS));
  return Math.max(0, asked - buildBookingSeries(input).length);
}
