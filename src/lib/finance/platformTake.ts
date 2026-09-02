/**
 * What the platform keeps, and therefore what the provider is owed.
 *
 * One model, one number: the platform keeps `providers.commission_pct` of what
 * customers paid, and the business keeps the rest.
 *
 * It used to be three models chosen per SERVICE — cleaning bought in at a fixed
 * $750/month (so the platform's "profit" was whatever was left of the revenue,
 * and could be a loss), the beach club at $10 per person, food at 10%. That
 * shape could not say "this business is on 12% and that one on 8%", which is
 * how the platform actually sells, and every screen carried a `type` switch and
 * a `kind: cost | take` inversion to render it.
 *
 * The rate lives on the provider row. NULL there means the platform default in
 * `global_settings.finance_default_commission_pct`.
 */

export type FinanceSourceKey = "cleaning" | "beach" | "food" | "vehicles";

/** The platform's rate when a provider has none of its own. */
export const DEFAULT_COMMISSION_PCT = 10;
export const DEFAULT_COMMISSION_KEY = "finance_default_commission_pct";

/**
 * Which tables hold a provider's money.
 *
 * This is a data-source map, not a finance model — the commission is the same
 * everywhere; only the place revenue is recorded differs.
 */
export function financeSourceFor(sourceKey: string | null | undefined): FinanceSourceKey | null {
  const k = String(sourceKey ?? "").toLowerCase();
  if (k === "cleaning") return "cleaning";
  if (k === "food") return "food";
  if (k === "beach" || k === "beach_club" || k === "entertainment") return "beach";
  // Cars have no legacy `source_service_key` — they were never a legacy
  // service — so a rental business is matched on its archetype. The commission
  // model is the same one every business is on; only the table differs.
  if (k === "vehicles") return "vehicles";
  return null;
}

/** The rate to apply, given a provider row and the platform's settings map. */
export function commissionPct(
  providerPct: number | null | undefined,
  settings?: Record<string, unknown> | null,
): number {
  if (providerPct != null && Number.isFinite(Number(providerPct))) return Number(providerPct);
  const fallback = settings?.[DEFAULT_COMMISSION_KEY];
  if (fallback != null && Number.isFinite(Number(fallback))) return Number(fallback);
  return DEFAULT_COMMISSION_PCT;
}

export interface TakeResult {
  /** What the platform keeps, in cents. */
  platformCents: number;
  /** What the provider ends up with, in cents. */
  providerCents: number;
  /** One line a provider can check the arithmetic against. */
  explanation: string;
}

/**
 * Split a period's revenue between the platform and the provider.
 *
 * The cut is clamped to what actually came in: a rate above 100 cannot make a
 * provider owe the platform money out of a period they earned nothing in.
 */
export function splitTake(revenueCents: number, pct: number): TakeResult {
  const rate = Math.min(Math.max(pct, 0), 100);
  const platformCents = Math.min(Math.round((revenueCents * rate) / 100), Math.max(0, revenueCents));
  return {
    platformCents,
    providerCents: revenueCents - platformCents,
    explanation: `Platform keeps ${rate}% of what customers paid`,
  };
}
