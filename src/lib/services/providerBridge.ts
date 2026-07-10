/**
 * Provider identity bridge — the SINGLE source of truth for how the universal
 * `providers` table relates to the legacy per-service tables. Read this first
 * when anything about providers is confusing.
 *
 * ── TWO ID SPACES (this is the #1 source of bugs) ────────────────────────────
 *  • universal  `providers.id`            — used by /my-provider/:id, /admin/marketplace/*
 *  • legacy     `<service>_providers.id`  — used by the real service data
 *                                           (rental_vehicles, food_subscriptions,
 *                                            cleaning_subscriptions, …)
 *
 * They are DIFFERENT uuids for the same real business, bridged by two columns
 * on the universal row:
 *  • `providers.source_service_key`  → which legacy service ("cars"|"food"|"cleaning")
 *  • `providers.source_provider_id`  → the legacy `<service>_providers.id`
 *
 * Rule of thumb: anything that touches legacy service data must use the LEGACY
 * id (`legacyIdOf(provider)`), never the universal id. Anything that touches the
 * marketplace / universal portal uses the universal id.
 */
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";

export type LegacySourceKey = "cars" | "food" | "cleaning";

export interface LegacyServiceMeta {
  sourceKey: LegacySourceKey;
  /** Where the authoritative service data lives (public site reads this). */
  legacyTable: string;
  /** The universal `service_categories.key` this maps onto. */
  universalCategoryKey: string;
  /** Public listing route. */
  publicRoute: string;
  /** The (now-redirecting) legacy owner-portal route. */
  legacyPortalRoute: (legacyId: string) => string;
}

/** One declarative entry per legacy-backed service. Add a service here + its tab set in legacyPortalTabs.tsx. */
export const LEGACY_SERVICES: Record<LegacySourceKey, LegacyServiceMeta> = {
  cars: {
    sourceKey: "cars", legacyTable: "rental_providers", universalCategoryKey: "transport",
    publicRoute: "/services/rental", legacyPortalRoute: (id) => `/my-car-rental?providerId=${id}`,
  },
  food: {
    sourceKey: "food", legacyTable: "food_providers", universalCategoryKey: "food",
    publicRoute: "/services/food", legacyPortalRoute: (id) => `/my-restaurant?providerId=${id}`,
  },
  cleaning: {
    sourceKey: "cleaning", legacyTable: "cleaning_providers", universalCategoryKey: "home",
    publicRoute: "/services/cleaning", legacyPortalRoute: (id) => `/my-cleaning?providerId=${id}`,
  },
};

/** Source keys that have a rich legacy portal mounted inside /my-provider/:id.
 *  Beach isn't in LEGACY_SERVICES (no beach_providers table) but its owner
 *  workspace mounts admin pages via BEACH_TABS, so it belongs here too. */
export const LEGACY_PORTAL_SOURCE_KEYS = new Set<string>([
  ...Object.keys(LEGACY_SERVICES),
  "beach",
  "beach_club",
]);

/**
 * Public listing URL for a legacy-backed archetype. Short paths are canonical
 * (users land here from tiles, back buttons, deep links). Beach club has no
 * portal entry above but still uses a short public path.
 */
const PUBLIC_LISTING_HREF: Record<string, string> = {
  cars: "/services/rental",
  food: "/services/food",
  cleaning: "/services/cleaning",
  beach: "/services/beach-club",
  beach_club: "/services/beach-club",
};

/** Resolve the short canonical public URL for a legacy source key, if any. */
export function publicListingHref(sourceServiceKey?: string | null): string | null {
  if (!sourceServiceKey) return null;
  return PUBLIC_LISTING_HREF[sourceServiceKey] ?? null;
}

/**
 * Default universal capabilities to stamp on the mirror row when a legacy
 * provider is approved, so it shows up correctly in the unified marketplace.
 */
// Booking-related caps (hourly_bookings / date_range_booking) were retired —
// every provider now gets the shared UnifiedBookingCalendar regardless of
// capability. Only real business-type caps stay here.
export const DEFAULT_CAPABILITIES: Record<LegacySourceKey, string[]> = {
  cars: ["catalog_items"],
  food: ["subscription_plans", "catalog_items", "delivery"],
  cleaning: ["subscription_plans"],
};

export function isLegacySource(key: string | null | undefined): key is LegacySourceKey {
  return !!key && key in LEGACY_SERVICES;
}

/**
 * The legacy id for a universal provider row — the id under which the real
 * service data (vehicles, subscriptions, bookings…) is stored. Falls back to
 * the universal id for brand-new DB-only providers with no legacy mirror.
 */
export function legacyIdOf(p: { source_provider_id?: string | null; id: string }): string {
  return p.source_provider_id || p.id;
}

/**
 * Resolve the universal `providers.id` that mirrors a legacy provider id. Used
 * by the legacy routes to redirect into the unified `/my-provider/:id` portal.
 * Returns null when there is no universal mirror (older legacy-only providers).
 */
export function useUniversalIdForLegacy(sourceKey: string, legacyId: string | null) {
  return useQuery({
    queryKey: ["universal-id-for-legacy", sourceKey, legacyId],
    enabled: !!legacyId,
    queryFn: async () => {
      const { data, error } = await supabaseDb
        .from("providers").select("id")
        .eq("source_service_key", sourceKey)
        .eq("source_provider_id", legacyId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.id ?? null) as string | null;
    },
  });
}
