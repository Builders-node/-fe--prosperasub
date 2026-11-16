import { describe, expect, it } from "vitest";
import { circleRing, etaText, offerDeliveryOf, quoteDelivery, quoteFor, quoteLine, zoneContains, type DeliveryZone, type OfferDelivery } from "./zones";

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
const offer: OfferDelivery = { mode: "delivery", zoneIds: null, feeCents: null, modes: ["delivery"], modesColumn: true, providerId: "p1" };
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
  it("an offer that is not delivered", () => expect(quoteDelivery({ ...offer, mode: "off", modes: [] }, [square], inSquare, 2000).ok).toBe(false));
});

describe("service modes", () => {
  const inSquare = { lat: 16.35, lng: -86.45 };
  const own: DeliveryZone = { ...circle, id: "own", provider_id: "p1", fee_cents: 700, center_lat: 16.35, center_lng: -86.45 };
  const all: OfferDelivery = { ...offer, mode: "both", modes: ["self_service", "on_site", "delivery"] };

  it("reads the old delivery_mode when service_modes is not set", () => {
    expect(offerDeliveryOf({ delivery_mode: "both" }).modes).toEqual(["self_service", "delivery"]);
    expect(offerDeliveryOf({ delivery_mode: "off" }).modes).toEqual([]);
    expect(offerDeliveryOf({ delivery_mode: "off", service_modes: ["on_site"] }).modes).toEqual(["on_site"]);
  });
  it("a business's own zones win over the platform's", () => {
    const q = quoteFor("delivery", all, [square], [own], inSquare, 2000);
    expect(fee(q)).toBe(700);
  });
  it("a visit with no zones drawn goes anywhere, free", () => {
    const q = quoteFor("on_site", all, [square], [], { lat: 16, lng: -86 }, 2000);
    expect(q.ok).toBe(true);
    expect(quoteLine(q)).toBe("They come to you · no call-out fee");
  });
  it("a visit never uses platform zones", () => {
    expect(quoteFor("on_site", all, [square], [own], { lat: 16, lng: -86 }, 2000).ok).toBe(false);
  });
  it("a visit priced by the business's zone", () => {
    expect(quoteLine(quoteFor("on_site", all, [square], [own], inSquare, 2000))).toBe("Call-out fee $7.00 · 1–2 days");
  });
  it("a mode the offer doesn't allow", () => {
    expect(quoteFor("on_site", offer, [square], [], inSquare, 2000).ok).toBe(false);
  });
  it("a restaurant with no zones delivers anywhere, free — never platform couriers", () => {
    const food = offerDeliveryOf({ service_modes: ["delivery"], source_service_key: "food" });
    expect(food.ownDeliveryOnly).toBe(true);
    const q = quoteFor("delivery", food, [square], [], { lat: 16, lng: -86 }, 2000);
    expect(q.ok).toBe(true);
    expect(quoteLine(q)).toBe("Free delivery");
    expect(fee(quoteFor("delivery", food, [square], [own], inSquare, 2000))).toBe(700);
  });
});
