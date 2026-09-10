import { accountApi } from "@/integrations/supabase/client";

/**
 * Cancel an hour on a calendar.
 *
 * Lives here rather than in either caller because both the admin orders screen
 * and the provider's own calendar need it, and neither should be importing the
 * other's module to get it.
 *
 * It has to be the API. The booking engine's table is service-role only, and a
 * PostgREST update it refuses comes back **200 with zero rows** — no error to
 * catch — so the direct write both surfaces used reported success and changed
 * nothing. The endpoint also frees the slot, writes the legacy row back and
 * lets the waitlist move, none of which a status write would have done.
 */
export async function cancelCourtBooking(id: string): Promise<void> {
  const { error } = await accountApi(`/booking/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  if (error) throw error;
}
