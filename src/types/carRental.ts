export interface RentalVehicle {
  id: string;
  name: string;
  description: string | null;
  brand: string;
  model: string;
  year: number;
  seats: number;
  transmission: "automatic" | "manual";
  fuel_type: "gasoline" | "diesel" | "electric" | "hybrid";
  air_conditioning: boolean;
  luggage_capacity: number;
  daily_price_cents: number;
  weekly_price_cents: number;      // 8-day package total ("+8 días" from price table)
  biweekly_price_cents: number;
  monthly_price_cents: number;     // 30-day package total
  monthly_discount_pct: number;
  status: "public" | "private" | "archived";
  sort_order: number;
  created_at: string;
  updated_at: string;
  images?: RentalVehicleImage[];
}

export interface RentalVehicleImage {
  id: string;
  vehicle_id: string;
  url: string;
  sort_order: number;
  created_at: string;
}

export type RentalBookingStatus =
  | "pending"
  | "paid"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled";

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
  status: RentalBookingStatus;
  payment_status: "pending" | "paid" | "failed";
  payment_method: string | null;
  payment_reference: string | null;
  delivery_address: string | null;
  delivery_notes: string | null;
  admin_notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: RentalVehicle;
}

export interface RentalInsuranceTier {
  id: string;
  name: string;
  price_per_day_cents: number;
  items: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RentalDeliveryZone {
  id: string;
  name: string;
  areas: string | null;
  fee_cents: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RentalDeliverySettings {
  id: string;
  delivery_available: boolean;
  delivery_areas: string | null;
  pickup_instructions: string | null;
  delivery_fee_cents: number;
  terms_and_conditions: string | null;
  updated_at: string;
}

export interface RentalPriceCalc {
  rentalDays: number;
  dailyPriceCents: number;      // base daily rate
  effectiveDailyRate: number;   // actual per-day rate at this duration
  subtotalCents: number;        // raw price before the monthly cap
  discountCents: number;        // amount saved (cap savings + weekly savings vs daily)
  discountPct: number;
  totalCents: number;           // final price (never exceeds the monthly price)
  tier: "daily" | "weekly" | "monthly";
  capped: boolean;              // true when the monthly cap was applied
}

/**
 * Capped rental pricing.
 *
 *   • Daily   (1–6 days)  → daily_price_cents × days
 *   • Weekly  (7+ days)   → full weeks × weekly_price_cents
 *                           + leftover days × daily_price_cents
 *                           (leftover is itself capped at one week's price)
 *   • Monthly             → the total can NEVER exceed monthly_price_cents.
 *
 * Example (weekly $320, monthly $850):
 *   1 week  → $320
 *   2 weeks → $640
 *   3 weeks → $960 → capped to $850
 *   30 days → capped to $850
 */
export function calcRentalPrice(
  vehicle: Pick<RentalVehicle, "daily_price_cents" | "weekly_price_cents" | "monthly_price_cents" | "monthly_discount_pct" | "biweekly_price_cents">,
  rentalDays: number,
): RentalPriceCalc {
  const daily = vehicle.daily_price_cents || 0;
  const weekly = vehicle.weekly_price_cents || 0;
  const monthly = vehicle.monthly_price_cents || 0;

  // ── 1. Raw price by tier ────────────────────────────────────────────────
  let subtotalCents: number;
  let tier: RentalPriceCalc["tier"];

  if (weekly > 0 && rentalDays >= 7) {
    const weeks = Math.floor(rentalDays / 7);
    const leftoverDays = rentalDays % 7;
    // A few leftover days should never cost more than a whole week
    const leftoverCost = Math.min(leftoverDays * daily, weekly);
    subtotalCents = weeks * weekly + leftoverCost;
    tier = "weekly";
  } else {
    subtotalCents = rentalDays * daily;
    tier = "daily";
  }

  // ── 2. Apply the monthly cap — total can never exceed the monthly price ──
  let totalCents = subtotalCents;
  let capped = false;
  if (monthly > 0 && totalCents > monthly) {
    totalCents = monthly;
    capped = true;
    tier = "monthly";
  } else if (monthly > 0 && rentalDays >= 28) {
    // Long rental that lands at/under the monthly price → treat as monthly tier
    tier = "monthly";
  }

  const discountCents = Math.max(0, subtotalCents - totalCents);
  const discountPct = subtotalCents > 0 ? Math.round((discountCents / subtotalCents) * 100) : 0;
  const effectiveDailyRate = rentalDays > 0 ? Math.round(totalCents / rentalDays) : daily;

  return {
    rentalDays,
    dailyPriceCents: daily,
    effectiveDailyRate,
    subtotalCents,
    discountCents,
    discountPct,
    totalCents,
    tier,
    capped,
  };
}

/**
 * Quick duration buttons.
 *   1 day / 3 days → daily rate
 *   1 week        → weekly pricing
 *   1 month       → monthly (capped) pricing
 */
export const QUICK_DURATIONS = [
  { label: "1 Day",   days: 1,  tier: "daily"   },
  { label: "3 Days",  days: 3,  tier: "daily"   },
  { label: "1 Week",  days: 7,  tier: "weekly"  },
  { label: "1 Month", days: 30, tier: "monthly" },
] as const;
