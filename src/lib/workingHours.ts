/** Structured working-hours format stored as JSON in the DB TEXT column. */

export type DayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface HoursSchedule {
  days: DayCode[];
  open: string;  // "08:00"
  close: string; // "20:00"
}

export const DAY_CODES: DayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export const DAY_LABELS: Record<DayCode, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

/** Parse the working_hours TEXT column → array of schedules (falls back gracefully). */
export function parseWorkingHours(raw: string | null | undefined): HoursSchedule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as HoursSchedule[];
  } catch {
    // legacy plain-text fallback — wrap it in a display-only entry
  }
  return [];
}

/** Serialize schedules array → JSON string for DB storage. */
export function serializeWorkingHours(schedules: HoursSchedule[]): string {
  const clean = schedules.filter((s) => s.days.length > 0 && s.open && s.close);
  return clean.length === 0 ? "" : JSON.stringify(clean);
}

/** Human-readable one-liner, e.g. "Mon–Fri 08:00–20:00  ·  Sat 09:00–14:00" */
export function formatWorkingHours(raw: string | null | undefined): string {
  const schedules = parseWorkingHours(raw);
  if (schedules.length === 0) return raw ?? "";
  return schedules
    .map((s) => {
      const dayStr = compressDays(s.days);
      return `${dayStr}  ${s.open}–${s.close}`;
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
