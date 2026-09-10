import { describe, it, expect } from "vitest";
import { buildSalePatch, SALE_SOURCES, type SaleRow } from "./marketplaceSales";

const row = (over: Partial<SaleRow>): SaleRow => ({
  id: "1", kind: "subscription", provider_id: "p", plan_id: null, plan_name: null,
  user_id: null, customer_name: null, start_date: null, end_date: null,
  status: "active", payment_status: "paid", payment_method: null, price_cents: 1000,
  payment_reference: null, source_service_key: "cleaning", created_at: "2026-09-01",
  ...over,
});

describe("buildSalePatch", () => {
  it("writes cleaning's status to subscription_status, not status", () => {
    // A plain `status` was accepted by PostgREST and changed nothing — the one
    // bug this mapping exists to prevent.
    const patch = buildSalePatch(row({ source_service_key: "cleaning" }), { status: "cancelled" });
    expect(patch).toMatchObject({ subscription_status: "cancelled", is_active: false });
    expect(patch).not.toHaveProperty("status");
  });

  it("keeps cleaning's is_active in step with its status", () => {
    expect(buildSalePatch(row({}), { status: "active" })).toMatchObject({ is_active: true });
  });

  it("maps a food price onto the weekly rate", () => {
    expect(buildSalePatch(row({ source_service_key: "food" }), { price_cents: 5000 }))
      .toMatchObject({ weekly_price_cents: 5000 });
  });

  it("refuses a booked hour instead of aiming a patch at a table that ignores it", () => {
    // The engine's table answers a browser write with 200 and zero rows, so a
    // patch built for it would have looked like a save and done nothing.
    expect(() => buildSalePatch(row({ source_service_key: "court" }), { status: "cancelled" }))
      .toThrow(/booking API/);
  });

  it("marks only the court source as API-managed", () => {
    const managed = Object.values(SALE_SOURCES).filter((src) => src.apiManaged).map((s) => s.service);
    expect(managed).toEqual(["court"]);
  });
});
