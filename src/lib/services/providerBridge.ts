/**
 * Provider identity bridge — the SINGLE source of truth for how the universal
 * `providers` table relates to the legacy per-service tables. Read this first
 * when anything about providers is confusing.
 *
 * ── TWO ID SPACES (this is the #1 source of bugs) ────────────────────────────
 *  • universal  `providers.id`            — used by /my-provider/:id, /admin/marketplace/*
 *  • legacy     `<service>_providers.id`  — used by the real service data
 *                                           (food_subscriptions,
 *                                            cleaning_subscriptions, …)
 *
 * They are DIFFERENT uuids for the same real business, bridged by two columns
 * on the universal row:
 *  • `providers.source_service_key`  → which legacy service ("food"|"cleaning")
 *  • `providers.source_provider_id`  → the legacy `<service>_providers.id`
 *
 * Rule of thumb: anything that touches legacy service data must use the LEGACY
 * id (`legacyIdOf(provider)`), never the universal id. Anything that touches the
 * marketplace / universal portal uses the universal id.
 */
import { useQuery } from "@tanstack/react-query";
import { supabaseDb } from "@/integrations/supabase/client";
import { VEHICLES_BASE } from "@/features/vehicles";

export type LegacySourceKey = "food" | "cleaning";

export interface LegacyServiceMeta {
  sourceKey: LegacySourceKey;
  /** Where the authoritative service data lives (public site reads this). */
  legacyTable: string;
  /**
   * The universal `service_categories.key` this maps onto.
   *
   * Verify against the DB before relying on it. These three drifted to
   * "transport" / "food" / "home" — none of which is a row in
   * service_categories — and because providers.category_key is NOT NULL with an
   * FK, approving any provider application failed outright. The approval path
   * now checks the value exists and falls back to the archetype's first real
   * category.
   */
  universalCategoryKey: string;
  /** Public listing route. */
  publicRoute: string;
  /** The (now-redirecting) legacy owner-portal route. */
  legacyPortalRoute: (legacyId: string) => string;
}

/** One declarative entry per legacy-backed service. Add a service here + its tab set in legacyPortalTabs.tsx. */
export const LEGACY_SERVICES: Record<LegacySourceKey, LegacyServiceMeta> = {
  food: {
    sourceKey: "food", legacyTable: "food_providers", universalCategoryKey: "meal_subscription",
    publicRoute: "/services/food", legacyPortalRoute: (id) => `/my-restaurant?providerId=${id}`,
  },
  cleaning: {
    sourceKey: "cleaning", legacyTable: "cleaning_providers", universalCategoryKey: "apartment_cleaning",
    publicRoute: "/services/cleaning", legacyPortalRoute: (id) => `/my-cleaning?providerId=${id}`,
  },
};

/**
 * Source keys whose workspace needs a per-service membership check.
 *
 * Not "which tabs" any more — the strip is assembled once for everybody. This
 * is only about who is allowed in, and that is still per-service for food and
 * cleaning, whose managers are rows in their own legacy tables. The beach was
 * in this set too and fell straight through to the same universal render, so
 * it is out: its owner is the universal row's owner, which the caller already
 * knows.
 */
export const LEGACY_PORTAL_SOURCE_KEYS = new Set<string>(Object.keys(LEGACY_SERVICES));

/**
 * Public listing URL for a legacy-backed archetype. Short paths are canonical
 * (users land here from tiles, back buttons, deep links). Beach club has no
 * portal entry above but still uses a short public path.
 */
const PUBLIC_LISTING_HREF: Record<string, string> = {
  food: "/services/food",
  cleaning: "/services/cleaning",
  beach: "/services/beach-club",
  beach_club: "/services/beach-club",
};

/**
 * Archetypes whose storefront is a section of this app rather than a generic
 * providers-and-plans list, keyed by archetype because they have no legacy
 * `source_service_key` — and must not have one. A legacy key means "backed by
 * its own <service>_providers table", and approving an application for one
 * writes there; a rental business is an ordinary `providers` row. So cars are
 * universal in the data model and bespoke only in how you shop for them.
 */
const ARCHETYPE_LISTING_HREF: Record<string, string> = {
  vehicles: VEHICLES_BASE,
};

/**
 * The public URL for an archetype's listing.
 *
 * Legacy-backed services keep their bespoke short paths — those are live URLs
 * in ads, emails and the beach landing page, and are not worth breaking.
 * Everything else resolves to /services/<archetypeKey>, handled by the generic
 * ServicePage.
 *
 * This used to return null for anything not in the map above, and Discovery
 * dropped those tiles on purpose. The consequence was that a service created
 * in /admin/services could never be reached by a customer — the only way to
 * add one was to edit this file. Now it is a data change.
 */
export function publicListingHref(
  sourceServiceKey?: string | null,
  archetypeKey?: string | null,
): string | null {
  if (sourceServiceKey && PUBLIC_LISTING_HREF[sourceServiceKey]) {
    return PUBLIC_LISTING_HREF[sourceServiceKey];
  }
  if (archetypeKey && ARCHETYPE_LISTING_HREF[archetypeKey]) {
    return ARCHETYPE_LISTING_HREF[archetypeKey];
  }
  return archetypeKey ? `/services/${archetypeKey}` : null;
}

/**
 * What to stamp on a newly approved provider.
 *
 * Only capabilities something reads — see components/provider/capabilities.tsx.
 * This used to seed "subscription_plans" and "catalog_items" as well, which no
 * screen has ever branched on: the workspace gives every provider the same tabs.
 */
export const DEFAULT_CAPABILITIES: Record<LegacySourceKey, string[]> = {
  food: ["delivery"],
  cleaning: [],
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
