import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { fetchUsersByIds, customerNameFrom } from "@/lib/admin/customerNames";
import { fetchAllRows } from "@/lib/supabasePaging";

/**
 * Everything the fleet screens read — the cars, every booking and every block
 * — in one query, so the overview, the calendar, the list and the booking
 * sheet never disagree about a day.
 *
 * Reads are direct (public RLS on rental_*); every write goes through the
 * Edge api (routes/rentals.ts).
 */

export interface FleetVehicle {
  id: string; name: string; image_url: string | null; status: string;
  daily_price_cents: number; weekly_price_cents: number; monthly_price_cents: number; seats: number; provider_id: string | null; sort_order: number;
  provider?: { id: string; name: string } | null;
}

export interface FleetBooking {
  id: string; vehicle_id: string; provider_id: string | null; user_id: string;
  start_date: string; end_date: string; rental_days: number;
  status: string; payment_status: string; payment_method: string | null; payment_reference: string | null;
  subtotal_cents: number; discount_cents: number; insurance_cents: number | null; extras_cents: number | null;
  delivery_fee_cents: number | null; surcharge_cents: number | null; total_cents: number;
  extras: Array<{ name?: string; cents?: number }> | null;
  customer_name: string | null; customer_whatsapp: string | null;
  delivery_address: string | null; delivery_notes: string | null; admin_notes: string | null;
  created_at: string;
  pickup_at?: string | null; pickup_odometer_km?: number | null; pickup_fuel_eighths?: number | null; pickup_notes?: string | null;
  return_at?: string | null; return_odometer_km?: number | null; return_fuel_eighths?: number | null; return_notes?: string | null;
  damage_notes?: string | null;
  /** Joined for display. */
  customer: string;
  email: string | null;
}

export interface FleetBlock { id: string; vehicle_id: string; start_date: string; end_date: string; reason: string | null }

export const FLEET_KEY = "admin-fleet";

export function useFleet(providerId?: string) {
  return useQuery({
    queryKey: [FLEET_KEY, providerId ?? "all"],
    queryFn: async () => {
      let vq = supabaseDb.from("rental_vehicles").select("id,name,image_url,status,daily_price_cents,weekly_price_cents,monthly_price_cents,seats,provider_id,sort_order,provider:providers(id,name)")
        .neq("status", "archived");
      if (providerId) vq = vq.eq("provider_id", providerId);
      const { data: vehicles, error: vErr } = await vq.order("sort_order").order("name");
      if (vErr) throw vErr;

      const bookings = await fetchAllRows<FleetBooking>(() => {
        let q = supabaseDb.from("rental_bookings").select("*").is("deleted_at", null);
        if (providerId) q = q.eq("provider_id", providerId);
        return q.order("start_date", { ascending: false }).order("id") as any;
      });

      let bq = supabaseDb.from("rental_blocks").select("id,vehicle_id,start_date,end_date,reason,provider_id");
      if (providerId) bq = bq.eq("provider_id", providerId);
      const { data: blocks } = await bq; // absent before the operations migration

      const users = await fetchUsersByIds(bookings.map((b) => b.user_id));
      return {
        vehicles: (vehicles ?? []) as unknown as FleetVehicle[],
        bookings: bookings.map((b) => ({
          ...b,
          customer: customerNameFrom({ user: users.get(String(b.user_id)), customerName: b.customer_name, fallback: "Walk-in" }),
          email: users.get(String(b.user_id))?.email ?? null,
        })),
        blocks: (blocks ?? []) as FleetBlock[],
      };
    },
  });
}

/** A booking that holds its car (not cancelled). */
export const holds = (b: Pick<FleetBooking, "status">) => b.status !== "cancelled";

/** Today in Roatán, YYYY-MM-DD. */
export const todayHN = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const addDaysISO = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Days of [start, end] (inclusive) that fall inside [from, to] (inclusive). */
export function overlapDays(start: string, end: string, from: string, to: string): number {
  const a = start > from ? start : from;
  const b = end < to ? end : to;
  if (b < a) return 0;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}

export const FUEL_LABELS = ["Empty", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "Full"];
