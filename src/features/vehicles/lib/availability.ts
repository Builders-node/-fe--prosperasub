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

/**
 * Release the holds this module already considers dead.
 *
 * The app and the database disagreed about what holds a car, and the
 * disagreement was invisible until it bit. `stillHolds` above frees a pending
 * booking that never reached an invoice after twenty minutes, so the calendar
 * offers those dates again — but the exclusion constraint on `rental_bookings`
 * only ignores CANCELLED rows, so the insert is refused and the customer is
 * told the car "was just booked". It was not: they were shown dates that the
 * database was always going to refuse, and no amount of retrying would help.
 *
 * The server sweep that expires unpayable rows (`expireUnverifiablePending`)
 * is the real fix and runs every ten minutes — when it is deployed. This is
 * the same rule applied from the booking path, scoped to the one car and the
 * one date range in front of the customer, and it only ever cancels a row this
 * file has already stopped counting: pending, never invoiced, past the hold.
 *
 * Returns how many it released, so the caller knows whether a retry is worth
 * anything.
 */
export async function releaseDeadHolds(vehicleId: string, startISO: string, endISO: string): Promise<number> {
  const { data, error } = await supabaseDb
    .from("rental_bookings")
    .select("id,start_date,end_date,status,payment_status,payment_reference,created_at")
    .eq("vehicle_id", vehicleId)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  if (error) return 0;

  const now = Date.now();
  const dead = ((data ?? []) as Array<BookingRow & { id: string }>)
    .filter((b) => !stillHolds(b, now))
    .filter((b) => startISO <= b.end_date && endISO >= b.start_date);
  if (dead.length === 0) return 0;

  const { error: cancelErr } = await supabaseDb
    .from("rental_bookings")
    .update({ status: "cancelled", payment_status: "failed", updated_at: new Date().toISOString() })
    .in("id", dead.map((b) => b.id));
  return cancelErr ? 0 : dead.length;
}
