import {
  normalizeBookingSettings,
  type BookingSettings,
} from "@/lib/booking/bookingSettings";

/**
 * Resolve the effective booking calendar for a given plan / provider pair.
 *
 * Precedence (highest → lowest):
 *   1. `plan.booking_settings`     — per-plan override
 *   2. `provider.booking_settings` — provider default
 *   3. `DEFAULT_BOOKING_SETTINGS`  — global default
 *
 * `normalizeBookingSettings` fills in any missing fields at each level, so a
 * partial override (e.g. only `weekly` set) still works — the rest of the
 * fields fall through to the underlying default.
 */
/**
 * The keys that make a `booking_settings` blob an actual calendar.
 *
 * `booking_settings` is a free-form JSONB column, and things other than a
 * calendar have been stored in it — the Car Wash plan holds
 * `{cost_cents, markup_cents}`. A bare truthiness check treated that as a
 * per-plan override, so the plan claimed to override the provider's schedule
 * with an object containing no schedule: `normalizeBookingSettings` filled in
 * the global defaults, the provider's own hours were never consulted, and the
 * customer silently lost the slots that fell outside 09:00–17:00 Mon–Fri.
 */
const CALENDAR_KEYS = [
  "weekly", "timezone", "sessionDurationMin", "bufferBeforeMin", "bufferAfterMin",
  "minNoticeHours", "maxAdvanceDays", "blockedDates", "blockedRanges",
] as const;

/** True when the blob actually describes a calendar, not just any JSON. */
function isCalendar(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  return CALENDAR_KEYS.some((k) => k in (raw as Record<string, unknown>));
}

export function resolvePlanBookingSettings(
  plan: { booking_settings?: unknown } | null | undefined,
  provider: { booking_settings?: unknown } | null | undefined,
): BookingSettings {
  if (isCalendar(plan?.booking_settings)) return normalizeBookingSettings(plan!.booking_settings);
  if (isCalendar(provider?.booking_settings)) return normalizeBookingSettings(provider!.booking_settings);
  return normalizeBookingSettings(null);
}

/** True if the plan carries its own calendar override (vs. inheriting). */
export function hasPlanOverride(plan: { booking_settings?: unknown } | null | undefined): boolean {
  return isCalendar(plan?.booking_settings);
}
