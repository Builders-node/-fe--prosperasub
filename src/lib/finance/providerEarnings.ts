import { supabaseDb } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaging";
import { addDaysISO } from "@/lib/timezone";
import { overlapDays, recognizedCents } from "@/lib/revenueRecognition";
import { financeSourceFor } from "@/lib/finance/platformTake";

/**
 * What a provider earned in a window — one definition, used everywhere.
 *
 * There were two. The Money tab recognized revenue straight-line across each
 * subscription's service period (the way the admin's Net Profit page does it);
 * the KPI strip above Overview summed whatever was PAID inside the calendar
 * month. On a three-month plan bought in January the strip said $300 and the
 * tab said $100, on the same screen, and neither was labelled well enough for
 * an owner to tell which question was being answered. Straight-line wins
 * because it is the number the platform reconciles against.
 *
 * Paging matters here: these rows get reduced into a number, and a plain
 * PostgREST select silently stops at 1000 rows (see CLAUDE.md).
 */
/**
 * Provider-scoped paid rows, per service, in the shape revenue recognition
 * wants.
 *
 * `providerId` is the UNIVERSAL id and is what scopes the beach branch; the
 * legacy id scopes the two services whose money still lives in legacy tables.
 * See lib/services/providerBridge.ts for why there are two.
 */
export async function fetchEarned(sourceKey: string, legacyId: string, start: Date, end: Date, providerId?: string) {
  const source = financeSourceFor(sourceKey);
  const acc = (
    rows: any[],
    toInput: (r: any) => Parameters<typeof recognizedCents>[0],
    unit?: (r: any) => number,
  ) => {
    let revenue = 0;
    let units = 0;
    (rows ?? []).forEach((r) => {
      const input = toInput(r);
      if (overlapDays(input, start, end) <= 0) return;
      revenue += recognizedCents(input, start, end);
      units += unit ? unit(r) : 1;
    });
    return { revenue, units };
  };

  if (source === "cleaning") {
    const pkgs = await fetchAllRows<any>(() =>
      supabaseDb.from("cleaning_packages").select("id").eq("provider_id", legacyId).order("id"));
    const ids = (pkgs ?? []).map((p) => p.id);
    if (!ids.length) return { revenue: 0, units: 0 };
    const rows = await fetchAllRows<any>(() =>
      supabaseDb.from("cleaning_subscriptions")
        .select("total_price_cents, monthly_price_cents, created_at, service_start_date, service_end_date, start_date, end_date")
        .in("package_id", ids).eq("payment_status", "paid").is("deleted_at", null).order("id"));
    return acc(rows, (r) => {
      const total = Number(r.total_price_cents || 0);
      const monthly = Number(r.monthly_price_cents || 0);
      const months = monthly > 0 && total >= monthly ? Math.max(1, Math.round(total / monthly)) : 1;
      return {
        totalCents: total || monthly,
        serviceStart: r.service_start_date || r.start_date || r.created_at,
        serviceEnd: r.service_end_date || r.end_date,
        fallbackDays: months * 30,
      };
    });
  }

  if (source === "food") {
    const rows = await fetchAllRows<any>(() =>
      supabaseDb.from("food_subscriptions")
        .select("weekly_price_cents, commitment_weeks, periods_paid, created_at, started_at")
        .eq("provider_id", legacyId)
        .in("status", ["active", "paused", "expired"])
        .eq("payment_status", "paid").order("id"));
    return acc(rows, (r) => {
      const weeks = (r.commitment_weeks || 1) * (r.periods_paid || 1);
      const startDay = r.started_at || r.created_at;
      return {
        totalCents: (r.weekly_price_cents || 0) * weeks,
        serviceStart: startDay,
        serviceEnd: startDay ? addDaysISO(startDay, weeks * 7) : null,
        fallbackDays: weeks * 7,
      };
    });
  }

  if (source === "beach") {
    // Scoped to THIS business, not to the service.
    //
    // "There is only one beach club" was true of the club and false of the
    // finance source: `financeSourceFor` also answers "beach" for every
    // provider on the Lifestyle archetype, so a second one — Massage is
    // already such a row — was shown the club's revenue as its own, and the
    // payout cap is computed from exactly this number.
    //
    // The membership rows moved to `provider_subscriptions`; the legacy twin
    // is a copy kept for readers that have not. Counting the copy would be
    // counting the same money in the same place twice once they all have.
    const scope = providerId || legacyId;
    if (!scope) return { revenue: 0, units: 0 };
    const rows = await fetchAllRows<any>(() =>
      supabaseDb.from("provider_subscriptions")
        .select("price_cents, metadata, created_at, start_date, end_date")
        .eq("provider_id", scope)
        .eq("payment_status", "paid").order("id"));
    return acc(rows,
      (r) => ({ totalCents: r.price_cents || 0, serviceStart: r.start_date || r.created_at, serviceEnd: r.end_date, fallbackDays: 30 }),
      (r) => Number(r.metadata?.people) || 0);
  }

  if (source === "vehicles") {
    // Scoped by the UNIVERSAL id: `rental_bookings.provider_id` is a
    // `providers` reference, not a legacy one — cars never had a legacy id
    // space to bridge from.
    const scope = providerId || legacyId;
    if (!scope) return { revenue: 0, units: 0 };
    const rows = await fetchAllRows<any>(() =>
      supabaseDb.from("rental_bookings")
        .select("total_cents, start_date, end_date, created_at, rental_days")
        .eq("provider_id", scope)
        .eq("payment_status", "paid")
        .neq("status", "cancelled")
        .is("deleted_at", null)
        .order("id"));
    // Straight-line across the days the car is actually out, the same
    // recognition every other service uses. `total_cents` is the BASE — the
    // payment surcharge lives in its own column and is the processor's cut,
    // never the business's revenue.
    return acc(rows, (r) => ({
      totalCents: Number(r.total_cents || 0),
      serviceStart: r.start_date || r.created_at,
      serviceEnd: r.end_date,
      fallbackDays: Math.max(1, Number(r.rental_days) || 1),
    }));
  }

  return { revenue: 0, units: 0 };
}
