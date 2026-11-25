import { formatTime } from "@/lib/formatTime";
import { tr } from "@/lib/tr";
/** Structured working-hours format stored as JSON in the DB TEXT column. */

export type DayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface HoursSchedule {
  days: DayCode[];
  open: string;  // "08:00"
  close: string; // "20:00"
}

export const DAY_CODES: DayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const DAY_LABELS: Record<DayCode, string> = {
  MO: tr("Mon"),
  TU: tr("Tue"),
  WE: tr("Wed"),
  TH: tr("Thu"),
  FR: tr("Fri"),
  SA: tr("Sat"),
  SU: tr("Sun"),
};

/** Parse the working_hours TEXT column → array of schedules (falls back gracefully). */
/**
 * Accepts either shape.
 *
 * `providers.working_hours` is JSONB and comes back as an array; the legacy
 * per-service tables still store the same JSON as TEXT. Feeding an array to
 * JSON.parse throws, which this used to swallow — so the day a column became
 * JSONB every provider's hours would have quietly read as "Not set".
 */
export function parseWorkingHours(raw: unknown): HoursSchedule[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as HoursSchedule[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as HoursSchedule[];
  } catch {
    // A plain-text legacy value is shown as-is by formatWorkingHours.
  }
  return [];
}

/** Serialize schedules array → JSON string for DB storage. */
export function serializeWorkingHours(schedules: HoursSchedule[]): string {
  const clean = schedules.filter((s) => s.days.length > 0 && s.open && s.close);
  return clean.length === 0 ? "" : JSON.stringify(clean);
}

/** Human-readable one-liner, e.g. "Mon–Fri 08:00–20:00  ·  Sat 09:00–14:00" */
export function formatWorkingHours(raw: unknown): string {
  const schedules = parseWorkingHours(raw);
  if (schedules.length === 0) return typeof raw === "string" ? raw : "";
  return schedules
    .map((s) => {
      const dayStr = compressDays(s.days);
      return `${dayStr}  ${formatTime(s.open)}–${formatTime(s.close)}`;
    })
    .join("  ·  ");
}

/** Compress consecutive days: ["MO","TU","WE","TH","FR"] → "Mon–Fri" */
function compressDays(days: DayCode[]): string {
  if (days.length === 0) return "";
  const ORDER = DAY_CODES;
  const sorted = [...days].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    const prevIdx = ORDER.indexOf(prev);
    const curIdx = cur ? ORDER.indexOf(cur) : -1;

    if (cur && curIdx === prevIdx + 1) {
      prev = cur;
    } else {
      ranges.push(
        start === prev
          ? DAY_LABELS[start]
          : `${DAY_LABELS[start]}–${DAY_LABELS[prev]}`,
      );
      if (cur) { start = cur; prev = cur; }
    }
  }

  return ranges.join(", ");
}

export const EMPTY_SCHEDULE = (): HoursSchedule => ({
  days: [],
  open: "08:00",
  close: "20:00",
});

/**
 * Is the business open right now, and until when — or when does it open next.
 *
 * Read on the business's own clock (Honduras), not the visitor's: someone
 * planning a trip from Europe still needs "Open until 8:00 PM" in local time.
 * `now` is a wall-clock Date in that zone (see `nowHN`). Hours that run past
 * midnight (22:00–02:00) count as open after midnight on the next day.
 * Returns null when the hours are not structured (a legacy free-text value).
 */
export interface OpenStatus {
  open: boolean;
  /** When open: closing time, "20:00". */
  until?: string;
  /** When closed: the next opening time, or null if it never opens. */
  opensAt?: string | null;
  opensDay?: "today" | "tomorrow" | DayCode | null;
}

export function openStatus(raw: unknown, now: Date): OpenStatus | null {
  const schedules = parseWorkingHours(raw).filter((s) => s.days?.length && s.open && s.close);
  if (schedules.length === 0) return null;
  const mins = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  // getDay(): 0 = Sunday. DAY_CODES starts on Monday.
  const dayAt = (offset: number): DayCode => DAY_CODES[(now.getDay() + 6 + offset) % 7];
  const today = dayAt(0);
  const yesterday = dayAt(6);
  const t = now.getHours() * 60 + now.getMinutes();

  for (const s of schedules) {
    const o = mins(s.open), c = mins(s.close);
    const overnight = c <= o;
    if (s.days.includes(today) && t >= o && (overnight || t < c)) return { open: true, until: s.close };
    if (overnight && s.days.includes(yesterday) && t < c) return { open: true, until: s.close };
  }
  // Next opening: later today, then the following six days.
  for (let offset = 0; offset < 7; offset++) {
    const day = dayAt(offset);
    const starts = schedules
      .filter((s) => s.days.includes(day))
      .map((s) => s.open)
      .filter((o) => offset > 0 || mins(o) > t)
      .sort((a, b) => mins(a) - mins(b));
    if (starts.length) {
      return { open: false, opensAt: starts[0], opensDay: offset === 0 ? "today" : offset === 1 ? "tomorrow" : day };
    }
  }
  return { open: false, opensAt: null, opensDay: null };
}

/** "Open until 8:00 PM", "Closed · opens 8:00 AM", "Closed · opens Mon 8:00 AM". */
export function openStatusLabel(s: OpenStatus): string {
  if (s.open) return tr("Open until {until}", { until: formatTime(s.until) });
  if (!s.opensAt) return tr("Closed");
  const when = s.opensDay === "today" ? "" : s.opensDay === "tomorrow" ? "tomorrow " : `${DAY_LABELS[s.opensDay]} `;
  return tr("Closed · opens {when}{opensAt}", { when, opensAt: formatTime(s.opensAt) });
}
