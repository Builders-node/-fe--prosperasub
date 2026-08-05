/**
 * Cancelling a cleaning visit, in one place.
 *
 * Cancelling is not a status change. A booked visit holds two things besides
 * its own row: a seat in `cleaning_available_slots.current_bookings`, and one
 * unit of `cleaning_subscriptions.cleanings_remaining`. Three of the four
 * places that could cancel a visit wrote only `status = 'cancelled'` and left
 * both behind — the slot stayed "full" forever and the customer lost a cleaning
 * they never received. That drift is exactly what the 30 mismatched counters in
 * production were.
 *
 * So every caller goes through here instead. Takes the PostgREST client as an
 * argument rather than importing it, because the wrapper in
 * `integrations/supabase/client.ts` calls this too and importing it back would
 * be a cycle.
 */

/** Minimal shape we need — satisfied by the real supabase-js client. */
type Db = {
  from: (table: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => any;
};

/** Cancelling one of these would be wrong (completed) or a double-release. */
const NOT_CANCELLABLE = new Set(["cancelled", "completed"]);

export interface CancelResult {
  /** Ids actually moved to cancelled. */
  cancelled: string[];
  /** Ids left alone because they were already cancelled or completed. */
  skipped: string[];
}

/**
 * Cancel one or more cleaning bookings and give back what they were holding.
 *
 * Idempotent: an already-cancelled row is skipped, so a double click or a retry
 * can't decrement a slot twice. Completed visits are skipped as well — the work
 * happened, so neither the seat nor the cleaning should come back.
 */
export async function cancelCleaningBookings(db: Db, ids: string[]): Promise<CancelResult> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return { cancelled: [], skipped: [] };

  const { data: rows, error } = await db
    .from("cleaning_bookings")
    .select("id, status, slot_id, cleaning_subscription_id, subscription_id")
    .in("id", unique);
  if (error) throw error;

  const bookings = (rows ?? []) as Array<{
    id: string;
    status: string | null;
    slot_id: string | null;
    cleaning_subscription_id: string | null;
    subscription_id: string | null;
  }>;

  const target = bookings.filter((b) => !NOT_CANCELLABLE.has(b.status ?? ""));
  const skipped = bookings.filter((b) => NOT_CANCELLABLE.has(b.status ?? "")).map((b) => b.id);
  if (target.length === 0) return { cancelled: [], skipped };

  const now = new Date().toISOString();
  const targetIds = target.map((b) => b.id);

  // Status first. If a release below fails we've still stopped the visit — an
  // over-counted slot is a smaller problem than a cleaner turning up.
  const { error: updateError } = await db
    .from("cleaning_bookings")
    // Flag for calendar sync so the Google event is withdrawn even when the
    // canceller (a client) can't reach the admin sync endpoint.
    .update({ status: "cancelled", google_calendar_sync_status: "pending", updated_at: now })
    .in("id", targetIds);
  if (updateError) throw updateError;

  await releaseSlots(db, target.map((b) => b.slot_id).filter((id): id is string => Boolean(id)), now);
  await refundCleanings(db, target.map((b) => b.cleaning_subscription_id || b.subscription_id), now);

  return { cancelled: targetIds, skipped };
}

/**
 * Hand the seats back. Two bookings in the same slot means that slot has to
 * come down by two, hence the count rather than a Set.
 */
async function releaseSlots(db: Db, slotIds: string[], now: string): Promise<void> {
  const perSlot = new Map<string, number>();
  slotIds.forEach((id) => perSlot.set(id, (perSlot.get(id) ?? 0) + 1));

  for (const [slotId, times] of perSlot) {
    for (let i = 0; i < times; i += 1) {
      const { error } = await db.rpc("decrement_slot_bookings", { p_slot_id: slotId });
      if (!error) continue;
      // Read-modify-write fallback. Racier than the RPC, but a counter that is
      // occasionally one high beats a slot nobody can ever book again.
      const { data: slot } = await db
        .from("cleaning_available_slots")
        .select("current_bookings")
        .eq("id", slotId)
        .single();
      if (!slot) break;
      await db
        .from("cleaning_available_slots")
        .update({ current_bookings: Math.max(0, (slot.current_bookings ?? 0) - 1), updated_at: now })
        .eq("id", slotId);
    }
  }
}

/** Give the customer back the cleanings they didn't get. */
async function refundCleanings(db: Db, subIds: Array<string | null>, now: string): Promise<void> {
  const perSub = new Map<string, number>();
  subIds.forEach((id) => { if (id) perSub.set(id, (perSub.get(id) ?? 0) + 1); });

  for (const [subId, count] of perSub) {
    const { data: sub } = await db
      .from("cleaning_subscriptions")
      .select("cleanings_remaining")
      .eq("id", subId)
      .single();
    if (!sub) continue;
    await db
      .from("cleaning_subscriptions")
      .update({ cleanings_remaining: (sub.cleanings_remaining ?? 0) + count, updated_at: now })
      .eq("id", subId);
  }
}
