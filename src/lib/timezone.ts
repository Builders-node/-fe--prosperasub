/**
 * Honduras timezone utilities.
 * Honduras is permanently on CST (UTC-6) — no daylight saving time.
 */

export const HN_TZ = "America/Tegucigalpa";

/**
 * Returns today's date as a "YYYY-MM-DD" string in Honduras time.
 * Use this instead of `format(new Date(), "yyyy-MM-dd")`.
 */
export function todayHN(): string {
  // sv-SE locale produces ISO-style YYYY-MM-DD format
  return new Intl.DateTimeFormat("sv-SE", { timeZone: HN_TZ }).format(new Date());
}

/**
 * Returns a new Date whose wall-clock date/time matches right now in Honduras.
 * Useful when passing to date-fns functions that read local-time fields.
 *
 * Note: the underlying UTC value will be "wrong" — this Date is only meant
 * for calendar/display arithmetic, not for serialisation.
 */
export function nowHN(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HN_TZ,
    year:   "numeric",
    month:  "2-digit",
    day:    "2-digit",
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return new Date(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
}

/**
 * Format a timestamp (string or Date) for display in Honduras timezone.
 * Returns something like "May 28, 2026, 3:45 PM"
 */
export function formatTimestampHN(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year:   "numeric",
    month:  "short",
    day:    "numeric",
    hour:   "numeric",
    minute: "2-digit",
    hour12: true,
  },
): string {
  if (!value) return "—";
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat("en-US", { timeZone: HN_TZ, ...options }).format(date);
  } catch {
    return String(value);
  }
}

/**
 * Format a date-only value (string or Date) in Honduras timezone.
 * Returns something like "May 28, 2026"
 */
export function formatDateHN(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year:  "numeric",
    month: "short",
    day:   "numeric",
  },
): string {
  if (!value) return "—";
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat("en-US", { timeZone: HN_TZ, ...options }).format(date);
  } catch {
    return String(value);
  }
}
