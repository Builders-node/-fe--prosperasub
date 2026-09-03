import { formatUSD } from "@/lib/pricing";
import { periodNoun } from "@/lib/services/planPeriod";

/**
 * What a primary button is allowed to say.
 *
 * The same action was worded a different way on every screen it appeared on:
 * "Pay 143,248 sats", "Pay $90.00 · PayPal", "Pay $90.00 with LIVES",
 * "Checkout · $90.00", "Add to cart · $90.00 / week", "From $79.00 / month",
 * "Choose your size", "Subscribe to Meal Plan". Eight labels for three actions.
 * A customer learns the button, not the sentence, so every variant is a small
 * relearning — and none of the differences carried information the screen was
 * not already showing.
 *
 * There are three actions and this is all of them:
 *
 *   Subscribe                            — commit to a plan; payment comes next
 *   Add to cart                          — put a line in the basket
 *   Pay $75.00 / person / month          — hand over money, now
 *
 * The payment method is NOT in the label. It is chosen immediately above the
 * button, and repeating it there was the single largest source of variants. The
 * sats figure is not in the label either: it moves with the exchange rate, so
 * the button's text changed under the customer's finger while the amount they
 * owed did not.
 */

export const SUBSCRIBE = "Subscribe";
export const ADD_TO_CART = "Add to cart";

/** "" · "/ person" · "/ month" · "/ person / month" */
export function unitSuffix(opts?: { perPerson?: boolean; period?: string | null }): string {
  const parts: string[] = [];
  if (opts?.perPerson) parts.push("/ person");
  // The one period vocabulary — a private copy here is how the same period
  // could word itself two ways on one screen. one_time yields no noun, so a
  // one-off price carries no "/ month" it doesn't have.
  const noun = opts?.period ? periodNoun(opts.period) : "";
  if (noun) parts.push(`/ ${noun}`);
  return parts.join(" ");
}

/**
 * The same suffix, from a unit string a page already formatted.
 *
 * Pages built these by hand and disagreed: "/ month", "/ person · month",
 * "/ week". One separator, one order — a middle dot is not a second way to say
 * "per".
 */
export function normalizeUnit(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .split(/[·/]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `/ ${p}`)
    .join(" ");
}

/**
 * "Pay", "Pay $90.00", "Pay $75.00 / person / month".
 *
 * Pass a suffix only where the number IS a unit price — a plan page quoting $75
 * a head. A checkout shows what is actually being charged, so it takes none:
 * the people and the months are already multiplied into the total, and
 * "/ person / month" beside it would misstate the charge.
 */
export function payLabel(cents?: number | null, suffix = ""): string {
  if (typeof cents !== "number" || cents <= 0) return "Pay";
  return `Pay ${formatUSD(cents)}${suffix ? ` ${suffix}` : ""}`;
}

/** "From $79.00 / month" — a range, shown beside a button, never inside one. */
export function fromLabel(cents?: number | null, suffix = ""): string | null {
  if (typeof cents !== "number" || cents <= 0) return null;
  return `From ${formatUSD(cents)}${suffix ? ` ${suffix}` : ""}`;
}
