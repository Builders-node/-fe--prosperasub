import { useEffect } from "react";
import { supabaseDb, accountApi } from "@/integrations/supabase/client";

/**
 * DDD live-integration Step 2 (shadow-read). When `enabled`, fetches
 * availability from the new Booking engine for the same resource/date and logs a
 * parity comparison against the page's own slot grid. Purely observational:
 * read-only, off by default (`localStorage['ddd.shadowBooking'] === '1'`), and
 * never affects the UI or the real booking flow. This is the reusable primitive
 * the later canary/cutover build on.
 */
export function useBookingEngineShadow(opts: {
  sourceServiceKey: string;   // e.g. "beach"
  sourceResourceId: string;   // legacy resource id (e.g. beach_club_courts.id)
  date: string;               // YYYY-MM-DD
  enabled: boolean;
  frontendSlots?: string[];   // the page's own slot starts, for the diff
}) {
  const { sourceServiceKey, sourceResourceId, date, enabled, frontendSlots } = opts;

  useEffect(() => {
    if (!enabled || !sourceResourceId || !date) return;
    let cancelled = false;

    (async () => {
      try {
        // Bridge the legacy resource id → the universal bookable_resources id.
        const { data: res } = await supabaseDb
          .from("bookable_resources")
          .select("id,name")
          .eq("source_service_key", sourceServiceKey)
          .eq("source_resource_id", sourceResourceId)
          .maybeSingle();
        if (!res?.id || cancelled) return;

        const { data, error } = await accountApi(`/booking/availability?resourceId=${res.id}&date=${date}`);
        if (error || cancelled) return;

        const engine: string[] = (data?.slots ?? []).map((s: { from: string }) => s.from);
        const front = frontendSlots ?? [];
        const match = front.length > 0 && engine.length === front.length && front.every((f, i) => engine[i] === f);
        // eslint-disable-next-line no-console
        console.info("[ddd-shadow] booking availability parity", {
          match, resource: res.id, date, engine, frontend: front,
        });
      } catch {
        /* shadow read must never throw or affect the page */
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, sourceServiceKey, sourceResourceId, date, frontendSlots]);
}

/**
 * DDD live-integration Step 3 (shadow-write). Fire-and-forget AFTER a real
 * booking already succeeded: places a hold + confirm in the new Booking engine
 * (`bookings` table) mirroring the real booking, so the write path + double-book
 * constraint get exercised on production traffic. Never throws and never blocks
 * — the real booking is already done. Caller gates it on the shadow flag.
 */
export async function shadowConfirmBooking(opts: {
  sourceServiceKey: string;
  sourceResourceId: string;
  date: string;
  from: string; // "HH:MM"
}): Promise<void> {
  try {
    const { data: res } = await supabaseDb
      .from("bookable_resources")
      .select("id")
      .eq("source_service_key", opts.sourceServiceKey)
      .eq("source_resource_id", opts.sourceResourceId)
      .maybeSingle();
    if (!res?.id) return;

    const hold = await accountApi("/booking/hold", {
      method: "POST",
      body: JSON.stringify({ resource_id: res.id, date: opts.date, from: opts.from }),
    });
    const held = hold.data as { held?: boolean; bookingId?: string; reason?: string } | null;
    if (hold.error || !held?.held || !held.bookingId) {
      // eslint-disable-next-line no-console
      console.info("[ddd-shadow] hold not placed", { reason: held?.reason ?? hold.error?.message, from: opts.from });
      return;
    }

    const confirm = await accountApi(`/booking/holds/${held.bookingId}/confirm`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    // eslint-disable-next-line no-console
    console.info("[ddd-shadow] shadow booking written", {
      resource: res.id, date: opts.date, from: opts.from, holdId: held.bookingId, confirmed: !confirm.error,
    });
  } catch {
    /* shadow write must never throw or affect the real booking */
  }
}
