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
  dailyPriceCents: number;
  subtotalCents: number;
  discountPct: number;
  discountCents: number;
  totalCents: number;
}

export const QUICK_DURATIONS = [
  { label: "1 Day", days: 1 },
  { label: "1 Week", days: 7 },
  { label: "2 Weeks", days: 14 },
  { label: "1 Month", days: 30 },
] as const;

export function calcRentalPrice(
  dailyPriceCents: number,
  monthlyDiscountPct: number,
  rentalDays: number,
): RentalPriceCalc {
  const subtotalCents = dailyPriceCents * rentalDays;
  // Discount only applies for monthly rentals (>= 28 days)
  const discountPct = rentalDays >= 28 ? monthlyDiscountPct : 0;
  const discountCents = Math.round(subtotalCents * (discountPct / 100));
  const totalCents = subtotalCents - discountCents;
  return { rentalDays, dailyPriceCents, subtotalCents, discountPct, discountCents, totalCents };
}
