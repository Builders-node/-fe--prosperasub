import { describe, expect, it } from "vitest";
import { bonusEarnCents, bonusSpendCents, displayDiscount, prepayPctFor, type ActiveDiscount } from "./discounts";

const base: ActiveDiscount = {
  id: "d1", provider_id: "p1", kind: "sale", title: null, value_type: "percent", percent_off: 20,
  amount_off_cents: null, tiers: null, intro_periods: 1, target_ids: null, min_order_cents: 0,
  starts_at: "2020-01-01T00:00:00Z", ends_at: "2999-01-01T00:00:00Z", reference_prices: null,
};
const subject = { providerId: "p1", id: "plan1", priceCents: 10_000 };

describe("displayDiscount", () => {
  it("strikes the list price for a sale", () => {
    const d = displayDiscount([base], subject)!;
    expect(d.nowCents).toBe(8_000);
    expect(d.wasCents).toBe(10_000);
    expect(d.badge).toBe("−20%");
  });

  it("strikes the 30-day low, not a raised price", () => {
    // The price was $85 last week and was raised to $100 for the sale: −20% of $100 is $80, only 6% under $85.
    const d = displayDiscount([{ ...base, reference_prices: { plan1: 8_500 } }], subject)!;
    expect(d.wasCents).toBe(8_500);
    expect(d.badge).toBe("−6%");
  });

  it("ignores other businesses, other offers and finished sales", () => {
    expect(displayDiscount([{ ...base, provider_id: "p2" }], subject)).toBeNull();
    expect(displayDiscount([{ ...base, target_ids: ["other"] }], subject)).toBeNull();
    expect(displayDiscount([{ ...base, ends_at: "2020-02-01T00:00:00Z" }], subject)).toBeNull();
  });

  it("covers variants through their offer", () => {
    expect(displayDiscount([{ ...base, target_ids: ["parent"] }], { ...subject, parentId: "parent" })).not.toBeNull();
  });

  it("shows new-customer and pay-ahead discounts as badges only", () => {
    const intro = displayDiscount([{ ...base, kind: "intro", percent_off: 50 }], subject)!;
    expect(intro.wasCents).toBeNull();
    expect(intro.nowCents).toBe(10_000);
    const prepay = displayDiscount([{ ...base, kind: "prepay", tiers: [{ periods: 3, percent_off: 5 }, { periods: 6, percent_off: 10 }] }], subject)!;
    expect(prepay.badge).toBe("Save up to 10%");
  });
});

describe("prepayPctFor", () => {
  const prepay = { ...base, kind: "prepay" as const, tiers: [{ periods: 3, percent_off: 5 }, { periods: 6, percent_off: 10 }] };
  it("takes the deepest step the term reaches", () => {
    expect(prepayPctFor([prepay], subject, 1)).toBe(0);
    expect(prepayPctFor([prepay], subject, 4)).toBe(5);
    expect(prepayPctFor([prepay], subject, 12)).toBe(10);
  });
});

describe("bonus", () => {
  it("spends no more than the share cap of the full price", () => {
    // $100 order, 30% cap, $50 balance → $30
    expect(bonusSpendCents(5000, 10000, 10000, 30)).toBe(3000);
  });
  it("spends no more than what is left after the discount", () => {
    expect(bonusSpendCents(5000, 10000, 2000, 100)).toBe(2000);
  });
  it("spends no more than the balance, and rounds the cap down", () => {
    expect(bonusSpendCents(500, 10000, 10000, 30)).toBe(500);
    expect(bonusSpendCents(9999, 999, 999, 30)).toBe(299);
  });
  it("earns nothing while cashback is off, and rounds down", () => {
    expect(bonusEarnCents(10000, 0)).toBe(0);
    expect(bonusEarnCents(999, 3)).toBe(29);
  });
});
