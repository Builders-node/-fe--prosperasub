/**
 * Unified booking configuration shared by every provider type (car rentals,
 * restaurants, sports facilities, wellness, cleaning, …). One config per
 * provider, stored as JSONB in `providers.booking_settings`. The same shape and
 * the same `computeSlots()` generator drive availability everywhere so the UX
 * stays consistent across the platform.
 */

/** Weekday order is Monday-first to match the platform's calendars. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface DayHours {
  enabled: boolean;
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
}

export interface BlockedRange {
  id: string;
  /**
   * "YYYY-MM-DD" for a one-off, or **null for every day**.
   *
   * A recurring block is what a lunch hour, a shift changeover or a standing
   * meeting actually is — and until it could be expressed, the only way to say
   * "never 12:00–13:00" was to add the same range once per date, forever.
   */
  date: string | null;
  from: string;        // "HH:MM"
  to: string;          // "HH:MM"
  note?: string;
}

/** Does this block apply on the given day? */
export function blockAppliesOn(range: BlockedRange, dateISO: string): boolean {
  return range.date === null || range.date === dateISO;
}

/**
 * If [start, end) runs into any of these blocks, the END of the latest one it
 * runs into — the minute the day is free again. Null when nothing is hit.
 *
 * Shared by both slot engines: the generator resumes exactly here, so a slot
 * follows a blocked period immediately instead of a buffer's width later.
 * Times are minutes since midnight.
 */
export function latestBlockEnd(ranges: BlockedRange[], start: number, end: number): number | null {
  let latest: number | null = null;
  for (const r of ranges) {
    const from = toMinutes(r.from);
    const to = toMinutes(r.to);
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    if (start < to && end > from && (latest === null || to > latest)) latest = to;
  }
  return latest;
}

export interface BookingSettings {
  timezone: string;
  /** Length 7, Monday-first (index 0 = Monday). */
  weekly: DayHours[];
  sessionDurationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /**
   * How many bookings may share one time slot — a cleaning company with three
   * crews can take three 10:00 jobs, a single massage table can take one.
   *
   * Until now this came from `global_settings.default_slot_capacity`, one
   * number for the whole platform, so every provider was assumed to have the
   * same number of hands.
   */
  capacity: number;
  /** Earliest a customer can book, in hours from now. */
  minNoticeHours: number;
  /** Latest a customer can book, in days from today. */
  maxAdvanceDays: number;
  /** Full-day blocks. */
  blockedDates: string[];
  /** Partial-day blocks. */
  blockedRanges: BlockedRange[];
}

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  timezone: "America/Tegucigalpa",
  weekly: [
    { enabled: true, from: "09:00", to: "17:00" },  // Mon
    { enabled: true, from: "09:00", to: "17:00" },  // Tue
    { enabled: true, from: "09:00", to: "17:00" },  // Wed
    { enabled: true, from: "09:00", to: "17:00" },  // Thu
    { enabled: true, from: "09:00", to: "17:00" },  // Fri
    { enabled: false, from: "09:00", to: "13:00" }, // Sat
    { enabled: false, from: "09:00", to: "13:00" }, // Sun
  ],
  sessionDurationMin: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  // 2 is what global_settings.default_slot_capacity has always been, so a
  // provider that never touches the field keeps exactly today's behaviour.
  capacity: 2,
  minNoticeHours: 12,
  maxAdvanceDays: 30,
  blockedDates: [],
  blockedRanges: [],
};

/** "HH:MM" → minutes since midnight. Returns NaN for malformed input. */
export function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm ?? "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN;
  return h * 60 + m;
}

/** minutes since midnight → "HH:MM". */
export function toHHMM(mins: number): string {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 12-hour display for a "HH:MM" string. */
export function to12h(hhmm: string): string {
  const mins = toMinutes(hhmm);
  if (Number.isNaN(mins)) return hhmm;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** JS Date.getDay() (0=Sun) → our Monday-first index (0=Mon). */
export function mondayFirstIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/** Backfill any missing fields so older/partial JSON stays usable. */
export function normalizeBookingSettings(raw: unknown): BookingSettings {
  const d = DEFAULT_BOOKING_SETTINGS;
  const s = (raw ?? {}) as Partial<BookingSettings>;
  const weekly = Array.isArray(s.weekly) && s.weekly.length === 7
    ? s.weekly.map((w, i) => ({
        enabled: Boolean(w?.enabled),
        from: w?.from || d.weekly[i].from,
        to: w?.to || d.weekly[i].to,
      }))
    : d.weekly.map((w) => ({ ...w }));
  return {
    timezone: s.timezone || d.timezone,
    weekly,
    sessionDurationMin: Number(s.sessionDurationMin) > 0 ? Number(s.sessionDurationMin) : d.sessionDurationMin,
    bufferBeforeMin: Math.max(0, Number(s.bufferBeforeMin) || 0),
    bufferAfterMin: Math.max(0, Number(s.bufferAfterMin) || 0),
    // A stored 0 would mean "nobody can ever book", which is what an empty
    // input produces — settings written before this field existed have no
    // value at all, and both must read as the default.
    capacity: Number(s.capacity) > 0 ? Math.floor(Number(s.capacity)) : d.capacity,
    minNoticeHours: Math.max(0, Number(s.minNoticeHours) || 0),
    maxAdvanceDays: Number(s.maxAdvanceDays) > 0 ? Number(s.maxAdvanceDays) : d.maxAdvanceDays,
    blockedDates: Array.isArray(s.blockedDates) ? s.blockedDates.filter((x): x is string => typeof x === "string") : [],
    // A range needs an id and two times; the date is optional and its absence
    // is meaningful. "" was what the old editor wrote when no preview date was
    // picked — it matched no day at all, so the block silently did nothing.
    // It now reads as what the provider was trying to say: every day.
    blockedRanges: Array.isArray(s.blockedRanges)
      ? s.blockedRanges
          .filter((r): r is BlockedRange => !!r && typeof r.from === "string" && typeof r.to === "string")
          .map((r) => ({ ...r, date: typeof r.date === "string" && r.date !== "" ? r.date : null }))
      : [],
  };
}

export interface Slot { from: string; to: string; }

/**
 * Generate the bookable time slots for a given calendar date ("YYYY-MM-DD"),
 * honouring weekly hours, session duration, before/after buffers and blocks.
 * Each booking occupies `bufferBefore + duration + bufferAfter` minutes; the
 * displayed slot is the `duration` window. Returns [] for closed/blocked days.
 */
export function computeSlots(settings: BookingSettings, dateISO: string): Slot[] {
  if (!dateISO) return [];
  if (settings.blockedDates.includes(dateISO)) return [];

  const [y, m, d] = dateISO.split("-").map(Number);
  const jsDay = new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
  const day = settings.weekly[mondayFirstIndex(jsDay)];
  if (!day?.enabled) return [];

  const open = toMinutes(day.from);
  const close = toMinutes(day.to);
  const dur = settings.sessionDurationMin;
  if (Number.isNaN(open) || Number.isNaN(close) || dur <= 0 || close <= open) return [];

  const step = settings.bufferBeforeMin + dur + settings.bufferAfterMin;
  const ranges = settings.blockedRanges.filter((r) => blockAppliesOn(r, dateISO));

  const slots: Slot[] = [];
  let start = open;
  while (start + dur <= close) {
    const end = start + dur;
    const blockEnd = latestBlockEnd(ranges, start, end);

    if (blockEnd !== null) {
      // Resume AT the moment the block ends, with no buffer in front of it.
      // The buffer is the gap the provider needs AFTER a job — to tidy up, to
      // drive to the next address — and a blocked hour is not a job. Stepping
      // the grid past it instead pushed the first slot after a 12:00–15:00
      // lunch to 15:30 and quietly cost half an hour of every such day.
      start = blockEnd > start ? blockEnd : start + step;
      continue;
    }

    slots.push({ from: toHHMM(start), to: toHHMM(end) });
    start += step;
  }
  return slots;
}
