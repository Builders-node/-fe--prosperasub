import { describe, expect, it } from "vitest";
import { circleRing, etaText, quoteDelivery, quoteLine, zoneContains, type DeliveryZone } from "./zones";

const square: DeliveryZone = {
  id: "a", provider_id: null, name: "Square", shape: "polygon",
  polygon: [[-86.5, 16.3], [-86.4, 16.3], [-86.4, 16.4], [-86.5, 16.4]],
  center_lat: null, center_lng: null, radius_m: null,
  fee_cents: 500, free_from_cents: 5000, min_order_cents: 1000,
  eta_min_minutes: 30, eta_max_minutes: 60, color: null, sort_order: 0, is_active: true,
};
const circle: DeliveryZone = {
  ...square, id: "b", shape: "circle", polygon: null, center_lat: 16.35, center_lng: -86.6, radius_m: 2000,
  fee_cents: 300, free_from_cents: null, min_order_cents: null, eta_min_minutes: 1440, eta_max_minutes: 2880,
};
const offer = { mode: "delivery" as const, zoneIds: null, feeCents: null };
const fee = (q: ReturnType<typeof quoteDelivery>) => (q.ok ? (q as Extract<typeof q, { ok: true }>).feeCents : null);

describe("zoneContains", () => {
  it("polygon: inside and outside", () => {
    expect(zoneContains(square, { lat: 16.35, lng: -86.45 })).toBe(true);
    expect(zoneContains(square, { lat: 16.45, lng: -86.45 })).toBe(false);
  });
  it("circle: by distance from the centre", () => {
    expect(zoneContains(circle, { lat: 16.36, lng: -86.6 })).toBe(true);   // ~1.1 km
    expect(zoneContains(circle, { lat: 16.38, lng: -86.6 })).toBe(false);  // ~3.3 km
  });
  it("the drawn circle sits on its own edge", () => {
    const wider = { ...circle, radius_m: 2001 };
    expect(circleRing({ lat: 16.35, lng: -86.6 }, 2000).every(([lng, lat]) => zoneContains(wider, { lat, lng }))).toBe(true);
  });
});

describe("etaText", () => {
  it.each([
    [30, 60, "30–60 min"], [60, 120, "1–2 h"], [1440, 2880, "1–2 days"], [45, 120, "45–120 min"], [1440, 1440, "1 day"],
  ])("%i–%i → %s", (a, b, out) => expect(etaText(a, b)).toBe(out));
  it("nothing set → null", () => expect(etaText(null, null)).toBeNull());
});

describe("quoteDelivery", () => {
  const inSquare = { lat: 16.35, lng: -86.45 };
  it("prices from the zone", () => expect(fee(quoteDelivery(offer, [square, circle], inSquare, 2000))).toBe(500));
  it("free from the threshold", () => expect(fee(quoteDelivery(offer, [square, circle], inSquare, 6000))).toBe(0));
  it("refuses below the minimum", () => {
    const q = quoteDelivery(offer, [square, circle], inSquare, 500);
    expect(q.ok).toBe(false);
    expect(quoteLine(q)).toBe("Delivery from $10.00 orders");
  });
  it("refuses outside every zone", () => expect(quoteDelivery(offer, [square], { lat: 16, lng: -86 }, 2000).ok).toBe(false));
  it("only the offer's zones", () => expect(quoteDelivery({ ...offer, zoneIds: ["b"] }, [square, circle], inSquare, 2000).ok).toBe(false));
  it("the offer's own fee wins", () => expect(fee(quoteDelivery({ ...offer, feeCents: 900 }, [circle], { lat: 16.35, lng: -86.6 }, 2000))).toBe(900));
  it("an offer that is not delivered", () => expect(quoteDelivery({ ...offer, mode: "off" }, [square], inSquare, 2000).ok).toBe(false));
});
