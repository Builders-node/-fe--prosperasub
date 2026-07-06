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
  date: string;        // "YYYY-MM-DD"
  from: string;        // "HH:MM"
  to: string;          // "HH:MM"
  note?: string;
}

export interface BookingSettings {
  timezone: string;
  /** Length 7, Monday-first (index 0 = Monday). */
  weekly: DayHours[];
  sessionDurationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
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
    minNoticeHours: Math.max(0, Number(s.minNoticeHours) || 0),
    maxAdvanceDays: Number(s.maxAdvanceDays) > 0 ? Number(s.maxAdvanceDays) : d.maxAdvanceDays,
    blockedDates: Array.isArray(s.blockedDates) ? s.blockedDates.filter((x): x is string => typeof x === "string") : [],
    blockedRanges: Array.isArray(s.blockedRanges)
      ? s.blockedRanges.filter((r): r is BlockedRange => !!r && typeof r.date === "string")
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
  const ranges = settings.blockedRanges.filter((r) => r.date === dateISO);

  const slots: Slot[] = [];
  for (let start = open; start + dur <= close; start += step) {
    const end = start + dur;
    const overlapsBlock = ranges.some((r) => {
      const bf = toMinutes(r.from);
      const bt = toMinutes(r.to);
      return !Number.isNaN(bf) && !Number.isNaN(bt) && start < bt && end > bf;
    });
    if (!overlapsBlock) slots.push({ from: toHHMM(start), to: toHHMM(end) });
  }
  return slots;
}
