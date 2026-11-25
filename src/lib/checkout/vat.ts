import { tr } from "@/lib/tr";
/**
 * VAT — set once per business (`providers.vat_pct`), added on top at checkout.
 *
 * The base is the goods after a promo: a promo lowers what is sold, so it
 * lowers the tax on it. A bonus balance is a way of PAYING, not a discount, so
 * it does not. Delivery fees and the payment surcharge are not taxed here.
 *
 * The order row stamps the same rate itself (trigger stamp_order_vat) and the
 * three earnings readers recompute the same figure from it, at 0% commission —
 * VAT is the business's, owed to the tax office. Keep this rule in step with
 * `vatOf` in services/revenue.ts and Edge lib/earnings.ts.
 */
export function vatCentsFor(goodsAfterPromoCents: number, vatPct: number | null | undefined): number {
  const pct = Number(vatPct) || 0;
  if (pct <= 0 || !(goodsAfterPromoCents > 0)) return 0;
  return Math.round((goodsAfterPromoCents * pct) / 100);
}

/** "15%", "7.5%" — for the line under the price. */
export const vatLabel = (vatPct: number) => tr("VAT {Number}%", { Number: Number(vatPct.toFixed(2)) });
