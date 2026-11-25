import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { tr, DATE_LOCALE } from "@/lib/tr";

/**
 * A business's own automatic discounts, as the storefront sees them.
 *
 * Read from `active_discounts()` (backend migration provider_discounts) — the
 * same rows `discount_quote` prices at checkout, without the counters. Nothing
 * here decides money: the card shows what is on, the checkout asks the
 * database what this order gets, and the order trigger asks again.
 */

export type DiscountKind = "sale" | "intro" | "prepay";

export interface ActiveDiscount {
  id: string;
  provider_id: string;
  kind: DiscountKind;
  title: string | null;
  value_type: "percent" | "fixed";
  percent_off: number | null;
  amount_off_cents: number | null;
  tiers: Array<{ periods: number; percent_off: number }> | null;
  intro_periods: number;
  target_ids: string[] | null;
  min_order_cents: number;
  starts_at: string;
  ends_at: string | null;
  /** Sales only: plan id → the lowest price of the last 30 days, for plans whose price moved. */
  reference_prices: Record<string, number> | null;
}

export function useActiveDiscounts() {
  return useQuery({
    queryKey: ["active-discounts"],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabaseDb.rpc("active_discounts");
      // Before the migration lands the function is missing: no discounts, no error.
      if (error) return [] as ActiveDiscount[];
      return (data ?? []) as ActiveDiscount[];
    },
  });
}

/** What an offer is, for matching: its own id, its offer's id, its business. */
export interface DiscountSubject {
  providerId: string | null | undefined;
  /** provider_plans id or rental vehicle id. */
  id: string | null | undefined;
  /** The offer a variant belongs to. */
  parentId?: string | null;
  priceCents: number | null | undefined;
}

const isOn = (d: ActiveDiscount, now: number) =>
  Date.parse(d.starts_at) <= now && (!d.ends_at || Date.parse(d.ends_at) > now);

export function appliesTo(d: ActiveDiscount, s: DiscountSubject): boolean {
  if (!s.providerId || d.provider_id !== s.providerId) return false;
  if (!d.target_ids || d.target_ids.length === 0) return true;
  return (!!s.id && d.target_ids.includes(s.id)) || (!!s.parentId && d.target_ids.includes(s.parentId));
}

/** "−20%", "$10 off". */
export function valueLabel(d: Pick<ActiveDiscount, "value_type" | "percent_off" | "amount_off_cents">): string {
  return d.value_type === "percent" ? `−${d.percent_off}%` : tr("${round} off", { round: Math.round((d.amount_off_cents ?? 0) / 100) });
}

/** The deepest step of a prepay discount, in %. */
export const prepayMax = (d: Pick<ActiveDiscount, "tiers">) => Math.max(0, ...(d.tiers ?? []).map((t) => t.percent_off));

/** "Ends today", "2 days left", "Until Dec 1" — urgency only when it is real. */
export function endsLabel(endsAt: string | null, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return null;
  const hours = ms / 3_600_000;
  if (hours < 24) return tr("Ends today");
  if (hours < 72) return tr("{ceil} days left", { ceil: Math.ceil(hours / 24) });
  return tr("Until {toLocaleDateString}", { toLocaleDateString: new Date(endsAt).toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric", timeZone: "America/Tegucigalpa" }) });
}

export interface DisplayDiscount {
  /** The price struck through, when there is an honest one to strike. */
  wasCents: number | null;
  /** What one period costs now (= the list price unless a sale is on). */
  nowCents: number;
  /** The short badge: "−20%", "New: −50% first month", "Save up to 15%". */
  badge: string;
  /** A second line where it fits: "2 days left", "Until Dec 1". */
  note: string | null;
  kind: DiscountKind;
  discount: ActiveDiscount;
}

/**
 * What a card shows for one offer. A sale changes the price (struck through
 * against the lowest price of the last 30 days, so a raise before a sale
 * cannot make the badge bigger); a new-customer or prepay discount is a badge
 * only, because not everyone gets it.
 */
export function displayDiscount(list: ActiveDiscount[] | undefined, s: DiscountSubject, now = Date.now()): DisplayDiscount | null {
  const price = Number(s.priceCents) || 0;
  if (!list?.length || price <= 0) return null;
  const mine = list.filter((d) => isOn(d, now) && appliesTo(d, s));
  if (!mine.length) return null;

  let best: DisplayDiscount | null = null;
  for (const d of mine.filter((x) => x.kind === "sale")) {
    const off = d.value_type === "percent" ? Math.floor((price * (d.percent_off ?? 0)) / 100) : (d.amount_off_cents ?? 0);
    const nowCents = Math.max(1, price - off);
    const ref = Math.min(price, (s.id && d.reference_prices?.[s.id]) || price);
    const pct = Math.round(((ref - nowCents) / ref) * 100);
    const cand: DisplayDiscount = {
      wasCents: pct >= 1 ? ref : null, nowCents,
      badge: pct >= 1 ? `−${pct}%` : tr("Sale"), note: endsLabel(d.ends_at, now), kind: "sale", discount: d,
    };
    if (!best || cand.nowCents < best.nowCents) best = cand;
  }
  if (best) return best;

  const intro = mine.find((d) => d.kind === "intro");
  if (intro) {
    const first = intro.intro_periods > 1 ? `first ${intro.intro_periods}` : "first";
    return {
      wasCents: null, nowCents: price, kind: "intro", discount: intro,
      badge: tr("New customers {valueLabel}", { valueLabel: valueLabel(intro) }), note: `${first} ${intro.intro_periods > 1 ? "periods" : "period"}${intro.ends_at ? ` · ${endsLabel(intro.ends_at, now)?.toLowerCase()}` : ""}`,
    };
  }
  const prepay = mine.find((d) => d.kind === "prepay");
  if (prepay) {
    return {
      wasCents: null, nowCents: price, kind: "prepay", discount: prepay,
      badge: tr("Save up to {prepayMax}%", { prepayMax: prepayMax(prepay) }), note: tr("when you pay ahead"),
    };
  }
  return null;
}

/** One hook for a card: the live discounts, matched to this offer. */
export function useDisplayDiscount(s: DiscountSubject): DisplayDiscount | null {
  const { data } = useActiveDiscounts();
  return displayDiscount(data, s);
}

/** The prepay % for buying `periods` at once (0 when none applies). */
export function prepayPctFor(list: ActiveDiscount[] | undefined, s: DiscountSubject, periods: number, now = Date.now()): number {
  let pct = 0;
  for (const d of list ?? []) {
    if (d.kind !== "prepay" || !isOn(d, now) || !appliesTo(d, s)) continue;
    for (const t of d.tiers ?? []) if (t.periods <= periods) pct = Math.max(pct, t.percent_off);
  }
  return pct;
}

/** Every business with something on right now — for the "Deals" filter and shelf. */
export function discountedProviderIds(list: ActiveDiscount[] | undefined, now = Date.now()): Set<string> {
  return new Set((list ?? []).filter((d) => isOn(d, now)).map((d) => d.provider_id));
}

/** The answer of `discount_quote_for_plan` (checkout). */
export interface DiscountQuote {
  ok: boolean;
  reason?: string;
  discount_id?: string;
  discount_cents?: number;
  kind?: DiscountKind;
  title?: string | null;
  percent_off?: number | null;
  intro_periods?: number;
  ends_at?: string | null;
}

/** "Sale", "New customer discount", "Prepay discount" — the checkout's line label. */
export function quoteLabel(q: DiscountQuote): string {
  const base = q.kind === "intro" ? tr("New customer discount") : q.kind === "prepay" ? tr("Pay-ahead discount") : "Sale";
  return q.title ? `${base} · ${q.title}` : base;
}

/**
 * How much of the bonus balance one order can take.
 *
 * Mirrors `bonus_spend_on_order`: at most `maxSharePct` of the order's full
 * price (integer cents, rounded down as Postgres does), never more than what
 * is left after the discount, never more than the balance. Asking the
 * database for more than this gets the whole checkout refused.
 */
export function bonusSpendCents(balanceCents: number, fullCents: number, afterDiscountCents: number, maxSharePct: number): number {
  const shareCap = Math.floor((Math.max(0, fullCents) * Math.max(0, Math.min(100, maxSharePct))) / 100);
  return Math.max(0, Math.min(balanceCents, afterDiscountCents, shareCap));
}

/** Cashback a paid order will earn — mirrors `bonus_earn_on_paid`. */
export function bonusEarnCents(paidGoodsCents: number, cashbackPct: number): number {
  if (cashbackPct <= 0) return 0;
  return Math.floor((Math.max(0, paidGoodsCents) * cashbackPct) / 100);
}
