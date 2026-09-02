export type VehicleStatus = "public" | "private" | "archived";
export type Transmission = "automatic" | "manual";
export type FuelType = "gasoline" | "diesel" | "electric" | "hybrid";

export interface RentalVehicle {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  seats: number;
  transmission: Transmission;
  fuel_type: FuelType;
  air_conditioning: boolean;
  luggage_capacity: number;
  description: string | null;
  daily_price_cents: number;
  weekly_price_cents: number;
  monthly_price_cents: number;
  image_url: string | null;
  gallery_urls: string[];
  status: VehicleStatus;
  sort_order: number;
  /** The business that owns this car — a `providers` row, like every vertical. */
  provider_id: string | null;
  /** Joined for display; not a column. */
  provider?: { id: string; name: string; avatar_url: string | null } | null;
  created_at?: string;
  updated_at?: string;
}

export type BookingStatus = "pending" | "paid" | "confirmed" | "active" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed";

export interface RentalBooking {
  id: string;
  user_id: string;
  vehicle_id: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  rental_days: number;
  daily_price_cents: number;
  subtotal_cents: number;
  discount_pct: number;
  discount_cents: number;
  total_cents: number;
  surcharge_cents: number;
  customer_name: string | null;
  customer_whatsapp: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  admin_notes: string | null;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  payment_reference: string | null;
  created_at?: string;
}

export interface RentalPriceCalc {
  rentalDays: number;
  dailyPriceCents: number;
  effectiveDailyRate: number;
  subtotalCents: number;
  discountCents: number;
  discountPct: number;
  totalCents: number;
  tier: "daily" | "weekly" | "monthly";
  capped: boolean;
}

/**
 * Capped rental price for a span of days.
 *  - daily (1–6 days)   → daily × days
 *  - weekly (7+ days)   → full_weeks × weekly + min(leftover × daily, weekly)
 *  - monthly cap        → the total can never exceed monthly_price_cents
 * Recovered from the original module (commit 55e3782).
 */
export function calcRentalPrice(
  vehicle: Pick<RentalVehicle, "daily_price_cents" | "weekly_price_cents" | "monthly_price_cents">,
  rentalDays: number,
): RentalPriceCalc {
  const daily = vehicle.daily_price_cents || 0;
  const weekly = vehicle.weekly_price_cents || 0;
  const monthly = vehicle.monthly_price_cents || 0;

  let subtotalCents: number;
  let tier: RentalPriceCalc["tier"];
  if (weekly > 0 && rentalDays >= 7) {
    const weeks = Math.floor(rentalDays / 7);
    const leftoverDays = rentalDays % 7;
    const leftoverCost = Math.min(leftoverDays * daily, weekly);
    subtotalCents = weeks * weekly + leftoverCost;
    tier = "weekly";
  } else {
    subtotalCents = rentalDays * daily;
    tier = "daily";
  }

  let totalCents = subtotalCents;
  let capped = false;
  if (monthly > 0 && totalCents > monthly) {
    totalCents = monthly;
    capped = true;
    tier = "monthly";
  } else if (monthly > 0 && rentalDays >= 28) {
    tier = "monthly";
  }

  const discountCents = Math.max(0, subtotalCents - totalCents);
  const discountPct = subtotalCents > 0 ? Math.round((discountCents / subtotalCents) * 100) : 0;
  const effectiveDailyRate = rentalDays > 0 ? Math.round(totalCents / rentalDays) : daily;

  return { rentalDays, dailyPriceCents: daily, effectiveDailyRate, subtotalCents, discountCents, discountPct, totalCents, tier, capped };
}

/** Inclusive day count between two YYYY-MM-DD dates (a 1-day rental = same day → 1). */
export function rentalDaysBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

export const QUICK_DURATIONS = [
  { label: "1 Day", days: 1 },
  { label: "3 Days", days: 3 },
  { label: "1 Week", days: 7 },
  { label: "1 Month", days: 30 },
] as const;

export const FUEL_LABEL: Record<FuelType, string> = {
  gasoline: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid",
};

// ── Booking add-ons (Atlantis price sheet) ──────────────────────────────────
export interface InsuranceTier {
  id: string;
  name: string;
  description: string | null;
  price_per_day_cents: number;
  items: string[];
  sort_order: number;
}

export interface RentalExtra {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  price_type: "per_day" | "flat";
  sort_order: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  areas: string | null;
  fee_cents: number;
  sort_order: number;
}

/** One extra's cost for a rental of `days` days. */
export function extraCost(extra: RentalExtra, days: number): number {
  return extra.price_type === "per_day" ? extra.price_cents * Math.max(1, days) : extra.price_cents;
}
