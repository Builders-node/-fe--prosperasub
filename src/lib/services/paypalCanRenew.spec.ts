import { describe, expect, it } from "vitest";
import { paypalCanRenew, termOptionsFor } from "./planPeriod";

// Mirrors backend/supabase/functions/api/routes/paypal-subscriptions.ts capInterval:
// one PayPal interval is at most 52 weeks, 12 months or 1 year.
describe("paypalCanRenew", () => {
  it("renews every term the checkout offers for weekly and monthly plans", () => {
    for (const n of termOptionsFor("weekly")) expect(paypalCanRenew("weekly", n)).toBe(true);
    for (const n of termOptionsFor("monthly")) expect(paypalCanRenew("monthly", n)).toBe(true);
    for (const n of termOptionsFor("quarterly")) expect(paypalCanRenew("quarterly", n)).toBe(true);
  });
  it("pays a two-year term once", () => {
    expect(paypalCanRenew("yearly", 1)).toBe(true);
    expect(paypalCanRenew("yearly", 2)).toBe(false);
  });
  it("never renews a one-time purchase, and stops past the caps", () => {
    expect(paypalCanRenew("one_time", 1)).toBe(false);
    expect(paypalCanRenew("weekly", 53)).toBe(false);
    expect(paypalCanRenew("monthly", 13)).toBe(false);
    expect(paypalCanRenew("quarterly", 5)).toBe(false);
  });
});
