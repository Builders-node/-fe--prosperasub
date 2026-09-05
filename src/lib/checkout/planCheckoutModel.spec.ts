import { describe, expect, it } from "vitest";
import { totalFor, type CheckoutPlan } from "./planCheckoutModel";

/**
 * What the customer is charged.
 *
 * `totalFor` is the only place the checkout multiplies anything, and the two
 * rules it encodes are easy to get backwards: periods always multiply, people
 * multiply ONLY where the plan is priced per person. Charging a family of four
 * four times for a flat monthly plan is the failure this guards.
 */
const plan = (over: Partial<CheckoutPlan> = {}): CheckoutPlan => ({
  service: "universal", universalId: "u1", subjectPlanId: "p1",
  providerUniversalId: "pr1", providerLegacyId: null,
  name: "Plan", providerName: null, description: null,
  unitCents: 7900, period: "monthly",
  periodsMin: 1, periodsMax: 12, periodsDefault: 1,
  pricingMode: "flat", fulfilment: "none", oneTime: false,
  selection: null, needsAddress: false, needsArea: false,
  unitLabel: null, unitQuantity: null, image: null,
  ...over,
});

describe("totalFor", () => {
  it("multiplies by periods", () => {
    expect(totalFor(plan(), 1, 1)).toBe(7900);
    expect(totalFor(plan(), 3, 1)).toBe(23700);
  });

  it("ignores headcount unless the plan is priced per person", () => {
    expect(totalFor(plan({ pricingMode: "flat" }), 1, 4)).toBe(7900);
    expect(totalFor(plan({ pricingMode: "per_unit" }), 1, 4)).toBe(7900);
    expect(totalFor(plan({ pricingMode: "per_person" }), 1, 4)).toBe(31600);
  });

  it("multiplies both when a per-person plan is bought for several periods", () => {
    expect(totalFor(plan({ pricingMode: "per_person", unitCents: 7500 }), 3, 2)).toBe(45000);
  });

  it("never charges less than one period or one person", () => {
    expect(totalFor(plan(), 0, 1)).toBe(7900);
    expect(totalFor(plan(), -2, 1)).toBe(7900);
    expect(totalFor(plan({ pricingMode: "per_person" }), 1, 0)).toBe(7900);
  });

  it("returns whole cents — a total is never fractional", () => {
    const t = totalFor(plan({ unitCents: 3333, pricingMode: "per_person" }), 3, 3);
    expect(Number.isInteger(t)).toBe(true);
    expect(t).toBe(29997);
  });
});
