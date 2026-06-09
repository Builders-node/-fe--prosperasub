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
  subtotalCents: number;
  discountCents: number;
  discountPct: number;
  totalCents: number;
  tier: "daily" | "extended" | "monthly"; // which pricing tier applied
}

/**
 * Pricing tiers from Atlantis Transportation & Rentals price table:
 *   1–7 days  → daily rate × days
 *   8–29 days → weekly_price_cents is the 8-day package total; prorated for each day at that rate
 *   30 days   → monthly_price_cents flat
 */
export function calcRentalPrice(
  vehicle: Pick<RentalVehicle, "daily_price_cents" | "weekly_price_cents" | "monthly_price_cents" | "monthly_discount_pct" | "biweekly_price_cents">,
  rentalDays: number,
): RentalPriceCalc {
  const { daily_price_cents, weekly_price_cents, monthly_price_cents, monthly_discount_pct } = vehicle;

  let subtotalCents: number;
  let discountCents = 0;
  let discountPct = 0;
  let tier: RentalPriceCalc["tier"] = "daily";
  let effectiveDailyRate = daily_price_cents;

  if (rentalDays >= 30 && monthly_price_cents > 0) {
    // 30-day flat package
    subtotalCents = monthly_price_cents;
    effectiveDailyRate = Math.round(monthly_price_cents / 30);
    tier = "monthly";
  } else if (rentalDays >= 30 && monthly_discount_pct > 0) {
    // Fallback: daily × days with discount percentage
    const full = daily_price_cents * rentalDays;
    discountPct = monthly_discount_pct;
    discountCents = Math.round(full * (discountPct / 100));
    subtotalCents = full;
    effectiveDailyRate = Math.round((full - discountCents) / rentalDays);
    tier = "monthly";
  } else if (rentalDays >= 8 && weekly_price_cents > 0) {
    // Extended rate: weekly_price_cents is the 8-day package total.
    // For 8+ days, prorate at the 8-day per-day rate.
    const extendedDailyRate = Math.round(weekly_price_cents / 8);
    subtotalCents = extendedDailyRate * rentalDays;
    effectiveDailyRate = extendedDailyRate;
    // Show discount vs full daily rate
    const fullDailyTotal = daily_price_cents * rentalDays;
    discountCents = fullDailyTotal - subtotalCents;
    discountPct = Math.round((discountCents / fullDailyTotal) * 100);
    tier = "extended";
  } else {
    // Standard daily rate
    subtotalCents = daily_price_cents * rentalDays;
    effectiveDailyRate = daily_price_cents;
    tier = "daily";
  }

  const totalCents = subtotalCents - (tier === "monthly" && monthly_discount_pct > 0 ? discountCents : 0);

  return {
    rentalDays,
    dailyPriceCents: daily_price_cents,
    effectiveDailyRate,
    subtotalCents: tier === "extended" ? subtotalCents : subtotalCents,
    discountCents: tier === "extended" ? discountCents : (tier === "monthly" && monthly_discount_pct > 0 ? discountCents : 0),
    discountPct: tier === "extended" ? discountPct : (tier === "monthly" && monthly_discount_pct > 0 ? discountPct : 0),
    totalCents: tier === "extended" ? subtotalCents : totalCents,
    tier,
  };
}

/**
 * Quick duration buttons matching Atlantis pricing tiers:
 *   1 day  → standard daily rate
 *   3 days → standard daily rate × 3
 *   8 days → triggers extended (+8 días) rate
 *   30 days → monthly package rate
 */
export const QUICK_DURATIONS = [
  { label: "1 Day",   days: 1,  tier: "daily"    },
  { label: "3 Days",  days: 3,  tier: "daily"    },
  { label: "8 Days",  days: 8,  tier: "extended" },
  { label: "30 Days", days: 30, tier: "monthly"  },
] as const;
