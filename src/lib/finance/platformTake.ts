/**
 * What the platform keeps, and therefore what the provider is owed.
 *
 * The admin's Net Profit page has always known this model; the providers it
 * describes never saw it. Now that a provider-facing earnings view exists, the
 * two must agree — so the source list, the defaults and the arithmetic live
 * here and both screens read them. Two copies of a commission rate is how a
 * provider and an admin end up quoting different numbers at each other.
 *
 * Each source has a VALUE and a TYPE in `global_settings`; the value holds
 * cents when the type is fixed/person and a whole percent when it is percent.
 * Same key, meaning set by the type — that is the existing storage convention,
 * not a new one.
 */

export type TakeType = "percent" | "fixed" | "person";
export type FinanceSourceKey = "cleaning" | "beach" | "cars" | "food";

export interface FinanceSource {
  key: FinanceSourceKey;
  label: string;
  /** Singular noun for the per-unit type — "per person", "per booking". */
  unit: string;
  /**
   * cost  — the platform PAYS this provider (cleaning is bought in, not commissioned)
   * take  — the platform KEEPS a share of what the customer paid
   */
  kind: "cost" | "take";
  valueKey: string;
  typeKey: string;
}

export const FINANCE_SOURCES: FinanceSource[] = [
  { key: "cleaning", label: "Cleaning",    unit: "subscription", kind: "cost", valueKey: "finance_cleaning_cost_cents", typeKey: "finance_cleaning_type" },
  { key: "beach",    label: "Beach Club",  unit: "person",       kind: "take", valueKey: "finance_beach_extra_cents",   typeKey: "finance_beach_type" },
  { key: "cars",     label: "Car Rentals", unit: "booking",      kind: "take", valueKey: "finance_car_commission_pct",  typeKey: "finance_car_type" },
  { key: "food",     label: "Food Orders", unit: "order",        kind: "take", valueKey: "finance_food_commission_pct", typeKey: "finance_food_type" },
];

export const DEFAULT_TAKE_TYPE: Record<FinanceSourceKey, TakeType> = {
  cleaning: "fixed", beach: "person", cars: "percent", food: "percent",
};

export const DEFAULT_TAKE_RAW: Record<FinanceSourceKey, number> = {
  cleaning: 75000, beach: 1000, cars: 10, food: 10,
};

export interface TakeConfig { type: TakeType; raw: number }

export const fallbackTakeConfig = (): Record<FinanceSourceKey, TakeConfig> =>
  Object.fromEntries(
    FINANCE_SOURCES.map((s) => [s.key, { type: DEFAULT_TAKE_TYPE[s.key], raw: DEFAULT_TAKE_RAW[s.key] }]),
  ) as Record<FinanceSourceKey, TakeConfig>;

/** Read a settings map (any source) into the config shape, defaults filling gaps. */
export function readTakeConfig(settings: Record<string, unknown> | null | undefined): Record<FinanceSourceKey, TakeConfig> {
  const out = fallbackTakeConfig();
  if (!settings) return out;
  for (const s of FINANCE_SOURCES) {
    const type = settings[s.typeKey];
    const raw = settings[s.valueKey];
    if (type != null && String(type)) out[s.key].type = String(type) as TakeType;
    if (raw != null && Number.isFinite(Number(raw))) out[s.key].raw = Number(raw);
  }
  return out;
}

/** Map a legacy source_service_key onto a finance source. Cars are `rental` in some places. */
export function financeSourceFor(sourceKey: string | null | undefined): FinanceSourceKey | null {
  const k = String(sourceKey ?? "").toLowerCase();
  if (k === "cleaning") return "cleaning";
  if (k === "food") return "food";
  if (k === "cars" || k === "rental") return "cars";
  if (k === "beach" || k === "beach_club" || k === "entertainment") return "beach";
  return null;
}

export interface TakeInput {
  /** Revenue recognized in the period, in cents. */
  revenueCents: number;
  /** How many billable units — people for beach, subscriptions/bookings otherwise. */
  units: number;
  /** Fractional months the period covers; only "fixed" uses it. */
  months: number;
}

export interface TakeResult {
  /** What the platform keeps (take) or pays out (cost), in cents. */
  platformCents: number;
  /** What the provider ends up with, in cents. */
  providerCents: number;
  /** One line a provider can check the arithmetic against. */
  explanation: string;
}

const pct = (cents: number, percent: number) => Math.round((cents * percent) / 100);
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Split a period's revenue between the platform and the provider.
 *
 * `cost` sources invert: for cleaning the platform buys the service at a fixed
 * price, so the provider's earnings are that price and the platform keeps
 * whatever is left — which can be negative, and is shown negative rather than
 * floored, exactly as the admin page does it.
 */
export function splitTake(source: FinanceSource, cfg: TakeConfig, input: TakeInput): TakeResult {
  const { revenueCents, units, months } = input;

  const amount =
    cfg.type === "percent" ? pct(revenueCents, cfg.raw)
    : cfg.type === "fixed" ? Math.round(cfg.raw * Math.max(0, months))
    : Math.round(cfg.raw * Math.max(0, units));

  if (source.kind === "cost") {
    return {
      platformCents: revenueCents - amount,
      providerCents: amount,
      explanation:
        cfg.type === "percent" ? `${cfg.raw}% of what customers paid`
        : cfg.type === "fixed" ? `${usd(cfg.raw)} per month, agreed rate`
        : `${usd(cfg.raw)} per ${source.unit}`,
    };
  }

  // A commission cannot exceed what came in — the same clamp the admin page uses.
  const platformCents = Math.min(amount, revenueCents);
  return {
    platformCents,
    providerCents: revenueCents - platformCents,
    explanation:
      cfg.type === "percent" ? `Platform keeps ${cfg.raw}% of what customers paid`
      : cfg.type === "fixed" ? `Platform keeps ${usd(cfg.raw)} per month`
      : `Platform keeps ${usd(cfg.raw)} per ${source.unit}`,
  };
}
