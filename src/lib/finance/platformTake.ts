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


/** The platform's rate when a provider has none of its own. */
export const DEFAULT_COMMISSION_PCT = 10;
export const DEFAULT_COMMISSION_KEY = "finance_default_commission_pct";


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
  return splitTakeParts([{ cents: revenueCents, pct: null }], pct);
}

/** One order's recognised money and the rate stamped on it (NULL = the provider's). */
export interface RevenuePart {
  cents: number;
  pct: number | null;
}

/**
 * The same split, order by order.
 *
 * Every order now carries the commission it was sold under
 * (`commission_pct`, stamped by a DB trigger): 0 for a client the business
 * brought itself, the provider's rate otherwise. Rows from before that column
 * existed are NULL and take `defaultPct` — the provider's current rate, which
 * is what this whole calculation used to apply to everything.
 */
export function splitTakeParts(parts: RevenuePart[], defaultPct: number): TakeResult & { ownClientsCents: number } {
  const clamp = (p: number) => Math.min(Math.max(p, 0), 100);
  let revenue = 0;
  let platformCents = 0;
  let ownClientsCents = 0;
  for (const part of parts) {
    const cents = Math.max(0, Math.round(part.cents || 0));
    const rate = clamp(part.pct != null && Number.isFinite(Number(part.pct)) ? Number(part.pct) : defaultPct);
    revenue += cents;
    platformCents += Math.min(Math.round((cents * rate) / 100), cents);
    if (part.pct != null && Number(part.pct) === 0) ownClientsCents += cents;
  }
  const base = `Platform keeps ${clamp(defaultPct)}% of what customers paid`;
  return {
    platformCents,
    providerCents: revenue - platformCents,
    ownClientsCents,
    explanation: ownClientsCents > 0 ? `${base} · 0% on orders from clients you brought` : base,
  };
}
