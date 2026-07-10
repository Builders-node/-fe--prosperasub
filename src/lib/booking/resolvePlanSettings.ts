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
export function resolvePlanBookingSettings(
  plan: { booking_settings?: unknown } | null | undefined,
  provider: { booking_settings?: unknown } | null | undefined,
): BookingSettings {
  if (plan && plan.booking_settings) return normalizeBookingSettings(plan.booking_settings);
  if (provider && provider.booking_settings) return normalizeBookingSettings(provider.booking_settings);
  return normalizeBookingSettings(null);
}

/** True if the plan carries its own override (vs. inheriting the provider's). */
export function hasPlanOverride(plan: { booking_settings?: unknown } | null | undefined): boolean {
  return !!plan?.booking_settings;
}
