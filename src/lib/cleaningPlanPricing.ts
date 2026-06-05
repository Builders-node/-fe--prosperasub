export type CleaningFrequencyUnit = "day" | "week" | "month" | "custom";
export type CleaningPricingMode =
  | "fixed_monthly_price"
  | "price_per_cleaning"
  | "calculated_estimate"
  | "custom_manual";

export type CleaningPlanPricingInput = {
  frequency_unit?: CleaningFrequencyUnit | string | null;
  frequency_count?: number | string | null;
  custom_frequency_label?: string | null;
  pricing_mode?: CleaningPricingMode | string | null;
  monthly_price_cents?: number | string | null;
  price_per_cleaning_cents?: number | string | null;
  cleanings_per_month?: number | string | null;
};

const validUnits: CleaningFrequencyUnit[] = ["day", "week", "month", "custom"];
const validModes: CleaningPricingMode[] = ["fixed_monthly_price", "price_per_cleaning", "calculated_estimate", "custom_manual"];

export const normalizeFrequencyUnit = (value: unknown): CleaningFrequencyUnit =>
  validUnits.includes(value as CleaningFrequencyUnit) ? value as CleaningFrequencyUnit : "month";

export const normalizePricingMode = (value: unknown): CleaningPricingMode =>
  validModes.includes(value as CleaningPricingMode) ? value as CleaningPricingMode : "price_per_cleaning";

export const monthlyCleaningEstimate = (plan: CleaningPlanPricingInput) => {
  const unit = normalizeFrequencyUnit(plan.frequency_unit);
  const count = Number(plan.frequency_count ?? plan.cleanings_per_month ?? 0);
  if (unit === "day") return Math.round(count * 30);
  if (unit === "week") return Math.round((count * 52) / 12);
  if (unit === "month") return Math.round(count);
  return Number(plan.cleanings_per_month ?? 0) || 0;
};

export const resolveMonthlyPriceCents = (plan: CleaningPlanPricingInput) => {
  const mode = normalizePricingMode(plan.pricing_mode);
  const monthly = Number(plan.monthly_price_cents ?? 0);
  const pricePer = Number(plan.price_per_cleaning_cents ?? 0);
  const estimated = pricePer * monthlyCleaningEstimate(plan);
  if (mode === "fixed_monthly_price" || mode === "custom_manual") return Math.max(0, monthly || estimated);
  if (mode === "calculated_estimate") return Math.max(0, monthly || estimated);
  return Math.max(0, estimated || monthly);
};

export const formatFrequencyLabel = (plan: CleaningPlanPricingInput) => {
  const unit = normalizeFrequencyUnit(plan.frequency_unit);
  if (unit === "custom") return plan.custom_frequency_label?.trim() || "Custom schedule";
  return `${Number(plan.frequency_count ?? plan.cleanings_per_month ?? 0)}x per ${unit}`;
};

export const formatPricingLabel = (plan: CleaningPlanPricingInput) => {
  const cents = (value: number) => `$${(value / 100).toFixed(2)}`;
  const mode = normalizePricingMode(plan.pricing_mode);
  const pricePer = Number(plan.price_per_cleaning_cents ?? 0);
  if (mode === "price_per_cleaning" && pricePer > 0) return `${cents(pricePer)} per cleaning`;
  const monthly = resolveMonthlyPriceCents(plan);
  if (monthly > 0) return `${cents(monthly)}/month`;
  if (mode === "custom_manual") return "Custom pricing";
  return "Price pending";
};

export function validateCleaningPlanPricing(plan: CleaningPlanPricingInput) {
  const unit = normalizeFrequencyUnit(plan.frequency_unit);
  const mode = normalizePricingMode(plan.pricing_mode);
  const count = Number(plan.frequency_count ?? 0);
  const monthly = Number(plan.monthly_price_cents ?? 0);
  const pricePer = Number(plan.price_per_cleaning_cents ?? 0);

  if (unit !== "custom" && count <= 0) return "Frequency count must be positive.";
  if (unit === "custom" && !plan.custom_frequency_label?.trim()) return "Custom frequency label is required.";
  if ((mode === "fixed_monthly_price" || mode === "custom_manual") && monthly <= 0) return "Monthly price is required for this pricing mode.";
  if (mode === "price_per_cleaning" && pricePer <= 0) return "Price per cleaning is required for this pricing mode.";
  if (mode === "calculated_estimate" && monthly <= 0 && pricePer <= 0) return "Monthly price or price per cleaning is required.";
  return null;
}
