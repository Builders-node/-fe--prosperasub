import { supabaseDb } from "@/integrations/supabase/client";

/**
 * Which bookings actually hold a car, and for how long.
 *
 * "Not cancelled" is too blunt a rule. A checkout that is still pending has to
 * hold its dates — otherwise two people pay for the same car — but nothing
 * cancels an abandoned one, so holding for ever lets someone who opened the
 * page and wandered off block that car permanently. The hold is therefore
 * scaled to how far the customer actually got:
 *
 *  - paid / confirmed / active / completed → held, no expiry.
 *  - pending WITH a payment reference → they reached an invoice and may still
 *    be waiting on a slow on-chain confirmation; held for a day, which is how
 *    long the server keeps retrying it.
 *  - pending with no reference at all → they never got as far as an invoice;
 *    held only long enough to finish the form.
 */
const HELD_STATUSES = new Set(["paid", "confirmed", "active", "completed"]);

export const PENDING_NO_REFERENCE_HOLD_MINUTES = 20;
export const PENDING_WITH_REFERENCE_HOLD_HOURS = 24;

export interface HeldRange { start: string; end: string }

interface BookingRow {
  start_date: string;
  end_date: string;
  status: string | null;
  payment_status: string | null;
  payment_reference: string | null;
  created_at: string | null;
}

function stillHolds(b: BookingRow, now: number): boolean {
  if (b.payment_status === "paid") return true;
  if (b.status && HELD_STATUSES.has(b.status)) return true;

  const createdAt = b.created_at ? Date.parse(b.created_at) : NaN;
  // No usable timestamp — treat it as holding rather than double-sell the car.
  if (Number.isNaN(createdAt)) return true;

  const ageMs = now - createdAt;
  return b.payment_reference
    ? ageMs < PENDING_WITH_REFERENCE_HOLD_HOURS * 60 * 60 * 1000
    : ageMs < PENDING_NO_REFERENCE_HOLD_MINUTES * 60 * 1000;
}

/** The date ranges this vehicle is not available for, newest state from the DB. */
export async function fetchHeldRanges(vehicleId: string): Promise<HeldRange[]> {
  const { data, error } = await supabaseDb
    .from("rental_bookings")
    .select("start_date,end_date,status,payment_status,payment_reference,created_at")
    .eq("vehicle_id", vehicleId)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as BookingRow[])
    .filter((b) => stillHolds(b, now))
    .map((b) => ({ start: b.start_date, end: b.end_date }));
}

/** Inclusive overlap between a YYYY-MM-DD span and any held range. */
export function overlapsHeld(startISO: string, endISO: string, held: HeldRange[]): boolean {
  return held.some((r) => startISO <= r.end && endISO >= r.start);
}
