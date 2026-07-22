export interface FoodMealPlan {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  weekly_price_cents: number;
  meals_per_week: number;
  days_per_week: number;
  meals_per_day: number;
  highlights: string[] | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FoodProvider {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  image_url: string | null;
  working_hours: string | null;
  delivery_info: string | null;
  location: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  admin_user_id: string | null;
  weekly_price_cents: number;
  meals_per_week: number;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FoodProviderImage {
  id: string;
  provider_id: string;
  url: string;
  sort_order: number;
  created_at: string;
}

export interface FoodWeeklyMenu {
  id: string;
  provider_id: string;
  meal_plan_id: string | null;
  week_start_date: string;
  is_published: boolean;
  /** Per-meal delivery times keyed by meal type → "HH:MM" (e.g. { lunch: "12:00" }). */
  delivery_times?: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other" | "meal";

export interface FoodMenuMeal {
  id: string;
  menu_id: string;
  day_of_week: DayOfWeek;
  meal_type: MealType;
  meal_name: string;
  meal_description: string | null;
  image_url: string | null;
  calories: number | null;
  sort_order: number;
  created_at: string;
}

export interface FoodOrderItem {
  id: string;
  order_id: string;
  meal_id: string | null;
  day_of_week: DayOfWeek;
  meal_type: MealType;
  meal_name: string;
  quantity: number;
  unit_price_cents: number;
  created_at: string;
}

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  other: "Other",
  meal: "Meal",
};

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "other"];

export interface FoodOrder {
  id: string;
  user_id: string;
  provider_id: string;
  meal_plan_id: string | null;
  menu_id: string | null;
  week_start_date: string;
  total_cents: number;
  status: FoodOrderStatus;
  delivery_status: FoodDeliveryStatus;
  customer_name: string | null;
  customer_whatsapp: string | null;
  delivery_address: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoodSubscription {
  id: string;
  user_id: string;
  provider_id: string;
  meal_plan_id: string | null;
  status: FoodSubscriptionStatus;
  delivery_schedule: Record<string, string> | null;
  weekly_price_cents: number;
  commitment_weeks: number | null;
  started_at: string;
  end_date: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  customer_name: string | null;
  customer_whatsapp: string | null;
  residence: string | null;
  delivery_address: string | null;
  notes: string | null;
  admin_notes: string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  periods_paid: number | null;
  created_at: string;
  updated_at: string;
}

export interface FoodReview {
  id: string;
  provider_id: string;
  user_id: string;
  customer_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type FoodOrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";
export type FoodDeliveryStatus = "pending" | "out_for_delivery" | "delivered";
export type FoodSubscriptionStatus = "pending" | "active" | "paused" | "cancelled" | "expired";

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
