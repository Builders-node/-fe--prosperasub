/**
 * Straight-line (accrual) revenue recognition.
 *
 * A subscription paid up-front for N months/weeks should not book all its
 * revenue in the purchase month — it should be spread evenly across the service
 * period it covers. These helpers take a service interval [start, end) and a
 * reporting window [rangeStart, rangeEnd] and return the portion of the total
 * that is "earned" inside that window.
 *
 * Everything is computed in whole calendar days (local Y/M/D) so timezone drift
 * can't leak a day of revenue into the wrong month.
 */

/** A Date or 'yyyy-mm-dd' string → integer day index (days since epoch, local calendar day). */
function dayIndex(input: Date | string): number {
  let y: number, m: number, d: number;
  if (typeof input === "string") {
    const [ys, ms, ds] = input.slice(0, 10).split("-");
    y = Number(ys); m = Number(ms) - 1; d = Number(ds);
  } else {
    y = input.getFullYear(); m = input.getMonth(); d = input.getDate();
  }
  return Math.floor(Date.UTC(y, m, d) / 86_400_000);
}

export interface RecognitionInput {
  totalCents: number;
  /** First day of service. Falls back to created_at at the call site if the real start is missing. */
  serviceStart: Date | string | null | undefined;
  /** Day after the last day of service (exclusive). If missing/invalid, `fallbackDays` is used. */
  serviceEnd?: Date | string | null;
  /** Span in days to use when `serviceEnd` is missing or not after the start (e.g. a one-off). */
  fallbackDays?: number;
}

/** Whole days of overlap between the service interval and the reporting window. */
export function overlapDays(
  input: Pick<RecognitionInput, "serviceStart" | "serviceEnd" | "fallbackDays">,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  if (!input.serviceStart) return 0;
  const sStart = dayIndex(input.serviceStart);
  let sEnd = input.serviceEnd ? dayIndex(input.serviceEnd) : Number.NaN;
  if (!Number.isFinite(sEnd) || sEnd <= sStart) {
    sEnd = sStart + Math.max(1, Math.round(input.fallbackDays ?? 1));
  }
  const rStart = dayIndex(rangeStart);
  const rEndExcl = dayIndex(rangeEnd) + 1; // rangeEnd is an inclusive day
  return Math.max(0, Math.min(sEnd, rEndExcl) - Math.max(sStart, rStart));
}

/**
 * Cents of `totalCents` recognized inside [rangeStart, rangeEnd], spreading the
 * total evenly (straight-line, per day) across the service interval.
 */
export function recognizedCents(
  input: RecognitionInput,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  if (!input.totalCents || !input.serviceStart) return 0;
  const sStart = dayIndex(input.serviceStart);
  let sEnd = input.serviceEnd ? dayIndex(input.serviceEnd) : Number.NaN;
  if (!Number.isFinite(sEnd) || sEnd <= sStart) {
    sEnd = sStart + Math.max(1, Math.round(input.fallbackDays ?? 1));
  }
  const totalDays = sEnd - sStart; // >= 1
  const overlap = overlapDays(input, rangeStart, rangeEnd);
  if (overlap <= 0) return 0;
  return Math.round((input.totalCents * overlap) / totalDays);
}

/** Service end (exclusive) for a food subscription: N paid weeks from the start. */
export function addDaysISO(start: Date | string, days: number): string {
  const idx = dayIndex(start) + days;
  const ms = idx * 86_400_000;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
