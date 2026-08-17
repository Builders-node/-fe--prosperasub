/**
 * The engine's refusals, in words a customer can act on.
 *
 * `hold` answers with machine codes — `slot_unavailable`, `membership_required`
 * — and every screen that books a time was translating the same list into
 * slightly different sentences, or not translating it at all and showing the
 * code. The provider's own rules are the interesting half: a button that does
 * nothing teaches nobody that they have hit their daily limit.
 */
export function bookingErrorMessage(raw: string | null | undefined, fallback = "Could not hold the slot"): string {
  switch ((raw ?? "").trim()) {
    case "slot_unavailable":     return "That time isn't bookable — pick another slot.";
    case "slot_taken":           return "That slot was just taken.";
    case "resource_not_found":   return "This calendar isn't open for booking yet.";
    case "membership_required":  return "This is for members — subscribe first.";
    case "resource_not_in_plan": return "Your plan doesn't include this one. Pick another, or change plan.";
    case "hour_allowance_reached": return "You've used the hours your plan includes for this period.";
    case "too_many_bookings":    return "You've reached your limit of upcoming bookings. Cancel one to book another.";
    case "daily_limit_reached":  return "You've booked your maximum for that day.";
    case "too_late_to_cancel":   return "It's too close to the start to cancel — call the provider.";
    case "not_your_booking":     return "That booking isn't yours.";
    case "subject_required":     return "Sign in to book.";
    default:                     return (raw || "").trim() || fallback;
  }
}
