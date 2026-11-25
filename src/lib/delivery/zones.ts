import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/pricing";
import type { GeoPoint } from "@/lib/geo/places";
import { tr } from "@/lib/tr";

/**
 * Delivery zones — where things are brought, at what price, how fast.
 *
 * A zone is a drawn area or a circle (migration 20261124120000). The PLATFORM
 * owns some (provider_id NULL): platform couriers deliver and the fee is the
 * platform's. A business owns others (migration 20261128120000): where it
 * delivers itself or comes to the customer, and that fee is the business's.
 *
 * This file answers the browser's questions — is this point covered, by which
 * zone, for how much. The database asks them again when the order lands
 * (stamp_order_delivery), so nothing here is trusted with money.
 */

export interface DeliveryZone {
  id: string;
  provider_id: string | null;
  name: string;
  shape: "polygon" | "circle";
  /** [[lng, lat], …], one ring, not closed. */
  polygon: [number, number][] | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  fee_cents: number;
  free_from_cents: number | null;
  min_order_cents: number | null;
  eta_min_minutes: number | null;
  eta_max_minutes: number | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export type DeliveryMode = "off" | "delivery" | "both";

/**
 * How a customer receives what they bought — chosen per offer
 * (provider_plans.service_modes), picked by the customer at checkout
 * (provider_subscriptions.service_mode).
 */
export type ServiceMode = "self_service" | "on_site" | "delivery";
export const SERVICE_MODES: Array<{ key: ServiceMode; label: string; customer: string; hint: string }> = [
  { key: "self_service", label: tr("Self-service"), customer: tr("I'll come"), hint: tr("The customer comes to you — a class, a gym, a pickup.") },
  { key: "on_site", label: tr("Visit"), customer: tr("Come to me"), hint: tr("You go to the customer — cleaning, repairs, a massage at home.") },
  { key: "delivery", label: tr("Delivery"), customer: tr("Deliver it"), hint: tr("It is brought to the customer — food, goods.") },
];
export const serviceModeLabel = (m: ServiceMode) => SERVICE_MODES.find((x) => x.key === m)?.label ?? m;

/** What an offer says about delivery (provider_plans columns). */
export interface OfferDelivery {
  mode: DeliveryMode;
  /** null = every active platform zone. */
  zoneIds: string[] | null;
  /** This offer's own fee, instead of the zone's. */
  feeCents: number | null;
  /**
   * The ways it can be received. Empty = nothing to choose (the old
   * behaviour). Read from service_modes, else from delivery_mode.
   */
  modes: ServiceMode[];
  /** Whether service_modes exists on the row — i.e. the migration is in, so the order may carry service_mode. */
  modesColumn: boolean;
  providerId: string | null;
  /**
   * The business brings it itself, always — no platform couriers. Food: a
   * restaurant has always delivered its own meals, so with no zones drawn a
   * delivery goes anywhere, free, like a visit.
   */
  ownDeliveryOnly?: boolean;
}

const MODE_KEYS = new Set<ServiceMode>(["self_service", "on_site", "delivery"]);

export const offerDeliveryOf = (row: {
  delivery_mode?: string | null; delivery_zone_ids?: string[] | null; delivery_fee_cents?: number | null;
  service_modes?: string[] | null; provider_id?: string | null; source_service_key?: string | null;
} | null | undefined): OfferDelivery => {
  const mode: DeliveryMode = row?.delivery_mode === "delivery" || row?.delivery_mode === "both" ? row.delivery_mode : "off";
  const explicit = Array.isArray(row?.service_modes)
    ? (row!.service_modes as string[]).filter((m): m is ServiceMode => MODE_KEYS.has(m as ServiceMode))
    : null;
  const modes: ServiceMode[] = explicit && explicit.length ? explicit
    : mode === "delivery" ? ["delivery"] : mode === "both" ? ["self_service", "delivery"] : [];
  return {
    mode: modes.includes("delivery") ? (modes.length > 1 ? "both" : "delivery") : mode,
    zoneIds: row?.delivery_zone_ids ?? null,
    feeCents: row?.delivery_fee_cents ?? null,
    modes,
    modesColumn: !!row && "service_modes" in row,
    providerId: row?.provider_id ?? null,
    ownDeliveryOnly: row?.source_service_key === "food",
  };
};

/** The order a mode is offered in at checkout: what the business listed, in the canonical order. */
export const orderedModes = (modes: ServiceMode[]) => SERVICE_MODES.map((m) => m.key).filter((k) => modes.includes(k));
/** Modes that need the customer's pin on the map. */
export const needsPin = (m: ServiceMode | null | undefined) => m === "on_site" || m === "delivery";

/** Zone colours, in order, for zones that have not chosen one. */
export const ZONE_COLORS = ["#F5A623", "#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
export const zoneColor = (z: Pick<DeliveryZone, "color">, i: number) => z.color ?? ZONE_COLORS[i % ZONE_COLORS.length];

const R = 6_371_000;
/** Metres between two points. */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Same rule as the database's delivery_zone_contains — keep them in step. */
export function zoneContains(z: DeliveryZone, p: GeoPoint): boolean {
  if (z.shape === "circle") {
    if (z.center_lat == null || z.center_lng == null || z.radius_m == null) return false;
    return distanceM({ lat: z.center_lat, lng: z.center_lng }, p) <= z.radius_m;
  }
  const ring = z.polygon ?? [];
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A circle as a polygon ring — for drawing it on the map. */
export function circleRing(center: GeoPoint, radiusM: number, steps = 64): [number, number][] {
  const out: [number, number][] = [];
  const latR = radiusM / 111_320;
  const lngR = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    out.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return out;
}

export const zoneRing = (z: DeliveryZone): [number, number][] =>
  z.shape === "circle" && z.center_lat != null && z.center_lng != null && z.radius_m != null
    ? circleRing({ lat: z.center_lat, lng: z.center_lng }, z.radius_m)
    : z.polygon ?? [];

/**
 * "30–60 min", "2–4 h", "1–2 days" — or null.
 * Both ends in ONE unit: the largest that divides both (30–60 stays minutes
 * rather than becoming "30 min – 1 h").
 */
export function etaText(minM: number | null | undefined, maxM: number | null | undefined): string | null {
  const lo = minM ?? maxM ?? null;
  const hi = maxM ?? minM ?? null;
  if (lo == null || hi == null) return null;
  const [size, unit] = lo % 1440 === 0 && hi % 1440 === 0 && hi >= 1440 ? [1440, "day"]
    : lo % 60 === 0 && hi % 60 === 0 && hi >= 60 ? [60, "h"]
    : [1, "min"];
  const a = lo / (size as number);
  const b = hi / (size as number);
  const word = unit === "day" ? (b === 1 ? "day" : "days") : unit;
  return a === b ? `${b} ${word}` : `${a}–${b} ${word}`;
}

/** What delivering THIS offer to THIS point costs, or why it can't be. */
export type DeliveryQuote =
  | { ok: true; zone: DeliveryZone | null; feeCents: number; eta: string | null; freeFromCents: number | null; mode: ServiceMode }
  | { ok: false; reason: "no_zone" | "below_minimum"; minOrderCents?: number; mode: ServiceMode };

/**
 * Which zones answer for a mode. A business that drew its own zones serves
 * inside them — for a visit and for its own delivery. One that drew none:
 * a delivery goes through the platform's couriers and zones; a visit goes
 * anywhere, with no call-out fee. The database applies the same rule
 * (stamp_order_delivery).
 */
export function quoteFor(
  mode: ServiceMode, offer: OfferDelivery, platformZones: DeliveryZone[], providerZones: DeliveryZone[],
  point: GeoPoint, orderCents: number,
): DeliveryQuote {
  if (mode === "self_service" || !offer.modes.includes(mode)) return { ok: false, reason: "no_zone", mode };
  const own = providerZones.filter((z) => z.is_active);
  let allowed: DeliveryZone[];
  if (own.length) allowed = own;
  else if (mode === "delivery" && !offer.ownDeliveryOnly) allowed = platformZones.filter((z) => z.is_active && !z.provider_id && (!offer.zoneIds || offer.zoneIds.includes(z.id)));
  else return { ok: true, zone: null, feeCents: 0, eta: null, freeFromCents: null, mode };

  // Smallest fee wins where zones overlap — the cheaper promise is the one we keep.
  const hits = allowed.filter((z) => zoneContains(z, point))
    .sort((a, b) => (offer.feeCents ?? a.fee_cents) - (offer.feeCents ?? b.fee_cents) || a.sort_order - b.sort_order);
  const zone = hits[0];
  if (!zone) return { ok: false, reason: "no_zone", mode };
  if (zone.min_order_cents != null && orderCents < zone.min_order_cents) {
    return { ok: false, reason: "below_minimum", minOrderCents: zone.min_order_cents, mode };
  }
  const free = zone.free_from_cents != null && orderCents >= zone.free_from_cents;
  return {
    ok: true, zone, mode,
    feeCents: free ? 0 : offer.feeCents ?? zone.fee_cents,
    eta: etaText(zone.eta_min_minutes, zone.eta_max_minutes),
    freeFromCents: zone.free_from_cents,
  };
}

/** The delivery quote alone (platform or the business's own delivery). */
export function quoteDelivery(
  offer: OfferDelivery, zones: DeliveryZone[], point: GeoPoint, orderCents: number, providerZones: DeliveryZone[] = [],
): DeliveryQuote {
  return quoteFor("delivery", offer, zones, providerZones, point, orderCents);
}

/** The quote as the one line a customer reads: "Delivery $5 · 30–60 min", "Visit · free". */
export function quoteLine(q: DeliveryQuote): string {
  const visit = q.mode === "on_site";
  if (!q.ok) {
    // An explicit narrowing: the app compiles without strictNullChecks, where
    // a boolean discriminant does not narrow the union by itself.
    const no = q as Extract<DeliveryQuote, { ok: false }>;
    if (no.reason === "below_minimum" && no.minOrderCents) {
      return (visit ? tr("Visits from {minOrderCents} orders", { minOrderCents: formatUSD(no.minOrderCents) }) : tr("Delivery from {minOrderCents} orders", { minOrderCents: formatUSD(no.minOrderCents) }));
    }
    return visit ? tr("They don't come to this address") : tr("Not delivered to this address");
  }
  const yes = q as Extract<DeliveryQuote, { ok: true }>;
  const fee = visit
    ? (yes.feeCents === 0 ? tr("They come to you · no call-out fee") : tr("Call-out fee {feeCents}", { feeCents: formatUSD(yes.feeCents) }))
    : (yes.feeCents === 0 ? tr("Free delivery") : `Delivery ${formatUSD(yes.feeCents)}`);
  return yes.eta ? `${fee} · ${yes.eta}` : fee;
}

/** Active platform zones — what a shopper can be delivered to. */
export function useDeliveryZones(enabled = true) {
  return useQuery({
    queryKey: ["delivery-zones"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DeliveryZone[]> => {
      const { data, error } = await supabaseDb.from("delivery_zones").select("*")
        .eq("is_active", true).is("provider_id", null).order("sort_order");
      // Before the migration the table is not there: nothing is delivered.
      if (error) return [];
      return (data ?? []) as DeliveryZone[];
    },
  });
}

/** A business's own active zones — where it delivers itself or comes to the customer. */
export function useProviderZones(providerId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["provider-zones", providerId],
    enabled: enabled && !!providerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DeliveryZone[]> => {
      const { data, error } = await supabaseDb.from("delivery_zones").select("*")
        .eq("is_active", true).eq("provider_id", providerId!).order("sort_order");
      if (error) return [];
      return (data ?? []) as DeliveryZone[];
    },
  });
}

/** The database's refusals, in words. */
export const DELIVERY_REFUSALS: Record<string, string> = {
  delivery_zone_unavailable: tr("That delivery zone is no longer served — choose the address again."),
  offer_not_delivered: tr("This offer can't be received that way any more — choose another option."),
  zone_not_offered: tr("This offer isn't delivered to that area."),
  address_outside_zone: tr("That address is outside the area they serve — move the pin."),
  below_minimum_order: tr("The order is below the minimum for delivery to that area."),
};
